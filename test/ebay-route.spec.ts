import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index";
import { erstellePsnClient } from "../src/psn/client";
import { fakeEbay } from "./ebay-fake";
import { fakeFetch, jsonAntwort } from "./psn-fake";

/**
 * GET /api/scan/:ean/online - der Code wird beim Scannen live aufgeloest
 * (Stufe 17c, Abschnitt 9.2). Geprueft wird der Vorschlag, nicht eine
 * Zuordnung: Geschrieben wird ausschliesslich der Titel am offenen Scan.
 */

const psnStumm = () => erstellePsnClient(fakeFetch([]).fetch);
const igdbEgal = () => ({ konfiguriert: () => false }) as never;
const app = (ebay: ReturnType<typeof fakeEbay>["client"]) => createApp(psnStumm, igdbEgal, () => ebay);

const EAN = "5026555403719";

async function spiel(id: number, titel: string, plattformen: string[]) {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)").bind(id, titel, titel.toLowerCase()).run();
	for (const p of plattformen) {
		await env.DB.prepare("INSERT INTO release (game_id, platform) VALUES (?, ?)").bind(id, p).run();
	}
}

const offenerScan = (ean: string) =>
	env.DB.prepare("SELECT title_raw, title_source, checked_at FROM unresolved_scan WHERE ean = ?").bind(ean).first<{
		title_raw: string | null;
		title_source: string | null;
		checked_at: string | null;
	}>();

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM unresolved_scan"),
		env.DB.prepare("DELETE FROM ean_mapping"),
		env.DB.prepare("DELETE FROM release"),
		env.DB.prepare("DELETE FROM game"),
		env.DB.prepare("INSERT INTO unresolved_scan (ean, scan_count) VALUES (?, 1)").bind(EAN),
	]);
});

describe("GET /api/scan/:ean/online", () => {
	it("schlaegt das Spiel vor, das die Mehrheit der Angebote nennt", async () => {
		await spiel(1, "Killzone", ["PS3"]);
		await spiel(2, "Killzone 3", ["PS3"]);
		const { client, aufrufe } = fakeEbay([
			["Killzone 3 PS3 Sony PlayStation 3", "Killzone 3 - PAL - deutsch", "Killzone 3 CiB OVP"],
		]);

		const antwort = await app(client).request(`/api/scan/${EAN}/online`, undefined, env);
		expect(antwort.status).toBe(200);
		const daten = (await antwort.json()) as Record<string, unknown>;

		expect(daten).toMatchObject({ ean: EAN, quelle: "ebay", angebote: 3, eindeutig: true, zielSpielId: 2 });
		// Das Ziel steht vorn, die schwaechere Alternative bleibt sichtbar:
		// Eine Zuordnung muss korrigierbar sein (Abschnitt 9.3).
		expect(daten.kandidaten).toMatchObject([
			{ spielId: 2, titel: "Killzone 3", releases: [{ plattform: "PS3" }] },
			{ spielId: 1, titel: "Killzone" },
		]);
		// Die GTIN steht in der Abfrage, das Limit auch.
		expect(aufrufe.at(-1)?.url).toContain(`gtin=${EAN}`);
	});

	it("vermerkt den Titel am offenen Scan, damit er nicht zweimal geholt wird", async () => {
		await spiel(1, "Killzone 3", ["PS3"]);
		await app(fakeEbay([["Killzone 3 PS3 PAL"]]).client).request(`/api/scan/${EAN}/online`, undefined, env);

		expect(await offenerScan(EAN)).toMatchObject({ title_raw: "Killzone 3 PS3 PAL", title_source: "ebay" });
		expect((await offenerScan(EAN))?.checked_at).not.toBeNull();
	});

	it("meldet einen Titel ohne Spiel der Sammlung - die Vorlage zum Anlegen", async () => {
		const antwort = await app(fakeEbay([["Ein Spiel das ich nicht besitze PS4"]]).client).request(
			`/api/scan/${EAN}/online`,
			undefined,
			env,
		);
		const daten = (await antwort.json()) as Record<string, unknown>;

		expect(daten).toMatchObject({ eindeutig: false, zielSpielId: null, titel: "Ein Spiel das ich nicht besitze PS4", kandidaten: [] });
	});

	it("kennt eBay den Code nicht, wird auch das vermerkt", async () => {
		const antwort = await app(fakeEbay([[]]).client).request(`/api/scan/${EAN}/online`, undefined, env);
		const daten = (await antwort.json()) as Record<string, unknown>;

		expect(daten).toMatchObject({ angebote: 0, titel: null, eindeutig: false });
		// checked_at gesetzt, Titel null: Der Job fragt den Code nicht erneut.
		expect(await offenerScan(EAN)).toMatchObject({ title_raw: null, title_source: null });
		expect((await offenerScan(EAN))?.checked_at).not.toBeNull();
	});

	it("ordnet nichts von selbst zu", async () => {
		await spiel(1, "Killzone 3", ["PS3"]);
		await app(fakeEbay([["Killzone 3 PS3 PAL"]]).client).request(`/api/scan/${EAN}/online`, undefined, env);

		const mapping = await env.DB.prepare("SELECT COUNT(*) AS n FROM ean_mapping").first<{ n: number }>();
		const discs = await env.DB.prepare("SELECT COUNT(*) AS n FROM physical_copy").first<{ n: number }>();
		expect([mapping?.n, discs?.n]).toEqual([0, 0]);
	});

	it("antwortet ohne Zugangsdaten mit 503, ohne etwas zu schreiben", async () => {
		const antwort = await app(fakeEbay([[]], { zugang: null }).client).request(`/api/scan/${EAN}/online`, undefined, env);

		expect(antwort.status).toBe(503);
		expect(await offenerScan(EAN)).toMatchObject({ checked_at: null });
	});

	it("reicht ein Ratenlimit als 503 weiter und einen Abrufsfehler als 502", async () => {
		const limit = await app(fakeEbay([new Response("{}", { status: 429 })]).client).request(`/api/scan/${EAN}/online`, undefined, env);
		expect(limit.status).toBe(503);

		const kaputt = await app(fakeEbay([new Response("{}", { status: 500 })]).client).request(`/api/scan/${EAN}/online`, undefined, env);
		expect(kaputt.status).toBe(502);
		// Ohne Antwort kein Vermerk - der naechtliche Job versucht es erneut.
		expect(await offenerScan(EAN)).toMatchObject({ checked_at: null });
	});

	it("weist eine unsinnige EAN ab, bevor eBay gefragt wird", async () => {
		const { client, aufrufe } = fakeEbay([[]]);
		const antwort = await app(client).request("/api/scan/keine-ean/online", undefined, env);

		expect(antwort.status).toBe(400);
		expect(aufrufe).toHaveLength(0);
	});
});

describe("eBay-Client", () => {
	it("holt das Token einmal und verwendet es erneut", async () => {
		const { client, aufrufe } = fakeEbay([["A PS4"], ["B PS4"]]);
		await client.titelZuGtin("5026555403719");
		await client.titelZuGtin("4006381333931");

		expect(aufrufe.filter((a) => a.url.includes("oauth2/token"))).toHaveLength(1);
	});

	it("erneuert das Token bei 401 genau einmal", async () => {
		const { client, aufrufe } = fakeEbay(
			[new Response("{}", { status: 401 }), ["Killzone 3 PS3"]],
		);
		expect(await client.titelZuGtin("5026555403719")).toEqual(["Killzone 3 PS3"]);
		expect(aufrufe.filter((a) => a.url.includes("oauth2/token"))).toHaveLength(2);
	});

	it("nimmt 204 als 'kein Angebot', nicht als Fehler", async () => {
		const { client } = fakeEbay([new Response(null, { status: 204 })]);
		expect(await client.titelZuGtin("5026555403719")).toEqual([]);
	});
});
