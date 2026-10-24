import type { Repositories } from "../db";
import type { CronLage } from "../db/cron-lage";
import type { CronFakt, SyncLauf } from "../db/sync";
import { heuteIso } from "../domain/igdb";
import type { IgdbClient } from "../igdb/client";
import type { PsnClient } from "../psn/client";
import {
	AUFFRISCHEN_JE_AUFRUF,
	igdbAuffrischSchritt,
	igdbPhysischSchritt,
	meldungFuer,
	type AuffrischErgebnis,
	type PhysischErgebnis,
} from "./igdb";
import { besitzSchritt, spielzeitSchritt, type BesitzErgebnis, type SpielzeitErgebnis } from "./besitz";
import { FEHLVERSUCHE_HOECHSTENS, sitzungBesorgen, syncSchritt, type SyncErgebnis } from "./run";
import {
	eineListe,
	jahreSchritt,
	jahreStandAus,
	levelSchritt,
	levelStandAus,
	SCHLUESSEL_JAHRE,
	SCHLUESSEL_LEVEL,
	type ListenErgebnis,
} from "./trophaeen";

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
 * - `wartung` (alle fuenf Minuten 06:00-08:59 UTC, 36 Aufrufe): erschienene
 *   Titel freigeben, Trophaeen je Jahr, alte Rohantworten, IGDB-Auffrischen,
 *   Disc-Fassungen, Gebrauchtpreise. Nichts davon fasst PSN an.
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
 * Startstunde, Takt und Anzahl der Aufrufe eines Cron-Ausdrucks.
 *
 * Die Zahl stand bis Stufe "Refactoring" als Literal in zwei Tests und lief
 * damit auseinander: Als 20e das Wartungsfenster von den Stunden 6-7 auf 6-8
 * erweiterte, rechneten `test/cron.spec.ts` und `test/lesekosten.spec.ts`
 * weiter mit 24 statt 36 Aufrufen und prueften zwoelf Aufrufe zu wenig
 * (10.1). Jetzt steht sie nur noch im Ausdruck selbst.
 *
 * Erkannt wird allein die Form, die hier vorkommt - alle N Minuten zwischen
 * zwei Stunden; alles andere wirft, statt eine Zahl zu raten. (Die Form als
 * Muster steht in der Regex darunter: Ein Cron-Ausdruck mit Stern-Schrägstrich
 * laesst sich in einem Blockkommentar nicht schreiben, er beendet ihn.)
 */
export function cronFenster(ausdruck: string): { startStunde: number; takt: number; aufrufe: number } {
	const treffer = /^\*\/(\d+) (\d+)-(\d+) \* \* \*$/.exec(ausdruck);
	if (!treffer) throw new Error(`Cron-Ausdruck nicht auswertbar: ${ausdruck}`);
	const takt = Number(treffer[1]);
	const startStunde = Number(treffer[2]);
	const endStunde = Number(treffer[3]);
	if (takt < 1 || takt > 60 || startStunde > endStunde || endStunde > 23) {
		throw new Error(`Cron-Ausdruck nicht auswertbar: ${ausdruck}`);
	}
	return { startStunde, takt, aufrufe: Math.ceil(60 / takt) * (endStunde - startStunde + 1) };
}

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
 * Obergrenze des Auffrischens je Nacht (Stufe 18n, Vorgabe des Nutzers vom
 * 24.10.2026): ein Aufruf zu AUFFRISCHEN_JE_AUFRUF je angefangene 200
 * verknuepfte Spiele. Das ist Spiele / 7 Tage plus 75 % Puffer, auf ganze
 * Aufrufe aufgerundet - und garantiert bei jeder Bestandsgroesse, dass ein
 * voller Stau (alle Stempel vom selben Tag) nach hoechstens vier Naechten
 * abgebaut ist (simuliert am 24.10.2026). Ohne Grenze frischte eine Nacht je
 * Woche alles auf einmal auf: am 20.10.2026 neun Aufrufe zu 20-54 ms.
 */
export const AUFFRISCH_SPIELE_JE_NACHTAUFRUF = 200;

/** Wie viele Auffrisch-Aufrufe eine Nacht mit so vielen verknuepften Spielen hat. */
export function auffrischGrenze(spiele: number): number {
	return Math.ceil(spiele / AUFFRISCH_SPIELE_JE_NACHTAUFRUF);
}

/** Der Zaehler der Nacht in app_setting (Stufe 18n), geschrieben von `auffrischAufrufZaehlen`. */
export const SCHLUESSEL_AUFFRISCHEN = "igdb_auffrischen_nacht";
export type AuffrischNacht = { datum: string; aufrufe: number; spiele: number };

/** Der gespeicherte Zaehler, gelesen; unlesbar zaehlt wie keiner. */
export function auffrischNachtAus(stand: string | null): AuffrischNacht | null {
	if (!stand) return null;
	try {
		const roh = JSON.parse(stand) as Partial<AuffrischNacht>;
		if (typeof roh.datum !== "string" || typeof roh.aufrufe !== "number" || typeof roh.spiele !== "number") return null;
		return { datum: roh.datum, aufrufe: roh.aufrufe, spiele: roh.spiele };
	} catch {
		return null;
	}
}

/**
 * Ist die Grenze dieser Nacht erreicht? `null` heisst "nein": Ein Zaehler von
 * gestern oder keiner laesst den ersten Aufruf zu, der dann zaehlt.
 */
export function auffrischenGekappt(stand: string | null, heute: string): { aufrufe: number; grenze: number } | null {
	const nacht = auffrischNachtAus(stand);
	if (!nacht || nacht.datum !== heute) return null;
	const grenze = auffrischGrenze(nacht.spiele);
	return nacht.aufrufe >= grenze ? { aufrufe: nacht.aufrufe, grenze } : null;
}

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
export const SCHLUESSEL_BESITZ = "psn_besitz_stand";

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
	auffrischen?: AuffrischErgebnis;
	/** Auffrischen waere faellig, aber die Grenze der Nacht ist erreicht (Stufe 18n). */
	auffrischenGekappt?: { aufrufe: number; grenze: number };
	physisch?: PhysischErgebnis;
};

/** Was ein Schritt der Kette tun koennte - in der Reihenfolge von 10.1. */
export type CronKandidat =
	| "sync"
	| "sync_starten"
	| "spielzeit"
	| "besitz"
	| "trophaeen"
	| "level"
	| "jahre"
	| "igdb_auffrischen"
	| "igdb_physisch";

/** Die Schluessel aus app_setting, die die Entscheidung braucht. */
export const CRON_STAENDE = [
	SCHLUESSEL_SPIELZEIT,
	SCHLUESSEL_BESITZ,
	SCHLUESSEL_LEVEL,
	SCHLUESSEL_JAHRE,
	SCHLUESSEL_AUFFRISCHEN,
] as const;

/**
 * Welche Schritte faellig sind, in der Reihenfolge, in der sie versucht
 * werden (Stufe 18j). Rein, ohne D1: Alles, was die Entscheidung braucht,
 * steht in der Lage, die der eine Lese-Batch geholt hat.
 *
 * Eine Liste statt eines Schritts, weil ein faelliger Schritt trotzdem leer
 * ausgehen kann - das Level, wenn PSN keines nennt; die Jahre, wenn es keine
 * Trophaeen gibt. Dann versucht
 * `cronSchritt` den naechsten, genau wie bis 18j die Kette der `if`s.
 */
export function entscheide(
	lage: CronLage,
	k: { heute: string; igdbKonfiguriert: boolean },
): CronKandidat[] {
	const raus: CronKandidat[] = [];
	const stand = (s: string) => lage.einstellungen.get(s) ?? null;
	if (lage.psn) {
		const { laufend, heutige, zugang, naechsteListe } = lage.psn;
		// 2. Ein laufender Lauf wird fortgesetzt - und sonst nichts.
		if (laufend) return ["sync"];
		const mitZugang = zugang.eingerichtet && zugang.status !== "abgelaufen";
		// 3. Ein Cron-Versuch je Nacht (Entscheidung des Nutzers vom 19.09.2026).
		if (mitZugang && syncFaellig(heutige)) return ["sync_starten"];
		if (mitZugang) {
			if (spielzeitFaellig(stand(SCHLUESSEL_SPIELZEIT), k.heute)) raus.push("spielzeit");
			if (besitzFaellig(besitzStandAus(stand(SCHLUESSEL_BESITZ)), k.heute)) raus.push("besitz");
			if (naechsteListe) raus.push("trophaeen");
			if (levelStandAus(stand(SCHLUESSEL_LEVEL))?.standAm !== k.heute) raus.push("level");
		}
	}
	if (lage.wartung) {
		const { zumAuffrischen, zurDisc } = lage.wartung;
		if (jahreStandAus(stand(SCHLUESSEL_JAHRE))?.standAm !== k.heute) raus.push("jahre");
		if (k.igdbKonfiguriert && zumAuffrischen.length > 0 && !auffrischenGekappt(stand(SCHLUESSEL_AUFFRISCHEN), k.heute))
			raus.push("igdb_auffrischen");
		if (k.igdbKonfiguriert && zurDisc.length > 0) raus.push("igdb_physisch");
	}
	return raus;
}

/** Die Lage fuer einen Aufruf lesen - ein D1-Aufruf, mit Marke nur vom Einstieg. */
export function lageLesen(
	repos: Repositories,
	bereich: CronBereich,
	heute: string,
	marke?: Date,
): Promise<CronLage> {
	return repos.cronLage.lesen({
		bereich,
		heute,
		marke,
		schluessel: CRON_STAENDE,
		haengtNachStunden: HAENGT_NACH_STUNDEN,
		rohantwortenLaeufe: ROHANTWORTEN_LAEUFE,
		igdbJeAufruf: AUFFRISCHEN_JE_AUFRUF,
		auffrischFristTage: AUFFRISCH_FRIST_TAGE,
	});
}

/**
 * Ein Aufruf der Automatik. `heute` ist das UTC-Datum (YYYY-MM-DD) und nur
 * fuer Tests ueberschreibbar; `bereich` sagt, welcher Cron-Eintrag ruft.
 *
 * `lage` liest der Einstieg samt Marke (Stufe 18j); fehlt sie, liest der
 * Schritt sie selbst, ohne Marke - so rufen ihn die Tests.
 */
export async function cronSchritt(
	repos: Repositories,
	psn: PsnClient,
	igdb: IgdbClient,
	optionen: { heute?: string; bereich?: CronBereich; lage?: CronLage } = {},
): Promise<CronErgebnis> {
	const heute = optionen.heute ?? heuteIso();
	const bereich = optionen.bereich ?? "alles";
	const lage = optionen.lage ?? (await lageLesen(repos, bereich, heute));
	// Die Daueraufgaben sind im Lage-Batch schon geschehen: Haenger im
	// PSN-Fenster, Freigabe und Aufraeumen in der Wartung. Sie stehen an der
	// Zeile JEDES Aufrufs, wenn sie etwas getan haben (geloescht= seit 18j,
	// Entscheidung des Nutzers vom 17.10.2026) - Aufraeumen ist kein eigener
	// Schritt mehr.
	const stand = (s: string) => lage.einstellungen.get(s) ?? null;
	// Ein Schritt, der ruht, sagt warum (CLAUDE.md): Faellig, aber die Grenze
	// der Nacht ist erreicht, steht an der Zeile jedes weiteren Aufrufs.
	const gekappt =
		igdb.konfiguriert() && (lage.wartung?.zumAuffrischen.length ?? 0) > 0
			? auffrischenGekappt(stand(SCHLUESSEL_AUFFRISCHEN), heute)
			: null;
	const basis: Pick<CronErgebnis, "erschienen" | "abgebrochen" | "bereich" | "geloescht" | "auffrischenGekappt"> = {
		erschienen: lage.wartung?.erschienen ?? 0,
		abgebrochen: lage.psn?.abgebrochen ?? 0,
		bereich,
		...(lage.wartung?.geloescht ? { geloescht: lage.wartung.geloescht } : {}),
		...(gekappt ? { auffrischenGekappt: gekappt } : {}),
	};

	for (const kandidat of entscheide(lage, {
		heute,
		igdbKonfiguriert: igdb.konfiguriert(),
	})) {
		switch (kandidat) {
			case "sync":
				return { ...basis, getan: "sync", sync: await syncSchritt(repos, psn) };
			case "sync_starten":
				return { ...basis, getan: "sync", sync: await syncSchritt(repos, psn, { ausloeser: "cron" }) };

			// 4.-7. Spielzeit, Kaufliste, Einzeltrophaeen, Level (7.7). Erst nach
			//       dem Sync: Die Zuordnung laeuft ueber die Titel der Sammlung.
			//       Ein abgelaufener Zugang oder ein PSN-Ausfall darf die Nacht
			//       nicht beenden - die Wartung laeuft in ihrem Fenster weiter.
			case "spielzeit":
			case "besitz":
			case "trophaeen":
			case "level": {
				try {
					if (kandidat === "spielzeit") {
						const spielzeit = await spielzeitLauf(repos, psn, heute, stand(SCHLUESSEL_SPIELZEIT));
						if (spielzeit) return { ...basis, getan: "spielzeit", spielzeit };
					} else if (kandidat === "besitz") {
						const besitz = await besitzLauf(repos, psn, heute, {
							gespeichert: besitzStandAus(stand(SCHLUESSEL_BESITZ)),
						});
						if (besitz) return { ...basis, getan: "besitz", besitz };
					} else if (kandidat === "trophaeen") {
						// Ganz hinten in der PSN-Kette, weil der Portionsknopf der
						// Hauptweg ist: das Netz fuer den Fall, dass niemand drueckt
						// (Stufe 19b). Dieselbe Auswahl wie der Knopf.
						const liste = lage.psn?.naechsteListe;
						if (liste) {
							const { accessToken } = await sitzungBesorgen(repos, psn);
							const trophaeen = await eineListe(repos, psn, accessToken, liste);
							await zugangGeglueckt(repos);
							return { ...basis, getan: "trophaeen", trophaeen };
						}
					} else {
						// Die Sitzung holt der Schritt erst, wenn das Level faellig
						// ist (Stufe 18i) - vorher erneuerte jeder Leerlauf das Token.
						const token = async () => (await sitzungBesorgen(repos, psn)).accessToken;
						const level = await levelSchritt(repos, psn, token, heute, levelStandAus(stand(SCHLUESSEL_LEVEL)));
						if (level) return { ...basis, getan: "level", level: level.level };
					}
				} catch (fehler) {
					return { ...basis, getan: "nichts", meldung: "Der PSN-Abruf ist fehlgeschlagen." };
				}
				break;
			}

			// 9. Trophaeen je Jahr ZUERST in der Wartung (Stufe 18g): Was einmal
			//    am Tag mit einem Aufruf erledigt ist, steht vor dem, was das
			//    Fenster fuellen kann. Vom 11. bis 16.10.2026 fuellte der
			//    Marktschritt das Fenster, und die Jahre liefen keinen Tag.
			case "jahre": {
				const jahre = await jahreSchritt(repos, heute, jahreStandAus(stand(SCHLUESSEL_JAHRE)));
				if (jahre) return { ...basis, getan: "jahre", jahre: jahre.jahre.length };
				break;
			}

			// 10./11. IGDB nur mit Zugang, in try/catch: Eine Ausnahme riss
			//         bis 18b den ganzen Aufruf.
			case "igdb_auffrischen":
			case "igdb_physisch": {
				try {
					if (kandidat === "igdb_auffrischen") {
						// Gezaehlt wird vor der Arbeit (Stufe 18n): Was die Laufzeit
						// abbricht, soll die Grenze trotzdem verbrauchen.
						await repos.igdb.auffrischAufrufZaehlen(SCHLUESSEL_AUFFRISCHEN, heute);
						const auffrischen = await igdbAuffrischSchritt(
							repos,
							igdb,
							AUFFRISCHEN_JE_AUFRUF,
							AUFFRISCH_FRIST_TAGE,
							lage.wartung?.zumAuffrischen,
						);
						if (auffrischen.angefragt > 0) return { ...basis, getan: "igdb_auffrischen", auffrischen };
					} else {
						const physisch = await igdbPhysischSchritt(repos, igdb, AUFFRISCHEN_JE_AUFRUF, lage.wartung?.zurDisc);
						if (physisch.angefragt > 0) return { ...basis, getan: "igdb_physisch", physisch };
					}
				} catch (fehler) {
					return { ...basis, getan: "nichts", meldung: meldungFuer(fehler) };
				}
				break;
			}
		}
	}

	return { ...basis, getan: "nichts" };
}

/** Der Spielzeit-Stand "datum:offset[:versuche]", gelesen. */
function spielzeitStand(stand: string | null, heute: string): { offset: number; bisher: number; faellig: boolean } {
	const [tag, offsetRoh, versucheRoh] = (stand ?? "").split(":");
	const vonHeute = tag === heute;
	const offset = vonHeute ? Number(offsetRoh) : 0;
	const bisher = vonHeute ? Number(versucheRoh ?? 0) || 0 : 0;
	return { offset, bisher, faellig: !(vonHeute && offset < 0) };
}

const spielzeitFaellig = (stand: string | null, heute: string) => spielzeitStand(stand, heute).faellig;

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
async function spielzeitLauf(
	repos: Repositories,
	psn: PsnClient,
	heute: string,
	stand: string | null,
): Promise<SpielzeitErgebnis | null> {
	const { offset, bisher, faellig } = spielzeitStand(stand, heute);
	if (!faellig) return null;

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

/** Der Stand der Kaufliste in app_setting (Stufe 18c, `fehlerAm` seit 18e). */
export type BesitzStand = { fertigAm?: string; fehlerAm?: string; start?: number; gesehen?: number[] };

/** Was `GET /api/sync/status` ueber die Kaufliste sagt (Stufe 18e). */
export async function besitzStand(repos: Repositories): Promise<BesitzStand> {
	return besitzStandAus(await repos.sync.fortschritt(SCHLUESSEL_BESITZ));
}

/** Der gespeicherte Stand, gelesen - fuer Knopf, Status und Lage-Batch dieselbe Auswertung. */
export function besitzStandAus(stand: string | null): BesitzStand {
	if (!stand) return {};
	try {
		return JSON.parse(stand) as BesitzStand;
	} catch {
		return {};
	}
}

/** Ob ein neuer oder fortgesetzter Durchlauf faellig ist. */
function besitzFaellig(gespeichert: BesitzStand, heute: string, erzwingen = false): boolean {
	const laeuft = typeof gespeichert.start === "number";
	return (
		laeuft ||
		erzwingen ||
		!gespeichert.fertigAm ||
		tageSeit(gespeichert.fertigAm, heute) >= BESITZ_FRIST_TAGE
	);
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
	// `gespeichert` hat der Cron im Lage-Batch gelesen (Stufe 18j); der Knopf
	// liest selbst.
	optionen: { erzwingen?: boolean; gespeichert?: BesitzStand } = {},
): Promise<BesitzErgebnis | null> {
	const gespeichert = optionen.gespeichert ?? (await besitzStand(repos));
	const laeuft = typeof gespeichert.start === "number";
	if (!besitzFaellig(gespeichert, heute, optionen.erzwingen)) return null;

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

/**
 * Ein Cron-Versuch je Nacht: nicht nach einem eigenen Lauf von heute, nicht
 * nach einem erfolgreichen Handabruf von heute - wohl aber nach einem
 * fehlgeschlagenen oder abgebrochenen Handlauf. Ohne NPSSO oder mit
 * abgelaufenem Zugang fragt `entscheide` gar nicht erst: Sonst stuende jede
 * Nacht eine Fehlerzeile in der Historie.
 */
function syncFaellig(heutige: readonly SyncLauf[]): boolean {
	return !heutige.some((l) => l.started_by === "cron" || l.status === "erfolg");
}

/**
 * Die Zahlen eines Ausgangs fuer `cron_stand` (Stufe 18j). Nur was war - ob
 * es schlimm ist, entscheiden die Betriebswarnungen beim Lesen (16.2).
 * Einen Rest (`offen`) meldete im Cron nur der Store-Schritt; seit 20j steht
 * er in der Action, und ihr Ausgang traegt ihn (`POST /api/sync/store/ausgang`).
 */
export function cronFakt(am: string, e: CronErgebnis): CronFakt {
	const meldung = Boolean(
		e.meldung ||
			e.sync?.meldung ||
			e.spielzeit?.meldung ||
			e.besitz?.meldung ||
			e.auffrischen?.meldung ||
			e.physisch?.meldung,
	);
	return { am, getan: e.getan, meldung };
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
	if (e.auffrischenGekappt) {
		teile.push(`auffrischen=grenze`, `aufrufe=${e.auffrischenGekappt.aufrufe}/${e.auffrischenGekappt.grenze}`);
	}
	if (e.meldung) teile.push(`meldung="${e.meldung}"`);
	if (e.physisch) {
		teile.push(`physisch=${e.physisch.status}`, `angefragt=${e.physisch.angefragt}`, `gesetzt=${e.physisch.gesetzt}`);
		if (e.physisch.meldung) teile.push(`meldung="${e.physisch.meldung}"`);
	}
	return teile.join(" ");
}
