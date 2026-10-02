import { sammlungstreffer, worteAus, type SammlungsSpiel, type VorbereitetesSpiel } from "./scan-titel";
import type { Plattform } from "./titel";

/**
 * Gebrauchtangebote einem Release zuordnen (Abschnitt 7.3, Stufe 20).
 *
 * Die Quelle ist die eBay Browse API, die seit Stufe 17c fuer die
 * EAN-Aufloesung laeuft. Dort wird nach einem Barcode gefragt und die
 * Sammlung gesucht; hier ist es umgekehrt - das Release steht fest, gesucht
 * wird sein guenstigstes Angebot. Der Abgleich bleibt derselbe
 * (`sammlungstreffer`), weil eBays Relevanzsortierung keine Zuordnung ist:
 * Gemessen am 02.10.2026 ueber alle 490 Releases waere der roh guenstigste
 * Markttreffer in 21 % der Faelle ein anderes Spiel gewesen.
 *
 * Drei Bedingungen muessen zusammenkommen, alle drei gegen den echten
 * Bestand gemessen:
 *
 * 1. `sammlungstreffer` findet genau dieses Spiel und ist eindeutig.
 * 2. Der Titel nennt keine ANDERE PlayStation-Plattform. eBays Aspekt
 *    `Plattform` ist verkaeufergepflegt und manchmal falsch - gemessen bei
 *    Borderlands 2 (PS3-Disc als PS4 getaggt) und Cyberpunk 2077.
 * 3. Das Angebot traegt hoechstens `zusatzwortGrenze` Worte, die im eigenen
 *    Titel nicht vorkommen.
 */

/**
 * eBays strukturierter Aspekt fuer die Plattform. Er kennt auch "Keine
 * Angabe" - ein Angebot ohne Plattformangabe faellt damit heraus, genau wie
 * Abschnitt 7.6 es fuer jede Fremdquelle verlangt: fehlende Angabe ist kein
 * "vielleicht". Gegenprobe am 02.10.2026: PS5-Aspekt auf ein PS4-Spiel
 * liefert 0 Treffer.
 */
export const EBAY_ASPEKT_PLATTFORM: Record<Plattform, string> = {
	PS3: "Sony PlayStation 3",
	PS4: "Sony PlayStation 4",
	PS5: "Sony PlayStation 5",
	PSVITA: "Sony PlayStation Vita",
};

/** eBay-Kategorie "Videospiele" auf dem deutschen Marktplatz. */
export const EBAY_KATEGORIE_SPIELE = "139973";

/**
 * Die beiden Haendler, deren Produktdatenfeed ueber AWIN nicht zu bekommen
 * war (7.3) - sie verkaufen ihren Bestand selbst ueber eBay. Ihr Name wird
 * zur Beschriftung: "ab 12,77 EUR bei rebuy".
 */
export const HAENDLER_VERKAEUFER: Record<string, string> = {
	"rebuy-shop": "rebuy",
	medimops_shop: "medimops",
};

/** Zustandsstufen, die als "gebraucht" gelten (eBay conditionIds). */
export const EBAY_ZUSTAENDE_GEBRAUCHT = ["5000", "4000", "3000", "2750", "2500"] as const;

export type MarktAngebot = {
	titel: string;
	preisCents: number;
	zustand: string | null;
	verkaeufer: string | null;
	url: string | null;
};

/** 'haendler' = rebuy/medimops, 'markt' = alle Verkaeufer. Zwei Zeilen je Release, hoechstens. */
export type MarktKanal = "haendler" | "markt";

const PLATTFORM_IM_TEXT: Record<Plattform, RegExp[]> = {
	PS3: [/\bps\s?3\b/i, /playstation\s?3\b/i],
	PS4: [/\bps\s?4\b/i, /playstation\s?4\b/i],
	PS5: [/\bps\s?5\b/i, /playstation\s?5\b/i],
	PSVITA: [/\bvita\b/i],
};

/**
 * Nennt der Angebotstitel eine andere PlayStation-Plattform als die gesuchte?
 *
 * Nennt er beide ("PS4 / PS5"), ist es eine Mehrfachangabe und kein
 * Widerspruch - solche Angebote enthalten die gesuchte Fassung.
 */
export function plattformWiderspruch(angebotstitel: string, meine: Plattform): boolean {
	const eigene = PLATTFORM_IM_TEXT[meine].some((re) => re.test(angebotstitel));
	if (eigene) return false;
	return Object.entries(PLATTFORM_IM_TEXT).some(
		([p, muster]) => p !== meine && muster.some((re) => re.test(angebotstitel)),
	);
}

/** Worte im Angebotstitel, die im eigenen Titel nicht vorkommen (Ballast zaehlt nicht mit). */
export function zusatzworte(angebotstitel: string, meinTitel: string): number {
	const mein = worteAus(meinTitel);
	let fremd = 0;
	for (const wort of worteAus(angebotstitel)) if (!mein.has(wort)) fremd++;
	return fremd;
}

/**
 * Wie viele fremde Worte ein Angebot tragen darf - skaliert mit der Laenge
 * des eigenen Titels.
 *
 * Gemessen am 02.10.2026 ueber alle 490 Releases, fuenf Varianten verglichen.
 * Eine flache Grenze von drei Worten liess zwei Fehlgriffe stehen, beide vom
 * selben Muster: Ein kurzer Titel geht in einem laengeren fremden auf -
 * "Brothers" steckt in "Brothers in Arms: Hell's Highway", und "Disc Jam"
 * schrumpft auf "jam", weil `disc` in `BALLAST` steht, und passt damit auf
 * "Monster Jam Steel Titans". Mit dieser Grenze faellt kein bekannter
 * Fehlgriff mehr durch; sie kostet 7 von 221 belegten und 21 von 100
 * unbekannten Treffern. Die Begruendung fuer die strengere Wahl steht in
 * `scan-titel.ts`: lieber kein Vorschlag als ein falscher.
 */
export function zusatzwortGrenze(meinTitel: string): number {
	return Math.max(1, worteAus(meinTitel).size - 1);
}

export type AngebotUrteil = { angebot: MarktAngebot; anbieter: string };

/**
 * Das guenstigste Angebot, das alle drei Bedingungen erfuellt - oder null.
 *
 * `sammlung` ist der EINMAL zerlegte Bestand (`vorbereiten`), nicht je
 * Angebot neu: Bei 490 Releases und 20 Angeboten waeren das sonst Zehntausende
 * Zerlegungen in einem Aufruf (CPU-Grenze, CLAUDE.md).
 */
export function guenstigstesGeprueft<T extends SammlungsSpiel>(
	angebote: readonly MarktAngebot[],
	release: { gameId: number; titel: string; plattform: Plattform },
	sammlung: readonly VorbereitetesSpiel<T>[],
): AngebotUrteil | null {
	const grenze = zusatzwortGrenze(release.titel);
	let bestes: MarktAngebot | null = null;
	for (const angebot of angebote) {
		if (plattformWiderspruch(angebot.titel, release.plattform)) continue;
		if (zusatzworte(angebot.titel, release.titel) > grenze) continue;
		const { treffer, eindeutig } = sammlungstreffer(angebot.titel, sammlung);
		if (!eindeutig || treffer[0]?.spielId !== release.gameId) continue;
		if (bestes === null || angebot.preisCents < bestes.preisCents) bestes = angebot;
	}
	if (bestes === null) return null;
	return { angebot: bestes, anbieter: anbieterName(bestes.verkaeufer) };
}

/** Wer verkauft - der Haendlername, wenn es einer der beiden ist, sonst "eBay". */
export function anbieterName(verkaeufer: string | null): string {
	if (verkaeufer === null) return "eBay";
	return HAENDLER_VERKAEUFER[verkaeufer] ?? "eBay";
}
