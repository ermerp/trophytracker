import { describe, it, expect } from "vitest";
import { REVIEW_AKTIONEN, istReviewAktion, wirkung } from "../src/domain/review";

describe("wirkung (Abschnitt 8.1)", () => {
	it.each([
		["durchgespielt", "durchgespielt", null],
		["abgebrochen", "abgebrochen", null],
		["auf_todo", "am_spielen", "todo"],
		["ins_backlog", "pausiert", "backlog"],
		["unveraendert", null, null],
		["ueberspringen", "unentschieden", null],
	] as const)("%s → Status %s, Plan %s", (aktion, status, plan) => {
		expect(wirkung(aktion)).toEqual({ status, plan });
	});

	it("deckt alle Aktionen ab", () => {
		for (const a of REVIEW_AKTIONEN) expect(wirkung(a)).toBeDefined();
		expect(istReviewAktion("loeschen")).toBe(false);
	});
});
