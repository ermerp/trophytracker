import { describe, expect, it } from "vitest";
import { SUCH_STATE } from "../frontend/src/suchverlauf";
import {
	MENUE_STATE,
	TAFEL_STATE,
	menueOffen,
	nachMenue,
	nachTafel,
	schliessSchritt,
	stateNachFilter,
	stateZumMenue,
	stateZumOeffnen,
	tafelOffen,
	zeilenmenueOffen,
	stateZumZeilenmenue,
} from "../frontend/src/filterverlauf";

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
	it("behaelt bei offener Tafel ihre Markierung und die der Suche", () => {
		expect(stateNachFilter({ ...SUCH_STATE, filtertafel: true })).toEqual({ ...SUCH_STATE, ...TAFEL_STATE });
		expect(stateNachFilter(TAFEL_STATE)).toEqual(TAFEL_STATE);
	});

	it("behaelt die Markierung des Sortiermenues, allein oder ueber der Tafel", () => {
		// Sonst schloesse die gewaehlte Sortierung das Menue per replace, und sein Eintrag bliebe verwaist.
		expect(stateNachFilter(MENUE_STATE)).toEqual(MENUE_STATE);
		expect(stateNachFilter({ ...TAFEL_STATE, ...MENUE_STATE })).toEqual({ ...TAFEL_STATE, ...MENUE_STATE });
	});

	it("behaelt die Such-Markierung: Zurueck aus der Suche nimmt den Filter dann mit", () => {
		// Bis f2b-c fiel sie hier, und das Kreuz ersetzte statt zurueckzugehen.
		expect(stateNachFilter(SUCH_STATE)).toEqual(SUCH_STATE);
	});

	it("schreibt ohne Markierung keinen state und laesst fremde Schluessel fallen", () => {
		expect(stateNachFilter(null)).toBeNull();
		expect(stateNachFilter({ anderes: 1 })).toBeNull();
		expect(stateNachFilter({ ...SUCH_STATE, anderes: 1 })).toEqual(SUCH_STATE);
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

/**
 * Das Sortiermenue im Verlauf (Nachtrag f2b-c): Zurueck schliesst es, die
 * darin gewaehlte Sortierung bleibt stehen.
 */
describe("menueOffen", () => {
	it("erkennt nur die eigene Markierung", () => {
		expect(menueOffen(MENUE_STATE)).toBe(true);
		expect(menueOffen({ ...TAFEL_STATE, ...MENUE_STATE })).toBe(true);
		expect(menueOffen(TAFEL_STATE)).toBe(false);
		expect(menueOffen(SUCH_STATE)).toBe(false);
		expect(menueOffen(null)).toBe(false);
		expect(menueOffen({ sortiermenue: 1 })).toBe(false);
	});

	it("ist von der Tafel unabhaengig", () => {
		expect(tafelOffen(MENUE_STATE)).toBe(false);
	});
});

describe("stateZumMenue", () => {
	it("behaelt eine offene Tafel: Zurueck schliesst dann nur das Menue", () => {
		expect(stateZumMenue(TAFEL_STATE)).toEqual({ ...TAFEL_STATE, ...MENUE_STATE });
	});

	it("laesst die Such-Markierung fallen", () => {
		expect(stateZumMenue(SUCH_STATE)).toEqual(MENUE_STATE);
		expect(stateZumMenue(null)).toEqual(MENUE_STATE);
	});
});

describe("nachMenue", () => {
	it("uebernimmt nach dem Zurueck die im Menue gewaehlte Sortierung", () => {
		expect(nachMenue(true, null, true, "?sort=preis", "")).toBe("?sort=preis");
	});

	it("schaut auf das Menue, nicht auf die Tafel", () => {
		// Menue ueber der Tafel: Zurueck landet auf dem Tafel-Eintrag, das Menue ist zu.
		expect(nachMenue(true, TAFEL_STATE, true, "?plattform=PS4&sort=preis", "?plattform=PS4")).toBe("?plattform=PS4&sort=preis");
		expect(nachMenue(true, MENUE_STATE, true, "?sort=preis", "")).toBeNull();
	});

	it("tut nichts ohne Zurueck, ohne Aenderung oder wenn das Menue vorher zu war", () => {
		expect(nachMenue(true, null, false, "?sort=preis", "")).toBeNull();
		expect(nachMenue(true, null, true, "?a=1&b=2", "?b=2&a=1")).toBeNull();
		expect(nachMenue(false, null, true, "?sort=preis", "")).toBeNull();
	});
});

/** Das Menue einer Zeile der Preisliste (Nachtrag f2e): ein Schluessel je Zeile. */
describe("zeilenmenueOffen", () => {
	it("nennt den Schluessel der offenen Zeile und sonst null", () => {
		expect(zeilenmenueOffen({ zeilenmenue: "p12" })).toBe("p12");
		expect(zeilenmenueOffen({ zeilenmenue: true })).toBeNull();
		expect(zeilenmenueOffen(MENUE_STATE)).toBeNull();
		expect(zeilenmenueOffen(null)).toBeNull();
	});
});

describe("stateZumZeilenmenue", () => {
	it("setzt den Schluessel, laesst die Tafel stehen und nimmt die Suche weg", () => {
		expect(stateZumZeilenmenue({ ...SUCH_STATE, ...TAFEL_STATE }, "l7")).toEqual({ filtertafel: true, zeilenmenue: "l7" });
		expect(stateZumZeilenmenue(null, "p1")).toEqual({ zeilenmenue: "p1" });
	});
});
