import { describe, expect, it } from "vitest";
import { naechstenKlickSchlucken } from "../frontend/src/ziehklick";

/**
 * Nachtrag f1e: Nach dem Ziehen schluckt das Fenster genau den nächsten Klick,
 * zeitlich begrenzt. workerd kennt kein Capture an EventTarget - deshalb ein
 * nachgebautes Fenster, das sich die Capture-Zuhoerer merkt.
 */

function fenster() {
	const zuhoerer = new Set<EventListener>();
	const capture: boolean[] = [];
	return {
		capture,
		addEventListener(_t: string, f: EventListener, c?: boolean) {
			capture.push(c === true);
			zuhoerer.add(f);
		},
		removeEventListener(_t: string, f: EventListener) {
			zuhoerer.delete(f);
		},
		/** Ein Klick: true, wenn ein Zuhoerer ihn abgewehrt und angehalten hat. */
		klick() {
			let abgewehrt = false;
			let angehalten = false;
			const ev = { preventDefault: () => (abgewehrt = true), stopPropagation: () => (angehalten = true) } as unknown as Event;
			for (const f of [...zuhoerer]) f(ev);
			return abgewehrt && angehalten;
		},
	};
}

describe("naechstenKlickSchlucken", () => {
	it("wehrt den Klick direkt nach dem Ziehen ab und haelt ihn an, im Capture", () => {
		const f = fenster();
		naechstenKlickSchlucken(f, 500);
		expect(f.capture).toEqual([true]);
		expect(f.klick()).toBe(true);
	});

	it("schluckt nur einen Klick - der naechste Tipp oeffnet wieder", () => {
		const f = fenster();
		naechstenKlickSchlucken(f, 500);
		f.klick();
		expect(f.klick()).toBe(false);
	});

	it("laesst einen spaeteren Klick durch", async () => {
		const f = fenster();
		naechstenKlickSchlucken(f, 20);
		await new Promise((fertig) => setTimeout(fertig, 40));
		expect(f.klick()).toBe(false);
	});
});
