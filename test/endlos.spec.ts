import { beforeEach, describe, expect, it } from "vitest";
import { anhaengen, holen, merken, mehrDa, neuholenBloecke, schluessel, vergessen } from "../frontend/src/endlos";

/**
 * Die Logik des Endlos-Scrollens (Stufe 22) - ohne React, ohne Browser. Was
 * hier steht, entscheidet, ob nach "Zurueck" dieselbe Liste erscheint und ob
 * ein Spiel doppelt kommt.
 */

beforeEach(() => vergessen());

describe("Schluessel einer Filterkombination", () => {
	it("ist unabhaengig von der Reihenfolge und ohne offset", () => {
		expect(schluessel(new URLSearchParams("sort=wertung&platform=PS4"))).toBe(
			schluessel(new URLSearchParams("platform=PS4&offset=100&sort=wertung")),
		);
	});

	it("unterscheidet Filter und Sortierung", () => {
		const a = schluessel(new URLSearchParams("sort=wertung"));
		expect(schluessel(new URLSearchParams("sort=titel"))).not.toBe(a);
		expect(schluessel(new URLSearchParams("sort=wertung&richtung=auf"))).not.toBe(a);
		expect(schluessel(new URLSearchParams("sort=wertung&search=x"))).not.toBe(a);
	});
});

describe("Zwischenspeicher", () => {
	it("gibt den gemerkten Stand zurueck und vergisst die aeltesten ueber fuenf", () => {
		merken("a", { eintraege: [{ id: 1 }], gesamt: 3, scrollY: 420 });
		expect(holen("a")).toEqual({ eintraege: [{ id: 1 }], gesamt: 3, scrollY: 420 });
		for (const k of ["b", "c", "d", "e", "f"]) merken(k, { eintraege: [], gesamt: 0, scrollY: 0 });
		expect(holen("a")).toBeNull();
		expect(holen("f")).not.toBeNull();
	});

	it("haelt einen erneut gemerkten Stand als juengsten", () => {
		merken("a", { eintraege: [], gesamt: 0, scrollY: 0 });
		for (const k of ["b", "c", "d", "e"]) merken(k, { eintraege: [], gesamt: 0, scrollY: 0 });
		merken("a", { eintraege: [], gesamt: 0, scrollY: 1 });
		merken("f", { eintraege: [], gesamt: 0, scrollY: 0 });
		expect(holen("a")?.scrollY).toBe(1);
		expect(holen("b")).toBeNull();
	});
});

describe("Anhaengen", () => {
	it("haengt ohne Doppelte an - ein verrutschtes Spiel bleibt an seinem ersten Platz", () => {
		expect(anhaengen([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]).map((e) => e.id)).toEqual([1, 2, 3]);
	});

	it("weiss, ob noch etwas kommt", () => {
		expect(mehrDa(50, 431)).toBe(true);
		expect(mehrDa(431, 431)).toBe(false);
	});
});

describe("Neuholen des geladenen Bereichs", () => {
	it("holt in Bloecken zu 100, den letzten nur so gross wie noetig", () => {
		expect(neuholenBloecke(250)).toEqual([
			{ offset: 0, limit: 100 },
			{ offset: 100, limit: 100 },
			{ offset: 200, limit: 50 },
		]);
	});

	it("holt mindestens einen ganzen Block wie beim ersten Laden - auch nach einer leeren Liste", () => {
		expect(neuholenBloecke(0)).toEqual([{ offset: 0, limit: 50 }]);
		expect(neuholenBloecke(30)).toEqual([{ offset: 0, limit: 50 }]);
	});
});
