import { describe, expect, it } from "vitest";
import { listeFuerStatus, statusFuerListe } from "../src/domain/kopplung";

/** Kopplung von Liste und Bewertung (5.5) - die reinen Regeln. */
describe("statusFuerListe", () => {
	it("To-Do heisst am_spielen, egal woher", () => {
		expect(statusFuerListe("todo", null)).toBe("am_spielen");
		expect(statusFuerListe("todo", "nicht_gespielt")).toBe("am_spielen");
		expect(statusFuerListe("todo", "durchgespielt")).toBe("am_spielen");
		expect(statusFuerListe("todo", "am_spielen")).toBeNull();
	});

	it("Backlog heisst pausiert - ausser ein nie gestartetes bleibt nicht_gespielt", () => {
		expect(statusFuerListe("backlog", "am_spielen")).toBe("pausiert");
		expect(statusFuerListe("backlog", "abgebrochen")).toBe("pausiert");
		expect(statusFuerListe("backlog", "pausiert")).toBeNull();
		expect(statusFuerListe("backlog", null)).toBeNull();
		expect(statusFuerListe("backlog", "nicht_gespielt")).toBeNull();
	});
});

describe("listeFuerStatus", () => {
	it("ordnet jedem Status seine Liste zu", () => {
		expect(listeFuerStatus("am_spielen")).toBe("todo");
		expect(listeFuerStatus("pausiert")).toBe("backlog");
		for (const s of ["durchgespielt", "komplettiert", "abgebrochen"] as const) expect(listeFuerStatus(s)).toBe("erledigt");
		expect(listeFuerStatus("nicht_gespielt")).toBeNull();
		expect(listeFuerStatus("unentschieden")).toBeNull();
	});
});
