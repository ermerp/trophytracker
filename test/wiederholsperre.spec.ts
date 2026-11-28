import { describe, expect, it } from "vitest";
import { ABWESEND_MS, bildVerbuchen, gesperrt, sperren, type Sperre } from "../frontend/src/wiederholsperre";

/**
 * Derselbe Code nach "×" oder Rueckgaengig (Nachtrag f1h): gesperrt, solange
 * die Huelle im Bild ist, frei, sobald sie ABWESEND_MS lang fehlte.
 */

const CODE = "4005209114554";
const ANDERER = "4006381333931";

/** Bilder im Takt von 150 ms; `lesungen[i]` ist der Code des i-ten Bildes. */
function bilder(start: Sperre, lesungen: Array<string | null>, ab = 0): Sperre {
	return lesungen.reduce<Sperre>((s, code, i) => bildVerbuchen(s, code, ab + i * 150), start);
}

describe("wiederholsperre", () => {
	it("sperrt den angenommenen Code, nicht einen anderen", () => {
		const s = sperren(CODE);
		expect(gesperrt(s, CODE)).toBe(true);
		expect(gesperrt(s, ANDERER)).toBe(false);
	});

	it("bleibt gesperrt, solange die Huelle im Bild ist - auch weit ueber zwei Sekunden", () => {
		// Der Fall, gegen den die alten zwei Sekunden nicht reichten: die
		// Huelle liegt nach "erfasst" noch vor der Kamera.
		const s = bilder(sperren(CODE), Array(60).fill(CODE));
		expect(gesperrt(s, CODE)).toBe(true);
	});

	it("gibt frei, wenn der Code ABWESEND_MS lang in keinem Bild stand (der gemeldete Fehler)", () => {
		const n = Math.ceil(ABWESEND_MS / 150) + 1;
		const s = bilder(sperren(CODE), Array(n).fill(null));
		expect(s).toBeNull();
		expect(gesperrt(s, CODE)).toBe(false);
	});

	it("ein kurzes Bild ohne Code (Unschaerfe) gibt nicht frei", () => {
		const s = bilder(sperren(CODE), [CODE, null, null, CODE, null, CODE]);
		expect(gesperrt(s, CODE)).toBe(true);
	});

	it("die Abwesenheit beginnt neu, wenn der Code dazwischen wieder gelesen wird", () => {
		const fast = Math.floor(ABWESEND_MS / 150) - 1;
		const s = bilder(sperren(CODE), [...Array(fast).fill(null), CODE, ...Array(fast).fill(null)]);
		expect(gesperrt(s, CODE)).toBe(true);
	});

	it("ein anderer Code im Bild zaehlt als 'weg'", () => {
		const n = Math.ceil(ABWESEND_MS / 150) + 1;
		expect(bilder(sperren(CODE), Array(n).fill(ANDERER))).toBeNull();
	});

	it("ohne Sperre bleibt es frei", () => {
		expect(bildVerbuchen(null, CODE, 0)).toBeNull();
	});
});
