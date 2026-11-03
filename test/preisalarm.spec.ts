import { describe, it, expect } from "vitest";
import { alarmKanal, alarmPruefen, type AlarmLage, type Punkt } from "../src/domain/preisalarm";

const JETZT = new Date("2026-11-05T21:00:00Z");

/** Punkte im Abstand von Tagen vor JETZT, aeltester zuerst. */
const reihe = (...p: Array<[tageVorher: number, cents: number]>): Punkt[] =>
	p.map(([t, c]) => ({
		preisCents: c,
		am: new Date(JETZT.getTime() - t * 86_400_000).toISOString().slice(0, 19).replace("T", " "),
	}));

const lage = (teil: Partial<AlarmLage> = {}): AlarmLage => ({
	releaseId: 7,
	disc: "ja",
	kaufVerworfen: false,
	hatGebrauchtreihe: true,
	grenzeCents: null,
	grenzeAm: null,
	punkte: {},
	offen: {},
	letzteGrenzeAm: null,
	...teil,
});

describe("alarmKanal", () => {
	it("Disc ja -> Gebrauchtpreis, nein -> Store", () => {
		expect(alarmKanal("ja", false, false)).toBe("gebraucht");
		expect(alarmKanal("nein", false, true)).toBe("store");
	});

	it("physisch nicht gewuenscht schlaegt Disc ja", () => {
		expect(alarmKanal("ja", true, true)).toBe("store");
	});

	it("unbekannt folgt der Gebrauchtreihe, zur Lesezeit", () => {
		expect(alarmKanal("unbekannt", false, true)).toBe("gebraucht");
		expect(alarmKanal("unbekannt", false, false)).toBe("store");
	});
});

describe("alarmPruefen - Allzeittief", () => {
	const alt = { punkte: { markt: reihe([40, 1000], [20, 950]) } };

	it("meldet ein Tief 10 % unter dem bisherigen, wenn die Reihe 30 Tage alt ist", () => {
		const a = alarmPruefen(lage(alt), "gebraucht", [{ reihe: "markt", preisCents: 855, ebayItemId: "x" }], JETZT);
		expect(a).toMatchObject({ art: "tief", reihe: "markt", preisCents: 855, vorherCents: 950, ebayItemId: "x", ersetzt: null });
	});

	it("genau 10 % ist ein Treffer, knapp darueber nicht", () => {
		expect(alarmPruefen(lage(alt), "gebraucht", [{ reihe: "markt", preisCents: 855, ebayItemId: null }], JETZT)).not.toBeNull();
		expect(alarmPruefen(lage(alt), "gebraucht", [{ reihe: "markt", preisCents: 856, ebayItemId: null }], JETZT)).toBeNull();
	});

	it("die Mindesthistorie zaehlt in Tagen: 29 Tage reichen nicht", () => {
		const jung = { punkte: { markt: reihe([29, 1000], [10, 950]) } };
		expect(alarmPruefen(lage(jung), "gebraucht", [{ reihe: "markt", preisCents: 500, ebayItemId: null }], JETZT)).toBeNull();
	});

	it("braucht drei Punkte mit dem neuen - ein stabiler Preis mit zwei alten reicht", () => {
		const einer = { punkte: { markt: reihe([60, 1000]) } };
		expect(alarmPruefen(lage(einer), "gebraucht", [{ reihe: "markt", preisCents: 500, ebayItemId: null }], JETZT)).toBeNull();
		const zwei = { punkte: { markt: reihe([60, 1000], [59, 1000]) } };
		expect(alarmPruefen(lage(zwei), "gebraucht", [{ reihe: "markt", preisCents: 500, ebayItemId: null }], JETZT)).not.toBeNull();
	});

	it("verrechnet Haendler und Markt nie: das Tief der EIGENEN Reihe zaehlt", () => {
		const zwei = { punkte: { markt: reihe([40, 1000], [20, 1000]), haendler: reihe([40, 700], [20, 700]) } };
		// 880 ist 12 % unter dem Markt-Tief, aber ueber dem Haendler-Tief.
		const a = alarmPruefen(lage(zwei), "gebraucht", [{ reihe: "markt", preisCents: 880, ebayItemId: null }], JETZT);
		expect(a).toMatchObject({ reihe: "markt", vorherCents: 1000 });
	});

	it("meldet aus zwei Reihen EINE Meldung mit dem tiefsten Preis", () => {
		const zwei = { punkte: { markt: reihe([40, 1226], [20, 1226]), haendler: reihe([40, 1226], [20, 1226]) } };
		const a = alarmPruefen(
			lage(zwei),
			"gebraucht",
			[
				{ reihe: "haendler", preisCents: 1084, ebayItemId: "h" },
				{ reihe: "markt", preisCents: 1050, ebayItemId: "m" },
			],
			JETZT,
		);
		expect(a).toMatchObject({ reihe: "markt", preisCents: 1050, ebayItemId: "m" });
	});

	it("meldet nichts auf dem fremden Kanal", () => {
		const s = { disc: "ja", punkte: { store: reihe([40, 3000], [20, 3000]) } };
		expect(alarmPruefen(lage(s), "store", [{ reihe: "store", preisCents: 1000, ebayItemId: null }], JETZT)).toBeNull();
	});

	it("Store-Zweig bei Disc nein", () => {
		const s = { disc: "nein", hatGebrauchtreihe: false, punkte: { store: reihe([40, 3000], [20, 2999]) } };
		expect(alarmPruefen(lage(s), "store", [{ reihe: "store", preisCents: 1499, ebayItemId: null }], JETZT)).toMatchObject({
			kanal: "store",
			reihe: "store",
		});
	});

	it("eine offene Meldung wird nur von einem tieferen Preis ersetzt", () => {
		const mitOffen = { ...alt, offen: { gebraucht: { id: 3, preisCents: 800 } } };
		expect(alarmPruefen(lage(mitOffen), "gebraucht", [{ reihe: "markt", preisCents: 850, ebayItemId: null }], JETZT)).toBeNull();
		expect(alarmPruefen(lage(mitOffen), "gebraucht", [{ reihe: "markt", preisCents: 700, ebayItemId: null }], JETZT)).toMatchObject({
			ersetzt: 3,
			preisCents: 700,
		});
	});
});

describe("alarmPruefen - Grenze", () => {
	const unter = [{ reihe: "markt" as const, preisCents: 795, ebayItemId: null }];

	it("eine neu gesetzte Grenze ueber dem aktuellen Preis meldet beim naechsten Lauf", () => {
		const l = lage({ grenzeCents: 1000, grenzeAm: "2026-11-05 10:00:00", punkte: { markt: reihe([3, 795]) } });
		expect(alarmPruefen(l, "gebraucht", unter, JETZT)).toMatchObject({ art: "grenze", vorherCents: 1000, preisCents: 795 });
	});

	it("bleibt still, solange der Preis darunter bleibt und schon gemeldet ist", () => {
		const l = lage({
			grenzeCents: 1000,
			grenzeAm: "2026-11-01 10:00:00",
			letzteGrenzeAm: "2026-11-02 21:00:00",
			punkte: { markt: reihe([3, 795]) },
		});
		expect(alarmPruefen(l, "gebraucht", unter, JETZT)).toBeNull();
	});

	it("wird wieder scharf, wenn der Preis ueber die Grenze ging", () => {
		const l = lage({
			grenzeCents: 1000,
			grenzeAm: "2026-11-01 10:00:00",
			letzteGrenzeAm: "2026-11-02 21:00:00",
			punkte: { markt: reihe([3, 795], [1, 1200]) },
		});
		expect(alarmPruefen(l, "gebraucht", unter, JETZT)).toMatchObject({ art: "grenze" });
	});

	it("wird wieder scharf, wenn die Grenze nach der letzten Meldung neu gesetzt ist", () => {
		const l = lage({
			grenzeCents: 900,
			grenzeAm: "2026-11-04 10:00:00",
			letzteGrenzeAm: "2026-11-02 21:00:00",
			punkte: { markt: reihe([3, 795]) },
		});
		expect(alarmPruefen(l, "gebraucht", unter, JETZT)).toMatchObject({ art: "grenze", vorherCents: 900 });
	});

	it("ohne Grenze kein Grenz-Alarm", () => {
		expect(alarmPruefen(lage({ punkte: { markt: reihe([3, 795]) } }), "gebraucht", unter, JETZT)).toBeNull();
	});

	it("der Preis auf der Grenze ist kein Unterschreiten", () => {
		const l = lage({ grenzeCents: 795, grenzeAm: "2026-11-05 10:00:00" });
		expect(alarmPruefen(l, "gebraucht", unter, JETZT)).toBeNull();
	});

	it("Grenze und Allzeittief zugleich: eine Meldung, bei Gleichstand das Tief", () => {
		const l = lage({ grenzeCents: 1000, grenzeAm: "2026-11-05 10:00:00", punkte: { markt: reihe([40, 1000], [20, 950]) } });
		expect(alarmPruefen(l, "gebraucht", unter, JETZT)).toMatchObject({ art: "tief", preisCents: 795 });
	});
});
