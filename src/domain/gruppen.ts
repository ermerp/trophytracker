import {
	anzeigeTitel,
	plattformenAus,
	titelSchluessel,
	vorgeschlagenePlattform,
	istErlaubtePlattform,
	type Plattform,
} from "./titel";

/**
 * Gruppiert Trophaeenlisten zu Spielen.
 *
 * Eine Gruppe wird ein `game` mit einem `release` je Liste. GTA V hat drei
 * Listen (PS3/PS4/PS5) und wird ein Spiel mit drei Releases - so beschreibt es
 * Abschnitt 3 woertlich.
 *
 * Reine Funktion. Die Stelle, an der sich die Datenqualitaet entscheidet:
 * Gruppiert sie zu grob, verschmelzen verschiedene Spiele; zu fein, entstehen
 * Dubletten. Getestet gegen die Formen der echten 431 Titel.
 */

export type TrophyEintrag = {
	np_communication_id: string;
	title_name: string;
	platform: string;
	progress_pct: number;
	defined_bronze: number;
	defined_silver: number;
	defined_gold: number;
	defined_platinum: number;
	earned_platinum: number;
	icon_url: string | null;
};

/**
 * Troph
aeenstruktur als Vergleichsmerkmal.
 *
 * Ein portiertes Spiel behaelt seine Liste, ein Remake bekommt eine neue.
 * Gemessen an der echten Sammlung trennt das zuverlaessig: Shadow of the
 * Colossus PS3 18/6/6/1 gegen PS4 25/7/5/1, Uncharted PS3 36/8/3/1 gegen PS4
 * 41/8/4/1 - jeweils verschiedene Spiele.
 *
 * Es ist aber nur ein Hinweis, kein Beweis: GTA V hat auf PS3 47/8/3/1 und auf
 * PS4/PS5 59/15/3/1, weil die neueren Fassungen Online-Troph
aeen brachten -
 * und ist trotzdem ein Spiel.
 */
function struktur(e: TrophyEintrag): string {
	return `${e.defined_bronze}/${e.defined_silver}/${e.defined_gold}/${e.defined_platinum}`;
}

export type ReleaseVorschlag = {
	npCommunicationId: string;
	rohTitel: string;
	/** Der volle Wert von PSN, etwa "PS3,PSVITA,PS4". */
	plattformRoh: string;
	/** Vorauswahl: die neueste erfassbare Plattform. */
	vorschlag: Plattform | null;
	/** Alle erfassbaren Plattformen dieser Liste, zur Auswahl. */
	alternativen: Plattform[];
	/** Eine Liste fuer mehrere Plattformen - Sony teilt den Fortschritt. */
	geteilt: boolean;
	fortschritt: number;
	hatPlatin: boolean;
	symbol: string | null;
	/** Bronze/Silber/Gold/Platin der definierten Troph
aeen. */
	struktur: string;
};

export type Gruppenvorschlag = {
	schluessel: string;
	/** Vorschlag fuer game.title, aenderbar in der Oberflaeche. */
	titel: string;
	releases: ReleaseVorschlag[];
	/** Gesetzt, wenn ein aehnlich benannter Titel getrennt vorgeschlagen wird. */
	hinweis?: string;
};

function alsReleaseVorschlag(e: TrophyEintrag): ReleaseVorschlag {
	const alternativen = plattformenAus(e.platform).filter(istErlaubtePlattform);
	return {
		npCommunicationId: e.np_communication_id,
		rohTitel: e.title_name,
		plattformRoh: e.platform,
		vorschlag: vorgeschlagenePlattform(e.platform),
		alternativen,
		geteilt: alternativen.length > 1,
		fortschritt: e.progress_pct,
		hatPlatin: e.defined_platinum > 0 && e.earned_platinum > 0,
		symbol: e.icon_url,
		struktur: struktur(e),
	};
}

/**
 * Waehlt den Titelvorschlag einer Gruppe: der kuerzeste bereinigte Name.
 *
 * Das trifft in den echten Daten das Richtige - aus "Game of Thrones
 * trophies" und "Game of Thrones" wird der zweite gewaehlt.
 */
function gruppenTitel(eintraege: TrophyEintrag[]): string {
	return eintraege
		.map((e) => anzeigeTitel(e.title_name))
		.reduce((a, b) => (b.length < a.length ? b : a));
}

/**
 * Trennt eine Gruppe auf, in der zwei Listen dieselbe Plattform beanspruchen.
 *
 * UNIQUE (game_id, platform, edition, region) laesst das nicht zu, und
 * meistens sind es tatsaechlich verschiedene Spiele: In den echten Daten
 * trifft es "Call of Duty Modern Warfare" (2019) und "Call of Duty: Modern
 * Warfare Remastered" (2016), die der Editionsfilter faelschlich zusammenzieht.
 *
 * Getrennt vorzuschlagen ist der sichere Weg: Es scheitert nie, und
 * Abschnitt 7.2 verlangt ohnehin, Mehrdeutiges vorzulegen statt zu raten.
 * Beide Teile bekommen einen Hinweis auf den jeweils anderen.
 */
function trenneKollisionen(
	schluessel: string,
	eintraege: TrophyEintrag[],
): Gruppenvorschlag[] {
	const belegt = new Set<string>();
	const kollidiert = eintraege.some((e) => {
		const p = vorgeschlagenePlattform(e.platform) ?? "?";
		if (belegt.has(p)) return true;
		belegt.add(p);
		return false;
	});

	if (!kollidiert) {
		const strukturen = new Set(eintraege.map(struktur));
		return [
			{
				schluessel,
				titel: gruppenTitel(eintraege),
				releases: eintraege.map(alsReleaseVorschlag),
				hinweis:
					strukturen.size > 1
						? "Die Trophäenlisten unterscheiden sich in ihrem Aufbau " +
							`(${[...strukturen].join(" gegen ")}). Das deutet auf ein Remake oder ` +
							"ein anderes Spiel hin – kann aber auch an später ergänzten Trophäen liegen. " +
							"Bitte prüfen."
						: undefined,
			},
		];
	}

	return eintraege.map((e, i) => ({
		schluessel: `${schluessel}#${i}`,
		titel: anzeigeTitel(e.title_name),
		releases: [alsReleaseVorschlag(e)],
		hinweis:
			"Ähnlich benannter Titel auf derselben Plattform – getrennt vorgeschlagen. " +
			"Falls es dasselbe Spiel ist, ordne die zweite Liste danach von Hand zu.",
	}));
}

/** Gruppiert und sortiert nach Titel. */
export function bildeGruppen(eintraege: TrophyEintrag[]): Gruppenvorschlag[] {
	const nachSchluessel = new Map<string, TrophyEintrag[]>();
	for (const e of eintraege) {
		const k = titelSchluessel(e.title_name);
		const vorhanden = nachSchluessel.get(k);
		if (vorhanden) vorhanden.push(e);
		else nachSchluessel.set(k, [e]);
	}

	const gruppen: Gruppenvorschlag[] = [];
	for (const [k, liste] of nachSchluessel) {
		gruppen.push(...trenneKollisionen(k, liste));
	}

	return gruppen.sort((a, b) => a.titel.localeCompare(b.titel, "de"));
}
