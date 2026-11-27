import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { Geheimnis } from "../src/domain/secret";
import { titelSchluessel } from "../src/domain/titel";
import { erstellePsnClient } from "../src/psn/client";
import { besitzSchritt, spielzeitSchritt } from "../src/sync/besitz";
import { fakeFetch, jsonAntwort } from "./psn-fake";

/**
 * Spielzeit und digitaler Besitz aus PSN (7.7, Stufe 18c).
 *
 * Geprueft wird vor allem, was NICHT passiert: nichts importieren, nichts
 * ueberschreiben, was der Nutzer selbst erfasst hat, und nichts loeschen
 * nach einem abgebrochenen Lauf.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const TOKEN = new Geheimnis("access-token-test");

/** PSN-Client, der eine feste Seite je Endpunkt liefert. */
function psnMit(gespielt: unknown[], gesamtGespielt: number, kaeufe: unknown[], gesamtKaeufe: number) {
	const { fetch } = fakeFetch([
		[/gamelist\/v2/, () => jsonAntwort({ totalItemCount: gesamtGespielt, titles: gespielt })],
		[
			/graphql/,
			() => jsonAntwort({ data: { purchasedTitlesRetrieve: { games: kaeufe, pageInfo: { totalCount: gesamtKaeufe } } } }),
		],
	]);
	return erstellePsnClient(fetch);
}

async function spiel(id: number, titel: string, plattformen: string[]) {
	// sort_title muss der echte Schluessel sein - der Abgleich vergleicht
	// gegen ihn, und die Normalisierung wirft Fuellwoerter weg.
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)")
		.bind(id, titel, titelSchluessel(titel))
		.run();
	for (const [i, p] of plattformen.entries()) {
		await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, ?, ?)")
			.bind(id * 10 + i, id, p)
			.run();
	}
}

const berechtigungen = async () =>
	(
		await env.DB.prepare("SELECT release_id, source, herkunft FROM digital_entitlement ORDER BY release_id, source").all()
	).results;

beforeEach(async () => {
	await env.DB.batch(
		["game_event", "digital_entitlement", "psn_played_title", "psn_purchase_open", "plan_entry", "release", "game"].map((t) =>
			env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
});

describe("spielzeitSchritt", () => {
	it("schreibt Seite und Stand zusammen oder gar nicht (Stufe 18o)", async () => {
		await env.DB.prepare("DELETE FROM psn_played_title").run();
		const psn = psnMit([{ titleId: "CUSA1", name: "Erfunden", category: "ps4_game", playDuration: "PT1H" }], 1, [], 0);
		const e = await spielzeitSchritt(repos(), psn, TOKEN, 0, {
			abschluss: () => [env.DB.prepare("INSERT INTO gibt_es_nicht VALUES (1)")],
		});
		expect(e.status).toBe("fehler");
		const z = await env.DB.prepare("SELECT COUNT(*) AS n FROM psn_played_title").first<{ n: number }>();
		expect(z?.n).toBe(0);
	});

	it("zaehlt in `geschrieben` nur die Seite, nicht den Stand (8.5)", async () => {
		await env.DB.prepare("DELETE FROM psn_played_title").run();
		const psn = psnMit([{ titleId: "CUSA1", name: "Erfunden", category: "ps4_game", playDuration: "PT1H" }], 1, [], 0);
		const e = await spielzeitSchritt(repos(), psn, TOKEN, 0, {
			abschluss: () => [repos().sync.fortschrittAnweisung("psn_test_zaehlt_nicht", "1")],
		});
		await env.DB.prepare("DELETE FROM app_setting WHERE key = 'psn_test_zaehlt_nicht'").run();
		expect(e).toMatchObject({ status: "erfolg", geschrieben: 1 });
	});

	it("schreibt den Stand auch, wenn die Seite nichts Gueltiges hat", async () => {
		const psn = psnMit([{ titleId: "CUSA2", name: "App", category: "unknown" }], 1, [], 0);
		await spielzeitSchritt(repos(), psn, TOKEN, 0, {
			abschluss: () => [repos().sync.fortschrittAnweisung("psn_test_leer", "1")],
		});
		const z = await env.DB.prepare("SELECT value FROM app_setting WHERE key = 'psn_test_leer'").first<{ value: string }>();
		await env.DB.prepare("DELETE FROM app_setting WHERE key = 'psn_test_leer'").run();
		expect(z?.value).toBe("1");
	});

	it("ordnet einen eindeutigen Treffer zu und rechnet die Dauer um", async () => {
		await spiel(1, "Bloodborne", ["PS4"]);
		const psn = psnMit(
			[
				{
					titleId: "CUSA00207_00",
					name: "Bloodborne",
					category: "ps4_game",
					playDuration: "PT12H59S",
					playCount: 5,
					firstPlayedDateTime: "2026-05-17T12:04:02Z",
					lastPlayedDateTime: "2026-09-21T20:24:19Z",
				},
			],
			1,
			[],
			0,
		);

		const e = await spielzeitSchritt(repos(), psn, TOKEN, 0);

		expect(e).toMatchObject({ status: "erfolg", geholt: 1, zugeordnet: 1, weiter: false });
		const zeile = await env.DB.prepare("SELECT * FROM psn_played_title").first<Record<string, unknown>>();
		expect(zeile).toMatchObject({
			title_id: "CUSA00207_00",
			platform: "PS4",
			play_duration_s: 12 * 3600 + 59,
			play_count: 5,
			release_id: 10,
		});
	});

	it("laesst Streaming-Apps und Unbestimmtes ganz weg", async () => {
		const psn = psnMit(
			[
				{ titleId: "A", name: "YouTube", category: "ps4_videoservice_web_app", playDuration: "PT3H" },
				{ titleId: "B", name: "Irgendwas", category: "unknown", playDuration: "PT3H" },
			],
			2,
			[],
			0,
		);

		const e = await spielzeitSchritt(repos(), psn, TOKEN, 0);

		expect(e).toMatchObject({ geholt: 2, geschrieben: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM psn_played_title").first()).toEqual({ n: 0 });
	});

	it("ordnet nichts zu, wenn die Plattform nicht passt oder zwei Spiele denselben Titel tragen", async () => {
		await spiel(1, "Killzone", ["PS3"]); // Spielzeit meldet PS4
		await spiel(2, "Doppelt", ["PS4"]);
		await spiel(3, "Doppelt", ["PS4"]);
		const psn = psnMit(
			[
				{ titleId: "A", name: "Killzone", category: "ps4_game", playDuration: "PT1H" },
				{ titleId: "B", name: "Doppelt", category: "ps4_game", playDuration: "PT1H" },
			],
			2,
			[],
			0,
		);

		const e = await spielzeitSchritt(repos(), psn, TOKEN, 0);

		// Beide werden gespeichert - nur die Zuordnung bleibt offen. Importiert
		// wird nichts (Entscheidung des Nutzers vom 21.09.2026).
		expect(e).toMatchObject({ geholt: 2, geschrieben: 2, zugeordnet: 0 });
		const { results } = await env.DB.prepare("SELECT release_id FROM psn_played_title").all();
		expect(results).toEqual([{ release_id: null }, { release_id: null }]);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM game").first()).toEqual({ n: 3 });
	});

	it("laesst eine von Hand gesetzte Zuordnung stehen", async () => {
		await spiel(1, "Bloodborne", ["PS4"]);
		await spiel(2, "Anderes", ["PS4"]);
		await env.DB.prepare(
			"INSERT INTO psn_played_title (title_id, name, platform, release_id, synced_at) VALUES ('X', 'Bloodborne', 'PS4', 20, datetime('now'))",
		).run();

		await spielzeitSchritt(repos(), psn0("X", "Bloodborne"), TOKEN, 0);

		expect(await env.DB.prepare("SELECT release_id FROM psn_played_title WHERE title_id = 'X'").first()).toEqual({
			release_id: 20,
		});
	});
});

function psn0(titleId: string, name: string) {
	return psnMit([{ titleId, name, category: "ps4_game", playDuration: "PT2H" }], 1, [], 0);
}

describe("besitzSchritt", () => {
	it("traegt Kauf und PS+ ein und merkt die Herkunft", async () => {
		await spiel(1, "Gekauft", ["PS4"]);
		await spiel(2, "Im Abo", ["PS5"]);
		const psn = psnMit([], 0, [
			{ titleId: "A", name: "Gekauft", platform: "PS4", subscriptionService: "NONE" },
			{ titleId: "B", name: "Im Abo", platform: "PS5", subscriptionService: "PS_PLUS" },
		], 2);

		const e = await besitzSchritt(repos(), psn, TOKEN, 0, []);

		expect(e).toMatchObject({ status: "erfolg", kauf: 1, plus: 1, weiter: false });
		expect(await berechtigungen()).toEqual([
			{ release_id: 10, source: "kauf", herkunft: "psn" },
			{ release_id: 20, source: "plus", herkunft: "psn" },
		]);
	});

	it("laesst Kauf vor PS+ gehen", async () => {
		await spiel(1, "Beides", ["PS4"]);
		await env.DB.prepare("INSERT INTO digital_entitlement (release_id, source, herkunft) VALUES (10, 'kauf', 'psn')").run();
		const psn = psnMit([], 0, [{ titleId: "A", name: "Beides", platform: "PS4", subscriptionService: "PS_PLUS" }], 1);

		const e = await besitzSchritt(repos(), psn, TOKEN, 0, []);

		expect(e.plus).toBe(0);
		expect(await berechtigungen()).toEqual([{ release_id: 10, source: "kauf", herkunft: "psn" }]);
	});

	it("laesst Kauf vor PS+ gehen, auch auf derselben Seite und in beiden Reihenfolgen (Stufe 18k-b)", async () => {
		await spiel(1, "Erst Abo", ["PS4"]);
		await spiel(2, "Erst Kauf", ["PS4"]);
		const psn = psnMit([], 0, [
			{ titleId: "A", name: "Erst Abo", platform: "PS4", subscriptionService: "PS_PLUS" },
			{ titleId: "A", name: "Erst Abo", platform: "PS4", subscriptionService: "NONE" },
			{ titleId: "B", name: "Erst Kauf", platform: "PS4", subscriptionService: "NONE" },
			{ titleId: "B", name: "Erst Kauf", platform: "PS4", subscriptionService: "PS_PLUS" },
		], 4);

		const e = await besitzSchritt(repos(), psn, TOKEN, 0, []);

		expect(e).toMatchObject({ kauf: 2, plus: 0 });
		expect(await berechtigungen()).toEqual([
			{ release_id: 10, source: "kauf", herkunft: "psn" },
			{ release_id: 20, source: "kauf", herkunft: "psn" },
		]);
	});

	it("schreibt je neuer Berechtigung genau ein Ereignis, auch bei doppelten Eintraegen", async () => {
		await spiel(1, "Doppelt", ["PS4"]);
		await spiel(2, "Schon da", ["PS5"]);
		await env.DB.prepare("INSERT INTO digital_entitlement (release_id, source, herkunft) VALUES (20, 'plus', 'psn')").run();
		const psn = psnMit([], 0, [
			{ titleId: "A", name: "Doppelt", platform: "PS4", subscriptionService: "NONE" },
			{ titleId: "A", name: "Doppelt", platform: "PS4", subscriptionService: "NONE" },
			{ titleId: "B", name: "Schon da", platform: "PS5", subscriptionService: "PS_PLUS" },
		], 3);

		const e = await besitzSchritt(repos(), psn, TOKEN, 0, []);

		expect(e).toMatchObject({ kauf: 1, plus: 0 });
		const { results } = await env.DB.prepare("SELECT release_id, kind, new_value FROM game_event ORDER BY id").all();
		expect(results).toEqual([{ release_id: 10, kind: "berechtigung_angelegt", new_value: "kauf" }]);
	});

	it("ordnet nur bei genau einem Release mit passender Plattform zu", async () => {
		await spiel(1, "Zweimal", ["PS4"]);
		await spiel(2, "Zweimal", ["PS4"]);
		await spiel(3, "Andere Plattform", ["PS5"]);
		const psn = psnMit([], 0, [
			{ titleId: "A", name: "Zweimal", platform: "PS4", subscriptionService: "NONE" },
			{ titleId: "C", name: "Andere Plattform", platform: "PS4", subscriptionService: "NONE" },
		], 2);

		const e = await besitzSchritt(repos(), psn, TOKEN, 0, []);

		expect(e).toMatchObject({ status: "erfolg", geholt: 2, kauf: 0, plus: 0 });
		expect(await berechtigungen()).toEqual([]);
	});

	it("fasst eine von Hand erfasste Zeile nicht an", async () => {
		await spiel(1, "Meins", ["PS4"]);
		await env.DB.prepare("INSERT INTO digital_entitlement (release_id, source, herkunft) VALUES (10, 'plus', 'nutzer')").run();
		const psn = psnMit([], 0, [{ titleId: "A", name: "Meins", platform: "PS4", subscriptionService: "PS_PLUS" }], 1);

		await besitzSchritt(repos(), psn, TOKEN, 0, []);
		// Weder ueberschrieben noch dupliziert - und beim Aufraeumen bleibt sie.
		expect(await berechtigungen()).toEqual([{ release_id: 10, source: "plus", herkunft: "nutzer" }]);
	});

	it("raeumt abgelaufene PS+-Titel weg - aber nur nach einem vollstaendigen Durchlauf", async () => {
		await spiel(1, "Noch im Katalog", ["PS4"]);
		await spiel(2, "Rausgeflogen", ["PS4"]);
		await env.DB.batch([
			env.DB.prepare("INSERT INTO digital_entitlement (release_id, source, herkunft) VALUES (10, 'plus', 'psn')"),
			env.DB.prepare("INSERT INTO digital_entitlement (release_id, source, herkunft) VALUES (20, 'plus', 'psn')"),
		]);

		// Erste Seite von zweien: noch nicht vollstaendig, also kein Loeschen.
		const teil = psnMit([], 0, [{ titleId: "A", name: "Noch im Katalog", platform: "PS4", subscriptionService: "PS_PLUS" }], 2);
		const gesehen: number[] = [];
		const e1 = await besitzSchritt(repos(), teil, TOKEN, 0, gesehen);
		expect(e1).toMatchObject({ weiter: true, entfallen: 0 });
		expect(await berechtigungen()).toHaveLength(2);

		// Letzte Seite: jetzt faellt der Titel weg, den PSN nicht mehr nennt.
		const rest = psnMit([], 0, [], 2);
		const e2 = await besitzSchritt(repos(), rest, TOKEN, 1, gesehen);
		expect(e2).toMatchObject({ weiter: false, entfallen: 1 });
		expect(await berechtigungen()).toEqual([{ release_id: 10, source: "plus", herkunft: "psn" }]);
	});

	it("loescht nach einem Fehler gar nichts", async () => {
		await spiel(1, "Egal", ["PS4"]);
		await env.DB.prepare("INSERT INTO digital_entitlement (release_id, source, herkunft) VALUES (10, 'plus', 'psn')").run();
		const kaputt = erstellePsnClient(fakeFetch([[/graphql/, () => new Response("weg", { status: 500 })]]).fetch);

		const e = await besitzSchritt(repos(), kaputt, TOKEN, 0, []);

		expect(e).toMatchObject({ status: "fehler", entfallen: 0 });
		expect(await berechtigungen()).toHaveLength(1);
	});

	it("erledigt einen Wunsch nur, wenn es das Spiel ausschliesslich digital gibt", async () => {
		await spiel(1, "Nur digital", ["PS4"]);
		await spiel(2, "Gibt es als Disc", ["PS4"]);
		await env.DB.batch([
			env.DB.prepare("UPDATE release SET physical_release_status = 'nein' WHERE id = 10"),
			env.DB.prepare("UPDATE release SET physical_release_status = 'ja' WHERE id = 20"),
			env.DB.prepare("INSERT INTO plan_entry (kind, release_id, origin, status) VALUES ('wunsch', 10, 'manuell', 'offen')"),
			env.DB.prepare("INSERT INTO plan_entry (kind, release_id, origin, status) VALUES ('wunsch', 20, 'manuell', 'offen')"),
		]);
		const psn = psnMit([], 0, [
			{ titleId: "A", name: "Nur digital", platform: "PS4", subscriptionService: "NONE" },
			{ titleId: "B", name: "Gibt es als Disc", platform: "PS4", subscriptionService: "NONE" },
		], 2);

		const e = await besitzSchritt(repos(), psn, TOKEN, 0, []);

		expect(e).toMatchObject({ kauf: 2, erledigt: 1 });
		const { results } = await env.DB.prepare("SELECT release_id, status FROM plan_entry ORDER BY release_id").all();
		// Der Wunsch am Disc-Titel bleibt offen: Er koennte der Disc gelten.
		expect(results).toEqual([
			{ release_id: 10, status: "erledigt" },
			{ release_id: 20, status: "offen" },
		]);
	});

	it("protokolliert mit Quelle sync und Anlass psn", async () => {
		await spiel(1, "Gekauft", ["PS4"]);
		const psn = psnMit([], 0, [{ titleId: "A", name: "Gekauft", platform: "PS4", subscriptionService: "NONE" }], 1);

		await besitzSchritt(repos(), psn, TOKEN, 0, []);

		const e = await env.DB.prepare("SELECT source, kind, new_value, detail FROM game_event").first();
		expect(e).toEqual({ source: "sync", kind: "berechtigung_angelegt", new_value: "kauf", detail: "psn" });
	});
});

/**
 * Kaeufe ohne Spiel in der Sammlung (Stufe 18t, 7.7). Nachgebaute Eintraege,
 * keine echten: Kennungen und Titel sind erfunden.
 */
describe("besitzSchritt: offene Kaeufe (Stufe 18t)", () => {
	const kauf = (eid: string, name: string, extra: Record<string, unknown> = {}) => ({
		titleId: `CUSA${eid}`,
		name,
		platform: "PS5",
		subscriptionService: "NONE",
		entitlementId: `EP0000-PPSA${eid}_00-ERFUNDEN`,
		productId: `EP0000-PPSA${eid}_00-ERFUNDEN`,
		...extra,
	});
	const offene = async () =>
		(
			await env.DB.prepare(
				"SELECT entitlement_id, platform, title_name, product_id, concept_id, title_id, first_seen_at, last_seen_at " +
					"FROM psn_purchase_open ORDER BY entitlement_id",
			).all()
		).results;

	it("merkt einen Kauf ohne Release, und erneutes Sehen haelt first_seen_at", async () => {
		const psn = psnMit([], 0, [kauf("1", "Erfundenes Neues", { conceptId: 10001 })], 1);

		const e = await besitzSchritt(repos(), psn, TOKEN, 0, [], { jetzt: "2026-11-20 01:00:00" });
		expect(e).toMatchObject({ status: "erfolg", kauf: 0, gemerkt: 1, mitKonzept: 1 });
		await besitzSchritt(repos(), psn, TOKEN, 0, [], { jetzt: "2026-11-27 01:00:00" });

		expect(await offene()).toEqual([
			{
				entitlement_id: "EP0000-PPSA1_00-ERFUNDEN",
				platform: "PS5",
				title_name: "Erfundenes Neues",
				product_id: "EP0000-PPSA1_00-ERFUNDEN",
				// Sony liefert die Zahl mal als Zahl, mal als Text - gespeichert als Text.
				concept_id: "10001",
				title_id: "CUSA1",
				first_seen_at: "2026-11-20 01:00:00",
				last_seen_at: "2026-11-27 01:00:00",
			},
		]);
		// Kein Ereignis: Es aendert sich keine Bewertung und kein Besitz (8.5).
		expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM game_event").first<{ n: number }>())?.n).toBe(0);
	});

	it("loescht einen gemerkten Kauf, sobald er einen Treffer hat", async () => {
		const psn = psnMit([], 0, [kauf("1", "Spaeter Gesammelt")], 1);
		await besitzSchritt(repos(), psn, TOKEN, 0, [], { jetzt: "2026-11-20 01:00:00" });
		expect(await offene()).toHaveLength(1);

		// Jetzt kennt die Sammlung das Spiel: Die Berechtigung entsteht, der
		// offene Kauf geht - im selben Batch.
		await spiel(1, "Spaeter Gesammelt", ["PS5"]);
		const e = await besitzSchritt(repos(), psn, TOKEN, 0, [], { jetzt: "2026-11-27 01:00:00" });

		expect(e).toMatchObject({ kauf: 1, gemerkt: 0 });
		expect(await offene()).toEqual([]);
		expect(await berechtigungen()).toEqual([{ release_id: 10, source: "kauf", herkunft: "psn" }]);
	});

	it("merkt nie einen PS+-Titel, nie ohne Berechtigungs-Id und nie eine fremde Plattform", async () => {
		const psn = psnMit([], 0, [
			kauf("1", "Im Abo", { subscriptionService: "PS_PLUS" }),
			kauf("2", "Ohne Kennung", { entitlementId: undefined }),
			kauf("3", "Anderswo", { platform: "PC" }),
			kauf("4", "Doppelt"),
			kauf("4", "Doppelt"),
			// Zwei Releases mit demselben Titel: kein eindeutiger Treffer, also gemerkt.
			kauf("5", "Zweimal da"),
		], 6);
		await spiel(5, "Zweimal da", ["PS5"]);
		await spiel(6, "Zweimal da", ["PS5"]);

		const e = await besitzSchritt(repos(), psn, TOKEN, 0, [], { jetzt: "2026-11-27 01:00:00" });

		expect(e).toMatchObject({ status: "erfolg", gemerkt: 2, mitKonzept: 0 });
		expect((await offene()).map((z) => z.title_name)).toEqual(["Doppelt", "Zweimal da"]);
	});

	it("raeumt am Ende eines vollstaendigen Laufs auf, was seit Laufbeginn nicht mehr kam", async () => {
		const alt = psnMit([], 0, [kauf("1", "Erstattet"), kauf("2", "Bleibt")], 2);
		await besitzSchritt(repos(), alt, TOKEN, 0, [], { jetzt: "2026-11-20 01:00:00", begonnen: "2026-11-20 01:00:00" });

		// Zwei Seiten: Die erste raeumt nicht auf, auch wenn "Erstattet" fehlt.
		const seite1 = psnMit([], 0, [kauf("2", "Bleibt")], 2);
		const e1 = await besitzSchritt(repos(), seite1, TOKEN, 0, [], { jetzt: "2026-11-27 01:00:00", begonnen: "2026-11-27 01:00:00" });
		expect(e1.weiter).toBe(true);
		expect(await offene()).toHaveLength(2);

		const seite2 = psnMit([], 0, [kauf("3", "Neu dazu")], 2);
		await besitzSchritt(repos(), seite2, TOKEN, 1, [], { jetzt: "2026-11-27 01:05:00", begonnen: "2026-11-27 01:00:00" });
		expect((await offene()).map((z) => z.title_name)).toEqual(["Bleibt", "Neu dazu"]);
	});

	it("raeumt ohne Laufbeginn und nach einer vorzeitig leeren Seite nichts auf", async () => {
		const alt = psnMit([], 0, [kauf("1", "Alt")], 1);
		await besitzSchritt(repos(), alt, TOKEN, 0, [], { jetzt: "2026-11-20 01:00:00" });

		// Ohne Laufbeginn (ein Lauf von vor 18t): keine Grenze, nichts geloescht.
		const ohne = psnMit([], 0, [kauf("2", "Anderes")], 1);
		await besitzSchritt(repos(), ohne, TOKEN, 0, [], { jetzt: "2026-11-27 01:00:00" });
		expect(await offene()).toHaveLength(2);

		// Sony nennt 40, liefert aber eine leere Seite: kein vollstaendiger Lauf.
		const leer = psnMit([], 0, [], 40);
		await besitzSchritt(repos(), leer, TOKEN, 0, [], { jetzt: "2026-11-27 02:00:00", begonnen: "2026-11-27 02:00:00" });
		expect(await offene()).toHaveLength(2);
	});

	it("schreibt bei einem Fehler im Batch weder Berechtigung noch offenen Kauf", async () => {
		await spiel(1, "Gekauft", ["PS4"]);
		const psn = psnMit([], 0, [
			{ titleId: "A", name: "Gekauft", platform: "PS4", subscriptionService: "NONE", entitlementId: "E-A" },
			kauf("2", "Ohne Spiel"),
		], 2);
		// Eine Plattform, die die Tabelle ablehnt, kann der Schritt nicht
		// liefern (er filtert) - also scheitert hier die Tabelle selbst.
		await env.DB.prepare("ALTER TABLE psn_purchase_open RENAME TO psn_purchase_open_weg").run();
		try {
			const e = await besitzSchritt(repos(), psn, TOKEN, 0, [], { jetzt: "2026-11-27 01:00:00" });
			expect(e.status).toBe("fehler");
		} finally {
			await env.DB.prepare("ALTER TABLE psn_purchase_open_weg RENAME TO psn_purchase_open").run();
		}
		expect(await berechtigungen()).toEqual([]);
		expect(await offene()).toEqual([]);
	});
});
