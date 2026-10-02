import { describe, expect, it } from "vitest";
import {
	ctasAus,
	imPlusKatalog,
	istConceptBlock,
	istPreisBlock,
	kaufpreisAus,
	naechsterBlock,
	produktReihe,
	produkteAus,
	standardProdukt,
} from "../src/domain/store";
import { conceptSeite, fakeStore, htmlAntwort, produktSeite } from "./store-fake";

/**
 * Die Auswertung der Store-Seiten (7.4, Stufe 21).
 *
 * Jeder Fall hier ist ein Befund aus der Messung vom 02.10.2026 - keiner ist
 * erfunden. Drei davon waren echte Fehler im ersten Entwurf und in keiner
 * Summe zu sehen.
 */

describe("Bloecke einer Store-Seite", () => {
	it("findet den Block und sagt, wo er endet", () => {
		const html = `<p>x</p><script id="env:abc" type="application/json">{"cache":{"a":1}}</script><p>y</p>`;
		const block = naechsterBlock(html);
		expect(block?.daten).toEqual({ cache: { a: 1 } });
		expect(html.slice(block?.ende)).toBe("<p>y</p>");
	});

	it("liefert null, solange der Block nicht vollstaendig ist", () => {
		// Genau der Fall beim Lesen als Strom: Das Stueck endet mitten im Block.
		expect(naechsterBlock(`<script id="env:a" type="application/json">{"cache":`)).toBeNull();
	});

	it("ueberspringt einen Block, der kein JSON ist, statt steckenzubleiben", () => {
		const html = `<script id="env:a" type="application/json">kein json</script><script id="env:b" type="application/json">{"cache":{}}</script>`;
		const erst = naechsterBlock(html);
		expect(erst?.daten).toBeNull();
		expect(naechsterBlock(html, erst?.ende)?.daten).toEqual({ cache: {} });
	});
});

describe("Der Block mit dem Preis", () => {
	const produktId = "EP9000-PPSA01521_00-FORBIDDENWESTPS5";

	it("nimmt NICHT den Baustein, dessen Kaufknopf keinen Preis traegt", () => {
		// Gemessen an Horizon Forbidden West: Block 50 111 hat den Knopf ohne
		// Preis, Block 62 420 denselben mit Preis.
		const html = produktSeite(produktId, [{ typ: "ADD_TO_CART", produktId, grundCents: 5999 }], { vorblock: true });
		let gefunden = 0;
		let ab = 0;
		for (;;) {
			const block = naechsterBlock(html, ab);
			if (!block) break;
			ab = block.ende;
			if (istPreisBlock(block.daten, produktId)) gefunden++;
		}
		expect(gefunden).toBe(1);
	});

	it("nimmt keinen Knopf, der zu einem anderen Produkt gehoert", () => {
		// Eine Produktseite traegt weiter unten die anderen FASSUNGEN samt
		// Preisen. Ohne den Filter landete der Preis der Complete Edition am
		// Basisspiel.
		const fremd = "EP9000-PPSA17903_00-HFWCE00000000000";
		const cache = {
			[`Product:${produktId}`]: { id: produktId, name: "Horizon Forbidden West" },
			[`GameCTA:ADD_TO_CART:ADD_TO_CART:${fremd}-E001:OUTRIGHT`]: {
				type: "ADD_TO_CART",
				price: { basePriceValue: 8999, discountedValue: 8999, serviceBranding: ["NONE"], currencyCode: "EUR" },
			},
		};
		expect(istPreisBlock({ cache }, produktId)).toBeNull();
		expect(ctasAus(cache, produktId)).toHaveLength(0);
	});
});

describe("Der Kaufpreis", () => {
	const p = "EP3383-PPSA14002_00-0872837811678079";

	it("nimmt den Kauf und nicht die PS-Plus-Werbung", () => {
		// Baldur's Gate 3: Der AKTIVE Knopf war die Probe fuer 0,00 EUR,
		// gekauft kostet es 48,99 statt 69,99 (gemessen am 02.10.2026).
		const ctas = [
			{ type: "UPSELL_PS_PLUS_TRIAL", price: { basePriceValue: 0, discountedValue: 0, serviceBranding: ["PS_PLUS"] } },
			{
				type: "ADD_TO_CART",
				price: { basePriceValue: 6999, discountedValue: 4899, serviceBranding: ["NONE"], currencyCode: "EUR" },
			},
		];
		expect(kaufpreisAus(ctas)).toEqual({ preisCents: 4899, grundpreisCents: 6999, waehrung: "EUR", istSale: true });
		expect(imPlusKatalog(ctas)).toBe(false);
	});

	it("erkennt den Katalog nur am Katalog-Knopf, nicht an einer Probe", () => {
		// Bei Mass Effect: Andromeda stand `isTiedToSubscription` am
		// PROBE-Knopf auf false - der Typ ist der Unterschied, nicht das Feld.
		expect(imPlusKatalog([{ type: "UPSELL_PS_PLUS_FULL_GAME_TRIAL", price: { serviceBranding: ["PS_PLUS"] } }])).toBe(false);
		expect(imPlusKatalog([{ type: "UPSELL_PS_PLUS_GAME_CATALOG", price: { serviceBranding: ["PS_PLUS"] } }])).toBe(true);
	});

	it("ist kein Angebot, wenn Grund- und Kaufpreis gleich sind", () => {
		const ctas = [{ type: "ADD_TO_CART", price: { basePriceValue: 2999, discountedValue: 2999, serviceBranding: ["NONE"] } }];
		expect(kaufpreisAus(ctas)?.istSale).toBe(false);
	});

	it("liefert null bei UNAVAILABLE - das Produkt gibt es, kaeuflich ist es nicht", () => {
		expect(kaufpreisAus([{ type: "UNAVAILABLE", price: null }])).toBeNull();
	});

	it("laesst 0 Cent gelten: gratis ist ein Wert, kein fehlender", () => {
		const ctas = [{ type: "ADD_TO_CART", price: { basePriceValue: 0, discountedValue: 0, serviceBranding: ["NONE"] } }];
		expect(kaufpreisAus(ctas)?.preisCents).toBe(0);
	});

	it("nennt den Namen des Produkts, damit eine Edition auffaellt", () => {
		const html = produktSeite(p, [{ typ: "ADD_TO_CART", produktId: p }], { name: "Baldur's Gate 3" });
		const block = naechsterBlock(html);
		expect((istPreisBlock(block?.daten, p) as Record<string, { name?: string }>)[`Product:${p}`].name).toBe("Baldur's Gate 3");
	});
});

describe("Die Wahl des Produkts auf einer Concept-Seite", () => {
	const reihe = (produkte: { id: string; name: string | null }[], titel: string, pf: "PS4" | "PS5", std: string | null = null) =>
		produktReihe(produkte, titel, pf, std).map((p) => p.id);

	it("nimmt die Fassung der richtigen Plattform", () => {
		// Horizon Forbidden West: ein Concept, zwei Fassungen, zwei Preise
		// (PS5 59,99 / PS4 49,99 - gemessen).
		const produkte = [
			{ id: "EP9000-PPSA01521_00-FORBIDDENWESTPS5", name: "Horizon Forbidden West" },
			{ id: "EP9000-CUSA24705_00-FORBIDDENWESTPS4", name: "Horizon Forbidden West" },
		];
		expect(reihe(produkte, "Horizon Forbidden West", "PS5")[0]).toContain("PPSA01521");
		expect(reihe(produkte, "Horizon Forbidden West", "PS4")[0]).toContain("CUSA24705");
	});

	it("verwirft die Demo, statt ihren Preis zu nehmen", () => {
		// Der Fehler des ersten Entwurfs: 0,25 EUR fuer "Kitchen [demo]" als
		// Preis von Resident Evil 7.
		const produkte = [{ id: "EP0102-CUSA06799_00-BH70000KITCHEN01", name: "Kitchen [demo]" }];
		expect(reihe(produkte, "Resident Evil 7: Biohazard", "PS4")).toEqual([]);
	});

	it("zieht das Basisspiel der Jubilaeumsausgabe vor", () => {
		// SnowRunner: Sonys Standardprodukt ist die 5-Year Anniversary Edition
		// fuer 129,99 - das Basisspiel kostet 39,99.
		const produkte = [
			{ id: "EP4133-PPSA04929_00-SNOWRUNNER5YEARE", name: "SnowRunner - 5-Year Anniversary Edition" },
			{ id: "EP4133-PPSA04929_00-SNOWRUNNERGAME01", name: "SnowRunner" },
		];
		expect(reihe(produkte, "SnowRunner", "PS5", "EP4133-PPSA04929_00-SNOWRUNNER5YEARE")[0]).toContain("SNOWRUNNERGAME01");
	});

	it("nimmt Sonys Standardprodukt, wenn der Name uebersetzt ist", () => {
		const produkte = [{ id: "EP1018-CUSA04402_00-KRAKENEDIT0STAND", name: "Mittelerde: Schatten des Krieges" }];
		expect(reihe(produkte, "Middle-earth: Shadow of War", "PS4", "EP1018-CUSA04402_00-KRAKENEDIT0STAND")).toHaveLength(1);
	});

	it("laesst einen Rueckfall nur bei verwandtem Namen zu", () => {
		const produkte = [
			{ id: "EP0102-CUSA00001_00-SOMETHINGELSE001", name: "Ein ganz anderes Spiel" },
			{ id: "EP0102-CUSA00002_00-YAKUZA6DELUXE001", name: "Yakuza 6: The Song of Life Deluxe" },
		];
		expect(reihe(produkte, "Yakuza 6: The Song of Life", "PS4")).toEqual(["EP0102-CUSA00002_00-YAKUZA6DELUXE001"]);
	});

	it("liest Produkte und Standardprodukt aus dem Concept-Block", () => {
		const html = conceptSeite("234959", [
			{ id: "EP4133-PPSA04929_00-SNOWRUNNERGAME01", name: "SnowRunner" },
			{ id: "EP4133-PPSA04929_00-SNOWRUNNERPRMEDI", name: "SnowRunner - 1-Year Anniversary Edition" },
		]);
		let ab = 0;
		for (;;) {
			const block = naechsterBlock(html, ab);
			if (!block) break;
			ab = block.ende;
			const treffer = istConceptBlock(block.daten);
			if (!treffer) continue;
			expect(produkteAus(treffer.cache, treffer.concept)).toHaveLength(2);
			expect(standardProdukt(treffer.concept)).toContain("SNOWRUNNERGAME01");
			return;
		}
		throw new Error("kein Concept-Block gefunden");
	});
});

describe("Der Abruf", () => {
	const p = "EP9000-PPSA01521_00-FORBIDDENWESTPS5";

	it("liest den Preis, auch wenn der Block erst spaet auf der Seite steht", async () => {
		// Gemessen liegt er bei rund 57 bis 65 KB von bis zu 1,4 MB.
		const html = produktSeite(p, [{ typ: "ADD_TO_CART", produktId: p, grundCents: 5999 }], {
			vorspann: 80_000,
			vorblock: true,
			name: "Horizon Forbidden West",
		});
		const { client } = fakeStore([[/\/product\//, () => htmlAntwort(html)]]);
		await expect(client.holePreis(p)).resolves.toMatchObject({ preisCents: 5999, produktName: "Horizon Forbidden West" });
	});

	it("bricht nach der Obergrenze ab, statt eine umgebaute Seite ganz zu parsen", async () => {
		const html = "<div>x</div>".repeat(40_000) + produktSeite(p, [{ typ: "ADD_TO_CART", produktId: p }]);
		expect(html.length).toBeGreaterThan(256 * 1024);
		const { client } = fakeStore([[/\/product\//, () => htmlAntwort(html)]]);
		await expect(client.holePreis(p)).resolves.toBeNull();
	});

	it("wertet den Koerper einer Weiterleitung nicht aus", async () => {
		// Eine unbekannte Produkt-Id leitet auf die Startseite um (gemessen:
		// 302 auf "/"), eine falsche Sku auf eine Fehlerseite. Entschieden
		// wird am Status - selbst ein Koerper, der einen Preis enthielte,
		// aendert daran nichts.
		const ziel = "EP9000-CUSA13323_00";
		const mitPreis = produktSeite(ziel, [{ typ: "ADD_TO_CART", produktId: ziel, grundCents: 1234 }]);
		const { client, aufrufe } = fakeStore([
			[/\/product\//, () => new Response(mitPreis, { status: 302, headers: { location: "/" } })],
		]);
		await expect(client.holePreis(ziel)).resolves.toBeNull();
		expect(aufrufe).toHaveLength(1);
	});

	it("unterscheidet delistet von unlesbar", async () => {
		const leer = conceptSeite("231840", [], { standard: null, angekuendigt: true });
		const { client } = fakeStore([[/\/concept\//, () => htmlAntwort(leer)]]);
		// HITMAN 2: products leer, "Angekuendigt" - der Store fuehrt nichts mehr.
		await expect(client.holeConcept("231840")).resolves.toMatchObject({ ohneProdukt: true });

		const ohneBlock = fakeStore([[/\/concept\//, () => htmlAntwort("<html><body>nichts</body></html>")]]);
		await expect(ohneBlock.client.holeConcept("231840")).resolves.toBeNull();
	});

	it("wirft bei einem Serverfehler, statt ihn als 'kein Preis' auszugeben", async () => {
		const { client } = fakeStore([[/\/product\//, () => htmlAntwort("kaputt", 500)]]);
		await expect(client.holePreis(p)).rejects.toThrow(/500/);
	});
});
