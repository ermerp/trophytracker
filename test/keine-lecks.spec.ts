import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createApp } from "../src/index";
import { createRepositories } from "../src/db";
import { Geheimnis } from "../src/domain/secret";
import { erstelleIgdbClient } from "../src/igdb/client";
import { erstellePsnClient } from "../src/psn/client";
import { spielRoh } from "./igdb-fake";
import { TOKEN_ANTWORT, fakeFetch, jsonAntwort, redirectAntwort, trophySeite } from "./psn-fake";

/**
 * Dichtheitspruefung.
 *
 * Weder NPSSO noch Refresh- oder Access Token noch IGDB-Client-Secret oder
 * Twitch-Token duerfen jemals in einer API-Antwort oder im Log auftauchen -
 * auch nicht gekuerzt. Der Test faehrt jede Route an, auch in den
 * Fehlerfaellen, und sucht in allen Ausgaben nach Markierungswerten.
 */

const MARKIERUNGEN = {
	npsso: "MARKIERUNG-NPSSO-7f3a91",
	refresh: "MARKIERUNG-REFRESH-2b8c04",
	access: "MARKIERUNG-ACCESS-e51d67",
	igdbSecret: "MARKIERUNG-IGDBSECRET-9c1d22",
	twitchToken: "MARKIERUNG-TWITCH-4e7a08",
};

const ALLE = Object.values(MARKIERUNGEN);

/** Prueft auch auf Teilzeichenketten ab acht Zeichen. */
function istDicht(text: string): { dicht: boolean; fund?: string } {
	for (const wert of ALLE) {
		if (text.includes(wert)) return { dicht: false, fund: wert };
		for (let laenge = wert.length; laenge >= 8; laenge--) {
			if (text.includes(wert.slice(0, laenge))) {
				return { dicht: false, fund: wert.slice(0, laenge) };
			}
		}
	}
	return { dicht: true };
}

const markiertesToken = {
	...TOKEN_ANTWORT,
	access_token: MARKIERUNGEN.access,
	refresh_token: MARKIERUNGEN.refresh,
};

function psnMarkiert() {
	return erstellePsnClient(
		fakeFetch([
			[/oauth\/authorize/, () => redirectAntwort("v3.code-markierung")],
			[/oauth\/token/, () => jsonAntwort(markiertesToken)],
			[/trophyTitles/, () => new Response(trophySeite(0, 5))],
		]).fetch,
	);
}

const IGDB_ZUGANG = { clientId: "igdb-client-id", clientSecret: new Geheimnis(MARKIERUNGEN.igdbSecret) };

/** IGDB-Client mit markiertem Token, Erfolgspfad. */
function igdbMarkiert() {
	return erstelleIgdbClient(
		IGDB_ZUGANG,
		fakeFetch([
			[/id\.twitch\.tv/, () => jsonAntwort({ access_token: MARKIERUNGEN.twitchToken, expires_in: 5000000 })],
			[/api\.igdb\.com/, () => jsonAntwort([spielRoh()])],
		]).fetch,
		async () => {},
	);
}

/** IGDB-Client, bei dem Twitch und IGDB die Markierungen im Fehlertext zurueckwerfen. */
function igdbKaputt(status: number) {
	return erstelleIgdbClient(
		IGDB_ZUGANG,
		fakeFetch([
			[/id\.twitch\.tv/, () => jsonAntwort({ message: `abgelehnt ${MARKIERUNGEN.igdbSecret}` }, 403)],
			[/api\.igdb\.com/, () => new Response(`Fehler ${MARKIERUNGEN.twitchToken}`, { status })],
		]).fetch,
		async () => {},
	);
}

/** IGDB-Client, bei dem Twitch das Token liefert, IGDB aber scheitert. */
function igdbAbrufKaputt(status: number) {
	return erstelleIgdbClient(
		IGDB_ZUGANG,
		fakeFetch([
			[/id\.twitch\.tv/, () => jsonAntwort({ access_token: MARKIERUNGEN.twitchToken, expires_in: 5000000 })],
			[/api\.igdb\.com/, () => new Response(`Fehler ${MARKIERUNGEN.twitchToken}`, { status })],
		]).fetch,
		async () => {},
	);
}

const IGDB_ROUTEN = (app: ReturnType<typeof createApp>) => [
	ruf(app, "/api/igdb/search?q=bloodborne"),
	ruf(app, "/api/igdb/status"),
	ruf(app, "/api/igdb/offen"),
	ruf(app, "/api/igdb/abgleich", { method: "POST" }),
	ruf(app, "/api/igdb/auffrischen", { method: "POST" }),
	ruf(app, "/api/unmatched/spiel/1/link", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ igdbId: 1001 }),
	}),
	ruf(app, "/api/unmatched/spiel/1/link", { method: "DELETE" }),
	ruf(app, "/api/plans", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ art: "wunsch", igdbId: 1001 }),
	}),
	ruf(app, "/api/unmatched/spiel/1/ablehnen", { method: "POST" }),
	ruf(app, "/api/unmatched/spiel/1/suchen", { method: "POST" }),
	// Stufe 11: Import und Nachpflege. Lauf 1 / Zeile 1 entstehen im beforeEach.
	ruf(app, "/api/unmatched?abgelehnte=1"),
	ruf(app, "/api/unmatched/plan_wunsch/1/link", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ igdbId: 1001 }),
	}),
	ruf(app, "/api/imports/wishlist"),
	ruf(app, "/api/imports/wishlist/1"),
	ruf(app, "/api/imports/wishlist/1?gruppe=unklar"),
	ruf(app, "/api/imports/wishlist/1/abgleich", { method: "POST" }),
	ruf(app, "/api/imports/wishlist/1/uebernehmen", { method: "POST" }),
	ruf(app, "/api/imports/wishlist/1/zeilen/1/entscheiden", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ aktion: "igdb", igdbId: 1001 }),
	}),
];

/** PSN-Client, der ueberall scheitert - fuer die Fehlerpfade. */
function psnKaputt() {
	return erstellePsnClient(
		fakeFetch([
			[/oauth\/authorize/, () => new Response(null, { status: 403 })],
			[/oauth\/token/, () => jsonAntwort({ error: "invalid_grant" }, 400)],
			[/trophyTitles/, () => new Response(null, { status: 500 })],
		]).fetch,
	);
}

let ausgabe: string[] = [];

beforeEach(async () => {
	ausgabe = [];
	for (const stufe of ["log", "info", "warn", "error", "debug"] as const) {
		vi.spyOn(console, stufe).mockImplementation((...args: unknown[]) => {
			ausgabe.push(args.map((a) => String(a)).join(" "));
		});
	}
	await env.DB.batch([
		env.DB.prepare("DELETE FROM psn_raw_response"),
		env.DB.prepare("DELETE FROM psn_sync_run"),
		env.DB.prepare("DELETE FROM psn_credentials"),
		env.DB.prepare("DELETE FROM igdb_candidate"),
		env.DB.prepare("DELETE FROM wishlist_import"),
		env.DB.prepare("DELETE FROM plan_entry"),
		env.DB.prepare("DELETE FROM game"),
		env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (1, 'Bloodborne', 'bloodborne')"),
		env.DB.prepare("INSERT INTO plan_entry (id, kind, title_raw, origin) VALUES (1, 'wunsch', 'Nur Text', 'manuell')"),
		env.DB.prepare("INSERT INTO wishlist_import (id, form) VALUES (1, 'einfach')"),
		env.DB.prepare("INSERT INTO wishlist_import_line (id, import_id, position, title, originals) VALUES (1, 1, 1, 'Bloodborne', '[\"Bloodborne\"]')"),
	]);
});

afterEach(() => vi.restoreAllMocks());

/** Ruft eine Route auf und gibt den Antworttext zurueck. */
async function ruf(
	app: ReturnType<typeof createApp>,
	pfad: string,
	init?: RequestInit,
): Promise<string> {
	const antwort = await app.request(pfad, init, env);
	return antwort.text();
}

describe("Dichtheitsprüfung", () => {
	it("erkennt eine Markierung ueberhaupt - Gegenprobe", () => {
		expect(istDicht(`etwas ${MARKIERUNGEN.npsso} hier`).dicht).toBe(false);
		expect(istDicht(`Anfang ${MARKIERUNGEN.refresh.slice(0, 10)} Rest`).dicht).toBe(false);
		expect(istDicht("voellig harmloser Text").dicht).toBe(true);
	});

	it("gibt auf keiner Route ein Geheimnis heraus - Erfolgspfad", async () => {
		const igdb = igdbMarkiert();
		const app = createApp(psnMarkiert, () => igdb);

		const antworten = [
			await ruf(app, "/api/settings/npsso", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ npsso: MARKIERUNGEN.npsso }),
			}),
			await ruf(app, "/api/sync", { method: "POST" }),
			await ruf(app, "/api/sync/status"),
			await ruf(app, "/api/settings/weights"),
			await ruf(app, "/api/health"),
			await ruf(app, "/api/games?owned=physisch&search=x"),
			await ruf(app, "/api/games/1"),
			await ruf(app, "/api/physical-copies"),
			await ruf(app, "/api/physical-copies", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ releaseId: 1, zustand: "gut" }),
			}),
			await ruf(app, "/api/digital-entitlements", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ releaseId: 1, quelle: "kauf" }),
			}),
			await ruf(app, "/api/releases/1", { method: "DELETE" }),
			await ruf(app, "/api/releases/1/play-status", {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ status: "am_spielen" }),
			}),
			await ruf(app, "/api/plans?kind=wunsch&status=alle"),
			await ruf(app, "/api/plans", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ art: "wunsch", titel: "Arbeitstitel" }),
			}),
			await ruf(app, "/api/plans/1", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ favorit: true }),
			}),
			await ruf(app, "/api/plans/1", { method: "DELETE" }),
			await ruf(app, "/api/deviations"),
			await ruf(app, "/api/review/queue"),
			await ruf(app, "/api/review/progress"),
			await ruf(app, "/api/review/1/decide", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ aktion: "unveraendert" }),
			}),
			await ruf(app, "/api/export/backup.json"),
			await ruf(app, "/api/export/sammlung.csv"),
			await ruf(app, "/api/export/trophaeen.csv"),
			await ruf(app, "/api/backup/status"),
			await ruf(app, "/api/backup/vermerk", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ zeitpunkt: "2026-09-14T03:17:00Z", commit: "abc1234" }),
			}),
			...(await Promise.all(IGDB_ROUTEN(app))),
		];

		for (const text of antworten) {
			expect(istDicht(text), `Leck in: ${text.slice(0, 200)}`).toMatchObject({ dicht: true });
		}
	});

	it("gibt auf keiner IGDB-Route ein Geheimnis heraus - Fehlerpfade", async () => {
		for (const igdb of [igdbKaputt(500), igdbAbrufKaputt(500), igdbAbrufKaputt(429), igdbAbrufKaputt(401)]) {
			const app = createApp(psnKaputt, () => igdb);
			for (const text of await Promise.all(IGDB_ROUTEN(app))) {
				expect(istDicht(text), `Leck in: ${text.slice(0, 200)}`).toMatchObject({ dicht: true });
			}
		}
		expect(istDicht(ausgabe.join("\n"))).toMatchObject({ dicht: true });
	});

	it("gibt auf keiner Route ein Geheimnis heraus - Fehlerpfade", async () => {
		// Erst gueltig hinterlegen, dann alles scheitern lassen
		await createRepositories(env.DB, env.NPSSO_KEY).credentials.npssoSpeichern(
			new Geheimnis(MARKIERUNGEN.npsso),
		);
		const app = createApp(psnKaputt);

		const antworten = [
			await ruf(app, "/api/settings/npsso", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ npsso: MARKIERUNGEN.npsso }),
			}),
			await ruf(app, "/api/sync", { method: "POST" }),
			await ruf(app, "/api/sync/status"),
			await ruf(app, "/api/settings/npsso", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "kaputt",
			}),
			await ruf(app, "/api/export/backup.json"),
			await ruf(app, "/api/export/quatsch.csv"),
			await ruf(app, "/api/backup/vermerk", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "kaputt",
			}),
		];

		for (const text of antworten) {
			expect(istDicht(text), `Leck in: ${text.slice(0, 200)}`).toMatchObject({ dicht: true });
		}
	});

	it("protokolliert kein Geheimnis", async () => {
		const app = createApp(psnMarkiert);
		await ruf(app, "/api/settings/npsso", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ npsso: MARKIERUNGEN.npsso }),
		});
		await ruf(app, "/api/sync", { method: "POST" });

		const kaputt = createApp(psnKaputt);
		await ruf(kaputt, "/api/sync", { method: "POST" });

		expect(istDicht(ausgabe.join("\n"))).toMatchObject({ dicht: true });
	});

	/**
	 * Inhaltlich dasselbe wie `wrangler d1 export`, nur ohne Wrangler: jede
	 * Tabelle der Datenbank vollstaendig gelesen und serialisiert. Was hier
	 * nicht auftaucht, steht auch im Dump nicht - und der Dump landet ab
	 * Stufe 8 woechentlich im privaten Backup-Repo (Abschnitt 14.2).
	 *
	 * Bewusst ueber sqlite_master statt ueber eine Liste: Eine Tabelle, die
	 * eine kuenftige Migration anlegt, ist damit automatisch mitgeprueft.
	 */
	it("legt in KEINER Tabelle der Datenbank Klartext ab", async () => {
		const igdb = igdbMarkiert();
		const app = createApp(psnMarkiert, () => igdb);
		await ruf(app, "/api/settings/npsso", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ npsso: MARKIERUNGEN.npsso }),
		});
		await ruf(app, "/api/sync", { method: "POST" });
		await ruf(app, "/api/igdb/abgleich", { method: "POST" });

		const { results: tabellen } = await env.DB.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' " +
				"AND name NOT LIKE '_cf_%' ORDER BY name",
		).all<{ name: string }>();
		expect(tabellen.length).toBeGreaterThan(10);

		for (const { name } of tabellen) {
			const { results } = await env.DB.prepare(`SELECT * FROM ${name}`).all();
			expect(istDicht(JSON.stringify(results)), `Leck in Tabelle ${name}`).toMatchObject({
				dicht: true,
			});
		}
	});

	it("gibt in backup.json kein Geheimnis heraus", async () => {
		const app = createApp(psnMarkiert);
		await ruf(app, "/api/settings/npsso", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ npsso: MARKIERUNGEN.npsso }),
		});
		await ruf(app, "/api/sync", { method: "POST" });

		const sicherung = await ruf(app, "/api/export/backup.json");
		expect(istDicht(sicherung)).toMatchObject({ dicht: true });
		// Gegenprobe: Die Chiffrate sind gar nicht erst dabei.
		expect(sicherung).not.toContain("npsso_ciphertext");
		expect(sicherung).not.toContain("psn_raw_response");
	});

	it("speichert ein ungueltiges NPSSO nicht", async () => {
		const repos = createRepositories(env.DB, env.NPSSO_KEY);
		await repos.credentials.npssoSpeichern(new Geheimnis("bestehender-wert"));

		const app = createApp(psnKaputt);
		const antwort = await app.request(
			"/api/settings/npsso",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ npsso: MARKIERUNGEN.npsso }),
			},
			env,
		);

		expect(antwort.status).toBe(400);
		expect((await repos.credentials.npsso())?.offenlegen()).toBe("bestehender-wert");
	});
});
