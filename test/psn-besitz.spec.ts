import { describe, expect, it } from "vitest";
import { dauerInSekunden, plattformAusKategorie, spielzeitText } from "../src/domain/psn-besitz";

/**
 * Spielzeit und Plattform aus der PSN-Antwort (7.7, Stufe 18c). Die Formen
 * stammen aus der Messung gegen das echte Konto am 21.09.2026.
 */

describe("dauerInSekunden", () => {
	it("liest die gemessenen Formen", () => {
		expect(dauerInSekunden("PT12H59S")).toBe(12 * 3600 + 59);
		expect(dauerInSekunden("PT1H30M2S")).toBe(3600 + 30 * 60 + 2);
		expect(dauerInSekunden("PT45M")).toBe(45 * 60);
		expect(dauerInSekunden("P1DT2H")).toBe(86400 + 2 * 3600);
		expect(dauerInSekunden("PT0S")).toBe(0);
	});

	it("gibt bei Unlesbarem null zurueck, nie 0", () => {
		// Eine fehlende Spielzeit ist "unbekannt" und darf nie als "nie
		// gespielt" gelesen werden (Abschnitt 3).
		for (const wert of [null, undefined, "", "12H", "gestern", "P", "PT"]) {
			expect(dauerInSekunden(wert), String(wert)).toBeNull();
		}
	});
});

describe("plattformAusKategorie", () => {
	it("nimmt nur die beiden Spiel-Kategorien", () => {
		expect(plattformAusKategorie("ps4_game")).toBe("PS4");
		expect(plattformAusKategorie("ps5_native_game")).toBe("PS5");
	});

	it("verwirft alles, was kein Spiel ist", () => {
		// Gemessen am 21.09.2026: Streaming-Apps und Unbestimmtes standen mit
		// in der Antwort; sie duerfen gar nicht erst gespeichert werden.
		for (const k of [
			"ps5_web_based_media_app",
			"ps5_native_media_app",
			"ps4_nongame_mini_app",
			"ps4_videoservice_web_app",
			"unknown",
			"not_found",
			null,
		]) {
			expect(plattformAusKategorie(k), String(k)).toBeNull();
		}
	});
});

describe("spielzeitText", () => {
	it("sagt 'unbekannt' statt 0 - PS3 und Vita liefern nie eine Spielzeit", () => {
		expect(spielzeitText(null)).toBe("unbekannt");
	});

	it("rundet lesbar - fein bei kurzen Zeiten, grob bei langen", () => {
		expect(spielzeitText(30)).toBe("unter 1 min");
		expect(spielzeitText(45 * 60)).toBe("45 min");
		expect(spielzeitText(90 * 60)).toBe("1,5 h");
		expect(spielzeitText(12 * 3600 + 59)).toBe("12 h");
		expect(spielzeitText(87 * 3600 + 1800)).toBe("88 h");
	});
});
