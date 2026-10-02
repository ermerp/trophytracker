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
 * 2. Der Titel nennt keine ANDERE Plattform - weder eine der eigenen vier
 *    (eBays Aspekt `Plattform` ist verkaeufergepflegt und manchmal falsch)
 *    noch eine fremde wie PS2 oder Xbox.
 * 3. Das Angebot ist ueberhaupt ein Datentraeger, kein Konto und keine
 *    Dienstleistung.
 * 4. Bei ein- und zweiwortigen Titeln steht unser Wort vorn.
 * 5. Kein fremdes Wort ist eine blanke Ziffer, solange unser Titel keine traegt.
 * 6. Das Angebot traegt hoechstens `zusatzwortGrenze` fremde Worte.
 *
 * Die Bedingungen 2 bis 5 sind am 02.10.2026 an den 79 Releases nachgemessen
 * worden, die der erste Entwurf automatisch auf `ja` gesetzt haette: Fuenf
 * davon waren falsch, und diese vier Regeln beseitigen alle fuenf. Sie kosten
 * dabei genau einen belegten und vier unbekannte Treffer (214 -> 213 und
 * 79 -> 75).
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
 * Plattformen, die wir gar nicht fuehren - sie sind IMMER ein Widerspruch.
 *
 * Gemessen am 02.10.2026: "Metal Gear Solid 2" (PS3) bekam ein Angebot
 * "Metal Gear Solid 3 PlayStation 2 Ps2". Die Pruefung kannte nur die eigenen
 * vier Plattformen und sah deshalb keinen Widerspruch. Mit dieser Liste faellt
 * das PS2-Angebot heraus - und darunter liegt die HD Collection fuer PS3, auf
 * der das Spiel tatsaechlich ist. Aus einem Fehlgriff wird ein Treffer.
 */
const FREMDE_PLATTFORM: RegExp[] = [
	/\bps\s?[12]\b/i,
	/playstation\s?[12]\b/i,
	/\bpsp\b/i,
	/\bxbox\b/i,
	/\bx360\b/i,
	/\bswitch\b/i,
	/\bnintendo\b/i,
	/\bwii\b/i,
	/\bgamecube\b/i,
	/\bdreamcast\b/i,
	/\bpc\b/i,
];

/**
 * Angebote, die in der Videospiel-Kategorie stehen, aber kein Datentraeger
 * sind. Gemessen am 02.10.2026 unter den 79 automatisch gesetzten
 * Disc-Fassungen: "Genshin Impact Account" (261 EUR) und "Yakuza Kiwami 2 PS5
 * Platinum Trophy Service" (226 EUR) - beides keine Disc, beides ein falsches
 * `ja`. Die Liste kostete in derselben Messung keinen einzigen richtigen
 * Treffer.
 */
const KEIN_DATENTRAEGER =
	/\b(account|service|boosting|leerh[üu]lle|nur h[üu]lle|ohne spiel|poster|sticker|aufkleber|schl[üu]sselanh[äa]nger|key|download\s?code)\b/i;

/**
 * Nennt der Angebotstitel eine andere PlayStation-Plattform als die gesuchte?
 *
 * Nennt er beide ("PS4 / PS5"), ist es eine Mehrfachangabe und kein
 * Widerspruch - solche Angebote enthalten die gesuchte Fassung.
 */
export function plattformWiderspruch(angebotstitel: string, meine: Plattform): boolean {
	const eigene = PLATTFORM_IM_TEXT[meine].some((re) => re.test(angebotstitel));
	if (eigene) return false;
	const andereEigene = Object.entries(PLATTFORM_IM_TEXT).some(
		([p, muster]) => p !== meine && muster.some((re) => re.test(angebotstitel)),
	);
	return andereEigene || FREMDE_PLATTFORM.some((re) => re.test(angebotstitel));
}

/** Ist das Angebot gar keine Disc, sondern ein Konto, eine Dienstleistung oder Beiwerk? */
export function keinDatentraeger(angebotstitel: string): boolean {
	return KEIN_DATENTRAEGER.test(angebotstitel);
}

/**
 * Bei kurzen Titeln muss das erste Inhaltswort des Angebots unseres sein.
 *
 * "Journey" (PS4) bekam sonst "Robinson: The Journey": Unser einziges Wort
 * steckt darin, und "robinson" ist nur EIN fremdes Wort - genau die Grenze.
 * Ein Angebot fuer unser Spiel beginnt dagegen mit unserem Titel, sobald der
 * Ballast weg ist ("PS4 Spiel Journey" wird zu ["journey"]).
 *
 * Nur fuer ein- und zweiwortige Titel: Ab drei Worten traegt die Wortmenge
 * selbst genug, und die Regel wuerde Angebote verwerfen, die mit dem
 * Herausgeber beginnen ("2K BioShock ...").
 */
export const KURZER_TITEL_BIS = 2;

export function beginntMitTitel(angebotstitel: string, meinTitel: string): boolean {
	const mein = [...worteAus(meinTitel)];
	if (mein.length === 0 || mein.length > KURZER_TITEL_BIS) return true;
	const imAngebot = [...worteAus(angebotstitel)];
	return imAngebot.length > 0 && imAngebot[0] === mein[0];
}

/**
 * Eine blanke Ziffer als fremdes Wort heisst Nachfolger.
 *
 * "SteamWorld Dig" (PS4) bekam "SteamWorld Dig 2". Traegt unser Titel selbst
 * eine Zahl ("Borderlands 2", "Far Cry 2"), greift die Regel nicht - dort ist
 * die Ziffer Teil des Namens, und ein zusaetzlicher Jahrgang im Angebot
 * ("Sony PlayStation 3, 2009") waere sonst ein Ausschlussgrund.
 */
export function nachfolgerZiffer(angebotstitel: string, meinTitel: string): boolean {
	const mein = worteAus(meinTitel);
	if ([...mein].some((w) => /^\d+$/.test(w))) return false;
	for (const wort of worteAus(angebotstitel)) {
		if (!mein.has(wort) && /^\d+$/.test(wort)) return true;
	}
	return false;
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
		if (keinDatentraeger(angebot.titel)) continue;
		if (!beginntMitTitel(angebot.titel, release.titel)) continue;
		if (nachfolgerZiffer(angebot.titel, release.titel)) continue;
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
