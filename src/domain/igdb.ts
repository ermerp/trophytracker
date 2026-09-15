import { anzeigeTitel, titelSchluessel, type Plattform } from "./titel";

/**
 * IGDB-Treffer: Normalisierung und Auswahl.
 *
 * Reine Funktionen, ohne Datenbank und ohne Netz testbar. Gegen die echten
 * 420 Titel gemessen, bevor die Regel gebaut wurde (Abschnitt 7.6).
 */

/**
 * Plattform-IDs von IGDB, geprueft gegen /v4/platforms am 14.09.2026.
 *
 * PSVR (165) und PSVR2 (390) zaehlen als PS4 und PS5: Ihre Spiele tragen
 * Trophaeenlisten der jeweiligen Konsole, und "Horizon Call of the Mountain"
 * ist bei IGDB ausschliesslich unter PSVR2 gefuehrt.
 */
export const IGDB_PLATTFORMEN: Record<number, Plattform> = {
	9: "PS3",
	46: "PSVITA",
	48: "PS4",
	165: "PS4",
	167: "PS5",
	390: "PS5",
};

/** Umkehrung fuer die where-Klausel der Suche. */
export const IGDB_PLATTFORM_IDS = Object.keys(IGDB_PLATTFORMEN).map(Number);

/**
 * game_type von IGDB (loest das aeltere `category` ab), Stand /v4/game_types
 * am 14.09.2026. Deutsche Anzeigetexte, weil sie in der Oberflaeche stehen.
 */
export const IGDB_TYPEN: Record<number, string> = {
	0: "Hauptspiel",
	1: "DLC",
	2: "Erweiterung",
	3: "Bundle",
	4: "Eigenstaendige Erweiterung",
	5: "Mod",
	6: "Episode",
	7: "Staffel",
	8: "Remake",
	9: "Remaster",
	10: "Erweitertes Spiel",
	11: "Portierung",
	12: "Fork",
	13: "Paket",
	14: "Update",
};

/**
 * Typen, die nie ein eigenes Spiel im Sinn der Sammlung sind. Sie werden
 * schon in der Abfrage ausgeschlossen: Fuer "Genshin Impact" bestanden alle
 * zehn Treffer aus Updates, das Hauptspiel kam gar nicht mehr vor.
 */
export const NIE_EIN_SPIEL = [5, 12, 14] as const;
const NIE_EIN_SPIEL_MENGE = new Set<number>(NIE_EIN_SPIEL);

/**
 * Typen, die ein eigenes Spiel mit eigener Trophaeenliste sein koennen. Sie
 * stehen in der Kandidatenliste vor DLC, Erweiterungen, Episoden, Staffeln
 * und Paketen - bei "Batman: Arkham Knight" liefert die Suche sonst zwoelf
 * Skin-Pakete, bevor das Hauptspiel kommt.
 */
export const HAUPTSPIEL_ARTIG = new Set<number>([0, 3, 4, 8, 9, 10, 11]);

/** Die Felder, die der Client bei jeder Anfrage anfordert. */
export const IGDB_FELDER =
	"name,slug,cover.image_id,first_release_date,aggregated_rating,aggregated_rating_count," +
	"platforms,game_type,parent_game,version_parent";

/** Rohform eines Spiels, wie IGDB sie mit IGDB_FELDER liefert. */
export type IgdbSpielRoh = {
	id: number;
	name?: string;
	slug?: string;
	cover?: { id?: number; image_id?: string } | number;
	first_release_date?: number;
	aggregated_rating?: number;
	aggregated_rating_count?: number;
	platforms?: number[];
	game_type?: number;
	parent_game?: number;
	version_parent?: number;
};

export type IgdbKandidat = {
	igdbId: number;
	name: string;
	slug: string | null;
	coverUrl: string | null;
	releaseDate: string | null;
	/** Nur die vier eigenen Plattformen; leer, wenn IGDB keine davon nennt. */
	plattformen: Plattform[];
	typ: string | null;
	typId: number | null;
	criticScore: number | null;
	criticScoreCount: number | null;
	versionParent: number | null;
	parentGame: number | null;
};

const TYP_BUNDLE = 3;

const BILD_BASIS = "https://images.igdb.com/igdb/image/upload";

/** Cover in 264 x 374 ("cover_big" laut IGDB-Bildgroessen). */
export function coverUrl(imageId: string): string {
	return `${BILD_BASIS}/t_cover_big/${imageId}.jpg`;
}

/** Unix-Sekunden nach ISO-Datum (nur der Tag, UTC). */
export function isoDatum(unixSekunden: number): string {
	return new Date(unixSekunden * 1000).toISOString().slice(0, 10);
}

/**
 * Ein Roh-Treffer als Kandidat. Fehlende Werte bleiben null - die
 * Oberflaeche zeigt dann "unbekannt", nie "0".
 *
 * Mods, Forks und Updates fallen heraus: Sie sind nie ein Spiel der
 * Sammlung und wuerden nur die Kandidatenliste verlaengern. Ebenso
 * Eintraege, die ausschliesslich fremde Plattformen nennen: Die Rueckfaelle
 * der Suche laufen ohne Plattformfilter (manche Eintraege nennen gar keine
 * Plattform), und ohne diese Pruefung stuenden Switch- und PC-Spiele in der
 * Wunschlisten-Suche - Rueckmeldung aus der Abnahme von Stufe 10. "Keine
 * Plattform genannt" bleibt dagegen zugelassen: fehlende Daten sind kein
 * Gegenbeweis (7.6).
 */
export function normalisiereTreffer(roh: IgdbSpielRoh): IgdbKandidat | null {
	if (!roh.name || !Number.isInteger(roh.id)) return null;
	if (roh.game_type !== undefined && NIE_EIN_SPIEL_MENGE.has(roh.game_type)) return null;

	const imageId = typeof roh.cover === "object" ? roh.cover?.image_id : undefined;
	const genannt = roh.platforms ?? [];
	const plattformen = [
		...new Set(genannt.map((p) => IGDB_PLATTFORMEN[p]).filter((p): p is Plattform => p !== undefined)),
	];
	if (genannt.length > 0 && plattformen.length === 0) return null;

	return {
		igdbId: roh.id,
		name: roh.name,
		slug: roh.slug ?? null,
		coverUrl: imageId ? coverUrl(imageId) : null,
		releaseDate: typeof roh.first_release_date === "number" ? isoDatum(roh.first_release_date) : null,
		plattformen,
		typ: roh.game_type !== undefined ? (IGDB_TYPEN[roh.game_type] ?? null) : null,
		typId: roh.game_type ?? null,
		criticScore: typeof roh.aggregated_rating === "number" ? Math.round(roh.aggregated_rating) : null,
		criticScoreCount:
			typeof roh.aggregated_rating_count === "number" ? roh.aggregated_rating_count : null,
		versionParent: roh.version_parent ?? null,
		parentGame: roh.parent_game ?? null,
	};
}

export function normalisiereTrefferliste(roh: unknown): IgdbKandidat[] {
	if (!Array.isArray(roh)) return [];
	return roh
		.map((r) => normalisiereTreffer(r as IgdbSpielRoh))
		.filter((k): k is IgdbKandidat => k !== null);
}

export type ReleaseStatus = "erschienen" | "angekuendigt" | "unbekannt";

/** Abschnitt 8.4: Datum in der Zukunft heisst angekuendigt. Ohne Datum: unbekannt, nie erschienen. */
export function releaseStatusAus(datum: string | null, heute: string): ReleaseStatus {
	if (!datum) return "unbekannt";
	return datum <= heute ? "erschienen" : "angekuendigt";
}

/**
 * Abschnitt 7.2, auf IGDB uebertragen: Automatisch verknuepft wird nur ein
 * eindeutiger Treffer. Eindeutig heisst: genau ein Kandidat traegt denselben
 * Titelschluessel wie das Spiel. Der Schluessel des Spiels kommt aus
 * suchbegriff(title), nicht aus sort_title - so loest der Plattformfilter
 * "God of War (2018)" (PS4) und "God of War (2005)" (PS3) beide richtig auf.
 *
 * Drei Verfeinerungen aus der Messung gegen die echten 420 Titel:
 * - Editionen ("Nightmare Edition", "Collector's Edition") verweisen mit
 *   version_parent auf ihr Hauptspiel. Ist das Hauptspiel selbst Kandidat,
 *   zaehlt die Edition nicht als zweiter Treffer.
 * - Ein Bundle gleichen Namens ("Grand Theft Auto V" als Paket mit GTA
 *   Online) zaehlt nicht gegen das Hauptspiel. Nur wenn es kein anderes
 *   gibt, bleibt das Bundle selbst Kandidat.
 * - Nennt der Kandidat Plattformen und das Spiel hat Releases, muss sich
 *   mindestens eine decken. Ein Kandidat ohne Plattformangabe wird nicht
 *   ausgeschlossen - fehlende Daten sind kein Gegenbeweis.
 *
 * Ergebnis der Messung am 14.09.2026: 372 von 420 eindeutig, 5 mehrdeutig, 32 mit
 * Kandidaten ohne Schluesseltreffer, 11 ohne Treffer; keine Fehlzuordnung in den
 * Stichproben. Der Rest geht mit Kandidaten in die Pruefansicht.
 *
 * Vierte Verfeinerung fuer den Wunschlisten-Import (8.2): Bleiben danach
 * mehrere Kandidaten und ist ein Jahr aus der Liste bekannt, gewinnt der
 * einzige, dessen Erscheinungsjahr im selben oder angrenzenden Jahr liegt -
 * "Layers of Fear" 2016 und das Remake 2023 stehen beide auf den Listen,
 * und der Monat aus der Liste liegt meist im richtigen Jahr. Ohne Jahr
 * (Abgleich der Sammlung) aendert sich nichts.
 */
export function eindeutigerTreffer(
	schluessel: string,
	plattformenDesSpiels: readonly string[],
	kandidaten: readonly IgdbKandidat[],
	jahr: number | null = null,
): IgdbKandidat | null {
	const gleich = kandidaten.filter((k) => titelSchluessel(k.name) === schluessel);
	const ids = new Set(gleich.map((k) => k.igdbId));

	const passend = gleich
		.filter((k) => k.versionParent === null || !ids.has(k.versionParent))
		.filter(
			(k) =>
				k.plattformen.length === 0 ||
				plattformenDesSpiels.length === 0 ||
				k.plattformen.some((p) => plattformenDesSpiels.includes(p)),
		);

	const ohneBundles = passend.filter((k) => k.typId !== TYP_BUNDLE);
	const engere = ohneBundles.length > 0 ? ohneBundles : passend;
	if (engere.length === 1) return engere[0];
	if (engere.length > 1 && jahr !== null) {
		const imJahr = engere.filter((k) => k.releaseDate !== null && Math.abs(Number(k.releaseDate.slice(0, 4)) - jahr) <= 1);
		if (imJahr.length === 1) return imJahr[0];
	}
	return null;
}

/**
 * Reihenfolge der Kandidaten fuer die Pruefansicht und die Suche:
 * Schluesseltreffer zuerst, dann Hauptspiel-artige Typen vor DLC, dann
 * Kandidaten mit passender Plattform, innerhalb dessen die Reihenfolge von
 * IGDB. Aendert nichts an der Auswahl fuer die automatische Verknuepfung.
 */
export function ordneKandidaten(
	schluessel: string,
	plattformenDesSpiels: readonly string[],
	kandidaten: readonly IgdbKandidat[],
): IgdbKandidat[] {
	const rang = (k: IgdbKandidat, i: number): number[] => [
		titelSchluessel(k.name) === schluessel ? 0 : 1,
		k.typId !== null && HAUPTSPIEL_ARTIG.has(k.typId) ? 0 : 1,
		plattformenDesSpiels.length === 0 || k.plattformen.some((p) => plattformenDesSpiels.includes(p)) ? 0 : 1,
		i,
	];
	return kandidaten
		.map((k, i) => ({ k, r: rang(k, i) }))
		.sort((a, b) => {
			for (let j = 0; j < a.r.length; j++) if (a.r[j] !== b.r[j]) return a.r[j] - b.r[j];
			return 0;
		})
		.map((x) => x.k);
}

/** Die Spalten, die eine Verknuepfung oder Auffrischung in `game` schreibt. */
export type IgdbMetadaten = {
	igdbId: number;
	igdbSlug: string | null;
	coverUrl: string | null;
	releaseDate: string | null;
	releaseStatus: ReleaseStatus;
	criticScore: number | null;
	criticScoreCount: number | null;
};

export function metadatenAus(k: IgdbKandidat, heute: string): IgdbMetadaten {
	return {
		igdbId: k.igdbId,
		igdbSlug: k.slug,
		coverUrl: k.coverUrl,
		releaseDate: k.releaseDate,
		releaseStatus: releaseStatusAus(k.releaseDate, heute),
		criticScore: k.criticScore,
		criticScoreCount: k.criticScoreCount,
	};
}

/**
 * Suchbegriff fuer Apicalypse: Er steht in Anfuehrungszeichen, deshalb
 * werden Backslash und Anfuehrungszeichen maskiert; Steuerzeichen fallen weg.
 */
export function apicalypseText(begriff: string): string {
	return begriff
		.replace(/[\u0000-\u001f\u007f]/g, " ")
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.trim();
}

/**
 * Suchbegriff aus dem Spieltitel.
 *
 * Nur fuer die Anfrage an IGDB, nie fuer den Schluessel. Zwei Eingriffe,
 * jeder aus der Messung gegen die echten Titel:
 * - Ein Jahr in Klammern ("God of War (2018)") stammt aus der Umbenennung
 *   durch den Nutzer, IGDB kennt es nicht. Die Unterscheidung uebernimmt
 *   der Plattformabgleich in eindeutigerTreffer.
 * - Sony klebt Ziffern an Woerter ("Velocity2X", "LittleBigPlanet2",
 *   "PlayStation4"); IGDB findet nur die Schreibweise mit Leerzeichen.
 */
export function suchbegriff(titel: string): string {
	return anzeigeTitel(titel)
		.replace(/\s*\(\d{4}\)\s*$/, "")
		.replace(/([A-Za-z])(\d)/g, "$1 $2")
		.trim();
}

/**
 * Gekuerzter Begriff fuer den Rueckfall, wenn die Suche leer bleibt: alles
 * ab " - ", ":" oder "/" faellt weg. "CastleStorm - Complete Edition" wird
 * "CastleStorm", "Type:Rider" wird "Type" - IGDB findet beides erst so.
 * Ein Bindestrich im Wort ("Wake-up Club") bleibt stehen.
 */
export function kurzbegriff(begriff: string): string {
	return begriff.replace(/(\s+-\s+|:|\/).*$/, "").trim();
}

export function heuteIso(jetzt = new Date()): string {
	return jetzt.toISOString().slice(0, 10);
}
