import { describe, expect, it } from "vitest";
import {
	FENSTERREGEL_SCHARF,
	fensterOffen,
	urteile,
	zugangsende,
	type BetriebFakten,
	type ZugangFakt,
} from "../src/domain/betrieb";

/**
 * Die Regeln der Betriebswarnungen (Stufe 18m, 16.2) - rein, ohne D1. Die
 * Zahlen sind die echten Groessen vom 18.10.2026 (Zugang vom 29.09., erste
 * Lebensdauer 25 Tage, Sony nennt den 28.11.), die Faelle nachgebaut.
 */

const JETZT = new Date("2026-10-18T09:38:00Z");

const ZUGANG: ZugangFakt = {
	eingerichtet: true,
	status: "ok",
	npssoHinterlegtAm: "2026-09-29 17:59:37",
	npssoLaeuftAbUm: "2026-11-28T17:58:58.225Z",
};

/** Ein ruhiger Morgen: alles gelaufen, Sicherung frisch, Zugang weit weg vom Ende. */
function ruhig(ueber: Partial<BetriebFakten> = {}): BetriebFakten {
	return {
		jetzt: JETZT,
		stand: {
			psn: { am: "2026-10-18 05:55", getan: "store", meldung: false, offen: 0 },
			wartung: { am: "2026-10-18 08:56", getan: "markt", meldung: false, offen: 18 },
		},
		zugang: { ...ZUGANG, npssoHinterlegtAm: "2026-10-17 10:00:00" },
		lebensdauerTage: 25,
		syncLaeufe: [{ status: "erfolg", gestartetAm: "2026-10-18 03:00:41", meldung: null }],
		sicherungAm: "2026-10-18T08:07:24Z",
		kauflisteFehlerAm: null,
		...ueber,
	};
}

const arten = (f: BetriebFakten) => urteile(f).map((w) => `${w.art}:${w.stufe}`);

describe("Betriebswarnungen (Stufe 18m)", () => {
	it("schweigt an einem ruhigen Morgen", () => {
		expect(urteile(ruhig())).toEqual([]);
	});

	describe("Automatik still", () => {
		it("ist rot nach mehr als 26 Stunden ohne Ausgang, nicht schon bei 26", () => {
			const stand = ruhig().stand;
			const genau = ruhig({ jetzt: new Date("2026-10-19T10:56:00Z"), stand: { ...stand, psn: { ...stand.psn!, am: "2026-10-19 05:55" } } });
			expect(arten(genau)).not.toContain("automatik_still:rot");
			const drueber = ruhig({ jetzt: new Date("2026-10-19T10:57:00Z"), stand: { ...stand, psn: { ...stand.psn!, am: "2026-10-19 05:55" } } });
			const w = urteile(drueber);
			expect(w.map((x) => x.art)).toEqual(["automatik_still"]);
			expect(w[0].text).toMatch(/^Die Wartung ist seit 26 Stunden nicht gelaufen, zuletzt am 18\.10\. um 10:56\.$/);
		});

		it("meldet einen fehlenden Bereich, und einen ganz fehlenden Stand nur einmal", () => {
			expect(arten(ruhig({ stand: { psn: ruhig().stand.psn } }))).toEqual(["automatik_still:rot"]);
			const leer = urteile(ruhig({ stand: {} }));
			expect(leer).toHaveLength(1);
			expect(leer[0].text).toBe("Die Automatik hat noch keinen Lauf vermerkt.");
		});
	});

	describe("Zugang", () => {
		it("rechnet mit dem frueheren Ende: eingetragen + kuerzeste Lebensdauer vor Sonys Datum", () => {
			const ende = zugangsende(ZUGANG, 25, JETZT)!;
			expect(ende.am).toBe("2026-10-24T00:00:00.000Z");
			expect(ende.quelle).toBe("gemessen");
			expect(ende.tage).toBe(6);
			expect(ende.stufe).toBe("kenntnis");
		});

		it("zaehlt Kalendertage in Ortszeit, nicht angebrochene Tage", () => {
			const tage = (jetzt: string) => zugangsende(ZUGANG, 25, new Date(jetzt))!.tage;
			expect(tage("2026-10-19T09:58:00Z")).toBe(5); // vorher Math.floor: 4
			expect(tage("2026-10-19T21:59:59Z")).toBe(5); // 23:59 in Berlin, noch der 19.
			expect(tage("2026-10-19T22:00:00Z")).toBe(4); // 00:00 in Berlin, schon der 20.
		});

		it("nimmt Sonys Datum, solange keine Lebensdauer gemessen ist", () => {
			const ende = zugangsende(ZUGANG, null, JETZT)!;
			expect(ende.quelle).toBe("sony");
			expect(ende.stufe).toBeNull();
			const spaet = urteile(ruhig({ zugang: ZUGANG, lebensdauerTage: null, jetzt: new Date("2026-11-20T12:00:00Z"), stand: {
				psn: { am: "2026-11-20 05:55", getan: "store", meldung: false },
				wartung: { am: "2026-11-20 08:56", getan: "markt", meldung: false },
			}, sicherungAm: "2026-11-20T08:00:00Z", syncLaeufe: [] }));
			expect(spaet.map((w) => `${w.art}:${w.stufe}`)).toEqual(["zugang_endet:kenntnis"]);
			expect(spaet[0].text).toBe("Der PlayStation-Zugang läuft laut Sony am 28.11. ab (in 8 Tagen).");
		});

		it("ist zur Kenntnis ab 14 Tagen vor dem Ende, rot ab 3 - Tageswechsel in Ortszeit", () => {
			const stufe = (jetzt: string) => zugangsende(ZUGANG, 25, new Date(jetzt))?.stufe ?? null;
			expect(stufe("2026-10-09T21:59:59Z")).toBeNull(); // 09.10. 23:59 in Berlin, 15 Tage
			expect(stufe("2026-10-09T22:00:00Z")).toBe("kenntnis"); // 10.10. 00:00, 14
			expect(stufe("2026-10-20T21:59:59Z")).toBe("kenntnis"); // 20.10. 23:59, 4
			expect(stufe("2026-10-20T22:00:00Z")).toBe("rot"); // 21.10. 00:00, 3
			expect(stufe("2026-10-25T00:00:00Z")).toBe("rot"); // vorbei, Zugang noch ok
		});

		it("wechselt den Tag nach der Zeitumstellung um 23:00 UTC", () => {
			// Sonys 28.11. liegt in der Winterzeit: der 25.11. beginnt um 23:00 UTC.
			const stufe = (jetzt: string) => zugangsende(ZUGANG, null, new Date(jetzt))?.stufe ?? null;
			expect(stufe("2026-11-24T22:59:59Z")).toBe("kenntnis");
			expect(stufe("2026-11-24T23:00:00Z")).toBe("rot");
		});

		it("sagt im Satz, woher das Datum kommt", () => {
			const w = urteile(ruhig({ zugang: ZUGANG }));
			expect(w.map((x) => x.art)).toEqual(["zugang_endet"]);
			expect(w[0].text).toBe(
				"Der PlayStation-Zugang hält vermutlich bis um den 24.10. (in 6 Tagen) – der bisher kürzeste hielt 25 Tage, Sony nennt den 28.11.",
			);
		});

		it("ist abgelaufen sofort rot - und sagt dann nichts mehr ueber Ende und Sync", () => {
			const w = urteile(
				ruhig({
					zugang: { ...ZUGANG, status: "abgelaufen" },
					syncLaeufe: [
						{ status: "fehler", gestartetAm: "2026-10-18 03:00:37", meldung: "Der PlayStation-Zugang ist abgelaufen." },
					],
				}),
			);
			expect(w.map((x) => `${x.art}:${x.stufe}`)).toEqual(["zugang_abgelaufen:rot"]);
		});

		it("sagt ohne eingerichteten Zugang nichts ueber sein Ende", () => {
			expect(zugangsende({ ...ZUGANG, eingerichtet: false }, 25, JETZT)).toBeNull();
		});
	});

	describe("Nacht-Sync", () => {
		const fehler = (tag: string) => ({ status: "fehler" as const, gestartetAm: `${tag} 03:00:37`, meldung: "Der PSN-Abruf ist fehlgeschlagen." });

		it("ist nach einer gescheiterten Nacht zur Kenntnis", () => {
			const w = urteile(ruhig({ syncLaeufe: [fehler("2026-10-18"), { status: "erfolg", gestartetAm: "2026-10-17 03:00:00", meldung: null }] }));
			expect(w.map((x) => `${x.art}:${x.stufe}`)).toEqual(["sync_gescheitert:kenntnis"]);
			expect(w[0].text).toBe("Der nächtliche Abruf ist in der letzten Nacht gescheitert: Der PSN-Abruf ist fehlgeschlagen.");
		});

		it("ist nach zwei Naechten hintereinander rot", () => {
			expect(arten(ruhig({ syncLaeufe: [fehler("2026-10-18"), fehler("2026-10-17")] }))).toEqual(["sync_gescheitert:rot"]);
		});

		it("zaehlt zwei Fehlschlaege mit einer Nacht dazwischen nicht als hintereinander", () => {
			expect(arten(ruhig({ syncLaeufe: [fehler("2026-10-18"), fehler("2026-10-16")] }))).toEqual(["sync_gescheitert:kenntnis"]);
		});

		it("vergisst einen Fehlschlag nach 24 Stunden", () => {
			expect(arten(ruhig({ jetzt: new Date("2026-10-19T03:01:00Z"), stand: {
				psn: { am: "2026-10-19 02:55", getan: "nichts", meldung: false },
				wartung: { am: "2026-10-18 08:56", getan: "markt", meldung: false },
			}, syncLaeufe: [fehler("2026-10-18")] }))).toEqual([]);
		});
	});

	describe("Sicherung", () => {
		it("ist rot ohne Sicherung und ab neun Tagen, nicht bei acht", () => {
			expect(arten(ruhig({ sicherungAm: null }))).toEqual(["sicherung:rot"]);
			expect(arten(ruhig({ sicherungAm: "2026-10-10T09:00:00Z" }))).toEqual([]);
			const alt = urteile(ruhig({ sicherungAm: "2026-10-09T09:00:00Z" }));
			expect(alt.map((w) => w.text)).toEqual(["Die letzte Sicherung ist 9 Tage alt."]);
		});
	});

	describe("zur Kenntnis", () => {
		it("meldet eine Kette ohne Ausgang aus den letzten 24 Stunden, mit Ortszeit", () => {
			const stand = {
				...ruhig().stand,
				ohneAusgang: { anzahl: 18, von: "2026-10-18 06:30", bis: "2026-10-18 08:00", bereich: "wartung", gemeldetAm: "2026-10-18 08:05" },
			};
			const w = urteile(ruhig({ stand }));
			expect(w.map((x) => `${x.art}:${x.stufe}`)).toEqual(["ohne_ausgang:kenntnis"]);
			expect(w[0].text).toBe("18 Aufrufe in der Wartung sind ohne Ausgang geblieben (08:30–10:00).");
			const alt = { ...stand, ohneAusgang: { ...stand.ohneAusgang, gemeldetAm: "2026-10-17 09:00" } };
			expect(urteile(ruhig({ stand: alt }))).toEqual([]);
		});

		it("nennt eine Kette ueber die Fenstergrenze und eine gekappte", () => {
			const stand = {
				...ruhig().stand,
				ohneAusgang: { anzahl: 200, von: "2026-10-16 05:50", bis: "2026-10-18 06:00", bereich: "psn→wartung", gekappt: true, gemeldetAm: "2026-10-18 06:05" },
			};
			expect(urteile(ruhig({ stand }))[0].text).toBe(
				"Mindestens 200 Aufrufe im PSN-Fenster und in der Wartung sind ohne Ausgang geblieben (07:50–08:00).",
			);
		});

		it("meldet einen letzten Ausgang mit Meldung - den gescheiterten Sync nur einmal", () => {
			const stand = { ...ruhig().stand, psn: { am: "2026-10-18 05:55", getan: "store", meldung: true } };
			const w = urteile(ruhig({ stand }));
			expect(w.map((x) => x.text)).toEqual(["Der letzte Aufruf im PSN-Fenster (Store-Preise) endete mit einer Meldung, 07:55."]);

			const sync = { ...ruhig().stand, psn: { am: "2026-10-18 03:50", getan: "sync", meldung: true } };
			const doppelt = urteile(ruhig({ stand: sync, syncLaeufe: [{ status: "fehler", gestartetAm: "2026-10-18 03:00:00", meldung: null }] }));
			expect(doppelt.map((x) => x.art)).toEqual(["sync_gescheitert"]);
		});

		it("meldet die gescheiterte Kaufliste von heute und gestern, nicht von vorgestern", () => {
			expect(arten(ruhig({ kauflisteFehlerAm: "2026-10-18" }))).toEqual(["kaufliste:kenntnis"]);
			expect(arten(ruhig({ kauflisteFehlerAm: "2026-10-17" }))).toEqual(["kaufliste:kenntnis"]);
			expect(arten(ruhig({ kauflisteFehlerAm: "2026-10-16" }))).toEqual([]);
		});
	});

	describe("Fenster nicht fertig (ruht bis 20i)", () => {
		it("ist nicht scharf - der Rest von heute Nacht erscheint nicht", () => {
			expect(FENSTERREGEL_SCHARF).toBe(false);
			expect(urteile(ruhig())).toEqual([]);
		});

		it("meldet einen Rest erst nach Fensterschluss", () => {
			const stand = ruhig().stand;
			expect(fensterOffen(stand, new Date("2026-10-18T08:58:00Z"))).toEqual([]);
			const w = fensterOffen(stand, JETZT);
			expect(w.map((x) => x.text)).toEqual(["Gebrauchtpreise: 18 Einträge blieben bei Fensterschluss offen."]);
		});
	});

	it("ordnet Rot vor zur Kenntnis", () => {
		const w = urteile(
			ruhig({
				zugang: ZUGANG,
				sicherungAm: null,
				kauflisteFehlerAm: "2026-10-18",
				syncLaeufe: [{ status: "fehler", gestartetAm: "2026-10-18 03:00:00", meldung: null }],
			}),
		);
		expect(w.map((x) => `${x.art}:${x.stufe}`)).toEqual([
			"sicherung:rot",
			"zugang_endet:kenntnis",
			"sync_gescheitert:kenntnis",
			"kaufliste:kenntnis",
		]);
	});
});
