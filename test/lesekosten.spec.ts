import { env, SELF } from "cloudflare:test";
import { PLAN_AUSWAHL } from "../src/db/plan";
import { describe, it, expect, beforeAll } from "vitest";
import { EREIGNIS_AUSWAHL } from "../src/db/events";
import { EXPORT_ORDNUNG, EXPORT_TABELLEN } from "../src/db/export";
import {
	LETZTES_PLATIN_SQL,
	LISTEN_SQL,
	PLATTFORM_SQL,
	SPIELE_SQL,
	STATUS_SQL,
	TROPHAEEN_SQL,
} from "../src/db/stats";

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
		// Die umgekehrte Richtung (Stufe 20e): Nur DESC wird zu ASC, das
		// `IS NULL` bleibt vorn. Gemessen, weil ein geaenderter ORDER BY den
		// Abfrageplan kippen kann - genau das war am 13.09.2026 der Fall, als
		// "zuletzt gespielt" 741 000 Zeilen las.
		const umgekehrt = await zeilenGelesen(
			`SELECT g.id, g.title, ${spielzeit} AS spielzeit_s FROM game g
			 ORDER BY ${spielzeit} IS NULL, ${spielzeit} ASC, g.sort_title LIMIT 20 OFFSET 0`,
		);
		const titelAb = await zeilenGelesen(
			"SELECT g.id, g.title FROM game g ORDER BY g.sort_title DESC LIMIT 20 OFFSET 0",
		);
		console.info({ sortierungSpielzeit: gelesen, umgekehrt, titelAb });

		// Zwei Index-Lookups je Ergebniszeile (idx_played_release), keine
		// Tabellenscans - dieselbe Groessenordnung wie "zuletzt gespielt".
		expect(gelesen).toBeLessThan(6_000);
		expect(umgekehrt).toBeLessThan(6_000);
		// Absteigend nach Titel laeuft rueckwaerts ueber denselben Index.
		expect(titelAb).toBeLessThan(500);

		await env.DB.prepare("DELETE FROM psn_played_title").run();
	});

	it("misst den Titelabgleich der Sync-Schritte (Nachbesserung zu 18c)", async () => {
		// Diese eine Abfrage sucht das Release zu einem PSN-Titel
		// (GamesRepository.releasesNachSchluessel). Sie ist fuer sich winzig und
		// deshalb hier lange gar nicht gemessen worden - sie laeuft aber in einer
		// Schleife: 303-mal je Nacht im Spielzeit-Schritt und 730-mal je
		// woechentlichem Kaufliste-Durchlauf (7.7). Ohne Index war sie ein
		// Tabellenscan ueber game, gemessen 480 Zeilen je Aufruf gegen die
		// Produktion - also rund 145 000 Zeilen je Nacht und 350 000 je
		// Kaufliste. Migration 0025 legt idx_game_sort_title an.
		//
		// Die Lehre steckt in der Zeile darunter: Dieser Test hat bis zum
		// 28.09.2026 nur Leseansichten gemessen. Ein Schreibschritt, der je
		// Eintrag eine Abfrage macht, gehoert genauso hierher.
		const treffer = await zeilenGelesen(
			"SELECT r.id, r.platform FROM release r JOIN game g ON g.id = r.game_id WHERE g.sort_title = ?",
			"spiel 0215",
		);
		const danebenObwohlVorhanden = await zeilenGelesen(
			"SELECT r.id, r.platform FROM release r JOIN game g ON g.id = r.game_id WHERE g.sort_title = ?",
			"gibt es nicht",
		);
		console.info({ titelabgleich: treffer, titelabgleichOhneTreffer: danebenObwohlVorhanden });

		// Ein Index-Lookup plus die Releases des Treffers. Der Schwellwert ist
		// bewusst klein: Bei 430 Spielen waere ein Scan sofort dreistellig, und
		// genau das soll hier nie wieder unbemerkt passieren.
		expect(treffer).toBeLessThan(10);
		expect(danebenObwohlVorhanden).toBeLessThan(10);
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
			EXPORT_TABELLEN.map((t) => env.DB.prepare(`SELECT * FROM ${t} ORDER BY ${EXPORT_ORDNUNG[t] ?? "rowid"}`)),
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

	/**
	 * Gebrauchtpreise und Disc-Nachweis aus eBay (Stufe 20).
	 *
	 * Gemessen wird die ROUTE, nicht nur die Abfrage: `/api/gaps` macht genau
	 * eine (gaps.liste), und die traegt jetzt zwei zusaetzliche korrelierte
	 * Unterabfragen je Zeile. Dazu der SCHREIBSCHRITT - bis zum 28.09.2026
	 * mass diese Datei nur Leseansichten, und ein Sync-Schritt mit einer
	 * Abfrage je Eintrag lief acht Tage ungemessen.
	 */
	it("misst Preisspalte, Auswahl und Schreibpfad der Marktdaten (Stufe 20)", async () => {
		await env.DB.prepare("DELETE FROM plan_entry").run();
		await env.DB.prepare("DELETE FROM market_offer").run();
		await env.DB.batch([
			env.DB.prepare("UPDATE release SET physical_release_status = 'ja', physical_source = 'igdb' WHERE id % 2 = 0"),
			env.DB.prepare("UPDATE release SET markt_geprueft_am = NULL, markt_rohangebote = NULL"),
		]);
		// Zwei Zeilen je Release fuer vier Fuenftel des Bestands - so sieht es
		// nach einem vollen Durchlauf aus.
		const angebot = env.DB.prepare(
			"INSERT INTO market_offer (source, source_product_id, anbieter, kanal, title_raw, platform_raw, " +
				"condition, price_cents, currency, in_stock, imported_at, release_id) " +
				"VALUES ('ebay', ?, ?, ?, ?, 'PS4', 'Gut', ?, 'EUR', 1, datetime('now'), ?)",
		);
		const zeilen: D1PreparedStatement[] = [];
		for (let i = 1; i <= Math.floor(ANZAHL * 0.8); i++) {
			zeilen.push(angebot.bind(`haendler:${i}`, "rebuy", "haendler", `Spiel ${i}`, 1200 + i, i));
			zeilen.push(angebot.bind(`markt:${i}`, "eBay", "markt", `Spiel ${i}`, 900 + i, i));
		}
		await env.DB.batch(zeilen);

		const luecken = await zeilenGelesen(
			`SELECT l.game_id, l.title, l.cover_url, l.release_id, l.platform, l.disc_fassung, l.disc_quelle,
			        l.progress_pct, l.hat_platin, l.eigener_status, l.verworfen, l.bester_gebrauchtpreis_cents,
			        l.gebrauchtpreis_anbieter, l.markt_geprueft_am, l.markt_rohangebote,
			        (SELECT pe.id FROM plan_entry pe WHERE pe.release_id = l.release_id
			           AND pe.kind = 'kauf' AND pe.status = 'verworfen' ORDER BY pe.id LIMIT 1) AS plan_id
			 FROM v_luecken l ORDER BY l.title, l.platform`,
		);
		// Die Auswahl des Schritts. Erste Fassung las ueber v_luecken 3 424
		// Zeilen fuer zehn Releases - die View rechnete die Preis-Unterabfragen
		// fuer alle 430 Zeilen aus, nur um Ids zu liefern. Jetzt ueber
		// idx_release_markt mit Abbruch nach LIMIT.
		const auswahl = await zeilenGelesen(
			"SELECT r.id, r.game_id, g.title, r.platform, r.physical_release_status " +
				"FROM release r JOIN game g ON g.id = r.game_id " +
				"WHERE (r.markt_geprueft_am IS NULL OR r.markt_geprueft_am < datetime('now', '-14 days')) " +
				"AND ((r.physical_release_status IN ('ja', 'unbekannt') " +
				"AND EXISTS (SELECT 1 FROM trophy_progress t WHERE t.release_id = r.id AND t.progress_pct > 0) " +
				"AND NOT EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id)) " +
				"OR EXISTS (SELECT 1 FROM plan_entry pe WHERE pe.release_id = r.id AND pe.status = 'offen')) " +
				"ORDER BY r.markt_geprueft_am, r.id LIMIT 10",
		);
		// Der Schreibpfad eines Releases: UPSERT je Kanal, Verlauf nur bei
		// Aenderung, Protokoll und Stempel - alles in einem Batch.
		const schreiben = await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO market_offer (source, source_product_id, anbieter, kanal, title_raw, platform_raw, condition, " +
					"price_cents, currency, in_stock, imported_at, release_id) " +
					"VALUES ('ebay', 'markt:1', 'eBay', 'markt', 'Spiel 1', 'PS4', 'Gut', 777, 'EUR', 1, datetime('now'), 1) " +
					"ON CONFLICT (source, source_product_id) DO UPDATE SET price_cents = excluded.price_cents",
			),
			env.DB.prepare(
				"INSERT INTO price_snapshot (release_id, channel, source, condition, price_cents, currency, captured_at) " +
					"SELECT 1, 'gebraucht', 'ebay', 'Gut', 777, 'EUR', datetime('now') WHERE NOT EXISTS " +
					"(SELECT 1 FROM price_snapshot p WHERE p.release_id = 1 AND p.channel = 'gebraucht' AND p.price_cents = 777 " +
					"AND p.captured_at = (SELECT MAX(q.captured_at) FROM price_snapshot q WHERE q.release_id = 1 AND q.channel = 'gebraucht'))",
			),
			env.DB.prepare("UPDATE release SET markt_geprueft_am = datetime('now'), markt_rohangebote = 7 WHERE id = 1"),
		]);
		const schreibkosten = schreiben.reduce((n, r) => n + (r.meta.rows_read ?? 0), 0);

		// Der GANZE Aufruf, nicht nur seine Hauptabfrage: Der Schritt liest
		// ausserdem die Sammlung (einmal, fuer den Titelabgleich) und am Ende
		// seinen Stand. Genau das war der Fehler vom 01.10.2026 - gemessen
		// wurde die Abfrage, gezahlt hat die Route.
		const sammlung = await zeilenGelesen("SELECT id AS spielId, title AS titel FROM game");
		// Der Schritt fragt nur noch den einen Zaehler, den die Verlaufszeile
		// braucht. Die vier Zaehler von `stand()` kosteten 1 549 Zeilen - drei
		// Viertel eines ganzen Aufrufs fuer eine Anzeigezahl.
		const stand = await zeilenGelesen("SELECT COUNT(*) AS n FROM release WHERE markt_geprueft_am IS NULL");
		const standVoll = await zeilenGelesen(
			"SELECT (SELECT COUNT(*) FROM market_offer WHERE source = 'ebay' AND in_stock = 1) AS mitPreis, " +
				"(SELECT COUNT(*) FROM release WHERE markt_geprueft_am IS NOT NULL) AS geprueft, " +
				"(SELECT COUNT(*) FROM release WHERE markt_rohangebote = 0) AS ohneAngebot, " +
				"(SELECT COUNT(*) FROM release WHERE markt_geprueft_am IS NULL) AS offen",
		);
		// Die Absichten tragen seit Stufe 20e denselben Preis-Join. Gemessen
		// wird er HIER, mit gefuellter market_offer - im Stufe-15-Block ist die
		// Tabelle leer, und die Joins kosteten dort nichts.
		const kauf = env.DB.prepare(
			"INSERT INTO plan_entry (kind, release_id, origin, status) VALUES ('kauf', ?, 'luecke', 'offen')",
		);
		await env.DB.batch(Array.from({ length: 60 }, (_, i) => kauf.bind(i + 1)));
		const absichtenMitPreis = await zeilenGelesen(`${PLAN_AUSWAHL}WHERE pe.kind = ? AND pe.status = ?`, "kauf", "offen");
		await env.DB.prepare("DELETE FROM plan_entry").run();

		const jeAufruf = auswahl + sammlung + schreibkosten * 10 + stand;
		console.info({ luecken, auswahl, sammlung, stand, standVoll, schreibkosten, jeAufruf, absichtenMitPreis });

		// Vor Stufe 20 las dieselbe Abfrage 2 620 Zeilen mit leerer
		// market_offer; mit den beiden LEFT JOINs sind es dort 2 194 und mit
		// 688 Angebotszeilen 3 497. Eine Fassung mit korrelierten
		// Unterabfragen kam auf 5 712 - deshalb die Joins.
		expect(luecken).toBeLessThan(4_500);
		expect(auswahl).toBeLessThan(200);
		// Zehn Releases je Aufruf, also das Zehnfache - und das bleibt weit
		// unter dem, was eine Nacht vertraegt.
		expect(schreibkosten).toBeLessThan(200);
		// Ein ganzer Cron-Aufruf des Schritts. Im Dauerbetrieb sind nach der
		// 14-Tage-Frist rund drei Aufrufe je Nacht faellig.
		expect(jeAufruf).toBeLessThan(1_000);
		// Die Einstellungen duerfen die vier Zaehler haben - sie werden selten geoeffnet.
		expect(standVoll).toBeLessThan(3_000);
		// 60 offene Kaufeintraege mit Preis-Join. Zwei Index-Lookups je Zeile
		// ueber idx_market_offer_kanal, dieselbe Form wie in v_luecken.
		expect(absichtenMitPreis).toBeLessThan(1_500);

		await env.DB.batch([
			env.DB.prepare("DELETE FROM price_snapshot"),
			env.DB.prepare("DELETE FROM market_offer"),
			env.DB.prepare("UPDATE release SET physical_release_status = 'unbekannt', physical_source = NULL, markt_geprueft_am = NULL, markt_rohangebote = NULL"),
		]);
	});

	it("misst Auswahl, Schreibpfad und Preisspalte der Store-Preise (Stufe 21)", async () => {
		// Gemessen wird die ROUTE, nicht die Abfrage: alles, was ein Aufruf
		// tut, auch den Zaehler fuer die Verlaufszeile (die Lehre vom
		// 01.10.2026, als der Feed mit 183 Zeilen in der Messung stand und
		// 18 500 las).
		await env.DB.batch([
			env.DB.prepare("DELETE FROM plan_entry"),
			env.DB.prepare("DELETE FROM digital_entitlement"),
			env.DB.prepare("UPDATE release SET store_geprueft_am = NULL, psn_product_id = NULL"),
		]);
		// So sieht der Zuschnitt aus: rund 90 offene Absichten, ein Teil davon
		// schon dauerhaft gekauft und deshalb ausgenommen.
		const wunsch = env.DB.prepare(
			"INSERT INTO plan_entry (kind, release_id, origin, status) VALUES ('wunsch', ?, 'manuell', 'offen')",
		);
		const gekauft = env.DB.prepare("INSERT INTO digital_entitlement (release_id, source, herkunft) VALUES (?, 'kauf', 'psn')");
		const vorbereitung: D1PreparedStatement[] = [];
		for (let i = 1; i <= 90; i++) vorbereitung.push(wunsch.bind(i));
		for (let i = 1; i <= 20; i++) vorbereitung.push(gekauft.bind(i));
		await env.DB.batch(vorbereitung);

		const auswahl = await zeilenGelesen(
			"WITH ziele(id) AS (SELECT pe.release_id FROM plan_entry pe WHERE pe.status = 'offen' AND pe.release_id IS NOT NULL " +
				"UNION SELECT id FROM release WHERE physical_release_status = 'nein') " +
				"SELECT r.id AS releaseId, r.game_id AS gameId, g.igdb_id AS igdbId, g.title AS titel, r.platform AS plattform, " +
				"g.store_concept_id AS conceptId, g.store_concept_am AS conceptAm, r.psn_product_id AS produktId " +
				"FROM ziele z JOIN release r ON r.id = z.id JOIN game g ON g.id = r.game_id " +
				"WHERE (r.store_geprueft_am IS NULL OR r.store_geprueft_am < datetime('now', '-1 days')) " +
				"AND NOT EXISTS (SELECT 1 FROM digital_entitlement d WHERE d.release_id = r.id AND d.source = 'kauf') " +
				"ORDER BY r.store_geprueft_am, r.id LIMIT 10",
		);

		// Der Schreibpfad eines Releases: Protokollzeile, Preis, Verlauf.
		const protokoll = await zeilenGelesen(
			"SELECT 'sync', r.game_id, r.id, g.title, 'release_geaendert', 'psn_product_id', r.psn_product_id, ?, 'store' " +
				"FROM release r JOIN game g ON g.id = r.game_id " +
				"WHERE r.id = ? AND (r.psn_product_id IS NULL OR r.psn_product_id <> ?)",
			"EP9000-X",
			21,
			"EP9000-X",
		);
		const verlaufsschreiben = await zeilenGelesen(
			"SELECT ?, 'psn_store', 'psn', ?, 0, 'EUR', datetime('now') " +
				"WHERE NOT EXISTS (SELECT 1 FROM price_snapshot p WHERE p.release_id = ? AND p.channel = 'psn_store' " +
				"AND p.price_cents = ? AND p.captured_at = " +
				"(SELECT MAX(q.captured_at) FROM price_snapshot q WHERE q.release_id = ? AND q.channel = 'psn_store'))",
			21,
			1999,
			21,
			1999,
			21,
		);
		const offen = await zeilenGelesen(
			"SELECT COUNT(*) AS n FROM release WHERE store_geprueft_am IS NULL AND psn_product_id IS NOT NULL",
		);
		// Die Nachpflegeliste haengt an der Glocke und wird damit bei JEDEM
		// Oeffnen des Dashboards geholt (Stufe 21d) - sie gehoert deshalb
		// gemessen, nicht nur der Nachtschritt. Ein Tabellenscan ueber
		// `release`; ein eigener Index dafuer lohnt bei 430 Zeilen nicht,
		// aber die Zahl soll sichtbar bleiben.
		const nachpflege = await zeilenGelesen(
			"SELECT r.id, g.title, r.platform FROM release r JOIN game g ON g.id = r.game_id " +
				"WHERE r.store_befund = 'ohne_id' ORDER BY g.title, r.platform",
		);
		const standVoll = await zeilenGelesen(
			"SELECT SUM(store_price_cents IS NOT NULL) AS mitPreis, SUM(store_is_sale = 1) AS imAngebot, " +
				"SUM(store_plus = 1) AS imPlusKatalog, SUM(store_geprueft_am IS NOT NULL) AS geprueft, " +
				"SUM(store_befund = 'ohne_id') AS ohneId FROM release",
		);

		// Die Listen tragen den Store-Preis als weitere Spalten aus `release r`,
		// das in PLAN_AUSWAHL schon LEFT JOINed ist - also keine zusaetzliche
		// gelesene Zeile. Der Test haelt genau das fest.
		const absichten = await zeilenGelesen(`${PLAN_AUSWAHL}WHERE pe.kind = ? AND pe.status = ?`, "wunsch", "offen");

		const jeAufruf = auswahl + (protokoll + verlaufsschreiben) * 10 + offen;
		console.info({ auswahl, protokoll, verlaufsschreiben, offen, nachpflege, standVoll, jeAufruf, absichten });

		// Die Zielmenge kommt aus plan_entry und dem Teilindex (0032), nicht
		// aus einem Scan ueber release - gemessen 341 statt 431 mit `IN`.
		expect(auswahl).toBeLessThan(400);
		// Je Release zwei Index-Lookups - nichts, was mit dem Bestand waechst.
		expect(protokoll).toBeLessThan(20);
		expect(verlaufsschreiben).toBeLessThan(20);
		// Ein ganzer Aufruf des Schritts mit zehn Releases. Im Dauerbetrieb
		// sind das bei 79 Releases im Zuschnitt rund acht Aufrufe je Nacht.
		expect(jeAufruf).toBeLessThan(1_500);
		// Die Einstellungen duerfen die fuenf Zaehler haben - ein Tabellenscan
		// ueber release, selten geoeffnet.
		expect(standVoll).toBeLessThan(1_000);
		// Beim Oeffnen des Dashboards, also oft - daher die eigene Grenze.
		expect(nachpflege).toBeLessThan(1_000);
		expect(absichten).toBeLessThan(2_000);

		await env.DB.batch([
			env.DB.prepare("DELETE FROM plan_entry"),
			env.DB.prepare("DELETE FROM digital_entitlement"),
			env.DB.prepare("DELETE FROM price_snapshot"),
			env.DB.prepare("UPDATE release SET store_geprueft_am = NULL, psn_product_id = NULL"),
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

	/**
	 * Stufe 19a: das Dashboard. Es ist die erste Seite nach jedem Start der
	 * App und laeuft bei jedem Aufruf - teurer als eine Listenseite darf es
	 * deshalb nicht sein. Gemessen wird die SQL aus src/db/stats.ts selbst,
	 * damit Test und Repository nicht auseinanderlaufen.
	 */
	it("misst die Kennzahlen des Dashboards (Stufe 19a)", async () => {
		// Besitz und Listeneintraege, damit die Zaehler nicht auf 0 messen:
		// jedes dritte Release eine Disc, jedes siebte ein Download, dazu ein
		// Wunsch auf einem Release ohne alles (das faellt aus der Sammlung).
		const anweisungen: D1PreparedStatement[] = [];
		const disc = env.DB.prepare("INSERT INTO physical_copy (release_id, condition) VALUES (?, 'gut')");
		const dl = env.DB.prepare("INSERT INTO digital_entitlement (release_id, source) VALUES (?, 'kauf')");
		for (let i = 1; i <= ANZAHL; i += 3) anweisungen.push(disc.bind(i));
		for (let i = 2; i <= ANZAHL; i += 7) anweisungen.push(dl.bind(i));
		for (let i = 0; i < anweisungen.length; i += 200) await env.DB.batch(anweisungen.slice(i, i + 200));
		await env.DB.batch([
			env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (9001, 'Wunschspiel', 'wunschspiel')"),
			env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (9001, 9001, 'PS5')"),
			env.DB.prepare("INSERT INTO plan_entry (kind, release_id, status, origin) VALUES ('wunsch', 9001, 'offen', 'manuell')"),
			env.DB.prepare("INSERT INTO plan_entry (kind, release_id, status, origin) VALUES ('backlog', 1, 'offen', 'manuell')"),
			env.DB.prepare("INSERT INTO plan_entry (kind, release_id, status, origin, position) VALUES ('todo', 2, 'offen', 'manuell', 1)"),
		]);

		const plattform = await zeilenGelesen(PLATTFORM_SQL);
		const status = await zeilenGelesen(STATUS_SQL);
		const trophaeen = await zeilenGelesen(TROPHAEEN_SQL);
		const listen = await zeilenGelesen(LISTEN_SQL);
		const spiele = await zeilenGelesen(SPIELE_SQL);
		const letztesPlatin = await zeilenGelesen(LETZTES_PLATIN_SQL);
		const summe = plattform + status + trophaeen + listen + spiele + letztesPlatin;
		console.info({ plattform, status, trophaeen, listen, spiele, letztesPlatin, summe });

		// Groessenordnung: Die Plattformabfrage laeuft einmal ueber release und
		// macht je Zeile fuenf Index-Lookups (Migration 0008); die uebrigen
		// lesen eine Tabelle einmal. Nichts davon skaliert quadratisch - das
		// waere der Fehler vom 13.09.2026. Zum Vergleich: ein Leerlauf-Aufruf
		// des Crons liegt bei 2 241, und den gibt es 36-mal je Nacht.
		expect(plattform).toBeLessThan(12 * ANZAHL);
		expect(status).toBeLessThan(6 * ANZAHL);
		expect(trophaeen).toBeLessThan(ANZAHL + 100);
		expect(listen).toBeLessThan(500);
		expect(letztesPlatin).toBeLessThan(2 * ANZAHL);
		expect(summe).toBeLessThan(25 * ANZAHL);

		const antwort = await SELF.fetch(`${B}/api/stats`);
		expect(antwort.status).toBe(200);
		const d = (await antwort.json()) as any;
		// 430 Releases rotieren ueber vier Plattformen; das Wunschrelease
		// zaehlt nicht mit, obwohl es in der Tabelle steht.
		expect(d.releases).toBe(ANZAHL);
		expect(d.plattformen.reduce((s: number, p: any) => s + p.releases, 0)).toBe(ANZAHL);
		// Jede fuenfte Liste traegt ein erspieltes Platin, alle kennen eines.
		expect(d.trophaeen.platinErspielt).toBe(Math.floor(ANZAHL / 5));
		expect(d.trophaeen.platinMoeglich).toBe(ANZAHL);
		expect(d.listen).toEqual({ backlog: 1, todo: 1 });

		await env.DB.batch([
			env.DB.prepare("DELETE FROM physical_copy"),
			env.DB.prepare("DELETE FROM digital_entitlement"),
			env.DB.prepare("DELETE FROM plan_entry"),
			env.DB.prepare("DELETE FROM release WHERE id = 9001"),
			env.DB.prepare("DELETE FROM game WHERE id = 9001"),
		]);
	});

	/**
	 * Einzeltrophaeen (Stufe 19b). Gemessen wird BEIDES - die Leseansicht und
	 * der Schreibschritt. Bis zum 28.09.2026 mass diese Datei ausschliesslich
	 * Leseansichten, und ein Sync-Schritt mit einer Abfrage je Eintrag lief
	 * deshalb acht Tage lang ungemessen (Abschnitt 2).
	 */
	it("misst die Trophaeen eines Spiels und die Auswahl des Fuellschritts (Stufe 19b)", async () => {
		// Ein Bestand in Produktionsgroesse: 430 Listen mit je 43 Trophaeen
		// sind rund 18 500 Zeilen - die Sammlung des Nutzers hat 18 355.
		const listen = (
			await env.DB.prepare("SELECT np_communication_id FROM trophy_progress ORDER BY np_communication_id").all<{
				np_communication_id: string;
			}>()
		).results;

		// Die Zeitpunkte ueber dreizehn Jahre verteilt, nicht alle auf heute:
		// Der Nutzer sammelt seit 2012, und das Zeitfenster des Feeds soll
		// einen kleinen Ausschnitt treffen und nicht den ganzen Bestand -
		// sonst misst dieser Test eine Lage, die es nie gibt.
		const tagVor = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
		for (let i = 0; i < listen.length; i += 10) {
			await env.DB.batch(
				listen.slice(i, i + 10).flatMap((l, j) =>
					Array.from({ length: 43 }, (_, n) =>
						env.DB.prepare(
							"INSERT INTO trophy (np_communication_id, trophy_id, grade, name, earned, earned_at, earned_rate) " +
								"VALUES (?, ?, 'bronze', 'Trophäe', ?, ?, 12.5)",
						).bind(l.np_communication_id, n, n % 2, n % 2 ? tagVor(((i + j) * 43 + n) % 4_800) : null),
					),
				),
			);
		}

		// Die Trophaeen EINES Spiels. Der Primaerschluessel beginnt mit der
		// Listen-Id, das ist ein Bereich statt eines Scans ueber alle 18 000.
		const spiel = await env.DB.prepare("SELECT game_id FROM release WHERE game_id IS NOT NULL LIMIT 1").first<{
			game_id: number;
		}>();
		const jeSpiel = await zeilenGelesen(
			"SELECT t.trophy_id, t.grade, t.name, t.earned, t.earned_at, t.earned_rate FROM trophy t " +
				"JOIN trophy_progress tp ON tp.np_communication_id = t.np_communication_id " +
				"JOIN release r ON r.id = tp.release_id WHERE r.game_id = ? ORDER BY t.np_communication_id, t.trophy_id",
			spiel?.game_id ?? 0,
		);

		// Die Auswahl des Fuellschritts laeuft in JEDEM Aufruf des
		// PSN-Fensters, auch wenn nichts offen ist.
		const summe =
			"(earned_bronze + earned_silver + earned_gold + earned_platinum + " +
			"defined_bronze + defined_silver + defined_gold + defined_platinum)";
		const auswahlSql =
			"SELECT np_communication_id, np_service_name FROM trophy_progress " +
			`WHERE trophies_synced_at IS NULL OR trophies_synced_sum <> ${summe} ` +
			"ORDER BY np_communication_id LIMIT 1";
		const auswahlOffen = await zeilenGelesen(auswahlSql);

		// Und derselbe Fall im DAUERBETRIEB: Ist nichts offen, muss die
		// Abfrage alle Listen ansehen, um das festzustellen - und genau diese
		// Lage laeuft 36-mal je Nacht, waehrend die obere nur waehrend der
		// Erstbefuellung auftritt. Nur den guenstigen Fall zu messen waere
		// derselbe Fehler wie "nur den Leerlauf zaehlen" (10.1).
		await env.DB.prepare(`UPDATE trophy_progress SET trophies_synced_at = datetime('now'), trophies_synced_sum = ${summe}`).run();
		const auswahlLeer = await zeilenGelesen(auswahlSql);

		// Der Feed liest die erspielten Trophaeen eines Zeitfensters. Ohne den
		// Teilindex aus Migration 0027 waere das ein Scan ueber alles - und
		// der Feed ist die erste Seite nach jedem Start der App (8.5).
		const feed = await zeilenGelesen(
			"SELECT t.np_communication_id, date(t.earned_at) AS tag, COUNT(*) AS n FROM trophy t " +
				"WHERE t.earned = 1 AND t.earned_at >= datetime('now', '-30 days') " +
				"GROUP BY t.np_communication_id, tag ORDER BY MAX(t.earned_at) DESC LIMIT 8",
		);

		// Die Jahre laufen bei JEDEM Aufruf des Dashboards mit (Stufe 19b) -
		// das ist die erste Seite nach jedem Start der App.
		const jahre = await zeilenGelesen(
			"SELECT strftime('%Y', earned_at) AS jahr, COUNT(*) AS anzahl FROM trophy " +
				"WHERE earned = 1 AND earned_at IS NOT NULL GROUP BY jahr ORDER BY jahr",
		);
		const jahreIndex = await zeilenGelesen(
			"SELECT strftime('%Y', earned_at) AS jahr, COUNT(*) AS anzahl FROM trophy INDEXED BY idx_trophy_erspielt " +
				"WHERE earned = 1 AND earned_at IS NOT NULL GROUP BY jahr ORDER BY jahr",
		);

		// Das LAUFENDE Jahr allein - die einzige Zahl, die sich noch aendert.
		// Vergangene Jahre stehen seit der Nachbesserung vom 01.10.2026 im
		// Zwischenspeicher, und nur diese Abfrage laeuft beim Dashboard mit.
		const jahrLaufend = await zeilenGelesen(
			"SELECT COUNT(*) AS n FROM trophy WHERE earned = 1 AND earned_at >= ? AND earned_at < ?",
			"2026-01-01",
			"2027-01-01",
		);

		/*
		 * Die GANZE Feed-Route, nicht nur ihre Abfrage.
		 *
		 * Am 01.10.2026 war genau das der Fehler: Gemessen war die
		 * Feed-Abfrage (183 Zeilen), die Route machte aber noch eine zweite -
		 * "ist die Erstbefuellung durch?" - und die las mit `COUNT(*) FROM
		 * trophy` den ganzen Bestand mit. Bei jedem Oeffnen des Dashboards.
		 * Auf der Uhr standen 4,16 von 5 Mio. gelesenen Zeilen.
		 */
		const feedStand = await zeilenGelesen(
			"SELECT COUNT(*) AS gesamt, " +
				`SUM(trophies_synced_at IS NULL OR trophies_synced_sum <> ${summe}) AS offen ` +
				"FROM trophy_progress",
		);
		const feedRoute = feed + feedStand;

		console.info({ jeSpiel, auswahlOffen, auswahlLeer, feed, feedRoute, jahre, jahreIndex, jahrLaufend });

		// Je Spiel die Groessenordnung einer Liste, nicht der Tabelle.
		expect(jeSpiel).toBeLessThan(300);
		// Die Auswahl liest trophy_progress, nicht trophy - im Dauerbetrieb
		// einmal die Listentabelle, 36-mal je Nacht also rund 15 000 Zeilen.
		expect(auswahlOffen).toBeLessThan(50);
		expect(auswahlLeer).toBeLessThan(listen.length + 50);
		expect(auswahlLeer * 36).toBeLessThan(20_000);
		// Der Feed bleibt im Fenster statt im Bestand - und die Route auch:
		// Sie darf den Bestand nicht ein zweites Mal durchzaehlen.
		expect(feed).toBeLessThan(2_000);
		expect(feedRoute).toBeLessThan(2_000);
		/*
		 * Die Jahre muessen jede erspielte Trophaee ansehen - das ist der Zweck
		 * der Zahl, und ein Indexhinweis aendert daran nichts (beides gemessen
		 * am 01.10.2026: 18 060 so wie so). Genau deshalb haengen sie an einer
		 * EIGENEN Route und werden erst beim Aufklappen geholt: Im Batch des
		 * Dashboards waeren sie die teuerste Abfrage der ersten Seite nach
		 * jedem Start (die uebrigen zusammen lesen 6 840).
		 */
		expect(jahre).toBeGreaterThan(listen.length * 20);
		expect(jahreIndex).toBe(jahre);
		// Das laufende Jahr bleibt dagegen ein Bereich, kein Lauf ueber alles.
		expect(jahrLaufend).toBeLessThan(jahre / 4);
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
		// Der Aufraeumschritt (Stufe 18d) laeuft in jedem Leerlauf der Wartung
		// mit. Als SELECT gemessen, weil zeilenGelesen kein DELETE ausfuehren
		// soll - dieselbe Bedingung, derselbe Plan. Die zweite Haelfte der
		// Bedingung kam mit Stufe 18e dazu (die Waisen gescheiterter Laeufe).
		const aufraeumen = await zeilenGelesen(
			`SELECT id FROM psn_raw_response WHERE sync_run_id NOT IN
			 (SELECT sync_run_id FROM psn_raw_response GROUP BY sync_run_id ORDER BY sync_run_id DESC LIMIT 3)
			 AND (normalized_at IS NOT NULL OR sync_run_id IN (SELECT id FROM psn_sync_run WHERE status = 'fehler'))`,
		);

		// Seit Stufe 21 laeuft im PSN-Fenster als achter Schritt die Auswahl
		// der Store-Preise mit - auch im Leerlauf, weil sie erst ihre eigene
		// Abfrage braucht, um "nichts zu tun" festzustellen. Genau hier sass
		// der Befund aus 21b: Mit `EXISTS(...) OR physical_release_status =
		// 'nein'` las sie **430** Zeilen, weil die zweite Haelfte keinen
		// Index hatte - 36-mal je Nacht. Mit der CTE und dem Teilindex aus
		// Migration 0032 sind es vier.
		const storeAuswahl = await zeilenGelesen(
			"WITH ziele(id) AS (SELECT pe.release_id FROM plan_entry pe WHERE pe.status = 'offen' AND pe.release_id IS NOT NULL " +
				"UNION SELECT id FROM release WHERE physical_release_status = 'nein') " +
				"SELECT r.id FROM ziele z JOIN release r ON r.id = z.id JOIN game g ON g.id = r.game_id " +
				"WHERE (r.store_geprueft_am IS NULL OR r.store_geprueft_am < datetime('now', '-1 days')) " +
				"AND NOT EXISTS (SELECT 1 FROM digital_entitlement d WHERE d.release_id = r.id AND d.source = 'kauf') " +
				"ORDER BY r.store_geprueft_am, r.id LIMIT 10",
		);

		// Seit Stufe 18e sind es zwei Fenster, und jedes liest nur seine
		// eigenen Abfragen: das PSN-Fenster 36-mal je Nacht, die Wartung
		// 24-mal.
		const leerlaufPsn = haenger + laufend + heutige + storeAuswahl;
		const leerlaufWartung = erschienen + auffrischen + disc + aufraeumen;
		const nacht = leerlaufPsn * 36 + leerlaufWartung * 24;
		console.info({ erschienen, haenger, laufend, heutige, storeAuswahl, auffrischen, disc, aufraeumen, leerlaufPsn, leerlaufWartung, nacht });

		// Gemessen bis Stufe 18d: 2 241 Zeilen in einem Aufruf, der alles tat -
		// game zweimal (erschienen, auffrischen), game mit release je Spiel fuer
		// die Disc-Auswahl (1 289), psn_sync_run dreimal (5 Zeilen) und der
		// Aufraeumschritt mit 76 Zeilen ueber die 25 Rohantworten. Die
		// Aufteilung in 18e nimmt dem PSN-Fenster die drei teuren Abfragen: Es
		// liest nur noch psn_sync_run. Beide Haelften zusammen bleiben weit
		// unter dem Tagesbudget von fuenf Millionen.
		expect(leerlaufPsn).toBeLessThan(100);
		expect(leerlaufWartung).toBeLessThan(2_500);
		expect(nacht).toBeLessThan(100_000);

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
