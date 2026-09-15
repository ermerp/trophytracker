import { describe, expect, it } from "vitest";
import { jahrAusDateiname, monatAus, parseWunschliste } from "../src/domain/wunschliste";

/**
 * Nachgebaute Wunschlisten in den Formen aus Abschnitt 8.2. Keine Zeile
 * stammt aus den echten Dateien - die sind persoenlich und liegen nur lokal.
 */

const JAHRESLISTE =
	"﻿-Januar\r\nErstes Spiel\r\n\r\n-Februar\r\nZweites Spiel: Untertitel\r\n" +
	"Drittes Spiel\r\n\r\n-Oktiber\r\nViertes Spiel\r\n\r\n- August\r\nFuenftes Spiel\r\n" +
	"-Zwolftember\r\nSechstes Spiel\r\n";

describe("parseWunschliste - Jahresliste", () => {
	it("nimmt Monat aus der Ueberschrift, Jahr aus dem Aufruf, BOM und CRLF weg", () => {
		const e = parseWunschliste(JAHRESLISTE, { jahr: 2021 });
		expect(e.form).toBe("jahresliste");
		expect(e.zeilen.map((z) => [z.titel, z.listedAt])).toEqual([
			["Erstes Spiel", "2021-01"],
			["Zweites Spiel: Untertitel", "2021-02"],
			["Drittes Spiel", "2021-02"],
			["Viertes Spiel", "2021-10"],
			["Fuenftes Spiel", "2021-08"],
			["Sechstes Spiel", "2021"],
		]);
	});

	it("zaehlt Ueberschriften - auch mit Tippfehler - nie als Titel", () => {
		const e = parseWunschliste(JAHRESLISTE, { jahr: 2021 });
		expect(e.ueberschriften).toEqual(["-Januar", "-Februar", "-Oktiber", "- August", "-Zwolftember"]);
		expect(e.zeilen.some((z) => z.titel.startsWith("-"))).toBe(false);
	});

	it("laesst das Datum leer, wenn kein Jahr bekannt ist", () => {
		const e = parseWunschliste("-Mai\nEin Spiel\n");
		expect(e.zeilen).toEqual([{ titel: "Ein Spiel", originals: ["Ein Spiel"], plattform: null, listedAt: null }]);
	});

	it("haelt einen Titel mit fuehrendem Bindestrich und zwei Woertern fuer einen Titel", () => {
		const e = parseWunschliste("- Dying Light\n-März\nAnderes\n", { jahr: 2020 });
		expect(e.zeilen.map((z) => z.titel)).toEqual(["Dying Light", "Anderes"]);
		expect(e.zeilen[1].listedAt).toBe("2020-03");
	});
});

describe("parseWunschliste - Plattformliste", () => {
	it("nimmt die Plattform aus dem Abschnitt", () => {
		const e = parseWunschliste("PS4\r\n\r\nSpiel A\r\nspiel b\r\n\r\nPS3\r\n\r\nSpiel C\r\nPS Vita\r\nSpiel D\r\n");
		expect(e.form).toBe("plattformliste");
		expect(e.zeilen.map((z) => [z.titel, z.plattform, z.listedAt])).toEqual([
			["Spiel A", "PS4", null],
			["spiel b", "PS4", null],
			["Spiel C", "PS3", null],
			["Spiel D", "PSVITA", null],
		]);
		expect(e.ueberschriften).toEqual(["PS4", "PS3", "PS Vita"]);
	});
});

describe("parseWunschliste - Tabelle", () => {
	it("liest Datum, Titel und Plattform und ignoriert die Messspalten", () => {
		const text =
			"﻿Datum\tTitel\tPlattform\tStatus\tOriginal\tHinweis\r\n" +
			"\tSpiel A\tPS4\teindeutig\t\tIGDB 1, 2014-10-06, PS3/PS4\r\n" +
			"2020-02\tSpiel B\t\tunbekannt\t\tIGDB findet nichts\r\n" +
			"2019\tSpiel C\tPS3\tpruefen\tspiel c\tKandidaten: ...\r\n";
		const e = parseWunschliste(text, { jahr: 1999 });
		expect(e.form).toBe("tabelle");
		expect(e.zeilen.map((z) => [z.titel, z.plattform, z.listedAt])).toEqual([
			["Spiel A", "PS4", null],
			["Spiel B", null, "2020-02"],
			["Spiel C", "PS3", "2019"],
		]);
	});
});

describe("parseWunschliste - einfache Liste und Doppelungen", () => {
	it("entfernt Aufzaehlungszeichen und Leerzeilen", () => {
		const e = parseWunschliste("* Eins\n\n1. Zwei\n• Drei™\n   \n");
		expect(e.form).toBe("einfach");
		expect(e.zeilen.map((z) => z.titel)).toEqual(["Eins", "Zwei", "Drei"]);
		expect(e.zeilen[0].originals).toEqual(["* Eins"]);
	});

	it("fuehrt gleiche Schluessel zusammen, das spaetere Datum gewinnt", () => {
		const e = parseWunschliste("-Januar\nIron Harvest\n-Dezember\nIron Harvest\nIron Harvest: Complete Edition\n", {
			jahr: 2020,
		});
		expect(e.zeilen).toHaveLength(1);
		expect(e.zeilen[0].listedAt).toBe("2020-12");
		expect(e.zeilen[0].originals).toEqual(["Iron Harvest", "Iron Harvest", "Iron Harvest: Complete Edition"]);
		expect(e.zusammengefuehrt).toBe(2);
	});

	it("haelt verschiedene Schluessel getrennt", () => {
		const e = parseWunschliste("Judgment\nLost Judgment\n");
		expect(e.zeilen.map((z) => z.titel)).toEqual(["Judgment", "Lost Judgment"]);
	});
});

describe("monatAus", () => {
	it("erkennt Monate mit Umlaut, Tippfehler und Praefix", () => {
		expect(monatAus("März")).toBe(3);
		expect(monatAus("Maerz")).toBe(3);
		expect(monatAus("Oktiber")).toBe(10);
		expect(monatAus("Febuar")).toBe(2);
		expect(monatAus("Sept")).toBe(9);
		expect(monatAus("Zwolftember")).toBeNull();
		expect(monatAus("")).toBeNull();
	});
});

describe("jahrAusDateiname", () => {
	it("findet ein vierstelliges Jahr, sonst nichts", () => {
		expect(jahrAusDateiname("2021.txt")).toBe(2021);
		expect(jahrAusDateiname("wunschliste-2019-03.txt")).toBe(2019);
		expect(jahrAusDateiname("Spiele.txt")).toBeNull();
		expect(jahrAusDateiname(null)).toBeNull();
	});
});
