import { describe, it, expect } from "vitest";
import { BESTAETIGUNGEN, istBestaetigt, zaehleLesung, type Kandidat } from "../frontend/src/bestaetigung";

/**
 * Der Scanner nimmt einen Code erst an, wenn zwei Lesungen ihn bestaetigen
 * (Abschnitt 9.1, nach dem Fehlscan vom 17.09.2026).
 */

/** Spielt eine Folge von Lesungen ab und liefert die angenommenen Codes. */
function angenommen(lesungen: string[]): string[] {
	let kandidat: Kandidat = null;
	const ergebnis: string[] = [];
	for (const code of lesungen) {
		kandidat = zaehleLesung(kandidat, code);
		if (istBestaetigt(kandidat)) {
			ergebnis.push(kandidat.code);
			kandidat = null;
		}
	}
	return ergebnis;
}

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
