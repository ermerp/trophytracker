import { describe, it, expect } from "vitest";
import { DEFAULT_WEIGHTS, parseWeights, WeightsError } from "../src/domain/weights";

const gueltig = { w_critic: 0.5, w_priority: 0.3, w_favorite: 0.2, w_price: 0 };

describe("parseWeights", () => {
	it("nimmt eine vollstaendige, gueltige Gewichtung an", () => {
		expect(parseWeights(gueltig)).toEqual(gueltig);
	});

	it("nimmt die Randwerte 0 und 1 an", () => {
		const rand = { w_critic: 0, w_priority: 1, w_favorite: 0, w_price: 1 };
		expect(parseWeights(rand)).toEqual(rand);
	});

	it.each([
		["kein Objekt", "nein"],
		["null", null],
		["Array", [0.5, 0.3, 0.2, 0]],
	])("weist %s zurueck", (_name, eingabe) => {
		expect(() => parseWeights(eingabe)).toThrow(WeightsError);
	});

	it("weist eine fehlende Gewichtung zurueck", () => {
		const { w_price, ...unvollstaendig } = gueltig;
		expect(() => parseWeights(unvollstaendig)).toThrow(/w_price/);
	});

	it("weist unbekannte Schluessel zurueck, statt sie zu schlucken", () => {
		expect(() => parseWeights({ ...gueltig, w_tippfehler: 0.1 })).toThrow(/w_tippfehler/);
	});

	it.each([1.5, -0.1])("weist den Wert %s ausserhalb von 0..1 zurueck", (wert) => {
		expect(() => parseWeights({ ...gueltig, w_critic: wert })).toThrow(/zwischen 0 und 1/);
	});

	it.each([["Zeichenkette", "0.5"], ["NaN", NaN], ["Infinity", Infinity]])(
		"weist %s als Wert zurueck",
		(_name, wert) => {
			expect(() => parseWeights({ ...gueltig, w_critic: wert })).toThrow(WeightsError);
		},
	);

	it("haelt DEFAULT_WEIGHTS selbst gueltig", () => {
		expect(parseWeights({ ...DEFAULT_WEIGHTS })).toEqual(DEFAULT_WEIGHTS);
	});
});
