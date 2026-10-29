import { describe, it, expect } from "vitest";
import { platinAus } from "../src/api/antwort";

describe("platinAus", () => {
	it("meldet 'nicht_verfuegbar', wenn es gar keine Platin-Trophaee gibt", () => {
		// Der Fall, vor dem Abschnitt 4.1 warnt: 93 von 431 echten Titeln.
		expect(platinAus(0, 0)).toBe("nicht_verfuegbar");
	});

	it("meldet 'nicht_verfuegbar' auch ohne Trophaeenliste", () => {
		expect(platinAus(null, null)).toBe("nicht_verfuegbar");
	});

	it("meldet 'erspielt'", () => {
		expect(platinAus(1, 1)).toBe("erspielt");
	});

	it("meldet 'offen'", () => {
		expect(platinAus(1, 0)).toBe("offen");
		expect(platinAus(1, null)).toBe("offen");
	});
});
