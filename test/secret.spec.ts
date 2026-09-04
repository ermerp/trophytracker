import { describe, it, expect } from "vitest";
import { Geheimnis, REDAKTIERT } from "../src/domain/secret";

const WERT = "npsso-geheimwert-abc123";

describe("Geheimnis", () => {
	it("gibt den Klartext nur ueber offenlegen() heraus", () => {
		expect(new Geheimnis(WERT).offenlegen()).toBe(WERT);
	});

	it("redigiert bei toString()", () => {
		expect(new Geheimnis(WERT).toString()).toBe(REDAKTIERT);
	});

	it("redigiert im Template-Literal", () => {
		expect(`${new Geheimnis(WERT)}`).toBe(REDAKTIERT);
		expect(`${new Geheimnis(WERT)}`).not.toContain(WERT);
	});

	it("redigiert bei String()", () => {
		expect(String(new Geheimnis(WERT))).not.toContain(WERT);
	});

	it("redigiert bei JSON.stringify - auch verschachtelt", () => {
		const objekt = { zugang: { npsso: new Geheimnis(WERT) }, egal: 1 };
		const json = JSON.stringify(objekt);

		expect(json).not.toContain(WERT);
		expect(json).toContain(REDAKTIERT);
	});

	it("redigiert in einer Fehlermeldung, die das Geheimnis einbaut", () => {
		const fehler = new Error(`Fehlgeschlagen mit ${new Geheimnis(WERT)}`);
		expect(fehler.message).not.toContain(WERT);
	});

	it("kennt die Laenge, ohne den Wert zu zeigen", () => {
		expect(new Geheimnis(WERT).laenge).toBe(WERT.length);
	});

	it("weist einen leeren Wert zurueck", () => {
		expect(() => new Geheimnis("")).toThrow();
	});
});
