import { describe, expect, it } from "vitest";
import { KRITIK_ERSATZ, rang } from "../src/domain/rang";
import { DEFAULT_WEIGHTS } from "../src/domain/weights";

describe("rang", () => {
	it("verrechnet Kritik, Prioritaet und Favorit mit den Standardgewichten", () => {
		// 0.8*0.5 + 0.6*0.3 + 0
		expect(rang({ kritik: 80, prioritaet: 3, favorit: false }, DEFAULT_WEIGHTS)).toBeCloseTo(0.58);
	});

	it("setzt eine fehlende Wertung auf 70, nicht auf 0", () => {
		expect(KRITIK_ERSATZ).toBe(70);
		expect(rang({ kritik: null, prioritaet: 3, favorit: false }, DEFAULT_WEIGHTS)).toBeCloseTo(
			rang({ kritik: 70, prioritaet: 3, favorit: false }, DEFAULT_WEIGHTS),
		);
	});

	it("laesst einen Favoriten mit Bestwerten genau 1.0 erreichen, alles andere hoechstens 0.8", () => {
		expect(rang({ kritik: 100, prioritaet: 5, favorit: true }, DEFAULT_WEIGHTS)).toBeCloseTo(1);
		expect(rang({ kritik: 100, prioritaet: 5, favorit: false }, DEFAULT_WEIGHTS)).toBeCloseTo(0.8);
	});

	it("haelt einen Favoriten mit maessiger Wertung ueber einem Nicht-Favoriten mit guter", () => {
		const favorit = rang({ kritik: 60, prioritaet: 3, favorit: true }, DEFAULT_WEIGHTS);
		const gut = rang({ kritik: 90, prioritaet: 3, favorit: false }, DEFAULT_WEIGHTS);
		expect(favorit).toBeGreaterThan(gut);
	});

	it("folgt geaenderten Gewichten", () => {
		const nurPrioritaet = { w_critic: 0, w_priority: 1, w_favorite: 0, w_price: 0 };
		expect(rang({ kritik: 100, prioritaet: 2, favorit: true }, nurPrioritaet)).toBeCloseTo(0.4);
		expect(rang({ kritik: 0, prioritaet: 5, favorit: false }, nurPrioritaet)).toBeCloseTo(1);
	});
});
