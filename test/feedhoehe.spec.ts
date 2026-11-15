import { describe, expect, it } from "vitest";
import { FEED_DESKTOP, FEED_HANDY, passendeEintraege } from "../frontend/src/feedhoehe";
import { FEED_HOECHSTENS, feedAnzahl } from "../src/api/feed";

/**
 * Die Hoehe des Feeds am Desktop (Stufe f2d) - ohne React, ohne Browser.
 * Was hier steht, entscheidet, ob unten ein halber Eintrag steht.
 */

describe("Eintraege, die ganz passen", () => {
	it("nimmt von vorn, solange die Summe in den Platz passt", () => {
		expect(passendeEintraege([50, 50, 50], 120)).toBe(2);
	});

	it("schneidet auf ganze Eintraege, auch wenn ein spaeterer kurzer noch passte", () => {
		// 50 + 90 = 140 ist zu viel; die 20 dahinter passten, rueckt aber nicht vor.
		expect(passendeEintraege([50, 90, 20], 120)).toBe(1);
	});

	it("zeigt alle, wenn der Platz reicht - auch genau auf die Kante", () => {
		expect(passendeEintraege([50, 50], 100)).toBe(2);
		expect(passendeEintraege([50, 50], 400)).toBe(2);
	});

	it("verzeiht Rundungsfehler unter einem halben Pixel, aber nicht mehr", () => {
		expect(passendeEintraege([52.3, 52.3], 104.4)).toBe(2);
		expect(passendeEintraege([52.3, 52.3], 103.9)).toBe(1);
	});

	it("zeigt nichts ohne Platz oder Eintraege", () => {
		expect(passendeEintraege([50], 0)).toBe(0);
		expect(passendeEintraege([50], -10)).toBe(0);
		expect(passendeEintraege([50], Number.NaN)).toBe(0);
		expect(passendeEintraege([], 500)).toBe(0);
		// Schon der erste ist zu hoch.
		expect(passendeEintraege([80, 10], 60)).toBe(0);
	});
});

describe("Zahl der Zeilen, die die Route liefert", () => {
	it("gibt ohne Parameter die acht des Handys", () => {
		expect(feedAnzahl(undefined)).toBe(FEED_HANDY);
		expect(feedAnzahl("")).toBe(FEED_HANDY);
		expect(feedAnzahl("viele")).toBe(FEED_HANDY);
	});

	it("nimmt den Wunsch des Aufrufers bis zur Obergrenze und kappt darueber", () => {
		expect(feedAnzahl("12")).toBe(12);
		expect(feedAnzahl(String(FEED_HOECHSTENS))).toBe(FEED_HOECHSTENS);
		expect(feedAnzahl("500")).toBe(FEED_HOECHSTENS);
		expect(feedAnzahl("-3")).toBe(1);
	});

	it("fragt am Desktop genau nach der Obergrenze der Route", () => {
		// Zwei Stellen, eine Zahl: Liegt das Frontend darueber, fehlen
		// Eintraege still; liegt es darunter, bleibt die Spalte unten leer.
		expect(FEED_DESKTOP).toBe(FEED_HOECHSTENS);
	});
});
