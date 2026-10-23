import { describe, expect, it } from "vitest";
import {
	ACTION_STILL_NACH_STUNDEN,
	FENSTERREGEL_SCHARF,
	STORE_ZIEL_ALT_NACH_STUNDEN,
	fensterOffen,
	urteile,
	zugangsende,
	type BetriebFakten,
	type StandFakt,
	type ZugangFakt,
} from "../src/domain/betrieb";
import { STORE_FRIST_STUNDEN } from "../src/db/store";

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
			wartung: { am: "2026-10-18 08:56", getan: "nichts", meldung: false },
			// Seit 20i laeuft der Markt als Action, mit eigenem Bereich.
			markt_begonnen: { am: "2026-10-18 02:20", getan: "markt", meldung: false },
			markt: { am: "2026-10-18 02:26", getan: "markt", meldung: false, offen: 0 },
			// Seit 20j auch der Store, am Vorabend.
			store_begonnen: { am: "2026-10-17 20:50", getan: "store", meldung: false },
			store: { am: "2026-10-17 20:52", getan: "store", meldung: false, offen: 0, geprueft: 79 },
			store_geprueft: { am: "2026-10-17 20:52", getan: "store", meldung: false, offen: 0, geprueft: 79 },
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
			const store = { ...stand.store!, am: "2026-10-18 20:52" };
			const genau = ruhig({ jetzt: new Date("2026-10-19T10:56:00Z"), stand: { ...stand, psn: { ...stand.psn!, am: "2026-10-19 05:55" }, markt: { ...stand.markt!, am: "2026-10-19 02:26" }, store, store_geprueft: store } });
			expect(arten(genau)).not.toContain("automatik_still:rot");
			const drueber = ruhig({ jetzt: new Date("2026-10-19T10:57:00Z"), stand: { ...stand, psn: { ...stand.psn!, am: "2026-10-19 05:55" }, markt: { ...stand.markt!, am: "2026-10-19 02:26" }, store, store_geprueft: store } });
			const w = urteile(drueber);
			expect(w.map((x) => x.art)).toEqual(["automatik_still"]);
			expect(w[0].text).toMatch(/^Die Wartung ist seit 26 Stunden nicht gelaufen, zuletzt am 18\.10\. um 10:56\.$/);
		});

		it("laesst der Store-Action 30 Stunden statt 26 - ihr Rueckfall liegt nur zwei Stunden nach dem Hauptlauf (20j)", () => {
			// Puenktlicher Rueckfall um 22:47, der naechste Hauptlauf maximal
			// verspaetet: 27 h 30 dazwischen - mit 26 waere das rot.
			const stand = ruhig().stand;
			// PSN und Wartung sind am 19.10. in der Fixtur selbst alt - gezaehlt wird nur der Satz zum Store.
			const store = (jetzt: string) =>
				urteile(ruhig({ jetzt: new Date(jetzt), stand: { ...stand, store: { ...stand.store!, am: "2026-10-17 22:47" } } }))
					.filter((w) => w.art === "automatik_still" && w.text.startsWith("Die Store-Preis-Action"))
					.map((w) => w.text);
			expect(store("2026-10-19T02:17:00Z")).toEqual([]);
			expect(store("2026-10-19T04:47:00Z")).toEqual([]);
			expect(store("2026-10-19T04:48:00Z")).toEqual(["Die Store-Preis-Action ist seit 30 Stunden nicht gelaufen, zuletzt am 18.10. um 00:47."]);
		});

		it("laesst der Markt-Action ebenso 30 Stunden statt 26 (Nachtrag 20i-c)", () => {
			const stand = ruhig().stand;
			const markt = (jetzt: string) =>
				urteile(ruhig({ jetzt: new Date(jetzt), stand: { ...stand, markt: { ...stand.markt!, am: "2026-10-17 22:17" } } }))
					.filter((w) => w.art === "automatik_still" && w.text.startsWith("Die Gebrauchtpreis-Action"))
					.map((w) => w.text);
			expect(markt("2026-10-19T01:47:00Z")).toEqual([]);
			expect(markt("2026-10-19T04:17:00Z")).toEqual([]);
			expect(markt("2026-10-19T04:18:00Z")).toEqual(["Die Gebrauchtpreis-Action ist seit 30 Stunden nicht gelaufen, zuletzt am 18.10. um 00:17."]);
		});

		it("meldet einen fehlenden Bereich, und einen ganz fehlenden Stand nur einmal", () => {
			expect(arten(ruhig({ stand: { psn: ruhig().stand.psn, markt: ruhig().stand.markt, store: ruhig().stand.store } }))).toEqual(["automatik_still:rot"]);
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
				wartung: { am: "2026-11-20 08:56", getan: "nichts", meldung: false },
				markt: { am: "2026-11-20 02:26", getan: "markt", meldung: false },
				store: { am: "2026-11-19 20:52", getan: "store", meldung: false },
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
				wartung: { am: "2026-10-18 08:56", getan: "nichts", meldung: false },
				markt: { am: "2026-10-19 02:26", getan: "markt", meldung: false },
				store: { am: "2026-10-18 20:52", getan: "store", meldung: false },
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

	describe("Nicht fertig geworden (scharf seit 20i)", () => {
		it("ist scharf - und schweigt ohne Rest", () => {
			expect(FENSTERREGEL_SCHARF).toBe(true);
			expect(urteile(ruhig())).toEqual([]);
		});

		it("meldet einen Rest im Fenster erst nach Fensterschluss", () => {
			const stand = { ...ruhig().stand, psn: { am: "2026-10-18 05:55", getan: "store", meldung: false, offen: 7 } };
			expect(fensterOffen(stand, new Date("2026-10-18T05:58:00Z"))).toEqual([]);
			const w = fensterOffen(stand, JETZT);
			expect(w.map((x) => x.text)).toEqual(["Store-Preise: 7 Einträge blieben bei Fensterschluss offen."]);
		});

		it("meldet einen Rest der Markt-Action gleich nach ihrem Ausgang", () => {
			const stand = { ...ruhig().stand, markt: { am: "2026-10-18 02:26", getan: "markt", meldung: true, offen: 120 } };
			expect(fensterOffen(stand, JETZT).map((x) => x.text)).toEqual(["Gebrauchtpreise: 120 Einträge blieben nach dem Lauf offen."]);
		});
	});

	describe("Markt-Action (Stufe 20i)", () => {
		const mit = (markt: object) => ruhig({ stand: { ...ruhig().stand, ...markt } });

		it("ist rot, wenn sie seit ueber 26 Stunden keinen Ausgang hat - auch wenn sie jede Nacht beginnt", () => {
			const w = urteile(
				mit({
					markt_begonnen: { am: "2026-10-18 02:20", getan: "markt", meldung: false },
					markt: { am: "2026-10-17 02:26", getan: "markt", meldung: false, offen: 0 },
				}),
			);
			expect(w.map((x) => `${x.art}:${x.stufe}`)).toContain("automatik_still:rot");
			expect(w.find((x) => x.art === "automatik_still")?.text).toMatch(/^Die Gebrauchtpreis-Action ist seit 31 Stunden nicht gelaufen/);
		});

		it("meldet einen Beginn ohne Ausgang nach einer Stunde, nicht vorher", () => {
			const stand = {
				markt_begonnen: { am: "2026-10-18 08:50", getan: "markt", meldung: false },
				markt: { am: "2026-10-17 10:00", getan: "markt", meldung: false, offen: 0 },
			};
			expect(arten(mit(stand))).toEqual([]);
			const spaeter = urteile(ruhig({ jetzt: new Date("2026-10-18T09:51:00Z"), stand: { ...ruhig().stand, ...stand } }));
			expect(spaeter.map((x) => x.text)).toContain("Der Lauf der Gebrauchtpreis-Action von 10:50 ist ohne Ausgang geblieben.");
		});

		it("meldet einen Ausgang mit Meldung zur Kenntnis", () => {
			const w = urteile(mit({ markt: { am: "2026-10-18 02:26", getan: "markt", meldung: true, offen: 0 } }));
			expect(w.map((x) => `${x.art}:${x.stufe}`)).toEqual(["meldung:kenntnis"]);
		});

		describe("laeuft, prueft aber nichts (Nachtrag 20i-b)", () => {
			// 18.10.2026, 09:38 UTC: der Rueckfall war der juengste Ausgang.
			const leer = { am: "2026-10-18 08:23", getan: "markt", meldung: false, offen: 0, geprueft: 0 };

			it("schweigt an einem normalen Tag: der Hauptlauf prueft alles, der Rueckfall nichts", () => {
				const w = urteile(mit({ markt: leer, markt_geprueft: { ...leer, am: "2026-10-18 02:25", geprueft: 411 } }));
				expect(w).toEqual([]);
			});

			it("meldet zur Kenntnis, wenn seit ueber 30 Stunden kein Lauf etwas geprueft hat (Nachtrag 20i-c)", () => {
				const w = urteile(mit({ markt: leer, markt_geprueft: { ...leer, am: "2026-10-17 03:37", geprueft: 411 } }));
				expect(w).toEqual([
					{
						art: "markt_leer",
						stufe: "kenntnis",
						text: "Die Gebrauchtpreis-Action läuft, hat aber seit 30 Stunden kein Release geprüft, zuletzt am 17.10. um 05:37.",
						ziel: "einstellungen",
						zielText: "Verlauf",
					},
				]);
			});

			it("schweigt bei genau 30 Stunden - auch bei 27 h 30 zwischen puenktlichem Rueckfall und verspaetetem Hauptlauf", () => {
				expect(arten(mit({ markt: leer, markt_geprueft: { ...leer, am: "2026-10-17 06:10", geprueft: 3 } }))).toEqual([]);
				expect(arten(mit({ markt: leer, markt_geprueft: { ...leer, am: "2026-10-17 03:38", geprueft: 3 } }))).toEqual([]);
			});

			it("meldet, wenn noch nie ein Lauf etwas geprueft hat", () => {
				expect(urteile(mit({ markt: leer })).map((x) => x.text)).toEqual([
					"Die Gebrauchtpreis-Action läuft, hat aber noch kein Release geprüft.",
				]);
			});

			it("schweigt, wenn der juengste Lauf etwas geprueft hat", () => {
				expect(arten(mit({ markt: { ...leer, geprueft: 5 } }))).toEqual([]);
			});

			it("schweigt bei einem Ausgang ohne Zahl - fehlender Schluessel ist nicht 0", () => {
				const { geprueft: _g, ...ohneZahl } = leer;
				expect(arten(mit({ markt: ohneZahl }))).toEqual([]);
			});

			it("ueberlaesst einen gescheiterten Lauf der Meldung", () => {
				expect(arten(mit({ markt: { ...leer, meldung: true } }))).toEqual(["meldung:kenntnis"]);
			});
		});

		it("ist rot, solange sie noch nie gelaufen ist", () => {
			const { markt: _m, markt_begonnen: _b, ...ohne } = ruhig().stand;
			const w = urteile(ruhig({ stand: ohne }));
			expect(w.map((x) => x.text)).toEqual(["Die Gebrauchtpreis-Action hat noch keinen Lauf vermerkt."]);
		});
	});

	describe("Store-Action (Stufe 20j)", () => {
		const mitStore = (stand: Partial<StandFakt>, jetzt = "2026-10-18T09:38:00Z") =>
			ruhig({ jetzt: new Date(jetzt), stand: { ...ruhig().stand, ...stand } });
		const leer = { am: "2026-10-17 22:50", getan: "store", meldung: false, offen: 0, geprueft: 0 };

		it("schweigt nach einem Probelauf am Nachmittag: die leeren Laeufe am Abend stempeln den Stand", () => {
			// Probe 16:45, Abendlaeufe ohne Arbeit - die Route setzt store_geprueft,
			// weil danach nichts faellig ist. Am naechsten Abend um 23:00 (gut 30 h
			// nach der Probe) waere es sonst eine Warnung.
			expect(arten(mitStore({ store: leer, store_geprueft: leer }, "2026-10-19T02:00:00Z"))).toEqual([]);
		});

		it("meldet zur Kenntnis, wenn sie seit ueber 30 Stunden nicht auf dem Stand ist - nicht schon bei 30", () => {
			const geprueft = { ...leer, am: "2026-10-17 01:00", geprueft: 79 };
			expect(arten(mitStore({ store: leer, store_geprueft: geprueft }, "2026-10-18T07:00:00Z"))).toEqual([]);
			const w = urteile(mitStore({ store: leer, store_geprueft: geprueft }, "2026-10-18T07:01:00Z"));
			expect(w.map((x) => `${x.art}:${x.stufe}`)).toEqual(["store_leer:kenntnis"]);
			expect(w[0].text).toBe("Die Store-Preis-Action läuft, ist aber seit 30 Stunden nicht auf dem Stand, zuletzt am 17.10. um 03:00.");
		});

		describe("Sicherheitsnetz: der aelteste Stempel, unabhaengig von der Auswahl", () => {
			// Ein leerer Lauf, nach dem die (kaputte) Auswahl "nichts faellig" sagt:
			// store_geprueft ist frisch - die alte Regel schwiege.
			const kaputt = (aeltester: string, jetzt: string) =>
				mitStore({ store: { ...leer, am: "2026-10-18 02:00", aeltester }, store_geprueft: { ...leer, am: "2026-10-18 02:00" } }, jetzt);
			const meldungen = (aeltester: string, jetzt: string) => urteile(kaputt(aeltester, jetzt));

			it("rechnet 12 Stunden Frist plus 30 - die Entscheidung vom 22.10.2026 auf 'faellig und nicht geprueft'", () => {
				expect(STORE_ZIEL_ALT_NACH_STUNDEN).toBe(STORE_FRIST_STUNDEN + ACTION_STILL_NACH_STUNDEN);
			});

			it("schweigt bei genau 42 Stunden und meldet danach", () => {
				expect(arten(kaputt("2026-10-16 15:38", "2026-10-18T09:38:00Z"))).toEqual([]);
				const w = meldungen("2026-10-16 15:37", "2026-10-18T09:38:00Z");
				expect(w.map((x) => `${x.art}:${x.stufe}`)).toEqual(["store_leer:kenntnis"]);
				expect(w[0].text).toBe("Die Store-Preis-Action läuft, aber ein Release wurde seit 42 Stunden nicht geprüft, zuletzt am 16.10. um 17:37.");
			});

			it("schweigt nach einem Probelauf am Nachmittag - auch wenn der naechste Lauf spaet kommt", () => {
				// Probe 16:47, beide Abendlaeufe leer, naechster pruefender Lauf
				// verspaetet um 02:17 uebermorgen: 33,5 Stunden.
				expect(arten(kaputt("2026-10-16 16:47", "2026-10-18T02:16:00Z"))).toEqual([]);
			});

			it("ueberlaesst einen gescheiterten Lauf der Meldung", () => {
				const w = urteile(mitStore({ store: { ...leer, meldung: true, aeltester: "2026-10-10 00:00" } }));
				expect(w.map((x) => x.art)).toEqual(["meldung"]);
			});
		});

		it("meldet einen Lauf ohne Ausgang zur Kenntnis", () => {
			const w = urteile(mitStore({ store_begonnen: { am: "2026-10-18 07:00", getan: "store", meldung: false } }));
			expect(w.map((x) => x.text)).toEqual(["Der Lauf der Store-Preis-Action von 09:00 ist ohne Ausgang geblieben."]);
		});

		it("meldet einen Rest nach dem Lauf, nicht erst bei Fensterschluss", () => {
			const w = urteile(mitStore({ store: { ...leer, am: "2026-10-18 08:00", offen: 3, geprueft: 76 } }));
			expect(w.map((x) => x.text)).toEqual(["Store-Preise: 3 Einträge blieben nach dem Lauf offen."]);
		});

		it("ist rot, solange sie noch nie gelaufen ist", () => {
			const { store: _s, store_begonnen: _b, store_geprueft: _g, ...ohne } = ruhig().stand;
			expect(urteile(ruhig({ stand: ohne })).map((x) => x.text)).toEqual(["Die Store-Preis-Action hat noch keinen Lauf vermerkt."]);
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
