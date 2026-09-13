import { describe, it, expect } from "vitest";
import { abgeleiteterStatus, istPlayStatus } from "../src/domain/play-status";

describe("abgeleiteterStatus (Abschnitt 4.2)", () => {
	it("100 % → komplettiert", () => expect(abgeleiteterStatus(100)).toBe("komplettiert"));
	it("99 % → am_spielen, Platin zaehlt nicht", () => expect(abgeleiteterStatus(99)).toBe("am_spielen"));
	it("1 % → am_spielen", () => expect(abgeleiteterStatus(1)).toBe("am_spielen"));
	it("0 % → nichts", () => expect(abgeleiteterStatus(0)).toBeNull());
});

describe("istPlayStatus", () => {
	it("kennt die sieben Werte und sonst nichts", () => {
		expect(istPlayStatus("komplettiert")).toBe(true);
		expect(istPlayStatus("unentschieden")).toBe(true);
		expect(istPlayStatus("fertig")).toBe(false);
		expect(istPlayStatus(3)).toBe(false);
	});
});
