import type { Baustein } from "./baustein";
import type { CredentialAnzeige, CredentialsRepository } from "./credentials";
import type { GamesRepository } from "./games";
import type { IgdbRepository } from "./igdb";
import { CRON_SCHLUESSEL, verlaufAus, type CronMarke, type SyncLauf, type SyncRepository } from "./sync";
import type { TrophaeenRepository, ZuFuellen } from "./trophaeen";

/**
 * Die Lage eines Cron-Aufrufs in EINEM Batch (Stufe 18j, Abschnitt 10.1).
 *
 * Gemessen in 18h: Ein D1-Aufruf kostet rund 0,7 ms CPU, eine Anweisung in
 * einem Batch ein Zwanzigstel davon. Der Leerlauf brauchte bis hierher zehn
 * (Wartung) bzw. rund fuenfzehn (PSN) einzelne Aufrufe, um festzustellen, dass
 * nichts zu tun ist. Jetzt liest jeder Aufruf alles, was er zur Entscheidung
 * braucht, in einem Batch, und schreibt seinen Ausgang in einem zweiten
 * (`SyncRepository.cronAusgangVermerken`) - im Leerlauf zwei D1-Aufrufe.
 *
 * **Der Batch ist eine Transaktion und schreibt.** Vor der Arbeit muss
 * stehen, was ein Abbruch durch die Laufzeit ueberleben soll (die Marke) und
 * was die Entscheidung veraendert (Haenger). Dazu kommen die beiden
 * Daueraufgaben der Wartung, die in jedem Aufruf liefen, nur bisher als
 * eigene Aufrufe: erschienene Titel freigeben und alte Rohantworten
 * aufraeumen. Die Reihenfolge ist Absicht und steht in `anweisungen` unten.
 *
 * **Scheitert eine Anweisung, scheitert der ganze Batch** - auch die Marke
 * wird nicht gesetzt, und gearbeitet wird nichts. Der Aufruf landet im `catch`
 * von `scheduled` und schreibt "cron: abgebrochen" in den Verlauf; halb
 * geschehen ist dann nichts. Der Preis: Scheitert eine Anweisung DAUERHAFT
 * (etwa ein Schema, das nach einem Deploy nicht passt), steht die ganze
 * Automatik, nicht nur ihr Schritt - und D1 sagt nicht verlaesslich, welche
 * Anweisung es war. Bewusst so gelassen: Fuer diese Anweisungen gibt es keinen
 * Fehler, der eine allein trifft, und der Verlauf zeigt den Stillstand
 * sofort (10.1).
 */

/** Was ein Bereich liest - die Zahlen kommen aus den Konstanten der Schritte. */
export type LageOptionen = {
	bereich: "psn" | "wartung" | "alles";
	heute: string;
	/** Die Marke "begonnen" mitsetzen - nur der echte Einstieg tut das. */
	marke?: Date;
	/** Weitere Schluessel aus app_setting, die die Schritte brauchen. */
	schluessel: readonly string[];
	haengtNachStunden: number;
	rohantwortenLaeufe: number;
	igdbJeAufruf: number;
	auffrischFristTage: number;
};

export type CronLage = {
	marke?: CronMarke;
	verlauf: string[];
	einstellungen: Map<string, string>;
	psn?: {
		abgebrochen: number;
		laufend: SyncLauf | null;
		heutige: SyncLauf[];
		zugang: CredentialAnzeige;
		naechsteListe: ZuFuellen | null;
	};
	wartung?: {
		erschienen: number;
		geloescht: number;
		zumAuffrischen: Array<{ id: number; igdb_id: number }>;
		zurDisc: Array<{ id: number; igdb_id: number }>;
	};
};

type Quellen = {
	sync: SyncRepository;
	credentials: CredentialsRepository;
	trophaeen: TrophaeenRepository;
	games: GamesRepository;
	igdb: IgdbRepository;
};

export class CronLageRepository {
	constructor(
		private readonly db: D1Database,
		private readonly q: Quellen,
	) {}

	async lesen(o: LageOptionen): Promise<CronLage> {
		const psn = o.bereich !== "wartung";
		const wartung = o.bereich !== "psn";

		// Die Reihenfolge der Anweisungen, und warum:
		//
		// 1. Marke lesen, dann setzen, dann kappen - als Erstes, damit ein Abbruch
		//    durch die Laufzeit, der NACH diesem Batch kommt, eine Spur hat.
		//    Gelesen wird vor dem Setzen, sonst saehe der Aufruf seine eigene.
		// 2. app_setting: Verlauf, Stand, die Fortschritte der Schritte.
		// 3. PSN: Haenger abbrechen VOR "laeuft ein Lauf?" - sonst faende die
		//    Abfrage den Haenger, den die Anweisung davor gerade beendet hat.
		// 4. Wartung: Freigabe (Protokoll vor UPDATE, 8.5) und Aufraeumen. Sie
		//    haengen von nichts ab und nichts von ihnen - ausser den Auswahlen
		//    danach, die damit schon den freigegebenen Stand sehen.
		// 5. Die Auswahlen der Schritte. Sie lesen auch in einem Aufruf, der
		//    am Ende den Sync macht - das ist der Preis eines Batches statt
		//    einer Kette, und er ist klein (test/lesekosten.spec.ts).
		const teile: Array<Baustein<unknown>> = [];
		const merke = <T>(b: Baustein<T>) => {
			teile.push(b as Baustein<unknown>);
			return teile.length - 1;
		};
		const iMarke = o.marke ? merke(this.q.sync.cronBeginnenBaustein(o.marke, o.bereich)) : -1;
		const iEinst = merke(
			this.q.sync.einstellungenBaustein([CRON_SCHLUESSEL.verlauf, CRON_SCHLUESSEL.stand, ...o.schluessel]),
		);
		const p = psn
			? {
					abgebrochen: merke(this.q.sync.haengendeAbbrechenBaustein(o.haengtNachStunden)),
					laufend: merke(this.q.sync.laufenderLaufBaustein()),
					heutige: merke(this.q.sync.laeufeSeitBaustein(o.heute)),
					zugang: merke(this.q.credentials.anzeigeBaustein()),
					liste: merke(this.q.trophaeen.naechsteZumFuellenBaustein(1)),
				}
			: null;
		const w = wartung
			? {
					erschienen: merke(this.q.games.erschieneneFreigebenBaustein()),
					geloescht: merke(this.q.sync.rohantwortenAufraeumenBaustein(o.rohantwortenLaeufe)),
					auffrischen: merke(this.q.igdb.zumAuffrischenBaustein(o.igdbJeAufruf, o.auffrischFristTage)),
					disc: merke(this.q.igdb.zurDiscPruefungBaustein(o.igdbJeAufruf)),
				}
			: null;

		const anweisungen = teile.flatMap((t) => t.anweisungen);
		const ergebnisse = await this.db.batch(anweisungen);
		// Jedem Baustein seine Ergebnisse zurueckgeben, in derselben Folge.
		const werte: unknown[] = [];
		let pos = 0;
		for (const t of teile) {
			werte.push(t.lesen(ergebnisse.slice(pos, pos + t.anweisungen.length)));
			pos += t.anweisungen.length;
		}
		const wert = <T>(i: number) => werte[i] as T;

		const einstellungen = wert<Map<string, string>>(iEinst);
		return {
			...(iMarke >= 0 ? { marke: wert<CronMarke>(iMarke) } : {}),
			verlauf: verlaufAus(einstellungen.get(CRON_SCHLUESSEL.verlauf)),
			einstellungen,
			...(p
				? {
						psn: {
							abgebrochen: wert<number>(p.abgebrochen),
							laufend: wert<SyncLauf | null>(p.laufend),
							heutige: wert<SyncLauf[]>(p.heutige),
							zugang: wert<CredentialAnzeige>(p.zugang),
							naechsteListe: wert<ZuFuellen[]>(p.liste)[0] ?? null,
						},
					}
				: {}),
			...(w
				? {
						wartung: {
							erschienen: wert<number>(w.erschienen),
							geloescht: wert<number>(w.geloescht),
							zumAuffrischen: wert<Array<{ id: number; igdb_id: number }>>(w.auffrischen),
							zurDisc: wert<Array<{ id: number; igdb_id: number }>>(w.disc),
						},
					}
				: {}),
		};
	}
}
