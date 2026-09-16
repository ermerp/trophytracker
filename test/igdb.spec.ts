import { describe, expect, it } from "vitest";
import {
	apicalypseText,
	eindeutigerTreffer,
	kurzbegriff,
	metadatenAus,
	normalisiereTreffer,
	ordneKandidaten,
	normalisiereTrefferliste,
	releaseStatusAus,
	suchbegriff,
	type IgdbKandidat,
} from "../src/domain/igdb";
import { spielRoh } from "./igdb-fake";

/**
 * Reine Logik des IGDB-Abgleichs (Abschnitt 7.6). Die Faelle stammen aus
 * der Messung gegen die echten 420 Titel - nachgebaut, nicht kopiert.
 */

function kandidat(ueberschreiben: Partial<IgdbKandidat> = {}): IgdbKandidat {
	return {
		igdbId: 1,
		name: "Bloodborne",
		slug: "bloodborne",
		coverUrl: null,
		releaseDate: "2015-03-24",
		plattformen: ["PS4"],
		typ: "Hauptspiel",
		typId: 0,
		criticScore: 91,
		criticScoreCount: 18,
		versionParent: null,
		parentGame: null,
		...ueberschreiben,
	};
}

describe("normalisiereTreffer", () => {
	it("bildet einen vollstaendigen Treffer ab", () => {
		expect(normalisiereTreffer(spielRoh())).toEqual({
			igdbId: 1001,
			name: "Bloodborne",
			slug: "bloodborne",
			coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/abc123.jpg",
			releaseDate: "2015-03-24",
			plattformen: ["PS4"],
			typ: "Hauptspiel",
			typId: 0,
			criticScore: 91,
			criticScoreCount: 18,
			versionParent: null,
			parentGame: null,
		});
	});

	it("laesst fehlende Werte null - nie 0, nie leer", () => {
		const k = normalisiereTreffer({ id: 7, name: "Ohne alles", platforms: [48] });
		expect(k).toMatchObject({
			coverUrl: null,
			releaseDate: null,
			plattformen: ["PS4"],
			typ: null,
			criticScore: null,
			criticScoreCount: null,
		});
	});

	it("laesst jeden Eintrag ohne PlayStation-Plattform fallen - fremde wie fehlende", () => {
		// 130 = Switch, 6 = PC: nie ein Spiel der Sammlung.
		expect(normalisiereTreffer(spielRoh({ platforms: [130, 6] }))).toBeNull();
		// Fremde neben einer eigenen: bleibt, nur die eigene wird gefuehrt.
		expect(normalisiereTreffer(spielRoh({ platforms: [130, 48] }))).toMatchObject({ plattformen: ["PS4"] });
		// Gar keine Angabe: seit dem 16.09.2026 kein Treffer - so kam ein
		// PC-Eintrag (Divinity: Original Sin II - Divine Edition) als PS4-Wunsch durch.
		expect(normalisiereTreffer(spielRoh({ platforms: undefined }))).toBeNull();
		expect(normalisiereTreffer(spielRoh({ platforms: [] }))).toBeNull();
	});

	it("uebersetzt nur die eigenen Plattformen, PSVR und PSVR2 als PS4 und PS5", () => {
		const k = normalisiereTreffer(spielRoh({ platforms: [6, 9, 46, 48, 165, 167, 390, 130] }));
		expect(k?.plattformen).toEqual(["PS3", "PSVITA", "PS4", "PS5"]);
	});

	it("verwirft Mods, Forks und Updates sowie Eintraege ohne Namen", () => {
		expect(normalisiereTreffer(spielRoh({ game_type: 5 }))).toBeNull();
		expect(normalisiereTreffer(spielRoh({ game_type: 12 }))).toBeNull();
		expect(normalisiereTreffer(spielRoh({ game_type: 14 }))).toBeNull();
		expect(normalisiereTreffer({ id: 3 })).toBeNull();
		expect(normalisiereTrefferliste("kein array")).toEqual([]);
		expect(normalisiereTrefferliste([spielRoh(), spielRoh({ id: 2, game_type: 5 })])).toHaveLength(1);
	});

	it("rundet die Kritikerwertung", () => {
		expect(normalisiereTreffer(spielRoh({ aggregated_rating: 87.5 }))?.criticScore).toBe(88);
	});
});

describe("releaseStatusAus", () => {
	it("unterscheidet erschienen, angekuendigt und unbekannt", () => {
		expect(releaseStatusAus("2015-03-24", "2026-09-14")).toBe("erschienen");
		expect(releaseStatusAus("2026-09-14", "2026-09-14")).toBe("erschienen");
		expect(releaseStatusAus("2027-01-01", "2026-09-14")).toBe("angekuendigt");
		expect(releaseStatusAus(null, "2026-09-14")).toBe("unbekannt");
	});

	it("metadatenAus traegt den Status mit", () => {
		expect(metadatenAus(kandidat({ releaseDate: "2027-01-01" }), "2026-09-14")).toMatchObject({
			igdbId: 1,
			releaseStatus: "angekuendigt",
			criticScore: 91,
		});
	});
});

describe("eindeutigerTreffer", () => {
	it("nimmt den einen Kandidaten mit gleichem Schluessel", () => {
		const k = [kandidat(), kandidat({ igdbId: 2, name: "Bloodborne: The Old Hunters", typId: 2 })];
		expect(eindeutigerTreffer("bloodborne", ["PS4"], k)?.igdbId).toBe(1);
	});

	it("liefert nichts ohne Schluesseltreffer", () => {
		expect(eindeutigerTreffer("outlast 2", ["PS4"], [kandidat({ name: "Outlast II" })])).toBeNull();
		expect(eindeutigerTreffer("bloodborne", ["PS4"], [])).toBeNull();
	});

	it("liefert nichts bei zwei gleichwertigen Kandidaten - die Entscheidung gehoert dem Nutzer", () => {
		const k = [
			kandidat({ igdbId: 1, name: "MediEvil", typId: 8, typ: "Remake" }),
			kandidat({ igdbId: 2, name: "MediEvil", typId: 11, typ: "Portierung" }),
		];
		expect(eindeutigerTreffer("medievil", ["PS4"], k)).toBeNull();
	});

	it("loest Gleichnamige ueber das Jahr aus der Wunschliste, sonst nicht (8.2)", () => {
		const k = [
			kandidat({ igdbId: 1, name: "Layers of Fear", releaseDate: "2016-02-16" }),
			kandidat({ igdbId: 2, name: "Layers of Fear", releaseDate: "2023-06-15" }),
		];
		expect(eindeutigerTreffer("layers of fear", [], k)).toBeNull();
		expect(eindeutigerTreffer("layers of fear", [], k, 2016)?.igdbId).toBe(1);
		// Angrenzendes Jahr zaehlt - der Monat aus der Liste ist geschaetzt.
		expect(eindeutigerTreffer("layers of fear", [], k, 2024)?.igdbId).toBe(2);
		// Zwischen beiden: nichts eindeutig.
		expect(eindeutigerTreffer("layers of fear", [], k, 2019)).toBeNull();
		// Ohne Datum kann ein Kandidat nicht ueber das Jahr gewinnen.
		const ohne = [kandidat({ igdbId: 1, name: "DOOM", releaseDate: null }), kandidat({ igdbId: 2, name: "DOOM", releaseDate: "2016-05-13" })];
		expect(eindeutigerTreffer("doom", [], ohne, 2016)?.igdbId).toBe(2);
	});

	it("zaehlt eine Edition nicht gegen ihr Hauptspiel", () => {
		const k = [
			kandidat({ igdbId: 1, name: "Grand Theft Auto V" }),
			kandidat({ igdbId: 2, name: "Grand Theft Auto V: Special Edition", versionParent: 1 }),
		];
		expect(eindeutigerTreffer("grand theft auto v", ["PS4"], k)?.igdbId).toBe(1);
	});

	it("laesst eine Edition stehen, deren Hauptspiel nicht Kandidat ist", () => {
		const k = [kandidat({ igdbId: 2, name: "Gone Home: Console Edition", versionParent: 99 })];
		expect(eindeutigerTreffer("gone home console", ["PS4"], k)?.igdbId).toBe(2);
	});

	it("zaehlt ein Bundle nicht gegen das Hauptspiel, nimmt es aber allein", () => {
		const bundle = kandidat({ igdbId: 2, name: "Outriders: Complete Edition", typId: 3, typ: "Bundle" });
		expect(eindeutigerTreffer("outriders", ["PS4"], [kandidat({ name: "Outriders" }), bundle])?.igdbId).toBe(1);
		expect(eindeutigerTreffer("outriders", ["PS4"], [bundle])?.igdbId).toBe(2);
	});

	it("verlangt eine gemeinsame Plattform, wenn beide Seiten welche nennen", () => {
		const ps3 = kandidat({ igdbId: 1, name: "Darksiders II", plattformen: ["PS3"] });
		expect(eindeutigerTreffer("darksiders ii", ["PS4"], [ps3])).toBeNull();
		expect(eindeutigerTreffer("darksiders ii", ["PS3"], [ps3])?.igdbId).toBe(1);
		// Fehlende Daten sind kein Gegenbeweis.
		expect(eindeutigerTreffer("darksiders ii", ["PS4"], [kandidat({ name: "Darksiders II", plattformen: [] })])?.igdbId).toBe(1);
		expect(eindeutigerTreffer("darksiders ii", [], [ps3])?.igdbId).toBe(1);
	});
});

describe("ordneKandidaten", () => {
	it("Schluesseltreffer, dann Hauptspiel-artige, dann passende Plattform, dann IGDB-Reihenfolge", () => {
		const k = [
			kandidat({ igdbId: 1, name: "Batman: Arkham Knight - Skin", typId: 13, plattformen: ["PS4"] }),
			kandidat({ igdbId: 2, name: "Batman: Arkham Knight - Season Pass", typId: 3, plattformen: ["PS4"] }),
			kandidat({ igdbId: 3, name: "Batman: Arkham Knight - Premium", typId: 3, plattformen: ["PS3"] }),
			kandidat({ igdbId: 4, name: "Batman: Arkham Knight", typId: 0, plattformen: ["PS4"] }),
			kandidat({ igdbId: 5, name: "Batman: Arkham Knight - Story Pack", typId: 1, plattformen: ["PS4"] }),
		];
		expect(ordneKandidaten("batman arkham knight", ["PS4"], k).map((x) => x.igdbId)).toEqual([4, 2, 3, 1, 5]);
		// Ohne Plattformen des Spiels zaehlt nur Schluessel und Typ.
		expect(ordneKandidaten("batman arkham knight", [], k).map((x) => x.igdbId)).toEqual([4, 2, 3, 1, 5]);
		expect(ordneKandidaten("etwas anderes", ["PS3"], k).map((x) => x.igdbId)).toEqual([3, 2, 4, 1, 5]);
	});
});

describe("kurzbegriff", () => {
	it("schneidet ab ' - ', ':' und '/', laesst Bindestriche im Wort stehen", () => {
		expect(kurzbegriff("CastleStorm - Complete Edition")).toBe("CastleStorm");
		expect(kurzbegriff("Type:Rider")).toBe("Type");
		expect(kurzbegriff("Dead by Daylight 1/3")).toBe("Dead by Daylight 1");
		expect(kurzbegriff("Wake-up Club")).toBe("Wake-up Club");
		expect(kurzbegriff("Island Saver")).toBe("Island Saver");
	});
});

describe("suchbegriff und apicalypseText", () => {
	it("entfernt das Jahr aus der Umbenennung und trennt angeklebte Ziffern", () => {
		expect(suchbegriff("God of War (2018)")).toBe("God of War");
		expect(suchbegriff("Velocity2X")).toBe("Velocity 2X");
		expect(suchbegriff("LittleBigPlanet2")).toBe("LittleBigPlanet 2");
		expect(suchbegriff("Minecraft: PlayStation4 Edition")).toBe("Minecraft: PlayStation 4 Edition");
		expect(suchbegriff("Battlefield 2042")).toBe("Battlefield 2042");
		expect(suchbegriff("No Man's Sky Trophies")).toBe("No Man's Sky");
	});

	it("maskiert Anfuehrungszeichen und Backslash, entfernt Steuerzeichen", () => {
		expect(apicalypseText('Say "Hi" \\ now')).toBe('Say \\"Hi\\" \\\\ now');
		expect(apicalypseText("Zeile\nUmbruch\tTab")).toBe("Zeile Umbruch Tab");
	});
});
