import { describe, expect, it } from "vitest";
import {
	anbieterName,
	guenstigstesGeprueft,
	plattformWiderspruch,
	zusatzworte,
	zusatzwortGrenze,
	type MarktAngebot,
} from "../src/domain/markt";
import { vorbereiten } from "../src/domain/scan-titel";

/**
 * Gebrauchtangebote einem Release zuordnen (7.3, Stufe 20).
 *
 * Die Faelle sind nicht erfunden: Jeder stammt aus der Messung vom
 * 02.10.2026 ueber alle 490 echten Releases. Die Titel sind oeffentliche
 * Spielnamen und oeffentliche eBay-Angebotstexte, keine Nutzerdaten.
 */

const angebot = (titel: string, preisCents: number, verkaeufer: string | null = null): MarktAngebot => ({
	titel,
	preisCents,
	zustand: "Gut",
	verkaeufer,
	url: null,
});

/** Eine kleine Sammlung aus den Titeln, die in der Messung aneinandergerieten. */
const SAMMLUNG = vorbereiten([
	{ spielId: 1, titel: "Blue Prince" },
	{ spielId: 2, titel: "Borderlands 2" },
	{ spielId: 3, titel: "BioShock Infinite" },
	{ spielId: 4, titel: "Brothers" },
	{ spielId: 5, titel: "Disc Jam" },
	{ spielId: 6, titel: "Another World" },
	{ spielId: 7, titel: "Beyond: Two Souls" },
	{ spielId: 8, titel: "Heavy Rain" },
	{ spielId: 9, titel: "Far Cry 2" },
	{ spielId: 10, titel: "Bloodborne" },
]);

const ziel = (spielId: number, titel: string, plattform: "PS3" | "PS4" | "PS5" | "PSVITA" = "PS4") => ({
	gameId: spielId,
	titel,
	plattform,
});

describe("plattformWiderspruch", () => {
	it("verwirft ein Angebot, das eine andere PlayStation-Plattform nennt", () => {
		// Gemessen: eBays Aspekt `Plattform` ist verkaeufergepflegt. Diese
		// PS3-Disc stand unter dem PS4-Aspekt.
		expect(plattformWiderspruch("Borderlands 2  mit Anleitung Playstation  PS3", "PS4")).toBe(true);
		expect(plattformWiderspruch("Cyberpunk 2077 Cyber Punk Sony PlayStation 4", "PS5")).toBe(true);
	});

	it("laesst eine Mehrfachangabe stehen - sie enthaelt die gesuchte Fassung", () => {
		expect(plattformWiderspruch("Hogwarts Legacy PS4 / PS5", "PS4")).toBe(false);
		expect(plattformWiderspruch("Hogwarts Legacy PS4 / PS5", "PS5")).toBe(false);
	});

	it("ist still, wenn der Titel gar keine Plattform nennt", () => {
		// Genau so schreiben rebuy und medimops ihre Katalogtitel - der erste
		// Messlauf fand deshalb 0 von 90 Haendlerangeboten, solange die
		// Plattform aus dem Titel gelesen wurde.
		expect(plattformWiderspruch("Bloodborne [Game Of The Year Edition]", "PS4")).toBe(false);
	});
});

describe("zusatzworte und ihre Grenze", () => {
	it("zaehlt nur Worte, die kein Ballast sind", () => {
		// "Sony", "PlayStation", "3" und "Spiel" stehen in BALLAST.
		expect(zusatzworte("playstation 3 spiel bioshock infinite", "BioShock Infinite")).toBe(0);
	});

	it("skaliert die Grenze mit der Laenge des eigenen Titels", () => {
		expect(zusatzwortGrenze("Brothers")).toBe(1);
		expect(zusatzwortGrenze("Far Cry 2")).toBe(2);
		// Sechs Worte, nicht fuenf: Der Apostroph trennt, "Assassin's" wird zu
		// "assassin" + "s". Das lockert die Grenze bei solchen Titeln um eins -
		// gemessen hat es keinen Fehlgriff gekostet, aber es ist kein Zufall,
		// sondern eine Folge von `worteAus`.
		expect(zusatzwortGrenze("Assassin's Creed IV Black Flag")).toBe(5);
	});
});

describe("guenstigstesGeprueft", () => {
	it("nimmt das guenstigste Angebot, das den Abgleich uebersteht", () => {
		const treffer = guenstigstesGeprueft(
			[angebot("Far Cry 2 (Sony PlayStation 3)", 490), angebot("Far Cry 2 PS3 Komplett", 390)],
			ziel(9, "Far Cry 2", "PS3"),
			SAMMLUNG,
		);
		expect(treffer?.angebot.preisCents).toBe(390);
	});

	/**
	 * Die vier Fehlgriffe der Messung vom 02.10.2026. Ohne Abgleich waere der
	 * roh guenstigste Treffer in 21 % der Faelle ein anderes Spiel gewesen.
	 */
	/**
	 * "Disc Jam" schrumpft auf ein einziges Wort, weil `disc` in BALLAST
	 * steht - und passt damit auf jedes "... Jam". Genau dieser Fall war in
	 * der Messung der teuerste: 15,29 EUR fuer Monster Jam Steel Titans.
	 */
	it("verwirft ein fremdes Spiel, dessen Name den eigenen enthaelt", () => {
		expect(guenstigstesGeprueft([angebot("Prince of Persia: The Lost Crown PS5", 1000)], ziel(1, "Blue Prince", "PS5"), SAMMLUNG)).toBeNull();
		expect(guenstigstesGeprueft([angebot("Monster Jam Steel Titans PS4", 1529)], ziel(5, "Disc Jam"), SAMMLUNG)).toBeNull();
		expect(
			guenstigstesGeprueft([angebot("Brothers in Arms: Hell's Highway (Dt.) PS3", 699)], ziel(4, "Brothers", "PS3"), SAMMLUNG),
		).toBeNull();
		expect(
			guenstigstesGeprueft([angebot("2K Borderlands: The Handsome Collection PS4", 399)], ziel(2, "Borderlands 2"), SAMMLUNG),
		).toBeNull();
	});

	it("verwirft eine Sammlung, die das Spiel nur mitbringt", () => {
		expect(
			guenstigstesGeprueft([angebot("2K BioShock: The Collection PS4, Bioshock 1-2 und Infinite", 972)], ziel(3, "BioShock Infinite"), SAMMLUNG),
		).toBeNull();
		expect(
			guenstigstesGeprueft([angebot("Re: Zero Starting Life In Another World PS4", 1761)], ziel(6, "Another World"), SAMMLUNG),
		).toBeNull();
	});

	it("verwirft ein Buendel zweier eigener Spiele - der Preis gilt fuer beide", () => {
		const treffer = guenstigstesGeprueft(
			[angebot("The Heavy Rain & Beyond Two Souls Collection PS4", 1850)],
			ziel(7, "Beyond: Two Souls"),
			SAMMLUNG,
		);
		expect(treffer).toBeNull();
	});

	it("verwirft eine falsch getaggte Plattform, auch wenn der Titel passt", () => {
		expect(guenstigstesGeprueft([angebot("Bloodborne PS3", 1099)], ziel(10, "Bloodborne"), SAMMLUNG)).toBeNull();
	});

	it("nennt den Haendler als Anbieter, sonst eBay", () => {
		const h = guenstigstesGeprueft([angebot("Bloodborne", 1277, "rebuy-shop")], ziel(10, "Bloodborne"), SAMMLUNG);
		expect(h?.anbieter).toBe("rebuy");
		const m = guenstigstesGeprueft([angebot("Bloodborne PS4", 1099, "privatperson")], ziel(10, "Bloodborne"), SAMMLUNG);
		expect(m?.anbieter).toBe("eBay");
		expect(anbieterName("medimops_shop")).toBe("medimops");
		expect(anbieterName(null)).toBe("eBay");
	});

	it("gibt null, wenn eBay nichts kennt - das ist der Hinweis, kein Fehler", () => {
		expect(guenstigstesGeprueft([], ziel(10, "Bloodborne"), SAMMLUNG)).toBeNull();
	});
});
