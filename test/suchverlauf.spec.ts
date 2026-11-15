import { describe, it, expect } from "vitest";
import { SUCH_STATE, suchSchritt, vonDerSuche } from "../frontend/src/suchverlauf";

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
		// Ein Chip hat den Eintrag ersetzt und die Markierung fallen lassen.
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
