import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { createApp } from "../src/index";
import { erstellePsnClient } from "../src/psn/client";
import { eindeutigerTreffer } from "../src/domain/igdb";
import { igdbAbgleichSchritt, igdbAuffrischSchritt, kandidatenSuchen } from "../src/sync/igdb";
import { fakeIgdb, spielRoh } from "./igdb-fake";
import { fakeFetch } from "./psn-fake";

/**
 * IGDB-Abgleich, Pruefansicht und manuelle Verknuepfung (Abschnitt 7.6)
 * gegen die lokale D1. Der IGDB-Client ist nachgebaut; nichts geht ins Netz.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const psnStumm = () => erstellePsnClient(fakeFetch([]).fetch);

function app(igdb: ReturnType<typeof fakeIgdb>["client"]) {
	return createApp(psnStumm, () => igdb);
}

async function spiel(id: number, titel: string, sortTitle: string, plattformen: string[]) {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)").bind(id, titel, sortTitle).run();
	for (const p of plattformen) {
		await env.DB.prepare("INSERT INTO release (game_id, platform) VALUES (?, ?)").bind(id, p).run();
	}
}

const zeile = (id: number) => env.DB.prepare("SELECT * FROM game WHERE id = ?").bind(id).first<Record<string, unknown>>();
const kandidaten = async (id: number) =>
	(await env.DB.prepare("SELECT igdb_id, name, position FROM igdb_candidate WHERE game_id = ? ORDER BY position").bind(id).all()).results;

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM igdb_candidate"),
		env.DB.prepare("DELETE FROM trophy_progress"),
		env.DB.prepare("DELETE FROM release"),
		env.DB.prepare("DELETE FROM game"),
	]);
});

describe("POST /api/games mit igdbId (Stufe 17, Rueckmeldung vom 18.09.2026)", () => {
	const anlegen = (client: ReturnType<typeof fakeIgdb>["client"], koerper: unknown) =>
		app(client).request(
			"/api/games",
			{ method: "POST", body: JSON.stringify(koerper), headers: { "content-type": "application/json" } },
			env,
		);

	it("legt das Spiel aus dem Treffer an und verknuepft es in einem Zug", async () => {
		const { client } = fakeIgdb([[spielRoh()]]);
		const antwort = await anlegen(client, { igdbId: 1001, plattform: "PS4" });
		expect(antwort.status).toBe(201);
		const ergebnis = (await antwort.json()) as any;
		expect(ergebnis).toMatchObject({ titel: "Bloodborne", igdbVerknuepft: true });

		// Titel, Cover und Wertung kommen aus IGDB - kein zweiter Schritt noetig.
		const g = await zeile(ergebnis.spielId);
		expect(g).toMatchObject({ title: "Bloodborne", igdb_id: 1001, igdb_matched_source: "manuell" });
		expect(g?.cover_url).toBeTruthy();
		// Das Release der gewaehlten Plattform haengt daran.
		const r = await env.DB.prepare("SELECT platform FROM release WHERE game_id = ?").bind(ergebnis.spielId).first();
		expect(r).toEqual({ platform: "PS4" });
	});

	it("nimmt ein vorhandenes Spiel mit derselben IGDB-Id statt ein zweites anzulegen", async () => {
		await spiel(7, "Bloodborne", "bloodborne", ["PS4"]);
		await env.DB.prepare("UPDATE game SET igdb_id = 1001 WHERE id = 7").run();
		const { client, aufrufe } = fakeIgdb([[spielRoh()]]);

		const antwort = await anlegen(client, { igdbId: 1001, plattform: "PS5" });
		expect(antwort.status).toBe(200);
		expect(await antwort.json()).toMatchObject({ spielId: 7, titel: "Bloodborne", vorhanden: true });
		// Ohne IGDB-Anfrage, und das PS5-Release entsteht am vorhandenen Spiel.
		expect(aufrufe.length).toBe(0);
		const r = await env.DB.prepare("SELECT platform FROM release WHERE game_id = 7 ORDER BY platform").all();
		expect(r.results.map((x: any) => x.platform)).toEqual(["PS4", "PS5"]);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM game").first()).toEqual({ n: 1 });
	});

	it("warnt bei gleichem Titelschluessel und legt mit trotzdem an", async () => {
		await spiel(7, "Bloodborne", "bloodborne", ["PS4"]);
		const { client } = fakeIgdb([[spielRoh()], [spielRoh()]]);

		const antwort = await anlegen(client, { igdbId: 1001, plattform: "PS5" });
		expect(antwort.status).toBe(409);
		expect((await antwort.json()) as any).toMatchObject({ kandidaten: [{ spielId: 7, titel: "Bloodborne" }] });

		expect((await anlegen(client, { igdbId: 1001, plattform: "PS5", trotzdem: true })).status).toBe(201);
	});

	it("meldet einen unbekannten Eintrag und prueft die Eingaben", async () => {
		const { client } = fakeIgdb([[]]);
		expect((await anlegen(client, { igdbId: 999999, plattform: "PS4" })).status).toBe(404);
		expect((await anlegen(client, { igdbId: 0, plattform: "PS4" })).status).toBe(400);
		expect((await anlegen(client, { igdbId: 1001, plattform: "PC" })).status).toBe(400);
		expect((await anlegen(client, { plattform: "PS4" })).status).toBe(400);
	});

	it("laesst einen Eintrag ohne PlayStation-Plattform nicht durch (7.6)", async () => {
		const { client } = fakeIgdb([[spielRoh({ platforms: [6] })]]);
		expect((await anlegen(client, { igdbId: 1001, plattform: "PS4" })).status).toBe(404);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM game").first()).toEqual({ n: 0 });
	});
});

describe("igdbAbgleichSchritt", () => {
	it("verknuepft einen eindeutigen Treffer automatisch und uebernimmt die Metadaten", async () => {
		await spiel(1, "Bloodborne", "bloodborne", ["PS4"]);
		const { client, aufrufe } = fakeIgdb([[spielRoh(), spielRoh({ id: 1002, name: "Bloodborne: The Old Hunters", game_type: 2 })]]);

		const e = await igdbAbgleichSchritt(repos(), client);
		expect(e).toMatchObject({ status: "erfolg", geprueft: 1, verknuepft: 1, vorgeschlagen: 0, ohneTreffer: 0, nochOffen: 0, weiter: false });
		expect(String(aufrufe.at(-1)?.init?.body)).toContain('search "Bloodborne"');

		const g = await zeile(1);
		expect(g).toMatchObject({
			igdb_id: 1001,
			igdb_slug: "bloodborne",
			igdb_matched_source: "automatisch",
			cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/abc123.jpg",
			release_date: "2015-03-24",
			release_status: "erschienen",
			critic_score: 91,
			critic_score_count: 18,
			critic_source: "igdb",
		});
		expect(g?.igdb_checked_at).not.toBeNull();
		expect(g?.igdb_synced_at).not.toBeNull();
		expect(await kandidaten(1)).toEqual([]);
	});

	it("legt bei Mehrdeutigkeit Kandidaten ab und stempelt die Suche", async () => {
		await spiel(1, "MediEvil", "medievil", ["PS4"]);
		const { client } = fakeIgdb([[
			spielRoh({ id: 1, name: "MediEvil", game_type: 8 }),
			spielRoh({ id: 2, name: "MediEvil", game_type: 11 }),
			spielRoh({ id: 3, name: "MediEvil II", game_type: 11 }),
		]]);

		const e = await igdbAbgleichSchritt(repos(), client);
		expect(e).toMatchObject({ geprueft: 1, verknuepft: 0, vorgeschlagen: 1, ohneTreffer: 0 });

		const g = await zeile(1);
		expect(g?.igdb_id).toBeNull();
		expect(g?.igdb_checked_at).not.toBeNull();
		expect(await kandidaten(1)).toEqual([
			{ igdb_id: 1, name: "MediEvil", position: 0 },
			{ igdb_id: 2, name: "MediEvil", position: 1 },
			{ igdb_id: 3, name: "MediEvil II", position: 2 },
		]);
	});

	it("vergleicht ueber den bereinigten Titel, nicht ueber den gespeicherten sort_title", async () => {
		// sort_title veraltet (alte Normalisierung), Jahr aus der Umbenennung, angeklebte Ziffer.
		await spiel(1, "God of War (2018)", "god of war 2018", ["PS4"]);
		await spiel(2, "Velocity2X", "velocity2x", ["PS4"]);
		const { client, aufrufe } = fakeIgdb([
			[spielRoh({ id: 1, name: "God of War", platforms: [48, 167] }), spielRoh({ id: 2, name: "God of War", platforms: [9, 46], game_type: 9 })],
			[spielRoh({ id: 3, name: "Velocity 2X", platforms: [48, 46] })],
		]);
		expect(await igdbAbgleichSchritt(repos(), client)).toMatchObject({ verknuepft: 2 });
		expect((await zeile(1))?.igdb_id).toBe(1);
		expect((await zeile(2))?.igdb_id).toBe(3);
		const bodies = aufrufe.filter((a) => a.url.includes("api.igdb.com")).map((a) => String(a.init?.body));
		expect(bodies[0]).toContain('search "God of War"');
		expect(bodies[1]).toContain('search "Velocity 2X"');
	});

	it("zaehlt ein leeres Ergebnis als 'ohne Treffer' und sucht nicht erneut", async () => {
		await spiel(1, "Wake-up Club", "wake up club", ["PSVITA"]);
		const { client, aufrufe } = fakeIgdb([[]]);
		expect(await igdbAbgleichSchritt(repos(), client)).toMatchObject({ ohneTreffer: 1, nochOffen: 0 });
		expect(await igdbAbgleichSchritt(repos(), client)).toMatchObject({ geprueft: 0 });
		// Suche, gekuerzt ohne Plattform, Teilstring - mehr Rueckfaelle gibt es ohne Abweichung im Rohtitel nicht.
		expect(aufrufe.filter((a) => a.url.includes("api.igdb.com"))).toHaveLength(3);
	});

	it("sortiert gespeicherte Kandidaten: Hauptspiel vor DLC, passende Plattform zuerst, hoechstens zehn", async () => {
		await spiel(1, "Batman: Arkham Knight", "batman arkham knight", ["PS4"]);
		const dlc = Array.from({ length: 12 }, (_, i) => spielRoh({ id: 100 + i, name: `Batman: Arkham Knight - Skin ${i}`, game_type: 13 }));
		const haupt = spielRoh({ id: 7, name: "Batman: Arkham Knight", game_type: 0, platforms: [48] });
		// Zwei Hauptspiele gleichen Namens auf derselben Plattform: mehrdeutig, kein Automatismus.
		const haupt2 = spielRoh({ id: 8, name: "Batman: Arkham Knight", game_type: 0, platforms: [48] });
		const { client } = fakeIgdb([[...dlc, haupt2, haupt]]);
		expect(await igdbAbgleichSchritt(repos(), client)).toMatchObject({ vorgeschlagen: 1 });
		const k = (await kandidaten(1)) as Array<{ igdb_id: number }>;
		expect(k).toHaveLength(10);
		expect(k.slice(0, 2).map((x) => x.igdb_id)).toEqual([8, 7]);
	});

	it("arbeitet in Schritten und meldet 'weiter'", async () => {
		for (let i = 1; i <= 3; i++) await spiel(i, `Spiel ${i}`, `spiel ${i}`, ["PS5"]);
		const { client } = fakeIgdb([[]]);
		expect(await igdbAbgleichSchritt(repos(), client, 2)).toMatchObject({ status: "laufend", geprueft: 2, nochOffen: 1, weiter: true });
		expect(await igdbAbgleichSchritt(repos(), client, 2)).toMatchObject({ status: "erfolg", geprueft: 1, nochOffen: 0, weiter: false });
	});

	it("bricht beim Ratenlimit sauber ab - Erledigtes bleibt, der Rest wartet", async () => {
		await spiel(1, "Eins", "eins", ["PS5"]);
		await spiel(2, "Zwei", "zwei", ["PS5"]);
		const { client } = fakeIgdb([[spielRoh({ name: "Eins" })], new Response("", { status: 429 })]);
		const e = await igdbAbgleichSchritt(repos(), client, 5);
		expect(e).toMatchObject({ status: "laufend", geprueft: 1, nochOffen: 1, weiter: true });
		expect(e.meldung).toContain("Ratenlimit");
	});

	it("meldet andere Fehler ohne Fremdtext", async () => {
		await spiel(1, "Eins", "eins", ["PS5"]);
		const { client } = fakeIgdb([new Response("interner Kram GEHEIM", { status: 500 })]);
		const e = await igdbAbgleichSchritt(repos(), client);
		expect(e).toMatchObject({ status: "fehler", weiter: false, meldung: "Der IGDB-Abruf ist fehlgeschlagen." });
	});
});

describe("kandidatenSuchen: Rueckfaelle", () => {
	it("nimmt das erste nicht-leere Ergebnis und zaehlt die Wege", async () => {
		const leer: never[] = [];
		const k = fakeIgdb([leer, [spielRoh({ name: "CastleStorm" })]]);
		expect((await kandidatenSuchen(k.client, "CastleStorm - Complete Edition")).weg).toBe("kurz");
		const bodies = k.aufrufe.filter((a) => a.url.includes("api.igdb.com")).map((a) => String(a.init?.body));
		expect(bodies[0]).toContain('search "CastleStorm - Complete Edition"');
		expect(bodies[1]).toContain('search "CastleStorm"');
		// Auch der Rueckfall filtert auf PlayStation (16.09.2026).
		expect(bodies[1]).toContain("where platforms");

		const t = fakeIgdb([leer, leer, [spielRoh({ name: "That's You!" })]]);
		expect((await kandidatenSuchen(t.client, "That's You!")).weg).toBe("teilstring");
		expect(String(t.aufrufe.at(-1)?.init?.body)).toContain(`name ~ *"That's You!"*`);

		// "OlliOlli2" schreibt IGDB ohne Leerzeichen: erst der Rohtitel findet es.
		const o = fakeIgdb([leer, leer, leer, [spielRoh({ name: "OlliOlli2: Welcome to Olliwood" })]]);
		expect((await kandidatenSuchen(o.client, "OlliOlli2: Welcome to Olliwood")).weg).toBe("teilstring_roh");
		expect(String(o.aufrufe.at(-1)?.init?.body)).toContain(`name ~ *"OlliOlli2"*`);

		expect((await kandidatenSuchen(fakeIgdb([leer]).client, "Nichts")).weg).toBe("keiner");
	});

	it("fragt exakt nach dem Namen, wenn kein Treffer den Schluessel trifft, und mischt ihn vorn ein", async () => {
		const ff = [spielRoh({ id: 1, name: "Final Fantasy XIV Online" }), spielRoh({ id: 2, name: "Final Fantasy VII Rebirth", game_type: 8 })];
		const f = fakeIgdb([ff, [spielRoh({ id: 3, name: "The Finals", platforms: [48, 167] }), spielRoh({ id: 1, name: "Final Fantasy XIV Online" })]]);
		const e = await kandidatenSuchen(f.client, "THE FINALS");
		expect(e.weg).toBe("suche+exakt");
		expect(e.kandidaten.map((k) => k.igdbId)).toEqual([3, 1, 2]);
		expect(String(f.aufrufe.at(-1)?.init?.body)).toContain('name ~ "THE FINALS"');
		expect(eindeutigerTreffer("the finals", ["PS5"], e.kandidaten)?.igdbId).toBe(3);

		// Trifft schon die Suche den Schluessel, gibt es keine zweite Anfrage.
		const g = fakeIgdb([[spielRoh({ id: 9, name: "Bloodborne" })]]);
		expect((await kandidatenSuchen(g.client, "Bloodborne")).weg).toBe("suche");
		expect(g.aufrufe.filter((a) => a.url.includes("api.igdb.com"))).toHaveLength(1);
	});
});

describe("IgdbRepository: Entscheidungen des Nutzers", () => {
	it("ablehnen ueberlebt und blockt den Abgleich; erneutSuchen gibt frei", async () => {
		await spiel(1, "Eigenbau", "eigenbau", ["PS4"]);
		const r = repos();
		expect(await r.igdb.ablehnen(1)).toBe(true);
		expect((await zeile(1))?.igdb_declined_at).not.toBeNull();
		expect(await r.igdb.naechsteUngeprueft(10)).toEqual([]);
		expect((await r.igdb.zaehlung()).abgelehnt).toBe(1);

		expect(await r.igdb.erneutSuchen(1)).toBe(true);
		expect((await zeile(1))?.igdb_declined_at).toBeNull();
		expect(await r.igdb.naechsteUngeprueft(10)).toHaveLength(1);
	});

	it("verknuepfungLoesen nimmt alles zurueck, was von IGDB kam", async () => {
		await spiel(1, "Bloodborne", "bloodborne", ["PS4"]);
		const r = repos();
		await igdbAbgleichSchritt(r, fakeIgdb([[spielRoh()]]).client);
		expect(await r.igdb.verknuepfungLoesen(1)).toBe(true);
		expect(await zeile(1)).toMatchObject({
			igdb_id: null,
			igdb_slug: null,
			igdb_matched_source: null,
			igdb_checked_at: null,
			cover_url: null,
			release_date: null,
			release_status: "unbekannt",
			critic_score: null,
			critic_source: null,
		});
		expect(await r.igdb.verknuepfungLoesen(1)).toBe(false);
	});

	it("laesst eine manuelle Kritikerwertung beim Verknuepfen und Auffrischen stehen", async () => {
		await spiel(1, "Bloodborne", "bloodborne", ["PS4"]);
		await env.DB.prepare("UPDATE game SET critic_score = 77, critic_source = 'manuell' WHERE id = 1").run();
		const r = repos();
		await igdbAbgleichSchritt(r, fakeIgdb([[spielRoh()]]).client);
		expect(await zeile(1)).toMatchObject({ igdb_id: 1001, critic_score: 77, critic_source: "manuell", cover_url: expect.any(String) });

		const e = await igdbAuffrischSchritt(r, fakeIgdb([[spielRoh({ aggregated_rating: 50 })]]).client);
		expect(e).toEqual({ status: "erfolg", angefragt: 1, aktualisiert: 1, ohneAntwort: 0 });
		expect(await zeile(1)).toMatchObject({ critic_score: 77, critic_source: "manuell" });

		// Nach dem Loesen bleibt die manuelle Wertung ebenfalls.
		await r.igdb.verknuepfungLoesen(1);
		expect(await zeile(1)).toMatchObject({ critic_score: 77, critic_source: "manuell", cover_url: null });
	});

	it("auffrischen holt die aeltesten zuerst und aktualisiert Wertung und Cover", async () => {
		await spiel(1, "A", "a", ["PS4"]);
		await spiel(2, "B", "b", ["PS4"]);
		await env.DB.batch([
			env.DB.prepare("UPDATE game SET igdb_id = 11, igdb_synced_at = '2026-01-01 00:00:00', critic_source = 'igdb' WHERE id = 1"),
			env.DB.prepare("UPDATE game SET igdb_id = 12, igdb_synced_at = NULL WHERE id = 2"),
		]);
		const r = repos();
		expect(await r.igdb.zumAuffrischen(1)).toEqual([{ id: 2, igdb_id: 12 }]);

		const { client, aufrufe } = fakeIgdb([[spielRoh({ id: 11, aggregated_rating: 60.4, aggregated_rating_count: 3 }), spielRoh({ id: 12, cover: { image_id: "neu" } })]]);
		expect(await igdbAuffrischSchritt(r, client)).toEqual({ status: "erfolg", angefragt: 2, aktualisiert: 2, ohneAntwort: 0 });
		expect(String(aufrufe.at(-1)?.init?.body)).toContain("where id = (12,11)");
		expect(await zeile(1)).toMatchObject({ critic_score: 60, critic_score_count: 3 });
		expect((await zeile(2))?.cover_url).toContain("/neu.jpg");
	});

	it("verknuepfen uebernimmt den IGDB-Namen nur bei Spielen ohne Trophaeenliste, auffrischen nie", async () => {
		await spiel(1, "Baldurs Gate 3", "baldurs gate 3", ["PS5"]);
		await spiel(2, "Ragnarok", "ragnarok", ["PS5"]);
		await env.DB.prepare(
			"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, synced_at, release_id) " +
				"VALUES ('NPWR2', 'trophy', 'Ragnarok', 'PS5', '2026-01-01', (SELECT id FROM release WHERE game_id = 2))",
		).run();
		const r = repos();
		const meta = (name: string) => ({ igdbId: 5, name, igdbSlug: null, coverUrl: null, releaseDate: null, releaseStatus: "unbekannt" as const, criticScore: null, criticScoreCount: null });

		await r.igdb.verknuepfen(1, meta("Baldur's Gate 3™"), "manuell");
		expect(await zeile(1)).toMatchObject({ title: "Baldur's Gate 3", sort_title: "baldurs gate 3" });
		await r.igdb.verknuepfen(2, meta("God of War Ragnarök"), "automatisch");
		expect(await zeile(2)).toMatchObject({ title: "Ragnarok", sort_title: "ragnarok" });

		// Was der Nutzer danach umbenennt, bleibt beim Auffrischen.
		await r.games.umbenennen(1, "BG3");
		await r.igdb.auffrischen(1, meta("Baldur's Gate 3"));
		expect(await zeile(1)).toMatchObject({ title: "BG3" });
	});

	it("umbenennen setzt den Suchstempel zurueck - ausser bei Verknuepfung oder Ablehnung", async () => {
		await spiel(1, "Alt", "alt", ["PS4"]);
		await spiel(2, "Verknuepft", "verknuepft", ["PS4"]);
		await spiel(3, "Abgelehnt", "abgelehnt", ["PS4"]);
		const r = repos();
		await r.igdb.kandidatenSetzen(1, []);
		await r.igdb.verknuepfen(2, { igdbId: 5, name: "Fuenf", igdbSlug: null, coverUrl: null, releaseDate: null, releaseStatus: "unbekannt", criticScore: null, criticScoreCount: null }, "manuell");
		await r.igdb.ablehnen(3);

		await r.games.umbenennen(1, "Neu");
		await r.games.umbenennen(2, "Neu 2");
		await r.games.umbenennen(3, "Neu 3");
		expect((await zeile(1))?.igdb_checked_at).toBeNull();
		expect((await zeile(2))?.igdb_checked_at).not.toBeNull();
		expect((await zeile(3))?.igdb_checked_at).not.toBeNull();
	});
});

describe("Routen", () => {
	const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as any });

	it("antwortet ohne Zugangsdaten mit 503 - und laesst den Rest laufen", async () => {
		await spiel(1, "Bloodborne", "bloodborne", ["PS4"]);
		const a = app(fakeIgdb([[]], { zugang: null }).client);
		expect((await a.request("/api/igdb/search?q=x", {}, env)).status).toBe(503);
		expect((await a.request("/api/igdb/abgleich", { method: "POST" }, env)).status).toBe(503);
		expect((await a.request("/api/igdb/auffrischen", { method: "POST" }, env)).status).toBe(503);
		expect((await a.request("/api/unmatched/spiel/1/link", { method: "POST", body: "{\"igdbId\":1}", headers: { "content-type": "application/json" } }, env)).status).toBe(503);

		const status = await json(await a.request("/api/igdb/status", {}, env));
		expect(status.status).toBe(200);
		expect(status.body).toMatchObject({ zugangsdaten: false, gesamt: 1, ungeprueft: 1 });
		expect((await a.request("/api/igdb/offen", {}, env)).status).toBe(200);
		expect((await a.request("/api/unmatched/spiel/1/ablehnen", { method: "POST" }, env)).status).toBe(200);
		expect((await a.request("/api/games/1", {}, env)).status).toBe(200);
	});

	it("GET /api/igdb/search liefert normalisierte Treffer", async () => {
		const a = app(fakeIgdb([[spielRoh()]]).client);
		const { status, body } = await json(await a.request("/api/igdb/search?q=blood", {}, env));
		expect(status).toBe(200);
		expect(body.treffer).toEqual([
			{
				igdbId: 1001,
				name: "Bloodborne",
				slug: "bloodborne",
				cover: "https://images.igdb.com/igdb/image/upload/t_cover_big/abc123.jpg",
				erscheinungsdatum: "2015-03-24",
				plattformen: ["PS4"],
				typ: "Hauptspiel",
				kritik: { wert: 91, anzahl: 18 },
			},
		]);
		expect((await json(await a.request("/api/igdb/search?q=", {}, env))).body).toEqual({ treffer: [], weg: "keiner" });
	});

	it("Abgleich, Pruefansicht, manuelle Verknuepfung und Loesen", async () => {
		await spiel(1, "MediEvil", "medievil", ["PS4"]);
		await spiel(2, "Bloodborne", "bloodborne", ["PS4"]);
		const igdb = fakeIgdb([
			[spielRoh({ id: 1, name: "MediEvil", game_type: 8 }), spielRoh({ id: 2, name: "MediEvil", game_type: 11 })],
			[spielRoh()],
			[spielRoh({ id: 2, name: "MediEvil", game_type: 11, aggregated_rating: 70 })],
		]).client;
		const a = app(igdb);

		const abgleich = await json(await a.request("/api/igdb/abgleich", { method: "POST" }, env));
		expect(abgleich.status).toBe(200);
		expect(abgleich.body).toMatchObject({ geprueft: 2, verknuepft: 1, vorgeschlagen: 1, weiter: false });

		const offen = await json(await a.request("/api/igdb/offen", {}, env));
		expect(offen.body.gesamt).toBe(1);
		expect(offen.body.spiele[0]).toMatchObject({ id: 1, titel: "MediEvil", plattformen: ["PS4"] });
		expect(offen.body.spiele[0].kandidaten.map((k: any) => k.igdbId)).toEqual([1, 2]);
		expect(offen.body.spiele[0].kandidaten[0]).toMatchObject({ typ: "Remake", kritik: { wert: 91, anzahl: 18 } });

		const link = await json(
			await a.request("/api/unmatched/spiel/1/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ igdbId: 2 }) }, env),
		);
		expect(link.status).toBe(200);
		expect(link.body.igdb).toMatchObject({ igdbId: 2, typ: "Portierung" });
		expect(await zeile(1)).toMatchObject({ igdb_id: 2, igdb_matched_source: "manuell", critic_score: 70 });
		expect((await json(await a.request("/api/igdb/offen", {}, env))).body.gesamt).toBe(0);

		const detail = await json(await a.request("/api/games/1", {}, env));
		expect(detail.body).toMatchObject({
			igdbId: 2,
			igdb: { id: 2, quelle: "manuell" },
			kritik: { wert: 70, anzahl: 18, quelle: "igdb" },
			erscheinungsdatum: "2015-03-24",
			releaseStatus: "erschienen",
		});
		expect(detail.body.bild).toContain("t_cover_big");

		const liste = await json(await a.request("/api/games", {}, env));
		const eintrag = liste.body.spiele.find((s: any) => s.id === 1);
		expect(eintrag).toMatchObject({ cover: true, kritik: 70 });
		expect(eintrag.bild).toContain("t_cover_big");

		const geloest = await json(await a.request("/api/unmatched/spiel/1/link", { method: "DELETE" }, env));
		expect(geloest.body).toEqual({ id: 1, geloest: true });
		expect((await zeile(1))?.igdb_id).toBeNull();
		expect((await a.request("/api/unmatched/spiel/1/link", { method: "DELETE" }, env)).status).toBe(404);
	});

	it("link prueft Eingaben und unbekannte Eintraege", async () => {
		await spiel(1, "X", "x", ["PS4"]);
		const a = app(fakeIgdb([[]]).client);
		const post = (pfad: string, body: string) =>
			a.request(pfad, { method: "POST", headers: { "content-type": "application/json" }, body }, env);
		expect((await post("/api/unmatched/spiel/1/link", "kein json")).status).toBe(400);
		expect((await post("/api/unmatched/spiel/1/link", '{"igdbId":"abc"}')).status).toBe(400);
		expect((await post("/api/unmatched/spiel/abc/link", '{"igdbId":1}')).status).toBe(400);
		expect((await post("/api/unmatched/spiel/99/link", '{"igdbId":1}')).status).toBe(404);
		expect((await post("/api/unmatched/spiel/1/link", '{"igdbId":1}')).status).toBe(404);
	});

	it("erneut-suchen setzt nur Spiele zur Pruefung zurueck", async () => {
		await spiel(1, "Offen", "offen", ["PS4"]);
		await spiel(2, "Abgelehnt", "abgelehnt", ["PS4"]);
		await spiel(3, "Verknuepft", "verknuepft", ["PS4"]);
		const r = repos();
		await r.igdb.kandidatenSetzen(1, [{ igdbId: 9, name: "X", slug: null, coverUrl: null, releaseDate: null, plattformen: [], typ: null, typId: null, criticScore: null, criticScoreCount: null, versionParent: null, parentGame: null }]);
		await r.igdb.ablehnen(2);
		await r.igdb.verknuepfen(3, { igdbId: 5, name: "Fuenf", igdbSlug: null, coverUrl: null, releaseDate: null, releaseStatus: "unbekannt", criticScore: null, criticScoreCount: null }, "manuell");

		const a = app(fakeIgdb([[]]).client);
		expect((await json(await a.request("/api/igdb/erneut-suchen", { method: "POST" }, env))).body).toEqual({ zurueckgesetzt: 1 });
		expect(await kandidaten(1)).toEqual([]);
		expect((await json(await a.request("/api/igdb/status", {}, env))).body).toMatchObject({ ungeprueft: 1, abgelehnt: 1, verknuepft: 1, zurPruefung: 0 });
	});

	it("GET /api/igdb/search sortiert nach Plattform des Spiels", async () => {
		const a = app(fakeIgdb([[spielRoh({ id: 1, name: "Spiel", platforms: [9] }), spielRoh({ id: 2, name: "Spiel", platforms: [48] })]]).client);
		const { body } = await json(await a.request("/api/igdb/search?q=Spiel&plattformen=PS4", {}, env));
		expect(body.treffer.map((t: any) => t.igdbId)).toEqual([2, 1]);
		expect(body.weg).toBe("suche");
	});

	it("ablehnen und suchen sind gespeicherte Entscheidungen", async () => {
		await spiel(1, "X", "x", ["PS4"]);
		const a = app(fakeIgdb([[]]).client);
		expect((await json(await a.request("/api/unmatched/spiel/1/ablehnen", { method: "POST" }, env))).body).toEqual({ id: 1, abgelehnt: true });
		expect((await json(await a.request("/api/igdb/status", {}, env))).body).toMatchObject({ abgelehnt: 1, ungeprueft: 0 });
		expect((await json(await a.request("/api/unmatched/spiel/1/suchen", { method: "POST" }, env))).body).toEqual({ id: 1, freigegeben: true });
		expect((await json(await a.request("/api/igdb/status", {}, env))).body).toMatchObject({ abgelehnt: 0, ungeprueft: 1 });
		expect((await a.request("/api/unmatched/spiel/99/ablehnen", { method: "POST" }, env)).status).toBe(404);
	});
});
