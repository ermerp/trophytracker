import { describe, expect, it } from "vitest";
import { plattformZurListe } from "../src/domain/titel";
import { aehnlicherTitel, aehnlicheWuensche, jahrWeichtAb } from "../src/domain/wunschliste";
import { suchWoerter } from "../src/domain/igdb";
import { plattformZurListe as plattformZurListeFrontend } from "../frontend/src/plattformwahl";

/**
 * Nachtrag f1a (8.2): Plattform-Vorschlag nach dem Datum der Liste und die
 * Jahresabweichung, die einen Titeltreffer zur Durchsicht schickt. Reine
 * Regeln ohne Datenbank; Abgleich und Uebernahme pruefen
 * `wunschliste-import-route.spec.ts`.
 */

describe("plattformZurListe", () => {
	it("nimmt bei einer Liste aus der PS4-Zeit PS4, auch wenn es das Spiel fuer PS5 gibt", () => {
		expect(plattformZurListe(["PS4", "PS5"], "2018-05")).toBe("PS4");
	});

	it("nimmt PS5 ab dem Monat, in dem es sie gab", () => {
		expect(plattformZurListe(["PS4", "PS5"], "2020-10")).toBe("PS4");
		expect(plattformZurListe(["PS4", "PS5"], "2020-11")).toBe("PS5");
	});

	it("liest ein Jahr ohne Monat als dessen Januar", () => {
		expect(plattformZurListe(["PS4", "PS5"], "2020")).toBe("PS4");
		expect(plattformZurListe(["PS4", "PS5"], "2021")).toBe("PS5");
	});

	it("bleibt ohne Datum bei der neuesten", () => {
		expect(plattformZurListe(["PS4", "PS5"], null)).toBe("PS5");
	});

	it("faellt auf die neueste zurueck, wenn es zur Zeit der Liste keine der Plattformen gab", () => {
		expect(plattformZurListe(["PS5"], "2019-06")).toBe("PS5");
	});

	it("laesst fremde Plattformen weg und gibt ohne erlaubte null", () => {
		expect(plattformZurListe(["Switch", "PS3"], "2018")).toBe("PS3");
		expect(plattformZurListe(["Switch"], "2018")).toBeNull();
	});

	it("sagt im Frontend dasselbe wie im Worker", () => {
		const listen = [["PS4", "PS5"], ["PS5"], ["PS3", "PSVITA"], ["PS3", "PS4"], ["PSVITA"], ["Switch"], []];
		const daten = [null, "2007", "2012-01", "2012-02", "2013-10", "2013-11", "2018", "2020-10", "2020-11", "2021-03", "unsinn"];
		for (const l of listen) {
			for (const d of daten) expect([l, d, plattformZurListeFrontend(l, d) || null]).toEqual([l, d, plattformZurListe(l, d)]);
		}
	});
});

describe("jahrWeichtAb", () => {
	it("schlaegt bei mehr als einem Jahr Abstand an, in beide Richtungen", () => {
		expect(jahrWeichtAb("2017-10", "2012-05-22")).toBe(true);
		expect(jahrWeichtAb("2016", "2023-03-24")).toBe(true);
	});

	it("laesst das angrenzende Jahr durch - Listenmonate sind geschaetzt", () => {
		expect(jahrWeichtAb("2017-12", "2018-01-26")).toBe(false);
		expect(jahrWeichtAb("2017", "2016-11-01")).toBe(false);
	});

	it("hat ohne eines der beiden Daten nichts abzuwaegen", () => {
		expect(jahrWeichtAb(null, "2012-05-22")).toBe(false);
		expect(jahrWeichtAb("2017", null)).toBe(false);
	});
});

describe("suchWoerter (f1b)", () => {
	it("schreibt wie IGDBs Slug: klein, ohne Apostroph, getrennt an Satzzeichen", () => {
		expect(suchWoerter("Marvel's Wol")).toEqual(["marvels", "wol"]);
		expect(suchWoerter("marvels wol")).toEqual(["marvels", "wol"]);
		expect(suchWoerter("Star Wars: Galac")).toEqual(["star", "wars", "galac"]);
	});

	it("streift Akzente ab und laesst nur Buchstaben und Ziffern durch", () => {
		expect(suchWoerter('Pokémon "Sun" *')).toEqual(["pokemon", "sun"]);
	});

	it("nimmt jedes Wort einmal und hoechstens sechs", () => {
		expect(suchWoerter("a a b c d e f g")).toEqual(["a", "b", "c", "d", "e", "f"]);
		expect(suchWoerter(" :: ")).toEqual([]);
	});
});

describe("aehnlicherTitel (f1b)", () => {
	it("findet eine Edition desselben Spiels", () => {
		expect(aehnlicherTitel("Marvel's Wolverine", "Marvel's Wolverine: Digital Deluxe Edition")).toBe(true);
	});

	it("findet einen Titel, der mit dem anderen beginnt", () => {
		expect(aehnlicherTitel("The Wolf Among Us", "The Wolf Among Us Remastered")).toBe(true);
	});

	it("haelt Fortsetzungen auseinander - Ziffer oder roemische Zahl", () => {
		expect(aehnlicherTitel("The Wolf Among Us", "The Wolf Among Us 2")).toBe(false);
		expect(aehnlicherTitel("Dragon's Dogma", "Dragon's Dogma II")).toBe(false);
		expect(aehnlicherTitel("Anno", "Anno 1800")).toBe(false);
	});

	it("findet nichts zwischen verschiedenen Spielen und bei leerem Titel", () => {
		expect(aehnlicherTitel("Dragon's Dogma: Dark Arisen", "Dragon's Dogma II: Dark Arisen")).toBe(false);
		expect(aehnlicherTitel("Bloodborne", "Blood of Dawnwalker")).toBe(false);
		expect(aehnlicherTitel("", "Bloodborne")).toBe(false);
	});
});

describe("aehnlicheWuensche (f1b)", () => {
	const wuensche = [
		{ id: 1, titel: "Marvel's Wolverine: Digital Deluxe Edition", plattform: "PS5" },
		{ id: 2, titel: null, plattform: null },
		{ id: 3, titel: "Marvel's Wolverine", plattform: "PS4" },
	];

	it("nennt Titel und Plattform der aehnlichen und uebergeht Eintraege ohne Titel", () => {
		expect(aehnlicheWuensche("Marvel's Wolverine", wuensche)).toEqual([
			{ titel: "Marvel's Wolverine: Digital Deluxe Edition", plattform: "PS5" },
			{ titel: "Marvel's Wolverine", plattform: "PS4" },
		]);
	});

	it("laesst den eigenen Wunsch weg", () => {
		expect(aehnlicheWuensche("Marvel's Wolverine", wuensche, 3)).toEqual([{ titel: "Marvel's Wolverine: Digital Deluxe Edition", plattform: "PS5" }]);
	});
});
