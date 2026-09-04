import { describe, it, expect } from "vitest";
import {
	extractTotalItemCount,
	naechsterOffset,
	SEITENGROESSE,
} from "../src/domain/trophy-pages";

describe("extractTotalItemCount", () => {
	it("findet den Wert per Regex", () => {
		expect(extractTotalItemCount('{"trophyTitles":[],"totalItemCount":247}')).toBe(247);
	});

	it("vertraegt Leerzeichen um den Doppelpunkt", () => {
		expect(extractTotalItemCount('{"totalItemCount" :  42 }')).toBe(42);
	});

	it("findet 0", () => {
		expect(extractTotalItemCount('{"totalItemCount":0}')).toBe(0);
	});

	it("faellt auf JSON.parse zurueck, wenn die Regex nicht greift", () => {
		// Escape-Sequenz, die die Regex nicht trifft, JSON.parse aber schon
		const raw = JSON.stringify({ hinweis: '"totalItemCount": 999', totalItemCount: 7 });
		expect(extractTotalItemCount(raw)).toBe(7);
	});

	it("liefert null bei fehlendem Feld", () => {
		expect(extractTotalItemCount('{"trophyTitles":[]}')).toBeNull();
	});

	it("liefert null bei kaputtem JSON ohne Feld", () => {
		expect(extractTotalItemCount("kein json")).toBeNull();
	});
});

describe("naechsterOffset", () => {
	it("blaettert weiter, solange etwas offen ist", () => {
		expect(naechsterOffset(0, 100, 247)).toBe(100);
		expect(naechsterOffset(100, 100, 247)).toBe(200);
	});

	it("endet, wenn die letzte Seite geholt ist", () => {
		expect(naechsterOffset(200, 100, 247)).toBeNull();
	});

	it("endet bei genau aufgehender Teilung", () => {
		expect(naechsterOffset(100, 100, 200)).toBeNull();
	});

	it("endet bei leerer Sammlung", () => {
		expect(naechsterOffset(0, 100, 0)).toBeNull();
	});

	it("bricht ab, statt bei unbekanntem Gesamtwert endlos zu blaettern", () => {
		expect(naechsterOffset(0, 100, null)).toBeNull();
	});

	it("nutzt eine Seitengroesse, die zum Budget passt", () => {
		expect(SEITENGROESSE).toBeLessThanOrEqual(100);
	});
});
