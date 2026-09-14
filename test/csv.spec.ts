import { describe, it, expect } from "vitest";
import { BOM, csvDokument, csvFeld, csvZeile, euroAusCents } from "../src/domain/csv";

/**
 * CSV-Erzeugung (Abschnitt 14.4). Reine Logik, keine Datenbank.
 */

describe("csvFeld", () => {
	it("laesst harmlose Werte unangetastet", () => {
		expect(csvFeld("Bloodborne")).toBe("Bloodborne");
		expect(csvFeld(42)).toBe("42");
	});

	it("macht aus null ein leeres Feld - nie eine 0", () => {
		expect(csvFeld(null)).toBe("");
		expect(csvFeld(undefined)).toBe("");
	});

	it("schreibt boolean deutsch", () => {
		expect(csvFeld(true)).toBe("ja");
		expect(csvFeld(false)).toBe("nein");
	});

	it("maskiert Semikolon, Anfuehrungszeichen und Zeilenumbruch", () => {
		expect(csvFeld("Ratchet & Clank; Nexus")).toBe('"Ratchet & Clank; Nexus"');
		expect(csvFeld('Der "gute" Teil')).toBe('"Der ""gute"" Teil"');
		expect(csvFeld("Zeile eins\nZeile zwei")).toBe('"Zeile eins\nZeile zwei"');
		expect(csvFeld("Zeile eins\r\nZeile zwei")).toBe('"Zeile eins\r\nZeile zwei"');
	});

	it("laesst Umlaute und Diakritika stehen", () => {
		expect(csvFeld("God of War Ragnarök")).toBe("God of War Ragnarök");
	});
});

describe("csvZeile", () => {
	it("trennt mit Semikolon", () => {
		expect(csvZeile(["a", 1, null, true])).toBe("a;1;;ja");
	});
});

describe("csvDokument", () => {
	it("beginnt mit BOM und endet jede Zeile mit CRLF", () => {
		const doc = csvDokument(["Titel", "Plattform"], [["Bloodborne", "PS4"]]);
		expect(doc.startsWith(BOM)).toBe(true);
		expect(doc).toBe(`${BOM}Titel;Plattform\r\nBloodborne;PS4\r\n`);
	});

	it("liefert bei leerer Liste nur die Kopfzeile", () => {
		expect(csvDokument(["Titel"], [])).toBe(`${BOM}Titel\r\n`);
	});
});

describe("euroAusCents", () => {
	it("schreibt Komma als Dezimaltrennzeichen", () => {
		expect(euroAusCents(1299)).toBe("12,99");
		expect(euroAusCents(500)).toBe("5,00");
		expect(euroAusCents(5)).toBe("0,05");
		expect(euroAusCents(0)).toBe("0,00");
	});

	it("laesst einen unbekannten Preis leer statt 0", () => {
		expect(euroAusCents(null)).toBe("");
		expect(euroAusCents(undefined)).toBe("");
	});

	it("behaelt das Vorzeichen", () => {
		expect(euroAusCents(-250)).toBe("-2,50");
	});
});
