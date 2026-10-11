import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index";
import { createRepositories } from "../src/db";
import { erstellePsnClient } from "../src/psn/client";
import { fakeFetch } from "./psn-fake";

/**
 * Der Preisverlauf, den das Diagramm liest (Stufe 20f, Abschnitt 6).
 *
 * Geprueft wird vor allem das, was man einer gruenen Oberflaeche nicht
 * ansieht: dass ein Eimer den LETZTEN Punkt liefert und nicht irgendeinen,
 * dass ein verworfenes Angebot in beiden Zweigen verschwindet, und dass die
 * Punkte ohne Kanal vom 02.10.2026 draussen bleiben.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);

async function release(id: number, titel: string) {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)").bind(id, titel, titel).run();
	await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, ?, 'PS4')").bind(id, id).run();
}

/** Ein Punkt, wie ihn `markt.ts` oder `store.ts` schreiben wuerde. */
async function punkt(
	releaseId: number,
	p: {
		channel?: string;
		kanal?: string | null;
		preis: number;
		am: string;
		quelle?: string;
		itemId?: string | null;
	},
) {
	await env.DB.prepare(
		"INSERT INTO price_snapshot (release_id, channel, kanal, source, price_cents, ebay_item_id, captured_at) " +
			"VALUES (?, ?, ?, ?, ?, ?, ?)",
	)
		.bind(releaseId, p.channel ?? "gebraucht", p.kanal ?? null, p.quelle ?? "ebay", p.preis, p.itemId ?? null, p.am)
		.run();
}

const verwerfen = async (releaseId: number, itemId: string, preis: number) =>
	await env.DB.prepare(
		"INSERT INTO market_offer_verworfen (release_id, ebay_item_id, titel, preis_cents, verworfen_am) " +
			"VALUES (?, ?, 'Nur Disc', ?, datetime('now'))",
	)
		.bind(releaseId, itemId, preis)
		.run();

/** Vor `tage` Tagen, als Text wie `datetime('now')` ihn schreibt. */
const vor = (tage: number, stunde = "08:00:00") =>
	new Date(Date.now() - tage * 86_400_000).toISOString().slice(0, 10) + " " + stunde;

describe("Preisverlauf lesen", () => {
	beforeEach(async () => {
		for (const t of ["price_snapshot", "market_offer_verworfen", "market_offer", "release", "game"]) {
			await env.DB.prepare(`DELETE FROM ${t}`).run();
		}
		await release(1, "Tales of Arise");
	});

	it("liefert je Eimer den LETZTEN Punkt, nicht irgendeinen", async () => {
		// Drei Punkte an einem Tag: Die Treppe steht am Abend auf 9,83 EUR.
		// Das ist der Nachweis fuer die nackten Spalten neben MAX(captured_at)
		// - mit einem zweiten Aggregat waere die Garantie weg.
		await punkt(1, { kanal: "markt", preis: 700, am: vor(1, "06:05:46"), quelle: "ebay" });
		await punkt(1, { kanal: "markt", preis: 837, am: vor(1, "16:13:52"), quelle: "ebay" });
		await punkt(1, { kanal: "markt", preis: 983, am: vor(1, "16:14:22"), quelle: "rebuy" });

		const punkte = await repos().preise.verlauf(1);
		expect(punkte).toHaveLength(1);
		expect(punkte[0]).toMatchObject({ reihe: "markt", preisCents: 983, quelle: "rebuy" });
		expect(punkte[0].stand).toContain("16:14:22");
	});

	it("verdichtet aelter als 90 Tage wochenweise auf den Montag", async () => {
		// Zwei Punkte derselben Woche, beide jenseits der Tagesstufe.
		await punkt(1, { kanal: "haendler", preis: 1100, am: "2026-01-06 08:00:00" }); // Dienstag
		await punkt(1, { kanal: "haendler", preis: 1200, am: "2026-01-08 08:00:00" }); // Donnerstag
		await punkt(1, { kanal: "haendler", preis: 1300, am: "2026-01-13 08:00:00" }); // naechster Dienstag

		const punkte = await repos().preise.verlauf(1);
		expect(punkte.map((p) => p.preisCents)).toEqual([1200, 1300]);
	});

	it("laesst die Punkte ohne Kanal weg, Store-Punkte ohne Kanal aber nicht", async () => {
		await punkt(1, { kanal: null, preis: 698, am: vor(9) });
		await punkt(1, { channel: "psn_store", kanal: null, preis: 1399, am: vor(8), quelle: "psn" });
		await punkt(1, { kanal: "markt", preis: 700, am: vor(7) });

		const punkte = await repos().preise.verlauf(1);
		expect(punkte.map((p) => p.reihe)).toEqual(["markt", "store"]);
	});

	it("streicht ein verworfenes Angebot ueber seine Kennung", async () => {
		await punkt(1, { kanal: "markt", preis: 700, am: vor(5) });
		await punkt(1, { kanal: "markt", preis: 837, am: vor(4), itemId: "236867920425" });
		await punkt(1, { kanal: "markt", preis: 837, am: vor(3), itemId: "236867920425" });
		await verwerfen(1, "236867920425", 837);

		expect((await repos().preise.verlauf(1)).map((p) => p.preisCents)).toEqual([700]);
	});

	it("streicht einen Altpunkt ohne Kennung ueber seinen Preis", async () => {
		// Der Fall, der Stufe 20h ausgeloest hat: Der Punkt stammt von vor
		// Migration 0033 und traegt keine Kennung.
		await punkt(1, { kanal: "markt", preis: 700, am: vor(5) });
		await punkt(1, { kanal: "markt", preis: 702, am: vor(4) });
		await verwerfen(1, "256932142539", 702);

		expect((await repos().preise.verlauf(1)).map((p) => p.preisCents)).toEqual([700]);
	});

	it("laesst den Preiszweig den Store nie treffen", async () => {
		// Verworfen wird ein eBay-Angebot; ein Store-Punkt zum selben Preis
		// hat damit nichts zu tun.
		await punkt(1, { channel: "psn_store", kanal: null, preis: 702, am: vor(4), quelle: "psn" });
		await verwerfen(1, "256932142539", 702);

		expect((await repos().preise.verlauf(1)).map((p) => p.reihe)).toEqual(["store"]);
	});

	it("holt alle Punkte zurueck, wenn die Sperrliste geleert wird", async () => {
		await punkt(1, { kanal: "markt", preis: 702, am: vor(4) });
		await punkt(1, { kanal: "markt", preis: 837, am: vor(3), itemId: "236867920425" });
		await verwerfen(1, "236867920425", 837);
		await verwerfen(1, "256932142539", 702);
		expect(await repos().preise.verlauf(1)).toHaveLength(0);

		await env.DB.prepare("DELETE FROM market_offer_verworfen").run();
		expect(await repos().preise.verlauf(1)).toHaveLength(2);
	});

	it("ordnet nach Reihe und Zeit", async () => {
		await punkt(1, { kanal: "markt", preis: 700, am: vor(5) });
		await punkt(1, { kanal: "haendler", preis: 1100, am: vor(4), quelle: "rebuy" });
		await punkt(1, { channel: "psn_store", kanal: null, preis: 1399, am: vor(3), quelle: "psn" });
		await punkt(1, { kanal: "haendler", preis: 1200, am: vor(2), quelle: "rebuy" });

		expect((await repos().preise.verlauf(1)).map((p) => p.reihe)).toEqual([
			"haendler",
			"haendler",
			"markt",
			"store",
		]);
	});
});

describe("GET /api/releases/:id/preise", () => {
	const app = () =>
		createApp(
			() => erstellePsnClient(fakeFetch([]).fetch),
			() => ({ konfiguriert: () => false }) as never,
		);

	beforeEach(async () => {
		for (const t of ["price_snapshot", "market_offer_verworfen", "release", "game"]) {
			await env.DB.prepare(`DELETE FROM ${t}`).run();
		}
		await release(1, "Tales of Arise");
	});

	it("liefert die Punkte und den Serverstand", async () => {
		await punkt(1, { kanal: "markt", preis: 700, am: vor(2) });

		const antwort = await app().request("/api/releases/1/preise", undefined, env);
		expect(antwort.status).toBe(200);
		const daten = (await antwort.json()) as { bis: string; punkte: unknown[] };
		expect(daten.punkte).toMatchObject([{ reihe: "markt", preisCents: 700 }]);
		expect(daten.bis).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
	});

	it("antwortet mit einer leeren Liste statt 404, wenn es keine Punkte gibt", async () => {
		const antwort = await app().request("/api/releases/4711/preise", undefined, env);
		expect(antwort.status).toBe(200);
		expect((await antwort.json() as { punkte: unknown[] }).punkte).toEqual([]);
	});

	it("weist eine unsinnige Id ab", async () => {
		const antwort = await app().request("/api/releases/0/preise", undefined, env);
		expect(antwort.status).toBe(400);
	});
});
