import { describe, expect, it } from "vitest";
import {
	anbieterName,
	beginntMitTitel,
	guenstigstesGeprueft,
	keinDatentraeger,
	nachfolgerZiffer,
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
	{ spielId: 20, titel: "Journey" },
	{ spielId: 21, titel: "SteamWorld Dig" },
	{ spielId: 22, titel: "Metal Gear Solid 2" },
	{ spielId: 23, titel: "Genshin Impact" },
	{ spielId: 24, titel: "Yakuza Kiwami 2" },
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

	it("verwirft auch Plattformen, die wir gar nicht fuehren", () => {
		// Gemessen: "Metal Gear Solid 2" (PS3) bekam ein PS2-Angebot. Die
		// Pruefung kannte nur die eigenen vier Plattformen.
		expect(plattformWiderspruch("Metal Gear Solid 3 PlayStation 2 Ps2", "PS3")).toBe(true);
		expect(plattformWiderspruch("Tomb Raider Xbox 360", "PS3")).toBe(true);
		expect(plattformWiderspruch("Celeste Nintendo Switch", "PS4")).toBe(true);
		expect(plattformWiderspruch("Doom Eternal PC DVD", "PS4")).toBe(true);
	});

	it("ist still, wenn der Titel gar keine Plattform nennt", () => {
		// Genau so schreiben rebuy und medimops ihre Katalogtitel - der erste
		// Messlauf fand deshalb 0 von 90 Haendlerangeboten, solange die
		// Plattform aus dem Titel gelesen wurde.
		expect(plattformWiderspruch("Bloodborne [Game Of The Year Edition]", "PS4")).toBe(false);
	});
});

describe("keinDatentraeger", () => {
	it("verwirft Konten und Dienstleistungen aus der Videospiel-Kategorie", () => {
		// Beide standen in der Messung vom 02.10.2026 unter den 79 Releases,
		// die automatisch ein `ja` bekommen haetten - mit 261 und 226 Euro.
		expect(keinDatentraeger("Genshin Impact Account")).toBe(true);
		expect(keinDatentraeger("Yakuza Kiwami 2 PS5 Platinum Trophy Service")).toBe(true);
		expect(keinDatentraeger("GTA IV The Complete Edition Leerhülle mit Poster")).toBe(true);
	});

	it("laesst eine gewoehnliche Disc stehen", () => {
		expect(keinDatentraeger("Far Cry 2 (Sony PlayStation 3)")).toBe(false);
		// "key" steckt in "Monkey", darf aber nicht greifen - \\b schuetzt davor.
		expect(keinDatentraeger("Escape from Monkey Island PS4")).toBe(false);
	});
});

describe("beginntMitTitel", () => {
	it("verlangt bei kurzen Titeln, dass unser Wort vorn steht", () => {
		// "Journey" (PS4) bekam sonst "Robinson: The Journey" - ein fremdes
		// Wort, also genau an der Grenze.
		expect(beginntMitTitel("Robinson: The Journey", "Journey")).toBe(false);
		expect(beginntMitTitel("PS4 Spiel Journey", "Journey")).toBe(true);
		expect(beginntMitTitel("Journey Collector's Edition", "Journey")).toBe(true);
	});

	it("greift ab drei Worten nicht mehr", () => {
		// Sonst fiele jedes Angebot heraus, das mit dem Herausgeber beginnt.
		// Drei Inhaltsworte heisst: nach dem Ballast noch drei - "Complete"
		// und "Edition" zaehlen nicht mit.
		expect(beginntMitTitel("Sony Mutant Year Zero PS4", "Mutant Year Zero")).toBe(true);
		// Zwei Worte dagegen: Dort muss unseres vorn stehen.
		expect(beginntMitTitel("2K BioShock Infinite", "BioShock Infinite")).toBe(false);
	});
});

describe("nachfolgerZiffer", () => {
	it("erkennt den Nachfolger an der blanken Ziffer", () => {
		expect(nachfolgerZiffer("Steamworld Dig 2 - PS4", "SteamWorld Dig")).toBe(true);
		expect(nachfolgerZiffer("Killzone 3 (Sony PlayStation 3)", "Killzone")).toBe(true);
	});

	it("greift nicht, wenn unser Titel selbst eine Zahl traegt", () => {
		// Sonst waere jeder Jahrgang im Angebot ein Ausschlussgrund.
		expect(nachfolgerZiffer("Far Cry 2 (Sony PlayStation 3, 2008)", "Far Cry 2")).toBe(false);
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

	/**
	 * Die fuenf Fehlgriffe, die am 02.10.2026 unter den 79 automatisch
	 * gesetzten Disc-Fassungen gefunden wurden - beim Ansehen der Liste, nicht
	 * beim Lesen des Codes.
	 */
	it("verwirft die fuenf Fehlgriffe aus der Abnahme der 79 Statuswechsel", () => {
		const faelle: Array<[string, number, MarktAngebot, "PS3" | "PS4" | "PS5"]> = [
			["Journey", 20, angebot("Robinson: The Journey", 815), "PS4"],
			["SteamWorld Dig", 21, angebot("Steamworld Dig 2 - PS4", 1500), "PS4"],
			["Metal Gear Solid 2", 22, angebot("Metal Gear Solid 3 PlayStation 2 Ps2", 1200), "PS3"],
			["Genshin Impact", 23, angebot("Genshin Impact Account", 26180), "PS4"],
			["Yakuza Kiwami 2", 24, angebot("Yakuza Kiwami 2 PS5 Platinum Trophy Service", 22594), "PS5"],
		];
		for (const [titel, spielId, a, plattform] of faelle) {
			expect(guenstigstesGeprueft([a], ziel(spielId, titel, plattform), SAMMLUNG), titel).toBeNull();
		}
	});

	it("nimmt die richtige Fassung, die unter dem Fehlgriff lag", () => {
		// Nach dem Wegfallen des PS2-Angebots bleibt die HD Collection - und
		// auf der ist Metal Gear Solid 2 tatsaechlich.
		const treffer = guenstigstesGeprueft(
			[angebot("Metal Gear Solid 3 PlayStation 2 Ps2", 1200), angebot("Metal Gear Solid HD Edition 2&3 PS3 Konami", 1219)],
			ziel(22, "Metal Gear Solid 2", "PS3"),
			SAMMLUNG,
		);
		expect(treffer?.angebot.preisCents).toBe(1219);
	});

	it("gibt null, wenn eBay nichts kennt - das ist der Hinweis, kein Fehler", () => {
		expect(guenstigstesGeprueft([], ziel(10, "Bloodborne"), SAMMLUNG)).toBeNull();
	});
});
