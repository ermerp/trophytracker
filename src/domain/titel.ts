/**
 * Titelbehandlung fuer Vergleich und Anzeige.
 *
 * Zwei getrennte Funktionen mit verschiedenen Zielen:
 *
 *   titelSchluessel  aggressiv, nur zum Vergleichen. "Kingdom Come:
 *                    Deliverance" wird "kingdom come deliverance".
 *   anzeigeTitel     zurueckhaltend, fuer game.title. Raeumt nur weg, was
 *                    offensichtlich Muell ist, und laesst den Namen lesbar.
 *
 * trophy_progress.title_name bleibt von beiden unberuehrt - dort stehen
 * Fremddaten von Sony.
 *
 * Reine Funktionen, ohne Datenbank testbar. Werden ab Stufe 9 auch fuer den
 * IGDB-Abgleich und ab Stufe 11 fuer den Wunschlisten-Import gebraucht.
 */

/** Markenzeichen. Kommen in 114 der 431 echten Titel vor. */
const MARKENZEICHEN = /[™®©]/g;

/**
 * Zusaetze, die denselben Titel bezeichnen und den Vergleich stoeren.
 *
 * "Trophies" und "Trophy Set" stehen tatsaechlich in PSN-Titeln
 * ("No Man's Sky Trophies"). Die uebrigen sind Editionsnamen.
 *
 * "Remastered" und "Remake" stehen bewusst NICHT hier. Sie bezeichnen in aller
 * Regel ein anderes Produkt mit eigener Troph
aeenliste, nicht dieselbe Fassung:
 * "Uncharted: Drake's Fortune" (PS3, 36/8/3/1) und die PS4-Remaster-Fassung
 * (41/8/4/1) haben verschiedene Listen. Im Bestand tragen 20 Titel
 * "Remastered" oder "Remake" und sind eigenstaendige Spiele - kein einziger
 * Fall profitierte vom Abschneiden.
 *
 * Editionszusaetze bleiben dagegen: "BioShock Infinite" (PS3) und
 * "BioShock Infinite: The Complete Edition" (PS4) haben exakt dieselbe
 * Struktur 55/24/1/1 - dasselbe Spiel mit DLC.
 */
const ZUSAETZE = [
	"game of the year edition",
	"game of the year",
	"complete edition",
	"definitive edition",
	"deluxe edition",
	"special edition",
	"standard edition",
	"ultimate edition",
	"trophy set",
	"trophies",
	"definitive",
	"complete",
	"deluxe",
	"digital",
	"bundle",
	"edition",
	"goty",
];

/** Plattformkuerzel am Ende eines Titels. */
const PLATTFORM_SUFFIX = /\b(ps ?[345]|psvita|vita|playstation ?[345])$/;

/**
 * Bereinigter Name fuer die Anzeige und fuer game.title.
 *
 * Bewusst zurueckhaltend: Zeilenumbrueche, Randleerzeichen und Markenzeichen
 * verschwinden, alles andere bleibt. "Auto Chess\n\n" wird "Auto Chess",
 * " Flower" wird "Flower", "Kingdom Come: Deliverance" bleibt vollstaendig.
 */
export function anzeigeTitel(roh: string): string {
	return roh
		.replace(MARKENZEICHEN, "")
		// "No Man's Sky Trophies" ist der Name der Liste, nicht des Spiels.
		// Kein echtes Spiel heisst so - der Zusatz kann weg.
		.replace(/\s+(troph(y|ies)( set)?)$/i, "")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Vergleichsschluessel. Gleicher Schluessel bedeutet: vermutlich dasselbe Spiel.
 *
 * Die Reihenfolge der Schritte ist wesentlich - Zusaetze werden entfernt,
 * solange die Wortgrenzen noch existieren, danach erst die Sonderzeichen.
 */
export function titelSchluessel(roh: string): string {
	// Diakritika falten, statt sie zu verlieren. Ohne diesen Schritt wird aus
	// "God of War Ragnarök" der Schluessel "god of war ragnar k" und aus
	// "ABZÛ" nur "abz" - beides zerreisst den Titel und verhindert Treffer.
	let s = anzeigeTitel(roh)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();

	// Editionszusaetze, laengste zuerst: "game of the year edition" muss
	// greifen, bevor "edition" allein den Rest stehen laesst.
	for (const zusatz of ZUSAETZE) {
		s = s.replace(new RegExp(`\\b${zusatz}\\b`, "g"), " ");
	}

	// Apostrophe verbinden, statt zu trennen: "No Man's Sky" soll "no mans
	// sky" ergeben, nicht "no man s sky".
	s = s.replace(/['’]/g, "");

	s = s.replace(/[^a-z0-9]+/g, " ").trim();
	s = s.replace(PLATTFORM_SUFFIX, "").trim();
	s = s.replace(/\s+/g, " ");

	// Nach dem Entfernen von "Definitive Edition" bleibt bei
	// "... Vice City – The Definitive Edition" ein haengendes "the" stehen.
	// Das wuerde den Treffer mit "... Vice City" verhindern.
	s = s.replace(/\s+the$/, "");

	// Titel ohne lateinische Zeichen normalisieren sich sonst zu "" und
	// wuerden faelschlich alle in eine Gruppe fallen. Beispiel aus den echten
	// Daten: "王と魔王と７人の姫君たち～新・王様物語～".
	return s === "" ? anzeigeTitel(roh).toLowerCase() : s;
}

/** Plattformen einer Trophaeenliste. "PS3,PSVITA,PS4" wird zu drei Werten. */
export function plattformenAus(roh: string): string[] {
	return roh
		.split(",")
		.map((p) => p.trim().toUpperCase())
		.filter((p) => p !== "");
}

/**
 * Rangfolge fuer die Vorauswahl bei geteilten Listen: die neueste Plattform
 * ist meist die gespielte. PSPC und Unbekanntes landen hinten.
 */
const RANG: Record<string, number> = { PS5: 4, PS4: 3, PS3: 2, PSVITA: 1 };

/** Nur Plattformen, die release.platform zulaesst (Migration 0003). */
export const ERLAUBTE_PLATTFORMEN = ["PS3", "PS4", "PS5", "PSVITA"] as const;

export type Plattform = (typeof ERLAUBTE_PLATTFORMEN)[number];

export function istErlaubtePlattform(wert: string): wert is Plattform {
	return (ERLAUBTE_PLATTFORMEN as readonly string[]).includes(wert);
}

/**
 * Waehlt die vorzuschlagende Plattform aus einer Liste.
 * Gibt null zurueck, wenn keine davon erfassbar ist (etwa reines "PSPC").
 */
export function vorgeschlagenePlattform(roh: string): Plattform | null {
	const erlaubt = plattformenAus(roh).filter(istErlaubtePlattform);
	if (erlaubt.length === 0) return null;
	return erlaubt.reduce((a, b) => ((RANG[b] ?? 0) > (RANG[a] ?? 0) ? b : a));
}
