import { describe, expect, it } from "vitest";
import { ortsstunde, ortszeit } from "../frontend/src/ortszeit";

/**
 * Die Zeiten der Automatik in den Einstellungen. Bis zum 25.10.2026 standen
 * dort feste Uhrzeiten der Sommerzeit; seit der Umstellung waren sie eine
 * Stunde falsch. Geprueft wird deshalb je ein Tag in Sommer- und Winterzeit,
 * dazu der Tag der Umstellung selbst - Cron und Actions laufen in UTC.
 */
const BERLIN = "Europe/Berlin";
const sommer = new Date("2026-07-01T12:00:00Z");
const winter = new Date("2026-12-01T12:00:00Z");

describe("Ortszeit der Automatik", () => {
	it("verschiebt die Fenster mit der Zeitumstellung", () => {
		expect([3, 6, 9].map((h) => ortsstunde(h, sommer, BERLIN))).toEqual(["5", "8", "11"]);
		expect([3, 6, 9].map((h) => ortsstunde(h, winter, BERLIN))).toEqual(["4", "7", "10"]);
	});

	it("rechnet am Tag der Umstellung schon in Winterzeit (25.10.2026, 01:00 UTC)", () => {
		expect(ortsstunde(3, new Date("2026-10-25T12:00:00Z"), BERLIN)).toBe("4");
	});

	it("nennt die Abendlaeufe mit Minuten", () => {
		expect(ortszeit(20, 17, sommer, BERLIN)).toBe("22:17");
		expect(ortszeit(20, 47, winter, BERLIN)).toBe("21:47");
	});

	it("folgt der Zeitzone des Geraets, nicht Berlin", () => {
		expect(ortsstunde(3, winter, "UTC")).toBe("3");
		expect(ortszeit(20, 17, winter, "America/New_York")).toBe("15:17");
	});
});
