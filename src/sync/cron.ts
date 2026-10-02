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
import { meldungFuer as ebayMeldung, type EbayClient } from "../ebay/client";
import { FEHLVERSUCHE_HOECHSTENS, sitzungBesorgen, syncSchritt, type SyncErgebnis } from "./run";
import { marktSchritt, type MarktErgebnis } from "./markt";
import { storeSchritt, type StoreSchrittErgebnis } from "./store";
import { meldungFuer as storeMeldung, type StoreClient } from "../psn/store";
import { eineListe, jahreSchritt, levelSchritt, type ListenErgebnis } from "./trophaeen";

/**
 * Die naechtliche Automatik (Stufe 18, Abschnitt 10.1).
 *
 * Auf dem Free Tier gilt fuer einen Cron-Aufruf dieselbe 10-ms-CPU-Grenze wie
 * fuer eine Anfrage - ein Aufruf tut deshalb genau EINE schwere Arbeit, der
 * Fortschritt liegt in der Datenbank, der naechste Aufruf macht weiter.
 *
 * Seit Stufe 18e sind es ZWEI Cron-Eintraege (wrangler.jsonc), und der
 * Bereich sagt, welcher gerufen hat:
 *
 * - `psn` (alle fuenf Minuten 03:00-05:59 UTC, 36 Aufrufe): Haenger
 *   aufraeumen, Sync-Schritt, Spielzeit, Kaufliste. Alles, was Sony anfasst,
 *   und damit alles, was viele Aufrufe braucht.
 * - `wartung` (alle fuenf Minuten 06:00-07:59 UTC, 24 Aufrufe): erschienene
 *   Titel freigeben, IGDB-Auffrischen, Disc-Fassungen, alte Rohantworten.
 *   Nichts davon fasst PSN an.
 *
 * Der Grund ist gemessen: Eine Nacht mit Kaufliste braucht elf Aufrufe fuer
 * den Sync, zwei fuer die Spielzeit, fuenfzehn fuer die Kaufliste und - nach
 * einem IGDB-Rueckstand - acht fuers Auffrischen; das sind 37 von 36
 * (Rechnung vom 24.09.2026, 10.1). Die Aufteilung nach "fasst PSN an oder
 * nicht" ist der Schnitt, an dem beide Haelften bequem passen, und sie trennt
 * zwei Lastspitzen, die nichts miteinander zu tun haben. Der Free Tier
 * erlaubt fuenf Eintraege je Konto; wir nutzen zwei.
 *
 * Es sind dieselben Pfade wie auf Knopfdruck. Deshalb protokolliert der Cron
 * ohne eigenes Zutun mit Quelle 'sync' beziehungsweise 'igdb' (8.5).
 */

/** Welcher Cron-Eintrag ruft - `alles` ist der Rueckfall und die Testbarkeit. */
export type CronBereich = "psn" | "wartung" | "alles";

/**
 * Die beiden Cron-Ausdruecke, genau wie sie in `wrangler.jsonc` stehen.
 *
 * Sie stehen hier, weil der Einstieg den Bereich aus `event.cron` ableitet -
 * Cloudflare liefert den Ausdruck mit, der gefeuert hat. Wer einen Ausdruck
 * in wrangler.jsonc aendert, aendert ihn hier mit; `test/cron.spec.ts` haelt
 * fest, dass beide Seiten dasselbe sagen.
 */
export const CRON_PSN = "*/5 3-5 * * *";
export const CRON_WARTUNG = "*/5 6-8 * * *";

/**
 * Bereich zu einem Cron-Ausdruck. Ein unbekannter Ausdruck bekommt `alles`:
 * Lieber ein Aufruf, der zu viel tut, als eine Haelfte der Automatik, die
 * nach einer Konfigurationsaenderung still ausfaellt.
 */
export function bereichFuerAusdruck(ausdruck: string | undefined): CronBereich {
	if (ausdruck === CRON_PSN) return "psn";
	if (ausdruck === CRON_WARTUNG) return "wartung";
	return "alles";
}

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
	getan:
		| "sync"
		| "spielzeit"
		| "besitz"
		| "trophaeen"
		| "level"
		| "jahre"
		| "igdb_auffrischen"
		| "igdb_physisch"
		| "markt"
		| "store"
		| "aufraeumen"
		| "nichts";
	/** angekuendigt -> erschienen (8.4), in jedem Aufruf. */
	erschienen: number;
	/** Laeufe, die als haengengeblieben auf 'fehler' gesetzt wurden. */
	abgebrochen: number;
	/** Geloeschte Rohantworten alter Laeufe (Stufe 18d). */
	geloescht?: number;
	/** Gescheiterter Schritt ausserhalb des Syncs - fester Text, nie Fremdtext. */
	meldung?: string;
	/** Welcher Bereich lief (Stufe 18e) - steht in der Verlaufszeile. */
	bereich?: CronBereich;
	sync?: SyncErgebnis;
	spielzeit?: SpielzeitErgebnis;
	besitz?: BesitzErgebnis;
	trophaeen?: ListenErgebnis;
	level?: number;
	jahre?: number;
	markt?: MarktErgebnis;
	store?: StoreSchrittErgebnis;
	auffrischen?: AuffrischErgebnis;
	physisch?: PhysischErgebnis;
};

/**
 * Ein Aufruf der Automatik. `heute` ist das UTC-Datum (YYYY-MM-DD) und nur
 * fuer Tests ueberschreibbar; `bereich` sagt, welcher Cron-Eintrag ruft.
 */
export async function cronSchritt(
	repos: Repositories,
	psn: PsnClient,
	igdb: IgdbClient,
	ebay: EbayClient,
	store: StoreClient,
	optionen: { heute?: string; bereich?: CronBereich } = {},
): Promise<CronErgebnis> {
	const heute = optionen.heute ?? heuteIso();
	const bereich = optionen.bereich ?? "alles";
	const basis: Pick<CronErgebnis, "erschienen" | "abgebrochen" | "bereich"> = {
		erschienen: 0,
		abgebrochen: 0,
		bereich,
	};

	// --- PSN: alles, was Sony anfasst --------------------------------------
	if (bereich !== "wartung") {
		// 1. Ein Lauf ohne Fortschritt seit einem ganzen Fenster blockiert
		//    sonst jede Nacht - laufenderLauf() faende ihn immer wieder.
		basis.abgebrochen = await repos.sync.haengendeAbbrechen(HAENGT_NACH_STUNDEN);

		// 2. Ein laufender Lauf wird fortgesetzt - auch einer vom Nutzer, und
		//    auch einer, dessen letzter Aufruf an einer Seite scheiterte
		//    (Stufe 18e: ein Abrufsfehler beendet den Lauf nicht mehr).
		if (await repos.sync.laufenderLauf()) {
			return { ...basis, getan: "sync", sync: await syncSchritt(repos, psn) };
		}

		// 3. Ein Cron-Versuch je Nacht (Entscheidung des Nutzers vom
		//    19.09.2026): nicht nach einem eigenen Lauf von heute, nicht nach
		//    einem erfolgreichen Handabruf von heute - wohl aber nach einem
		//    fehlgeschlagenen oder abgebrochenen Handlauf.
		if (await syncFaellig(repos, heute)) {
			return { ...basis, getan: "sync", sync: await syncSchritt(repos, psn, { ausloeser: "cron" }) };
		}

		// 4./5. Spielzeit und digitaler Besitz (7.7). Erst nach dem Sync: Die
		//       Zuordnung laeuft ueber die Titel der Sammlung, und die sind
		//       nach dem Sync auf dem neuesten Stand. Beide brauchen einen
		//       Zugang - ohne NPSSO passiert hier nichts.
		const zugang = await repos.credentials.anzeige();
		if (zugang.eingerichtet && zugang.status !== "abgelaufen") {
			try {
				const spielzeit = await spielzeitLauf(repos, psn, heute);
				if (spielzeit) return { ...basis, getan: "spielzeit", spielzeit };

				const besitz = await besitzLauf(repos, psn, heute);
				if (besitz) return { ...basis, getan: "besitz", besitz };

				// 6. Einzeltrophaeen (7.7, Stufe 19b) - eine Liste je Aufruf.
				//    Ganz hinten in der PSN-Kette, weil der Portionsknopf der
				//    Hauptweg ist: Dieser Schritt ist das Netz fuer den Fall,
				//    dass niemand drueckt, und die Nachfuehrung fuer Listen,
				//    an denen sich etwas geaendert hat. Beides ist dieselbe
				//    Auswahl (naechsteZumFuellen).
				const trophaeen = await trophaeenLauf(repos, psn);
				if (trophaeen) return { ...basis, getan: "trophaeen", trophaeen };

				// 7. Das Trophaeen-Level, hoechstens einmal am Tag und nur,
				//    wenn nichts mehr zu fuellen ist: ein einzelner Abruf, der
				//    niemals einen Aufruf kostet, den die Erstbefuellung
				//    braucht.
				const { accessToken } = await sitzungBesorgen(repos, psn);
				const level = await levelSchritt(repos, psn, accessToken, heute);
				if (level) return { ...basis, getan: "level", level: level.level };
			} catch (fehler) {
				// Ein abgelaufener Zugang oder ein PSN-Ausfall darf die Nacht
				// nicht beenden - die Wartung laeuft in ihrem eigenen Fenster
				// ohnehin weiter.
				return { ...basis, getan: "nichts", meldung: "Der PSN-Abruf ist fehlgeschlagen." };
			}
		}

		// 8. Store-Preise (7.4, Stufe 21). Im PSN-Fenster, weil es Sonys
		//    Schnittstelle ist - aber AUSSERHALB der Zugangspruefung: Der
		//    Store antwortet ohne Token, und ein abgelaufenes NPSSO darf die
		//    Preise nicht stilllegen. Ganz hinten in der Kette und mit
		//    eigenem try/catch, aus demselben Grund wie bei IGDB (18b): Der
		//    Schritt darf keinen Aufruf belegen, den eine schwere Arbeit
		//    braucht, und sein Ausfall nicht die Nacht kosten.
		try {
			const preise = await storeSchritt(repos, store, igdb);
			if (preise.geprueft > 0 || preise.status === "fehler") {
				return { ...basis, getan: "store", store: preise };
			}
		} catch (fehler) {
			return { ...basis, getan: "nichts", meldung: storeMeldung(fehler) };
		}
	}

	// --- Wartung: nichts davon fasst PSN an ---------------------------------
	if (bereich !== "psn") {
		// 6. Der taegliche Statuswechsel aus 8.4 ist ein einzelner Batch ohne
		//    Rechenarbeit und protokolliert selbst.
		basis.erschienen = await repos.games.erschieneneFreigeben();

		// 7./8. IGDB nur mit Zugang; ohne bleibt es ruhig.
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

		// 9. Gebrauchtpreise und Disc-Nachweis aus eBay (7.3, Stufe 20).
		//    Hier und nicht im PSN-Fenster: Der Schritt fasst Sony nicht an.
		//    Eigenes try/catch aus demselben Grund wie bei IGDB (18b) - und
		//    zwanzig Releases sind vierzig Fremdanfragen, also zehn unter den
		//    50 je Aufruf (Stufe 20e). Vor den beiden billigen Schritten, damit
		//    die nicht einen Aufruf belegen, in dem noch echte Arbeit wartet.
		if (ebay.konfiguriert()) {
			try {
				const markt = await marktSchritt(repos, ebay);
				if (markt.geprueft > 0 || markt.status === "fehler") return { ...basis, getan: "markt", markt };
			} catch (fehler) {
				return { ...basis, getan: "nichts", meldung: ebayMeldung(fehler) };
			}
		}

		// 10. Sonst die Trophäen je Jahr durchrechnen - einmal am Tag, im
		//     billigen Fenster. 18 060 gelesene Zeilen sind für die Startseite
		//     zu teuer (Abschnitt 2); hier stören sie niemanden, und das
		//     Dashboard liest danach eine Zeile aus app_setting.
		const jahre = await jahreSchritt(repos, heute);
		if (jahre) return { ...basis, getan: "jahre", jahre: jahre.jahre.length };

		// 11. Aufraeumen: Rohantworten, die niemand mehr braucht. Ein einzelnes
		//     DELETE ueber einen Index - die leichteste Arbeit der Reihenfolge
		//     und deshalb ganz hinten. Sie belegt einen Aufruf, der sonst
		//     "nichts" tut, und niemals denselben wie eine schwere Arbeit: Jeder
		//     Schritt davor kehrt bei Erfolg sofort zurueck (CPU-Grenze, 10.1).
		const geloescht = await repos.sync.rohantwortenAufraeumen(ROHANTWORTEN_LAEUFE);
		if (geloescht > 0) return { ...basis, getan: "aufraeumen", geloescht };
	}

	return { ...basis, getan: "nichts" };
}

/**
 * Eine Seite Spielzeit, wenn heute noch nicht alles geholt wurde.
 *
 * Der Stand steht als "datum:offset[:versuche]" in app_setting: Ein neuer Tag
 * beginnt bei 0, ein abgeschlossener Tag traegt offset -1 und laesst den
 * Schritt ruhen. Damit macht jeder Aufruf genau eine Seite - dieselbe
 * Blaetterung wie beim Trophaeen-Sync (Abschnitt 2). Das dritte Feld fehlt in
 * alten Werten und zaehlt dann als 0.
 *
 * **Ein Abrufsfehler beendet den Tag nicht mehr (Stufe 18f).** Bis hierher
 * schrieb jeder Fehler `-1`, und der Tag war erledigt. In der Nacht zum
 * 01.10.2026 ist das eingetreten: Die erste Seite kam durch, die zweite
 * bekam 403, und damit blieben 179 von 379 Titeln ohne frische Spielzeit,
 * waehrend 20 Aufrufe des Fensters leer liefen. Genau denselben Fall hat 18e
 * fuer den Sync geloest - dieser Schritt ist aelter als die Einsicht und hat
 * sie nie bekommen.
 *
 * Jetzt bleibt der Offset bei einem Fehler stehen, und der naechste Aufruf
 * holt fuenf Minuten spaeter dieselbe Seite erneut. Nach
 * FEHLVERSUCHE_HOECHSTENS Anlaeufen ruht der Tag wie bisher; jeder Fortschritt
 * setzt den Zaehler zurueck. Ein abgelehnter Token kommt hier nicht an: Den
 * wirft `sitzungBesorgen` als PsnAuthError, bevor der Schritt laeuft.
 */
async function spielzeitLauf(repos: Repositories, psn: PsnClient, heute: string): Promise<SpielzeitErgebnis | null> {
	const stand = await repos.sync.fortschritt(SCHLUESSEL_SPIELZEIT);
	const [tag, offsetRoh, versucheRoh] = (stand ?? "").split(":");
	const vonHeute = tag === heute;
	const offset = vonHeute ? Number(offsetRoh) : 0;
	const bisher = vonHeute ? Number(versucheRoh ?? 0) || 0 : 0;
	if (vonHeute && offset < 0) return null;

	const { accessToken } = await sitzungBesorgen(repos, psn);
	const ergebnis = await spielzeitSchritt(repos, psn, accessToken, offset);
	if (ergebnis.status === "erfolg") await zugangGeglueckt(repos);
	if (ergebnis.status === "fehler") {
		const versuche = bisher + 1;
		// Unter der Grenze bleibt der Offset stehen - der naechste Aufruf holt
		// dieselbe Seite. Erst danach ruht der Tag.
		await repos.sync.fortschrittSetzenWert(
			SCHLUESSEL_SPIELZEIT,
			versuche < FEHLVERSUCHE_HOECHSTENS ? `${heute}:${offset}:${versuche}` : `${heute}:-1`,
		);
		return { ...ergebnis, versuche };
	}
	// Fortschritt setzt den Zaehler zurueck: Gezaehlt werden Versuche an
	// derselben Stelle, nicht ueber die Nacht verteilte.
	await repos.sync.fortschrittSetzenWert(
		SCHLUESSEL_SPIELZEIT,
		ergebnis.weiter ? `${heute}:${offset + ergebnis.geholt}` : `${heute}:-1`,
	);
	return ergebnis;
}

/**
 * Eine Liste Einzeltrophaeen, wenn eine offen ist. `null` heisst "nichts zu
 * tun" - dann ist der Bestand vollstaendig und nichts hat sich geaendert.
 *
 * Kein eigener Fehlversuchszaehler: Anders als bei Sync und Spielzeit haengt
 * hier kein Offset an einem Lauf, den ein Fehler verlieren koennte. Scheitert
 * der Abruf, wird nicht gestempelt, und derselbe Aufruf waehlt die Liste in
 * fuenf Minuten erneut - die Wiederholung ist die Auswahl selbst. Die
 * Ausnahme faengt `cronSchritt` ab, wie bei Spielzeit und Kaufliste.
 */
async function trophaeenLauf(repos: Repositories, psn: PsnClient): Promise<ListenErgebnis | null> {
	const [liste] = await repos.trophaeen.naechsteZumFuellen(1);
	if (!liste) return null;
	const { accessToken } = await sitzungBesorgen(repos, psn);
	const ergebnis = await eineListe(repos, psn, accessToken, liste);
	await zugangGeglueckt(repos);
	return ergebnis;
}

/** Der Stand der Kaufliste in app_setting (Stufe 18c, `fehlerAm` seit 18e). */
export type BesitzStand = { fertigAm?: string; fehlerAm?: string; start?: number; gesehen?: number[] };

/** Was `GET /api/sync/status` ueber die Kaufliste sagt (Stufe 18e). */
export async function besitzStand(repos: Repositories): Promise<BesitzStand> {
	const stand = await repos.sync.fortschritt(SCHLUESSEL_BESITZ);
	if (!stand) return {};
	try {
		return JSON.parse(stand) as BesitzStand;
	} catch {
		return {};
	}
}

/**
 * Eine Seite der Kaufliste, wenn der letzte vollstaendige Durchlauf laenger
 * als BESITZ_FRIST_TAGE her ist. `null` heisst "nicht faellig".
 *
 * Der Stand haelt Startdatum, Blaetterung und die bisher gesehenen
 * PS+-Releases: Erst wenn alle Seiten da sind, raeumt `besitzSchritt` auf -
 * ein abgebrochener Lauf loescht nichts (7.7).
 *
 * **Ein Fehler ist kein "fertig" (Stufe 18e).** Bis dahin schrieben beide
 * Ausgaenge `{fertigAm}`, und ein gescheiterter Lauf sah aus wie ein
 * vollstaendiger - er legte den Schritt fuer sieben Tage still. Genau das ist
 * am 23.09.2026 passiert: Der erste Durchlauf ueberhaupt scheiterte auf
 * seiner ersten Seite, und weil die Marke dieselbe war, blieb es
 * unentdeckt, bis am 27.09.2026 auffiel, dass `digital_entitlement` keine
 * einzige Zeile mit `herkunft='psn'` haelt (7.7). Ein Fehler schreibt
 * deshalb `{fehlerAm}`: Der halbe Stand ist auch hier verworfen, damit der
 * naechste Durchlauf sauber von vorn beginnt und nichts loescht - aber die
 * Frist laeuft nicht, der naechste Abend versucht es erneut.
 *
 * `erzwingen` ueberspringt die Frist. Das nutzt der Knopf in den
 * Einstellungen: Ein Nutzer, der auf "Kaufliste jetzt abrufen" drueckt, will
 * nicht bis zum naechsten Termin warten.
 */
export async function besitzLauf(
	repos: Repositories,
	psn: PsnClient,
	heute: string,
	optionen: { erzwingen?: boolean } = {},
): Promise<BesitzErgebnis | null> {
	const gespeichert = await besitzStand(repos);

	const laeuft = typeof gespeichert.start === "number";
	if (
		!laeuft &&
		!optionen.erzwingen &&
		gespeichert.fertigAm &&
		tageSeit(gespeichert.fertigAm, heute) < BESITZ_FRIST_TAGE
	) {
		return null;
	}

	const { accessToken } = await sitzungBesorgen(repos, psn);
	const gesehen = laeuft ? (gespeichert.gesehen ?? []) : [];
	const start = laeuft ? (gespeichert.start ?? 0) : 0;
	const ergebnis = await besitzSchritt(repos, psn, accessToken, start, gesehen);
	if (ergebnis.status === "erfolg") await zugangGeglueckt(repos);

	if (ergebnis.status === "fehler") {
		await repos.sync.fortschrittSetzenWert(SCHLUESSEL_BESITZ, JSON.stringify({ fehlerAm: heute }));
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

/**
 * Ein geglueckter PSN-Abruf raeumt ein altes 'fehler' am Zugang weg
 * (Stufe 18e).
 *
 * Am Schritt, nicht am Cron: Sonst hat der Knopf "Kaufliste jetzt abrufen"
 * es nicht, und genau das ist am 27.09.2026 passiert - der Handlauf holte
 * 210 Berechtigungen, und in den Einstellungen stand weiter "Fehler beim
 * letzten Versuch". `last_success_at` bleibt dem Sync vorbehalten: Es
 * bedeutet "der Trophäenstand ist von da".
 */
async function zugangGeglueckt(repos: Repositories): Promise<void> {
	await repos.credentials.fehlerStatusLoeschen();
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
	const teile = [`cron: ${e.getan}`];
	// Nur was zu sagen ist: Seit Stufe 18e stehen zwei Cron-Eintraege
	// dahinter, und "erschienen=0" in jeder Zeile des PSN-Fensters waere eine
	// Zahl, die es dort gar nicht gibt. Der Zeitstempel ist das
	// Lebenszeichen, nicht die Null.
	if (e.bereich && e.bereich !== "alles") teile.push(`bereich=${e.bereich}`);
	if (e.erschienen) teile.push(`erschienen=${e.erschienen}`);
	if (e.abgebrochen) teile.push(`abgebrochen=${e.abgebrochen}`);
	if (e.geloescht) teile.push(`geloescht=${e.geloescht}`);
	if (e.sync) {
		teile.push(`sync=${e.sync.status}/${e.sync.phase}`);
		// In der Normalisierung bewegt sich der Offset nicht - er ist dort fest
		// 0, der Fortschritt sind die noch offenen Rohantworten. Fuenf Aufrufe
		// schrieben deshalb fuenfmal `offset=0`: Eine Seite, die immer wieder
		// scheitert, sah im Verlauf aus wie ein gesunder Lauf (Befund vom
		// 24.09.2026). `offeneSeiten` fuellt nur der Normalisierungsschritt -
		// fehlt es, ist der Offset die Zahl, die sich bewegt.
		if (e.sync.offeneSeiten === undefined) teile.push(`offset=${e.sync.offset}`);
		else teile.push(`offen=${e.sync.offeneSeiten}`);
		if (e.sync.status === "erfolg") teile.push(`titel=${e.sync.titlesSeen ?? 0}`, `eingereiht=${e.sync.eingereiht ?? 0}`);
		// Der Fehlversuch steht als Zahl da, damit "dreimal dieselbe Seite"
		// nicht wie "drei Seiten geholt" aussieht (Stufe 18e).
		if (e.sync.fehlversuche) teile.push(`versuch=${e.sync.fehlversuche}/${FEHLVERSUCHE_HOECHSTENS}`);
		if (e.sync.meldung) teile.push(`meldung="${e.sync.meldung}"`);
	}
	if (e.trophaeen) {
		// `trophaeen=null` heisst: PSN kennt diese Liste nicht mehr. Die Zeile
		// sagt das als Wort, damit es sich nicht als "0 Trophaeen geholt"
		// liest - das waere dieselbe Zahl mit einer ganz anderen Ursache.
		teile.push(
			`liste=${e.trophaeen.npCommunicationId}`,
			e.trophaeen.trophaeen === null ? "trophaeen=unbekannt" : `trophaeen=${e.trophaeen.trophaeen}`,
		);
		if (e.trophaeen.gruppen) teile.push(`gruppen=${e.trophaeen.gruppen}`);
	}
	if (e.level) teile.push(`level=${e.level}`);
	if (e.jahre) teile.push(`jahre=${e.jahre}`);
	if (e.markt) {
		// Vier Zahlen, weil sie vier verschiedene Dinge sagen: `geprueft` ist
		// die Portion, `preis` was einen Titelabgleich uebderstanden hat,
		// `disc` die Statuswechsel unbekannt -> ja, und `ohneAngebot` die
		// Releases, zu denen eBay in der Plattform-Kategorie NICHTS kennt -
		// der Hinweis auf eine reine Download-Fassung (7.3).
		teile.push(
			`markt=${e.markt.status}`,
			`geprueft=${e.markt.geprueft}`,
			`preis=${e.markt.mitPreis}`,
			`disc=${e.markt.discBelegt}`,
			`ohneAngebot=${e.markt.ohneAngebot}`,
			`offen=${e.markt.nochOffen}`,
		);
		if (e.markt.meldung) teile.push(`meldung="${e.markt.meldung}"`);
	}
	if (e.store) {
		// Fuenf Zahlen, weil sie fuenf Dinge sagen: `geprueft` ist die Portion,
		// `preis` was einen Kaufknopf hatte, `angebot` die Rabatte, `plus` die
		// Katalogtitel und `zugeordnet` die Releases, die erstmals eine
		// Produkt-Id bekamen. `anfragen` ist die Bilanz gegen die 50 je Aufruf.
		teile.push(
			`store=${e.store.status}`,
			`geprueft=${e.store.geprueft}`,
			`preis=${e.store.mitPreis}`,
			`angebot=${e.store.imAngebot}`,
			`plus=${e.store.imPlusKatalog}`,
			`zugeordnet=${e.store.zugeordnet}`,
			`anfragen=${e.store.anfragen}`,
			`offen=${e.store.nochOffen}`,
		);
		if (e.store.meldung) teile.push(`meldung="${e.store.meldung}"`);
	}
	if (e.spielzeit) {
		teile.push(
			`spielzeit=${e.spielzeit.status}`,
			// Die drei Zahlen sind ein Trichter: `geholt` ist die Seite von
			// Sony, `geschrieben` was den Plattformfilter ueberlebt hat,
			// `zugeordnet` was davon an einem Release haengt. Ohne die
			// mittlere las sich `geholt=200 zugeordnet=117` als 83 nicht
			// zugeordnete Spiele - es waren die Streaming-Apps (24.09.2026).
			`geholt=${e.spielzeit.geholt}`,
			`geschrieben=${e.spielzeit.geschrieben}`,
			`zugeordnet=${e.spielzeit.zugeordnet}`,
		);
		// Wie beim Sync (18e): Die Zahl trennt "dreimal dieselbe Seite" von
		// "drei Seiten geholt".
		if (e.spielzeit.versuche) teile.push(`versuch=${e.spielzeit.versuche}/${FEHLVERSUCHE_HOECHSTENS}`);
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
