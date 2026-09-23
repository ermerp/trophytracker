import type { Repositories } from "../db";
import { heuteIso } from "../domain/igdb";
import type { IgdbClient } from "../igdb/client";
import type { PsnClient } from "../psn/client";
import {
	igdbAuffrischSchritt,
	igdbPhysischSchritt,
	meldungFuer,
	type AuffrischErgebnis,
	type PhysischErgebnis,
} from "./igdb";
import { besitzSchritt, spielzeitSchritt, type BesitzErgebnis, type SpielzeitErgebnis } from "./besitz";
import { sitzungBesorgen, syncSchritt, type SyncErgebnis } from "./run";

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

/**
 * Wie oft die beiden PSN-Zusatzabrufe laufen (7.7, Stufe 18c).
 *
 * Spielzeit taeglich: Sie aendert sich, sobald gespielt wird, und kostet nur
 * zwei Aufrufe. Besitz woechentlich: Der PS+-Katalog wechselt monatlich, und
 * die ganze Kaufliste sind rund 15 Aufrufe - ein eigener Monatsplan waere
 * mehr Verwaltung als Gewinn und traefe den Wechsel trotzdem nur zufaellig
 * (Entscheidung des Nutzers vom 22.09.2026).
 */
export const BESITZ_FRIST_TAGE = 7;

/**
 * Wie viele Sync-Laeufe ihre Rohantworten behalten (Stufe 18d).
 *
 * Drei: Der Zweck der Rohablage ist eine Normalisierung, die sich ohne
 * PSN-Zugriff wiederholen laesst (Abschnitt 7.1) - dafuer reicht der letzte
 * Lauf, drei geben Luft, falls die letzte Nacht selbst der Fehler war.
 */
export const ROHANTWORTEN_LAEUFE = 3;

/** Schluessel des Blaetterungs-Fortschritts in app_setting. */
const SCHLUESSEL_SPIELZEIT = "psn_spielzeit_stand";
const SCHLUESSEL_BESITZ = "psn_besitz_stand";

export type CronErgebnis = {
	getan: "sync" | "spielzeit" | "besitz" | "igdb_auffrischen" | "igdb_physisch" | "aufraeumen" | "nichts";
	/** angekuendigt -> erschienen (8.4), in jedem Aufruf. */
	erschienen: number;
	/** Laeufe, die als haengengeblieben auf 'fehler' gesetzt wurden. */
	abgebrochen: number;
	/** Geloeschte Rohantworten alter Laeufe (Stufe 18d). */
	geloescht?: number;
	/** Gescheiterter Schritt ausserhalb des Syncs - fester Text, nie Fremdtext. */
	meldung?: string;
	sync?: SyncErgebnis;
	spielzeit?: SpielzeitErgebnis;
	besitz?: BesitzErgebnis;
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

	// 4./5. Spielzeit und digitaler Besitz (7.7). Erst nach dem Sync: Die
	//       Zuordnung laeuft ueber die Titel der Sammlung, und die sind nach
	//       dem Sync auf dem neuesten Stand. Beide brauchen einen Zugang -
	//       ohne NPSSO passiert hier nichts.
	const zugang = await repos.credentials.anzeige();
	if (zugang.eingerichtet && zugang.status !== "abgelaufen") {
		try {
			const spielzeit = await spielzeitLauf(repos, psn, heute);
			if (spielzeit) return { ...basis, getan: "spielzeit", spielzeit };

			const besitz = await besitzLauf(repos, psn, heute);
			if (besitz) return { ...basis, getan: "besitz", besitz };
		} catch (fehler) {
			// Ein abgelaufener Zugang oder ein PSN-Ausfall darf die Nacht nicht
			// beenden - die IGDB-Schritte danach laufen weiter.
			return { ...basis, getan: "nichts", meldung: "Der PSN-Abruf ist fehlgeschlagen." };
		}
	}

	// 6./7. IGDB nur mit Zugang; ohne bleibt die Nacht ruhig.
	//
	// In try/catch, weil eine Ausnahme hier bisher den ganzen Aufruf riss:
	// Der Sync lief dann zwar, aber alles danach fiel still aus, und von
	// aussen war das nicht zu sehen (Stufe 18b).
	if (igdb.konfiguriert()) {
		try {
			const auffrischen = await igdbAuffrischSchritt(repos, igdb, undefined, AUFFRISCH_FRIST_TAGE);
			if (auffrischen.angefragt > 0) return { ...basis, getan: "igdb_auffrischen", auffrischen };

			const physisch = await igdbPhysischSchritt(repos, igdb);
			if (physisch.angefragt > 0) return { ...basis, getan: "igdb_physisch", physisch };
		} catch (fehler) {
			return { ...basis, getan: "nichts", meldung: meldungFuer(fehler) };
		}
	}

	// 8. Aufraeumen: Rohantworten, die niemand mehr braucht. Ein einzelnes
	//    DELETE ueber einen Index - die leichteste Arbeit der Reihenfolge und
	//    deshalb ganz hinten. Sie belegt einen Aufruf, der sonst "nichts" tut,
	//    und niemals denselben wie eine schwere Arbeit: Jeder Schritt davor
	//    kehrt bei Erfolg sofort zurueck (CPU-Grenze, Abschnitt 10.1).
	const geloescht = await repos.sync.rohantwortenAufraeumen(ROHANTWORTEN_LAEUFE);
	if (geloescht > 0) return { ...basis, getan: "aufraeumen", geloescht };

	return { ...basis, getan: "nichts" };
}

/**
 * Hat dieser Aufruf gar nichts bewirkt?
 *
 * Nur solche Ausgaenge werden im Verlauf verdichtet (Stufe 18d). Ein Fehler
 * ist kein Leerlauf - er soll stehen bleiben, auch wenn danach zwanzig leere
 * Aufrufe folgen.
 */
export function cronWirkungslos(e: CronErgebnis): boolean {
	return e.getan === "nichts" && e.erschienen === 0 && e.abgebrochen === 0 && e.meldung === undefined;
}

/**
 * Eine Seite Spielzeit, wenn heute noch nicht alles geholt wurde.
 *
 * Der Stand steht als "datum:offset" in app_setting: Ein neuer Tag beginnt
 * bei 0, ein abgeschlossener Tag traegt offset -1 und laesst den Schritt
 * ruhen. Damit macht jeder Aufruf genau eine Seite - dieselbe Blaetterung
 * wie beim Trophaeen-Sync (Abschnitt 2).
 */
async function spielzeitLauf(repos: Repositories, psn: PsnClient, heute: string): Promise<SpielzeitErgebnis | null> {
	const stand = await repos.sync.fortschritt(SCHLUESSEL_SPIELZEIT);
	const [tag, offsetRoh] = (stand ?? "").split(":");
	const offset = tag === heute ? Number(offsetRoh) : 0;
	if (tag === heute && offset < 0) return null;

	const { accessToken } = await sitzungBesorgen(repos, psn);
	const ergebnis = await spielzeitSchritt(repos, psn, accessToken, offset);
	if (ergebnis.status === "fehler") {
		// Der Tag gilt als erledigt, damit ein Ausfall nicht die ganze Nacht
		// dieselbe Seite anfragt; morgen wird es erneut versucht.
		await repos.sync.fortschrittSetzenWert(SCHLUESSEL_SPIELZEIT, `${heute}:-1`);
		return ergebnis;
	}
	await repos.sync.fortschrittSetzenWert(
		SCHLUESSEL_SPIELZEIT,
		ergebnis.weiter ? `${heute}:${offset + ergebnis.geholt}` : `${heute}:-1`,
	);
	return ergebnis;
}

/**
 * Eine Seite der Kaufliste, wenn der letzte vollstaendige Durchlauf laenger
 * als BESITZ_FRIST_TAGE her ist.
 *
 * Der Stand haelt Startdatum, Blaetterung und die bisher gesehenen
 * PS+-Releases: Erst wenn alle Seiten da sind, raeumt `besitzSchritt` auf -
 * ein abgebrochener Lauf loescht nichts (7.7).
 */
async function besitzLauf(repos: Repositories, psn: PsnClient, heute: string): Promise<BesitzErgebnis | null> {
	const stand = await repos.sync.fortschritt(SCHLUESSEL_BESITZ);
	const gespeichert = stand ? (JSON.parse(stand) as { fertigAm?: string; start?: number; gesehen?: number[] }) : {};

	const laeuft = typeof gespeichert.start === "number";
	if (!laeuft && gespeichert.fertigAm && tageSeit(gespeichert.fertigAm, heute) < BESITZ_FRIST_TAGE) return null;

	const { accessToken } = await sitzungBesorgen(repos, psn);
	const gesehen = laeuft ? (gespeichert.gesehen ?? []) : [];
	const start = laeuft ? (gespeichert.start ?? 0) : 0;
	const ergebnis = await besitzSchritt(repos, psn, accessToken, start, gesehen);

	if (ergebnis.status === "fehler") {
		// Abgebrochen: Der halbe Stand wird verworfen, damit der naechste
		// Durchlauf sauber von vorn beginnt - und nichts geloescht wird.
		await repos.sync.fortschrittSetzenWert(SCHLUESSEL_BESITZ, JSON.stringify({ fertigAm: heute }));
		return ergebnis;
	}
	await repos.sync.fortschrittSetzenWert(
		SCHLUESSEL_BESITZ,
		ergebnis.weiter
			? JSON.stringify({ start: start + ergebnis.geholt, gesehen })
			: JSON.stringify({ fertigAm: heute }),
	);
	return ergebnis;
}

/** Ganze Tage zwischen zwei ISO-Datumsangaben (YYYY-MM-DD). */
function tageSeit(vorher: string, heute: string): number {
	const a = Date.parse(`${vorher}T00:00:00Z`);
	const b = Date.parse(`${heute}T00:00:00Z`);
	if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
	return Math.floor((b - a) / 86_400_000);
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
	if (e.geloescht) teile.push(`geloescht=${e.geloescht}`);
	if (e.sync) {
		teile.push(`sync=${e.sync.status}/${e.sync.phase}`, `offset=${e.sync.offset}`);
		if (e.sync.status === "erfolg") teile.push(`titel=${e.sync.titlesSeen ?? 0}`, `eingereiht=${e.sync.eingereiht ?? 0}`);
		if (e.sync.meldung) teile.push(`meldung="${e.sync.meldung}"`);
	}
	if (e.spielzeit) {
		teile.push(
			`spielzeit=${e.spielzeit.status}`,
			`geholt=${e.spielzeit.geholt}`,
			`zugeordnet=${e.spielzeit.zugeordnet}`,
		);
		if (e.spielzeit.meldung) teile.push(`meldung="${e.spielzeit.meldung}"`);
	}
	if (e.besitz) {
		teile.push(
			`besitz=${e.besitz.status}`,
			`geholt=${e.besitz.geholt}`,
			`kauf=${e.besitz.kauf}`,
			`plus=${e.besitz.plus}`,
			`entfallen=${e.besitz.entfallen}`,
		);
		if (e.besitz.erledigt) teile.push(`erledigt=${e.besitz.erledigt}`);
		if (e.besitz.meldung) teile.push(`meldung="${e.besitz.meldung}"`);
	}
	if (e.auffrischen) {
		teile.push(
			`auffrischen=${e.auffrischen.status}`,
			`angefragt=${e.auffrischen.angefragt}`,
			`aktualisiert=${e.auffrischen.aktualisiert}`,
			`ohneAntwort=${e.auffrischen.ohneAntwort ?? 0}`,
		);
		if (e.auffrischen.meldung) teile.push(`meldung="${e.auffrischen.meldung}"`);
	}
	if (e.meldung) teile.push(`meldung="${e.meldung}"`);
	if (e.physisch) {
		teile.push(`physisch=${e.physisch.status}`, `angefragt=${e.physisch.angefragt}`, `gesetzt=${e.physisch.gesetzt}`);
		if (e.physisch.meldung) teile.push(`meldung="${e.physisch.meldung}"`);
	}
	return teile.join(" ");
}
