import { describe, it, expect } from "vitest";
import { bestertitel, mehrheitstreffer, sammlungstreffer, vorbereiten, worteAus } from "../src/domain/scan-titel";

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

	it("wirft Ballastworte weg - samt der Plattformziffer", () => {
		// Bis Stufe 17c blieb die "3" aus "Sony Playstation 3" stehen und liess
		// Angebote fuer ein Grundspiel auf dessen dritten Teil passen.
		expect([...worteAus("Ps3 / Sony Playstation 3 Game - Darksiders [standard] En/ger Boxed")]).toEqual(["darksiders"]);
	});
});

/**
 * Stufe 17c: eBay liefert bis zu zehn Angebote je Code. Die Faelle stammen
 * aus der Messung vom 21.09.2026 gegen dieselben echten Codes.
 */
describe("Mehrheit ueber mehrere Angebote (Stufe 17c)", () => {
	const mehr = [...spiele, { spielId: 13, titel: "LittleBigPlanet" }, { spielId: 14, titel: "LittleBigPlanet2" }];
	const bestand2 = vorbereiten(mehr);
	const ziel = (titel: string[]) => mehrheitstreffer(titel, bestand2).spiel?.titel ?? null;

	it("nimmt das Spiel, das die Mehrheit der Angebote nennt", () => {
		expect(
			ziel([
				"Killzone 3 PS3 Sony PlayStation 3",
				"Killzone 3 - Playstation 3 - PAL - deutsch",
				"Killzone 3 (Sony PlayStation 3, 2011)",
			]),
		).toBe("Killzone 3");
	});

	it("laesst ein Buendel-Angebot nicht durch", () => {
		// Ein Angebot nennt zwei Spiele, die uebrigen nur eines. So entstand am
		// 21.09.2026 der Fehlgriff "Red Dead Redemption -> GTA IV".
		expect(
			ziel([
				"Spec Ops: The Line PS3",
				"Spec Ops The Line - Playstation 3 - CiB",
				"Sammlung: Spec Ops The Line + Demon's Souls PS3",
				"Spec Ops: The Line (Sony PlayStation 3)",
			]),
		).toBe("Spec Ops: The Line");
	});

	it("entscheidet nicht, wenn zwei Spiele gleich oft genannt werden", () => {
		expect(ziel(["Killzone 3 PS3", "Batman: Arkham Asylum PS3"])).toBeNull();
	});

	it("verhaelt sich bei einem einzigen Angebot wie der Einzelabgleich", () => {
		expect(ziel(["Batman Arkham Asylum Game of the Year PS3"])).toBe("Batman: Arkham Asylum");
		expect(ziel(["Colgate Max Fresh Knockout"])).toBeNull();
	});

	it("trennt zusammengeschriebene Fortsetzungsnummern", () => {
		// Die Sammlung fuehrt "LittleBigPlanet2", eBay schreibt "LittleBigPlanet 2".
		// Ohne Trennung gewann das Grundspiel - der Fehlgriff der ersten Messung.
		expect(ziel(["LittleBigPlanet 2 Zustand gut CIB OVP Sony PlayStation 3 PS3"])).toBe("LittleBigPlanet2");
		expect(ziel(["LittleBigPlanet Sony PlayStation 3 PAL"])).toBe("LittleBigPlanet");
	});

	it("macht aus 'Killzone PS3' nicht 'Killzone 3'", () => {
		// Die Ziffer aus der Plattform darf nie in den Titelvergleich geraten:
		// deshalb faellt Ballast VOR der Zifferntrennung weg.
		expect(worteAus("Killzone PS3")).toEqual(new Set(["killzone"]));
		expect(ziel(["Killzone PS3 Sony PlayStation 3 PAL"])).toBe("Killzone");
	});

	it("nimmt keinen Alleinkandidaten, den nur ein Angebot von vielen stuetzt", () => {
		// So entstand am 21.09.2026 aus einem Buendel ein Vorschlag fuer ein
		// fremdes Spiel: neun Angebote nannten ein Spiel, das die Sammlung in
		// zwei Fassungen fuehrt (also mehrdeutig), und das zehnte ein GTA.
		const titel = [
			"Irgendein Spiel das hier nicht steht PS3",
			"Noch eines ohne Treffer PS3",
			"Bundle: Killzone 3 + zwei weitere PS3",
		];
		expect(ziel(titel)).toBeNull();
		// Mit zwei Nennungen ist der Rueckhalt da.
		expect(ziel([...titel, "Killzone 3 PS3 PAL"])).toBe("Killzone 3");
	});

	it("bleibt bei einem einzigen Angebot entscheidungsfaehig", () => {
		// upcitemdb liefert genau einen Titel - der Rueckhalt darf dort nicht greifen.
		expect(ziel(["Killzone 3 PS3 PAL"])).toBe("Killzone 3");
		expect(ziel(["Killzone 3 PS3 PAL", "Irgendwas anderes"])).toBe("Killzone 3");
	});

	it("bringt roemische Fortsetzungsnummern mit arabischen zusammen", () => {
		// Die Sammlung schreibt "II", die Verkaeufer schreiben "2".
		expect(worteAus("Kingdom Come: Deliverance II")).toEqual(worteAus("Kingdom Come Deliverance 2"));
		// v und x bleiben Buchstaben: "Mega Man X" ist nicht "Mega Man 10".
		expect([...worteAus("Mega Man X")]).toEqual(["mega", "man", "x"]);
	});

	it("gibt den Titel zurueck, der die Mehrheit gebracht hat", () => {
		expect(
			bestertitel(["Irgendwas anderes", "Killzone 3 PS3 PAL", "Killzone 3 CiB"], bestand2),
		).toBe("Killzone 3 PS3 PAL");
		// Ohne Treffer bleibt der erste Titel - er ist die Vorlage zum Anlegen.
		expect(bestertitel(["Unbekanntes Spiel PS4"], bestand2)).toBe("Unbekanntes Spiel PS4");
		expect(bestertitel([], bestand2)).toBeNull();
	});
});
