import type { Repositories } from "../db";
import { einreihungSumme, type Einreihung } from "../db/review";
import type { ZugangsZeile } from "../db/credentials";
import type { SyncAusloeser, SyncLauf } from "../db/sync";
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
 * Eine PSN-Sitzung fuer EINEN Aufruf (Nachtrag 18q, Abschnitt 7.1).
 *
 * Reihenfolge: ein gespeichertes Access Token, das noch mindestens
 * ACCESS_RESTZEIT_MS gilt; sonst der Refresh-Token; das NPSSO nur als
 * Rueckfall. Bis 18q erneuerte jeder arbeitende Aufruf das Token bei Sony -
 * rund 28-mal je Nacht fuer ein Token, das eine Stunde gilt.
 *
 * `token` ist eine Funktion und holt erst beim ersten Bedarf (Stufe 18i: Ein
 * Leerlauf soll Sony nicht anfragen); danach gilt dasselbe Token fuer den
 * ganzen Aufruf. `zeile` ist die Zeile aus dem Lage-Batch des Crons - ohne sie
 * wird gelesen (Knopf, Routen).
 *
 * **`psn` ist der Client, den der Aufrufer benutzen muss.** Lehnt Sony ein
 * WIEDERVERWENDETES Token ab (401), wird genau einmal erneuert und derselbe
 * Abruf wiederholt. Ohne das stuende ein abgelehntes, aber gespeichertes Token
 * bis zu seinem Ablauf da, und ein 401 setzt den Zugang im Sync auf
 * 'abgelaufen' - die ganze PSN-Automatik stuende still, obwohl der
 * Refresh-Token lebt. Ein FRISCH geholtes Token wird nicht wiederholt: Dessen
 * Ablehnung ist eine Antwort, kein Ueberbleibsel.
 */
export function psnSitzung(
	repos: Repositories,
	psn: PsnClient,
	zeile?: ZugangsZeile | null,
): { token: () => Promise<Geheimnis>; psn: PsnClient } {
	let aktuell: Promise<{ token: Geheimnis; wiederverwendet: boolean }> | null = null;
	// Nach einer Erneuerung: das abgelehnte Token und sein Ersatz. Ein Schritt,
	// der das Token einmal geholt hat und mehrere Abrufe macht, reicht weiter
	// das alte herein - es wird bei jedem Abruf getauscht.
	let ersetzt: { alt: Geheimnis; neu: Geheimnis } | null = null;

	const besorgen = () => (aktuell ??= sitzungHolen(repos, psn, zeile, true));
	const token = async () => (await besorgen()).token;

	const client = new Proxy(psn, {
		get(ziel, name, empf) {
			const wert = Reflect.get(ziel, name, empf);
			if (typeof wert !== "function") return wert;
			return async (...argumente: unknown[]) => {
				if (ersetzt && argumente[0] === ersetzt.alt) argumente = [ersetzt.neu, ...argumente.slice(1)];
				try {
					return await wert.apply(ziel, argumente);
				} catch (fehler) {
					const stand = aktuell ? await aktuell.catch(() => null) : null;
					if (
						!(fehler instanceof PsnAuthError) ||
						ersetzt ||
						!stand?.wiederverwendet ||
						argumente[0] !== stand.token
					) {
						throw fehler;
					}
					aktuell = sitzungHolen(repos, psn, zeile, false);
					ersetzt = { alt: stand.token, neu: (await aktuell).token };
					return wert.apply(ziel, [ersetzt.neu, ...argumente.slice(1)]);
				}
			};
		},
	});
	return { token, psn: client };
}

async function sitzungHolen(
	repos: Repositories,
	psn: PsnClient,
	gelesen: ZugangsZeile | null | undefined,
	wiederverwenden: boolean,
): Promise<{ token: Geheimnis; wiederverwendet: boolean }> {
	const zeile = gelesen === undefined ? await repos.credentials.zeileLesen() : gelesen;
	if (wiederverwenden) {
		const gespeichert = await repos.credentials.gueltigerAccessToken(zeile);
		if (gespeichert) return { token: gespeichert, wiederverwendet: true };
	}

	const refresh = await repos.credentials.gueltigerRefreshToken(new Date(), zeile);
	if (refresh) {
		try {
			return { token: await sitzungMerken(repos, await psn.tokenAusRefresh(refresh)), wiederverwendet: false };
		} catch (fehler) {
			if (!(fehler instanceof PsnAuthError)) throw fehler;
			// Refresh abgelehnt - unten ueber das NPSSO versuchen.
		}
	}

	const npsso = await repos.credentials.npsso(zeile);
	if (!npsso) {
		throw new KeinNpssoError("Es ist kein NPSSO hinterlegt.");
	}
	return { token: await sitzungMerken(repos, await psn.tokenAusNpsso(npsso)), wiederverwendet: false };
}

/** Nur das Token, ohne Wiederholung - fuer Tests und Aufrufer ohne eigenen Client. */
export async function sitzungBesorgen(repos: Repositories, psn: PsnClient): Promise<{ accessToken: Geheimnis }> {
	return { accessToken: await psnSitzung(repos, psn).token() };
}

async function sitzungMerken(repos: Repositories, sitzung: Sitzung): Promise<Geheimnis> {
	await repos.credentials.sitzungSpeichern(sitzung);
	return sitzung.accessToken;
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
	// Aus dem Lage-Batch des Crons: die Zugangszeile (Nachtrag 18q) und der
	// laufende Lauf (Stufe 18p) - `null` heisst "keiner", fehlt der Schluessel,
	// wird gelesen (Knopf).
	optionen: { ausloeser?: SyncAusloeser; zeile?: ZugangsZeile | null; laufend?: SyncLauf | null } = {},
): Promise<SyncErgebnis> {
	// Ein laufender Lauf wird fortgesetzt, egal wer ihn startete; nur ein
	// neuer traegt den Ausloeser (Stufe 18: der Cron nimmt dieselben Pfade).
	const laufend = optionen.laufend === undefined ? await repos.sync.laufenderLauf() : optionen.laufend;
	const lauf = laufend ?? (await repos.sync.starten(optionen.ausloeser ?? "nutzer"));

	if (lauf.phase === "normalisierung") {
		return normalisierungsSchritt(repos, lauf.id, lauf.titles_seen);
	}

	let offset = lauf.next_offset;
	let seitenGeholt = 0;

	try {
		const sitzung = psnSitzung(repos, psn, optionen.zeile);
		const accessToken = await sitzung.token();
		let gesamt: number | null = null;

		while (seitenGeholt < SEITEN_JE_AUFRUF) {
			const { pfad, roh } = await sitzung.psn.holeTrophyTitlesSeite(
				accessToken,
				offset,
				SEITENGROESSE,
			);
			gesamt = extractTotalItemCount(roh);
			const weiterAb = naechsterOffset(offset, SEITENGROESSE, gesamt);
			// Rohantwort und Fortschritt in EINEM Batch (Stufe 18p).
			// `extractTotalItemCount` wirft nie - die Rohantwort geht also nicht
			// verloren, weil vorher ausgewertet wird.
			await repos.sync.abrufSichern(lauf.id, pfad, roh, weiterAb);
			seitenGeholt++;

			if (weiterAb === null) {
				// Abruf fertig - jetzt normalisieren, im naechsten Aufruf.
				// Der Lauf wird hier bewusst NICHT abgeschlossen: Er bleibt
				// 'laufend', damit der naechste Aufruf ihn wiederfindet, statt
				// einen neuen zu starten und erneut PSN abzurufen.
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
	// EIN Lese-Batch (Stufe 18p): die naechste Rohantwort und die Listen ohne
	// Zuordnung. Die zweite braucht nur der Abschluss; sie laeuft trotzdem in
	// jedem Aufruf mit, weil sie ueber den Index auf release_id nur die Zeilen
	// ohne Zuordnung liest - meist keine (test/lesekosten.spec.ts).
	const [roh, unzugeordnet] = await repos.gemeinsam([
		repos.sync.naechsteUnverarbeiteteBaustein(laufId),
		repos.games.unzugeordnetBaustein(),
	] as const);

	if (!roh) {
		// Nach der Normalisierung: neue Listen, die eindeutig zu einem
		// bestehenden Release passen, automatisch zuordnen (Abschnitt 7.2).
		// Beim Erstlauf greift das nie - es gibt noch keine Spiele.
		if (unzugeordnet.length > 0) await ordneAutomatischZu(repos, unzugeordnet);

		// EIN Schreib-Batch fuer den ganzen Abschluss (Stufe 18p), statt
		// zehn Aufrufen nacheinander. Die Reihenfolge ist die von vorher:
		//  1. Abschnitt 4.2: Erst jetzt, mit zugeordneten Listen, bekommt ein
		//     Release seinen ersten Status. Schreibt nur ohne Zeile oder bei
		//     'nicht_gespielt' - ein gesetzter Status ueberlebt jeden Sync.
		//  2. Abschnitt 8.1: Der Sync schreibt nur in die Warteschlange, nie
		//     einen Status - nie durchgesehene Listen als 'erstimport',
		//     Aenderungen gegenueber dem Stempel der letzten Durchsicht als
		//     'neue_trophaeen' oder 'dlc_erweitert'. Sieht den Status aus 1.
		//  3. Den Lauf abschliessen, die Listen zaehlt dieselbe Anweisung.
		//  4. Den Erfolg am Zugang vermerken.
		// Scheitert eine Anweisung, scheitert der ganze Abschluss: Der Lauf
		// bleibt 'laufend' ohne offene Rohantwort, und der naechste Aufruf
		// versucht genau diesen Abschluss erneut. Halb geschehen ist nichts -
		// bis 18p konnte ein Lauf vorbelegt, aber nicht abgeschlossen sein.
		const [vorbelegt, einreihung, gesamt] = await repos.gemeinsam([
			repos.playStatus.vorbelegenBaustein(),
			repos.review.einreihenBaustein(),
			repos.sync.abschliessenBaustein(laufId),
			repos.credentials.erfolgVermerkenBaustein(),
		] as const);
		const { erstimport, neueTrophaeen, dlcErweitert } = einreihung;
		const eingereihtNachGrund = { erstimport, neueTrophaeen, dlcErweitert };
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
		// EIN Schreib-Batch (Stufe 18p): Protokoll und Upsert der Seite, dann
		// die Rohantwort als normalisiert markieren, dann zaehlen, was offen
		// bleibt. Scheitert eine Anweisung, bleibt die Rohantwort offen und
		// nichts von der Seite ist geschrieben - bis 18p konnte eine Seite
		// geschrieben, aber nicht markiert sein und lief dann zweimal.
		const [geschrieben, offen] = await repos.gemeinsam([
			repos.trophies.upsertSeiteBaustein(titel),
			repos.sync.normalisiertBaustein(roh.id, laufId),
		] as const);
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
