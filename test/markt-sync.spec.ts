import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index";
import { createRepositories } from "../src/db";
import { erstelleEbayClient } from "../src/ebay/client";
import { erstellePsnClient } from "../src/psn/client";
import { fakeFetch } from "./psn-fake";
import { titelSchluessel } from "../src/domain/titel";
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

type Angebot = {
	title: string;
	price: { value: string; currency: string };
	condition?: string;
	seller?: { username: string };
	legacyItemId?: string;
};

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

/**
 * Jede Testzeile traegt eine Kennung (Stufe 20h) - ohne sie waere der Filter
 * nie wirklich geprueft. Sie wird aus dem Preis gebildet, damit zwei Angebote
 * im selben Fall verschiedene haben, ohne dass jeder Aufruf sie nennen muss.
 */
const kennung = (euro: string) => `11${euro.replace(".", "").padStart(10, "0")}`;

const angebot = (title: string, euro: string, verkaeufer?: string, itemId?: string | null): Angebot => ({
	title,
	price: { value: euro, currency: "EUR" },
	condition: "Gut",
	...(verkaeufer ? { seller: { username: verkaeufer } } : {}),
	...(itemId === null ? {} : { legacyItemId: itemId ?? kennung(euro) }),
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

const verlauf = async (releaseId: number, kanal?: string) =>
	(
		await env.DB.prepare(
			"SELECT kanal, source, price_cents, ebay_item_id FROM price_snapshot WHERE release_id = ?" +
				(kanal ? " AND kanal = ?" : "") +
				" ORDER BY id",
		)
			.bind(...(kanal ? [releaseId, kanal] : [releaseId]))
			.all()
	).results;

describe("marktSchritt", () => {
	beforeEach(async () => {
		for (const t of ["price_snapshot", "market_offer_verworfen", "market_offer", "game_event", "trophy_progress", "release", "game"]) {
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
		// BEIDE Kanaele kommen in den Verlauf, als getrennte Reihen (Stufe 20e):
		// Die Haendlerkurve ist ruhig, die Marktkurve springt - vermischt waeren
		// beide unbrauchbar.
		expect(await verlauf(1)).toMatchObject([
			{ kanal: "haendler", source: "rebuy", price_cents: 1277 },
			{ kanal: "markt", source: "ebay", price_cents: 1099 },
		]);
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

	it("schreibt den Verlauf nur bei geaendertem Preis, je Kanal getrennt", async () => {
		await luecke(1, "Bloodborne");
		await marktSchritt(repos(), ebayMit({ markt: [angebot("Bloodborne PS4", "10.99")] }));
		await fristAbgelaufen();
		await marktSchritt(repos(), ebayMit({ markt: [angebot("Bloodborne PS4", "10.99")] }));
		expect(await verlauf(1, "markt")).toHaveLength(1);
		await fristAbgelaufen();
		await marktSchritt(repos(), ebayMit({ markt: [angebot("Bloodborne PS4", "8.00")] }));
		expect(await verlauf(1, "markt")).toMatchObject([{ price_cents: 1099 }, { price_cents: 800 }]);

		// Ein unveraenderter Haendlerpreis darf die Marktreihe nicht am
		// Schreiben hindern und umgekehrt: Die Pruefung laeuft je Kanal.
		await fristAbgelaufen();
		await marktSchritt(
			repos(),
			ebayMit({ haendler: [angebot("Bloodborne", "12.77", "rebuy-shop")], markt: [angebot("Bloodborne PS4", "8.00")] }),
		);
		expect(await verlauf(1, "markt")).toHaveLength(2);
		expect(await verlauf(1, "haendler")).toMatchObject([{ price_cents: 1277 }]);
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

	/**
	 * Lose Datentraeger (Stufe 20h-b): Der Beleg und der Preis kommen aus
	 * demselben Durchlauf, aber nicht aus demselben Angebot.
	 */
	it("belegt die Disc-Fassung mit einer losen Disc, nimmt sie aber nicht als Preis", async () => {
		await luecke(1, "Bloodborne");
		const e = await marktSchritt(repos(), ebayMit({ markt: [angebot("Bloodborne PS4 Nur Disc", "3.98")] }));

		// Belegt ist sie - eine lose Disc ist der staerkste Hinweis darauf,
		// dass es die Disc-Fassung gibt.
		expect(await release(1)).toMatchObject({ s: "ja", q: "ebay" });
		expect(e).toMatchObject({ geprueft: 1, discBelegt: 1, mitPreis: 0 });
		// Ein Preis steht trotzdem nicht da: keine Angebotszeile, kein Punkt
		// im Verlauf.
		expect(await angebote()).toEqual([]);
		expect(await verlauf(1)).toEqual([]);
	});

	it("nimmt bei einer losen und einer ganzen Disc die ganze als Preis", async () => {
		await luecke(1, "Bloodborne");
		await marktSchritt(
			repos(),
			ebayMit({ markt: [angebot("Bloodborne PS4 Nur Disc", "3.98"), angebot("Bloodborne PS4", "12.99")] }),
		);
		expect(await angebote()).toMatchObject([{ kanal: "markt", price_cents: 1299 }]);
		expect(await verlauf(1, "markt")).toMatchObject([{ price_cents: 1299 }]);
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

	it("zaehlt im Stand Releases, nicht Angebotszeilen", async () => {
		await luecke(1, "Bloodborne");
		// Beide Kanaele treffen - das sind zwei Zeilen zu EINEM Release. Die
		// erste Fassung zaehlte die Zeilen und meldete nach dem ersten
		// Durchlauf in der Produktion 323, wo 239 Releases einen Preis hatten.
		await marktSchritt(
			repos(),
			ebayMit({ haendler: [angebot("Bloodborne", "12.77", "rebuy-shop")], markt: [angebot("Bloodborne PS4", "10.99")] }),
		);
		expect(await angebote()).toHaveLength(2);
		expect(await repos().markt.stand()).toMatchObject({ mitPreis: 1, geprueft: 1 });
	});

	it("bleibt ohne Zugangsdaten stumm, statt zu werfen", async () => {
		await luecke(1, "Bloodborne");
		const e = await marktSchritt(repos(), erstelleEbayClient(null));
		expect(e.status).toBe("fehler");
		expect(e.geprueft).toBe(0);
	});
});

/**
 * Angebotskorrektur (Stufe 20h, Abschnitt 6).
 *
 * Der Entwurf traegt, WENN diese drei Dinge zusammen gelten: Der Verlauf
 * verliert keinen Punkt, das naechste Angebot kommt von selbst nach, und die
 * Ruecknahme stellt den Stand her. Deshalb laeuft der Test ueber die ROUTEN -
 * dort sitzt der Neuabruf, und er ist der Teil, der sonst stillschweigend
 * fehlen koennte.
 */
describe("POST /api/sync/markt/verwerfen", () => {
	const psnStumm = () => erstellePsnClient(fakeFetch([]).fetch);
	const igdbEgal = () => ({ konfiguriert: () => false }) as never;
	const app = (jeKanal: { haendler?: Angebot[]; markt?: Angebot[] }) => {
		const ebay = ebayMit(jeKanal);
		return createApp(psnStumm, igdbEgal, () => ebay);
	};
	const sende = (a: ReturnType<typeof createApp>, pfad: string, koerper: unknown) =>
		a.request(
			pfad,
			{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(koerper) },
			env,
		);

	const sperrliste = async () =>
		(await env.DB.prepare("SELECT release_id, ebay_item_id, titel, preis_cents FROM market_offer_verworfen ORDER BY ebay_item_id").all())
			.results;

	beforeEach(async () => {
		for (const t of ["price_snapshot", "market_offer_verworfen", "market_offer", "game_event", "trophy_progress", "release", "game"]) {
			await env.DB.prepare(`DELETE FROM ${t}`).run();
		}
		gerufen = [];
	});

	/** Der erste Lauf, damit ein Angebot ueberhaupt dasteht. */
	async function ersterLauf(jeKanal: { haendler?: Angebot[]; markt?: Angebot[] }) {
		await luecke(1, "Bloodborne");
		await marktSchritt(repos(), ebayMit(jeKanal));
	}

	it("nimmt das naechstguenstigste und laesst die alten Punkte stehen", async () => {
		const billig = angebot("Bloodborne PS4", "6.98");
		const teurer = angebot("Bloodborne PS4 Spiel", "12.99");
		await ersterLauf({ markt: [billig, teurer] });
		expect(await verlauf(1, "markt")).toMatchObject([{ price_cents: 698, ebay_item_id: kennung("6.98") }]);

		// Nach dem Verwerfen liefert eBay dieselben zwei Angebote - das
		// verworfene faellt beim Abgleich heraus, nicht in der Antwort.
		const a = app({ markt: [billig, teurer] });
		const antwort = await sende(a, "/api/sync/markt/verwerfen", { releaseId: 1, itemId: kennung("6.98") });
		expect(antwort.status).toBe(200);
		const daten = (await antwort.json()) as { preis: { preisCents: number } | null; verworfene: unknown[] };
		// Die Antwort nennt den neuen Preis, damit die Liste ihn sofort zeigt.
		expect(daten.preis).toMatchObject({ preisCents: 1299 });
		expect(daten.verworfene).toHaveLength(1);

		// Die Sperrliste traegt Titel und Preis - aus der eigenen Zeile, nicht
		// aus dem Browser (Entscheidung des Nutzers vom 09.10.2026).
		expect(await sperrliste()).toMatchObject([
			{ release_id: 1, ebay_item_id: kennung("6.98"), titel: "Bloodborne PS4", preis_cents: 698 },
		]);

		// Das Angebot in der Tabelle ist das Ersatzangebot ...
		expect(await angebote()).toMatchObject([{ kanal: "markt", price_cents: 1299, in_stock: 1 }]);
		// ... und der Verlauf hat einen Punkt DAZU, keinen verloren: Nichts
		// wird geloescht, der alte Punkt ist nur gestrichen, WEIL seine
		// Kennung auf der Sperrliste steht (Migration 0033).
		expect(await verlauf(1, "markt")).toMatchObject([
			{ price_cents: 698, ebay_item_id: kennung("6.98") },
			{ price_cents: 1299, ebay_item_id: kennung("12.99") },
		]);
	});

	it("stellt mit der Ruecknahme den Stand her", async () => {
		const billig = angebot("Bloodborne PS4", "6.98");
		const teurer = angebot("Bloodborne PS4 Spiel", "12.99");
		await ersterLauf({ markt: [billig, teurer] });
		await sende(app({ markt: [billig, teurer] }), "/api/sync/markt/verwerfen", { releaseId: 1, itemId: kennung("6.98") });

		const antwort = await sende(app({ markt: [billig, teurer] }), "/api/sync/markt/verwerfen/ruecknahme", {
			releaseId: 1,
			itemId: kennung("6.98"),
		});
		expect(antwort.status).toBe(200);
		expect(await sperrliste()).toEqual([]);
		// Der Neuabruf gehoert dazu: Ohne ihn stuende die Liste bis zur
		// naechsten Nacht auf dem Ersatzangebot.
		expect((await antwort.json() as { preis: { preisCents: number } }).preis).toMatchObject({ preisCents: 698 });
		expect(await angebote()).toMatchObject([{ kanal: "markt", price_cents: 698, in_stock: 1 }]);
	});

	it("setzt in_stock auf 0, wenn das verworfene das einzige Angebot war", async () => {
		const einziges = angebot("Bloodborne PS4", "6.98");
		await ersterLauf({ markt: [einziges] });

		await sende(app({ markt: [einziges] }), "/api/sync/markt/verwerfen", { releaseId: 1, itemId: kennung("6.98") });
		// Der Preis BLEIBT STEHEN, nur in_stock faellt: "zuletzt gesehen fuer
		// 6,98" ist mehr als nichts, und v_luecken liest nur in_stock = 1.
		expect(await angebote()).toMatchObject([{ kanal: "markt", price_cents: 698, in_stock: 0 }]);
		const z = await env.DB.prepare("SELECT bester_gebrauchtpreis_cents AS p, gebrauchtpreis_verworfen AS v FROM v_luecken WHERE release_id = 1")
			.first<{ p: number | null; v: number }>();
		// In der Oberflaeche heisst das "unbekannt" - und die Zahl daneben
		// sagt, dass es daran liegt.
		expect(z).toMatchObject({ p: null, v: 1 });
	});

	it("fasst ein bestehendes ja NIE an - ein Verwerfen setzt es nicht zurueck", async () => {
		const einziges = angebot("Bloodborne PS4", "6.98");
		await luecke(1, "Bloodborne");
		await marktSchritt(repos(), ebayMit({ markt: [einziges] }));
		// Der erste Lauf hat 'ja' gesetzt (Quelle ebay).
		expect(await release(1)).toMatchObject({ s: "ja", q: "ebay" });

		await sende(app({ markt: [einziges] }), "/api/sync/markt/verwerfen", { releaseId: 1, itemId: kennung("6.98") });
		// Kein Angebot mehr - und trotzdem bleibt 'ja' stehen. Ein 'nein'
		// setzt ausschliesslich der Nutzer von Hand (Abschnitt 3).
		expect(await release(1)).toMatchObject({ s: "ja", q: "ebay" });
	});

	it("protokolliert beide Richtungen mit Quelle nutzer und Detail ebay", async () => {
		const einziges = angebot("Bloodborne PS4", "6.98");
		await ersterLauf({ markt: [einziges] });
		await sende(app({ markt: [einziges] }), "/api/sync/markt/verwerfen", { releaseId: 1, itemId: kennung("6.98") });
		await sende(app({ markt: [einziges] }), "/api/sync/markt/verwerfen/ruecknahme", { releaseId: 1, itemId: kennung("6.98") });

		const zeilen = (
			await env.DB.prepare(
				"SELECT source, kind, label, old_value, new_value, detail FROM game_event WHERE kind = 'angebot_verworfen' ORDER BY id",
			).all()
		).results;
		// Die Richtung steht in den Werten: Verwerfen nennt das Angebot als
		// new_value, die Ruecknahme als old_value.
		expect(zeilen).toMatchObject([
			{ source: "nutzer", label: "Bloodborne (PS4)", old_value: null, new_value: "Bloodborne PS4 (6,98 €)", detail: "ebay" },
			{ source: "nutzer", label: "Bloodborne (PS4)", old_value: "Bloodborne PS4 (6,98 €)", new_value: null, detail: "ebay" },
		]);
	});

	it("antwortet 409, wenn der Nachtlauf das Angebot inzwischen ersetzt hat", async () => {
		await ersterLauf({ markt: [angebot("Bloodborne PS4", "6.98")] });
		const antwort = await sende(app({ markt: [] }), "/api/sync/markt/verwerfen", { releaseId: 1, itemId: "110000000999" });
		expect(antwort.status).toBe(409);
		// Nichts geschrieben - lieber nichts als das falsche verwerfen.
		expect(await sperrliste()).toEqual([]);
	});

	it("antwortet 404, wenn nichts zurueckzunehmen ist", async () => {
		await ersterLauf({ markt: [angebot("Bloodborne PS4", "6.98")] });
		const antwort = await sende(app({ markt: [] }), "/api/sync/markt/verwerfen/ruecknahme", { releaseId: 1, itemId: "110000000999" });
		expect(antwort.status).toBe(404);
	});

	it("weist eine Kennung ab, die keine ist - an ihr haengt, was uebergangen wird", async () => {
		await ersterLauf({ markt: [angebot("Bloodborne PS4", "6.98")] });
		for (const koerper of [{ releaseId: 1 }, { releaseId: 1, itemId: "v1|123|0" }, { releaseId: 0, itemId: "123" }]) {
			expect((await sende(app({ markt: [] }), "/api/sync/markt/verwerfen", koerper)).status).toBe(400);
		}
		expect(await sperrliste()).toEqual([]);
	});

	it("nennt die Sperrliste fuer das Punktmenue", async () => {
		const einziges = angebot("Bloodborne PS4", "6.98");
		await ersterLauf({ markt: [einziges] });
		await sende(app({ markt: [einziges] }), "/api/sync/markt/verwerfen", { releaseId: 1, itemId: kennung("6.98") });

		const antwort = await app({ markt: [] }).request("/api/sync/markt/verwerfen/1", undefined, env);
		expect(antwort.status).toBe(200);
		expect((await antwort.json() as { verworfene: unknown[] }).verworfene).toMatchObject([
			{ itemId: kennung("6.98"), titel: "Bloodborne PS4", preisCents: 698 },
		]);
	});

	/**
	 * Scheitert der Neuabruf, fehlt `preis` GANZ - und das ist nicht dasselbe
	 * wie `preis: null` (CLAUDE.md: fehlender Schluessel und ausdrueckliches
	 * null sind zwei Dinge). Die Entscheidung steht trotzdem fest.
	 */
	it("laesst preis weg, wenn eBay nicht antwortet - und verwirft trotzdem", async () => {
		const einziges = angebot("Bloodborne PS4", "6.98");
		await ersterLauf({ markt: [einziges] });

		const kaputt = erstelleEbayClient({ clientId: "id", clientSecret: { offenlegen: () => "geheim" } as never }, (async (
			eingabe: RequestInfo | URL,
		) => {
			if (String(eingabe).includes("oauth2/token")) return Response.json({ access_token: "t", expires_in: 7200 });
			return new Response("{}", { status: 429 });
		}) as typeof fetch);
		const a = createApp(psnStumm, igdbEgal, () => kaputt);
		const antwort = await sende(a, "/api/sync/markt/verwerfen", { releaseId: 1, itemId: kennung("6.98") });

		expect(antwort.status).toBe(200);
		const daten = (await antwort.json()) as Record<string, unknown>;
		expect("preis" in daten).toBe(false);
		expect(daten.meldung).toBeTruthy();
		// Geschrieben wurde trotzdem: Die Entscheidung haengt nicht an eBay.
		expect(await sperrliste()).toHaveLength(1);
	});

	it("bleibt ohne Zugangsdaten bei 503 - die uebrige Anwendung laeuft weiter", async () => {
		await ersterLauf({ markt: [angebot("Bloodborne PS4", "6.98")] });
		const ohne = createApp(psnStumm, igdbEgal, () => erstelleEbayClient(null));
		expect((await sende(ohne, "/api/sync/markt/verwerfen", { releaseId: 1, itemId: kennung("6.98") })).status).toBe(503);
		expect((await sende(ohne, "/api/sync/markt/verwerfen/ruecknahme", { releaseId: 1, itemId: kennung("6.98") })).status).toBe(503);
		expect(await sperrliste()).toEqual([]);
	});
});
