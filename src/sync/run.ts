import type { Repositories } from "../db";
import { Geheimnis } from "../domain/secret";
import {
	SEITENGROESSE,
	SEITEN_JE_AUFRUF,
	extractTotalItemCount,
	naechsterOffset,
} from "../domain/trophy-pages";
import { PsnAuthError, type PsnClient, type Sitzung } from "../psn/client";

export type SyncErgebnis = {
	status: "erfolg" | "laufend" | "fehler";
	offset: number;
	seitenGeholt: number;
	titlesSeen: number | null;
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
				await repos.sync.abschliessen(lauf.id, gesamt ?? 0);
				await repos.credentials.erfolgVermerken();
				return {
					status: "erfolg",
					offset,
					seitenGeholt,
					titlesSeen: gesamt,
					weiter: false,
				};
			}
			offset = weiterAb;
		}

		await repos.sync.fortschrittSetzen(lauf.id, offset);
		return { status: "laufend", offset, seitenGeholt, titlesSeen: gesamt, weiter: true };
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
		return { status: "fehler", offset, seitenGeholt, titlesSeen: null, weiter: false, meldung };
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

/** Nur fuer die NPSSO-Pruefung beim Eintragen. */
export async function npssoPruefen(psn: PsnClient, npsso: Geheimnis): Promise<Sitzung> {
	return psn.tokenAusNpsso(npsso);
}
