/**
 * Haendlertitel mit der eigenen Sammlung abgleichen (Abschnitt 9.3, Stufe 17b).
 *
 * Eine EAN-Quelle liefert Verkaeufertext, keinen sauberen Spieltitel:
 * "Ps3 / Sony Playstation 3 Game - Darksiders [standard] En/ger Boxed",
 * "Fifa Soccer 12 (bilingual Cover) (playstation3)[pal Compatible]".
 * Den Text zu saeubern hiesse raten. Stattdessen wird von der Sammlung aus
 * geprueft: Kommen alle Worte eines eigenen Titels im Haendlertext vor?
 *
 * Gemessen am 18.09.2026 gegen 56 echte Codes des Nutzers: 35 kannte die
 * Quelle, 22 davon fuehrten so zu genau einem Spiel der Sammlung - ohne
 * Fehlgriff. Ein Code lieferte Zahnpasta ("Colgate Max Fresh Knockout");
 * der Abgleich von der Sammlung aus laesst so etwas ins Leere laufen, statt
 * einen fremden Titel zu uebernehmen.
 */

/** Worte, die in Haendlertiteln stehen und nichts ueber das Spiel sagen. */
const BALLAST = new Set([
	"ps3", "ps4", "ps5", "psvita", "vita", "playstation", "playstation3", "playstation4", "playstation5",
	"sony", "game", "games", "videogame", "videogames", "spiel",
	"pal", "ntsc", "uk", "us", "eu", "import", "german", "germany", "deutsch", "deutsche", "version",
	"edition", "standard", "platinum", "essentials", "classics", "goty",
	"disk", "disc", "box", "boxed", "ovp", "anl", "instructions", "manual",
	"new", "neu", "used", "gebraucht", "sealed", "unsealed", "region", "compatible", "cover", "bilingual",
	"fast", "shipping", "condition", "good", "by", "with", "and", "und", "the", "in", "a", "of", "für", "fur",
	"usk", "pegi", "limited", "special", "complete", "en", "ger",
]);

/** Worte, hinter denen eine blanke Zahl die Plattform meint, nicht den Titel. */
const PLATTFORMWORT = new Set(["playstation", "ps", "sony", "vita", "psvita"]);

/**
 * Roemische Zahlen in Fortsetzungsnummern, auf Ziffern gebracht.
 *
 * Die Sammlung fuehrt "Kingdom Come: Deliverance II", die Verkaeufer
 * schreiben "Kingdom Come Deliverance 2" - ohne diese Tabelle passt der
 * Nachfolger auf keines seiner eigenen Angebote, und das Grundspiel gewinnt
 * (Fehlgriff beim Regal-Durchgang am 21.09.2026).
 *
 * `v` und `x` fehlen mit Absicht: Sie sind auch gewoehnliche Buchstaben
 * ("Mega Man X" meint kein "Mega Man 10"), und die Messung zeigte keinen
 * Gewinn durch sie.
 */
const ROEMISCH: Record<string, string> = {
	ii: "2",
	iii: "3",
	iv: "4",
	vi: "6",
	vii: "7",
	viii: "8",
	ix: "9",
};

/**
 * Kleinschreibung, nur Buchstaben und Ziffern, Ballast raus - und danach
 * Buchstaben-Ziffern-Grenzen getrennt: "LittleBigPlanet2" wird zu
 * "littlebigplanet" + "2".
 *
 * Die Reihenfolge ist entscheidend und gemessen (21.09.2026): Wird zuerst
 * getrennt, zerfaellt auch "ps3" zu "ps" + "3" - die Ziffer 3 staende dann
 * in jedem Haendlertitel, und ein Angebot "Killzone PS3" wuerde zu
 * "Killzone 3". Ballast zuerst zu entfernen schliesst das aus, behebt aber
 * den echten Fall: Die Sammlung fuehrt "LittleBigPlanet2" zusammen, eBay
 * schreibt "LittleBigPlanet 2", und ohne Trennung gewann das Grundspiel -
 * der einzige Fehlgriff in der Messung gegen 34 bekannte Codes.
 */
export function worteAus(text: string): Set<string> {
	const roh = text
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^\p{Letter}\p{Number}]+/gu, " ")
		.trim()
		.split(/\s+/);

	const worte = new Set<string>();
	for (const [i, wort] of roh.entries()) {
		if (wort === "" || BALLAST.has(wort)) continue;
		// "Sony PlayStation 3" laesst sonst eine blanke 3 stehen, und die
		// passt auf "Killzone 3" - ein Angebot fuer Killzone 1 waere damit
		// der falsche Treffer. Eine Zahl direkt hinter einem Plattformwort
		// gehoert zur Plattform, nicht zum Titel.
		if (PLATTFORMWORT.has(roh[i - 1] ?? "") && /^\p{Number}+$/u.test(wort)) continue;
		for (const teil of wort.replace(/(\p{Letter})(\p{Number})/gu, "$1 $2").replace(/(\p{Number})(\p{Letter})/gu, "$1 $2").split(" ")) {
			if (teil !== "" && !BALLAST.has(teil)) worte.add(ROEMISCH[teil] ?? teil);
		}
	}
	return worte;
}

/** Ein Spiel der Sammlung, so viel wie der Abgleich braucht. */
export type SammlungsSpiel = { spielId: number; titel: string };

/** Ein Spiel mit zerlegtem Titel. */
export type VorbereitetesSpiel<T extends SammlungsSpiel> = { spiel: T; worte: Set<string> };

/**
 * Die Sammlung einmal zerlegen, nicht je Code neu: Bei 430 Spielen und 56
 * offenen Scans waeren das sonst 24 000 Zerlegungen in einem Aufruf - weit
 * ueber dem 10-ms-Budget des Workers (CLAUDE.md, CPU-Grenze).
 */
export function vorbereiten<T extends SammlungsSpiel>(spiele: readonly T[]): VorbereitetesSpiel<T>[] {
	return spiele.map((spiel) => ({ spiel, worte: worteAus(spiel.titel) })).filter(({ worte }) => worte.size > 0);
}

export type Sammlungstreffer<T extends SammlungsSpiel> = {
	/** Passende Spiele, das mit den meisten Worten zuerst. */
	treffer: T[];
	/**
	 * Genau ein sinnvolles Ziel? Ja, wenn nur eines passt - oder wenn der
	 * laengste Treffer die kuerzeren vollstaendig enthaelt: "Killzone 3"
	 * schlaegt "Killzone", "Batman: Arkham Asylum" schlaegt "Batman".
	 */
	eindeutig: boolean;
};

/** Welche Spiele der Sammlung stecken im Haendlertitel? */
export function sammlungstreffer<T extends SammlungsSpiel>(
	haendlertitel: string,
	sammlung: readonly VorbereitetesSpiel<T>[],
): Sammlungstreffer<T> {
	const imText = worteAus(haendlertitel);
	if (imText.size === 0) return { treffer: [], eindeutig: false };

	const passend = sammlung
		.filter(({ worte }) => [...worte].every((w) => imText.has(w)))
		.sort((a, b) => b.worte.size - a.worte.size);

	if (passend.length === 0) return { treffer: [], eindeutig: false };
	const bester = passend[0].worte;
	// Echte Mehrdeutigkeit nur, wenn ein weiterer Treffer nicht im besten aufgeht.
	const eindeutig = passend.slice(1).every(({ worte }) => [...worte].every((w) => bester.has(w)) && worte.size < bester.size);
	return { treffer: passend.map((p) => p.spiel), eindeutig };
}

/**
 * Mehrere Angebote zu EINEM Code auf ein Ziel bringen (Stufe 17c).
 *
 * eBay liefert je Barcode bis zu zehn Verkaeuferangebote. Einzeln betrachtet
 * genuegt eines, um danebenzugreifen: Ein Buendel ("Red Dead Redemption +
 * GTA IV") oder ein Cross-Sell nennt ein Spiel, das mit dem Code nichts zu
 * tun hat. Gemessen am 21.09.2026 brachte das drei Fehlgriffe.
 *
 * Deshalb zaehlt hier die Mehrheit: Ein Spiel gilt nur, wenn es in mehr als
 * der Haelfte der eindeutigen Angebotstreffer steckt und oefter als jedes
 * andere. Ein Buendel steht in einem von zehn Angeboten und faellt heraus.
 * Mit nur einem Angebot (upcitemdb liefert genau einen Titel) verhaelt sich
 * die Funktion wie `sammlungstreffer`.
 *
 * Dazu braucht der Sieger **Rueckhalt**: Ab drei Angeboten muessen ihn
 * mindestens zwei nennen. Sonst gewinnt ein Alleinkandidat auch dann, wenn
 * ihn nur ein einziges von zehn Angeboten stuetzt - genau so wurde am
 * 21.09.2026 aus einem Buendel ("GTA 4 + 5 Red Dead Redemption") ein
 * Vorschlag fuer GTA, waehrend das eigentliche Spiel in zwei Fassungen mit
 * Jahreszahl in der Sammlung steht und deshalb auf keines seiner Angebote
 * passte. Lieber kein Vorschlag als ein falscher: Ohne Ziel zeigt die
 * Oberflaeche die Suche, und der Nutzer entscheidet.
 */
/**
 * Ab so vielen Angeboten braucht der Sieger mindestens zwei Nennungen.
 * Bei einem oder zwei Angeboten waere das die falsche Haerte - upcitemdb
 * liefert genau einen Titel, und viele Codes haben nur ein Angebot.
 */
export const MINDESTENS_ZWEI_AB = 2;

export function mehrheitstreffer<T extends SammlungsSpiel>(
	haendlertitel: readonly string[],
	sammlung: readonly VorbereitetesSpiel<T>[],
): { spiel: T | null; angebote: number } {
	const jeSpiel = new Map<number, { spiel: T; anzahl: number }>();
	for (const titel of haendlertitel) {
		const { treffer, eindeutig } = sammlungstreffer(titel, sammlung);
		if (!eindeutig || treffer.length === 0) continue;
		const bisher = jeSpiel.get(treffer[0].spielId);
		if (bisher) bisher.anzahl++;
		else jeSpiel.set(treffer[0].spielId, { spiel: treffer[0], anzahl: 1 });
	}

	const sortiert = [...jeSpiel.values()].sort((a, b) => b.anzahl - a.anzahl);
	if (sortiert.length === 0) return { spiel: null, angebote: 0 };
	if (haendlertitel.length > MINDESTENS_ZWEI_AB && sortiert[0].anzahl < 2) {
		return { spiel: null, angebote: sortiert[0].anzahl };
	}
	if (sortiert.length === 1) return { spiel: sortiert[0].spiel, angebote: sortiert[0].anzahl };

	const gesamt = sortiert.reduce((summe, e) => summe + e.anzahl, 0);
	const [erster, zweiter] = sortiert;
	if (erster.anzahl > gesamt / 2 && erster.anzahl > zweiter.anzahl) {
		return { spiel: erster.spiel, angebote: erster.anzahl };
	}
	return { spiel: null, angebote: erster.anzahl };
}

/**
 * Der Titel, der die Mehrheit gebracht hat - er wird als `title_raw`
 * gespeichert, damit die Ansicht "Offene Scans" denselben Abgleich beim
 * Lesen wiederholen kann (9.3). Ohne Mehrheit der erste Titel: Auch ein
 * Titel ohne Treffer in der Sammlung ist die Vorlage zum Anlegen.
 */
export function bestertitel<T extends SammlungsSpiel>(
	haendlertitel: readonly string[],
	sammlung: readonly VorbereitetesSpiel<T>[],
): string | null {
	const { spiel } = mehrheitstreffer(haendlertitel, sammlung);
	if (spiel) {
		const passend = haendlertitel.find((t) => {
			const { treffer, eindeutig } = sammlungstreffer(t, sammlung);
			return eindeutig && treffer[0]?.spielId === spiel.spielId;
		});
		if (passend) return passend;
	}
	return haendlertitel[0] ?? null;
}
