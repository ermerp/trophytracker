import { describe, expect, it } from "vitest";
import roh from "../.github/workflows/markt.yml?raw";

/** Ohne Kommentare - die Datei erklaert die Regel selbst und nennt dabei `pull_request`. */
const workflow = roh.replace(/^[ \t]*#.*\n/gm, "");

/**
 * Die Markt-Action darf nur ueber schedule und workflow_dispatch laufen, nie
 * ueber pull_request oder pull_request_target (Bedingung des Nutzers vom
 * 19.10.2026): Sie traegt die eBay-Zugangsdaten und das Service Token.
 *
 * Gelesen wird die Datei selbst, nicht eine Abschrift der Regel - eine
 * Aenderung am Workflow allein faellt hier auf.
 */
describe("Markt-Action (Stufe 20i)", () => {
	it("startet nur ueber schedule und workflow_dispatch", () => {
		const block = /^on:\n((?:[ \t]+.*\n|\s*\n)*)/m.exec(workflow)?.[1] ?? "";
		const ausloeser = [...block.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
		expect(ausloeser).toEqual(["schedule", "workflow_dispatch"]);
		expect(workflow).not.toMatch(/pull_request/);
	});

	it("gibt dem Token nur Leserechte am Repository", () => {
		expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
	});
});
