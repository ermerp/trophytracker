import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { createApp } from "../src/index";
import { erstellePsnClient } from "../src/psn/client";
import { igdbPhysischSchritt } from "../src/sync/igdb";
import { fakeIgdb } from "./igdb-fake";
import { fakeFetch } from "./psn-fake";

/**
 * Stufe 14: Disc-Fassung aus IGDB (7.6), von Hand (PATCH /api/releases/:id)
 * und die Lueckenroute (5.3, Abschnitt 12) gegen die lokale D1. Der
 * IGDB-Client ist nachgebaut; nichts geht ins Netz.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const psnStumm = () => erstellePsnClient(fakeFetch([]).fetch);
const B = "https://example.com";
const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as any });
const post = (pfad: string) => SELF.fetch(`${B}${pfad}`, { method: "POST" });
const patch = (pfad: string, koerper: unknown) =>
	SELF.fetch(`${B}${pfad}`, {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(koerper),
	});

async function spiel(id: number, igdbId: number | null, releases: Array<[string, "ja" | "nein" | "unbekannt", string?]>) {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title, igdb_id) VALUES (?, ?, ?, ?)")
		.bind(id, `Spiel ${id}`, `spiel ${id}`, igdbId)
		.run();
	for (const [plattform, status, quelle] of releases) {
		await env.DB.prepare(
			"INSERT INTO release (game_id, platform, physical_release_status, physical_source) VALUES (?, ?, ?, ?)",
		)
			.bind(id, plattform, status, quelle ?? null)
			.run();
	}
}

async function trophaeen(releaseId: number, pct: number) {
	await env.DB.prepare(
		"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, " +
			"progress_pct, defined_platinum, earned_platinum, synced_at, release_id) " +
			"VALUES (?, 'trophy', 'x', 'PS4', ?, 1, 0, '2026-01-01', ?)",
	)
		.bind(`NPWR${releaseId}`, pct, releaseId)
		.run();
}

const releases = async (gameId: number) =>
	(
		await env.DB.prepare(
			"SELECT platform, physical_release_status AS status, physical_source AS quelle, " +
				"physical_checked_at IS NOT NULL AS geprueft FROM release WHERE game_id = ? ORDER BY platform",
		)
			.bind(gameId)
			.all()
	).results;

beforeEach(async () => {
	await env.DB.batch(
		["plan_entry", "play_status", "trophy_progress", "physical_copy", "release", "game"].map((t) =>
			env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
});

describe("igdbPhysischSchritt", () => {
	it("setzt 'ja' aus IGDB nur fuer die genannte Plattform und nur von 'unbekannt' aus", async () => {
		await spiel(1, 101, [
			["PS4", "unbekannt"],
			["PS5", "unbekannt"],
			["PS3", "nein", "manuell"],
			["PSVITA", "ja", "manuell"],
		]);
		const { client, aufrufe } = fakeIgdb([
			[
				{
					id: 101,
					external_games: [
						{ media: 2, platform: 48 },
						{ media: 2, platform: 9 }, // PS3 - aber der Nutzer sagt 'nein'
						{ media: 2, platform: 46 }, // Vita - schon 'ja', Quelle bleibt manuell
						{ media: 1, platform: 167 }, // PS5 nur digital
					],
				} as any,
			],
		]);

		const e = await igdbPhysischSchritt(repos(), client);
		expect(e).toEqual({ status: "erfolg", angefragt: 1, gesetzt: 1, nochOffen: 0, weiter: false });
		expect(String(aufrufe.at(-1)?.init?.body)).toContain("external_games.media");
		expect(await releases(1)).toEqual([
			{ platform: "PS3", status: "nein", quelle: "manuell", geprueft: 0 },
			{ platform: "PS4", status: "ja", quelle: "igdb", geprueft: 1 },
			// unbekannt bleibt unbekannt, aber gestempelt - sonst fragte der
			// naechste Aufruf dasselbe Spiel erneut an
			{ platform: "PS5", status: "unbekannt", quelle: null, geprueft: 1 },
			{ platform: "PSVITA", status: "ja", quelle: "manuell", geprueft: 0 },
		]);
	});

	it("stempelt auch Spiele ohne physischen Eintrag und arbeitet in Schritten", async () => {
		await spiel(1, 101, [["PS4", "unbekannt"]]);
		await spiel(2, 102, [["PS4", "unbekannt"]]);
		await spiel(3, null, [["PS4", "unbekannt"]]); // nicht verknuepft: nie angefragt
		const { client, aufrufe } = fakeIgdb([[{ id: 101 } as any], []]);

		const r = repos();
		expect(await r.igdb.discZaehlung()).toEqual({ discBelegt: 0, discOffen: 2 });
		expect(await igdbPhysischSchritt(r, client, 1)).toEqual({
			status: "erfolg",
			angefragt: 1,
			gesetzt: 0,
			nochOffen: 1,
			weiter: true,
		});
		// Zweiter Schritt: IGDB antwortet leer - trotzdem gestempelt, keine Endlosschleife.
		expect(await igdbPhysischSchritt(r, client, 1)).toMatchObject({ angefragt: 1, nochOffen: 0, weiter: false });
		expect(aufrufe.filter((a) => String(a.url).includes("/games"))).toHaveLength(2);
		expect(await releases(1)).toEqual([{ platform: "PS4", status: "unbekannt", quelle: null, geprueft: 1 }]);
		expect(await releases(2)).toEqual([{ platform: "PS4", status: "unbekannt", quelle: null, geprueft: 1 }]);
		expect(await releases(3)).toEqual([{ platform: "PS4", status: "unbekannt", quelle: null, geprueft: 0 }]);
	});

	it("fragt gestempelte Releases erst nach 30 Tagen erneut an", async () => {
		await spiel(1, 101, [["PS4", "unbekannt"]]);
		await spiel(2, 102, [["PS4", "unbekannt"]]);
		await env.DB.batch([
			env.DB.prepare("UPDATE release SET physical_checked_at = datetime('now', '-3 days') WHERE game_id = 1"),
			env.DB.prepare("UPDATE release SET physical_checked_at = datetime('now', '-40 days') WHERE game_id = 2"),
		]);
		expect(await repos().igdb.zurDiscPruefung(10)).toEqual([{ id: 2, igdb_id: 102 }]);
	});

	it("bricht beim Ratenlimit ohne Fremdtext ab und stempelt nichts", async () => {
		await spiel(1, 101, [["PS4", "unbekannt"]]);
		const { client } = fakeIgdb([new Response("slow down", { status: 429 })]);
		const e = await igdbPhysischSchritt(repos(), client);
		expect(e).toMatchObject({ status: "fehler", angefragt: 1, gesetzt: 0, weiter: false });
		expect(e.meldung).not.toContain("slow down");
		expect(await releases(1)).toEqual([{ platform: "PS4", status: "unbekannt", quelle: null, geprueft: 0 }]);
	});

	it("POST /api/igdb/physisch antwortet ohne Zugang mit 503 und sonst mit dem Ergebnis", async () => {
		await spiel(1, 101, [["PS4", "unbekannt"]]);
		const ohne = createApp(psnStumm, () => fakeIgdb([[]], { zugang: null }).client);
		expect((await ohne.request("/api/igdb/physisch", { method: "POST" }, env)).status).toBe(503);

		const mit = createApp(psnStumm, () => fakeIgdb([[{ id: 101, external_games: [{ media: 2, platform: 48 }] } as any]]).client);
		const a = await json(await mit.request("/api/igdb/physisch", { method: "POST" }, env));
		expect(a).toEqual({ status: 200, body: { status: "erfolg", angefragt: 1, gesetzt: 1, nochOffen: 0, weiter: false } });
		const status = await json(await mit.request("/api/igdb/status", {}, env));
		expect(status.body).toMatchObject({ discBelegt: 1, discOffen: 0 });
	});
});

describe("PATCH /api/releases/:id", () => {
	it("setzt die Disc-Fassung von Hand mit Quelle 'manuell'; 'unbekannt' nimmt die Quelle zurueck", async () => {
		await spiel(1, null, [["PS4", "ja", "igdb"]]);
		const id = (await env.DB.prepare("SELECT id FROM release").first<{ id: number }>())!.id;

		expect(await json(await patch(`/api/releases/${id}`, { discFassung: "nein" }))).toEqual({
			status: 200,
			body: { id, discFassung: "nein", discQuelle: "manuell", psnProductId: null },
		});
		expect(await json(await patch(`/api/releases/${id}`, { discFassung: "unbekannt", psnProductId: " EP9000-CUSA00900_00 " }))).toEqual({
			status: 200,
			body: { id, discFassung: "unbekannt", discQuelle: null, psnProductId: "EP9000-CUSA00900_00" },
		});
		expect(await releases(1)).toEqual([{ platform: "PS4", status: "unbekannt", quelle: null, geprueft: 1 }]);

		// Ein von Hand gesetztes 'nein' ueberlebt den IGDB-Schritt.
		await patch(`/api/releases/${id}`, { discFassung: "nein" });
		await env.DB.prepare("UPDATE game SET igdb_id = 101").run();
		await igdbPhysischSchritt(repos(), fakeIgdb([[{ id: 101, external_games: [{ media: 2, platform: 48 }] } as any]]).client);
		expect(await releases(1)).toEqual([{ platform: "PS4", status: "nein", quelle: "manuell", geprueft: 1 }]);
	});

	it("prueft Eingaben", async () => {
		await spiel(1, null, [["PS4", "unbekannt"]]);
		const id = (await env.DB.prepare("SELECT id FROM release").first<{ id: number }>())!.id;
		expect((await patch(`/api/releases/${id}`, { discFassung: "vielleicht" })).status).toBe(400);
		expect((await patch(`/api/releases/${id}`, {})).status).toBe(400);
		expect((await patch(`/api/releases/${id}`, { psnProductId: 5 })).status).toBe(400);
		expect((await patch("/api/releases/999", { discFassung: "ja" })).status).toBe(404);
		expect((await patch("/api/releases/x", { discFassung: "ja" })).status).toBe(400);
	});
});

describe("GET /api/gaps und verwerfen", () => {
	it("trennt belegte und moegliche Luecken, blendet verworfene aus und zaehlt alles", async () => {
		await spiel(1, null, [["PS4", "ja", "igdb"]]);
		await spiel(2, null, [["PS4", "unbekannt"]]);
		await spiel(3, null, [["PS4", "ja", "manuell"]]);
		await spiel(4, null, [["PS4", "nein", "manuell"]]);
		const ids = (await env.DB.prepare("SELECT id, game_id FROM release ORDER BY game_id").all<{ id: number; game_id: number }>())
			.results;
		for (const r of ids) await trophaeen(r.id, 50);
		const r3 = ids[2]!.id;

		const v = await json(await post(`/api/gaps/${r3}/verwerfen`));
		expect(v.status).toBe(201);
		expect(v.body).toMatchObject({ releaseId: r3, art: "kauf", status: "verworfen", herkunft: "luecke" });
		expect(await env.DB.prepare("SELECT kind, origin, status, resolved_at IS NOT NULL AS r FROM plan_entry").first()).toEqual({
			kind: "kauf",
			origin: "luecke",
			status: "verworfen",
			r: 1,
		});
		// Zweimal verwerfen ist ein Duplikat.
		expect((await post(`/api/gaps/${r3}/verwerfen`)).status).toBe(409);
		expect((await post("/api/gaps/999/verwerfen")).status).toBe(404);

		const standard = await json(await SELF.fetch(`${B}/api/gaps`));
		expect(standard.body).toMatchObject({ anzahl: 1, verworfen: 1, unbekannt: 1, moeglich: [] });
		expect(standard.body.luecken).toEqual([
			{
				releaseId: ids[0]!.id,
				spielId: 1,
				titel: "Spiel 1",
				bild: null,
				plattform: "PS4",
				discFassung: "ja",
				discQuelle: "igdb",
				fortschritt: 50,
				platin: false,
				eigenerStatus: null,
				besterGebrauchtpreisCents: null,
				verworfen: false,
				planId: null,
			},
		]);

		const alles = await json(await SELF.fetch(`${B}/api/gaps?verworfene=1&unbekannte=1`));
		expect(alles.body.luecken.map((l: any) => [l.titel, l.verworfen, l.planId])).toEqual([
			["Spiel 1", false, null],
			["Spiel 3", true, v.body.id],
		]);
		expect(alles.body.moeglich.map((l: any) => [l.titel, l.discFassung])).toEqual([["Spiel 2", "unbekannt"]]);

		// Rueckgaengig ist das vorhandene DELETE /api/plans/:id - das Release
		// traegt eine Trophaeenliste und bleibt.
		expect((await SELF.fetch(`${B}/api/plans/${v.body.id}`, { method: "DELETE" })).status).toBe(200);
		expect((await json(await SELF.fetch(`${B}/api/gaps`))).body).toMatchObject({ anzahl: 2, verworfen: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM release").first()).toEqual({ n: 4 });
	});

	it("verwirft auch ein Release mit unbekannter Disc-Fassung - die Frage bleibt offen, der Block blendet es aus", async () => {
		await spiel(1, null, [["PS4", "unbekannt"]]);
		const id = (await env.DB.prepare("SELECT id FROM release").first<{ id: number }>())!.id;
		await trophaeen(id, 50);

		expect((await post(`/api/gaps/${id}/verwerfen`)).status).toBe(201);
		const standard = await json(await SELF.fetch(`${B}/api/gaps?unbekannte=1`));
		expect(standard.body).toMatchObject({ anzahl: 0, verworfen: 1, unbekannt: 0, moeglich: [] });
		const alles = await json(await SELF.fetch(`${B}/api/gaps?unbekannte=1&verworfene=1`));
		expect(alles.body.moeglich.map((l: any) => [l.discFassung, l.verworfen])).toEqual([["unbekannt", true]]);
		expect(await env.DB.prepare("SELECT physical_release_status AS s FROM release").first()).toEqual({ s: "unbekannt" });
	});

	it("weist verwerfen ab, wenn schon ein offener Kaufeintrag am Release haengt", async () => {
		await spiel(1, null, [["PS4", "ja", "igdb"]]);
		const id = (await env.DB.prepare("SELECT id FROM release").first<{ id: number }>())!.id;
		await env.DB.prepare("INSERT INTO plan_entry (kind, release_id, origin, status) VALUES ('kauf', ?, 'luecke', 'offen')").bind(id).run();
		const a = await json(await post(`/api/gaps/${id}/verwerfen`));
		expect(a.status).toBe(409);
		expect(a.body.fehler).toContain("Kaufeintrag");
	});
});

describe("luecken.csv", () => {
	it("liest Verworfen aus der View und laesst unbekannte Disc-Fassungen weg", async () => {
		await spiel(1, null, [["PS4", "ja", "igdb"]]);
		await spiel(2, null, [["PS4", "unbekannt"]]);
		const ids = (await env.DB.prepare("SELECT id FROM release ORDER BY game_id").all<{ id: number }>()).results;
		for (const r of ids) await trophaeen(r.id, 50);
		await env.DB.prepare("INSERT INTO plan_entry (kind, release_id, origin, status) VALUES ('kauf', ?, 'wunsch', 'verworfen')")
			.bind(ids[0]!.id)
			.run();

		const text = await (await SELF.fetch(`${B}/api/export/luecken.csv`)).text();
		const zeilen = text.replace("﻿", "").split("\r\n").filter(Boolean);
		expect(zeilen).toEqual([
			"Titel;Plattform;Fortschritt %;Platin erspielt;Status;Bester Gebrauchtpreis;Verworfen",
			"Spiel 1;PS4;50;nein;;;ja",
		]);
	});
});
