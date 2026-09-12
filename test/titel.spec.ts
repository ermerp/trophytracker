import { describe, it, expect } from "vitest";
import {
	anzeigeTitel,
	plattformenAus,
	titelSchluessel,
	vorgeschlagenePlattform,
} from "../src/domain/titel";

/**
 * Die Faelle stammen aus den 431 echten Trophaeenlisten, die Titel selbst sind
 * aber allgemein bekannte Spielnamen - keine kopierten Nutzerdaten.
 */

describe("anzeigeTitel", () => {
	it("entfernt Zeilenumbrueche", () => {
		expect(anzeigeTitel("Auto Chess\n\n")).toBe("Auto Chess");
	});

	it("entfernt fuehrende Leerzeichen", () => {
		expect(anzeigeTitel(" Flower")).toBe("Flower");
	});

	it("entfernt Markenzeichen", () => {
		expect(anzeigeTitel("Remember Me™ ")).toBe("Remember Me");
		expect(anzeigeTitel("MOTORSTORM® RC")).toBe("MOTORSTORM RC");
	});

	it("entfernt den Listen-Zusatz 'Trophies'", () => {
		expect(anzeigeTitel("No Man's Sky Trophies")).toBe("No Man's Sky");
		expect(anzeigeTitel("Game of Thrones trophies")).toBe("Game of Thrones");
	});

	it("laesst den Titel sonst unangetastet", () => {
		expect(anzeigeTitel("Kingdom Come: Deliverance")).toBe("Kingdom Come: Deliverance");
		expect(anzeigeTitel("God of War Ragnarök")).toBe("God of War Ragnarök");
		expect(anzeigeTitel("Uncharted 4: A Thief’s End")).toBe("Uncharted 4: A Thief’s End");
	});
});

describe("titelSchluessel", () => {
	it("zieht Gross-/Kleinschreibung und Satzzeichen zusammen", () => {
		expect(titelSchluessel("Kingdom Come: Deliverance")).toBe("kingdom come deliverance");
	});

	it("faltet Diakritika, statt sie zu verlieren", () => {
		// Ohne Faltung wuerde "ragnar k" entstehen und den Treffer verhindern.
		expect(titelSchluessel("God of War Ragnarök")).toBe("god of war ragnarok");
		expect(titelSchluessel("ABZÛ")).toBe("abzu");
	});

	it("behandelt beide Apostroph-Zeichen gleich", () => {
		expect(titelSchluessel("Uncharted: Drake’s Fortune")).toBe(
			titelSchluessel("Uncharted: Drake's Fortune"),
		);
	});

	it("schneidet Editionszusaetze ab - dasselbe Spiel mit DLC", () => {
		// Belegt an den echten Daten: BioShock Infinite hat auf PS3 und als
		// Complete Edition auf PS4 exakt dieselbe Struktur 55/24/1/1.
		expect(titelSchluessel("BioShock Infinite: The Complete Edition")).toBe(
			titelSchluessel("BioShock Infinite"),
		);
		expect(titelSchluessel("CastleStorm - Complete Edition")).toBe(
			titelSchluessel("CastleStorm"),
		);
	});

	it("schneidet 'Remastered' und 'Remake' NICHT ab", () => {
		// Ein Remaster ist in aller Regel ein anderes Produkt mit eigener
		// Troph\u00e4enliste: Uncharted PS3 36/8/3/1 gegen PS4 41/8/4/1.
		expect(titelSchluessel("Uncharted: Drake's Fortune Remastered")).not.toBe(
			titelSchluessel("Uncharted: Drake's Fortune"),
		);
		expect(titelSchluessel("FINAL FANTASY VII REMAKE")).not.toBe(
			titelSchluessel("FINAL FANTASY VII"),
		);
	});

	it("laesst keinen haengenden Artikel stehen", () => {
		// "... – The Definitive Edition" hinterliess sonst ein einzelnes "the".
		expect(titelSchluessel("Grand Theft Auto: Vice City – The Definitive Edition")).toBe(
			"grand theft auto vice city",
		);
	});

	it("erkennt den Listen-Zusatz", () => {
		expect(titelSchluessel("No Man's Sky Trophies")).toBe("no mans sky");
	});

	it("faellt bei nicht-lateinischen Titeln auf den Anzeigenamen zurueck", () => {
		// Sonst waere der Schluessel leer, und alle solchen Titel landeten in
		// einer Gruppe.
		const jp = "王と魔王と７人の姫君たち";
		expect(titelSchluessel(jp)).not.toBe("");
		expect(titelSchluessel(jp)).not.toBe(titelSchluessel("другая игра"));
	});

	it("unterscheidet verschiedene Spiele weiterhin", () => {
		expect(titelSchluessel("Hotline Miami")).not.toBe(
			titelSchluessel("Hotline Miami 2: Wrong Number"),
		);
	});
});

describe("Plattformen", () => {
	it("zerlegt eine kommagetrennte Liste", () => {
		expect(plattformenAus("PS3,PSVITA,PS4")).toEqual(["PS3", "PSVITA", "PS4"]);
	});

	it("schlaegt die neueste Plattform vor", () => {
		expect(vorgeschlagenePlattform("PS3,PSVITA,PS4")).toBe("PS4");
		expect(vorgeschlagenePlattform("PSVITA,PS4")).toBe("PS4");
		expect(vorgeschlagenePlattform("PS3,PSVITA")).toBe("PS3");
	});

	it("uebergeht Plattformen, die es in der Sammlung nicht gibt", () => {
		expect(vorgeschlagenePlattform("PS5,PSPC")).toBe("PS5");
	});

	it("meldet null, wenn keine Plattform erfassbar ist", () => {
		expect(vorgeschlagenePlattform("PSPC")).toBeNull();
	});
});
