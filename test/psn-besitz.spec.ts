import { describe, expect, it } from "vitest";
import {
	absteigendNachLetztemSpiel,
	dauerInSekunden,
	plattformAusKategorie,
	spielzeitText,
	spitzeReichtWeiter,
} from "../src/domain/psn-besitz";
import { spielzeitAnlass, spielzeitRundeAus, VOLLLAUF_FRIST_TAGE } from "../src/sync/cron";

/**
 * Spielzeit und Plattform aus der PSN-Antwort (7.7, Stufe 18c). Die Formen
 * stammen aus der Messung gegen das echte Konto am 21.09.2026.
 */

describe("dauerInSekunden", () => {
	it("liest die gemessenen Formen", () => {
		expect(dauerInSekunden("PT12H59S")).toBe(12 * 3600 + 59);
		expect(dauerInSekunden("PT1H30M2S")).toBe(3600 + 30 * 60 + 2);
		expect(dauerInSekunden("PT45M")).toBe(45 * 60);
		expect(dauerInSekunden("P1DT2H")).toBe(86400 + 2 * 3600);
		expect(dauerInSekunden("PT0S")).toBe(0);
	});

	it("gibt bei Unlesbarem null zurueck, nie 0", () => {
		// Eine fehlende Spielzeit ist "unbekannt" und darf nie als "nie
		// gespielt" gelesen werden (Abschnitt 3).
		for (const wert of [null, undefined, "", "12H", "gestern", "P", "PT"]) {
			expect(dauerInSekunden(wert), String(wert)).toBeNull();
		}
	});
});

describe("plattformAusKategorie", () => {
	it("nimmt nur die beiden Spiel-Kategorien", () => {
		expect(plattformAusKategorie("ps4_game")).toBe("PS4");
		expect(plattformAusKategorie("ps5_native_game")).toBe("PS5");
	});

	it("verwirft alles, was kein Spiel ist", () => {
		// Gemessen am 21.09.2026: Streaming-Apps und Unbestimmtes standen mit
		// in der Antwort; sie duerfen gar nicht erst gespeichert werden.
		for (const k of [
			"ps5_web_based_media_app",
			"ps5_native_media_app",
			"ps4_nongame_mini_app",
			"ps4_videoservice_web_app",
			"unknown",
			"not_found",
			null,
		]) {
			expect(plattformAusKategorie(k), String(k)).toBeNull();
		}
	});
});

describe("spielzeitText", () => {
	it("sagt 'unbekannt' statt 0 - PS3 und Vita liefern nie eine Spielzeit", () => {
		expect(spielzeitText(null)).toBe("unbekannt");
	});

	it("rundet lesbar - fein bei kurzen Zeiten, grob bei langen", () => {
		expect(spielzeitText(30)).toBe("unter 1 min");
		expect(spielzeitText(45 * 60)).toBe("45 min");
		expect(spielzeitText(90 * 60)).toBe("1,5 h");
		expect(spielzeitText(12 * 3600 + 59)).toBe("12 h");
		expect(spielzeitText(87 * 3600 + 1800)).toBe("88 h");
	});
});

const t = (lastPlayedDateTime?: string) => ({ lastPlayedDateTime });

describe("absteigendNachLetztemSpiel (Stufe 18o)", () => {
	it("nimmt eine absteigende Seite, auch mit gleichen Zeiten", () => {
		expect(absteigendNachLetztemSpiel([t("2026-11-03T22:00:00.000Z"), t("2026-11-03T22:00:00.000Z"), t("2020-01-01T00:00:00.000Z")])).toBe(true);
	});

	it("erkennt eine Umkehrung", () => {
		expect(absteigendNachLetztemSpiel([t("2020-01-01T00:00:00.000Z"), t("2026-11-03T22:00:00.000Z")])).toBe(false);
	});

	it("vergleicht Zeiten, nicht Zeichen - Sony schreibt mal mehr, mal weniger Stellen", () => {
		expect(absteigendNachLetztemSpiel([t("2026-11-03T22:28:05.860000Z"), t("2026-11-03T22:28:05Z")])).toBe(true);
	});

	it("uebergeht Titel ohne Datum (es gibt sie), ohne dahinter blind zu werden", () => {
		expect(absteigendNachLetztemSpiel([t("2026-01-01T00:00:00Z"), t(undefined), t("2020-01-01T00:00:00Z")])).toBe(true);
		expect(absteigendNachLetztemSpiel([t("2020-01-01T00:00:00Z"), t(undefined), t("2026-01-01T00:00:00Z")])).toBe(false);
	});

	it("nimmt eine leere Seite", () => {
		expect(absteigendNachLetztemSpiel([])).toBe(true);
	});
});

describe("spitzeReichtWeiter (Stufe 18o)", () => {
	const bis = "2026-11-02T00:00:00Z";

	it("ja, wenn auch der aelteste Titel der Seite neu ist", () => {
		expect(spitzeReichtWeiter([t("2026-11-03T00:00:00Z"), t("2026-11-02T00:00:00Z")], bis)).toBe(true);
	});

	it("nein, sobald einer aelter ist", () => {
		expect(spitzeReichtWeiter([t("2026-11-03T00:00:00Z"), t("2026-11-01T23:59:59Z")], bis)).toBe(false);
	});

	it("nein bei einer Seite ohne jedes Datum", () => {
		expect(spitzeReichtWeiter([t(undefined)], bis)).toBe(false);
		expect(spitzeReichtWeiter([], bis)).toBe(false);
	});
});

describe("spielzeitAnlass (Stufe 18o)", () => {
	const heute = "2026-11-30";
	const runde = { vollAm: "2026-11-20", release: 10, spitzeAm: "2026-11-29" };

	it("ohne Grund nur die Spitze", () => {
		expect(spielzeitAnlass(runde, 10, heute)).toBeNull();
	});

	it("voll in der ersten Nacht", () => {
		expect(spielzeitAnlass(null, 10, heute)).toBe("frist");
	});

	it("voll bei einem neuen Release", () => {
		expect(spielzeitAnlass(runde, 11, heute)).toBe("neu");
	});

	it("eine kleinere Id ist nichts Neues - ein Release wurde geloescht", () => {
		expect(spielzeitAnlass(runde, 9, heute)).toBeNull();
	});

	it("die Frist greift genau nach 30 Tagen", () => {
		expect(VOLLLAUF_FRIST_TAGE).toBe(30);
		expect(spielzeitAnlass({ ...runde, vollAm: "2026-11-01" }, 10, heute)).toBeNull();
		expect(spielzeitAnlass({ ...runde, vollAm: "2026-10-31" }, 10, heute)).toBe("frist");
	});
});

describe("spielzeitRundeAus (Stufe 18o)", () => {
	it("liest eine Runde", () => {
		const r = { vollAm: "2026-11-01", release: 3, spitzeAm: "2026-11-02" };
		expect(spielzeitRundeAus(JSON.stringify(r))).toEqual(r);
	});

	it("nimmt Unlesbares als keine Runde - das heisst Volllauf, nicht Absturz", () => {
		expect(spielzeitRundeAus(null)).toBeNull();
		expect(spielzeitRundeAus("kaputt")).toBeNull();
		expect(spielzeitRundeAus(JSON.stringify({ vollAm: "2026-11-01" }))).toBeNull();
	});
});
