import { describe, it, expect } from "vitest";
import { bildeGruppen, type TrophyEintrag } from "../src/domain/gruppen";

type Struktur = { b?: number; s?: number; g?: number; p?: number };

function eintrag(
	titel: string,
	platform: string,
	struktur: Struktur = {},
	np = titel.replace(/\W/g, "").slice(0, 10) + platform,
): TrophyEintrag {
	return {
		np_communication_id: np,
		title_name: titel,
		platform,
		progress_pct: 50,
		defined_bronze: struktur.b ?? 30,
		defined_silver: struktur.s ?? 8,
		defined_gold: struktur.g ?? 3,
		defined_platinum: struktur.p ?? 1,
		earned_platinum: 0,
		icon_url: null,
	};
}

describe("bildeGruppen", () => {
	it("fasst dasselbe Spiel auf drei Plattformen zu einer Gruppe zusammen", () => {
		const g = bildeGruppen([
			eintrag("Grand Theft Auto V", "PS3"),
			eintrag("Grand Theft Auto V", "PS4"),
			eintrag("Grand Theft Auto V", "PS5"),
		]);

		expect(g).toHaveLength(1);
		expect(g[0].titel).toBe("Grand Theft Auto V");
		expect(g[0].releases.map((r) => r.vorschlag).sort()).toEqual(["PS3", "PS4", "PS5"]);
	});

	it("kombiniert getrennte und geteilte Listen desselben Spiels", () => {
		// Der echte Fall Hotline Miami 2: eine PS5-Liste, eine fuer PS3+Vita+PS4.
		const g = bildeGruppen([
			eintrag("Hotline Miami 2: Wrong Number", "PS5"),
			eintrag("Hotline Miami 2: Wrong Number", "PS3,PSVITA,PS4"),
		]);

		expect(g).toHaveLength(1);
		expect(g[0].releases.map((r) => r.vorschlag).sort()).toEqual(["PS4", "PS5"]);
		expect(g[0].releases.find((r) => r.geteilt)?.alternativen).toEqual([
			"PS3",
			"PSVITA",
			"PS4",
		]);
	});

	it("waehlt den kuerzesten Namen als Spieltitel", () => {
		const g = bildeGruppen([
			eintrag("Game of Thrones trophies", "PS3"),
			eintrag("Game of Thrones", "PS4"),
		]);
		expect(g[0].titel).toBe("Game of Thrones");
	});

	it("fuehrt eine Edition mit dem Grundspiel zusammen", () => {
		const g = bildeGruppen([
			eintrag("BioShock Infinite", "PS3"),
			eintrag("BioShock Infinite: The Complete Edition", "PS4"),
		]);
		expect(g).toHaveLength(1);
	});

	// Der Fall, der die Migration gesprengt haette: zwei verschiedene Spiele,
	// die der Editionsfilter zusammenzieht - beide auf PS4. Als ein Spiel mit
	// zwei PS4-Releases wuerde UNIQUE(game_id, platform, ...) verletzt.
	it("trennt zwei Listen, die dieselbe Plattform beanspruchen", () => {
		// Editionszusaetze werden weiterhin abgeschnitten - hier landen also
		// beide auf demselben Schluessel und derselben Plattform.
		const g = bildeGruppen([
			eintrag("BioShock Infinite", "PS4"),
			eintrag("BioShock Infinite: The Complete Edition", "PS4"),
		]);

		expect(g).toHaveLength(2);
		expect(g.every((x) => x.releases.length === 1)).toBe(true);
		expect(g.every((x) => x.hinweis)).toBe(true);
	});

	it("trennt Remaster und Original nicht mehr per Kollision, sondern per Titel", () => {
		const g = bildeGruppen([
			eintrag("Call of Duty Modern Warfare", "PS4"),
			eintrag("Call of Duty: Modern Warfare Remastered", "PS4"),
		]);

		// Verschiedene Schluessel: zwei eigenstaendige Gruppen, kein Hinweis noetig.
		expect(g).toHaveLength(2);
		expect(g.every((x) => x.hinweis === undefined)).toBe(true);
	});

	it("warnt bei abweichender Trophaeenstruktur", () => {
		// Der echte Fall Shadow of the Colossus: PS3 18/6/6/1, PS4 25/7/5/1.
		const g = bildeGruppen([
			eintrag("Shadow of the Colossus", "PS3", { b: 18, s: 6, g: 6, p: 1 }),
			eintrag("Shadow of the Colossus", "PS4", { b: 25, s: 7, g: 5, p: 1 }),
		]);

		expect(g).toHaveLength(1);
		expect(g[0].hinweis).toMatch(/Aufbau/);
		expect(g[0].hinweis).toContain("18/6/6/1");
	});

	it("warnt nicht bei gleicher Struktur", () => {
		const g = bildeGruppen([
			eintrag("The Witcher 3: Wild Hunt", "PS4", { b: 68, s: 8, g: 2, p: 1 }),
			eintrag("The Witcher 3: Wild Hunt", "PS5", { b: 68, s: 8, g: 2, p: 1 }),
		]);

		expect(g[0].hinweis).toBeUndefined();
	});

	it("gibt die Struktur je Release mit aus", () => {
		const g = bildeGruppen([eintrag("Bloodborne", "PS4", { b: 30, s: 8, g: 3, p: 1 })]);
		expect(g[0].releases[0].struktur).toBe("30/8/3/1");
	});

	it("erzeugt nie eine Gruppe mit doppelter Plattform", () => {
		const g = bildeGruppen([
			eintrag("Spiel A", "PS4"),
			eintrag("Spiel A", "PS4"),
			eintrag("Spiel A", "PS5"),
		]);

		for (const gruppe of g) {
			const p = gruppe.releases.map((r) => r.vorschlag);
			expect(new Set(p).size).toBe(p.length);
		}
	});

	it("kennzeichnet geteilte Listen", () => {
		const g = bildeGruppen([eintrag("Bombing Buster", "PSVITA,PS4")]);
		const r = g[0].releases[0];

		expect(r.geteilt).toBe(true);
		expect(r.vorschlag).toBe("PS4");
		expect(r.alternativen).toEqual(["PSVITA", "PS4"]);
	});

	it("kennzeichnet eine Einzelplattform nicht als geteilt", () => {
		expect(bildeGruppen([eintrag("Bloodborne", "PS4")])[0].releases[0].geteilt).toBe(false);
	});

	it("behaelt den Rohtitel je Release", () => {
		const g = bildeGruppen([
			eintrag("Game of Thrones trophies", "PS3"),
			eintrag("Game of Thrones", "PS4"),
		]);
		expect(g[0].releases.map((r) => r.rohTitel).sort()).toEqual([
			"Game of Thrones",
			"Game of Thrones trophies",
		]);
	});

	it("sortiert nach Titel", () => {
		const g = bildeGruppen([eintrag("Zulu", "PS4"), eintrag("Alpha", "PS4")]);
		expect(g.map((x) => x.titel)).toEqual(["Alpha", "Zulu"]);
	});

	it("kommt mit einer leeren Eingabe zurecht", () => {
		expect(bildeGruppen([])).toEqual([]);
	});
});
