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
		["game_event", "digital_entitlement", "psn_played_title", "plan_entry", "release", "game"].map((t) =>
			env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
});

describe("spielzeitSchritt", () => {
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
