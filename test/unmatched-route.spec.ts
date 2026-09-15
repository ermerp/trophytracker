import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index";
import { erstellePsnClient } from "../src/psn/client";
import { fakeIgdb, spielRoh } from "./igdb-fake";
import { fakeFetch } from "./psn-fake";

/**
 * Ansicht "Ohne Zuordnung" (Abschnitt 8.3, Stufe 11): GET /api/unmatched
 * und die Zuordnung eines Freitext-Eintrags ueber POST /api/unmatched/plan_*.
 */

const psnStumm = () => erstellePsnClient(fakeFetch([]).fetch);
const app = (igdb: ReturnType<typeof fakeIgdb>["client"]) => createApp(psnStumm, () => igdb);
const json = (koerper: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(koerper) });

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM plan_entry"),
		env.DB.prepare("DELETE FROM release"),
		env.DB.prepare("DELETE FROM game"),
		env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (1, 'Nie gesucht', 'nie gesucht')"),
		env.DB.prepare("INSERT INTO game (id, title, sort_title, igdb_checked_at) VALUES (2, 'Zur Pruefung', 'zur pruefung', '2026-09-01')"),
		env.DB.prepare("INSERT INTO game (id, title, sort_title, igdb_checked_at, igdb_declined_at) VALUES (3, 'Abgelehnt', 'abgelehnt', '2026-09-01', '2026-09-02')"),
		env.DB.prepare("INSERT INTO game (id, title, sort_title, igdb_id) VALUES (4, 'Verknuepft', 'verknuepft', 4711)"),
		env.DB.prepare("INSERT INTO release (game_id, platform) VALUES (4, 'PS3')"),
		env.DB.prepare("INSERT INTO plan_entry (id, kind, title_raw, origin) VALUES (10, 'wunsch', 'Nur Text', 'manuell')"),
		env.DB.prepare("INSERT INTO plan_entry (id, kind, title_raw, origin) VALUES (11, 'backlog', 'Anderer Text', 'manuell')"),
		env.DB.prepare("INSERT INTO plan_entry (id, kind, title_raw, origin, status) VALUES (12, 'wunsch', 'Erledigt', 'manuell', 'erledigt')"),
	]);
});

describe("GET /api/unmatched", () => {
	it("listet Spiele ohne IGDB und offene Freitext-Eintraege, abgelehnte nur auf Wunsch", async () => {
		const a = app(fakeIgdb([[]]).client);
		const ohne = (await (await a.request("/api/unmatched", {}, env)).json()) as { eintraege: unknown[] };
		expect(ohne.eintraege).toEqual([
			{ quelle: "plan_backlog", id: 11, titel: "Anderer Text", zustand: "freitext", art: "backlog" },
			{ quelle: "plan_wunsch", id: 10, titel: "Nur Text", zustand: "freitext", art: "wunsch" },
			{ quelle: "spiel", id: 1, titel: "Nie gesucht", zustand: "nicht_gesucht", art: null },
			{ quelle: "spiel", id: 2, titel: "Zur Pruefung", zustand: "zur_pruefung", art: null },
		]);
		const mit = (await (await a.request("/api/unmatched?abgelehnte=1", {}, env)).json()) as { eintraege: Array<{ id: number; zustand: string }> };
		expect(mit.eintraege.find((e) => e.zustand === "abgelehnt")?.id).toBe(3);
	});
});

describe("POST /api/unmatched/plan_*/:id/link", () => {
	it("legt das Spiel aus IGDB mit der neuesten Plattform an und haengt den Freitext-Eintrag daran", async () => {
		const { client, aufrufe } = fakeIgdb([[spielRoh({ id: 77, name: "Nur Text: Das Spiel", platforms: [9, 48] })]]);
		const a = await app(client).request("/api/unmatched/plan_wunsch/10/link", json({ igdbId: 77 }), env);
		expect(a.status).toBe(200);
		expect(await a.json()).toMatchObject({ id: 10, titel: "Nur Text: Das Spiel", plattform: "PS4", spielAngelegt: true });
		expect(String(aufrufe.at(-1)?.init?.body)).toContain("where id = (77)");
		const pe = await env.DB.prepare("SELECT game_id, release_id, title_raw FROM plan_entry WHERE id = 10").first<Record<string, unknown>>();
		const g = await env.DB.prepare("SELECT id, title, igdb_id, igdb_matched_source FROM game WHERE igdb_id = 77").first<Record<string, unknown>>();
		expect(g).toMatchObject({ title: "Nur Text: Das Spiel", igdb_id: 77, igdb_matched_source: "manuell" });
		expect(pe).toMatchObject({ game_id: null, title_raw: null });
		expect(await env.DB.prepare("SELECT game_id, platform FROM release WHERE id = ?").bind(pe!.release_id).first()).toEqual({ game_id: g!.id, platform: "PS4" });
	});

	it("verwendet ein vorhandenes Spiel wieder - ohne IGDB-Anfrage - und weist ein Duplikat ab", async () => {
		const { client, aufrufe } = fakeIgdb([[]]);
		const a = await app(client).request("/api/unmatched/plan_backlog/11/link", json({ igdbId: 4711 }), env);
		expect(a.status).toBe(200);
		expect(aufrufe.filter((x) => /api\.igdb/.test(String(x.url)))).toHaveLength(0);
		expect(await a.json()).toMatchObject({ spielId: 4, plattform: "PS3" });

		const ps3 = (await env.DB.prepare("SELECT id FROM release WHERE game_id = 4").first<{ id: number }>())!.id;
		await env.DB.prepare("INSERT INTO plan_entry (id, kind, release_id, origin) VALUES (13, 'wunsch', ?, 'manuell')").bind(ps3).run();
		const b = await app(client).request("/api/unmatched/plan_wunsch/10/link", json({ igdbId: 4711 }), env);
		expect(b.status).toBe(409);
		expect(await b.json()).toMatchObject({ eintragId: 13 });
		expect(await env.DB.prepare("SELECT title_raw FROM plan_entry WHERE id = 10").first()).toEqual({ title_raw: "Nur Text" });
	});

	it("prueft Art, Zustand und Koerper", async () => {
		const a = app(fakeIgdb([[]]).client);
		expect((await a.request("/api/unmatched/plan_wunsch/11/link", json({ igdbId: 4711 }), env)).status).toBe(404);
		expect((await a.request("/api/unmatched/plan_wunsch/10/link", json({}), env)).status).toBe(400);
		expect((await a.request("/api/unmatched/plan_kauf/10/link", json({ igdbId: 1 }), env)).status).toBe(404);
		await env.DB.prepare("UPDATE plan_entry SET game_id = 4, title_raw = NULL WHERE id = 10").run();
		expect((await a.request("/api/unmatched/plan_wunsch/10/link", json({ igdbId: 4711 }), env)).status).toBe(409);
		expect((await app(fakeIgdb([[]], { zugang: null }).client).request("/api/unmatched/plan_backlog/11/link", json({ igdbId: 1 }), env)).status).toBe(503);
	});
});
