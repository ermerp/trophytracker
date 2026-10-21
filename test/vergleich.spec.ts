import { describe, it, expect } from "vitest";
import type { PlanEintrag } from "../frontend/src/api";
import { LUECKEN_NATUERLICH, SORTIER_NATUERLICH, VERGLEICH, lueckenVergleich, type LueckeSortierfelder, type Sortierung } from "../frontend/src/vergleich";

/**
 * Die Vergleicher der Listen (Stufe 20e-b). Bis dahin hat sie nie ein Test
 * ausgefuehrt, und seit dem 02.10.2026 standen in Wunschliste, Backlog und
 * Kaufliste drei Sortierungen in ihrer natuerlichen Richtung verkehrt herum.
 * Geprueft wird deshalb immer die natuerliche Richtung - die, die man ohne
 * Klick sieht - und die umgekehrte, jeweils mit einem Eintrag ohne Wert.
 */

let id = 0;
const eintrag = (titel: string, felder: Partial<PlanEintrag> = {}): PlanEintrag =>
	({ id: ++id, titel, kritik: null, erscheinungsdatum: null, angelegtAm: "2026-01-01T00:00:00Z", favorit: false, preisCents: null, position: null, ...felder }) as PlanEintrag;

const liste = [
	eintrag("Mittel", { kritik: 80, erscheinungsdatum: "2015-03-24", angelegtAm: "2026-02-01T00:00:00Z" }),
	eintrag("Favorit", { kritik: 70, erscheinungsdatum: "2020-11-12", angelegtAm: "2026-03-01T00:00:00Z", favorit: true }),
	eintrag("Ohne", { angelegtAm: "2026-01-15T00:00:00Z" }),
	eintrag("Beste", { kritik: 90, erscheinungsdatum: "2001-09-24", angelegtAm: "2026-04-01T00:00:00Z" }),
];
const ordne = (s: Sortierung, richtung = SORTIER_NATUERLICH[s]) => [...liste].sort(VERGLEICH(s, richtung)).map((e) => e.titel);

describe("VERGLEICH der Listen in der natuerlichen Richtung", () => {
	it("Kritikerwertung: beste zuerst, ohne Wertung am Ende", () => {
		expect(ordne("wertung")).toEqual(["Beste", "Mittel", "Favorit", "Ohne"]);
	});

	it("Favoriten zuerst, darunter beste Wertung, ohne Wertung am Ende", () => {
		expect(ordne("favorit")).toEqual(["Favorit", "Beste", "Mittel", "Ohne"]);
	});

	it("zuletzt angelegt: neueste zuerst", () => {
		expect(ordne("angelegt")).toEqual(["Beste", "Favorit", "Mittel", "Ohne"]);
	});

	it("Erscheinungsdatum: neuestes zuerst (seit 20e-b), ohne Datum am Ende", () => {
		expect(SORTIER_NATUERLICH.release).toBe("ab");
		expect(ordne("release")).toEqual(["Favorit", "Mittel", "Beste", "Ohne"]);
	});
});

describe("VERGLEICH der Listen umgekehrt", () => {
	it("dreht die Werte, aber nie die Eintraege ohne Wert nach vorn", () => {
		expect(ordne("wertung", "auf")).toEqual(["Favorit", "Mittel", "Beste", "Ohne"]);
		expect(ordne("release", "auf")).toEqual(["Beste", "Mittel", "Favorit", "Ohne"]);
		expect(ordne("favorit", "auf")).toEqual(["Mittel", "Beste", "Ohne", "Favorit"]);
		expect(ordne("angelegt", "auf")).toEqual(["Ohne", "Mittel", "Favorit", "Beste"]);
	});
});

describe("lueckenVergleich (Stufe 20e-b)", () => {
	const l = (titel: string, kritik: number | null, erscheinungsdatum: string | null): LueckeSortierfelder => ({
		titel, plattform: "PS4", besterGebrauchtpreisCents: null, fortschritt: 50, kritik, erscheinungsdatum,
	});
	const luecken = [l("A", 75, "2010-01-01"), l("B", null, null), l("C", 95, "2019-06-01")];
	const ordneL = (s: "wertung" | "release", richtung = LUECKEN_NATUERLICH[s]) =>
		[...luecken].sort(lueckenVergleich(s, richtung)).map((x) => x.titel);

	it("Kritikerwertung beste zuerst, Erscheinungsdatum neuestes zuerst", () => {
		expect(ordneL("wertung")).toEqual(["C", "A", "B"]);
		expect(ordneL("release")).toEqual(["C", "A", "B"]);
	});

	it("umgekehrt bleibt ohne Wert am Ende", () => {
		expect(ordneL("wertung", "auf")).toEqual(["A", "C", "B"]);
		expect(ordneL("release", "auf")).toEqual(["A", "C", "B"]);
	});
});
