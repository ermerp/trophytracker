import type { Repositories } from "../db";
import { normalisiereSeite } from "../domain/normalize";
import { Geheimnis } from "../domain/secret";
import {
	SEITENGROESSE,
	SEITEN_JE_AUFRUF,
	extractTotalItemCount,
	naechsterOffset,
} from "../domain/trophy-pages";
import { PsnAuthError, type PsnClient, type Sitzung } from "../psn/client";
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
	/** Am Ende der Normalisierung: neu in die Pruefliste eingereiht (Abschnitt 8.1). */
	eingereiht?: number;
	weiter: boolean;
	meldung?: string;
};

export class KeinNpssoError extends Error {}

/**
 * Besorgt einen Access Token.
 *
 * Reihenfolge nach Abschnitt 7.1: erst der Refresh-Token, das NPSSO nur als
 * Rueckfall. Ein normaler Sync fasst das NPSSO damit gar nicht an - schonend
 * gegenueber einer inoffiziellen Schnittstelle.
 */
async function sitzungBesorgen(repos: Repositories, psn: PsnClient): Promise<Sitzung> {
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
): Promise<SyncErgebnis> {
	const lauf = (await repos.sync.laufenderLauf()) ?? (await repos.sync.starten());

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
		await repos.sync.fehlschlagen(lauf.id, meldung);

		// Abgelaufene Zugangsdaten sind laut Abschnitt 7.1 ein regulaerer
		// Zustand, kein Fehlerfall. Vorhandene Daten bleiben unangetastet.
		if (fehler instanceof PsnAuthError || fehler instanceof KeinNpssoError) {
			await repos.credentials.statusSetzen("abgelaufen");
		} else {
			await repos.credentials.statusSetzen("fehler");
		}
		return {
			status: "fehler",
			phase: lauf.phase,
			offset,
			seitenGeholt,
			titlesSeen: null,
			weiter: false,
			meldung,
		};
	}
}

/**
 * Fehlermeldung fuer Anzeige und Protokoll.
 *
 * Nur eigene Fehlertypen werden woertlich uebernommen. Alles andere wird auf
 * einen festen Text abgebildet, damit kein Fremdtext durchrutscht, der ein
 * Geheimnis enthalten koennte.
 */
function meldungFuer(fehler: unknown): string {
	if (fehler instanceof PsnAuthError || fehler instanceof KeinNpssoError) {
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
		// Status. Stufe 7 kennt nur 'erstimport'.
		const { eingereiht } = await repos.review.einreihen();

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
			eingereiht,
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
