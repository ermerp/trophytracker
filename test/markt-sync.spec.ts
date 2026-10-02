import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { titelSchluessel } from "../src/domain/titel";
import { erstelleEbayClient } from "../src/ebay/client";
import { marktSchritt } from "../src/sync/markt";

/**
 * Gebrauchtpreise und Disc-Nachweis aus eBay (7.3, Stufe 20).
 *
 * Geprueft wird vor allem, was NICHT passiert: kein 'nein' setzen, ein
 * bestehendes 'ja' nicht anfassen, keine Zeile je Angebot anhaeufen und
 * keinen Verlaufseintrag bei unveraendertem Preis.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);

/** Die URLs, die der Client gebaut hat - fuer die Pruefung der Kodierung. */
let gerufen: string[] = [];

type Angebot = { title: string; price: { value: string; currency: string }; condition?: string; seller?: { username: string } };

/**
 * eBay-Fake auf der fetch-Ebene, nicht auf der Client-Ebene: Nur so wird die
 * gebaute URL mitgeprueft - und dort sass der stille Fehler, den die Messung
 * am 02.10.2026 fand (unkodierte Klammern werden ignoriert).
 */
function ebayMit(jeKanal: { haendler?: Angebot[]; markt?: Angebot[] }) {
	gerufen = [];
	const hole = async (eingabe: RequestInfo | URL): Promise<Response> => {
		const url = String(eingabe);
		if (url.includes("oauth2/token")) {
			return Response.json({ access_token: "token-test", expires_in: 7200 });
		}
		gerufen.push(url);
		const haendler = url.includes("sellers");
		return Response.json({ itemSummaries: (haendler ? jeKanal.haendler : jeKanal.markt) ?? [] });
	};
	return erstelleEbayClient({ clientId: "id", clientSecret: { offenlegen: () => "geheim" } as never }, hole as typeof fetch);
}

const angebot = (title: string, euro: string, verkaeufer?: string): Angebot => ({
	title,
	price: { value: euro, currency: "EUR" },
	condition: "Gut",
	...(verkaeufer ? { seller: { username: verkaeufer } } : {}),
});

/** Ein Spiel mit einem Release, das in v_luecken auftaucht: gespielt, keine Disc im Regal. */
async function luecke(id: number, titel: string, status = "unbekannt", plattform = "PS4") {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)")
		.bind(id, titel, titelSchluessel(titel))
		.run();
	await env.DB.prepare("INSERT INTO release (id, game_id, platform, physical_release_status) VALUES (?, ?, ?, ?)")
		.bind(id, id, plattform, status)
		.run();
	await env.DB.prepare(
		"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, progress_pct, release_id, " +
			"synced_at, defined_bronze, defined_silver, defined_gold, defined_platinum, " +
			"earned_bronze, earned_silver, earned_gold, earned_platinum) " +
			"VALUES (?, 'trophy', ?, ?, 50, ?, datetime('now'), 1, 0, 0, 0, 1, 0, 0, 0)",
	)
		.bind(`NPWR${id}`, titel, plattform, id)
		.run();
}

const release = async (id: number) =>
	await env.DB.prepare("SELECT physical_release_status AS s, physical_source AS q, markt_rohangebote AS roh FROM release WHERE id = ?")
		.bind(id)
		.first<{ s: string; q: string | null; roh: number | null }>();

const angebote = async () =>
	(await env.DB.prepare("SELECT kanal, anbieter, price_cents, in_stock, source_product_id FROM market_offer ORDER BY kanal").all())
		.results;

/**
 * Nachstellen, dass die Frist abgelaufen ist. Ohne das greift die eigene
 * Sperre - was der Test "fragt ein geprueftes Release nicht noch einmal"
 * ausdruecklich prueft.
 */
const fristAbgelaufen = async () =>
	await env.DB.prepare("UPDATE release SET markt_geprueft_am = datetime('now', '-30 days')").run();

const verlauf = async (releaseId: number) =>
	(await env.DB.prepare("SELECT source, price_cents FROM price_snapshot WHERE release_id = ? ORDER BY id").bind(releaseId).all())
		.results;

describe("marktSchritt", () => {
	beforeEach(async () => {
		for (const t of ["price_snapshot", "market_offer", "game_event", "trophy_progress", "release", "game"]) {
			await env.DB.prepare(`DELETE FROM ${t}`).run();
		}
		gerufen = [];
	});

	it("kodiert Filter und Aspekt - unkodiert wuerde eBay sie stillschweigend ignorieren", async () => {
		await luecke(1, "Bloodborne");
		await marktSchritt(repos(), ebayMit({}));
		expect(gerufen).toHaveLength(2);
		// %7B = {, %7C = |, %3A = :
		expect(gerufen[0]).toContain("conditionIds%3A%7B5000%7C4000");
		expect(gerufen[0]).toContain("Plattform%3A%7BSony+PlayStation+4%7D");
		expect(gerufen.some((u) => u.includes("sellers%3A%7Brebuy-shop%7Cmedimops_shop%7D"))).toBe(true);
	});

	it("nimmt den Haendlerpreis, auch wenn der Markt guenstiger ist", async () => {
		await luecke(1, "Bloodborne");
		const e = await marktSchritt(
			repos(),
			ebayMit({ haendler: [angebot("Bloodborne", "12.77", "rebuy-shop")], markt: [angebot("Bloodborne PS4", "10.99")] }),
		);
		expect(e).toMatchObject({ status: "erfolg", geprueft: 1, mitPreis: 1, discBelegt: 1 });
		// Beide Kanaele stehen in der Tabelle; die Anzeige entscheidet.
		expect(await angebote()).toMatchObject([
			{ kanal: "haendler", anbieter: "rebuy", price_cents: 1277, in_stock: 1 },
			{ kanal: "markt", anbieter: "eBay", price_cents: 1099, in_stock: 1 },
		]);
		// v_luecken nimmt den Haendler zuerst (Entscheidung vom 02.10.2026).
		const z = await env.DB.prepare(
			"SELECT bester_gebrauchtpreis_cents AS p, gebrauchtpreis_anbieter AS a FROM v_luecken WHERE release_id = 1",
		).first<{ p: number; a: string }>();
		expect(z).toMatchObject({ p: 1277, a: "rebuy" });
		// Nur der angezeigte Preis kommt in den Verlauf.
		expect(await verlauf(1)).toMatchObject([{ source: "rebuy", price_cents: 1277 }]);
	});

	it("haeuft keine Zeilen an - ein zweiter Lauf trifft dieselbe Zeile", async () => {
		await luecke(1, "Bloodborne");
		await marktSchritt(repos(), ebayMit({ markt: [angebot("Bloodborne PS4", "10.99")] }));
		await fristAbgelaufen();
		await marktSchritt(repos(), ebayMit({ markt: [angebot("Bloodborne PS4", "9.50")] }), 10);
		const zeilen = await angebote();
		expect(zeilen).toHaveLength(1);
		expect(zeilen[0]).toMatchObject({ kanal: "markt", price_cents: 950, source_product_id: "markt:1" });
	});

	it("schreibt den Verlauf nur bei geaendertem Preis", async () => {
		await luecke(1, "Bloodborne");
		await marktSchritt(repos(), ebayMit({ markt: [angebot("Bloodborne PS4", "10.99")] }));
		await fristAbgelaufen();
		await marktSchritt(repos(), ebayMit({ markt: [angebot("Bloodborne PS4", "10.99")] }));
		expect(await verlauf(1)).toHaveLength(1);
		await fristAbgelaufen();
		await marktSchritt(repos(), ebayMit({ markt: [angebot("Bloodborne PS4", "8.00")] }));
		expect(await verlauf(1)).toMatchObject([{ price_cents: 1099 }, { price_cents: 800 }]);
	});

	it("setzt unbekannt auf ja und protokolliert es mit Quelle feed und Detail ebay", async () => {
		await luecke(1, "Bloodborne");
		await marktSchritt(repos(), ebayMit({ markt: [angebot("Bloodborne PS4", "10.99")] }));
		expect(await release(1)).toMatchObject({ s: "ja", q: "ebay" });
		const ereignis = await env.DB.prepare(
			"SELECT source, kind, old_value, new_value, detail FROM game_event WHERE kind = 'disc_fassung_belegt'",
		).first();
		expect(ereignis).toMatchObject({
			source: "feed",
			kind: "disc_fassung_belegt",
			old_value: "unbekannt",
			new_value: "ja",
			detail: "ebay",
		});
	});

	it("fasst ein bestehendes nein NIE an - auch nicht mit einem Treffer", async () => {
		await luecke(1, "Bloodborne", "nein");
		const e = await marktSchritt(repos(), ebayMit({ markt: [angebot("Bloodborne PS4", "10.99")] }));
		// 'nein' ist nicht in v_luecken, also wird es gar nicht erst gefragt.
		expect(e.geprueft).toBe(0);
		expect(await release(1)).toMatchObject({ s: "nein" });
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM game_event").first<{ n: number }>()).toMatchObject({ n: 0 });
	});

	it("laesst ein bestehendes ja stehen, holt aber seinen Preis", async () => {
		await luecke(1, "Bloodborne", "ja");
		await env.DB.prepare("UPDATE release SET physical_source = 'igdb' WHERE id = 1").run();
		const e = await marktSchritt(repos(), ebayMit({ markt: [angebot("Bloodborne PS4", "10.99")] }));
		expect(e).toMatchObject({ geprueft: 1, mitPreis: 1, discBelegt: 0 });
		// Die Quelle bleibt igdb - nicht ueberschreiben, was schon belegt ist.
		expect(await release(1)).toMatchObject({ s: "ja", q: "igdb" });
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM game_event").first<{ n: number }>()).toMatchObject({ n: 0 });
	});

	it("haelt fest, dass eBay gar nichts kennt - der Hinweis fuer Block B", async () => {
		await luecke(1, "Bloodborne");
		const e = await marktSchritt(repos(), ebayMit({}));
		expect(e).toMatchObject({ geprueft: 1, mitPreis: 0, discBelegt: 0, ohneAngebot: 1 });
		expect(await release(1)).toMatchObject({ s: "unbekannt", roh: 0 });
	});

	it("unterscheidet 'nichts gefunden' von 'nichts Geprueftes gefunden'", async () => {
		await luecke(1, "Brothers", "unbekannt", "PS3");
		// Ein Angebot, das den Abgleich nicht uebersteht: roh ist 1, nicht 0.
		const e = await marktSchritt(repos(), ebayMit({ markt: [angebot("Brothers in Arms: Hell's Highway PS3", "6.99")] }));
		expect(e).toMatchObject({ geprueft: 1, mitPreis: 0, ohneAngebot: 0 });
		expect(await release(1)).toMatchObject({ s: "unbekannt", roh: 1 });
	});

	it("fragt ein geprueftes Release nicht noch einmal", async () => {
		await luecke(1, "Bloodborne");
		await marktSchritt(repos(), ebayMit({ markt: [angebot("Bloodborne PS4", "10.99")] }));
		const zweiter = ebayMit({ markt: [angebot("Bloodborne PS4", "10.99")] });
		expect((await marktSchritt(repos(), zweiter)).geprueft).toBe(0);
		expect(gerufen).toHaveLength(0);
	});

	it("bleibt ohne Zugangsdaten stumm, statt zu werfen", async () => {
		await luecke(1, "Bloodborne");
		const e = await marktSchritt(repos(), erstelleEbayClient(null));
		expect(e.status).toBe("fehler");
		expect(e.geprueft).toBe(0);
	});
});
