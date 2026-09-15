import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { createApp } from "../src/index";
import { erstellePsnClient } from "../src/psn/client";
import { importAbgleichSchritt, importUebernahmeSchritt } from "../src/sync/wunschliste";
import { fakeIgdb, spielRoh } from "./igdb-fake";
import { fakeFetch } from "./psn-fake";

/**
 * Wunschlisten-Import (Abschnitt 8.2) gegen die lokale D1: Lauf anlegen,
 * Abgleich in Schritten, Blockuebernahme, Einzelentscheidungen. IGDB ist
 * nachgebaut; keine Zeile stammt aus den echten Wunschlisten.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const psnStumm = () => erstellePsnClient(fakeFetch([]).fetch);
const app = (igdb: ReturnType<typeof fakeIgdb>["client"]) => createApp(psnStumm, () => igdb);
const json = (koerper: unknown, method = "POST") => ({
	method,
	headers: { "content-type": "application/json" },
	body: JSON.stringify(koerper),
});

async function spiel(id: number, titel: string, sortTitle: string, plattformen: string[], igdbId: number | null = null) {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title, igdb_id) VALUES (?, ?, ?, ?)").bind(id, titel, sortTitle, igdbId).run();
	for (const p of plattformen) {
		await env.DB.prepare("INSERT INTO release (game_id, platform) VALUES (?, ?)").bind(id, p).run();
	}
}

async function lauf(text: string, extra: Record<string, unknown> = {}): Promise<number> {
	const a = await app(fakeIgdb([[]]).client).request("/api/imports/wishlist", json({ text, ...extra }), env);
	expect(a.status).toBe(201);
	return ((await a.json()) as { id: number }).id;
}

const zeilen = async (importId: number) =>
	(
		await env.DB.prepare(
			"SELECT id, title, platform, listed_at, match_kind, game_id, release_id, igdb_id, decision, plan_entry_id FROM wishlist_import_line WHERE import_id = ? ORDER BY position, id",
		)
			.bind(importId)
			.all<Record<string, unknown>>()
	).results;

const plaene = async () =>
	(await env.DB.prepare("SELECT kind, game_id, release_id, title_raw, origin, status FROM plan_entry ORDER BY id").all<Record<string, unknown>>()).results;

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM wishlist_import"),
		env.DB.prepare("DELETE FROM plan_entry"),
		env.DB.prepare("DELETE FROM release"),
		env.DB.prepare("DELETE FROM game"),
	]);
});

describe("POST /api/imports/wishlist", () => {
	it("parst den Text, nimmt das Jahr aus dem Dateinamen und legt Lauf und Zeilen an", async () => {
		const a = await app(fakeIgdb([[]]).client).request(
			"/api/imports/wishlist",
			json({ text: "﻿-Januar\r\nErstes Spiel\r\n-Mai\r\nZweites Spiel\r\n", dateiname: "2021.txt" }),
			env,
		);
		expect(a.status).toBe(201);
		const k = (await a.json()) as Record<string, unknown>;
		expect(k).toMatchObject({ form: "jahresliste", zeilen: 2, ueberschriften: ["-Januar", "-Mai"], zusammengefuehrt: 0 });
		const z = await zeilen(k.id as number);
		expect(z.map((x) => [x.title, x.listed_at, x.decision])).toEqual([
			["Erstes Spiel", "2021-01", "offen"],
			["Zweites Spiel", "2021-05", "offen"],
		]);
		const l = await env.DB.prepare("SELECT source_name, list_year, form FROM wishlist_import WHERE id = ?").bind(k.id).first();
		expect(l).toEqual({ source_name: "2021.txt", list_year: 2021, form: "jahresliste" });
	});

	it("laesst ein ausdrueckliches Jahr vorgehen und weist Unsinn ab", async () => {
		const id = await lauf("-März\nSpiel\n", { dateiname: "2021.txt", jahr: 2019 });
		expect((await zeilen(id))[0].listed_at).toBe("2019-03");
		const a = await app(fakeIgdb([[]]).client).request("/api/imports/wishlist", json({ text: "Spiel", jahr: "bald" }), env);
		expect(a.status).toBe(400);
		const b = await app(fakeIgdb([[]]).client).request("/api/imports/wishlist", json({ text: "-Januar\n\n" }), env);
		expect(b.status).toBe(400);
	});

	it("listet Laeufe mit Zaehlern", async () => {
		const id = await lauf("Eins\nZwei\n");
		const a = await app(fakeIgdb([[]]).client).request("/api/imports/wishlist", {}, env);
		const k = (await a.json()) as { laeufe: Array<Record<string, unknown>> };
		expect(k.laeufe[0]).toMatchObject({ id, quelle: "Eingabe", form: "einfach", zaehler: { gesamt: 2, ungeprueft: 2, klar: 0 } });
	});
});

describe("importAbgleichSchritt", () => {
	it("trifft die Sammlung ueber den Schluessel - am einzigen Release, ohne IGDB-Anfrage", async () => {
		await spiel(1, "Bloodborne", "bloodborne", ["PS4"]);
		const id = await lauf("bloodborne\n");
		const { client, aufrufe } = fakeIgdb([[]]);
		const e = await importAbgleichSchritt(repos(), client, id);
		expect(e).toMatchObject({ status: "erfolg", geprueft: 1, sammlung: 1, eindeutig: 0, nochOffen: 0, weiter: false });
		expect(aufrufe.filter((a) => /api\.igdb/.test(String(a.url)))).toHaveLength(0);
		expect((await zeilen(id))[0]).toMatchObject({ match_kind: "sammlung", game_id: 1, decision: "offen" });
		expect((await zeilen(id))[0].release_id).not.toBeNull();
	});

	it("haengt den Sammlungstreffer am Spiel, wenn mehrere Releases da sind und die Liste keine Plattform nennt", async () => {
		await spiel(1, "Bloodborne", "bloodborne", ["PS4", "PS5"]);
		const id = await lauf("Bloodborne\n");
		await importAbgleichSchritt(repos(), fakeIgdb([[]]).client, id);
		expect((await zeilen(id))[0]).toMatchObject({ match_kind: "sammlung", game_id: 1, release_id: null });
	});

	it("nimmt bei zwei gleichnamigen Spielen das mit der Plattform aus der Liste", async () => {
		await spiel(1, "God of War (2005)", "god of war", ["PS3"]);
		await spiel(2, "God of War (2018)", "god of war", ["PS4"]);
		const id = await lauf("PS3\nGod of War\n");
		await importAbgleichSchritt(repos(), fakeIgdb([[]]).client, id);
		const z = (await zeilen(id))[0];
		expect(z).toMatchObject({ match_kind: "sammlung", game_id: 1, platform: "PS3" });
	});

	it("markiert einen Sammlungstreffer als schon vorhanden, wenn am Ziel ein offener Wunsch haengt", async () => {
		await spiel(1, "Bloodborne", "bloodborne", ["PS4", "PS5"]);
		await env.DB.prepare("INSERT INTO plan_entry (kind, game_id, origin) VALUES ('wunsch', 1, 'manuell')").run();
		const id = await lauf("Bloodborne\n");
		await importAbgleichSchritt(repos(), fakeIgdb([[]]).client, id);
		expect((await zeilen(id))[0]).toMatchObject({ match_kind: "sammlung", decision: "schon_vorhanden" });
	});

	it("findet einen eindeutigen IGDB-Treffer und speichert die Kandidaten trotzdem", async () => {
		const id = await lauf("Bloodborne\n");
		const { client } = fakeIgdb([[spielRoh(), spielRoh({ id: 1002, name: "Bloodborne: The Old Hunters", game_type: 2 })]]);
		const e = await importAbgleichSchritt(repos(), client, id);
		expect(e).toMatchObject({ geprueft: 1, eindeutig: 1, mehrdeutig: 0 });
		const z = (await zeilen(id))[0];
		expect(z).toMatchObject({ match_kind: "eindeutig", igdb_id: 1001, game_id: null, decision: "offen" });
		const k = await env.DB.prepare("SELECT igdb_id FROM wishlist_import_candidate WHERE line_id = ? ORDER BY position").bind(z.id).all();
		expect(k.results.map((x) => (x as { igdb_id: number }).igdb_id)).toEqual([1001, 1002]);
	});

	it("loest Gleichnamige ueber das Jahr aus der Liste", async () => {
		const id = await lauf("-Februar\nLayers of Fear\n", { jahr: 2016 });
		const alt = spielRoh({ id: 1, name: "Layers of Fear", first_release_date: 1455580800 }); // 2016-02-16
		const neu = spielRoh({ id: 2, name: "Layers of Fear", first_release_date: 1686787200 }); // 2023-06-15
		await importAbgleichSchritt(repos(), fakeIgdb([[alt, neu]]).client, id);
		expect((await zeilen(id))[0]).toMatchObject({ match_kind: "eindeutig", igdb_id: 1 });
	});

	it("verwendet ein Spiel mit derselben IGDB-Id wieder statt ein zweites anzulegen", async () => {
		await spiel(7, "Bloodborne", "bloodborne x", [], 1001);
		const id = await lauf("Bloodborne\n");
		await importAbgleichSchritt(repos(), fakeIgdb([[spielRoh()]]).client, id);
		expect((await zeilen(id))[0]).toMatchObject({ match_kind: "vorhanden", game_id: 7, igdb_id: 1001 });
	});

	it("legt mehrdeutige und leere Ergebnisse in die Durchsicht", async () => {
		const id = await lauf("MediEvil\nGibt es nicht\n");
		const { client } = fakeIgdb([
			[spielRoh({ id: 1, name: "MediEvil", game_type: 8 }), spielRoh({ id: 2, name: "MediEvil", game_type: 11 })],
			[], [], [], [], // Rueckfaelle fuer die zweite Zeile
		]);
		const e = await importAbgleichSchritt(repos(), client, id);
		expect(e).toMatchObject({ geprueft: 2, mehrdeutig: 1, ohneTreffer: 1, status: "erfolg" });
		const z = await zeilen(id);
		expect(z[0]).toMatchObject({ match_kind: "mehrdeutig", igdb_id: null });
		expect(z[1]).toMatchObject({ match_kind: "ohne_treffer" });
	});

	it("arbeitet in Schritten und haelt den Fortschritt in der Datenbank", async () => {
		const id = await lauf("A\nB\nC\n");
		const { client } = fakeIgdb([[spielRoh({ name: "A" })], [spielRoh({ id: 2, name: "B" })], [spielRoh({ id: 3, name: "C" })]]);
		const e1 = await importAbgleichSchritt(repos(), client, id, 2);
		expect(e1).toMatchObject({ status: "laufend", geprueft: 2, nochOffen: 1, weiter: true });
		const e2 = await importAbgleichSchritt(repos(), client, id, 2);
		expect(e2).toMatchObject({ status: "erfolg", geprueft: 1, nochOffen: 0, weiter: false });
	});

	it("beendet den Schritt beim Ratenlimit sauber - geprueft bleibt geprueft", async () => {
		const id = await lauf("A\nB\n");
		const { client } = fakeIgdb([[spielRoh({ name: "A" })], new Response("zu viel", { status: 429 })]);
		const e = await importAbgleichSchritt(repos(), client, id);
		expect(e).toMatchObject({ status: "laufend", geprueft: 1, nochOffen: 1, weiter: true });
		expect((await zeilen(id)).map((z) => z.match_kind)).toEqual(["eindeutig", null]);
	});
});

describe("Blockuebernahme", () => {
	it("uebernimmt klare Zeilen mit origin 'import' - Sammlung am Release, IGDB-Treffer als neues Spiel, eine IGDB-Anfrage", async () => {
		await spiel(1, "Alt", "alt", ["PS3"]);
		const id = await lauf("Alt\nNeu\nNoch neuer\n");
		const neu = spielRoh({ id: 501, name: "Neu" });
		const nochNeuer = spielRoh({ id: 502, name: "Noch neuer", first_release_date: 4102444800 }); // 2100
		await importAbgleichSchritt(repos(), fakeIgdb([[neu], [nochNeuer]]).client, id);

		const { client, aufrufe } = fakeIgdb([[neu, nochNeuer]]);
		const e = await importUebernahmeSchritt(repos(), client, id);
		expect(e).toMatchObject({ status: "erfolg", uebernommen: 3, spieleAngelegt: 2, nochOffen: 0, weiter: false });
		expect(aufrufe.filter((a) => /api\.igdb/.test(String(a.url)))).toHaveLength(1);
		expect(String(aufrufe.at(-1)?.init?.body)).toContain("where id = (501,502)");

		const p = await plaene();
		expect(p).toHaveLength(3);
		expect(p[0]).toMatchObject({ kind: "wunsch", origin: "import", status: "offen", game_id: null, title_raw: null });
		expect(p[0].release_id).not.toBeNull();
		expect(p[1]).toMatchObject({ kind: "wunsch", origin: "import", release_id: null, title_raw: null });
		const spiele = await env.DB.prepare("SELECT title, igdb_id, release_status, igdb_matched_source FROM game ORDER BY id").all();
		expect(spiele.results.slice(1)).toEqual([
			{ title: "Neu", igdb_id: 501, release_status: "erschienen", igdb_matched_source: "manuell" },
			{ title: "Noch neuer", igdb_id: 502, release_status: "angekuendigt", igdb_matched_source: "manuell" },
		]);
		expect((await zeilen(id)).every((z) => z.decision === "uebernommen" && z.plan_entry_id !== null)).toBe(true);
	});

	it("legt bei genannter Plattform das Release an, auch beim Sammlungstreffer", async () => {
		await spiel(1, "Alt", "alt", ["PS4"]);
		const id = await lauf("PS3\nAlt\nNeu\n");
		const neu = spielRoh({ id: 501, name: "Neu", platforms: [9, 48] });
		await importAbgleichSchritt(repos(), fakeIgdb([[neu]]).client, id);
		await importUebernahmeSchritt(repos(), fakeIgdb([[neu]]).client, id);
		const r = await env.DB.prepare("SELECT game_id, platform FROM release ORDER BY id").all();
		expect(r.results).toEqual([
			{ game_id: 1, platform: "PS4" },
			{ game_id: 1, platform: "PS3" },
			{ game_id: 2, platform: "PS3" },
		]);
		expect((await plaene()).every((p) => p.release_id !== null)).toBe(true);
	});

	it("laesst Zeilen aus, deren Ziel inzwischen einen offenen Wunsch hat", async () => {
		await spiel(1, "Alt", "alt", ["PS3"]);
		const id = await lauf("Alt\n");
		await importAbgleichSchritt(repos(), fakeIgdb([[]]).client, id);
		const releaseId = (await zeilen(id))[0].release_id;
		await env.DB.prepare("INSERT INTO plan_entry (kind, release_id, origin) VALUES ('wunsch', ?, 'manuell')").bind(releaseId).run();
		const e = await importUebernahmeSchritt(repos(), fakeIgdb([[]]).client, id);
		expect(e).toMatchObject({ uebernommen: 0, nochOffen: 0 });
		expect((await zeilen(id))[0].decision).toBe("schon_vorhanden");
		expect(await plaene()).toHaveLength(1);
	});

	it("laeuft ueber die Route in Schritten", async () => {
		const id = await lauf("A\nB\n");
		await importAbgleichSchritt(repos(), fakeIgdb([[spielRoh({ id: 1, name: "A" })], [spielRoh({ id: 2, name: "B" })]]).client, id);
		const a = await app(fakeIgdb([[spielRoh({ id: 1, name: "A" }), spielRoh({ id: 2, name: "B" })]]).client).request(
			`/api/imports/wishlist/${id}/uebernehmen`,
			{ method: "POST" },
			env,
		);
		expect(a.status).toBe(200);
		expect(await a.json()).toMatchObject({ uebernommen: 2, weiter: false });
	});
});

describe("Einzelentscheidungen", () => {
	async function unklar(): Promise<{ id: number; zeileId: number }> {
		const id = await lauf("PS4\nMediEvil\n");
		const { client } = fakeIgdb([[spielRoh({ id: 1, name: "MediEvil", game_type: 8 }), spielRoh({ id: 2, name: "MediEvil", game_type: 11 })]]);
		await importAbgleichSchritt(repos(), client, id);
		return { id, zeileId: (await zeilen(id))[0].id as number };
	}

	it("liefert die Gruppen mit Kandidaten", async () => {
		const { id } = await unklar();
		const a = await app(fakeIgdb([[]]).client).request(`/api/imports/wishlist/${id}?gruppe=unklar`, {}, env);
		const k = (await a.json()) as { gesamt: number; zeilen: Array<Record<string, unknown>> };
		expect(k.gesamt).toBe(1);
		expect(k.zeilen[0]).toMatchObject({ titel: "MediEvil", plattform: "PS4", treffer: "mehrdeutig", entscheidung: "offen" });
		expect((k.zeilen[0].kandidaten as unknown[]).length).toBe(2);
		const b = await app(fakeIgdb([[]]).client).request(`/api/imports/wishlist/${id}?gruppe=klar`, {}, env);
		expect(((await b.json()) as { gesamt: number }).gesamt).toBe(0);
		const c = await app(fakeIgdb([[]]).client).request(`/api/imports/wishlist/${id}?gruppe=egal`, {}, env);
		expect(c.status).toBe(400);
	});

	it("uebernimmt einen gewaehlten Kandidaten sofort - mit der Plattform aus der Liste - und nimmt ihn zurueck", async () => {
		const { id, zeileId } = await unklar();
		const a = await app(fakeIgdb([[spielRoh({ id: 2, name: "MediEvil", game_type: 11 })]]).client).request(
			`/api/imports/wishlist/${id}/zeilen/${zeileId}/entscheiden`,
			json({ aktion: "igdb", igdbId: 2 }),
			env,
		);
		expect(a.status).toBe(201);
		expect(await a.json()).toMatchObject({ entscheidung: "uebernommen", spielAngelegt: true });
		const p = await plaene();
		expect(p).toHaveLength(1);
		expect(p[0]).toMatchObject({ origin: "import", game_id: null });
		const r = await env.DB.prepare("SELECT platform FROM release WHERE id = ?").bind(p[0].release_id).first();
		expect(r).toEqual({ platform: "PS4" });

		const b = await app(fakeIgdb([[]]).client).request(
			`/api/imports/wishlist/${id}/zeilen/${zeileId}/entscheiden`,
			json({ aktion: "zuruecknehmen" }),
			env,
		);
		expect(b.status).toBe(200);
		expect(await plaene()).toHaveLength(0);
		expect((await zeilen(id))[0]).toMatchObject({ decision: "offen", plan_entry_id: null });
	});

	it("laesst die Plattform ausdruecklich weg, wenn der Koerper '' schickt", async () => {
		const { id, zeileId } = await unklar();
		await app(fakeIgdb([[spielRoh({ id: 2, name: "MediEvil" })]]).client).request(
			`/api/imports/wishlist/${id}/zeilen/${zeileId}/entscheiden`,
			json({ aktion: "igdb", igdbId: 2, plattform: "" }),
			env,
		);
		expect((await plaene())[0]).toMatchObject({ release_id: null });
		expect((await plaene())[0].game_id).not.toBeNull();
	});

	it("legt Freitext nur auf ausdrueckliche Anweisung an, ohne Plattform", async () => {
		const { id, zeileId } = await unklar();
		const a = await app(fakeIgdb([[]]).client).request(
			`/api/imports/wishlist/${id}/zeilen/${zeileId}/entscheiden`,
			json({ aktion: "freitext" }),
			env,
		);
		expect(a.status).toBe(201);
		expect(await plaene()).toEqual([{ kind: "wunsch", game_id: null, release_id: null, title_raw: "MediEvil", origin: "import", status: "offen" }]);
	});

	it("ueberspringen ist eine gespeicherte Entscheidung und blockiert eine zweite", async () => {
		const { id, zeileId } = await unklar();
		const a = await app(fakeIgdb([[]]).client).request(`/api/imports/wishlist/${id}/zeilen/${zeileId}/entscheiden`, json({ aktion: "ueberspringen" }), env);
		expect(a.status).toBe(200);
		expect((await zeilen(id))[0].decision).toBe("uebersprungen");
		const b = await app(fakeIgdb([[]]).client).request(`/api/imports/wishlist/${id}/zeilen/${zeileId}/entscheiden`, json({ aktion: "freitext" }), env);
		expect(b.status).toBe(409);
		const c = await app(fakeIgdb([[]]).client).request(`/api/imports/wishlist/${id}?gruppe=uebersprungen`, {}, env);
		expect(((await c.json()) as { gesamt: number }).gesamt).toBe(1);
	});

	it("antwortet 409 und markiert die Zeile, wenn das Ziel schon einen offenen Wunsch hat", async () => {
		await spiel(9, "MediEvil", "medievil", [], 2);
		await env.DB.prepare("INSERT INTO plan_entry (kind, game_id, origin) VALUES ('wunsch', 9, 'manuell')").run();
		const id = await lauf("MediEvil\n");
		await importAbgleichSchritt(repos(), fakeIgdb([[spielRoh({ id: 2, name: "MediEvil" }), spielRoh({ id: 3, name: "MediEvil" })]]).client, id);
		const zeileId = (await zeilen(id))[0].id;
		const a = await app(fakeIgdb([[]]).client).request(`/api/imports/wishlist/${id}/zeilen/${zeileId}/entscheiden`, json({ aktion: "igdb", igdbId: 2 }), env);
		expect(a.status).toBe(409);
		expect((await zeilen(id))[0].decision).toBe("schon_vorhanden");
	});

	it("umbenennen setzt den Abgleich der Zeile zurueck, aufteilen ersetzt sie durch mehrere", async () => {
		const { id, zeileId } = await unklar();
		const a = await app(fakeIgdb([[]]).client).request(`/api/imports/wishlist/${id}/zeilen/${zeileId}`, json({ titel: "MediEvil Remake" }, "PATCH"), env);
		expect(a.status).toBe(200);
		expect((await zeilen(id))[0]).toMatchObject({ title: "MediEvil Remake", match_kind: null, decision: "offen" });
		expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM wishlist_import_candidate").first<{ n: number }>())?.n).toBe(0);

		const b = await app(fakeIgdb([[]]).client).request(
			`/api/imports/wishlist/${id}/zeilen/${zeileId}/aufteilen`,
			json({ titel: ["Mass Effect", " Mass Effect 2 ", ""] }),
			env,
		);
		expect(b.status).toBe(201);
		const z = await zeilen(id);
		expect(z.map((x) => [x.title, x.platform, x.decision])).toEqual([
			["MediEvil Remake", "PS4", "aufgeteilt"],
			["Mass Effect", "PS4", "offen"],
			["Mass Effect 2", "PS4", "offen"],
		]);
		const c = await app(fakeIgdb([[]]).client).request(`/api/imports/wishlist/${id}`, {}, env);
		expect(((await c.json()) as { zaehler: { ungeprueft: number } }).zaehler.ungeprueft).toBe(2);
	});

	it("weist fremde Zeilen und fehlende Laeufe ab und loescht einen Lauf samt Zeilen", async () => {
		const { id, zeileId } = await unklar();
		const anderer = await lauf("Etwas\n");
		const a = await app(fakeIgdb([[]]).client).request(`/api/imports/wishlist/${anderer}/zeilen/${zeileId}/entscheiden`, json({ aktion: "ueberspringen" }), env);
		expect(a.status).toBe(404);
		const b = await app(fakeIgdb([[]]).client).request("/api/imports/wishlist/999/abgleich", { method: "POST" }, env);
		expect(b.status).toBe(404);
		const c = await app(fakeIgdb([[]]).client).request(`/api/imports/wishlist/${id}`, { method: "DELETE" }, env);
		expect(c.status).toBe(200);
		expect(await zeilen(id)).toEqual([]);
		expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM wishlist_import_candidate").first<{ n: number }>())?.n).toBe(0);
	});
});
