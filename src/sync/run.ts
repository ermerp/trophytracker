import type { Repositories } from "../db";
import { einreihungSumme, type Einreihung } from "../db/review";
import type { SyncAusloeser } from "../db/sync";
import { normalisiereSeite } from "../domain/normalize";
import { Geheimnis } from "../domain/secret";
import {
	SEITENGROESSE,
	SEITEN_JE_AUFRUF,
	extractTotalItemCount,
	naechsterOffset,
} from "../domain/trophy-pages";
import { PsnAbrufError, PsnAuthError, type PsnClient, type Sitzung } from "../psn/client";
import { ordneAutomatischZu } from "./zuordnung";

export type SyncErgebnis = {
	status: "erfolg" | "laufend" | "fehler";
	phase: "abruf" | "normalisierung";
	offset: number;
	seitenGeholt: number;
	titlesSeen: number | null;
	/** Nur in der Normalisierungsphase gefuellt. */
	titelGeschrieben?: number;
	verworfen?: number;
	offeneSeiten?: number;
	/** Am Ende der Normalisierung: vorbelegte play_status-Zeilen (Abschnitt 4.2). */
	vorbelegt?: number;
	/** Am Ende der Normalisierung: neu in die Pruefliste eingereiht (Abschnitt 8.1), Summe. */
	eingereiht?: number;
	/** Dieselbe Zahl je Grund: erstimport, neueTrophaeen, dlcErweitert (Aenderungserkennung, Stufe 13). */
	eingereihtNachGrund?: Pick<Einreihung, "erstimport" | "neueTrophaeen" | "dlcErweitert">;
	weiter: boolean;
	meldung?: string;
	/** Fehlversuche an derselben Stelle, wenn dieser Aufruf einen hatte (Stufe 18e). */
	fehlversuche?: number;
};

export class KeinNpssoError extends Error {}

/**
 * Wie oft eine Seite scheitern darf, bevor der Lauf aufgegeben wird
 * (Stufe 18e, Abschnitt 10.1).
 *
 * Drei: In der Nacht zum 27.09.2026 beendete ein einziger Fehler bei Offset
 * 200 den ganzen Sync - die 29 folgenden Aufrufe des Fensters taten nichts,
 * obwohl dieselbe Seite kurz darauf wieder antwortete. Ein Abrufsfehler ohne
 * Auth-Bezug laesst den Lauf deshalb auf 'laufend'; der naechste Aufruf holt
 * fuenf Minuten spaeter dieselbe Seite erneut. Drei Anlaeufe sind fuenfzehn
 * Minuten Geduld gegen eine voruebergehende Stoerung und immer noch ein
 * klares Ende gegen eine dauerhafte.
 */
export const FEHLVERSUCHE_HOECHSTENS = 3;

/**
 * Besorgt einen Access Token.
 *
 * Reihenfolge nach Abschnitt 7.1: erst der Refresh-Token, das NPSSO nur als
 * Rueckfall. Ein normaler Sync fasst das NPSSO damit gar nicht an - schonend
 * gegenueber einer inoffiziellen Schnittstelle.
 */
export async function sitzungBesorgen(repos: Repositories, psn: PsnClient): Promise<Sitzung> {
	const refresh = await repos.credentials.gueltigerRefreshToken();
	if (refresh) {
		try {
			return await sitzungMerken(repos, await psn.tokenAusRefresh(refresh));
		} catch (fehler) {
			if (!(fehler instanceof PsnAuthError)) throw fehler;
			// Refresh abgelehnt - unten ueber das NPSSO versuchen.
		}
	}

	const npsso = await repos.credentials.npsso();
	if (!npsso) {
		throw new KeinNpssoError("Es ist kein NPSSO hinterlegt.");
	}
	return sitzungMerken(repos, await psn.tokenAusNpsso(npsso));
}

async function sitzungMerken(repos: Repositories, sitzung: Sitzung): Promise<Sitzung> {
	await repos.credentials.refreshTokenSpeichern(sitzung.refreshToken, sitzung.refreshLaeuftAbUm);
	return sitzung;
}

/**
 * Startet einen Lauf oder setzt ihn fort und holt hoechstens SEITEN_JE_AUFRUF
 * Seiten.
 *
 * Die Begrenzung ist der eigentliche Schutz gegen die 10-ms-CPU-Grenze: Cron
 * Trigger haben auf dem Free Tier dieselbe Grenze wie normale Anfragen, der
 * Ausloeser hilft also nicht. Die Rohantworten werden ungeparst abgelegt;
 * ausgewertet wird nur totalItemCount fuer die Blaetterung.
 */
export async function syncSchritt(
	repos: Repositories,
	psn: PsnClient,
	optionen: { ausloeser?: SyncAusloeser } = {},
): Promise<SyncErgebnis> {
	// Ein laufender Lauf wird fortgesetzt, egal wer ihn startete; nur ein
	// neuer traegt den Ausloeser (Stufe 18: der Cron nimmt dieselben Pfade).
	const lauf =
		(await repos.sync.laufenderLauf()) ?? (await repos.sync.starten(optionen.ausloeser ?? "nutzer"));

	if (lauf.phase === "normalisierung") {
		return normalisierungsSchritt(repos, lauf.id, lauf.titles_seen);
	}

	let offset = lauf.next_offset;
	let seitenGeholt = 0;

	try {
		const sitzung = await sitzungBesorgen(repos, psn);
		let gesamt: number | null = null;

		while (seitenGeholt < SEITEN_JE_AUFRUF) {
			const { pfad, roh } = await psn.holeTrophyTitlesSeite(
				sitzung.accessToken,
				offset,
				SEITENGROESSE,
			);
			await repos.sync.rohantwortSpeichern(lauf.id, pfad, roh);
			seitenGeholt++;

			gesamt = extractTotalItemCount(roh);
			const weiterAb = naechsterOffset(offset, SEITENGROESSE, gesamt);

			if (weiterAb === null) {
				// Abruf fertig - jetzt normalisieren, im naechsten Aufruf.
				// Der Lauf wird hier bewusst NICHT abgeschlossen: Er bleibt
				// 'laufend', damit der naechste Aufruf ihn wiederfindet, statt
				// einen neuen zu starten und erneut PSN abzurufen.
				await repos.sync.phaseSetzen(lauf.id, "normalisierung");
				return {
					status: "laufend",
					phase: "normalisierung",
					offset,
					seitenGeholt,
					titlesSeen: gesamt,
					weiter: true,
				};
			}
			offset = weiterAb;
		}

		await repos.sync.fortschrittSetzen(lauf.id, offset);
		return {
			status: "laufend",
			phase: "abruf",
			offset,
			seitenGeholt,
			titlesSeen: gesamt,
			weiter: true,
		};
	} catch (fehler) {
		const meldung = meldungFuer(fehler);

		// Abgelaufene Zugangsdaten sind laut Abschnitt 7.1 ein regulaerer
		// Zustand, kein Fehlerfall - und kein Fall fuer einen zweiten Anlauf:
		// Ein abgelehnter Token wird in fuenf Minuten nicht gueltig. Vorhandene
		// Daten bleiben unangetastet.
		if (fehler instanceof PsnAuthError || fehler instanceof KeinNpssoError) {
			await repos.sync.fehlschlagen(lauf.id, meldung);
			await repos.credentials.statusSetzen("abgelaufen");
			return { status: "fehler", phase: lauf.phase, offset, seitenGeholt, titlesSeen: null, weiter: false, meldung };
		}

		// Alles andere - ein 503, ein Ratenlimit, ein Netzfehler - bekommt
		// weitere Anlaeufe (Stufe 18e). Der Lauf bleibt 'laufend' und damit
		// fortsetzbar; `weiter: false` beendet nur DIESEN Aufruf, damit eine
		// Oberflaeche nicht sofort dreimal hintereinander nachfasst.
		const fehlversuche = await repos.sync.fehlversuchVermerken(lauf.id, meldung);
		if (fehlversuche < FEHLVERSUCHE_HOECHSTENS) {
			return { status: "laufend", phase: lauf.phase, offset, seitenGeholt, titlesSeen: null, weiter: false, meldung, fehlversuche };
		}

		await repos.sync.fehlschlagen(lauf.id, meldung);
		await repos.credentials.statusSetzen("fehler");
		return {
			status: "fehler",
			phase: lauf.phase,
			offset,
			seitenGeholt,
			titlesSeen: null,
			weiter: false,
			meldung,
			fehlversuche,
		};
	}
}

/**
 * Fehlermeldung fuer Anzeige und Protokoll.
 *
 * Nur eigene Fehlertypen werden woertlich uebernommen. Alles andere wird auf
 * einen festen Text abgebildet, damit kein Fremdtext durchrutscht, der ein
 * Geheimnis enthalten koennte.
 *
 * Seit Stufe 18e gehoert `PsnAbrufError` dazu: Sein Text ist eine eigene
 * Schablone plus der HTTP-Status ("Trophaeenabruf antwortete mit 503."),
 * enthaelt also nichts von Sony. Vorher stand in der Historie einheitlich
 * "Der Abruf ist fehlgeschlagen.", und am Morgen des 27.09.2026 war damit
 * nicht zu unterscheiden, ob PSN gedrosselt, geantwortet oder die Form
 * geaendert hatte. `test/keine-lecks.spec.ts` haelt fest, dass nur diese
 * drei Typen durchkommen.
 */
function meldungFuer(fehler: unknown): string {
	if (fehler instanceof PsnAuthError || fehler instanceof KeinNpssoError || fehler instanceof PsnAbrufError) {
		return fehler.message;
	}
	return "Der Abruf ist fehlgeschlagen.";
}

/**
 * Verarbeitet EINE noch offene Rohantwort.
 *
 * Wie beim Abruf ist die Begrenzung der Schutz gegen die 10-ms-CPU-Grenze:
 * eine Seite bedeutet ein JSON.parse ueber rund 60 kB und 100 UPSERTs. Der
 * Aufrufer wiederholt, bis nichts mehr offen ist.
 *
 * Diese Phase fasst PSN nicht an - sie liest ausschliesslich aus
 * psn_raw_response und ist deshalb beliebig wiederholbar.
 */
export async function normalisierungsSchritt(
	repos: Repositories,
	laufId: number,
	titlesSeen: number | null,
): Promise<SyncErgebnis> {
	const roh = await repos.sync.naechsteUnverarbeitete(laufId);

	if (!roh) {
		// Nach der Normalisierung: neue Listen, die eindeutig zu einem
		// bestehenden Release passen, automatisch zuordnen (Abschnitt 7.2).
		// Beim Erstlauf greift das nie - es gibt noch keine Spiele.
		await ordneAutomatischZu(repos);

		// Abschnitt 4.2: Erst jetzt, mit zugeordneten Listen, bekommt ein
		// Release seinen ersten Status. Schreibt nur ohne Zeile oder bei
		// 'nicht_gespielt' - ein gesetzter Status ueberlebt jeden Sync.
		const vorbelegt = await repos.playStatus.vorbelegen();
		// Abschnitt 8.1: Der Sync schreibt nur in die Warteschlange, nie einen
		// Status - nie durchgesehene Listen als 'erstimport', Aenderungen
		// gegenueber dem Stempel der letzten Durchsicht als 'neue_trophaeen'
		// oder 'dlc_erweitert'.
		const { erstimport, neueTrophaeen, dlcErweitert } = await repos.review.einreihen();
		const eingereihtNachGrund = { erstimport, neueTrophaeen, dlcErweitert };

		const gesamt = await repos.trophies.anzahl();
		await repos.sync.abschliessen(laufId, gesamt);
		await repos.credentials.erfolgVermerken();
		return {
			status: "erfolg",
			phase: "normalisierung",
			offset: 0,
			seitenGeholt: 0,
			titlesSeen: gesamt,
			offeneSeiten: 0,
			vorbelegt,
			eingereiht: einreihungSumme(eingereihtNachGrund),
			eingereihtNachGrund,
			weiter: false,
		};
	}

	try {
		const { titel, verworfen } = normalisiereSeite(roh.payload);
		const geschrieben = await repos.trophies.upsertSeite(titel);
		await repos.sync.alsNormalisiertMarkieren(roh.id);

		const offen = await repos.sync.offeneRohantworten(laufId);
		return {
			status: "laufend",
			phase: "normalisierung",
			offset: 0,
			seitenGeholt: 0,
			titlesSeen,
			titelGeschrieben: geschrieben,
			verworfen,
			offeneSeiten: offen,
			weiter: true,
		};
	} catch (fehler) {
		const meldung =
			fehler instanceof Error ? `Normalisierung fehlgeschlagen: ${fehler.message}` : "Normalisierung fehlgeschlagen.";
		await repos.sync.fehlschlagen(laufId, meldung);
		return {
			status: "fehler",
			phase: "normalisierung",
			offset: 0,
			seitenGeholt: 0,
			titlesSeen: null,
			weiter: false,
			meldung,
		};
	}
}

/**
 * Bereitet die Wiederholung der Normalisierung vor - ohne PSN-Zugriff.
 *
 * Setzt normalized_at des juengsten erfolgreichen Laufs zurueck und stellt ihn
 * zurueck in die Normalisierungsphase. Die folgenden Aufrufe von syncSchritt
 * arbeiten ihn dann erneut ab, ohne Sony anzusprechen.
 */
export async function normalisierungWiederholen(
	repos: Repositories,
): Promise<{ laufId: number; seiten: number } | null> {
	const lauf = await repos.sync.letzterErfolgreicherLauf();
	if (!lauf) return null;

	const seiten = await repos.sync.normalisierungZuruecksetzen(lauf.id);
	await repos.sync.zurueckInNormalisierung(lauf.id);
	return { laufId: lauf.id, seiten };
}

/** Nur fuer die NPSSO-Pruefung beim Eintragen. */
export async function npssoPruefen(psn: PsnClient, npsso: Geheimnis): Promise<Sitzung> {
	return psn.tokenAusNpsso(npsso);
}
