import { describe, it, expect } from "vitest";
import { npssoAusText } from "../src/domain/npsso";

/**
 * Die Eingaben sind ERFUNDEN - ein echtes NPSSO kommt nicht ins Repository
 * (CLAUDE.md). Nachgebaut ist nur die Form: 64 Zeichen aus Buchstaben und
 * Ziffern, und die Antwortform von Sonys Seite.
 */
const WERT = "a".repeat(10) + "B".repeat(10) + "7".repeat(10) + "cD9".repeat(8) + "xyz0123456";
const JETZT = () => Date.parse("2026-09-29T12:00:00.000Z");

describe("npssoAusText", () => {
	it("nimmt den blanken Wert", () => {
		expect(WERT).toHaveLength(64);
		expect(npssoAusText(WERT, JETZT)).toEqual({ wert: WERT, laeuftAbUm: null });
	});

	it("nimmt das ganze JSON und liest die Frist mit", () => {
		const text = `{"npsso":"${WERT}","expires_in":5182926}`;
		expect(npssoAusText(text, JETZT)).toEqual({
			wert: WERT,
			// 5 182 926 Sekunden sind knapp 60 Tage.
			laeuftAbUm: "2026-11-28T11:42:06.000Z",
		});
	});

	it("nimmt die ganze Seite mit Umbruechen und Leerzeichen", () => {
		const text = `\n\n  {\n  "npsso": "${WERT}",\n  "expires_in": 5182926\n}\n  \n`;
		expect(npssoAusText(text, JETZT)?.wert).toBe(WERT);
	});

	it("nimmt den Wert in Anfuehrungszeichen", () => {
		expect(npssoAusText(`"${WERT}"`, JETZT)?.wert).toBe(WERT);
	});

	it("gibt null bei nichts Brauchbarem", () => {
		for (const eingabe of ["", "   ", "kein Zugang hier", "{}", "a".repeat(63), "a".repeat(65)]) {
			expect(npssoAusText(eingabe, JETZT)).toBeNull();
		}
	});

	it("raet nicht, wenn mehrere Werte in Frage kommen", () => {
		const zweiter = "z".repeat(64);
		expect(npssoAusText(`${WERT} ${zweiter}`, JETZT)).toBeNull();
	});

	it("erkennt einen Wert nicht, der in einer laengeren Zeichenkette steckt", () => {
		// 65 Zusammenhaengende sind kein freistehender Wert - sonst schnitte
		// die Funktion aus einem beliebigen Hash 64 Zeichen heraus.
		expect(npssoAusText(`x${WERT}`, JETZT)).toBeNull();
		expect(npssoAusText(`${WERT}9`, JETZT)).toBeNull();
	});

	it("bleibt ohne Frist, wenn Sony keine nennt oder sie unsinnig ist", () => {
		expect(npssoAusText(`{"npsso":"${WERT}"}`, JETZT)?.laeuftAbUm).toBeNull();
		expect(npssoAusText(`{"npsso":"${WERT}","expires_in":0}`, JETZT)?.laeuftAbUm).toBeNull();
	});
});
