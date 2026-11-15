import { describe, it, expect } from "vitest";
import { SUCH_STATE, nachSuche, ohneSuche, suchSchritt, vonDerSuche } from "../frontend/src/suchverlauf";

/**
 * Wie ein Suchbegriff in den Verlauf kommt (Stufe f2a): Die Zurück-Geste
 * soll erst die Suche leeren, nicht die Liste verlassen.
 */
describe("suchSchritt", () => {
	it("legt beim ersten Begriff einen Eintrag an", () => {
		expect(suchSchritt("", "z", null)).toBe("push");
		// Auch wenn der Eintrag zufaellig markiert ist: ohne Begriff gibt es nichts zu ersetzen.
		expect(suchSchritt("", "z", SUCH_STATE)).toBe("push");
	});

	it("ersetzt beim Weitertippen, ob markiert oder nicht", () => {
		expect(suchSchritt("ze", "zel", SUCH_STATE)).toBe("replace");
		expect(suchSchritt("ze", "zel", null)).toBe("replace");
	});

	it("geht beim Leeren zurueck, wenn der Eintrag von der Suche stammt", () => {
		expect(suchSchritt("zelda", "", SUCH_STATE)).toBe("zurueck");
	});

	it("ersetzt beim Leeren, wenn der Eintrag nicht von der Suche stammt", () => {
		// Ein aufgerufener Link mit Suchparameter: davor liegt eine andere Seite.
		expect(suchSchritt("zelda", "", null)).toBe("replace");
		expect(suchSchritt("zelda", "", undefined)).toBe("replace");
		// Ein fremder state, etwa ein direkt geladener Link mit Suchbegriff.
		expect(suchSchritt("zelda", "", { anderes: true })).toBe("replace");
	});

	it("tut nichts, wenn sich der Begriff nicht aendert", () => {
		expect(suchSchritt("", "", SUCH_STATE)).toBe("keiner");
		expect(suchSchritt("z", "z", null)).toBe("keiner");
	});
});

describe("vonDerSuche", () => {
	it("erkennt nur die eigene Markierung", () => {
		expect(vonDerSuche(SUCH_STATE)).toBe(true);
		expect(vonDerSuche({ suche: "ja" })).toBe(false);
		expect(vonDerSuche(null)).toBe(false);
		expect(vonDerSuche(undefined)).toBe(false);
		expect(vonDerSuche("suche")).toBe(false);
	});
});

describe("ohneSuche", () => {
	it("nimmt Begriff und Seitenzahl heraus, Filter und Sortierung bleiben", () => {
		expect(ohneSuche("?suche=zelda&plattform=PS4&sort=kritik&offset=40", "suche")).toBe("plattform=PS4&sort=kritik");
		expect(ohneSuche("?search=zelda", "search")).toBe("");
	});
});

/**
 * Zurueck aus der Suche nimmt nur den Begriff weg (Nachtrag f2b-c): Was
 * waehrend der Suche an Filtern und Sortierung gesetzt wurde, bleibt.
 */
describe("nachSuche", () => {
	it("uebernimmt den waehrend der Suche gesetzten Filter auf den Eintrag davor", () => {
		expect(nachSuche(true, null, true, "plattform=PS4", "", "suche")).toBe("plattform=PS4");
	});

	it("uebernimmt auch eine zurueckgenommene Sortierung oder einen geloeschten Filter", () => {
		expect(nachSuche(true, null, true, "", "?sort=kritik&plattform=PS4", "suche")).toBe("");
	});

	it("tut nichts, wenn waehrend der Suche nichts geaendert wurde, auch bei anderer Reihenfolge und Seitenzahl", () => {
		expect(nachSuche(true, null, true, "a=1&b=2", "?b=2&a=1", "suche")).toBeNull();
		expect(nachSuche(true, null, true, "a=1", "?a=1&offset=40", "suche")).toBeNull();
	});

	it("greift auch, wenn der Eintrag davor die offene Tafel traegt", () => {
		// Tafel auf, dann gesucht: Zurueck schliesst die Suche, die Tafel steht wieder offen da.
		expect(nachSuche(true, { filtertafel: true }, true, "sort=titel", "", "suche")).toBe("sort=titel");
	});

	it("tut nichts ohne Zurueck, ohne Such-Eintrag davor oder wenn das Ziel selbst einer ist", () => {
		expect(nachSuche(true, null, false, "plattform=PS4", "", "suche")).toBeNull();
		expect(nachSuche(false, null, true, "plattform=PS4", "", "suche")).toBeNull();
		expect(nachSuche(true, SUCH_STATE, true, "plattform=PS4", "?suche=x", "suche")).toBeNull();
		expect(nachSuche(true, null, true, null, "", "suche")).toBeNull();
	});

	it("laesst einen Begriff stehen, den der Eintrag davor selbst traegt", () => {
		expect(nachSuche(true, null, true, "plattform=PS4", "?search=mario", "search")).toBe("plattform=PS4&search=mario");
	});
});
