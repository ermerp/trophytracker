import { describe, it, expect } from "vitest";
import { BESTAETIGUNGEN, besterTreffer, istBestaetigt, noetigeBestaetigungen, zaehleLesung, type Kandidat } from "../frontend/src/bestaetigung";

/**
 * Der Scanner nimmt einen Code erst an, wenn zwei Lesungen ihn bestaetigen
 * (Abschnitt 9.1, nach dem Fehlscan vom 17.09.2026).
 */

/** Spielt eine Folge von Lesungen ab und liefert die angenommenen Codes. */
function angenommen(lesungen: string[], noetig = BESTAETIGUNGEN): string[] {
	let kandidat: Kandidat = null;
	const ergebnis: string[] = [];
	for (const code of lesungen) {
		kandidat = zaehleLesung(kandidat, code);
		if (istBestaetigt(kandidat, noetig)) {
			ergebnis.push(kandidat.code);
			kandidat = null;
		}
	}
	return ergebnis;
}

describe("UPC-A braucht mehr Belege (18.09.2026)", () => {
	it("verlangt drei Lesungen fuer einen UPC-A, zwei sonst", () => {
		expect(noetigeBestaetigungen("upc_a")).toBe(3);
		expect(noetigeBestaetigungen("ean_13")).toBe(2);
		expect(noetigeBestaetigungen(undefined)).toBe(2);
		expect(angenommen(["089555400404", "089555400404"], 3)).toEqual([]);
		expect(angenommen(["089555400404", "089555400404", "089555400404"], 3)).toEqual(["089555400404"]);
	});

	it("nimmt im selben Bild den EAN-13, nicht den UPC-A", () => {
		// Genau der Fall vom 18.09.2026: derselbe Barcode, zweimal gelesen.
		const codes = [
			{ rawValue: "089555400404", format: "upc_a" },
			{ rawValue: "5026555400404", format: "ean_13" },
		];
		expect(besterTreffer(codes)?.rawValue).toBe("5026555400404");
		expect(besterTreffer([codes[0]])?.rawValue).toBe("089555400404");
	});

	it("laesst Buchstaben und Bruchstuecke gar nicht erst durch", () => {
		expect(besterTreffer([{ rawValue: "ABC", format: "code_128" }, { rawValue: "12", format: "ean_8" }])).toBeUndefined();
		expect(besterTreffer([])).toBeUndefined();
	});
});

describe("Bestaetigung einer Lesung", () => {
	it("nimmt einen Code erst bei der zweiten gleichen Lesung an", () => {
		expect(BESTAETIGUNGEN).toBe(2);
		expect(angenommen(["4005209114554"])).toEqual([]);
		expect(angenommen(["4005209114554", "4005209114554"])).toEqual(["4005209114554"]);
	});

	it("nimmt einen einzelnen Fehlgriff zwischen richtigen Lesungen nicht an", () => {
		// Der echte Fall: ein Bild liest 8005809114554 statt 4005209114554.
		expect(angenommen(["4005209114554", "8005809114554", "4005209114554", "4005209114554"])).toEqual(["4005209114554"]);
	});

	it("nimmt nichts an, solange jede Lesung anders ausfaellt", () => {
		expect(angenommen(["1", "2", "3", "4", "5"])).toEqual([]);
	});

	it("beginnt nach einer Annahme von vorn", () => {
		expect(angenommen(["a", "a", "a"])).toEqual(["a"]);
		expect(angenommen(["a", "a", "a", "a"])).toEqual(["a", "a"]);
	});

	it("laesst sich wiederholt bestaetigen, auch bei wechselnden Codes", () => {
		expect(angenommen(["a", "b", "b", "a", "a"])).toEqual(["b", "a"]);
	});
});
