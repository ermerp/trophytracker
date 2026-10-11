import { describe, expect, it } from "vitest";
import {
	anbieterName,
	beginntMitTitel,
	guenstigstesGeprueft,
	keinDatentraeger,
	nachfolgerZiffer,
	plattformWiderspruch,
	unvollstaendig,
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

const angebot = (
	titel: string,
	preisCents: number,
	verkaeufer: string | null = null,
	itemId: string | null = "110000000001",
): MarktAngebot => ({
	titel,
	preisCents,
	zustand: "Gut",
	verkaeufer,
	url: null,
	itemId,
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

/**
 * Seit 20h-b liefert `guenstigstesGeprueft` ZWEI Antworten. Die meisten
 * Faelle fragen nach dem Preis; wo der Beleg gemeint ist, steht er ausdruecklich.
 */
const preisVon = (...args: Parameters<typeof guenstigstesGeprueft>) => guenstigstesGeprueft(...args).preis;

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
		const treffer = preisVon(
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
		expect(preisVon([angebot("Prince of Persia: The Lost Crown PS5", 1000)], ziel(1, "Blue Prince", "PS5"), SAMMLUNG)).toBeNull();
		expect(preisVon([angebot("Monster Jam Steel Titans PS4", 1529)], ziel(5, "Disc Jam"), SAMMLUNG)).toBeNull();
		expect(
			preisVon([angebot("Brothers in Arms: Hell's Highway (Dt.) PS3", 699)], ziel(4, "Brothers", "PS3"), SAMMLUNG),
		).toBeNull();
		expect(
			preisVon([angebot("2K Borderlands: The Handsome Collection PS4", 399)], ziel(2, "Borderlands 2"), SAMMLUNG),
		).toBeNull();
	});

	it("verwirft eine Sammlung, die das Spiel nur mitbringt", () => {
		expect(
			preisVon([angebot("2K BioShock: The Collection PS4, Bioshock 1-2 und Infinite", 972)], ziel(3, "BioShock Infinite"), SAMMLUNG),
		).toBeNull();
		expect(
			preisVon([angebot("Re: Zero Starting Life In Another World PS4", 1761)], ziel(6, "Another World"), SAMMLUNG),
		).toBeNull();
	});

	it("verwirft ein Buendel zweier eigener Spiele - der Preis gilt fuer beide", () => {
		const treffer = preisVon(
			[angebot("The Heavy Rain & Beyond Two Souls Collection PS4", 1850)],
			ziel(7, "Beyond: Two Souls"),
			SAMMLUNG,
		);
		expect(treffer).toBeNull();
	});

	it("verwirft eine falsch getaggte Plattform, auch wenn der Titel passt", () => {
		expect(preisVon([angebot("Bloodborne PS3", 1099)], ziel(10, "Bloodborne"), SAMMLUNG)).toBeNull();
	});

	/**
	 * Die Sperrliste (Stufe 20h). Der Fall des Nutzers vom 02.10.2026:
	 * "11-11: Memories Retold" fuer 6,98 EUR mit "Nur Disc" im Angebotstitel -
	 * der Titelabgleich sieht darin keinen Widerspruch, der Mensch sofort.
	 */
	it("ueberspringt ein verworfenes Angebot und nimmt das nextguenstigste", () => {
		const billig = angebot("Bloodborne PS4", 698, null, "110000000042");
		const teurer = angebot("Bloodborne PS4 Spiel", 1299, null, "110000000043");
		// Ohne Sperrliste gewinnt das billige.
		expect(preisVon([billig, teurer], ziel(10, "Bloodborne"), SAMMLUNG)?.angebot.preisCents).toBe(698);
		// Mit ihm auf der Liste wird das naechste gueltige von selbst das
		// guenstigste - es braucht keine Sonderlogik.
		const treffer = preisVon(
			[billig, teurer],
			ziel(10, "Bloodborne"),
			SAMMLUNG,
			new Set(["110000000042"]),
		);
		expect(treffer?.angebot.preisCents).toBe(1299);
		expect(treffer?.angebot.itemId).toBe("110000000043");
	});

	it("liefert null, wenn das einzige Angebot verworfen ist - der Preis wird unbekannt", () => {
		expect(
			preisVon(
				[angebot("Bloodborne PS4", 698, null, "110000000042")],
				ziel(10, "Bloodborne"),
				SAMMLUNG,
				new Set(["110000000042"]),
			),
		).toBeNull();
	});

	it("laesst ein Angebot ohne Kennung waehlbar - gueltig, nur nicht verwerfbar", () => {
		const treffer = preisVon(
			[angebot("Bloodborne PS4", 698, null, null)],
			ziel(10, "Bloodborne"),
			SAMMLUNG,
			new Set(["110000000042"]),
		);
		expect(treffer?.angebot.preisCents).toBe(698);
		expect(treffer?.angebot.itemId).toBeNull();
	});

	/**
	 * Die Sperrliste ist JE RELEASE, nicht global (Migration 0033): Gemessen
	 * am 09.10.2026 sind 20 der 370 Angebotszeilen der Produktion dieselbe
	 * Kennung fuer ZWEI Releases. Hier wirkt sie nur, wenn sie uebergeben
	 * wird - die Menge kommt je Release aus `verworfeneJeRelease`.
	 */
	it("wirkt nur mit der Liste des eigenen Releases", () => {
		const a = [angebot("Bloodborne PS4", 698, null, "110000000042")];
		// Dieselbe Kennung, aber die Liste eines anderen Releases: unberuehrt.
		expect(preisVon(a, ziel(10, "Bloodborne"), SAMMLUNG, new Set(["110000000099"]))?.angebot.preisCents).toBe(698);
	});

	/**
	 * Lose Datentraeger (Stufe 20h-b). Anlass waren zwei Angebote, die der
	 * Nutzer am 11.10.2026 nacheinander von Hand verworfen hat, beide mit
	 * "Nur Disc" im Titel. Gemessen ueber 355 echte Angebote trifft das
	 * Muster 9 (2,5 %), alle im Marktkanal.
	 */
	it("nimmt eine lose Disc nicht als Preis, aber als Beleg", () => {
		const lose = angebot("Bloodborne PS4 Nur Disc", 398, null, "110000000050");
		const ganz = angebot("Bloodborne PS4", 1299, null, "110000000051");
		const wahl = guenstigstesGeprueft([lose, ganz], ziel(10, "Bloodborne"), SAMMLUNG);
		// Der Preis ueberspringt sie - ein loser Datentraeger ist kein
		// Vergleichspreis.
		expect(wahl.preis?.angebot.preisCents).toBe(1299);
		// Der Beleg nimmt sie: Eine lose Disc ist der staerkste Hinweis
		// darauf, dass es die Disc-Fassung ueberhaupt gibt.
		expect(wahl.beleg?.angebot.preisCents).toBe(398);
	});

	it("liefert ohne vollstaendiges Angebot keinen Preis, aber einen Beleg", () => {
		const wahl = guenstigstesGeprueft(
			[angebot("Bloodborne PS4 Nur Disc", 398)],
			ziel(10, "Bloodborne"),
			SAMMLUNG,
		);
		expect(wahl.preis).toBeNull();
		expect(wahl.beleg?.angebot.preisCents).toBe(398);
	});

	/**
	 * Die Fuellworte und die Wortarten sind an den echten Titeln gemessen -
	 * und `ohne` zaehlt NUR mit einem Verpackungswort dahinter.
	 */
	it("erkennt die Schreibweisen der Messung, ohne das Buendel zu treffen", () => {
		for (const titel of [
			"Bloodborne PlayStation 4 NUR PAL DISC",
			"Bloodborne (Sony PlayStation 4) NUR MODUL",
			"Bloodborne PS4 Nur CD",
			"Bloodborne (Sony PlayStation 4, PS4) OHNE HÜLLE",
			"Bloodborne~PS4~ohne Cover In Neuhülle",
		]) {
			expect(unvollstaendig(titel), titel).toBe(true);
		}
		// Hier fehlt nicht die Huelle, sondern das zweite Spiel des Buendels:
		// Ein blankes `ohne` haette es mitgenommen.
		expect(unvollstaendig("PS5 Marvel's Spider-Man: Miles Morales (ohne Spiderman remastered)")).toBe(false);
		expect(unvollstaendig("Bloodborne PS4 nur einmal gespielt")).toBe(false);
	});

	it("nennt den Haendler als Anbieter, sonst eBay", () => {
		const h = preisVon([angebot("Bloodborne", 1277, "rebuy-shop")], ziel(10, "Bloodborne"), SAMMLUNG);
		expect(h?.anbieter).toBe("rebuy");
		const m = preisVon([angebot("Bloodborne PS4", 1099, "privatperson")], ziel(10, "Bloodborne"), SAMMLUNG);
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
			expect(preisVon([a], ziel(spielId, titel, plattform), SAMMLUNG), titel).toBeNull();
		}
	});

	it("nimmt die richtige Fassung, die unter dem Fehlgriff lag", () => {
		// Nach dem Wegfallen des PS2-Angebots bleibt die HD Collection - und
		// auf der ist Metal Gear Solid 2 tatsaechlich.
		const treffer = preisVon(
			[angebot("Metal Gear Solid 3 PlayStation 2 Ps2", 1200), angebot("Metal Gear Solid HD Edition 2&3 PS3 Konami", 1219)],
			ziel(22, "Metal Gear Solid 2", "PS3"),
			SAMMLUNG,
		);
		expect(treffer?.angebot.preisCents).toBe(1219);
	});

	it("gibt null, wenn eBay nichts kennt - das ist der Hinweis, kein Fehler", () => {
		expect(preisVon([], ziel(10, "Bloodborne"), SAMMLUNG)).toBeNull();
	});
});
