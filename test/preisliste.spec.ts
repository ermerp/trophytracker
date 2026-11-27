import { describe, expect, it } from "vitest";
import {
	angebotEintrag,
	digitalVorgesehen,
	eintraegeText,
	erfassenZurueck,
	erfasstText,
	erledigteListe,
	lueckeMenue,
	lueckenSortierwert,
	menueNurHandy,
	nachBefund,
	passtZuPreis,
	preisFilterAusParam,
	planMenue,
	rabattProzent,
	sortierwert,
	tagDatum,
	wunschKopf,
	type PlanMenueFelder,
	type SortierwertFelder,
} from "../frontend/src/preisliste";

/**
 * Die Preisliste (Nachtrag f2e): Sortierwert der Meta-Zeile, Menue je Art
 * und Status, Rueckweg nach dem Erfassen. Jeder Fall nimmt die Lage, in der
 * nur die gepruefte Regel greift.
 */

const felder = (f: Partial<SortierwertFelder> = {}): SortierwertFelder => ({
	spieler: 94,
	kritik: 81,
	erscheinungsdatum: "2019-03-22",
	angekuendigt: false,
	...f,
});

describe("sortierwert", () => {
	it("nennt die Spielerwertung bei Titel, Favorit, angelegt und Preis", () => {
		for (const s of ["titel", "favorit", "angelegt", "preis", "wertung"] as const) {
			expect(sortierwert(s, felder())).toEqual({ vor: "Wertung", wert: "94" });
		}
	});

	it("nennt die Kritikerwertung nur beim Sortieren danach", () => {
		expect(sortierwert("kritik", felder())).toEqual({ vor: "Kritik", wert: "81" });
	});

	it("schreibt einen fehlenden Wert als unbekannt aus", () => {
		expect(sortierwert("wertung", felder({ spieler: null }))).toEqual({ vor: "Wertung", wert: "unbekannt" });
		expect(sortierwert("kritik", felder({ kritik: null }))).toEqual({ vor: "Kritik", wert: "unbekannt" });
		expect(sortierwert("release", felder({ erscheinungsdatum: null }))).toEqual({ vor: "Release", wert: "unbekannt" });
		expect(sortierwert("release", felder({ erscheinungsdatum: null, angekuendigt: true }))).toEqual({ vor: "erscheint", wert: "unbekannt" });
	});

	it("nennt beim Erscheinungsdatum das Jahr, bei angekuendigten den Tag", () => {
		expect(sortierwert("release", felder())).toEqual({ vor: null, wert: "2019" });
		expect(sortierwert("release", felder({ erscheinungsdatum: "2027-03-12", angekuendigt: true }))).toEqual({ vor: "erscheint", wert: "12.3.2027" });
	});

	it("nimmt eine Wertung von 0 als Wert, nicht als unbekannt", () => {
		expect(sortierwert("wertung", felder({ spieler: 0 }))).toEqual({ vor: "Wertung", wert: "0" });
	});
});

describe("lueckenSortierwert", () => {
	it("nennt nichts, wo Fortschritt und Preis schon in der Zeile stehen", () => {
		expect(lueckenSortierwert("titel", felder())).toBeNull();
		expect(lueckenSortierwert("preis", felder())).toBeNull();
		expect(lueckenSortierwert("fortschritt", felder())).toBeNull();
	});

	it("nennt Wertung, Kritik und Jahr beim Sortieren danach, auch unbekannt", () => {
		expect(lueckenSortierwert("wertung", felder({ spieler: null }))).toEqual({ vor: "Wertung", wert: "unbekannt" });
		expect(lueckenSortierwert("kritik", felder())).toEqual({ vor: "Kritik", wert: "81" });
		expect(lueckenSortierwert("release", felder())).toEqual({ vor: null, wert: "2019" });
	});
});

describe("tagDatum", () => {
	it("schreibt Tag und Monat ohne fuehrende Null, auch aus einem Zeitstempel", () => {
		expect(tagDatum("2027-03-12")).toBe("12.3.2027");
		expect(tagDatum("2026-11-05T00:00:00Z")).toBe("5.11.2026");
	});
});

describe("digitalVorgesehen", () => {
	it("gibt es nur fuer PS4 und PS5 – PS3, Vita und Freitext haben keinen Store-Preis", () => {
		expect(digitalVorgesehen("PS4")).toBe(true);
		expect(digitalVorgesehen("PS5")).toBe(true);
		expect(digitalVorgesehen("PS3")).toBe(false);
		expect(digitalVorgesehen("PSVITA")).toBe(false);
		expect(digitalVorgesehen(null)).toBe(false);
	});
});

describe("rabattProzent", () => {
	it("rechnet den Rabatt gegen den Grundpreis, nur im Angebot", () => {
		expect(rabattProzent(2426, 6932, true)).toBe(65);
		expect(rabattProzent(2426, 6932, false)).toBeNull();
		expect(rabattProzent(2426, null, true)).toBeNull();
		expect(rabattProzent(2426, 2426, true)).toBeNull();
	});
});

const plan = (f: Partial<PlanMenueFelder> = {}): PlanMenueFelder => ({
	art: "wunsch",
	status: "offen",
	favorit: false,
	releaseId: 7,
	spielId: 3,
	plattform: "PS4",
	aufKaufliste: null,
	angebotItemId: null,
	angebotVerworfen: 0,
	...f,
});
const aktionen = (m: ReturnType<typeof planMenue>) => m.map((e) => e.aktion);

describe("planMenue", () => {
	it("bietet einem offenen Wunsch die Kaufliste zuerst an, entfernen zuletzt", () => {
		const m = planMenue(plan());
		expect(aktionen(m)).toEqual(["aufKaufliste", "disc", "digital", "favorit", "plattform", "verworfen", "entfernen"]);
		expect(m[0].haupt).toEqual({ knopf: "auf die Kaufliste" });
		expect(m[0].nurHandy).toBe(true);
		expect(m.filter((e) => e.nurHandy)).toHaveLength(1);
		expect(m.at(-1)).toMatchObject({ gefahr: true, trenner: true });
		expect(m.find((e) => e.aktion === "verworfen")?.trenner).toBe(true);
	});

	it("zeigt beim Wunsch auf der Kaufliste den ruhigen Verweis statt des Knopfs", () => {
		const m = planMenue(plan({ aufKaufliste: 12 }));
		expect(m[0]).toMatchObject({ aktion: "kauflisteAnsehen", haupt: { ruhend: true }, nurHandy: true });
		expect(aktionen(m)).not.toContain("aufKaufliste");
	});

	it('macht beim Kauf „Disc erfassen" zur Hauptaktion', () => {
		const m = planMenue(plan({ art: "kauf" }));
		expect(aktionen(m)).toEqual(["disc", "digital", "favorit", "plattform", "verworfen", "entfernen"]);
		expect(m[0].haupt).toEqual({ knopf: "Disc erfassen" });
		expect(m[0].nurHandy).toBe(true);
		// Die naechste Zeile gehoert zur selben Gruppe: keine Trennlinie, die oben stuende.
		expect(m[1].trenner).toBeUndefined();
	});

	it('kennt kein „erledigt" von Hand – weder bei Wunsch noch bei Kauf (Entscheidung vom 27.11.2026)', () => {
		for (const art of ["wunsch", "kauf"] as const) {
			expect(planMenue(plan({ art })).map((e) => e.text.toLowerCase())).not.toContain("erledigt");
		}
	});

	it("bietet das Angebot nur an, wenn es eines gibt oder etwas verworfen ist", () => {
		expect(aktionen(planMenue(plan()))).not.toContain("angebot");
		expect(planMenue(plan({ angebotItemId: "v1|123|0" })).find((e) => e.aktion === "angebot")).toMatchObject({
			text: "Gebrauchtangebot prüfen …",
			trenner: true,
		});
		expect(planMenue(plan({ angebotVerworfen: 2 })).find((e) => e.aktion === "angebot")?.text).toBe("Verworfene Angebote (2)");
	});

	it("schaltet den Favoriten-Eintrag um", () => {
		expect(planMenue(plan({ favorit: true })).find((e) => e.aktion === "favorit")?.text).toBe("Favorit entfernen");
		expect(planMenue(plan()).find((e) => e.aktion === "favorit")?.text).toBe("Als Favorit markieren");
	});

	it("nennt die Plattform im Eintrag und laesst ihn bei Freitext weg", () => {
		expect(planMenue(plan({ plattform: "PSVITA" })).find((e) => e.aktion === "plattform")?.text).toBe("Plattform ändern (Vita)");
		expect(aktionen(planMenue(plan({ spielId: null, releaseId: null, plattform: null })))).toEqual(["aufKaufliste", "favorit", "verworfen", "entfernen"]);
	});

	it("bietet ohne Release kein Erfassen und keine Hauptaktion beim Kauf", () => {
		const m = planMenue(plan({ art: "kauf", releaseId: null }));
		expect(aktionen(m)).toEqual(["favorit", "plattform", "verworfen", "entfernen"]);
		expect(m.some((e) => e.haupt || e.nurHandy || e.trennerNurHandy)).toBe(false);
	});

	it('laesst Erledigtem und Verworfenem nur „wieder oeffnen" und „entfernen"', () => {
		for (const status of ["erledigt", "verworfen"] as const) {
			for (const art of ["wunsch", "kauf"] as const) {
				const m = planMenue(plan({ art, status, angebotItemId: "x" }));
				expect(aktionen(m)).toEqual(["oeffnen", "entfernen"]);
				expect(m[0].haupt).toEqual({ knopf: "wieder öffnen" });
				// Am Desktop beginnt das Menue mit „Entfernen" – ohne Trennlinie darueber.
				expect(m[0].nurHandy).toBe(true);
				expect(m[1]).toMatchObject({ trenner: true, trennerNurHandy: true });
			}
		}
	});
});

describe("lueckeMenue", () => {
	it('bietet einer Luecke Kaufliste, Disc, „physisch nicht gewuenscht" und das Angebot', () => {
		const m = lueckeMenue({ verworfen: false, angebotItemId: "v1|9|0", angebotVerworfen: 0 });
		expect(m.map((e) => e.aktion)).toEqual(["aufKaufliste", "disc", "nichtGewuenscht", "angebot"]);
		expect(m[0].haupt).toEqual({ knopf: "auf die Kaufliste" });
		expect(m[2].trenner).toBe(true);
		expect(m[0].nurHandy).toBe(true);
		expect(m.some((e) => e.trennerNurHandy)).toBe(false);
		expect(m.some((e) => e.aktion === "entfernen")).toBe(false);
	});

	it("laesst das Angebot ohne Angebot weg", () => {
		expect(lueckeMenue({ verworfen: false, angebotItemId: null, angebotVerworfen: 0 }).map((e) => e.aktion)).toEqual([
			"aufKaufliste",
			"disc",
			"nichtGewuenscht",
		]);
	});

	it("kennt bei einer verworfenen Luecke nur den Weg zurueck", () => {
		const m = lueckeMenue({ verworfen: true, angebotItemId: "x", angebotVerworfen: 1 });
		expect(m).toEqual([expect.objectContaining({ aktion: "wiederZeigen", haupt: { knopf: "wieder als Lücke zeigen" } })]);
		// Der einzige Eintrag steht am Desktop als Knopf – dort faellt das ganze Menue weg.
		expect(m[0].nurHandy).toBe(true);
		expect(menueNurHandy(m)).toBe(true);
	});

	it("blendet das Menue am Desktop nur aus, wenn alles darin schon in der Zeile steht", () => {
		expect(menueNurHandy(lueckeMenue({ verworfen: false, angebotItemId: null, angebotVerworfen: 0 }))).toBe(false);
		for (const art of ["wunsch", "kauf"] as const) {
			for (const status of ["offen", "erledigt"] as const) expect(menueNurHandy(planMenue(plan({ art, status })))).toBe(false);
		}
		expect(menueNurHandy(planMenue(plan({ aufKaufliste: 12 })))).toBe(false);
		expect(menueNurHandy([])).toBe(false);
	});
});

describe("angebotEintrag", () => {
	it("gibt ohne Angebot und ohne Verworfenes nichts", () => {
		expect(angebotEintrag(null, 0)).toBeNull();
	});
});

describe("erfassenZurueck", () => {
	it("oeffnet erst die Absichten, loescht dann die Disc und setzt zuletzt die Disc-Fassung zurueck", () => {
		expect(
			erfassenZurueck({ besitz: "disc", id: 5, releaseId: 7, absichtenErledigt: [{ id: 11 }, { id: 12 }], physischStatusGesetzt: true }),
		).toEqual([
			{ methode: "PATCH", pfad: "/api/plans/11", koerper: { status: "offen" } },
			{ methode: "PATCH", pfad: "/api/plans/12", koerper: { status: "offen" } },
			{ methode: "DELETE", pfad: "/api/physical-copies/5" },
			{ methode: "PATCH", pfad: "/api/releases/7", koerper: { discFassung: "unbekannt" } },
		]);
	});

	it("laesst die Disc-Fassung stehen, wenn das Erfassen sie nicht gesetzt hat", () => {
		expect(erfassenZurueck({ besitz: "disc", id: 5, releaseId: 7, absichtenErledigt: [], physischStatusGesetzt: false })).toEqual([
			{ methode: "DELETE", pfad: "/api/physical-copies/5" },
		]);
	});

	it("loescht bei digital die Berechtigung und fasst die Disc-Fassung nie an", () => {
		expect(erfassenZurueck({ besitz: "digital", id: 9, releaseId: 7, absichtenErledigt: [{ id: 11 }], physischStatusGesetzt: true })).toEqual([
			{ methode: "PATCH", pfad: "/api/plans/11", koerper: { status: "offen" } },
			{ methode: "DELETE", pfad: "/api/digital-entitlements/9" },
		]);
	});
});

describe("erfasstText", () => {
	it("nennt, was erfasst ist und welche Liste erledigt wurde", () => {
		expect(erfasstText("Glasmeer", "Disc", [{ art: "kauf" }])).toBe("„Glasmeer\": Disc erfasst, von der Kaufliste erledigt.");
		expect(erfasstText("Glasmeer", "Disc", [{ art: "kauf" }, { art: "wunsch" }])).toBe(
			"„Glasmeer\": Disc erfasst, von der Wunsch- und Kaufliste erledigt.",
		);
		expect(erfasstText("Glasmeer", "„PS Plus\"", [])).toBe("„Glasmeer\": „PS Plus\" erfasst.");
	});

	it("nennt die Wunschliste, wenn nur ein Wunsch erledigt wurde", () => {
		expect(erledigteListe(["wunsch"])).toBe("Wunschliste");
	});
});

describe("wunschKopf", () => {
	it("zaehlt alle geladenen, Angebot und Kaufliste nur bei offenen, und laesst Nullen weg", () => {
		const e = (status: string, aufKaufliste: number | null, imAngebot: boolean | null) => ({
			status,
			aufKaufliste,
			store: imAngebot === null ? null : { imAngebot },
		});
		expect(wunschKopf([e("offen", 3, true), e("offen", null, false), e("offen", null, null), e("erledigt", 4, true)])).toEqual({
			anzahl: "4 Wünsche",
			teile: ["1 im Angebot", "1 auf der Kaufliste"],
		});
		expect(wunschKopf([e("offen", null, null)])).toEqual({ anzahl: "1 Wunsch", teile: [] });
	});

	it("schreibt die Einzahl", () => {
		expect(eintraegeText(1)).toBe("1 Eintrag");
		expect(eintraegeText(7)).toBe("7 Einträge");
	});
});

describe("nachBefund", () => {
	it('stellt „eBay kennt nichts" vor das Ungepruefte und das vor die unklaren Angebote', () => {
		const z = (titel: string, marktRohangebote: number | null) => ({ titel, marktRohangebote });
		expect(nachBefund([z("A", 3), z("B", null), z("C", 0), z("D", 0)]).map((x) => x.titel)).toEqual(["C", "D", "B", "A"]);
	});
});

describe("Preisfilter (f2e-c)", () => {
	const ohne = { gebrauchtCents: null, store: null };
	const gebraucht = { gebrauchtCents: 1999, store: null };
	const digital = { gebrauchtCents: null, store: { imAngebot: false } };
	const angebot = { gebrauchtCents: null, store: { imAngebot: true } };
	const beides = { gebrauchtCents: 1999, store: { imAngebot: true } };

	it("ohne Filter passt jede Zeile, auch eine ohne Preise", () => {
		expect(passtZuPreis(ohne, new Set())).toBe(true);
	});

	it("mit Gebrauchtpreis verlangt einen Gebrauchtpreis, kein Store-Preis ersetzt ihn", () => {
		const f = preisFilterAusParam("gebraucht");
		expect(passtZuPreis(gebraucht, f)).toBe(true);
		expect(passtZuPreis(angebot, f)).toBe(false);
	});

	it("mit Digitalpreis verlangt einen Store-Preis, auch ohne Angebot", () => {
		const f = preisFilterAusParam("digital");
		expect(passtZuPreis(digital, f)).toBe(true);
		expect(passtZuPreis(gebraucht, f)).toBe(false);
	});

	it("im Angebot heisst nur der Store: ein Store-Preis ohne Angebot reicht nicht", () => {
		const f = preisFilterAusParam("angebot");
		expect(passtZuPreis(angebot, f)).toBe(true);
		expect(passtZuPreis(digital, f)).toBe(false);
	});

	it("im Angebot zaehlt kein Gebrauchtangebot", () => {
		expect(passtZuPreis(gebraucht, preisFilterAusParam("angebot"))).toBe(false);
	});

	it("mehrere Filter grenzen gemeinsam ein, nicht wahlweise", () => {
		const f = preisFilterAusParam("gebraucht,angebot");
		expect(passtZuPreis(beides, f)).toBe(true);
		expect(passtZuPreis(gebraucht, f)).toBe(false);
		expect(passtZuPreis(angebot, f)).toBe(false);
	});

	it("unbekannte Werte im Parameter fallen weg", () => {
		expect([...preisFilterAusParam("digital,egal,,")]).toEqual(["digital"]);
		expect(preisFilterAusParam(null).size).toBe(0);
	});
});
