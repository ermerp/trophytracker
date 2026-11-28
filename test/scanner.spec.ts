import { describe, expect, it } from "vitest";
import {
	HOECHSTENS_SPIELE,
	MUSTER,
	angelegtAus,
	anderePlattformen,
	bundleHinweis,
	bundleVorwahl,
	istBundle,
	reihenName,
	erfassungAus,
	gemeinsamePlattform,
	hauptRelease,
	hauptText,
	kandidatenOrdnen,
	rahmenFuer,
	scanZurueck,
	signalFuer,
	wahlUmschalten,
	zielAufPlattform,
	zieleOrdnen,
	type ErfassteDisc,
	type Erfassung,
	type HuellenWahl,
	type KandidatRelease,
} from "../frontend/src/scanner";

/**
 * Scanner-Logik (Nachtrag f1g): Signal je Ergebnis, Vorschlag fuer den
 * Hauptknopf und der Rueckweg nach einer Erfassung.
 */

describe("signalFuer", () => {
	it("Mapping mit Disc ist 'regal'", () => {
		expect(signalFuer({ art: "aufgeloest", treffer: "mapping", exemplare: 1 })).toBe("regal");
	});

	it("Mapping ohne Disc verlangt eine Entscheidung - 'neu'", () => {
		expect(signalFuer({ art: "aufgeloest", treffer: "mapping", exemplare: 0 })).toBe("neu");
	});

	it("unbekannter Code und Haendlerangebot sind 'neu'", () => {
		expect(signalFuer({ art: "aufgeloest", treffer: "keiner", exemplare: null })).toBe("neu");
		expect(signalFuer({ art: "aufgeloest", treffer: "angebot", exemplare: null })).toBe("neu");
	});

	it("erfasst, schon da (409) und Fehler", () => {
		expect(signalFuer({ art: "erfasst" })).toBe("erfasst");
		expect(signalFuer({ art: "schon_da" })).toBe("regal");
		expect(signalFuer({ art: "fehler" })).toBe("fehler");
	});
});

describe("MUSTER", () => {
	it("traegt die abgenommenen Werte (Prototyp vom 28.11.2026)", () => {
		expect(MUSTER.neu.toene.map((t) => t.hz)).toEqual([1320]);
		expect(MUSTER.neu.vibration).toBe(40);
		expect(MUSTER.regal.toene.map((t) => t.hz)).toEqual([880, 880]);
		expect(MUSTER.regal.vibration).toEqual([30, 70, 30]);
		expect(MUSTER.erfasst.toene.map((t) => t.hz)).toEqual([990, 1480]);
		expect(MUSTER.erfasst.vibration).toBe(90);
		expect(MUSTER.fehler.toene).toEqual([{ hz: 220, dauer: 0.3, ab: 0, form: "triangle" }]);
		expect(MUSTER.fehler.vibration).toEqual([50, 50, 50, 50, 50]);
	});

	it("erfasst steigt an, die zwei Regal-Toene folgen nacheinander", () => {
		const [a, b] = MUSTER.erfasst.toene;
		expect(b.hz).toBeGreaterThan(a.hz);
		expect(b.ab).toBeGreaterThan(a.ab);
		expect(MUSTER.regal.toene[1].ab).toBeGreaterThanOrEqual(MUSTER.regal.toene[0].dauer);
	});
});

describe("hauptRelease", () => {
	const r = (releaseId: number, plattform: KandidatRelease["plattform"], exemplare: number): KandidatRelease => ({ releaseId, plattform, exemplare });

	it("nimmt ein Release ohne Disc, unter mehreren die neueste Plattform", () => {
		expect(hauptRelease([r(1, "PS3", 0), r(2, "PS5", 0), r(3, "PS4", 0)])?.releaseId).toBe(2);
	});

	it("ueberspringt Releases mit Disc", () => {
		expect(hauptRelease([r(1, "PS5", 1), r(2, "PS4", 0)])?.releaseId).toBe(2);
	});

	it("null, wenn ueberall schon eine Disc steht", () => {
		expect(hauptRelease([r(1, "PS5", 1)])).toBeNull();
		expect(hauptRelease([])).toBeNull();
	});
});

describe("anderePlattformen", () => {
	const r = (releaseId: number, plattform: KandidatRelease["plattform"], exemplare: number): KandidatRelease => ({ releaseId, plattform, exemplare });

	it("uebrige Releases ohne Disc, dann fehlende Plattformen; nie das Hauptrelease, nie eines mit Disc", () => {
		const releases = [r(1, "PS4", 0), r(2, "PS3", 0), r(3, "PS5", 1)];
		const haupt = hauptRelease(releases);
		expect(haupt?.releaseId).toBe(1);
		expect(anderePlattformen(releases, haupt)).toEqual([
			{ art: "release", releaseId: 2, plattform: "PS3" },
			{ art: "neu", plattform: "PSVITA" },
		]);
	});

	it("ohne Hauptrelease nur fehlende Plattformen", () => {
		expect(anderePlattformen([r(1, "PS4", 1)], null).map((a) => a.plattform)).toEqual(["PS5", "PS3", "PSVITA"]);
	});
});

describe("kandidatenOrdnen", () => {
	it("das Ziel der Mehrheitsregel steht vorn, der Rest in Lieferreihenfolge", () => {
		const k = [{ spielId: 1 }, { spielId: 2 }, { spielId: 3 }];
		expect(kandidatenOrdnen(k, 3).map((x) => x.spielId)).toEqual([3, 1, 2]);
		expect(kandidatenOrdnen(k, null).map((x) => x.spielId)).toEqual([1, 2, 3]);
	});
});

/** Ein Zug mit einer Disc - der Fall bis f1h. */
const disc = (felder: Partial<ErfassteDisc> = {}): ErfassteDisc => ({
	exemplarId: 7,
	releaseId: 20,
	spielId: 10,
	absichtenErledigt: [],
	spielNeu: false,
	releaseNeu: false,
	...felder,
});
const zug = (d: Partial<ErfassteDisc> = {}, vorherMapping: Erfassung["vorherMapping"] = null): Erfassung => ({
	ean: "4005209114554",
	discs: [disc(d)],
	vorherMapping,
});

describe("scanZurueck", () => {
	it("Fall 2: Disc und Mapping weg, sonst nichts", () => {
		expect(scanZurueck(zug())).toEqual([
			{ methode: "DELETE", pfad: "/api/physical-copies/7" },
			{ methode: "DELETE", pfad: "/api/scan/4005209114554" },
		]);
	});

	it("erledigte Absichten werden zuerst wieder geoeffnet", () => {
		const s = scanZurueck(zug({ absichtenErledigt: [{ id: 3 }, { id: 4 }] }));
		expect(s.slice(0, 2)).toEqual([
			{ methode: "PATCH", pfad: "/api/plans/3", koerper: { status: "offen" } },
			{ methode: "PATCH", pfad: "/api/plans/4", koerper: { status: "offen" } },
		]);
		expect(s[2]).toEqual({ methode: "DELETE", pfad: "/api/physical-copies/7" });
	});

	it("gesetzte Disc-Fassung kommt zuletzt auf 'unbekannt' zurueck", () => {
		const s = scanZurueck(zug({ physischStatusGesetzt: true }));
		expect(s.at(-1)).toEqual({ methode: "PATCH", pfad: "/api/releases/20", koerper: { discFassung: "unbekannt" } });
	});

	it("Fall 3: das neue Spiel wird geloescht - nach Disc und Mapping", () => {
		const s = scanZurueck(zug({ spielNeu: true, releaseNeu: true, physischStatusGesetzt: true }));
		expect(s.map((x) => `${x.methode} ${x.pfad}`)).toEqual([
			"DELETE /api/physical-copies/7",
			"DELETE /api/scan/4005209114554",
			"DELETE /api/games/10",
		]);
	});

	it("neues Release (andere Plattform) wird geloescht, das Spiel bleibt", () => {
		const s = scanZurueck(zug({ releaseNeu: true, physischStatusGesetzt: true }));
		expect(s.at(-1)).toEqual({ methode: "DELETE", pfad: "/api/releases/20" });
		expect(s.some((x) => x.pfad.startsWith("/api/games/"))).toBe(false);
	});

	it("vorheriges Mapping auf ein anderes Release mit Disc wird zurueckgesetzt (409 heisst Erfolg)", () => {
		const s = scanZurueck(zug({}, { releaseId: 99, mitDisc: true }));
		expect(s[1]).toEqual({ methode: "POST", pfad: "/api/scan/4005209114554/assign", koerper: { releaseId: 99 }, erwartet: 409 });
		expect(s.some((x) => x.methode === "DELETE" && x.pfad.startsWith("/api/scan/"))).toBe(false);
	});

	it("Mapping, das schon vorher auf dieses Release zeigte, bleibt stehen", () => {
		const s = scanZurueck(zug({}, { releaseId: 20, mitDisc: false }));
		expect(s.map((x) => x.pfad)).toEqual(["/api/physical-copies/7"]);
	});

	it("vorheriges Mapping auf ein Release ohne Disc laesst sich nicht wiederherstellen - es wird geloest", () => {
		const s = scanZurueck(zug({}, { releaseId: 99, mitDisc: false }));
		expect(s[1]).toEqual({ methode: "DELETE", pfad: "/api/scan/4005209114554" });
	});
});

describe("angelegtAus (POST /api/games)", () => {
	it("neues Spiel: Spiel und Release sind neu", () => {
		expect(angelegtAus({})).toEqual({ spielNeu: true, releaseNeu: true });
	});

	it("vorhandenes Spiel, Release eben angelegt", () => {
		expect(angelegtAus({ vorhanden: true, releaseNeu: true })).toEqual({ spielNeu: false, releaseNeu: true });
	});

	it("vorhandenes Spiel, Release schon da", () => {
		expect(angelegtAus({ vorhanden: true, releaseNeu: false })).toEqual({ spielNeu: false, releaseNeu: false });
	});

	it("fehlender Schluessel heisst unbekannt - es wird nichts geloescht", () => {
		expect(angelegtAus({ vorhanden: true })).toEqual({ spielNeu: false, releaseNeu: false });
	});
});

describe("scanZurueck nach vorhandenem Spiel mit neuem Release", () => {
	it("loescht das Release, nicht das Spiel", () => {
		const e = erfassungAus(
			"4005209114554",
			[{ id: 7, releaseId: 20, spiel: { spielId: 10 }, absichtenErledigt: [] }],
			{ releaseId: 20, ...angelegtAus({ vorhanden: true, releaseNeu: true }) },
			null,
		);
		expect(scanZurueck(e).map((x) => `${x.methode} ${x.pfad}`)).toEqual([
			"DELETE /api/physical-copies/7",
			"DELETE /api/scan/4005209114554",
			"DELETE /api/releases/20",
		]);
	});
});

describe("Eine Huelle, mehrere Spiele (Nachtrag f1h)", () => {
	const zwei: Erfassung = {
		ean: "4005209114554",
		vorherMapping: null,
		discs: [
			disc({ exemplarId: 7, releaseId: 20, spielId: 10, absichtenErledigt: [{ id: 3 }], physischStatusGesetzt: true }),
			disc({ exemplarId: 8, releaseId: 21, spielId: 11, absichtenErledigt: [{ id: 4 }], releaseNeu: true }),
		],
	};

	it("Rueckgaengig nimmt ALLE Discs des Zugs zurueck - Absichten zuerst, je Release das Neue zuletzt", () => {
		expect(scanZurueck(zwei).map((x) => `${x.methode} ${x.pfad}`)).toEqual([
			"PATCH /api/plans/3",
			"PATCH /api/plans/4",
			"DELETE /api/physical-copies/7",
			"DELETE /api/physical-copies/8",
			"DELETE /api/scan/4005209114554",
			"PATCH /api/releases/20",
			"DELETE /api/releases/21",
		]);
	});

	it("ein vorheriges Mapping auf eine Disc ausserhalb des Zugs kommt zurueck (+ weiteres Spiel dieser Huelle)", () => {
		const s = scanZurueck({ ...zwei, vorherMapping: { releaseId: 99, mitDisc: true } });
		expect(s).toContainEqual({ methode: "POST", pfad: "/api/scan/4005209114554/assign", koerper: { releaseId: 99 }, erwartet: 409 });
		expect(s.some((x) => x.methode === "DELETE" && x.pfad.startsWith("/api/scan/"))).toBe(false);
	});

	it("zeigte das Mapping auf das erste Release des Zugs, bleibt es", () => {
		const s = scanZurueck({ ...zwei, vorherMapping: { releaseId: 20, mitDisc: false } });
		expect(s.some((x) => x.pfad.startsWith("/api/scan/"))).toBe(false);
	});

	it("zieleOrdnen stellt das Release des alten Mappings nach vorn", () => {
		const w = (spielId: number, releaseId: number): HuellenWahl => ({ spielId, titel: `S${spielId}`, plattform: "PS3", ziel: { releaseId }, releaseNeu: false });
		expect(zieleOrdnen([w(1, 20), w(2, 21)], 21).map((x) => x.spielId)).toEqual([2, 1]);
		expect(zieleOrdnen([w(1, 20), w(2, 21)], null).map((x) => x.spielId)).toEqual([1, 2]);
	});

	it("erfassungAus: releaseNeu vom Worker oder vom Anlegen davor, fehlender Schluessel heisst nicht neu", () => {
		const e = erfassungAus(
			"4005209114554",
			[
				{ id: 7, releaseId: 20, spiel: { spielId: 10 }, absichtenErledigt: [], releaseNeu: true },
				{ id: 8, releaseId: 21, spiel: { spielId: 11 }, absichtenErledigt: [] },
				{ id: 9, releaseId: 22, spiel: { spielId: 12 }, absichtenErledigt: [] },
			],
			{ releaseId: 22, spielNeu: true, releaseNeu: true },
			null,
		);
		expect(e.discs.map((d) => [d.releaseNeu, d.spielNeu])).toEqual([
			[true, false],
			[false, false],
			[true, true],
		]);
	});

	it("zielAufPlattform: vorhandenes Release ohne Disc, sonst neu, mit Disc gar nicht", () => {
		const releases: KandidatRelease[] = [
			{ releaseId: 20, plattform: "PS3", exemplare: 0 },
			{ releaseId: 21, plattform: "PS4", exemplare: 1 },
		];
		expect(zielAufPlattform(10, releases, "PS3")).toEqual({ ziel: { releaseId: 20 }, releaseNeu: false });
		expect(zielAufPlattform(10, releases, "PS5")).toEqual({ ziel: { spielId: 10, plattform: "PS5" }, releaseNeu: true });
		expect(zielAufPlattform(10, releases, "PS4")).toBeNull();
	});

	it("wahlUmschalten: an, ab, ein Spiel nur einmal, hoechstens sechs", () => {
		const w = (spielId: number, releaseId: number): HuellenWahl => ({ spielId, titel: `S${spielId}`, plattform: "PS3", ziel: { releaseId }, releaseNeu: false });
		let wahl = wahlUmschalten([], w(1, 20));
		wahl = wahlUmschalten(wahl, w(2, 21));
		expect(wahl.map((x) => x.spielId)).toEqual([1, 2]);
		expect(wahlUmschalten(wahl, w(1, 20)).map((x) => x.spielId)).toEqual([2]);
		// Dasselbe Spiel auf einem anderen Release ersetzt die Wahl, statt es zweimal zu nennen.
		expect(wahlUmschalten(wahl, w(1, 30)).map((x) => (x.ziel as { releaseId: number }).releaseId)).toEqual([30, 21]);
		const voll = Array.from({ length: HOECHSTENS_SPIELE }, (_, i) => w(i + 1, 100 + i));
		expect(wahlUmschalten(voll, w(99, 999))).toHaveLength(HOECHSTENS_SPIELE);
	});

	it("hauptText: ein Spiel 'Disc erfassen · PS3', mehrere 'Disc fuer n Spiele erfassen' ohne Plattform (360 px)", () => {
		const w = (spielId: number, plattform: HuellenWahl["plattform"]): HuellenWahl => ({ spielId, titel: "", plattform, ziel: { spielId, plattform }, releaseNeu: true });
		expect(hauptText([w(1, "PS3")])).toEqual({ text: "Disc erfassen", plattform: "PS3" });
		expect(hauptText([w(1, "PS3"), w(2, "PS3")])).toEqual({ text: "Disc für 2 Spiele erfassen", plattform: null });
		expect(hauptText([])).toEqual({ text: "Disc erfassen", plattform: null });
	});

	it("gemeinsamePlattform: nur wenn alle gewaehlten dieselbe haben", () => {
		const w = (spielId: number, plattform: HuellenWahl["plattform"]): HuellenWahl => ({ spielId, titel: "", plattform, ziel: { spielId, plattform }, releaseNeu: true });
		expect(gemeinsamePlattform([w(1, "PS3"), w(2, "PS3")])).toBe("PS3");
		expect(gemeinsamePlattform([w(1, "PS3"), w(2, "PS4")])).toBeNull();
		expect(gemeinsamePlattform([])).toBeNull();
	});
});

describe("rahmenFuer (Wunsch des Nutzers vom 28.11.2026)", () => {
	it("steht, solange eine Karte offen ist - in der Farbe ihres Falls, auch ohne Blitz", () => {
		expect(rahmenFuer({ art: "code", signal: "neu" }, null)).toBe("neu");
		expect(rahmenFuer({ art: "code", signal: "regal" }, null)).toBe("regal");
		expect(rahmenFuer({ art: "fehler" }, null)).toBe("fehler");
	});

	it("die offene Karte schlaegt den Blitz", () => {
		expect(rahmenFuer({ art: "code", signal: "regal" }, "erfasst")).toBe("regal");
	});

	it("wenn wieder gescannt werden kann, nur der kurze Blitz - sonst neutral", () => {
		expect(rahmenFuer({ art: "erfasst" }, "erfasst")).toBe("erfasst");
		expect(rahmenFuer({ art: "erfasst" }, null)).toBeNull();
		expect(rahmenFuer({ art: "leer" }, null)).toBeNull();
	});
});

describe("Collection aus IGDB (Nachtrag f1i)", () => {
	it("erkennt ein Bundle nur am Typ", () => {
		expect(istBundle("Bundle")).toBe(true);
		expect(istBundle("Hauptspiel")).toBe(false);
		expect(istBundle(null)).toBe(false);
		expect(istBundle(undefined)).toBe(false);
	});

	describe("reihenName", () => {
		it.each([
			["God of War Collection", "God of War"],
			["Far Cry: Wild Expedition", "Far Cry"],
			["Metal Gear Solid: The Legacy Collection", "Metal Gear Solid"],
			["Ico & Shadow of the Colossus Collection: Limited Box", "Ico"],
			["Kingdom Hearts HD 1.5 + 2.5 ReMIX", "Kingdom Hearts"],
			["Uncharted: The Nathan Drake Collection", "Uncharted"],
			["Metal Gear Solid HD Collection", "Metal Gear Solid"],
			["Ratchet & Clank Trilogy", "Ratchet"],
			["Jak and Daxter Collection", "Jak"],
			["Sly Cooper - Collection", "Sly Cooper"],
			["  Doppelte   Leerzeichen   Trilogy ", "Doppelte Leerzeichen"],
		])("%s → %s", (name, erwartet) => {
			expect(reihenName(name)).toBe(erwartet);
		});

		it("laesst ein einzelnes Wort stehen, auch wenn es ein Huellenwort ist", () => {
			expect(reihenName("Collection")).toBe("Collection");
		});

		it("gibt den Namen zurueck, wenn nach dem Kuerzen nichts bleibt", () => {
			expect(reihenName(": Untertitel")).toBe(": Untertitel");
		});
	});

	describe("bundleVorwahl", () => {
		const spiele = [
			{ spielId: 1, titel: "Eins", bild: null, releases: [{ releaseId: 11, plattform: "PS3" as const, exemplare: 0 }] },
			// Auf PS3 schon im Regal - bleibt ungewaehlt.
			{ spielId: 2, titel: "Zwei", bild: null, releases: [{ releaseId: 21, plattform: "PS3" as const, exemplare: 1 }] },
			// Nur auf PS4 in der Sammlung - die Disc kommt an ein neues PS3-Release.
			{ spielId: 3, titel: "Drei", bild: null, releases: [{ releaseId: 31, plattform: "PS4" as const, exemplare: 0 }] },
			// Ohne Release (aus einem Wunsch).
			{ spielId: 4, titel: "Vier", bild: null, releases: [] },
		];

		it("waehlt jedes Spiel auf der Plattform des Treffers, ausser dort steht schon eine Disc", () => {
			expect(bundleVorwahl(spiele, "PS3")).toEqual([
				{ spielId: 1, titel: "Eins", plattform: "PS3", ziel: { releaseId: 11 }, releaseNeu: false },
				{ spielId: 3, titel: "Drei", plattform: "PS3", ziel: { spielId: 3, plattform: "PS3" }, releaseNeu: true },
				{ spielId: 4, titel: "Vier", plattform: "PS3", ziel: { spielId: 4, plattform: "PS3" }, releaseNeu: true },
			]);
		});

		it("nimmt auf einer anderen Plattform das Release dort", () => {
			expect(bundleVorwahl(spiele, "PS4").map((w) => w.ziel)).toEqual([
				{ spielId: 1, plattform: "PS4" },
				{ spielId: 2, plattform: "PS4" },
				{ releaseId: 31 },
				{ spielId: 4, plattform: "PS4" },
			]);
		});

		it("haelt die Grenze je Huelle", () => {
			const viele = Array.from({ length: HOECHSTENS_SPIELE + 3 }, (_, i) => ({ spielId: i + 1, titel: `S${i}`, bild: null, releases: [] }));
			expect(bundleVorwahl(viele, "PS3")).toHaveLength(HOECHSTENS_SPIELE);
		});

		it("ist leer ohne Spiele", () => {
			expect(bundleVorwahl([], "PS3")).toEqual([]);
		});
	});

	describe("bundleHinweis", () => {
		it("nennt den Grund, warum gesucht werden muss", () => {
			expect(bundleHinweis({ art: "fehler" })).toMatch(/such die Spiele in deiner Sammlung/);
			expect(bundleHinweis({ art: "inhalt", imBundle: 0, spiele: 0, gewaehlt: 0, plattform: "PS3" })).toMatch(/keine Spiele dieser Collection/);
			expect(bundleHinweis({ art: "inhalt", imBundle: 3, spiele: 0, gewaehlt: 0, plattform: "PS3" })).toBe("Keines der 3 Spiele steht in deiner Sammlung – such sie hier.");
		});

		it("sagt im Normalfall, wie viele Spiele der Collection die Sammlung hat", () => {
			expect(bundleHinweis({ art: "inhalt", imBundle: 4, spiele: 2, gewaehlt: 2, plattform: "PS3" })).toBe("2 von 4 Spielen in deiner Sammlung.");
		});

		it("sagt, wenn auf der Plattform alles schon im Regal steht", () => {
			expect(bundleHinweis({ art: "inhalt", imBundle: 2, spiele: 2, gewaehlt: 0, plattform: "PSVITA" })).toBe("2 von 2 Spielen in deiner Sammlung, auf Vita schon im Regal.");
		});
	});
});
