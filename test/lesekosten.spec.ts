import { env, SELF } from "cloudflare:test";
import { PLAN_AUSWAHL } from "../src/db/plan";
import { describe, it, expect, beforeAll } from "vitest";
import { EREIGNIS_AUSWAHL } from "../src/db/events";
import { EXPORT_TABELLEN } from "../src/db/export";

/**
 * Zeilenlese-Kosten der heissen Abfragen.
 *
 * D1 zaehlt gelesene Zeilen, und der Free Tier erlaubt 5 Millionen am Tag.
 * Am 13.09.2026 hat die Sammlungsansicht mit korrelierten Unterabfragen
 * ohne Indizes 11,7 Millionen Zeilen an einem Vormittag gelesen und die
 * Anwendung fuer den Rest des Tages lahmgelegt. Dieser Test misst die
 * Kosten gegen einen Bestand in Produktionsgroesse (rund 430 Listen) ueber
 * meta.rows_read der lokalen D1 und haelt sie unter einer Grenze.
 */

const ANZAHL = 430;
const B = "https://example.com";

beforeAll(async () => {
	await env.DB.batch(
		["review_queue", "play_status", "physical_copy", "digital_entitlement", "trophy_progress", "release", "game"].map(
			(t) => env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
	const spiele = env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)");
	const releases = env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, ?, ?)");
	const listen = env.DB.prepare(
		"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, icon_url, " +
			"progress_pct, defined_platinum, earned_platinum, last_played_at, synced_at, release_id) " +
			"VALUES (?, 'trophy', ?, ?, ?, ?, 1, ?, ?, '2026-01-01', ?)",
	);
	const status = env.DB.prepare("INSERT INTO play_status (release_id, status) VALUES (?, 'am_spielen')");
	const queue = env.DB.prepare("INSERT INTO review_queue (release_id, reason) VALUES (?, 'erstimport')");
	const anweisungen: D1PreparedStatement[] = [];
	for (let i = 1; i <= ANZAHL; i++) {
		const plattform = ["PS3", "PS4", "PS5", "PSVITA"][i % 4];
		anweisungen.push(spiele.bind(i, `Spiel ${i}`, `spiel ${String(i).padStart(4, "0")}`));
		anweisungen.push(releases.bind(i, i, plattform));
		anweisungen.push(
			listen.bind(`NPWR${i}`, `Spiel ${i}`, plattform, `https://x.invalid/${i}.png`, i % 101, i % 5 === 0 ? 1 : 0, `2025-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, i),
		);
		anweisungen.push(status.bind(i));
		anweisungen.push(queue.bind(i));
	}
	for (let i = 0; i < anweisungen.length; i += 200) {
		await env.DB.batch(anweisungen.slice(i, i + 200));
	}
});

/** Gelesene Zeilen einer Abfrage, gemessen an der lokalen D1. */
async function zeilenGelesen(sql: string, ...werte: unknown[]): Promise<number> {
	const r = await env.DB.prepare(sql).bind(...werte).all();
	return r.meta.rows_read ?? -1;
}

describe("Grenzen der Sammlungsabfrage", () => {
	/**
	 * Die Release-Abfrage bindet eine Id je Spiel der Seite; D1 erlaubt 100
	 * gebundene Werte je Statement. Ein groesseres `limit` wird deshalb
	 * gekappt, statt mit D1_ERROR zu antworten (Produktion am 18.09.2026:
	 * limit=150 ergab 500).
	 */
	it("kappt limit auf 100 statt mit einem D1-Fehler zu antworten", async () => {
		for (const limit of [100, 150, 200, 1000]) {
			const antwort = await SELF.fetch(`${B}/api/games?limit=${limit}`);
			expect(antwort.status, `limit=${limit}`).toBe(200);
			const daten = (await antwort.json()) as { spiele: unknown[]; limit: number };
			expect(daten.spiele.length, `limit=${limit}`).toBeLessThanOrEqual(100);
		}
	});
});

describe("Live-Aufloesung beim Scannen (Stufe 17c/17d)", () => {
	/**
	 * Die Route zerlegt die Sammlung einmal (nicht je Angebot) und holt die
	 * Releases nur fuer die Treffer. Gemessen wird beides einzeln.
	 */
	it("liest die Sammlung einmal, nicht 430 Unterabfragen", async () => {
		const sammlung = await zeilenGelesen("SELECT id AS spielId, title AS titel FROM game");
		const jeTreffer = await zeilenGelesen(
			"SELECT r.id, r.platform, g.cover_url, (SELECT COUNT(*) FROM physical_copy p WHERE p.release_id = r.id) AS exemplare " +
				"FROM release r JOIN game g ON g.id = r.game_id WHERE r.game_id = ? ORDER BY r.id",
			1,
		);
		console.info({ sammlung, jeTreffer });

		expect(sammlung).toBeLessThan(600);
		expect(jeTreffer).toBeLessThan(50);
	});
});

describe("Zeilenlese-Kosten bei 430 Listen", () => {
	it("Sammlung, eine Seite nach Titel", async () => {
		const antwort = await SELF.fetch(`${B}/api/games?limit=50`);
		expect(antwort.status).toBe(200);
	});

	/**
	 * Der Chip-Filter der Sammlung erlaubt seit Stufe 19 mehrere Plattformen.
	 * Aus `r.platform = ?` wird `r.platform IN (?,?,?,?)` - hoechstens vier
	 * Werte, derselbe Plan, kein zusaetzlicher Scan. Gemessen, weil ein `IN`
	 * ueber eine indizierte Spalte in SQLite leicht auf einen Tabellenscan
	 * umkippt, wenn die Liste waechst.
	 */
	it("misst den Plattformfilter mit mehreren Werten (Stufe 19)", async () => {
		const einer = await zeilenGelesen(
			"SELECT COUNT(*) AS n FROM game g WHERE EXISTS (SELECT 1 FROM release r WHERE r.game_id = g.id AND (r.platform = ?))",
			"PS4",
		);
		const vier = await zeilenGelesen(
			"SELECT COUNT(*) AS n FROM game g WHERE EXISTS (SELECT 1 FROM release r WHERE r.game_id = g.id " +
				"AND (r.platform IN ('PS3','PS4','PS5','PSVITA')))",
		);
		console.info({ einePlattform: einer, vierPlattformen: vier });

		// Vier Werte duerfen nicht teurer sein als ein Vielfaches der Treffer:
		// Der Filter laeuft ueber idx_release_game, nicht ueber die Tabelle.
		expect(vier).toBeLessThan(einer * 4 + 500);
		expect(await SELF.fetch(`${B}/api/games?platform=PS4,PS5&limit=50`)).toHaveProperty("status", 200);
	});

	it("misst die Sortierung nach Spielzeit (Stufe 18c)", async () => {
		// Spielzeit fuer jedes zweite Release, wie bei einem Bestand mit PS3
		// und Vita ohne Spielzeit.
		const einfuegen = env.DB.prepare(
			"INSERT INTO psn_played_title (title_id, name, platform, play_duration_s, release_id, synced_at) " +
				"VALUES (?, ?, 'PS4', ?, ?, datetime('now'))",
		);
		const anweisungen: D1PreparedStatement[] = [];
		for (let i = 1; i <= ANZAHL; i += 2) anweisungen.push(einfuegen.bind(`CUSA${i}`, `Spiel ${i}`, i * 60, i));
		for (let i = 0; i < anweisungen.length; i += 200) await env.DB.batch(anweisungen.slice(i, i + 200));

		const spielzeit =
			"(SELECT SUM(p2.play_duration_s) FROM psn_played_title p2 JOIN release r4 ON r4.id = p2.release_id WHERE r4.game_id = g.id)";
		const gelesen = await zeilenGelesen(
			`SELECT g.id, g.title, ${spielzeit} AS spielzeit_s FROM game g
			 ORDER BY ${spielzeit} IS NULL, ${spielzeit} DESC, g.sort_title LIMIT 20 OFFSET 0`,
		);
		console.info({ sortierungSpielzeit: gelesen });

		// Zwei Index-Lookups je Ergebniszeile (idx_played_release), keine
		// Tabellenscans - dieselbe Groessenordnung wie "zuletzt gespielt".
		expect(gelesen).toBeLessThan(6_000);

		await env.DB.prepare("DELETE FROM psn_played_title").run();
	});

	it("misst die Abfragen der Sammlung einzeln", async () => {
		const zuletzt =
			"(SELECT MAX(t2.last_played_at) FROM trophy_progress t2 JOIN release r2 ON r2.id = t2.release_id WHERE r2.game_id = g.id)";
		// Releases nur aus Wunsch bleiben aussen vor (Stufe 10) - drei Index-Lookups je Release.
		const nurWunsch =
			"(t.release_id IS NULL AND NOT EXISTS (SELECT 1 FROM physical_copy p0 WHERE p0.release_id = r.id) " +
			"AND NOT EXISTS (SELECT 1 FROM digital_entitlement d0 WHERE d0.release_id = r.id) " +
			"AND EXISTS (SELECT 1 FROM plan_entry pe0 WHERE pe0.release_id = r.id AND pe0.kind = 'wunsch' AND pe0.status = 'offen'))";
		const seite = await zeilenGelesen(
			`SELECT g.id, g.title, g.sort_title, g.cover_url,
			  (SELECT t3.icon_url FROM trophy_progress t3 JOIN release r3 ON r3.id = t3.release_id
			    WHERE r3.game_id = g.id AND t3.icon_url IS NOT NULL ORDER BY r3.platform DESC LIMIT 1) AS icon_url,
			  ${zuletzt} AS zuletzt_gespielt
			 FROM game g WHERE EXISTS (SELECT 1 FROM release r LEFT JOIN trophy_progress t ON t.release_id = r.id
			   LEFT JOIN play_status ps ON ps.release_id = r.id WHERE r.game_id = g.id AND (NOT ${nurWunsch}))
			 ORDER BY g.sort_title LIMIT 50 OFFSET 0`,
		);
		const sortiertNachZuletzt = await zeilenGelesen(
			`SELECT g.id FROM game g WHERE EXISTS (SELECT 1 FROM release r LEFT JOIN trophy_progress t ON t.release_id = r.id
			   WHERE r.game_id = g.id AND (NOT ${nurWunsch}))
			 ORDER BY ${zuletzt} IS NULL, ${zuletzt} DESC, g.sort_title LIMIT 50`,
		);
		const releasesDerSeite = await zeilenGelesen(
			`SELECT r.id, ps.status,
			  (SELECT COUNT(*) FROM physical_copy p WHERE p.release_id = r.id) AS exemplare,
			  (SELECT GROUP_CONCAT(d.source) FROM digital_entitlement d WHERE d.release_id = r.id) AS digital
			 FROM release r LEFT JOIN trophy_progress t ON t.release_id = r.id
			 LEFT JOIN play_status ps ON ps.release_id = r.id
			 WHERE r.game_id IN (${Array.from({ length: 50 }, (_, i) => i + 1).join(",")}) AND NOT ${nurWunsch}`,
		);
		const pruefliste = await zeilenGelesen("SELECT release_id FROM v_review_offen LIMIT 1 OFFSET 0");
		const uebersicht = await zeilenGelesen(
			`SELECT g.id, r.id, t.np_communication_id,
			  (SELECT COUNT(*) FROM release r2 WHERE r2.game_id = g.id) AS releases_im_spiel
			 FROM game g JOIN release r ON r.game_id = g.id LEFT JOIN trophy_progress t ON t.release_id = r.id
			 ORDER BY g.sort_title, r.platform`,
		);

		console.info({ seite, sortiertNachZuletzt, releasesDerSeite, pruefliste, uebersicht });

		// Grenzen: grosszuegig gegenueber dem, was mit Indizes noetig ist,
		// aber Groessenordnungen unter dem, was ohne Indizes anfaellt.
		expect(seite).toBeLessThan(20_000);
		expect(sortiertNachZuletzt).toBeLessThan(20_000);
		expect(releasesDerSeite).toBeLessThan(5_000);
		expect(pruefliste).toBeLessThan(10_000);
		expect(uebersicht).toBeLessThan(20_000);
	});

	/**
	 * Export (Stufe 8). Er laeuft einmal die Woche, darf aber trotzdem nicht
	 * quadratisch werden: Ein Vollexport ohne Indizes waere derselbe Fehler
	 * wie die Sammlungsansicht vom 13.09.2026, nur seltener sichtbar.
	 *
	 * Anspruch: jede Tabelle genau einmal gelesen. Bei 430 Listen sind das
	 * rund 1.300 Fachzeilen; alles deutlich darueber heisst, dass irgendwo
	 * ein Scan je Zeile steckt.
	 */
	it("misst den Export", async () => {
		const sammlungCsv = await zeilenGelesen(
			`SELECT g.title, r.platform, r.physical_release_status,
			        (SELECT COUNT(*) FROM physical_copy p WHERE p.release_id = r.id) AS exemplare,
			        (SELECT GROUP_CONCAT(d.source) FROM digital_entitlement d WHERE d.release_id = r.id) AS digital,
			        t.progress_pct, t.defined_platinum, t.earned_platinum, t.last_played_at,
			        ps.status, ps.rating
			 FROM release r
			 JOIN game g ON g.id = r.game_id
			 LEFT JOIN trophy_progress t ON t.release_id = r.id
			 LEFT JOIN play_status ps ON ps.release_id = r.id
			 ORDER BY g.sort_title, r.platform`,
		);
		const trophaeenCsv = await zeilenGelesen(
			`SELECT t.title_name, t.platform, g.title, t.progress_pct, t.release_id
			 FROM trophy_progress t
			 LEFT JOIN release r ON r.id = t.release_id
			 LEFT JOIN game g ON g.id = r.game_id
			 ORDER BY t.title_name`,
		);

		// Tabellenliste aus der Konstante, nicht abgeschrieben: kommt eine
		// Tabelle dazu, misst dieser Test sie automatisch mit.
		const ergebnisse = await env.DB.batch(
			EXPORT_TABELLEN.map((t) => env.DB.prepare(`SELECT * FROM ${t} ORDER BY rowid`)),
		);
		const backupJson = ergebnisse.reduce((summe, r) => summe + (r.meta.rows_read ?? 0), 0);

		console.info({ sammlungCsv, trophaeenCsv, backupJson });

		expect(sammlungCsv).toBeLessThan(10_000);
		expect(trophaeenCsv).toBeLessThan(10_000);
		expect(backupJson).toBeLessThan(10_000);
	});

	/**
	 * IGDB-Abgleich (Stufe 9). Der Abgleich laeuft in rund 55 Aufrufen ueber
	 * alle Spiele; jeder Aufruf waehlt die naechsten acht aus, und die
	 * Pruefansicht liest ihre Seite samt Kandidaten. Beides darf je Aufruf
	 * nur die Groessenordnung der game-Tabelle lesen.
	 */
	it("misst den IGDB-Abgleich und die Pruefansicht", async () => {
		// Haelfte der Spiele wartet auf die Pruefung, mit je drei Kandidaten.
		await env.DB.prepare("UPDATE game SET igdb_checked_at = datetime('now') WHERE id % 2 = 0").run();
		const einfuegen = env.DB.prepare(
			"INSERT INTO igdb_candidate (game_id, igdb_id, name, position, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))",
		);
		const anweisungen: D1PreparedStatement[] = [];
		for (let i = 2; i <= ANZAHL; i += 2) {
			for (let k = 0; k < 3; k++) anweisungen.push(einfuegen.bind(i, i * 10 + k, `Kandidat ${i}-${k}`, k));
		}
		for (let i = 0; i < anweisungen.length; i += 200) await env.DB.batch(anweisungen.slice(i, i + 200));

		const naechste = await zeilenGelesen(
			`SELECT g.id, g.title, g.sort_title,
			  (SELECT GROUP_CONCAT(r.platform) FROM release r WHERE r.game_id = g.id) AS plattformen
			 FROM game g WHERE igdb_id IS NULL AND igdb_checked_at IS NULL AND igdb_declined_at IS NULL
			 ORDER BY g.id LIMIT 8`,
		);
		const offenSeite = await zeilenGelesen(
			`SELECT g.id, g.title, g.sort_title, g.igdb_checked_at,
			  (SELECT GROUP_CONCAT(r.platform) FROM release r WHERE r.game_id = g.id) AS plattformen,
			  (SELECT t.icon_url FROM trophy_progress t JOIN release r2 ON r2.id = t.release_id
			    WHERE r2.game_id = g.id AND t.icon_url IS NOT NULL ORDER BY r2.platform DESC LIMIT 1) AS icon_url
			 FROM game g WHERE igdb_id IS NULL AND igdb_checked_at IS NOT NULL AND igdb_declined_at IS NULL
			 ORDER BY g.sort_title LIMIT 20 OFFSET 0`,
		);
		const kandidatenDerSeite = await zeilenGelesen(
			`SELECT game_id, igdb_id, name, position FROM igdb_candidate
			 WHERE game_id IN (${Array.from({ length: 20 }, (_, i) => (i + 1) * 2).join(",")}) ORDER BY game_id, position`,
		);
		const zaehlung = await zeilenGelesen(
			"SELECT COUNT(*) AS gesamt, SUM(igdb_id IS NOT NULL) AS verknuepft, MAX(igdb_synced_at) FROM game",
		);

		console.info({ naechste, offenSeite, kandidatenDerSeite, zaehlung });

		expect(naechste).toBeLessThan(2_000);
		expect(offenSeite).toBeLessThan(5_000);
		expect(kandidatenDerSeite).toBeLessThan(500);
		expect(zaehlung).toBeLessThan(1_000);

		await env.DB.batch([
			env.DB.prepare("DELETE FROM igdb_candidate"),
			env.DB.prepare("UPDATE game SET igdb_checked_at = NULL"),
		]);
	});

	it("misst die Wunschliste und die Absichten eines Spiels (Stufe 10)", async () => {
		// 300 Wuensche wie nach dem Import (8.2): zwei Drittel am Spiel, ein
		// Drittel am Release, dazu ein paar erledigte und Freitext.
		await env.DB.prepare("DELETE FROM plan_entry").run();
		const amSpiel = env.DB.prepare("INSERT INTO plan_entry (kind, game_id, origin) VALUES ('wunsch', ?, 'import')");
		const amRelease = env.DB.prepare("INSERT INTO plan_entry (kind, release_id, origin) VALUES ('wunsch', ?, 'import')");
		const anweisungen: D1PreparedStatement[] = [];
		for (let i = 1; i <= 300; i++) anweisungen.push(i % 3 === 0 ? amRelease.bind(i) : amSpiel.bind(i));
		anweisungen.push(env.DB.prepare("INSERT INTO plan_entry (kind, title_raw, origin) VALUES ('wunsch', 'Freitext', 'manuell')"));
		anweisungen.push(env.DB.prepare("UPDATE plan_entry SET status = 'erledigt' WHERE id % 10 = 0"));
		for (let i = 0; i < anweisungen.length; i += 200) await env.DB.batch(anweisungen.slice(i, i + 200));

		// Seit Stufe 15 mit zwei weiteren Unterabfragen je Zeile (Kaufeintrag, Besitz) - dieselbe Abfrage wie im Repository.
		const auswahl = PLAN_AUSWAHL;
		const wunschliste = await zeilenGelesen(
			auswahl + "WHERE pe.kind = ? AND pe.status = ? ORDER BY pe.position IS NULL, pe.position, pe.id",
			"wunsch",
			"offen",
		);
		const fuerSpiel = await zeilenGelesen(
			auswahl +
				"WHERE pe.status = 'offen' AND (pe.game_id = ? OR pe.release_id IN (SELECT id FROM release WHERE game_id = ?)) ORDER BY pe.id",
			200,
			200,
		);
		const duplikat = await zeilenGelesen(
			"SELECT id FROM plan_entry WHERE kind = ? AND status = 'offen' AND release_id = ?",
			"wunsch",
			3,
		);
		const nachIgdb = await zeilenGelesen("SELECT id FROM game WHERE igdb_id = ?", 1001);

		console.info({ wunschliste, fuerSpiel, duplikat, nachIgdb });

		// Je Eintrag Index-Lookups auf release, game, plan_entry (Kaufeintrag), physical_copy und digital_entitlement.
		expect(wunschliste).toBeLessThan(2_000);
		expect(fuerSpiel).toBeLessThan(50);
		expect(duplikat).toBeLessThan(50);
		expect(nachIgdb).toBeLessThan(50);

		const antwort = await SELF.fetch(`${B}/api/plans?kind=wunsch`);
		expect(antwort.status).toBe(200);
		await env.DB.prepare("DELETE FROM plan_entry").run();
	});

	it("misst den Wunschlisten-Import und die Ansicht Ohne Zuordnung (Stufe 11)", async () => {
		// Ein Lauf in Produktionsgroesse: 320 Zeilen, je zehn Kandidaten bei den unklaren.
		await env.DB.prepare("INSERT INTO wishlist_import (id, form) VALUES (1, 'jahresliste')").run();
		const zeile = env.DB.prepare(
			"INSERT INTO wishlist_import_line (id, import_id, position, title, originals, checked_at, match_kind, game_id, igdb_id, decision) VALUES (?, 1, ?, ?, '[]', '2026-09-15', ?, ?, ?, 'offen')",
		);
		const kandidat = env.DB.prepare(
			"INSERT INTO wishlist_import_candidate (line_id, igdb_id, name, position) VALUES (?, ?, ?, ?)",
		);
		const anweisungen: D1PreparedStatement[] = [];
		for (let i = 1; i <= 320; i++) {
			const art = i % 3 === 0 ? "mehrdeutig" : i % 10 === 0 ? "sammlung" : "eindeutig";
			anweisungen.push(zeile.bind(i, i, `Titel ${i}`, art, art === "sammlung" ? i : null, art === "eindeutig" ? 100000 + i : null));
			if (art === "mehrdeutig") for (let k = 0; k < 10; k++) anweisungen.push(kandidat.bind(i, 200000 + i * 10 + k, `Kandidat ${k}`, k));
		}
		for (let i = 0; i < anweisungen.length; i += 200) await env.DB.batch(anweisungen.slice(i, i + 200));

		const auswahl = `SELECT l.id, l.title, g.title AS spiel_titel, r.platform AS release_plattform
			 FROM wishlist_import_line l LEFT JOIN game g ON g.id = l.game_id LEFT JOIN release r ON r.id = l.release_id `;
		const zaehler = await zeilenGelesen("SELECT COUNT(*) AS n, SUM(decision = 'offen') AS o FROM wishlist_import_line WHERE import_id = ?", 1);
		const naechste = await zeilenGelesen(auswahl + "WHERE l.import_id = ? AND l.checked_at IS NULL AND l.decision = 'offen' ORDER BY l.position, l.id LIMIT 8", 1);
		const unklarSeite = await zeilenGelesen(
			auswahl + "WHERE l.import_id = ? AND l.decision = 'offen' AND l.match_kind IN ('mehrdeutig','ohne_treffer') ORDER BY l.position, l.id LIMIT 20 OFFSET 0",
			1,
		);
		const kandidatenSeite = await zeilenGelesen(
			`SELECT line_id, igdb_id, name FROM wishlist_import_candidate WHERE line_id IN (${Array.from({ length: 20 }, (_, i) => (i + 1) * 3).join(",")}) ORDER BY line_id, position`,
		);
		const ohneZuordnung = await zeilenGelesen("SELECT quelle, ref_id, title, zustand FROM v_ohne_igdb WHERE zustand <> 'abgelehnt' ORDER BY quelle, title");

		console.info({ zaehler, naechste, unklarSeite, kandidatenSeite, ohneZuordnung });

		// Ein Lauf wird ueber idx_wl_line_import einmal durchgesehen (320 Zeilen);
		// die Kandidaten einer Seite kommen als Index-Lookup je Zeile (rund zwei
		// gelesene Zeilen je Ergebniszeile bei 200 Kandidaten).
		expect(zaehler).toBeLessThan(400);
		expect(naechste).toBeLessThan(400);
		expect(unklarSeite).toBeLessThan(500);
		expect(kandidatenSeite).toBeLessThan(600);
		// v_ohne_igdb scannt game (430) und plan_entry einmal.
		expect(ohneZuordnung).toBeLessThan(1_000);

		for (const pfad of ["/api/imports/wishlist/1?gruppe=unklar", "/api/imports/wishlist/1?gruppe=klar", "/api/unmatched"]) {
			expect((await SELF.fetch(`${B}${pfad}`)).status, pfad).toBe(200);
		}
		await env.DB.prepare("DELETE FROM wishlist_import").run();
	});

	it("misst Backlog-Kandidaten, To-Do-Liste und Umsortieren (Stufe 12)", async () => {
		// Regal-Erfassung in Produktionsgroesse: jedes Release im Besitz, dazu
		// 50 To-Do- und 100 Backlog-Eintraege. Der Grundbestand hat ueberall
		// Trophaeenfortschritt und 'am_spielen', die Kandidaten kommen aus 40
		// zusaetzlichen Releases ohne Liste.
		await env.DB.prepare("DELETE FROM plan_entry").run();
		const disc = env.DB.prepare("INSERT INTO physical_copy (release_id) VALUES (?)");
		const digital = env.DB.prepare("INSERT INTO digital_entitlement (release_id, source) VALUES (?, 'kauf')");
		const release = env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, ?, 'PS5')");
		const todo = env.DB.prepare("INSERT INTO plan_entry (kind, release_id, origin, position) VALUES ('todo', ?, 'triage', ?)");
		const backlog = env.DB.prepare("INSERT INTO plan_entry (kind, release_id, origin) VALUES ('backlog', ?, 'triage')");
		const anweisungen: D1PreparedStatement[] = [];
		for (let i = 1; i <= ANZAHL; i++) anweisungen.push(i % 2 === 0 ? disc.bind(i) : digital.bind(i));
		for (let i = 1; i <= 40; i++) anweisungen.push(release.bind(ANZAHL + i, i), disc.bind(ANZAHL + i));
		for (let i = 1; i <= 50; i++) anweisungen.push(todo.bind(i, i));
		for (let i = 51; i <= 150; i++) anweisungen.push(backlog.bind(i));
		for (let i = 0; i < anweisungen.length; i += 200) await env.DB.batch(anweisungen.slice(i, i + 200));

		const kandidaten = await zeilenGelesen(
			"SELECT game_id, title, cover_url, critic_score, release_id, platform FROM v_backlog_kandidaten ORDER BY title, platform",
		);
		const todoListe = await zeilenGelesen(
			`SELECT pe.id FROM plan_entry pe LEFT JOIN release r ON r.id = pe.release_id
			 LEFT JOIN game g ON g.id = COALESCE(pe.game_id, r.game_id)
			 LEFT JOIN play_status ps ON ps.release_id = pe.release_id
			 WHERE pe.kind = ? AND pe.status = ? ORDER BY pe.position IS NULL, pe.position, pe.id`,
			"todo",
			"offen",
		);
		const pruefung = await zeilenGelesen(
			`SELECT id FROM plan_entry WHERE kind = ? AND status = 'offen' AND id IN (${Array.from({ length: 50 }, () => "?").join(", ")})`,
			"todo",
			...Array.from({ length: 50 }, (_, i) => i + 1),
		);
		const ansEnde = await zeilenGelesen(
			"SELECT COALESCE(MAX(position), 0) + 1 AS p FROM plan_entry WHERE kind = 'todo' AND status = 'offen'",
		);
		const umsortieren = await env.DB.batch(
			Array.from({ length: 50 }, (_, i) => env.DB.prepare("UPDATE plan_entry SET position = ? WHERE id = ?").bind(50 - i, i + 1)),
		);
		const geschrieben = umsortieren.reduce((n, r) => n + (r.meta.rows_read ?? 0), 0);

		console.info({ kandidaten, todoListe, pruefung, ansEnde, umsortieren: geschrieben });

		// Je Release vier korrelierte Index-Lookups; die View liest jedes
		// Release einmal, nicht die Tabellen quer.
		expect(kandidaten).toBeLessThan(3_000);
		expect(todoListe).toBeLessThan(500);
		expect(pruefung).toBeLessThan(200);
		expect(ansEnde).toBeLessThan(200);
		expect(geschrieben).toBeLessThan(200);

		for (const pfad of ["/api/backlog-candidates", "/api/plans?kind=todo", "/api/plans?kind=backlog"]) {
			const antwort = await SELF.fetch(`${B}${pfad}`);
			expect(antwort.status, pfad).toBe(200);
		}
		const antwort = await SELF.fetch(`${B}/api/backlog-candidates`);
		expect(((await antwort.json()) as { anzahl: number }).anzahl).toBe(40);

		await env.DB.batch(
			["plan_entry", "physical_copy", "digital_entitlement"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
		);
		await env.DB.prepare("DELETE FROM release WHERE id > ?").bind(ANZAHL).run();
	});

	it("misst die Lueckenliste und die Auswahl des Disc-Schritts (Stufe 14)", async () => {
		// Nach dem IGDB-Lauf: 200 Releases mit 'ja', der Rest 'unbekannt', 30
		// verworfene Kaufeintraege, alle Spiele verknuepft. Die View laeuft
		// einmal ueber trophy_progress; je Zeile drei Index-Lookups
		// (physical_copy, plan_entry zweimal, market_offer).
		await env.DB.prepare("DELETE FROM plan_entry").run();
		await env.DB.batch([
			env.DB.prepare("UPDATE release SET physical_release_status = 'ja', physical_source = 'igdb' WHERE id % 2 = 0"),
			env.DB.prepare("UPDATE game SET igdb_id = id + 1000"),
		]);
		const verworfen = env.DB.prepare(
			"INSERT INTO plan_entry (kind, release_id, origin, status, resolved_at) VALUES ('kauf', ?, 'luecke', 'verworfen', '2026-09-16')",
		);
		await env.DB.batch(Array.from({ length: 30 }, (_, i) => verworfen.bind((i + 1) * 2)));

		const luecken = await zeilenGelesen(
			`SELECT l.game_id, l.title, l.cover_url, l.release_id, l.platform, l.disc_fassung, l.disc_quelle,
			        l.progress_pct, l.hat_platin, l.eigener_status, l.verworfen, l.bester_gebrauchtpreis_cents,
			        (SELECT pe.id FROM plan_entry pe WHERE pe.release_id = l.release_id
			           AND pe.kind = 'kauf' AND pe.status = 'verworfen' ORDER BY pe.id LIMIT 1) AS plan_id
			 FROM v_luecken l ORDER BY l.title, l.platform`,
		);
		const auswahl = await zeilenGelesen(
			`SELECT g.id, g.igdb_id FROM game g WHERE g.igdb_id IS NOT NULL AND EXISTS (SELECT 1 FROM release r WHERE r.game_id = g.id
			 AND r.physical_release_status = 'unbekannt'
			 AND (r.physical_checked_at IS NULL OR r.physical_checked_at < datetime('now', '-30 days'))) ORDER BY g.id LIMIT 50`,
		);
		const kaufkandidaten = await zeilenGelesen("SELECT quelle, release_id, title FROM v_kaufkandidaten");
		console.info({ luecken, auswahl, kaufkandidaten });

		expect(luecken).toBeLessThan(4_000);
		expect(auswahl).toBeLessThan(1_000);
		expect(kaufkandidaten).toBeLessThan(4_000);

		const antwort = await SELF.fetch(`${B}/api/gaps?verworfene=1&unbekannte=1`);
		expect(antwort.status).toBe(200);
		const daten = (await antwort.json()) as { anzahl: number; verworfen: number; unbekannt: number };
		// 215 gerade Ids mit 'ja', zwei davon (202, 404) ohne Fortschritt, 30 verworfen
		expect(daten).toMatchObject({ anzahl: 183, verworfen: 30 });
		expect(daten.unbekannt).toBeGreaterThan(200);

		await env.DB.batch([
			env.DB.prepare("DELETE FROM plan_entry"),
			env.DB.prepare("UPDATE release SET physical_release_status = 'unbekannt', physical_source = NULL"),
			env.DB.prepare("UPDATE game SET igdb_id = NULL"),
		]);
	});

	it("misst Kaufkandidaten, Kaufliste, Erscheint bald und das Erledigen beim Erfassen (Stufe 15)", async () => {
		// 215 belegte Luecken (gerade Ids), dazu 300 Wuensche wie nach dem
		// Import, 30 davon schon als Kopie auf der Kaufliste, 20 angekuendigt.
		await env.DB.batch([
			env.DB.prepare("DELETE FROM plan_entry"),
			env.DB.prepare("UPDATE release SET physical_release_status = 'ja' WHERE id % 2 = 0"),
			env.DB.prepare("UPDATE game SET release_status = 'angekuendigt', release_date = '2099-01-01' WHERE id > 410"),
		]);
		const amSpiel = env.DB.prepare("INSERT INTO plan_entry (kind, game_id, origin) VALUES ('wunsch', ?, 'import')");
		const amRelease = env.DB.prepare("INSERT INTO plan_entry (kind, release_id, origin) VALUES ('wunsch', ?, 'import')");
		const kauf = env.DB.prepare("INSERT INTO plan_entry (kind, release_id, origin) VALUES ('kauf', ?, 'wunsch')");
		const anweisungen: D1PreparedStatement[] = [];
		for (let i = 1; i <= 300; i++) anweisungen.push(i % 3 === 0 ? amRelease.bind(i) : amSpiel.bind(i));
		for (let i = 3; i <= 90; i += 3) anweisungen.push(kauf.bind(i));
		for (let i = 0; i < anweisungen.length; i += 200) await env.DB.batch(anweisungen.slice(i, i + 200));

		const kandidaten = await zeilenGelesen(
			"SELECT quelle, plan_id, release_id, game_id, title, platform, cover_url, critic_score, is_favorite, " +
				"bester_gebrauchtpreis_cents FROM v_kaufkandidaten ORDER BY quelle, title, platform",
		);
		const kaufliste = await zeilenGelesen(
			PLAN_AUSWAHL + "WHERE pe.kind = ? AND pe.status = ? ORDER BY pe.position IS NULL, pe.position, pe.id",
			"kauf",
			"offen",
		);
		const bald = await zeilenGelesen(
			"SELECT game_id, title, cover_url, release_date, release_id, platform, plan_id, kind, is_favorite FROM v_erscheint_bald",
		);
		const amZiel = await zeilenGelesen(
			PLAN_AUSWAHL +
				"WHERE pe.id IN (SELECT id FROM plan_entry WHERE release_id = ? AND status = 'offen' AND kind IN (?, ?) " +
				"UNION SELECT id FROM plan_entry WHERE game_id = ? AND status = 'offen' AND kind IN (?, ?)) ORDER BY pe.id",
			6, "kauf", "wunsch", 6, "kauf", "wunsch",
		);
		console.info({ kandidaten, kaufliste, bald, amZiel });

		// Kandidaten: v_luecken (rund 430 trophy_progress mit Index-Lookups) plus 300 Wuensche mit je zwei Lookups.
		expect(kandidaten).toBeLessThan(4_000);
		expect(kaufliste).toBeLessThan(500);
		expect(bald).toBeLessThan(2_000);
		expect(amZiel).toBeLessThan(50);

		const antwort = await SELF.fetch(`${B}/api/purchase-candidates`);
		expect(antwort.status).toBe(200);
		const daten = (await antwort.json()) as { luecken: number; wuensche: number };
		// 300 Wuensche minus 30 kopierte minus die angekuendigten am Spiel (id > 410 hat keinen Wunsch) → 270
		expect(daten.wuensche).toBe(270);
		expect(daten.luecken).toBeGreaterThan(100);

		await env.DB.batch([
			env.DB.prepare("DELETE FROM plan_entry"),
			env.DB.prepare("UPDATE release SET physical_release_status = 'unbekannt'"),
			env.DB.prepare("UPDATE game SET release_status = 'erschienen', release_date = NULL"),
		]);
	});

	it("misst Verlauf je Spiel, Aenderungen mit Quellenfilter und die Protokollzeilen des Syncs (Stufe 16)", async () => {
		// 4 000 Ereignisse, wie nach einem Jahr Nutzung: je Spiel rund neun,
		// drei Viertel davon vom Nutzer, ein Viertel vom Sync.
		await env.DB.prepare("DELETE FROM game_event").run();
		const ereignis = env.DB.prepare(
			"INSERT INTO game_event (source, game_id, release_id, label, kind, field, old_value, new_value) " +
				"VALUES (?, ?, ?, ?, 'status_geaendert', 'status', 'am_spielen', 'pausiert')",
		);
		const anweisungen: D1PreparedStatement[] = [];
		for (let i = 1; i <= 4_000; i++) {
			const spiel = (i % ANZAHL) + 1;
			anweisungen.push(ereignis.bind(i % 4 === 0 ? "sync" : "nutzer", spiel, spiel, `Spiel ${spiel} (PS4)`));
		}
		for (let i = 0; i < anweisungen.length; i += 200) await env.DB.batch(anweisungen.slice(i, i + 200));

		const verlauf = await zeilenGelesen(`SELECT ${EREIGNIS_AUSWAHL} FROM game_event WHERE game_id = ? ORDER BY id DESC LIMIT ?`, 7, 21);
		const alle = await zeilenGelesen(`SELECT ${EREIGNIS_AUSWAHL} FROM game_event WHERE 1 = 1 ORDER BY id DESC LIMIT ?`, 51);
		const zweiteSeite = await zeilenGelesen(`SELECT ${EREIGNIS_AUSWAHL} FROM game_event WHERE 1 = 1 AND id < ? ORDER BY id DESC LIMIT ?`, 2_000, 51);
		const nachQuelle = await zeilenGelesen(
			`SELECT ${EREIGNIS_AUSWAHL} FROM game_event WHERE source = ? AND id < ? ORDER BY id DESC LIMIT ?`,
			"sync", 2_000, 51,
		);
		console.info({ verlauf, alle, zweiteSeite, nachQuelle });

		expect(verlauf).toBeLessThan(30);
		expect(alle).toBeLessThan(60);
		expect(zweiteSeite).toBeLessThan(60);
		expect(nachQuelle).toBeLessThan(60);

		// Die Protokollzeilen des Syncs lesen den Bestand hoechstens ein
		// zweites Mal: dieselbe Auswahl wie das UPDATE, davor im Batch, alles
		// ueber Primaerschluessel und idx_trophy_release / idx_review_release.
		const vorbelegt = await zeilenGelesen(
			"SELECT 'sync', r.game_id, t.release_id, g.title || ' (' || r.platform || ')', 'status_vorbelegt', 'status', " +
				"ps.status, CASE WHEN t.progress_pct >= 100 THEN 'komplettiert' ELSE 'am_spielen' END, NULL " +
				"FROM trophy_progress t JOIN release r ON r.id = t.release_id JOIN game g ON g.id = r.game_id " +
				"LEFT JOIN play_status ps ON ps.release_id = t.release_id " +
				"WHERE t.release_id IS NOT NULL AND t.progress_pct > 0 AND (ps.release_id IS NULL OR ps.status = 'nicht_gespielt')",
		);
		const eingereiht = await zeilenGelesen(
			"SELECT t.release_id FROM trophy_progress t JOIN play_status ps ON ps.release_id = t.release_id " +
				"JOIN release r ON r.id = t.release_id JOIN game g ON g.id = r.game_id " +
				"WHERE t.release_id IS NOT NULL AND t.reviewed_at IS NOT NULL " +
				"AND ((t.defined_bronze + t.defined_silver + t.defined_gold + t.defined_platinum) > t.reviewed_defined_total " +
				"OR ((t.earned_bronze + t.earned_silver + t.earned_gold + t.earned_platinum) > t.reviewed_earned_total AND ps.status <> 'am_spielen')) " +
				"AND NOT EXISTS (SELECT 1 FROM review_queue q WHERE q.release_id = t.release_id)",
		);
		console.info({ vorbelegt, eingereiht });
		expect(vorbelegt).toBeLessThan(4 * ANZAHL + 100);
		expect(eingereiht).toBeLessThan(4 * ANZAHL + 100);

		const antwort = await SELF.fetch(`${B}/api/events?limit=5`);
		expect(antwort.status).toBe(200);
		await env.DB.prepare("DELETE FROM game_event").run();
	});

	it("misst einen Leerlauf-Aufruf der Automatik (Stufe 18)", async () => {
		// Alles verknuepft und frisch, fuenf Laeufe in der Historie: Der Cron
		// findet nichts zu tun. 36 Aufrufe je Nacht - die Summe der Abfragen
		// eines Leerlaufs mal 36 muss weit unter dem Tagesbudget bleiben.
		await env.DB.batch([
			env.DB.prepare("UPDATE game SET igdb_id = id + 1000, igdb_synced_at = datetime('now')"),
			env.DB.prepare("UPDATE release SET physical_release_status = 'ja', physical_source = 'igdb'"),
			env.DB.prepare("DELETE FROM psn_sync_run"),
			...Array.from({ length: 5 }, (_, i) =>
				env.DB.prepare(
					"INSERT INTO psn_sync_run (started_at, finished_at, status, next_offset, started_by) VALUES (datetime('now', ?), datetime('now', ?), 'erfolg', 0, 'cron')",
				).bind(`-${i} days`, `-${i} days`),
			),
		]);
		// Fuenf Seiten je Lauf, alle normalisiert - der Stand einer echten Nacht.
		await env.DB.batch(
			(await env.DB.prepare("SELECT id FROM psn_sync_run").all<{ id: number }>()).results.flatMap((l) =>
				Array.from({ length: 5 }, (_, i) =>
					env.DB.prepare(
						"INSERT INTO psn_raw_response (sync_run_id, endpoint, payload, fetched_at, normalized_at) " +
							"VALUES (?, ?, '[]', datetime('now'), datetime('now'))",
					).bind(l.id, `/trophyTitles?offset=${i * 100}`),
				),
			),
		);

		const erschienen = await zeilenGelesen(
			"SELECT id FROM game WHERE release_status = 'angekuendigt' AND release_date <= date('now')",
		);
		const haenger = await zeilenGelesen(
			`SELECT id FROM psn_sync_run WHERE status = 'laufend' AND MAX(started_at, COALESCE((SELECT MAX(MAX(r.fetched_at, COALESCE(r.normalized_at, '')))
			 FROM psn_raw_response r WHERE r.sync_run_id = psn_sync_run.id), '')) < datetime('now', '-3 hours')`,
		);
		const laufend = await zeilenGelesen("SELECT * FROM psn_sync_run WHERE status = 'laufend' ORDER BY id DESC LIMIT 1");
		const heutige = await zeilenGelesen("SELECT * FROM psn_sync_run WHERE started_at >= ? ORDER BY id", new Date().toISOString().slice(0, 10));
		const auffrischen = await zeilenGelesen(
			`SELECT id, igdb_id FROM game WHERE igdb_id IS NOT NULL AND (igdb_synced_at IS NULL OR igdb_synced_at < datetime('now', '-7 days'))
			 ORDER BY igdb_synced_at IS NOT NULL, igdb_synced_at, id LIMIT 50`,
		);
		const disc = await zeilenGelesen(
			`SELECT g.id, g.igdb_id FROM game g WHERE g.igdb_id IS NOT NULL AND EXISTS (SELECT 1 FROM release r WHERE r.game_id = g.id
			 AND r.physical_release_status = 'unbekannt'
			 AND (r.physical_checked_at IS NULL OR r.physical_checked_at < datetime('now', '-30 days'))) ORDER BY g.id LIMIT 50`,
		);
		// Der Aufraeumschritt (Stufe 18d) laeuft in jedem Leerlauf mit. Als
		// SELECT gemessen, weil zeilenGelesen kein DELETE ausfuehren soll -
		// dieselbe Bedingung, derselbe Plan.
		const aufraeumen = await zeilenGelesen(
			`SELECT id FROM psn_raw_response WHERE normalized_at IS NOT NULL AND sync_run_id NOT IN
			 (SELECT sync_run_id FROM psn_raw_response GROUP BY sync_run_id ORDER BY sync_run_id DESC LIMIT 3)`,
		);
		const leerlauf = erschienen + haenger + laufend + heutige + auffrischen + disc + aufraeumen;
		console.info({ erschienen, haenger, laufend, heutige, auffrischen, disc, aufraeumen, leerlauf });

		// Gemessen 2 241: game zweimal (erschienen, auffrischen), game mit
		// release je Spiel fuer die Disc-Auswahl (1 289), psn_sync_run dreimal
		// (5 Zeilen) und seit Stufe 18d der Aufraeumschritt mit 76 Zeilen ueber
		// die 25 Rohantworten der fuenf Laeufe. Mal 36 Aufrufe sind das rund
		// 80 000 Zeilen je Nacht.
		expect(leerlauf).toBeLessThan(2_500);

		await env.DB.batch([
			env.DB.prepare("UPDATE game SET igdb_id = NULL, igdb_synced_at = NULL"),
			env.DB.prepare("UPDATE release SET physical_release_status = 'unbekannt', physical_source = NULL"),
			env.DB.prepare("DELETE FROM psn_raw_response"),
			env.DB.prepare("DELETE FROM psn_sync_run"),
		]);
	});

	it("beantwortet die Exportrouten bei 430 Listen", async () => {
		for (const pfad of ["/api/export/backup.json", "/api/export/sammlung.csv", "/api/export/trophaeen.csv"]) {
			const antwort = await SELF.fetch(`${B}${pfad}`);
			expect(antwort.status, pfad).toBe(200);
		}
	});
});
