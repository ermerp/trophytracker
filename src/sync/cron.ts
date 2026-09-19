import type { Repositories } from "../db";
import { heuteIso } from "../domain/igdb";
import type { IgdbClient } from "../igdb/client";
import type { PsnClient } from "../psn/client";
import {
	igdbAuffrischSchritt,
	igdbPhysischSchritt,
	type AuffrischErgebnis,
	type PhysischErgebnis,
} from "./igdb";
import { syncSchritt, type SyncErgebnis } from "./run";

/**
 * Die naechtliche Automatik (Stufe 18, Abschnitt 10.1).
 *
 * Der Cron Trigger feuert alle fuenf Minuten zwischen 03:00 und 05:59 UTC
 * (wrangler.jsonc). Auf dem Free Tier gilt fuer ihn dieselbe 10-ms-CPU-Grenze
 * wie fuer eine Anfrage - ein Aufruf tut deshalb genau EINE schwere Arbeit,
 * der Fortschritt liegt in der Datenbank, der naechste Aufruf macht weiter.
 * Reihenfolge: erschienene Titel freigeben (nur SQL), Haenger aufraeumen,
 * Sync-Schritt, sonst IGDB-Auffrischen, sonst Disc-Fassungen, sonst nichts.
 *
 * Es sind dieselben Pfade wie auf Knopfdruck. Deshalb protokolliert der Cron
 * ohne eigenes Zutun mit Quelle 'sync' beziehungsweise 'igdb' (8.5).
 */

/**
 * Nach so vielen Stunden ohne Fortschritt gilt ein Lauf als haengengeblieben
 * - die Laenge des Cron-Fensters. Ein juengerer Lauf, etwa ein am Abend vom
 * Nutzer abgebrochener, wird fortgesetzt statt verworfen.
 */
export const HAENGT_NACH_STUNDEN = 3;

/** Frist fuer das automatische Auffrischen der IGDB-Metadaten. */
export const AUFFRISCH_FRIST_TAGE = 7;

export type CronErgebnis = {
	getan: "sync" | "igdb_auffrischen" | "igdb_physisch" | "nichts";
	/** angekuendigt -> erschienen (8.4), in jedem Aufruf. */
	erschienen: number;
	/** Laeufe, die als haengengeblieben auf 'fehler' gesetzt wurden. */
	abgebrochen: number;
	sync?: SyncErgebnis;
	auffrischen?: AuffrischErgebnis;
	physisch?: PhysischErgebnis;
};

/**
 * Ein Aufruf der Automatik. `heute` ist das UTC-Datum (YYYY-MM-DD) und nur
 * fuer Tests ueberschreibbar.
 */
export async function cronSchritt(
	repos: Repositories,
	psn: PsnClient,
	igdb: IgdbClient,
	heute = heuteIso(),
): Promise<CronErgebnis> {
	// 1. Unabhaengig von PSN: Der taegliche Statuswechsel aus 8.4 ist ein
	//    einzelner Batch ohne Rechenarbeit und protokolliert selbst.
	const erschienen = await repos.games.erschieneneFreigeben();

	// 1b. Ein Lauf ohne Fortschritt seit einem ganzen Fenster blockiert sonst
	//     jede Nacht - laufenderLauf() faende ihn immer wieder.
	const abgebrochen = await repos.sync.haengendeAbbrechen(HAENGT_NACH_STUNDEN);
	const basis = { erschienen, abgebrochen };

	// 2. Ein laufender Lauf wird fortgesetzt - auch einer vom Nutzer.
	if (await repos.sync.laufenderLauf()) {
		return { ...basis, getan: "sync", sync: await syncSchritt(repos, psn) };
	}

	// 3. Ein Cron-Versuch je Nacht (Entscheidung des Nutzers vom 19.09.2026):
	//    nicht nach einem eigenen Lauf von heute, nicht nach einem
	//    erfolgreichen Handabruf von heute - wohl aber nach einem
	//    fehlgeschlagenen oder abgebrochenen Handlauf.
	if (await syncFaellig(repos, heute)) {
		return { ...basis, getan: "sync", sync: await syncSchritt(repos, psn, { ausloeser: "cron" }) };
	}

	// 4./5. IGDB nur mit Zugang; ohne bleibt die Nacht ruhig.
	if (igdb.konfiguriert()) {
		const auffrischen = await igdbAuffrischSchritt(repos, igdb, undefined, AUFFRISCH_FRIST_TAGE);
		if (auffrischen.angefragt > 0) return { ...basis, getan: "igdb_auffrischen", auffrischen };

		const physisch = await igdbPhysischSchritt(repos, igdb);
		if (physisch.angefragt > 0) return { ...basis, getan: "igdb_physisch", physisch };
	}

	return { ...basis, getan: "nichts" };
}

async function syncFaellig(repos: Repositories, heute: string): Promise<boolean> {
	const zugang = await repos.credentials.anzeige();
	// Ohne NPSSO oder mit abgelaufenem Zugang gar keinen Lauf anlegen - sonst
	// stuende jede Nacht eine Fehlerzeile in der Historie. Ein neues NPSSO
	// setzt den Status auf 'ok', dann geht es von allein weiter.
	if (!zugang.eingerichtet || zugang.status === "abgelaufen") return false;

	const heutige = await repos.sync.laeufeSeit(heute);
	return !heutige.some((l) => l.started_by === "cron" || l.status === "erfolg");
}

/**
 * Eine Zeile fuers Log - nur Zahlen und feste Texte. `observability.logs`
 * ist eingeschaltet; die Meldungen aus den Schritten sind bereits bereinigt
 * (meldungFuer), Fremdtext kommt hier nicht vorbei.
 */
export function cronLogzeile(e: CronErgebnis): string {
	const teile = [`cron: ${e.getan}`, `erschienen=${e.erschienen}`];
	if (e.abgebrochen) teile.push(`abgebrochen=${e.abgebrochen}`);
	if (e.sync) {
		teile.push(`sync=${e.sync.status}/${e.sync.phase}`, `offset=${e.sync.offset}`);
		if (e.sync.status === "erfolg") teile.push(`titel=${e.sync.titlesSeen ?? 0}`, `eingereiht=${e.sync.eingereiht ?? 0}`);
		if (e.sync.meldung) teile.push(`meldung="${e.sync.meldung}"`);
	}
	if (e.auffrischen) {
		teile.push(`auffrischen=${e.auffrischen.status}`, `angefragt=${e.auffrischen.angefragt}`, `aktualisiert=${e.auffrischen.aktualisiert}`);
		if (e.auffrischen.meldung) teile.push(`meldung="${e.auffrischen.meldung}"`);
	}
	if (e.physisch) {
		teile.push(`physisch=${e.physisch.status}`, `angefragt=${e.physisch.angefragt}`, `gesetzt=${e.physisch.gesetzt}`);
		if (e.physisch.meldung) teile.push(`meldung="${e.physisch.meldung}"`);
	}
	return teile.join(" ");
}
