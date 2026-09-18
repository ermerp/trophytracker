import { describe, it, expect } from "vitest";
import { sammlungstreffer, vorbereiten, worteAus } from "../src/domain/scan-titel";

/**
 * Abgleich Haendlertitel gegen die eigene Sammlung (9.3). Die Faelle stammen
 * aus der Messung vom 18.09.2026 gegen 56 echte Codes des Nutzers.
 */

const spiele = [
	{ spielId: 1, titel: "FIFA 10" },
	{ spielId: 2, titel: "FIFA 13" },
	{ spielId: 3, titel: "Spec Ops: The Line" },
	{ spielId: 4, titel: "Star Wars: The Force Unleashed" },
	{ spielId: 5, titel: "Star Wars: The Force Unleashed II" },
	{ spielId: 6, titel: "Killzone" },
	{ spielId: 7, titel: "Killzone 3" },
	{ spielId: 8, titel: "Batman" },
	{ spielId: 9, titel: "Batman: Arkham Asylum" },
	{ spielId: 10, titel: "Game of Thrones (2012)" },
	{ spielId: 11, titel: "Game of Thrones (2014)" },
	{ spielId: 12, titel: "Demon's Souls" },
];

const bestand = vorbereiten(spiele);

const treffer = (text: string) => {
	const e = sammlungstreffer(text, bestand);
	return { titel: e.treffer.map((t) => t.titel), eindeutig: e.eindeutig };
};

describe("sammlungstreffer", () => {
	it("findet den Titel im Haendlertext, trotz Ballast", () => {
		expect(treffer("FIFA 10 PS3 Game (PAL Region) - Disk & box in good condition")).toEqual({
			titel: ["FIFA 10"],
			eindeutig: true,
		});
		expect(treffer("Spec Ops: The Line [German Version]")).toEqual({ titel: ["Spec Ops: The Line"], eindeutig: true });
		expect(treffer("Demon's Souls By Namco Bandai Partners Germany")).toEqual({ titel: ["Demon's Souls"], eindeutig: true });
		expect(treffer("Ps3 / Sony Playstation 3 Game - Killzone 3 [standard] En/ger")).toMatchObject({ eindeutig: true });
	});

	it("nimmt den laengeren Titel, wenn der kuerzere darin aufgeht", () => {
		// "Killzone" steckt in "Killzone 3" - das ist keine echte Mehrdeutigkeit.
		expect(treffer("Ps3 Game - Killzone 3 [standard]")).toEqual({ titel: ["Killzone 3", "Killzone"], eindeutig: true });
		expect(treffer("Batman: Arkham Asylum [platinum] By Koch Media Gmbh")).toEqual({
			titel: ["Batman: Arkham Asylum", "Batman"],
			eindeutig: true,
		});
		expect(treffer("Star Wars : Force Unleashed II")).toEqual({
			titel: ["Star Wars: The Force Unleashed II", "Star Wars: The Force Unleashed"],
			eindeutig: true,
		});
	});

	it("laesst den ersten Teil stehen, wenn die Fortsetzung nicht genannt ist", () => {
		expect(treffer("Star Wars Force Unleashed Sith (uk Import) Game")).toEqual({
			titel: ["Star Wars: The Force Unleashed"],
			eindeutig: true,
		});
	});

	it("meldet nichts, wenn das Spiel nicht in der Sammlung ist", () => {
		// FIFA 12 besitzt der Nutzer auf Disc, aber nicht als Spiel im Bestand.
		expect(treffer("Fifa Soccer 12 (bilingual Cover) (playstation3)[pal Compatible]")).toEqual({ titel: [], eindeutig: false });
		// Falscher Datensatz der Quelle - darf nichts treffen.
		expect(treffer("Colgate Max Fresh Knockout Toothpaste With Mini Breath Strips")).toEqual({ titel: [], eindeutig: false });
		expect(treffer("")).toEqual({ titel: [], eindeutig: false });
	});

	it("erkennt echte Mehrdeutigkeit", () => {
		// Zwei gleichnamige Spiele, keines steckt im anderen.
		expect(treffer("Game of Thrones: Das Lied von Eis und Feuer [German Version]")).toEqual({ titel: [], eindeutig: false });
		const beide = sammlungstreffer("Game of Thrones 2012 2014", bestand);
		expect(beide.treffer.map((t) => t.titel).sort()).toEqual(["Game of Thrones (2012)", "Game of Thrones (2014)"]);
		expect(beide.eindeutig).toBe(false);
	});

	it("wirft Ballastworte weg", () => {
		expect([...worteAus("Ps3 / Sony Playstation 3 Game - Darksiders [standard] En/ger Boxed")]).toEqual(["3", "darksiders"]);
	});
});
