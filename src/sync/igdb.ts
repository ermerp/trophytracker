import type { Repositories } from "../db";
import {
	eindeutigerTreffer,
	heuteIso,
	kurzbegriff,
	metadatenAus,
	normalisiereTrefferliste,
	ordneKandidaten,
	physischePlattformenListe,
	suchbegriff,
	type IgdbKandidat,
} from "../domain/igdb";
import { anzeigeTitel, plattformenAus, titelSchluessel } from "../domain/titel";
import {
	IgdbAuthError,
	IgdbKonfigError,
	IgdbRateError,
	type IgdbClient,
} from "../igdb/client";

/**
 * IGDB-Abgleich in begrenzten Schritten (Abschnitt 7.6).
 *
 * Wie beim Trophaeen-Sync kommt der Schutz gegen die 10-ms-CPU-Grenze aus
 * dem Entwurf: Ein Aufruf sucht fuer hoechstens SPIELE_JE_AUFRUF Spiele,
 * der Fortschritt steht in game.igdb_checked_at, der naechste Aufruf macht
 * weiter. Die Oberflaeche ruft, solange `weiter` zurueckkommt.
 *
 * Automatisch verknuepft wird nur ein eindeutiger Treffer; alles andere
 * landet mit seinen Kandidaten in der Pruefansicht (CLAUDE.md: kein
 * vollautomatisches Matching).
 */

export const SPIELE_JE_AUFRUF = 8;
export const AUFFRISCHEN_JE_AUFRUF = 50;
/** Mehr Kandidaten liest niemand durch; die Sortierung bringt das Passende nach vorn. */
export const KANDIDATEN_JE_SPIEL = 10;

export type Suchweg = "suche" | "suche+exakt" | "kurz" | "teilstring" | "teilstring_roh" | "keiner";

/**
 * Suche mit Rueckfaellen.
 *
 * Trifft nach der Volltextsuche kein Kandidat den Schluessel, kommt eine
 * exakte Namensabfrage dazu und wird eingemischt: IGDBs Volltextsuche
 * uebergeht "THE FINALS" und liefert Final Fantasy, waehrend der exakte
 * Name sofort trifft. Das ist eine Anfrage mehr fuer die rund 50 Spiele
 * ohne Schluesseltreffer, nicht fuer alle.
 *
 * Bleibt die Volltextsuche ganz leer (11 von 420 Titeln), folgen bis zu
 * drei weitere Anfragen:
 *
 * 1. gekuerzter Begriff ohne Plattformfilter - "CastleStorm - Complete
 *    Edition" findet IGDB erst als "CastleStorm", und manche Eintraege
 *    nennen gar keine Plattform
 * 2. Teilstringsuche ueber den Namen - der einzige Weg zu "That's You!"
 *    oder "We Were Here Too"
 * 3. dieselbe Teilstringsuche mit dem unbereinigten Titel - "OlliOlli2"
 *    schreibt IGDB ohne Leerzeichen, der Suchbegriff traegt eines
 *
 * Der Aufrufer sortiert; hier zaehlt nur, ueberhaupt etwas zu finden.
 */
export async function kandidatenSuchen(
	igdb: IgdbClient,
	titel: string,
): Promise<{ kandidaten: IgdbKandidat[]; begriff: string; weg: Suchweg }> {
	const begriff = suchbegriff(titel);
	const schluessel = titelSchluessel(begriff);
	let kandidaten = normalisiereTrefferliste(await igdb.suche(begriff));
	if (kandidaten.length > 0) {
		if (kandidaten.some((k) => titelSchluessel(k.name) === schluessel)) {
			return { kandidaten, begriff, weg: "suche" };
		}
		const exakt = normalisiereTrefferliste(await igdb.nameExakt(begriff));
		const bekannt = new Set(kandidaten.map((k) => k.igdbId));
		return {
			kandidaten: [...exakt.filter((k) => !bekannt.has(k.igdbId)), ...kandidaten],
			begriff,
			weg: exakt.length > 0 ? "suche+exakt" : "suche",
		};
	}

	const kurz = kurzbegriff(begriff);
	if (kurz !== "") {
		kandidaten = normalisiereTrefferliste(await igdb.suche(kurz));
		if (kandidaten.length > 0) return { kandidaten, begriff, weg: "kurz" };

		kandidaten = normalisiereTrefferliste(await igdb.nameEnthaelt(kurz));
		if (kandidaten.length > 0) return { kandidaten, begriff, weg: "teilstring" };
	}

	const roh = kurzbegriff(anzeigeTitel(titel));
	if (roh !== "" && roh !== kurz) {
		kandidaten = normalisiereTrefferliste(await igdb.nameEnthaelt(roh));
		if (kandidaten.length > 0) return { kandidaten, begriff, weg: "teilstring_roh" };
	}

	return { kandidaten: [], begriff, weg: "keiner" };
}

export type AbgleichErgebnis = {
	status: "erfolg" | "laufend" | "fehler";
	geprueft: number;
	verknuepft: number;
	vorgeschlagen: number;
	ohneTreffer: number;
	nochOffen: number;
	weiter: boolean;
	meldung?: string;
};

export async function igdbAbgleichSchritt(
	repos: Repositories,
	igdb: IgdbClient,
	n = SPIELE_JE_AUFRUF,
): Promise<AbgleichErgebnis> {
	const spiele = await repos.igdb.naechsteUngeprueft(n);
	const heute = heuteIso();
	let verknuepft = 0;
	let vorgeschlagen = 0;
	let ohneTreffer = 0;
	let geprueft = 0;

	try {
		for (const spiel of spiele) {
			const { kandidaten, begriff } = await kandidatenSuchen(igdb, spiel.title);
			const plattformen = plattformenAus(spiel.plattformen ?? "");
			// Schluessel frisch aus dem bereinigten Titel, nicht aus sort_title:
			// Die Spalte ist abgeleitet und veraltet still (CLAUDE.md), und der
			// bereinigte Begriff traegt weder Jahr noch angeklebte Ziffern.
			const schluessel = titelSchluessel(begriff);
			const treffer = eindeutigerTreffer(schluessel, plattformen, kandidaten);

			if (treffer) {
				await repos.igdb.verknuepfen(spiel.id, metadatenAus(treffer, heute), "automatisch");
				verknuepft++;
			} else {
				await repos.igdb.kandidatenSetzen(
					spiel.id,
					ordneKandidaten(schluessel, plattformen, kandidaten).slice(0, KANDIDATEN_JE_SPIEL),
				);
				if (kandidaten.length === 0) ohneTreffer++;
				else vorgeschlagen++;
			}
			geprueft++;
		}
	} catch (fehler) {
		// Bereits geprueft Spiele sind gestempelt; der naechste Aufruf macht
		// beim naechsten weiter. Beim Ratenlimit ist das ein "spaeter",
		// bei allem anderen ein Fehler, den die Oberflaeche zeigt.
		const nochOffen = (await repos.igdb.zaehlung()).ungeprueft;
		if (fehler instanceof IgdbRateError) {
			return { status: "laufend", geprueft, verknuepft, vorgeschlagen, ohneTreffer, nochOffen, weiter: true, meldung: fehler.message };
		}
		return {
			status: "fehler",
			geprueft,
			verknuepft,
			vorgeschlagen,
			ohneTreffer,
			nochOffen,
			weiter: false,
			meldung: meldungFuer(fehler),
		};
	}

	const nochOffen = (await repos.igdb.zaehlung()).ungeprueft;
	return {
		status: nochOffen > 0 ? "laufend" : "erfolg",
		geprueft,
		verknuepft,
		vorgeschlagen,
		ohneTreffer,
		nochOffen,
		weiter: nochOffen > 0,
	};
}

export type AuffrischErgebnis = {
	status: "erfolg" | "fehler";
	angefragt: number;
	aktualisiert: number;
	/** Angefragt, aber von IGDB nicht geliefert - trotzdem gestempelt. */
	ohneAntwort?: number;
	meldung?: string;
};

/**
 * Metadaten verknuepfter Spiele erneut holen - eine IGDB-Anfrage fuer bis
 * zu 50 Spiele. Kritikerwertungen aendern sich mit jeder neuen Rezension;
 * seit Stufe 18 ruft der Cron diesen Schritt nachts mit einer Frist von
 * sieben Tagen, die Handschaltflaeche ohne Frist.
 */
export async function igdbAuffrischSchritt(
	repos: Repositories,
	igdb: IgdbClient,
	n = AUFFRISCHEN_JE_AUFRUF,
	mindestAlterTage = 0,
): Promise<AuffrischErgebnis> {
	const spiele = await repos.igdb.zumAuffrischen(n, mindestAlterTage);
	if (spiele.length === 0) return { status: "erfolg", angefragt: 0, aktualisiert: 0 };

	try {
		const treffer = normalisiereTrefferliste(await igdb.nachIds(spiele.map((s) => s.igdb_id)));
		const nachId = new Map<number, IgdbKandidat>(treffer.map((k) => [k.igdbId, k]));
		const heute = heuteIso();
		let aktualisiert = 0;
		const ohneAntwort: number[] = [];
		for (const spiel of spiele) {
			const k = nachId.get(spiel.igdb_id);
			// Was IGDB nicht zurueckgibt, wird trotzdem gestempelt - sonst waehlt
			// der naechste Aufruf dieselben Spiele wieder und kommt nie voran.
			if (!k) {
				ohneAntwort.push(spiel.id);
				continue;
			}
			if (await repos.igdb.auffrischen(spiel.id, metadatenAus(k, heute))) aktualisiert++;
		}
		// In Stuecken: D1 erlaubt 100 gebundene Werte je Statement.
		for (let i = 0; i < ohneAntwort.length; i += 50) {
			await repos.igdb.auffrischStempeln(ohneAntwort.slice(i, i + 50));
		}
		return { status: "erfolg", angefragt: spiele.length, aktualisiert, ohneAntwort: ohneAntwort.length };
	} catch (fehler) {
		return { status: "fehler", angefragt: spiele.length, aktualisiert: 0, meldung: meldungFuer(fehler) };
	}
}

export type PhysischErgebnis = {
	status: "erfolg" | "fehler";
	angefragt: number;
	gesetzt: number;
	nochOffen: number;
	weiter: boolean;
	meldung?: string;
};

/**
 * Disc-Fassung aus IGDB (7.6, Stufe 14): eine Anfrage fuer bis zu 50
 * verknuepfte Spiele mit ungeprueften `unbekannt`-Releases. Ein physischer
 * Haendlereintrag zu einer Plattform des Releases setzt `ja` mit Quelle
 * 'igdb' - und nur `ja`: Fehlen sagt nichts, `nein` bleibt Handarbeit.
 * Der Fortschritt steht in release.physical_checked_at, die Oberflaeche
 * ruft, solange `weiter` zurueckkommt.
 */
export async function igdbPhysischSchritt(
	repos: Repositories,
	igdb: IgdbClient,
	n = AUFFRISCHEN_JE_AUFRUF,
): Promise<PhysischErgebnis> {
	const spiele = await repos.igdb.zurDiscPruefung(n);
	if (spiele.length === 0) return { status: "erfolg", angefragt: 0, gesetzt: 0, nochOffen: 0, weiter: false };

	try {
		const nachId = physischePlattformenListe(await igdb.physischNachIds(spiele.map((s) => s.igdb_id)));
		let gesetzt = 0;
		for (const spiel of spiele) {
			// Ein Spiel, das IGDB nicht zurueckgibt, wird trotzdem gestempelt:
			// leere Antwort ist ein Ergebnis, kein Grund fuer eine Endlosschleife.
			gesetzt += await repos.igdb.discFassungAusIgdb(spiel.id, nachId.get(spiel.igdb_id) ?? []);
		}
		const { discOffen } = await repos.igdb.discZaehlung();
		return { status: "erfolg", angefragt: spiele.length, gesetzt, nochOffen: discOffen, weiter: discOffen > 0 };
	} catch (fehler) {
		return {
			status: "fehler",
			angefragt: spiele.length,
			gesetzt: 0,
			nochOffen: spiele.length,
			weiter: false,
			meldung: meldungFuer(fehler),
		};
	}
}

/**
 * Nur eigene Fehlertypen werden woertlich uebernommen; alles andere wird
 * auf einen festen Text abgebildet, damit kein Fremdtext durchrutscht.
 */
export function meldungFuer(fehler: unknown): string {
	if (
		fehler instanceof IgdbKonfigError ||
		fehler instanceof IgdbAuthError ||
		fehler instanceof IgdbRateError
	) {
		return fehler.message;
	}
	return "Der IGDB-Abruf ist fehlgeschlagen.";
}
