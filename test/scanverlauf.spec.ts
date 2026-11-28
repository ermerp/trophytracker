import { describe, expect, it } from "vitest";
import {
	GRENZE,
	aendern,
	alsText,
	lesen,
	listeOffen,
	neueId,
	stateZurListe,
	vorne,
	zuruecknehmen,
	type ScanEintrag,
} from "../frontend/src/scanverlauf";

/** „Letzte Scans" (Nachtrag f1g): nur auf dem Geraet, die letzten 50. */

const eintrag = (id: string, felder: Partial<ScanEintrag> = {}): ScanEintrag => ({
	id,
	ean: "4005209114554",
	zeit: "2026-11-28T14:32:00.000Z",
	ergebnis: "abgebrochen",
	spielId: null,
	titel: null,
	plattform: null,
	bild: null,
	...felder,
});

describe("lesen", () => {
	it("leerer, fehlender und kaputter Speicher ergeben eine leere Liste", () => {
		expect(lesen(null)).toEqual([]);
		expect(lesen("")).toEqual([]);
		expect(lesen("{kein json")).toEqual([]);
		expect(lesen('{"id":"a"}')).toEqual([]);
		expect(lesen("42")).toEqual([]);
	});

	it("verwirft Eintraege ohne Pflichtfelder oder mit unbekanntem Ergebnis, behaelt die guten", () => {
		const roh = JSON.stringify([
			eintrag("a"),
			{ id: "b", ean: "1", zeit: "x", ergebnis: "verloren" },
			{ ean: "1", zeit: "x", ergebnis: "erfasst" },
			null,
			eintrag("c", { ergebnis: "erfasst", spielId: 5 }),
		]);
		expect(lesen(roh).map((e) => e.id)).toEqual(["a", "c"]);
	});

	it("falsch getypte Nebenfelder werden null statt die Zeile zu verwerfen", () => {
		const roh = JSON.stringify([{ ...eintrag("a"), spielId: "5", titel: 3, plattform: ["PS4"], bild: {} }]);
		expect(lesen(roh)[0]).toMatchObject({ spielId: null, titel: null, plattform: null, bild: null });
	});

	it("kappt auch einen zu langen Speicher auf die Grenze", () => {
		const roh = JSON.stringify(Array.from({ length: GRENZE + 5 }, (_, i) => eintrag(`e${i}`)));
		expect(lesen(roh)).toHaveLength(GRENZE);
	});

	it("ueberlebt den Weg durch alsText", () => {
		const liste = [eintrag("a", { ergebnis: "regal", spielId: 3, titel: "Kraterlaeufer 2", plattform: "PS3" })];
		expect(lesen(alsText(liste))).toEqual(liste);
	});
});

describe("vorne", () => {
	it("neuester Eintrag vorn, gekappt auf 50", () => {
		let liste: ScanEintrag[] = [];
		for (let i = 0; i < GRENZE + 3; i++) liste = vorne(liste, eintrag(`e${i}`));
		expect(liste).toHaveLength(GRENZE);
		expect(liste[0].id).toBe(`e${GRENZE + 2}`);
		expect(liste.at(-1)?.id).toBe("e3");
	});

	it("derselbe Eintrag (gleiche Id) rueckt nach vorn statt doppelt zu stehen", () => {
		const liste = vorne(vorne([eintrag("a")], eintrag("b")), eintrag("a", { ergebnis: "erfasst" }));
		expect(liste.map((e) => `${e.id}:${e.ergebnis}`)).toEqual(["a:erfasst", "b:abgebrochen"]);
	});
});

describe("aendern und zuruecknehmen", () => {
	it("aendert nur den Eintrag mit der Id", () => {
		const liste = aendern([eintrag("a"), eintrag("b")], "b", { ergebnis: "erfasst" });
		expect(liste.map((e) => e.ergebnis)).toEqual(["abgebrochen", "erfasst"]);
		expect(aendern(liste, "zz", { ergebnis: "regal" })).toEqual(liste);
	});

	it("Rueckgaengig: 'zurueckgenommen', der Link bleibt, wenn das Spiel bleibt", () => {
		const liste = zuruecknehmen([eintrag("a", { ergebnis: "erfasst", spielId: 9 })], "a", false);
		expect(liste[0]).toMatchObject({ ergebnis: "zurueckgenommen", spielId: 9 });
	});

	it("Rueckgaengig nach 'Anlegen + Disc erfassen': das Spiel ist weg, also auch der Link", () => {
		const liste = zuruecknehmen([eintrag("a", { ergebnis: "erfasst", spielId: 9, titel: "Sternenwerft" })], "a", true);
		expect(liste[0]).toMatchObject({ ergebnis: "zurueckgenommen", spielId: null, titel: "Sternenwerft" });
	});
});

describe("neueId", () => {
	it("unterscheidet zwei Eintraege derselben Millisekunde", () => {
		expect(neueId("1", 1000, 0.1)).not.toBe(neueId("1", 1000, 0.2));
	});
});

describe("Liste im Verlauf", () => {
	it("Oeffnen markiert den Eintrag, fremde Schluessel bleiben", () => {
		expect(listeOffen(null)).toBe(false);
		const s = stateZurListe({ suche: true });
		expect(s).toEqual({ suche: true, scanliste: true });
		expect(listeOffen(s)).toBe(true);
	});
});
