import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { createApp } from "../src/index";
import { erstellePsnClient } from "../src/psn/client";
import { fakeIgdb, spielRoh } from "./igdb-fake";
import { fakeFetch } from "./psn-fake";

/**
 * Absichten (Abschnitt 5, Stufe 10): Repository und Routen /api/plans gegen
 * die lokale D1. Der IGDB-Client ist nachgebaut; nichts geht ins Netz.
 */

const B = "https://example.com";
const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const psnStumm = () => erstellePsnClient(fakeFetch([]).fetch);

function app(igdb = fakeIgdb([[]]).client) {
	return createApp(psnStumm, () => igdb);
}

const hole = async (a: ReturnType<typeof app>, pfad: string) => (await a.request(`${B}${pfad}`, {}, env)).json();
const sende = (a: ReturnType<typeof app>, method: string, pfad: string, koerper?: unknown) =>
	a.request(
		`${B}${pfad}`,
		{
			method,
			headers: { "content-type": "application/json" },
			body: koerper === undefined ? undefined : JSON.stringify(koerper),
		},
		env,
	);

async function spiel(id: number, titel: string, plattformen: string[], felder: Record<string, unknown> = {}) {
	const spalten = ["id", "title", "sort_title", ...Object.keys(felder)];
	await env.DB.prepare(`INSERT INTO game (${spalten.join(", ")}) VALUES (${spalten.map(() => "?").join(", ")})`)
		.bind(id, titel, titel.toLowerCase(), ...Object.values(felder))
		.run();
	const ids: number[] = [];
	for (const p of plattformen) {
		const r = await env.DB.prepare("INSERT INTO release (game_id, platform) VALUES (?, ?) RETURNING id")
			.bind(id, p)
			.first<{ id: number }>();
		ids.push(r!.id);
	}
	return ids;
}

const zeile = (id: number) => env.DB.prepare("SELECT * FROM plan_entry WHERE id = ?").bind(id).first<Record<string, unknown>>();

beforeEach(async () => {
	await env.DB.batch(
		["plan_entry", "igdb_candidate", "trophy_progress", "release", "game"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
	);
});

describe("PlanRepository", () => {
	it("legt an, liest mit Spieldaten und aendert nur die uebergebenen Felder", async () => {
		const [ps4] = await spiel(1, "Bloodborne", ["PS4"], { critic_score: 91, cover_url: "c.jpg" });
		const r = repos().plan;
		const id = await r.anlegen("wunsch", { releaseId: ps4 }, "manuell", { note: "Disc" });

		const z = await r.eintrag(id);
		expect(z).toMatchObject({
			kind: "wunsch", release_id: ps4, game_id: null, spiel_id: 1, titel: "Bloodborne",
			platform: "PS4", critic_score: 91, cover_url: "c.jpg", priority: 3, is_favorite: 0, note: "Disc",
			origin: "manuell", status: "offen", resolved_at: null,
		});

		expect(await r.aendern(id, { isFavorite: true, priority: 5 })).toBe(true);
		expect(await zeile(id)).toMatchObject({ is_favorite: 1, priority: 5, note: "Disc" });
		expect(await r.aendern(id, {})).toBe(true);
		expect(await r.aendern(999, { priority: 1 })).toBe(false);
	});

	it("setzt resolved_at beim Erledigen und nimmt es beim Wiederoeffnen zurueck", async () => {
		await spiel(1, "Bloodborne", []);
		const r = repos().plan;
		const id = await r.anlegen("wunsch", { gameId: 1 }, "manuell");

		await r.aendern(id, { status: "erledigt" });
		expect((await zeile(id))!.resolved_at).toEqual(expect.any(String));
		expect(await r.liste("wunsch", "offen")).toHaveLength(0);
		expect(await r.liste("wunsch", "alle")).toHaveLength(1);

		await r.aendern(id, { status: "offen" });
		expect((await zeile(id))!.resolved_at).toBeNull();
	});

	it("Duplikat: Spiel und Release sind zwei Aussagen, dasselbe Release nicht", async () => {
		const [ps4, ps5] = await spiel(1, "Bloodborne", ["PS4", "PS5"]);
		const r = repos().plan;
		const amSpiel = await r.anlegen("wunsch", { gameId: 1 }, "manuell");
		const amPs4 = await r.anlegen("wunsch", { releaseId: ps4 }, "manuell");

		expect(await r.offenerEintrag("wunsch", { gameId: 1 })).toBe(amSpiel);
		expect(await r.offenerEintrag("wunsch", { releaseId: ps4 })).toBe(amPs4);
		expect(await r.offenerEintrag("wunsch", { releaseId: ps5 })).toBeNull();
		expect(await r.offenerEintrag("todo", { releaseId: ps4 })).toBeNull();
		expect(await r.offenerEintrag("wunsch", { titleRaw: "x" })).toBeNull();

		// Ein erledigter Eintrag blockiert nicht.
		await r.aendern(amPs4, { status: "erledigt" });
		expect(await r.offenerEintrag("wunsch", { releaseId: ps4 })).toBeNull();
	});

	it("offeneFuerSpiel findet Eintraege am Spiel und an seinen Releases", async () => {
		const [ps4] = await spiel(1, "Bloodborne", ["PS4"]);
		await spiel(2, "Anderes", ["PS4"]);
		const r = repos().plan;
		await r.anlegen("wunsch", { gameId: 1 }, "manuell");
		await r.anlegen("todo", { releaseId: ps4 }, "triage");
		const fremd = await r.anlegen("wunsch", { gameId: 2 }, "manuell");
		await r.aendern(fremd, { status: "verworfen" });

		const offen = await r.offeneFuerSpiel(1);
		expect(offen.map((z) => [z.kind, z.spiel_id])).toEqual([["wunsch", 1], ["todo", 1]]);
		expect(await r.offeneFuerSpiel(2)).toHaveLength(0);
	});

	it("haelt ein Spiel ohne Release, solange ein offener Wunsch daran haengt", async () => {
		const [ps4] = await spiel(1, "Bloodborne", ["PS4"]);
		const r = repos();
		const id = await r.plan.anlegen("wunsch", { gameId: 1 }, "manuell");

		expect(await r.games.releaseLoeschen(ps4)).toMatchObject({ spielGeloescht: false });
		expect(await r.games.spielExistiert(1)).toBe(true);
		expect(await zeile(id)).not.toBeNull();

		// Ohne offene Absicht faellt das leere Spiel wie bisher weg.
		await r.plan.aendern(id, { status: "erledigt" });
		const [neu] = await spiel(2, "Zweites", ["PS4"]);
		await env.DB.prepare("UPDATE release SET game_id = 1 WHERE id = ?").bind(neu).run();
		expect(await r.games.releaseLoeschen(neu)).toMatchObject({ spielGeloescht: true });
		expect(await r.games.spielExistiert(1)).toBe(false);
	});
});

describe("GET /api/plans", () => {
	it("verlangt kind, sortiert nach Rang und haengt Eintraege ohne Spiel ans Ende", async () => {
		await spiel(1, "Gut", [], { critic_score: 90 });
		await spiel(2, "Unbewertet", []);
		await spiel(3, "Favorit", [], { critic_score: 60 });
		const r = repos().plan;
		await r.anlegen("wunsch", { gameId: 1 }, "manuell");
		await r.anlegen("wunsch", { gameId: 2 }, "manuell");
		await r.anlegen("wunsch", { gameId: 3 }, "manuell", { isFavorite: true });
		await r.anlegen("wunsch", { titleRaw: "Freitext" }, "manuell");
		await r.anlegen("todo", { gameId: 1 }, "manuell");

		const a = app();
		expect((await a.request(`${B}/api/plans`, {}, env)).status).toBe(400);

		const liste = await hole(a, "/api/plans?kind=wunsch");
		expect(liste.gewichte).toMatchObject({ w_critic: 0.5 });
		expect(liste.eintraege.map((e: { titel: string }) => e.titel)).toEqual(["Favorit", "Gut", "Unbewertet", "Freitext"]);
		expect(liste.eintraege[3]).toMatchObject({ rang: null, spielId: null });
		// Unbewertet: 0.7*0.5 + 0.6*0.3 = 0.53
		expect(liste.eintraege[2].rang).toBeCloseTo(0.53);

		const favoriten = await hole(a, "/api/plans?kind=wunsch&favorit=1");
		expect(favoriten.eintraege).toHaveLength(1);

		const nachTitel = await hole(a, "/api/plans?kind=wunsch&sort=titel");
		expect(nachTitel.eintraege.map((e: { titel: string }) => e.titel)).toEqual(["Favorit", "Freitext", "Gut", "Unbewertet"]);
	});
});

describe("POST /api/plans", () => {
	it("legt einen Wunsch am Spiel an - ohne Plattform", async () => {
		await spiel(1, "Bloodborne", ["PS4"]);
		const antwort = await sende(app(), "POST", "/api/plans", { art: "wunsch", spielId: 1, prioritaet: 4 });
		expect(antwort.status).toBe(201);
		expect(await antwort.json()).toMatchObject({
			art: "wunsch", spielId: 1, releaseId: null, plattform: null, prioritaet: 4, favorit: false,
			herkunft: "manuell", spielAngelegt: false,
		});
	});

	it("legt einen Wunsch am Release an und lehnt ein Duplikat am selben Release mit 409 ab", async () => {
		const [ps4] = await spiel(1, "Bloodborne", ["PS4"]);
		const a = app();
		const erste = await sende(a, "POST", "/api/plans", { art: "wunsch", releaseId: ps4 });
		expect(erste.status).toBe(201);
		expect(await erste.json()).toMatchObject({ spielId: 1, releaseId: ps4, plattform: "PS4" });

		// Am Spiel selbst: eine andere Aussage, kein Duplikat.
		expect((await sende(a, "POST", "/api/plans", { art: "wunsch", spielId: 1 })).status).toBe(201);
		// Dasselbe Release noch einmal: Duplikat.
		const doppelt = await sende(a, "POST", "/api/plans", { art: "wunsch", releaseId: ps4 });
		expect(doppelt.status).toBe(409);
		expect(await doppelt.json()).toMatchObject({ eintragId: expect.any(Number) });
		// Dieselbe Aussage in einer anderen Liste: erlaubt.
		expect((await sende(a, "POST", "/api/plans", { art: "todo", releaseId: ps4 })).status).toBe(201);
	});

	it("legt aus einem IGDB-Treffer ein Spiel ohne Release an und verknuepft es", async () => {
		const { client } = fakeIgdb([[spielRoh({ id: 1001, name: "Bloodborne" })]]);
		const antwort = await sende(app(client), "POST", "/api/plans", { art: "wunsch", igdbId: 1001, favorit: true });
		expect(antwort.status).toBe(201);
		const e = await antwort.json();
		expect(e).toMatchObject({ titel: "Bloodborne", releaseId: null, plattform: null, favorit: true, spielAngelegt: true, kritik: 91 });

		const g = await env.DB.prepare("SELECT * FROM game WHERE id = ?").bind(e.spielId).first<Record<string, unknown>>();
		expect(g).toMatchObject({ igdb_id: 1001, igdb_matched_source: "manuell", release_status: "erschienen", sort_title: "bloodborne" });
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM release").first<{ n: number }>()).toMatchObject({ n: 0 });

		// Das Spiel ist kein Besitz: nicht in der Sammlung, wohl im Spieldetail.
		const sammlung = await hole(app(client), "/api/games");
		expect(sammlung.gesamt).toBe(0);
		const detail = await hole(app(client), `/api/games/${e.spielId}`);
		expect(detail.plaene).toEqual([expect.objectContaining({ id: e.id, art: "wunsch", favorit: true })]);
	});

	it("verwendet ein Spiel mit derselben IGDB-Id wieder, ohne IGDB zu fragen", async () => {
		await spiel(7, "Bloodborne", ["PS4"], { igdb_id: 1001 });
		const { client, aufrufe } = fakeIgdb([[]]);
		const antwort = await sende(app(client), "POST", "/api/plans", { art: "wunsch", igdbId: 1001 });
		expect(antwort.status).toBe(201);
		expect(await antwort.json()).toMatchObject({ spielId: 7, spielAngelegt: false });
		expect(aufrufe.filter((a) => /igdb\.com/.test(a.url))).toHaveLength(0);
	});

	it("antwortet ohne IGDB-Zugang mit 503 und bei unbekannter Id mit 404", async () => {
		const ohne = fakeIgdb([[]], { zugang: null }).client;
		expect((await sende(app(ohne), "POST", "/api/plans", { art: "wunsch", igdbId: 1001 })).status).toBe(503);
		const leer = fakeIgdb([[]]).client;
		expect((await sende(app(leer), "POST", "/api/plans", { art: "wunsch", igdbId: 4242 })).status).toBe(404);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM game").first<{ n: number }>()).toMatchObject({ n: 0 });
	});

	it("nimmt Freitext nur ausdruecklich und ohne Rang", async () => {
		const antwort = await sende(app(), "POST", "/api/plans", { art: "wunsch", titel: "  Arbeitstitel  " });
		expect(antwort.status).toBe(201);
		expect(await antwort.json()).toMatchObject({ titel: "Arbeitstitel", spielId: null, rang: null });
	});

	it.each([
		[{}, /'art'/],
		[{ art: "kauf" }, /Genau eines/],
		[{ art: "wunsch", spielId: 1, titel: "x" }, /Genau eines/],
		[{ art: "wunsch", spielId: 999 }, /nicht gefunden/],
		[{ art: "wunsch", releaseId: 999 }, /nicht gefunden/],
		[{ art: "wunsch", titel: 5 }, /'titel'/],
		[{ art: "wunsch", spielId: 1, prioritaet: 6 }, /Priorität/],
		[{ art: "wunsch", spielId: 1, favorit: "ja" }, /'favorit'/],
	])("lehnt %o ab", async (koerper, meldung) => {
		await spiel(1, "Bloodborne", ["PS4"]);
		const antwort = await sende(app(), "POST", "/api/plans", koerper);
		expect([400, 404]).toContain(antwort.status);
		expect(((await antwort.json()) as { fehler: string }).fehler).toMatch(meldung);
	});
});

describe("PATCH und DELETE /api/plans/:id", () => {
	it("aendert Favorit, Status und Art und loescht", async () => {
		await spiel(1, "Bloodborne", []);
		const a = app();
		const { id } = await (await sende(a, "POST", "/api/plans", { art: "wunsch", spielId: 1 })).json();

		const p = await sende(a, "PATCH", `/api/plans/${id}`, { favorit: true, status: "verworfen", notiz: "zu teuer" });
		expect(p.status).toBe(200);
		expect(await p.json()).toMatchObject({ id, favorit: true, status: "verworfen", notiz: "zu teuer", geaendert: true });
		expect((await zeile(id))!.resolved_at).toEqual(expect.any(String));

		expect((await sende(a, "PATCH", `/api/plans/${id}`, { art: "backlog" })).status).toBe(200);
		expect(await zeile(id)).toMatchObject({ kind: "backlog" });

		expect((await sende(a, "PATCH", `/api/plans/${id}`, { status: "weg" })).status).toBe(400);
		expect((await sende(a, "PATCH", "/api/plans/999", { favorit: false })).status).toBe(404);

		expect((await sende(a, "DELETE", `/api/plans/${id}`)).status).toBe(200);
		expect(await zeile(id)).toBeNull();
		expect((await sende(a, "DELETE", `/api/plans/${id}`)).status).toBe(404);
	});
});
