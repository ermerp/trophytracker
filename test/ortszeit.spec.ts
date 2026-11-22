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
		// Seit 18r: PSN 0-3 UTC, Wartung 3-5 UTC.
		expect([0, 3, 5].map((h) => ortsstunde(h, sommer, BERLIN))).toEqual(["2", "5", "7"]);
		expect([0, 3, 5].map((h) => ortsstunde(h, winter, BERLIN))).toEqual(["1", "4", "6"]);
	});

	it("nennt Mitternacht UTC als 0 und nicht als 24", () => {
		// `hourCycle: 'h23'` - mit h24 stuende hier "24".
		expect(ortsstunde(0, winter, "UTC")).toBe("0");
	});

	it("rechnet am Tag der Umstellung je Stunde richtig (25.10.2026, 01:00 UTC)", () => {
		expect(ortsstunde(3, new Date("2026-10-25T12:00:00Z"), BERLIN)).toBe("4");
		// Der Fensterbeginn um 00:00 UTC liegt an diesem Tag noch in der Sommerzeit.
		expect(ortsstunde(0, new Date("2026-10-25T12:00:00Z"), BERLIN)).toBe("2");
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
