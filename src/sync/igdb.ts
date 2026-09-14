import type { Repositories } from "../db";
import {
	eindeutigerTreffer,
	heuteIso,
	metadatenAus,
	normalisiereTrefferliste,
	suchbegriff,
	type IgdbKandidat,
} from "../domain/igdb";
import { plattformenAus, titelSchluessel } from "../domain/titel";
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
			const begriff = suchbegriff(spiel.title);
			const kandidaten = normalisiereTrefferliste(await igdb.suche(begriff));
			const plattformen = plattformenAus(spiel.plattformen ?? "");
			// Schluessel frisch aus dem bereinigten Titel, nicht aus sort_title:
			// Die Spalte ist abgeleitet und veraltet still (CLAUDE.md), und der
			// bereinigte Begriff traegt weder Jahr noch angeklebte Ziffern.
			const treffer = eindeutigerTreffer(titelSchluessel(begriff), plattformen, kandidaten);

			if (treffer) {
				await repos.igdb.verknuepfen(spiel.id, metadatenAus(treffer, heute), "automatisch");
				verknuepft++;
			} else {
				await repos.igdb.kandidatenSetzen(spiel.id, kandidaten);
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
	meldung?: string;
};

/**
 * Metadaten verknuepfter Spiele erneut holen - eine IGDB-Anfrage fuer bis
 * zu 50 Spiele. Kritikerwertungen aendern sich mit jeder neuen Rezension;
 * Stufe 17 haengt diesen Schritt an den Cron.
 */
export async function igdbAuffrischSchritt(
	repos: Repositories,
	igdb: IgdbClient,
	n = AUFFRISCHEN_JE_AUFRUF,
): Promise<AuffrischErgebnis> {
	const spiele = await repos.igdb.zumAuffrischen(n);
	if (spiele.length === 0) return { status: "erfolg", angefragt: 0, aktualisiert: 0 };

	try {
		const treffer = normalisiereTrefferliste(await igdb.nachIds(spiele.map((s) => s.igdb_id)));
		const nachId = new Map<number, IgdbKandidat>(treffer.map((k) => [k.igdbId, k]));
		const heute = heuteIso();
		let aktualisiert = 0;
		for (const spiel of spiele) {
			const k = nachId.get(spiel.igdb_id);
			if (!k) continue;
			if (await repos.igdb.auffrischen(spiel.id, metadatenAus(k, heute))) aktualisiert++;
		}
		return { status: "erfolg", angefragt: spiele.length, aktualisiert };
	} catch (fehler) {
		return { status: "fehler", angefragt: spiele.length, aktualisiert: 0, meldung: meldungFuer(fehler) };
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
