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

/** Kleinschreibung, nur Buchstaben und Ziffern, Ballast raus. */
export function worteAus(text: string): Set<string> {
	const roh = text
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^\p{Letter}\p{Number}]+/gu, " ")
		.trim()
		.split(/\s+/);
	return new Set(roh.filter((w) => w !== "" && !BALLAST.has(w)));
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
