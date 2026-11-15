import { describe, expect, it } from "vitest";
import { SUCH_STATE } from "../frontend/src/suchverlauf";
import { TAFEL_STATE, nachTafel, schliessSchritt, stateNachFilter, stateZumOeffnen, tafelOffen } from "../frontend/src/filterverlauf";

/**
 * Die Filtertafel im Verlauf (Stufe f2b): Zurueck schliesst die offene Tafel
 * und laesst die darin gesetzten Filter stehen.
 */
describe("tafelOffen", () => {
	it("erkennt nur die eigene Markierung", () => {
		expect(tafelOffen(TAFEL_STATE)).toBe(true);
		expect(tafelOffen({ ...SUCH_STATE, filtertafel: true })).toBe(true);
		expect(tafelOffen(SUCH_STATE)).toBe(false);
		expect(tafelOffen(null)).toBe(false);
		expect(tafelOffen(undefined)).toBe(false);
		expect(tafelOffen({ filtertafel: "ja" })).toBe(false);
	});
});

describe("stateZumOeffnen", () => {
	it("markiert den neuen Eintrag und behaelt fremde Schluessel", () => {
		expect(stateZumOeffnen(null)).toEqual(TAFEL_STATE);
		expect(stateZumOeffnen({ anderes: 1 })).toEqual({ anderes: 1, filtertafel: true });
	});

	it("laesst die Such-Markierung fallen", () => {
		// Sonst ginge ein geleertes Suchfeld bei offener Tafel auf die Suche zurueck.
		expect(stateZumOeffnen(SUCH_STATE)).toEqual(TAFEL_STATE);
	});
});

describe("stateNachFilter", () => {
	it("behaelt bei offener Tafel nur ihre Markierung", () => {
		expect(stateNachFilter({ ...SUCH_STATE, filtertafel: true })).toEqual(TAFEL_STATE);
	});

	it("schreibt ohne Tafel keinen state, wie bisher", () => {
		expect(stateNachFilter(SUCH_STATE)).toBeNull();
		expect(stateNachFilter(null)).toBeNull();
	});
});

describe("schliessSchritt", () => {
	it("geht nur aus dem eigenen Eintrag zurueck", () => {
		expect(schliessSchritt(TAFEL_STATE)).toBe("zurueck");
		expect(schliessSchritt(null)).toBe("keiner");
		expect(schliessSchritt(SUCH_STATE)).toBe("keiner");
	});
});

describe("nachTafel", () => {
	it("uebernimmt nach dem Zurueck die in der Tafel gesetzten Filter", () => {
		expect(nachTafel(true, null, true, "?plattform=PS4,PS5", "")).toBe("?plattform=PS4,PS5");
	});

	it("nimmt auch das Zuruecksetzen mit", () => {
		expect(nachTafel(true, null, true, "sort=titel", "?plattform=PS4&sort=titel")).toBe("sort=titel");
	});

	it("tut nichts, wenn sich nichts geaendert hat, auch bei anderer Reihenfolge", () => {
		expect(nachTafel(true, null, true, "?a=1&b=2", "?b=2&a=1")).toBeNull();
	});

	it("tut nichts ohne Zurueck: Ein neuer Eintrag (Suche) schliesst die Tafel nur", () => {
		expect(nachTafel(true, SUCH_STATE, false, "?plattform=PS4", "?plattform=PS4&suche=x")).toBeNull();
	});

	it("tut nichts, solange die Tafel offen bleibt oder vorher zu war", () => {
		expect(nachTafel(true, TAFEL_STATE, true, "?plattform=PS4", "")).toBeNull();
		expect(nachTafel(false, null, true, "?plattform=PS4", "")).toBeNull();
		expect(nachTafel(true, null, true, null, "")).toBeNull();
	});
});
