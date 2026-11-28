import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/index";
import { erstellePsnClient } from "../src/psn/client";
import { fakeIgdb } from "./igdb-fake";
import { fakeFetch } from "./psn-fake";

/**
 * Barcode-Erfassung (Abschnitt 9, Stufe 17): Aufloesungskette, offene Scans,
 * Zuordnen mit Disc + Mapping + Protokoll + erledigten Absichten.
 */

const B = "https://example.com";
const EAN = "4006381333931"; // gueltige Pruefziffer
const EAN2 = "5021290067479";

const hole = async (pfad: string) => (await SELF.fetch(`${B}${pfad}`)).json() as Promise<any>;
const sende = (methode: "POST" | "DELETE", pfad: string, koerper?: unknown) =>
	SELF.fetch(`${B}${pfad}`, {
		method: methode,
		headers: { "content-type": "application/json" },
		body: koerper === undefined ? undefined : typeof koerper === "string" ? koerper : JSON.stringify(koerper),
	});
const scan = (ean: unknown) => sende("POST", "/api/scan", { ean });

async function leeren() {
	await env.DB.batch(
		["game_event", "ean_mapping", "unresolved_scan", "market_offer", "plan_entry", "physical_copy", "release", "game"].map((t) =>
			env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
}

async function release(id = 1, plattform = "PS4"): Promise<number> {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title, cover_url) VALUES (?, ?, ?, ?)")
		.bind(id, `Spiel ${id}`, `spiel ${id}`, `https://bilder/${id}.jpg`)
		.run();
	await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, ?, ?)").bind(id, id, plattform).run();
	return id;
}

const offene = () => env.DB.prepare("SELECT ean, scan_count FROM unresolved_scan ORDER BY ean").all().then((r) => r.results);
const mappings = () => env.DB.prepare("SELECT ean, release_id, source FROM ean_mapping ORDER BY ean").all().then((r) => r.results);

beforeEach(leeren);

describe("POST /api/scan", () => {
	it.each([
		[undefined, /8 bis 14/],
		["12", /8 bis 14/],
		["40123A5678901", /8 bis 14/],
		["4006381333913", /Prüfziffer/],
	])("lehnt %o ab", async (ean, meldung) => {
		const a = await scan(ean);
		expect(a.status).toBe(400);
		expect((await a.json() as any).fehler).toMatch(meldung);
		expect(await offene()).toEqual([]);
	});

	it("schreibt einen unbekannten Code nicht mehr weg (Stufe 17d)", async () => {
		// Bis Stufe 17c blieb er als offener Scan stehen. Ein Code ohne seine
		// Huelle liess sich aber spaeter nicht zuordnen - die Liste erzeugte
		// Arbeit statt Nutzen (Entscheidung des Nutzers vom 21.09.2026).
		expect(await (await scan(EAN)).json()).toEqual({ ean: EAN, treffer: "keiner", scans: 0 });
		expect(await (await scan(` ${EAN} `)).json()).toEqual({ ean: EAN, treffer: "keiner", scans: 0 });
		expect(await offene()).toEqual([]);
	});

	it("trifft ein Mapping mit Titel, Cover und Exemplaren, ohne offenen Scan", async () => {
		const r = await release();
		await env.DB.prepare("INSERT INTO ean_mapping (ean, release_id) VALUES (?, ?)").bind(EAN, r).run();
		await env.DB.prepare("INSERT INTO physical_copy (release_id, ean) VALUES (?, ?)").bind(r, EAN).run();
		expect(await (await scan(EAN)).json()).toEqual({
			ean: EAN,
			treffer: "mapping",
			release: { releaseId: r, spielId: 1, titel: "Spiel 1", plattform: "PS4", bild: "https://bilder/1.jpg", exemplare: 1 },
			huelle: [{ releaseId: r, spielId: 1, titel: "Spiel 1", plattform: "PS4", bild: "https://bilder/1.jpg", exemplare: 1 }],
			scans: 0,
		});
		expect(await offene()).toEqual([]);
	});

	it("nennt ein Haendlerangebot als Vorschlag (Stufe 2 der Kette)", async () => {
		await env.DB.prepare(
			"INSERT INTO market_offer (source, source_product_id, ean, title_raw, platform_raw, imported_at) VALUES ('rebuy', 'x1', ?, 'Fallout 4', 'PS4', datetime('now'))",
		).bind(EAN).run();
		expect(await (await scan(EAN)).json()).toEqual({ ean: EAN, treffer: "angebot", angebot: { titel: "Fallout 4", plattform: "PS4" }, scans: 0 });
	});
});

describe("POST /api/scan/:ean/assign", () => {
	const eintrag = (kind: string, ziel: { release?: number; game?: number }) =>
		env.DB.prepare("INSERT INTO plan_entry (kind, release_id, game_id, origin, status) VALUES (?, ?, ?, 'manuell', 'offen') RETURNING id")
			.bind(kind, ziel.release ?? null, ziel.game ?? null)
			.first<{ id: number }>();

	it("legt Disc und Mapping an, erledigt den offenen Scan und Kauf/Wunsch, protokolliert 'scan'", async () => {
		const r = await release();
		const kauf = await eintrag("kauf", { release: r });
		const wunsch = await eintrag("wunsch", { game: 1 });
		await scan(EAN);

		const a = await sende("POST", `/api/scan/${EAN}/assign`, { releaseId: r });
		expect(a.status).toBe(201);
		expect(await a.json()).toMatchObject({
			ean: EAN,
			releaseId: r,
			physischStatusGesetzt: true,
			spiel: { spielId: 1, titel: "Spiel 1", plattform: "PS4" },
			absichtenErledigt: [
				{ id: kauf!.id, art: "kauf" },
				{ id: wunsch!.id, art: "wunsch" },
			],
			aufListe: false,
		});

		expect(await env.DB.prepare("SELECT release_id, ean FROM physical_copy").all().then((x) => x.results)).toEqual([{ release_id: r, ean: EAN }]);
		expect(await mappings()).toEqual([{ ean: EAN, release_id: r, source: "manuell" }]);
		expect(await offene()).toEqual([]);
		const ereignis = await env.DB.prepare("SELECT kind, detail, source FROM game_event WHERE kind = 'exemplar_angelegt'").first();
		expect(ereignis).toEqual({ kind: "exemplar_angelegt", detail: "scan", source: "nutzer" });
		const texte = ((await hole("/api/games/1/events")).ereignisse as Array<{ text: string }>).map((e) => e.text);
		expect(texte).toContain("Disc erfasst (per Barcode)");
	});

	it("legt ueber spielId + plattform das Release an, wenn es fehlt, und verwendet ein vorhandenes", async () => {
		await release(1, "PS4");
		const a = await sende("POST", `/api/scan/${EAN}/assign`, { spielId: 1, plattform: "PS5" });
		expect(a.status).toBe(201);
		const { releaseId } = (await a.json()) as any;
		expect(releaseId).not.toBe(1);
		expect(await env.DB.prepare("SELECT platform FROM release WHERE id = ?").bind(releaseId).first()).toEqual({ platform: "PS5" });
		expect(await env.DB.prepare("SELECT detail FROM game_event WHERE kind = 'release_angelegt'").first()).toEqual({ detail: "scan" });

		const b = await sende("POST", `/api/scan/${EAN2}/assign`, { spielId: 1, plattform: "PS4" });
		expect(((await b.json()) as any).releaseId).toBe(1);
	});

	it("ueberschreibt ein Mapping beim erneuten Zuordnen (Korrektur) und legt ein weiteres Exemplar an", async () => {
		await release(1);
		await release(2);
		await sende("POST", `/api/scan/${EAN}/assign`, { releaseId: 1 });
		await sende("POST", `/api/scan/${EAN}/assign`, { releaseId: 2 });
		expect(await mappings()).toEqual([{ ean: EAN, release_id: 2, source: "manuell" }]);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM physical_copy").first()).toEqual({ n: 2 });
	});

	it("prueft Eingaben und Ziele", async () => {
		await release(1);
		expect((await sende("POST", `/api/scan/${EAN}/assign`, {})).status).toBe(400);
		expect((await sende("POST", `/api/scan/${EAN}/assign`, { releaseId: 1, spielId: 1, plattform: "PS4" })).status).toBe(400);
		expect((await sende("POST", `/api/scan/${EAN}/assign`, { releaseId: 999 })).status).toBe(404);
		expect((await sende("POST", `/api/scan/${EAN}/assign`, { spielId: 999, plattform: "PS4" })).status).toBe(404);
		expect((await sende("POST", `/api/scan/${EAN}/assign`, { spielId: 1, plattform: "PC" })).status).toBe(400);
		expect((await sende("POST", `/api/scan/${EAN}/assign`, "kaputt")).status).toBe(400);
		expect((await sende("POST", `/api/scan/12/assign`, { releaseId: 1 })).status).toBe(400);
		expect(await mappings()).toEqual([]);
	});
});

describe("Mapping loesen", () => {
	it("loest ein Mapping, die Disc bleibt", async () => {
		const r = await release();
		await sende("POST", `/api/scan/${EAN}/assign`, { releaseId: r });
		expect((await sende("DELETE", `/api/scan/${EAN}`)).status).toBe(200);
		expect((await sende("DELETE", `/api/scan/${EAN}`)).status).toBe(404);
		expect(await mappings()).toEqual([]);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM physical_copy").first()).toEqual({ n: 1 });
		expect(await (await scan(EAN)).json()).toMatchObject({ treffer: "keiner", scans: 0 });
	});
});

/**
 * Eine Huelle, mehrere Spiele (Nachtrag f1h): Collection-Discs. Jedes Spiel
 * bekommt seine eigene Disc mit demselben Code; das Mapping zeigt auf das
 * erste Ziel.
 */
describe("POST /api/scan/:ean/assign mit mehreren Zielen (Nachtrag f1h)", () => {
	const eintrag = (kind: string, ziel: { release?: number; game?: number }) =>
		env.DB.prepare("INSERT INTO plan_entry (kind, release_id, game_id, origin, status) VALUES (?, ?, ?, 'manuell', 'offen') RETURNING id")
			.bind(kind, ziel.release ?? null, ziel.game ?? null)
			.first<{ id: number }>();
	const discs = () => env.DB.prepare("SELECT release_id, ean FROM physical_copy ORDER BY release_id").all().then((x) => x.results);
	const ereignisse = () =>
		env.DB.prepare("SELECT kind, release_id, detail FROM game_event ORDER BY id").all().then((x) => x.results);

	it("legt zwei Discs mit demselben Code in einem Zug an, erledigt je Release die Absichten", async () => {
		await release(1, "PS3");
		await release(2, "PS3");
		const wunsch = await eintrag("wunsch", { game: 2 });
		await eintrag("backlog", { release: 1 });

		const a = await sende("POST", `/api/scan/${EAN}/assign`, { ziele: [{ releaseId: 1 }, { spielId: 2, plattform: "PS3" }] });
		expect(a.status).toBe(201);
		const d = (await a.json()) as any;
		expect(d).toMatchObject({ id: d.discs[0].id, releaseId: 1, spiel: { spielId: 1 }, absichtenErledigt: [{ id: wunsch!.id, art: "wunsch" }] });
		expect(d.discs).toHaveLength(2);
		expect(d.discs[0]).toMatchObject({ releaseId: 1, physischStatusGesetzt: true, releaseNeu: false, absichtenErledigt: [], aufListe: true });
		expect(d.discs[1]).toMatchObject({ releaseId: 2, releaseNeu: false, absichtenErledigt: [{ id: wunsch!.id }], aufListe: false, spiel: { spielId: 2, titel: "Spiel 2", plattform: "PS3" } });

		expect(await discs()).toEqual([
			{ release_id: 1, ean: EAN },
			{ release_id: 2, ean: EAN },
		]);
		expect(await mappings()).toEqual([{ ean: EAN, release_id: 1, source: "manuell" }]);
		expect(await env.DB.prepare("SELECT status FROM plan_entry WHERE id = ?").bind(wunsch!.id).first()).toEqual({ status: "erledigt" });
		const e = await ereignisse();
		expect(e.filter((x: any) => x.kind === "exemplar_angelegt")).toEqual([
			{ kind: "exemplar_angelegt", release_id: 1, detail: "scan" },
			{ kind: "exemplar_angelegt", release_id: 2, detail: "scan" },
		]);
		expect(e.filter((x: any) => x.kind === "liste_eintrag_erledigt")).toHaveLength(1);
		expect(e.filter((x: any) => x.kind === "release_geaendert")).toHaveLength(2);
	});

	it("legt ein fehlendes Release an und nennt es als neu", async () => {
		await release(1, "PS3");
		await release(2, "PS4");
		const a = await sende("POST", `/api/scan/${EAN}/assign`, { ziele: [{ releaseId: 1 }, { spielId: 2, plattform: "PS3" }] });
		expect(a.status).toBe(201);
		const d = (await a.json()) as any;
		expect(d.discs[1].releaseNeu).toBe(true);
		expect(d.discs[1].releaseId).not.toBe(2);
		expect(await env.DB.prepare("SELECT platform FROM release WHERE id = ?").bind(d.discs[1].releaseId).first()).toEqual({ platform: "PS3" });
	});

	it("409 an einem der beiden: nichts geschrieben, die Antwort nennt das Release", async () => {
		await release(1, "PS3");
		await release(2, "PS3");
		await release(3, "PS4");
		await env.DB.prepare("INSERT INTO physical_copy (release_id, ean) VALUES (2, ?)").bind(EAN2).run();
		await eintrag("wunsch", { release: 1 });
		const vorher = await ereignisse();

		const a = await sende("POST", `/api/scan/${EAN}/assign`, {
			ziele: [{ releaseId: 1 }, { releaseId: 2 }, { spielId: 3, plattform: "PS3" }],
		});
		expect(a.status).toBe(409);
		expect(await a.json()).toMatchObject({ releaseId: 2, title: "Spiel 2", platform: "PS3", belegt: [2] });

		expect(await discs()).toEqual([{ release_id: 2, ean: EAN2 }]);
		expect(await mappings()).toEqual([]);
		expect(await ereignisse()).toEqual(vorher);
		// Auch das Release fuer "Spiel 3 auf PS3" ist nicht entstanden.
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM release WHERE game_id = 3").first()).toEqual({ n: 1 });
		expect(await env.DB.prepare("SELECT status FROM plan_entry").first()).toEqual({ status: "offen" });
	});

	it("ein Ziel als Liste verhaelt sich wie der Einzelkoerper - auch beim 409 mit Mapping", async () => {
		await release(1);
		await env.DB.prepare("INSERT INTO physical_copy (release_id) VALUES (1)").run();
		const a = await sende("POST", `/api/scan/${EAN}/assign`, { ziele: [{ releaseId: 1 }] });
		expect(a.status).toBe(409);
		expect(await mappings()).toEqual([{ ean: EAN, release_id: 1, source: "manuell" }]);
		const b = await sende("POST", `/api/scan/${EAN2}/assign`, { releaseId: 1 });
		expect(b.status).toBe(409);
		expect(await b.json()).toMatchObject({ releaseId: 1, game_id: 1, title: "Spiel 1", platform: "PS4" });
	});

	it("der Einzelkoerper antwortet wie bisher und traegt die Disc zusaetzlich in `discs`", async () => {
		await release(1);
		const a = await sende("POST", `/api/scan/${EAN}/assign`, { releaseId: 1 });
		expect(a.status).toBe(201);
		const d = (await a.json()) as any;
		expect(d).toMatchObject({ ean: EAN, releaseId: 1, physischStatusGesetzt: true, spiel: { spielId: 1, titel: "Spiel 1", plattform: "PS4" }, absichtenErledigt: [], aufListe: false });
		expect(d.discs).toEqual([expect.objectContaining({ id: d.id, releaseId: 1 })]);
	});

	it("prueft die Liste", async () => {
		await release(1);
		await release(2);
		for (const koerper of [
			{ ziele: [] },
			{ ziele: "1" },
			{ ziele: [{ releaseId: 1 }], releaseId: 1 },
			{ ziele: [{ releaseId: 1 }, { releaseId: 1 }] },
			{ ziele: [{ spielId: 2, plattform: "PS4" }, { releaseId: 2 }] },
			{ ziele: [{ spielId: 2, plattform: "PS5" }, { spielId: 2, plattform: "PS5" }] },
			{ ziele: [{ releaseId: 1 }, { spielId: 2, plattform: "PC" }] },
			{ ziele: Array.from({ length: 7 }, (_, i) => ({ releaseId: i + 1 })) },
		]) {
			expect((await sende("POST", `/api/scan/${EAN}/assign`, koerper)).status, JSON.stringify(koerper)).toBe(400);
		}
		expect((await sende("POST", `/api/scan/${EAN}/assign`, { ziele: [{ releaseId: 1 }, { releaseId: 99 }] })).status).toBe(404);
		expect((await sende("POST", `/api/scan/${EAN}/assign`, { ziele: [{ releaseId: 1 }, { spielId: 99, plattform: "PS4" }] })).status).toBe(404);
		expect(await discs()).toEqual([]);
		expect(await mappings()).toEqual([]);
	});

	it("schreibt Discs, Ereignisse, erledigte Absichten und Mapping in EINEM Batch", async () => {
		await release(1, "PS3");
		await release(2, "PS3");
		await eintrag("kauf", { release: 2 });
		const { db, batches } = batchProtokoll(env.DB);
		const app = createApp(
			() => erstellePsnClient(fakeFetch([]).fetch),
			() => fakeIgdb([[]], { zugang: null }).client,
		);
		const a = await app.request(
			`/api/scan/${EAN}/assign`,
			{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ziele: [{ releaseId: 1 }, { releaseId: 2 }] }) },
			{ ...env, DB: db },
		);
		expect(a.status).toBe(201);
		const schreibend = batches.filter((b) => b.some((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql)));
		expect(schreibend).toHaveLength(1);
		const b = schreibend[0];
		expect(b.filter((sql) => sql.startsWith("INSERT INTO physical_copy"))).toHaveLength(2);
		expect(b.filter((sql) => sql.startsWith("INSERT INTO game_event"))).toHaveLength(5);
		expect(b.some((sql) => sql.startsWith("UPDATE plan_entry"))).toBe(true);
		expect(b.some((sql) => sql.startsWith("INSERT INTO ean_mapping"))).toBe(true);
		// Kein Schreiben ausserhalb des Batches.
		expect(einzelnGeschrieben(db)).toEqual([]);
	});
});

describe("Ein bekannter Code zeigt die ganze Huelle (Nachtrag f1h)", () => {
	it("POST /api/scan nennt alle Spiele mit Discs dieses Codes, das Mapping-Release vorn", async () => {
		await release(1, "PS3");
		await release(2, "PS3");
		await sende("POST", `/api/scan/${EAN}/assign`, { ziele: [{ releaseId: 2 }, { releaseId: 1 }] });
		const t = await (await scan(EAN)).json() as any;
		expect(t.treffer).toBe("mapping");
		expect(t.release).toMatchObject({ releaseId: 2, exemplare: 1 });
		expect(t.huelle).toEqual([
			{ releaseId: 2, spielId: 2, titel: "Spiel 2", plattform: "PS3", bild: "https://bilder/2.jpg", exemplare: 1 },
			{ releaseId: 1, spielId: 1, titel: "Spiel 1", plattform: "PS3", bild: "https://bilder/1.jpg", exemplare: 1 },
		]);
	});

	it("das Spieldetail nennt am Exemplar die anderen Spiele derselben Huelle", async () => {
		await release(1, "PS3");
		await release(2, "PS3");
		await release(3, "PS3");
		await sende("POST", `/api/scan/${EAN}/assign`, { ziele: [{ releaseId: 1 }, { releaseId: 2 }] });
		await sende("POST", `/api/scan/${EAN2}/assign`, { releaseId: 3 });
		const s = await hole("/api/games/1");
		expect(s.releases[0].exemplare[0].gleicheHuelle).toEqual([{ spielId: 2, titel: "Spiel 2", plattform: "PS3" }]);
		const drei = await hole("/api/games/3");
		expect(drei.releases[0].exemplare[0].gleicheHuelle).toEqual([]);
	});

	it("die Liste der Exemplare zaehlt Huellen neben den Zeilen", async () => {
		await release(1, "PS3");
		await release(2, "PS3");
		await release(3, "PS4");
		await sende("POST", `/api/scan/${EAN}/assign`, { ziele: [{ releaseId: 1 }, { releaseId: 2 }] });
		await env.DB.prepare("INSERT INTO physical_copy (release_id) VALUES (3)").run();
		expect(await hole("/api/physical-copies")).toMatchObject({ gesamt: 3, huellen: 2 });
	});
});

/** Zeichnet je Batch die SQL seiner Anweisungen auf - und was einzeln geschrieben wurde. */
function batchProtokoll(echt: D1Database): { db: D1Database; batches: string[][] } {
	const batches: string[][] = [];
	const sqlVon = new WeakMap<object, string>();
	const einzeln: string[] = [];
	const huelle = (st: D1PreparedStatement, sql: string): D1PreparedStatement => {
		const p = new Proxy(st, {
			get(ziel, name) {
				if (name === "bind") return (...w: unknown[]) => huelle(ziel.bind(...w), sql);
				if ((name === "run" || name === "all" || name === "first") && /^\s*(INSERT|UPDATE|DELETE)/.test(sql)) einzeln.push(sql);
				const wert = Reflect.get(ziel, name, ziel);
				return typeof wert === "function" ? wert.bind(ziel) : wert;
			},
		});
		sqlVon.set(p, sql);
		echteAnweisung.set(p, st);
		return p;
	};
	const echteAnweisung = new WeakMap<object, D1PreparedStatement>();
	const db = new Proxy(echt, {
		get(ziel, name) {
			if (name === "prepare") return (sql: string) => huelle(ziel.prepare(sql), sql.trim());
			if (name === "batch") {
				return (anweisungen: D1PreparedStatement[]) => {
					batches.push(anweisungen.map((a) => sqlVon.get(a) ?? "?"));
					return ziel.batch(anweisungen.map((a) => echteAnweisung.get(a) ?? a));
				};
			}
			const wert = Reflect.get(ziel, name, ziel);
			return typeof wert === "function" ? wert.bind(ziel) : wert;
		},
	});
	einzelnProtokolle.set(db, einzeln);
	return { db, batches };
}
const einzelnProtokolle = new WeakMap<object, string[]>();
const einzelnGeschrieben = (db: D1Database) => einzelnProtokolle.get(db) ?? [];
