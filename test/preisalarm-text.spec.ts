import { describe, it, expect } from "vitest";
import { centsAlsEingabe, euroInCents, preisalarmText } from "../frontend/src/preisalarm";

/** Der Satz unter einer Meldung (Stufe 20g); `euro` setzt ein geschuetztes Leerzeichen vor das Zeichen. */
const ohneNbsp = (s: string) => s.replace(/ /g, " ");

describe("preisalarmText", () => {
	it("nennt beim Allzeittief Reihe, Preis, Tiefe und das bisherige Tief", () => {
		expect(ohneNbsp(preisalarmText({ art: "tief", reihe: "markt", preisCents: 795, vorherCents: 900 }))).toBe(
			"Markt 7,95 € · Allzeittief, 12 % unter 9,00 €",
		);
	});

	it("nennt bei der Grenze die Grenze", () => {
		expect(ohneNbsp(preisalarmText({ art: "grenze", reihe: "haendler", preisCents: 916, vorherCents: 1000 }))).toBe(
			"Händler 9,16 € · unter deiner Grenze von 10,00 €",
		);
	});
});

describe("euroInCents", () => {
	it("liest Euro mit Komma oder Punkt, mit und ohne Cent", () => {
		expect(euroInCents("10")).toBe(1000);
		expect(euroInCents("10,5")).toBe(1050);
		expect(euroInCents("10,50 €")).toBe(1050);
		expect(euroInCents(" 7.95 ")).toBe(795);
	});

	it("ein leeres Feld ist keine Grenze, nie 0", () => {
		expect(euroInCents("")).toBeNull();
		expect(euroInCents("   ")).toBeNull();
	});

	it("weist ab, was keine Grenze ist", () => {
		for (const t of ["0", "0,00", "-5", "abc", "10,555", "12345", "1.000,00"]) expect(euroInCents(t), t).toBeUndefined();
	});

	it("schreibt eine Grenze zurueck, wie sie eingegeben wird", () => {
		expect(centsAlsEingabe(1050)).toBe("10,50");
		expect(centsAlsEingabe(null)).toBe("");
	});
});
