import { describe, it, expect } from "vitest";
import { normalisiereEan, pruefzifferStimmt } from "../src/domain/ean";

describe("normalisiereEan", () => {
	it("nimmt 8 bis 14 Ziffern, auch mit Leerzeichen und Bindestrichen", () => {
		expect(normalisiereEan(" 4012345678901 ")).toBe("4012345678901");
		expect(normalisiereEan("4 012345 678901")).toBe("4012345678901");
		expect(normalisiereEan("40-1234-5678")).toBe("4012345678");
		expect(normalisiereEan(4012345678901)).toBe("4012345678901");
	});

	it("weist alles andere ab", () => {
		expect(normalisiereEan("1234567")).toBeNull();
		expect(normalisiereEan("123456789012345")).toBeNull();
		expect(normalisiereEan("40123A5678901")).toBeNull();
		expect(normalisiereEan("")).toBeNull();
		expect(normalisiereEan(null)).toBeNull();
		expect(normalisiereEan({})).toBeNull();
	});
});

describe("pruefzifferStimmt", () => {
	it("erkennt gueltige EAN-13, EAN-8 und UPC-A", () => {
		expect(pruefzifferStimmt("4006381333931")).toBe(true); // EAN-13 (GS1-Beispiel)
		expect(pruefzifferStimmt("5021290067479")).toBe(true); // EAN-13
		expect(pruefzifferStimmt("96385074")).toBe(true); // EAN-8
		expect(pruefzifferStimmt("036000291452")).toBe(true); // UPC-A
	});

	it("erkennt einen Zahlendreher", () => {
		expect(pruefzifferStimmt("4006381333913")).toBe(false);
		expect(pruefzifferStimmt("96385047")).toBe(false);
		expect(pruefzifferStimmt("036000291425")).toBe(false);
	});

	it("prueft andere Laengen nicht", () => {
		expect(pruefzifferStimmt("1234567890")).toBe(true);
		expect(pruefzifferStimmt("12345678901234")).toBe(true);
	});
});
