/**
 * Nachgebaute PSN-Antworten.
 *
 * Die echten Rohdaten waeren besseres Material - sie liegen in der
 * Produktionsdatenbank. Sie enthalten aber die vollstaendige Spielhistorie des
 * Nutzers samt Zeitstempeln, und dieses Repository ist oeffentlich. Dieselbe
 * Regel wie beim Datenbank-Dump aus Abschnitt 15.1, nur weniger offensichtlich.
 *
 * Nachgebildet sind die Formen, die in den echten 431 Titeln vorkommen:
 * kommagetrennte Plattformen bei Cross-Gen-Titeln, Titel ohne definierte
 * Platin-Trophaee, 0 % und 100 %, trophy und trophy2.
 */

export type FakeTitel = {
	npCommunicationId: string;
	npServiceName: string;
	trophyTitleName: string;
	trophyTitlePlatform: string;
	trophyTitleIconUrl: string;
	definedTrophies: { bronze: number; silver: number; gold: number; platinum: number };
	earnedTrophies: { bronze: number; silver: number; gold: number; platinum: number };
	progress: number;
	lastUpdatedDateTime: string;
	hiddenFlag: boolean;
	trophySetVersion: string;
	hasTrophyGroups: boolean;
	trophyGroupCount: number;
};

export function fakeTitel(nr: number, ueberschreiben: Partial<FakeTitel> = {}): FakeTitel {
	return {
		npCommunicationId: `NPWR${String(nr).padStart(5, "0")}_00`,
		npServiceName: "trophy",
		trophyTitleName: `Testspiel ${nr}`,
		trophyTitlePlatform: "PS4",
		trophyTitleIconUrl: `https://beispiel.invalid/${nr}.png`,
		definedTrophies: { bronze: 30, silver: 8, gold: 3, platinum: 1 },
		earnedTrophies: { bronze: 15, silver: 4, gold: 1, platinum: 0 },
		progress: 45,
		lastUpdatedDateTime: "2025-03-14T09:12:00Z",
		hiddenFlag: false,
		trophySetVersion: "01.00",
		hasTrophyGroups: false,
		trophyGroupCount: 1,
		...ueberschreiben,
	};
}

export function fakeSeite(titel: FakeTitel[], total = titel.length, offset = 0): string {
	return JSON.stringify({
		trophyTitles: titel,
		nextOffset: offset + titel.length < total ? offset + titel.length : null,
		totalItemCount: total,
	});
}

/** Die Sonderfaelle, die in den echten Daten tatsaechlich vorkommen. */
export const SONDERFAELLE = {
	/** Cross-Gen: eine Trophaeenliste fuer drei Plattformen. */
	crossGen: fakeTitel(1, { trophyTitlePlatform: "PS3,PSVITA,PS4" }),

	/** 93 von 431 echten Titeln definieren keine Platin-Trophaee. */
	ohnePlatin: fakeTitel(2, {
		definedTrophies: { bronze: 12, silver: 0, gold: 0, platinum: 0 },
		earnedTrophies: { bronze: 12, silver: 0, gold: 0, platinum: 0 },
		progress: 100,
	}),

	/** Platin erspielt. */
	mitPlatin: fakeTitel(3, {
		npServiceName: "trophy2",
		trophyTitlePlatform: "PS5",
		definedTrophies: { bronze: 30, silver: 8, gold: 3, platinum: 1 },
		earnedTrophies: { bronze: 30, silver: 8, gold: 3, platinum: 1 },
		progress: 100,
	}),

	/** Nie angespielt. */
	unberuehrt: fakeTitel(4, {
		earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
		progress: 0,
		lastUpdatedDateTime: "2019-11-02T20:00:00Z",
	}),

	/** Plattform ausserhalb der Sammlung. */
	fremdePlattform: fakeTitel(5, { trophyTitlePlatform: "PS5,PSPC" }),
};
