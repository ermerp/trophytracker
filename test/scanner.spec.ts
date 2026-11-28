import { describe, expect, it } from "vitest";
import {
	MUSTER,
	anderePlattformen,
	hauptRelease,
	kandidatenOrdnen,
	scanZurueck,
	signalFuer,
	type Erfassung,
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

describe("scanZurueck", () => {
	const basis: Erfassung = {
		exemplarId: 7,
		ean: "4005209114554",
		releaseId: 20,
		spielId: 10,
		absichtenErledigt: [],
		spielNeu: false,
		releaseNeu: false,
		vorherMapping: null,
	};

	it("Fall 2: Disc und Mapping weg, sonst nichts", () => {
		expect(scanZurueck(basis)).toEqual([
			{ methode: "DELETE", pfad: "/api/physical-copies/7" },
			{ methode: "DELETE", pfad: "/api/scan/4005209114554" },
		]);
	});

	it("erledigte Absichten werden zuerst wieder geoeffnet", () => {
		const s = scanZurueck({ ...basis, absichtenErledigt: [{ id: 3 }, { id: 4 }] });
		expect(s.slice(0, 2)).toEqual([
			{ methode: "PATCH", pfad: "/api/plans/3", koerper: { status: "offen" } },
			{ methode: "PATCH", pfad: "/api/plans/4", koerper: { status: "offen" } },
		]);
		expect(s[2]).toEqual({ methode: "DELETE", pfad: "/api/physical-copies/7" });
	});

	it("gesetzte Disc-Fassung kommt zuletzt auf 'unbekannt' zurueck", () => {
		const s = scanZurueck({ ...basis, physischStatusGesetzt: true });
		expect(s.at(-1)).toEqual({ methode: "PATCH", pfad: "/api/releases/20", koerper: { discFassung: "unbekannt" } });
	});

	it("Fall 3: das neue Spiel wird geloescht - nach Disc und Mapping", () => {
		const s = scanZurueck({ ...basis, spielNeu: true, releaseNeu: true, physischStatusGesetzt: true });
		expect(s.map((x) => `${x.methode} ${x.pfad}`)).toEqual([
			"DELETE /api/physical-copies/7",
			"DELETE /api/scan/4005209114554",
			"DELETE /api/games/10",
		]);
	});

	it("neues Release (andere Plattform) wird geloescht, das Spiel bleibt", () => {
		const s = scanZurueck({ ...basis, releaseNeu: true, physischStatusGesetzt: true });
		expect(s.at(-1)).toEqual({ methode: "DELETE", pfad: "/api/releases/20" });
		expect(s.some((x) => x.pfad.startsWith("/api/games/"))).toBe(false);
	});

	it("vorheriges Mapping auf ein anderes Release mit Disc wird zurueckgesetzt (409 heisst Erfolg)", () => {
		const s = scanZurueck({ ...basis, vorherMapping: { releaseId: 99, mitDisc: true } });
		expect(s[1]).toEqual({ methode: "POST", pfad: "/api/scan/4005209114554/assign", koerper: { releaseId: 99 }, erwartet: 409 });
		expect(s.some((x) => x.methode === "DELETE" && x.pfad.startsWith("/api/scan/"))).toBe(false);
	});

	it("Mapping, das schon vorher auf dieses Release zeigte, bleibt stehen", () => {
		const s = scanZurueck({ ...basis, vorherMapping: { releaseId: 20, mitDisc: false } });
		expect(s.map((x) => x.pfad)).toEqual(["/api/physical-copies/7"]);
	});

	it("vorheriges Mapping auf ein Release ohne Disc laesst sich nicht wiederherstellen - es wird geloest", () => {
		const s = scanZurueck({ ...basis, vorherMapping: { releaseId: 99, mitDisc: false } });
		expect(s[1]).toEqual({ methode: "DELETE", pfad: "/api/scan/4005209114554" });
	});
});
