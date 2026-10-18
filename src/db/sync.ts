import { eins, einzeln, ersteZeile, geaendert, zeilen, type Baustein } from "./baustein";

export type SyncStatus = "laufend" | "erfolg" | "fehler";

export type SyncPhase = "abruf" | "normalisierung";

/** Wer den Lauf angestossen hat (Migration 0021): der Nutzer oder der Cron (Stufe 18). */
export type SyncAusloeser = "nutzer" | "cron";

export type SyncLauf = {
	id: number;
	started_at: string;
	finished_at: string | null;
	status: SyncStatus;
	error_message: string | null;
	titles_seen: number | null;
	next_offset: number;
	phase: SyncPhase;
	started_by: SyncAusloeser;
	/** Fehlversuche an derselben Stelle (Migration 0024, Stufe 18e). */
	failed_attempts: number;
};

/**
 * Schluessel in app_setting, unter dem der Cron seine letzten Ausgaenge
 * hinterlaesst (Stufe 18b, seit 22.09.2026 mehrere statt einem). Begruendung: Der Cron ist der einzige Schreiber
 * ohne Zuschauer, und die Worker-Logs sind nur live zu sehen - als am
 * 21.09.2026 der IGDB-Schritt zwei Naechte lang nichts tat, war von aussen
 * nicht zu erkennen, ob er scheiterte, gar nicht lief oder nichts zu tun
 * fand. Eine Zeile Zustand schliesst diese Luecke; berechnet ist daran
 * nichts.
 */
const SCHLUESSEL_CRON = "cron_verlauf";

/**
 * Wie viele Cron-Ausgaenge aufgehoben werden.
 *
 * Zwanzig, und wirkungslose Aufrufe werden verdichtet - beides zusammen
 * ergibt "eine Nacht". Fuenf Eintraege waren es bis Stufe 18d, und sie
 * zeigten systematisch die falschen: Das Cron-Fenster hat 36 Aufrufe, die
 * Arbeit ist gegen 04:10 getan, danach folgen gut zwanzig leere. Am
 * 23.09.2026 standen deshalb fuenf Zeilen "nichts" von 05:36 bis 05:56 im
 * Verlauf, waehrend Sync, Spielzeit, Besitz und 49 aufgefrischte Spiele
 * unsichtbar blieben - dieselbe Blindheit, gegen die Migration 0022
 * angetreten war, nur eine Stufe spaeter.
 *
 * Eine volle Nacht sind elf Sync-Aufrufe, je einer fuer Spielzeit und
 * Besitz, ein bis zwei fuer IGDB, einer fuers Aufraeumen und eine
 * verdichtete Leerlaufzeile - siebzehn. Zwanzig deckt das ab.
 */
const CRON_VERLAUF_LAENGE = 20;

/**
 * Die Marke "begonnen" (Stufe 18g): Jeder Aufruf setzt sie zuerst, und erst
 * der vermerkte Ausgang nimmt sie wieder weg.
 *
 * Warum: Ein Aufruf, den die Laufzeit an der CPU-Grenze beendet, erreicht
 * weder den Verlauf noch das `catch` in `scheduled`. Vom 10. bis 16.10.2026
 * starben so taeglich 12 bis 35 Wartungsaufrufe ohne jede Zeile, und am
 * Morgen sah das aus wie "nichts zu tun" (lehren.md). Die Marke aendert kein
 * Verhalten, sie macht nur sichtbar, was vorher spurlos verschwand.
 *
 * **Seit Stufe 18j eine Zeile je Aufruf** unter `cron_begonnen:<Zeit>:<Bereich>`
 * (Entscheidung des Nutzers vom 17.10.2026). Bis dahin war es EIN Schluessel,
 * den jeder Aufruf erst lesen musste, um die Kette der Toten in die neue Marke
 * zu tragen - Lesen, Rechnen, Schreiben, also zwei D1-Aufrufe vor jeder
 * Arbeit. Mit einer Zeile je Aufruf ist die Kette einfach die Menge der
 * liegengebliebenen Zeilen: Lesen und Setzen stehen in einem Batch, und der
 * Ausgang loescht, was er gemeldet hat. Die Zeit vorn im Schluessel ordnet
 * die Zeilen; gelesen wird ueber einen Schluesselbereich, damit der
 * Primaerschluessel greift (kein LIKE).
 *
 * Der Bereich beginnt bei `cron_begonnen` selbst: Damit liest er auch die
 * Marke im alten Format, die ein Aufruf des alten Workers waehrend des Deploys
 * hinterlassen haben kann, und meldet sie mit.
 */
const MARKE_PRAEFIX = "cron_begonnen";
const MARKE_VON = MARKE_PRAEFIX;
/** `;` folgt in der Zeichentabelle direkt auf `:` - das Ende des Bereichs. */
const MARKE_BIS = `${MARKE_PRAEFIX};`;

/**
 * Hoechstens so viele Marken bleiben liegen. Zweihundert sind knapp drei
 * Naechte, in denen KEIN Aufruf durchkam. Was darueber hinausgeht, entfernt
 * der Lage-Batch - nicht still: Die neue Marke traegt dann `gekappt`, und die
 * Zeile, die die Kette meldet, sagt es (`gekappt=ja`), weil ihr Anfang dann
 * fehlt (Vorgabe des Nutzers vom 17.10.2026: app_setting soll nicht still
 * wachsen, und es soll nichts unbemerkt verschwinden).
 */
export const MARKEN_HOECHSTENS = 200;

/**
 * Ab wann eine Marke als verwaist gilt. Zwei Minuten (Entscheidung des
 * Nutzers vom 16.10.2026): Der naechste regulaere Aufruf kommt nach fuenf
 * Minuten und muss sie sicher erkennen, die doppelte Ausloesung vom
 * 16.10.2026 lag eine Minute auseinander und darf es nicht. Ein Aufruf
 * dauert Sekunden, nicht Minuten.
 */
export const VERWAIST_NACH_MS = 2 * 60_000;

/** Aufrufe ohne Ausgang, die seit dem letzten vermerkten Ausgang liegengeblieben sind. */
export type Verwaist = { anzahl: number; von: string; bis: string; bereich: string; gekappt?: boolean };

/** Inhalt einer Marke. `verwaist` traegt nur das alte Format (bis 18j). */
type MarkenInhalt = { am: string; bereich: string; gekappt?: number | boolean; verwaist?: Verwaist };

/**
 * Die eigene Marke eines Aufrufs. Geloescht wird beim Ausgang nur der eigene
 * Schluessel und die gemeldeten verwaisten - eine junge Marke eines
 * gleichzeitig laufenden zweiten Aufrufs bleibt stehen.
 */
export type CronMarke = {
	schluessel: string;
	verwaist: Verwaist | null;
	/** Der juengste Schluessel der gemeldeten Kette - bis dahin loescht der Ausgang. */
	verwaistBis: string | null;
};

/** "2026-10-16T06:35:00.000Z" -> "2026-10-16 06:35" - das Format des Verlaufs. */
const verlaufszeit = (iso: string) => iso.slice(0, 16).replace("T", " ");

function markeLesen(roh: string | null): MarkenInhalt | null {
	if (!roh) return null;
	try {
		const m = JSON.parse(roh) as MarkenInhalt;
		return typeof m?.am === "string" && !Number.isNaN(Date.parse(m.am)) ? m : null;
	} catch {
		return null;
	}
}

/**
 * Aus den gelesenen Marken die Kette der Toten (Stufe 18j). Rein, ohne D1.
 *
 * Verwaist ist, was zwei Minuten oder aelter ist; eine juengere Marke stammt
 * von einem Aufruf, der gerade noch laeuft, und wird weder gemeldet noch
 * angefasst. Die Zeilen kommen nach Schluessel, also nach Zeit geordnet.
 */
export function ketteAus(
	marken: ReadonlyArray<{ key: string; value: string }>,
	jetzt: Date,
): { verwaist: Verwaist | null; verwaistBis: string | null } {
	let anzahl = 0;
	let von = "";
	let bis = "";
	let gekappt = false;
	let anfang: string | null = null;
	let ende: string | null = null;
	let verwaistBis: string | null = null;
	for (const { key, value } of marken) {
		const m = markeLesen(value);
		// Eine unlesbare Marke ist trotzdem ein Aufruf ohne Ausgang - sie zaehlt
		// und wird mit weggeraeumt, statt fuer immer liegenzubleiben.
		if (m && jetzt.getTime() - Date.parse(m.am) < VERWAIST_NACH_MS) continue;
		const zeit = m ? verlaufszeit(m.am) : bis;
		const bereich = m?.bereich ?? "unbekannt";
		// Das alte Format (bis 18j) trug seine Kette in sich.
		const mitgebracht = m?.verwaist;
		anzahl += 1 + (mitgebracht?.anzahl ?? 0);
		if (von === "") von = mitgebracht?.von ?? zeit;
		bis = zeit;
		anfang ??= mitgebracht?.bereich.split("→")[0] ?? bereich;
		ende = bereich;
		if (m?.gekappt || mitgebracht?.gekappt) gekappt = true;
		verwaistBis = key;
	}
	if (anzahl === 0) return { verwaist: null, verwaistBis: null };
	const verwaist: Verwaist = { anzahl, von, bis, bereich: anfang === ende ? (ende ?? "") : `${anfang}→${ende}` };
	if (gekappt) verwaist.gekappt = true;
	return { verwaist, verwaistBis };
}

/**
 * Die Verlaufszeile fuer Aufrufe ohne Ausgang:
 * "2026-10-16 06:35–07:55 cron: ohne_ausgang ×17 bereich=wartung".
 * Die Zeiten sind die Anfaenge der verwaisten Aufrufe, nicht die des
 * meldenden.
 */
function verwaistZeile(v: Verwaist): string {
	const spanne = v.bis === v.von ? v.von : `${v.von}–${v.bis.slice(11)}`;
	const kappung = v.gekappt ? " gekappt=ja" : "";
	return `${spanne} cron: ohne_ausgang${v.anzahl > 1 ? ` ×${v.anzahl}` : ""} bereich=${v.bereich}${kappung}`;
}

/**
 * Was der Ausgang eines Aufrufs als Zahlen hinterlaesst (Stufe 18j) - die
 * Fakten fuer die Betriebswarnungen der naechsten Stufe (16.2). Das Urteil
 * ("ist das schlimm?") entsteht beim Lesen; hier steht nur, was war. Bis
 * dahin stand es ausschliesslich als Text in `cron_verlauf`, und Text ist
 * Anzeige, kein Datum.
 */
export type CronFakt = {
	/** Zeitstempel des Ausgangs, UTC wie im Verlauf. */
	am: string;
	getan: string;
	/** Ob der Aufruf eine Meldung trug - ein Fehler, kein Leerlauf. */
	meldung: boolean;
	/** Der Rest des Schritts nach diesem Aufruf, wo es einen gibt (Markt, Store). */
	offen?: number;
};

/** Der ganze Stand unter `cron_stand`: der letzte Ausgang je Bereich und die letzte gemeldete Kette. */
export type CronStand = Partial<Record<string, CronFakt>> & {
	ohneAusgang?: Verwaist & { gemeldetAm: string };
};

const SCHLUESSEL_STAND = "cron_stand";

/** Die Schluessel, die der Lage-Batch aus app_setting mitliest. */
export const CRON_SCHLUESSEL = { verlauf: SCHLUESSEL_CRON, stand: SCHLUESSEL_STAND } as const;

/** Der gespeicherte Verlauf als Zeilen. */
export const verlaufAus = (roh: string | undefined | null): string[] =>
	roh ? roh.split("\n").filter((l) => l !== "") : [];

export function standAus(roh: string | undefined | null): CronStand {
	if (!roh) return {};
	try {
		const s = JSON.parse(roh) as CronStand;
		return s && typeof s === "object" ? s : {};
	} catch {
		return {};
	}
}

/**
 * Eine gespeicherte Verlaufszeile, einzeln oder bereits verdichtet:
 * "2026-09-23 04:16 cron: nichts", "2026-09-23 04:16–05:56 cron: nichts ×21"
 * oder "2026-09-27 03:00–03:10 cron: sync ×3 offset=0→200".
 */
const VERLAUFSZEILE =
	/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})(?:–\d{2}:\d{2})? cron: (\S+)(?: ×(\d+))?(.*)$/;

type Verlaufszeile = { von: string; arbeit: string; anzahl: number; felder: Array<[string, string]> };

/** Der Wert eines Feldes, oder undefined. */
const wert = (z: Verlaufszeile, schluessel: string) => z.felder.find(([k]) => k === schluessel)?.[1];

/** Eine gespeicherte Zeile zerlegen - oder null, wenn sie nicht dem Muster folgt. */
function zerlege(zeile: string): Verlaufszeile | null {
	const t = VERLAUFSZEILE.exec(zeile);
	if (!t) return null;
	const rest = t[4].trim();
	const felder: Array<[string, string]> = [];
	for (const stueck of rest === "" ? [] : rest.split(" ")) {
		const i = stueck.indexOf("=");
		// Ein Stueck ohne "=" ist kein Feld - dann lieber nicht verdichten,
		// als eine Zeile zu erfinden, die so nie geschrieben wurde.
		if (i <= 0) return null;
		felder.push([stueck.slice(0, i), stueck.slice(i + 1)]);
	}
	return { von: t[1], arbeit: t[2], anzahl: t[3] ? Number(t[3]) : 1, felder };
}

/**
 * Zwei aufeinanderfolgende Aufrufe DERSELBEN Arbeit zu einer Zeile
 * zusammenziehen (Stufe 18e).
 *
 * Bis 18d galt das nur fuer den Leerlauf, und das reichte nicht: Eine Nacht
 * mit Kaufliste sind einunddreissig Aufrufe, der Verlauf fasst zwanzig
 * Eintraege - die aeltesten elf fielen weg, und das waren die Sync-Zeilen
 * (Befund vom 24.09.2026). Verdichtet wird deshalb jede Arbeit:
 * "03:00–03:10 cron: sync ×3 offset=0→200".
 *
 * Drei Regeln halten die Zeile ehrlich:
 *
 * - **Nur bei gleicher Feldfolge.** Wechselt der Sync von `offset` auf
 *   `offen`, beginnt eine neue Zeile - genau dort, wo auch ein Mensch
 *   trennen wuerde.
 * - **Nie mit Meldung.** Ein Fehler ist kein Leerlauf und wird nie
 *   verdichtet (10.1); er traegt immer eine `meldung=`.
 * - **Fortschritt als Spanne.** Ein Wert, der sich bewegt, steht als
 *   `a→b`, ein gleichbleibender einfach so. Eine Seite, die dreimal an
 *   derselben Stelle scheitert, zeigt damit `×3` bei unveraendertem Offset -
 *   das war die Lehre aus 18d ("was die Zeile nennt, muss sich bewegen").
 *
 * Gibt `null` zurueck, wenn nicht verdichtet werden kann; dann wird die neue
 * Zeile normal vorangestellt. Gerechnet oder gespeichert wird nichts, was
 * sich nicht aus den Zeilen selbst ergibt.
 */
export function verdichte(vorherige: string, neue: string): string | null {
	const a = zerlege(vorherige);
	const b = zerlege(neue);
	if (!a || !b) return null;
	if (a.arbeit !== b.arbeit) return null;
	if (a.felder.length !== b.felder.length) return null;
	if (a.felder.some(([k], i) => k !== b.felder[i][0])) return null;
	if (a.felder.some(([k]) => k === "meldung") || b.felder.some(([k]) => k === "meldung")) return null;
	// Aufrufe ohne Ausgang sind ebenso wenig Leerlauf (Stufe 18g). Die Zeile
	// zaehlt sie schon selbst; zwei solche Zeilen haben immer einen
	// vermerkten Ausgang zwischen sich, und den darf keine Verdichtung
	// verschlucken.
	if (a.arbeit === "ohne_ausgang" || b.arbeit === "ohne_ausgang") return null;
	// Der Bereich ist keine Fortschrittszahl, sondern sagt, WER gerufen hat:
	// Ueber die Fenstergrenze hinweg wird nicht verdichtet, sonst stuende da
	// "nichts ×36 bereich=psn→wartung" und man wuesste von keinem der beiden
	// Fenster, ob es gelaufen ist.
	if (wert(a, "bereich") !== wert(b, "bereich")) return null;

	// Zwei Aufrufe in derselben Minute gibt es nur von Hand; "15:28–15:28"
	// waere dann Rauschen statt Zeitraum.
	const bis = b.von.slice(11);
	const spanne = bis === a.von.slice(11) ? a.von : `${a.von}–${bis}`;
	const felder = a.felder.map(([k, wert], i) => {
		const anfang = wert.split("→")[0];
		const ende = b.felder[i][1];
		return `${k}=${anfang === ende ? anfang : `${anfang}→${ende}`}`;
	});
	return [spanne, `cron: ${a.arbeit}`, `×${a.anzahl + 1}`, ...felder].join(" ");
}

/** Fester Text fuer einen abgebrochenen Haenger - nur eine Zahl, kein Fremdtext (Abschnitt 10.1). */
export const haengerMeldung = (stunden: number) =>
	`Abgebrochen: seit über ${stunden} Stunden kein Fortschritt.`;

export type Rohantwort = { id: number; endpoint: string; payload: string };

/**
 * psn_sync_run und psn_raw_response.
 *
 * In psn_raw_response landen ausschliesslich Trophaeen-Seiten. Die Antwort des
 * Token-Endpunkts wird hier NIE hineingeschrieben - sie enthaelt den
 * Refresh-Token im Klartext und wuerde damit in jeden Backup-Dump wandern.
 */
export class SyncRepository {
	constructor(private readonly db: D1Database) {}

	async laufenderLauf(): Promise<SyncLauf | null> {
		return einzeln(this.db, this.laufenderLaufBaustein());
	}

	/** Dasselbe als Baustein - fuer den Lage-Batch des Cron (Stufe 18j). */
	laufenderLaufBaustein(): Baustein<SyncLauf | null> {
		return eins(
			this.db.prepare("SELECT * FROM psn_sync_run WHERE status = 'laufend' ORDER BY id DESC LIMIT 1"),
			(e) => ersteZeile<SyncLauf>(e),
		);
	}

	/** Der juengste Lauf - mit `ausloeser` nur der juengste dieses Ausloesers (Stufe 18). */
	async letzterLauf(ausloeser?: SyncAusloeser): Promise<SyncLauf | null> {
		if (ausloeser) {
			return this.db
				.prepare("SELECT * FROM psn_sync_run WHERE started_by = ? ORDER BY id DESC LIMIT 1")
				.bind(ausloeser)
				.first<SyncLauf>();
		}
		return this.db
			.prepare("SELECT * FROM psn_sync_run ORDER BY id DESC LIMIT 1")
			.first<SyncLauf>();
	}

	/**
	 * Die juengsten Nacht-Syncs, neueste zuerst - fuer die Betriebswarnungen
	 * (Stufe 18m): Zwei gescheiterte Naechte hintereinander sind rot. Liest
	 * rueckwaerts ueber den Primaerschluessel, bis `n` Laeufe des Crons
	 * gefunden sind - ein bis zwei Laeufe je Tag.
	 */
	cronLaeufeBaustein(n: number): Baustein<SyncLauf[]> {
		return eins(
			this.db.prepare("SELECT * FROM psn_sync_run WHERE started_by = 'cron' ORDER BY id DESC LIMIT ?").bind(n),
			(e) => zeilen<SyncLauf>(e),
		);
	}

	/**
	 * Alle Laeufe, die an oder nach dem UTC-Datum `datum` (YYYY-MM-DD)
	 * gestartet wurden. Der Cron entscheidet daran, ob heute noch ein Lauf
	 * faellig ist (Abschnitt 10.1). Wenige Zeilen: ein bis zwei je Tag.
	 */
	async laeufeSeit(datum: string): Promise<SyncLauf[]> {
		return einzeln(this.db, this.laeufeSeitBaustein(datum));
	}

	/** Dasselbe als Baustein - fuer den Lage-Batch des Cron (Stufe 18j). */
	laeufeSeitBaustein(datum: string): Baustein<SyncLauf[]> {
		return eins(
			this.db.prepare("SELECT * FROM psn_sync_run WHERE started_at >= ? ORDER BY id").bind(datum),
			(e) => zeilen<SyncLauf>(e),
		);
	}

	async starten(ausloeser: SyncAusloeser = "nutzer"): Promise<SyncLauf> {
		const zeile = await this.db
			.prepare(
				"INSERT INTO psn_sync_run (started_at, status, next_offset, started_by) " +
					"VALUES (datetime('now'), 'laufend', 0, ?) RETURNING *",
			)
			.bind(ausloeser)
			.first<SyncLauf>();
		if (!zeile) throw new Error("Sync-Lauf konnte nicht angelegt werden.");
		return zeile;
	}

	/**
	 * Setzt haengengebliebene Laeufe auf 'fehler' (Stufe 18, Abschnitt 10.1).
	 *
	 * syncSchritt faengt Fehler und schliesst den Lauf ab - aber ein Abbruch
	 * des Workers (CPU-Grenze, D1-Fehler) oder eine Ausnahme im Abschluss der
	 * Normalisierung laesst ihn auf 'laufend' stehen, und laufenderLauf()
	 * faende ihn jede Nacht wieder: Ein einzelner Abbruch legte den Sync
	 * dauerhaft still.
	 *
	 * "Letzter Fortschritt" wird abgeleitet, nicht gespeichert: der Start des
	 * Laufs, die juengste abgelegte Rohantwort oder die juengste
	 * Normalisierung - was zuletzt kam. psn_raw_response.sync_run_id ist
	 * indiziert (0008), das sind fuenf Zeilen je Lauf. Ein Lauf, der vor
	 * weniger als `stunden` Stunden noch Fortschritt hatte, bleibt stehen und
	 * wird fortgesetzt. Rueckgabe: Anzahl abgebrochener Laeufe.
	 */
	async haengendeAbbrechen(stunden: number): Promise<number> {
		return einzeln(this.db, this.haengendeAbbrechenBaustein(stunden));
	}

	/** Dasselbe als Baustein - fuer den Lage-Batch des PSN-Fensters (Stufe 18j). */
	haengendeAbbrechenBaustein(stunden: number): Baustein<number> {
		// Der Modifier steht als Text im Statement, nicht als Bind: Zahl aus
		// einer Konstanten, nie aus einer Eingabe (CLAUDE.md, Stufe 18d).
		const frist = `datetime('now', '-${Math.trunc(stunden)} hours')`;
		return eins(
			this.db
				.prepare(
					"UPDATE psn_sync_run SET status = 'fehler', finished_at = datetime('now'), error_message = ? " +
						"WHERE status = 'laufend' AND MAX(started_at, COALESCE((SELECT MAX(MAX(r.fetched_at, COALESCE(r.normalized_at, ''))) " +
						`FROM psn_raw_response r WHERE r.sync_run_id = psn_sync_run.id), '')) < ${frist}`,
				)
				.bind(haengerMeldung(stunden)),
			geaendert,
		);
	}

	/**
	 * Rohantworten alter Laeufe loeschen (Stufe 18d).
	 *
	 * Der Grund fuer `psn_raw_response` ist die wiederholbare Normalisierung
	 * ohne PSN-Zugriff (Abschnitt 7.1) - dafuer braucht es die letzten Laeufe,
	 * nicht jede Nacht seit dem ersten Tag. Am 23.09.2026 waren 2,31 von 3,26
	 * MB der Datenbank Rohantworten: fuenf Seiten je Nacht, immer dieselben
	 * 431 Titel, 263 KiB taeglich. Sie wandern ueber `d1 export` auch in jede
	 * woechentliche Sicherung und damit dauerhaft in die Historie des privaten
	 * Backup-Repositorys.
	 *
	 * Behalten wird, was noch nicht normalisiert ist - das ist unerledigte
	 * Arbeit, kein Archiv. Dazu die Seiten der juengsten `laeufe` Laeufe, die
	 * ueberhaupt Seiten haben; ein fehlgeschlagener Lauf ohne Seiten
	 * verdraengt so keinen guten.
	 *
	 * Die eine Ausnahme kam mit Stufe 18e: Seiten eines endgueltig
	 * gescheiterten Laufs sind KEINE unerledigte Arbeit. Bis dahin lagen sie
	 * fuer immer - in der Nacht zum 27.09.2026 zwei Seiten und 117 KiB aus
	 * Lauf 13, den ein Abrufsfehler bei Offset 200 beendete.
	 *
	 * Kein `game_event`: Es aendert sich kein Spiel, keine Bewertung, keine
	 * Zuordnung - nur Fremddaten, die jederzeit neu abrufbar sind (8.5).
	 */
	async rohantwortenAufraeumen(laeufe: number): Promise<number> {
		return einzeln(this.db, this.rohantwortenAufraeumenBaustein(laeufe));
	}

	/**
	 * Dasselbe als Baustein. Seit Stufe 18j steht es im Lage-Batch JEDES
	 * Wartungsaufrufs, statt ein eigener Schritt zu sein - das DELETE lief im
	 * Leerlauf ohnehin jedes Mal, nur als eigener D1-Aufruf.
	 */
	rohantwortenAufraeumenBaustein(laeufe: number): Baustein<number> {
		const anweisung = this.db
			.prepare(
				"DELETE FROM psn_raw_response WHERE sync_run_id NOT IN " +
					"(SELECT sync_run_id FROM psn_raw_response GROUP BY sync_run_id ORDER BY sync_run_id DESC LIMIT ?) " +
					// Normalisiertes ist erledigt. Unnormalisiertes ist
					// unerledigte Arbeit - AUSSER der Lauf ist endgueltig
					// gescheitert (Stufe 18e): naechsteUnverarbeitete filtert
					// auf die Lauf-Id, und der naechste Lauf beginnt bei
					// Offset 0, niemand wird diese Seiten je normalisieren.
					// Vorher blieben sie dauerhaft liegen und wanderten in
					// jede Sicherung (10.1). Dass sie erst mit dem Lauf aus
					// dem Fenster der juengsten drei fallen, ist Absicht:
					// Bis dahin sind sie das Beweisstueck zum Fehler.
					"AND (normalized_at IS NOT NULL OR sync_run_id IN " +
					"(SELECT id FROM psn_sync_run WHERE status = 'fehler'))",
			)
			.bind(laeufe);
		return eins(anweisung, geaendert);
	}

	/** Eine Rohantwort unveraendert ablegen. */
	async rohantwortSpeichern(laufId: number, endpoint: string, payload: string): Promise<void> {
		await this.db
			.prepare(
				"INSERT INTO psn_raw_response (sync_run_id, endpoint, payload, fetched_at) " +
					"VALUES (?, ?, ?, datetime('now'))",
			)
			.bind(laufId, endpoint, payload)
			.run();
	}

	/** Wechselt vom Abruf in die Normalisierung. */
	async phaseSetzen(laufId: number, phase: SyncPhase): Promise<void> {
		await this.db
			.prepare("UPDATE psn_sync_run SET phase = ? WHERE id = ?")
			.bind(phase, laufId)
			.run();
	}

	/** Die naechste noch nicht normalisierte Rohantwort dieses Laufs. */
	async naechsteUnverarbeitete(laufId: number): Promise<Rohantwort | null> {
		return this.db
			.prepare(
				"SELECT id, endpoint, payload FROM psn_raw_response " +
					"WHERE sync_run_id = ? AND normalized_at IS NULL ORDER BY id LIMIT 1",
			)
			.bind(laufId)
			.first<Rohantwort>();
	}

	async offeneRohantworten(laufId: number): Promise<number> {
		const zeile = await this.db
			.prepare(
				"SELECT COUNT(*) AS n FROM psn_raw_response WHERE sync_run_id = ? AND normalized_at IS NULL",
			)
			.bind(laufId)
			.first<{ n: number }>();
		return zeile?.n ?? 0;
	}

	async alsNormalisiertMarkieren(rohId: number): Promise<void> {
		await this.db
			.prepare("UPDATE psn_raw_response SET normalized_at = datetime('now') WHERE id = ?")
			.bind(rohId)
			.run();
	}

	/**
	 * Setzt die Normalisierung eines Laufs zurueck, damit sie erneut laufen
	 * kann - ohne PSN-Zugriff. Das ist der Zweck der Trennung aus Abschnitt 7.1.
	 */
	async normalisierungZuruecksetzen(laufId: number): Promise<number> {
		const ergebnis = await this.db
			.prepare("UPDATE psn_raw_response SET normalized_at = NULL WHERE sync_run_id = ?")
			.bind(laufId)
			.run();
		return ergebnis.meta.changes ?? 0;
	}

	/**
	 * Setzt einen abgeschlossenen Lauf zurueck in die Normalisierungsphase.
	 * Ohne das wuerde der naechste Sync-Aufruf einen neuen Lauf starten und
	 * PSN anfassen - genau das soll die Wiederholung ja vermeiden.
	 */
	async zurueckInNormalisierung(laufId: number): Promise<void> {
		await this.db
			.prepare(
				"UPDATE psn_sync_run SET status = 'laufend', phase = 'normalisierung', " +
					"finished_at = NULL, error_message = NULL, failed_attempts = 0 WHERE id = ?",
			)
			.bind(laufId)
			.run();
	}

	/**
	 * Fortschritt der PSN-Zusatzabrufe (Stufe 18c): Wo steht die Blaetterung,
	 * wann lief der letzte vollstaendige Durchlauf, welche Releases hat PSN
	 * in diesem Durchlauf als PS+ genannt.
	 *
	 * In app_setting statt in einer eigenen Tabelle: Es ist Arbeitszustand
	 * weniger Zeilen, kein Fachdatum - dieselbe Ablage wie der Cron-Verlauf
	 * und der Sicherungsstand.
	 */
	async fortschritt(schluessel: string): Promise<string | null> {
		return (await einzeln(this.db, this.einstellungenBaustein([schluessel]))).get(schluessel) ?? null;
	}

	/**
	 * Mehrere Werte aus app_setting in einer Anweisung (Stufe 18j) - der Cron
	 * liest Verlauf, Stand und die Fortschritte der Schritte zusammen. Ein
	 * Schluessel ohne Zeile fehlt in der Map.
	 */
	einstellungenBaustein(schluessel: readonly string[]): Baustein<Map<string, string>> {
		const platzhalter = schluessel.map(() => "?").join(",");
		return eins(
			this.db.prepare(`SELECT key, value FROM app_setting WHERE key IN (${platzhalter})`).bind(...schluessel),
			(e) => new Map(zeilen<{ key: string; value: string }>(e).map((z) => [z.key, z.value])),
		);
	}

	async fortschrittSetzenWert(schluessel: string, wert: string): Promise<void> {
		await this.db
			.prepare(
				"INSERT INTO app_setting (key, value) VALUES (?, ?) " +
					"ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			)
			.bind(schluessel, wert)
			.run();
	}

	/**
	 * Den Ausgang eines Cron-Aufrufs festhalten (nur Zahlen und feste Texte) -
	 * der Schreib-Batch jedes Aufrufs (Stufe 18j).
	 *
	 * Folgt er einem Aufruf derselben Arbeit, werden beide zu einer Zeile
	 * verdichtet, statt die Nacht aus dem Verlauf zu draengen (Stufe 18d fuer
	 * den Leerlauf, 18e fuer jede Arbeit). Ein Lebenszeichen bleibt so oder so
	 * stehen: Die verdichtete Zeile traegt die Zeit des juengsten Aufrufs.
	 *
	 * Mit `marke` (Stufe 18g) kommen davor die Aufrufe ohne Ausgang in den
	 * Verlauf, und im SELBEN Batch gehen die eigene Marke und die gemeldeten
	 * weg. Getrennt geschrieben, bliebe eine Marke stehen, wenn der Aufruf
	 * dazwischen stirbt, und der naechste meldete einen Aufruf als verwaist,
	 * dessen Ausgang laengst im Verlauf steht.
	 *
	 * `verlauf` ist der Verlauf, wie ihn der Lage-Batch gelesen hat; fehlt er -
	 * im `catch`, wenn schon die Lage scheiterte -, wird er hier gelesen. `fakt`
	 * landet unter `cron_stand` beim eigenen Bereich, ohne den Stand vorher zu
	 * lesen: `json_set` fuegt ihn ein, und ein unlesbarer Stand wird ersetzt,
	 * statt den ganzen Batch und damit die Verlaufszeile zu reissen.
	 */
	async cronAusgangVermerken(
		zeitstempel: string,
		zeile: string,
		marke?: CronMarke,
		optionen: { verlauf?: string[]; fakt?: { bereich: string; wert: CronFakt } } = {},
	): Promise<void> {
		const gelesen = optionen.verlauf ?? (await this.cronVerlauf());
		const bisher = marke?.verwaist ? [verwaistZeile(marke.verwaist), ...gelesen] : gelesen;
		const neue = `${zeitstempel} ${zeile}`;
		const verdichtet = bisher[0] ? verdichte(bisher[0], neue) : null;
		const alle = verdichtet ? [verdichtet, ...bisher.slice(1)] : [neue, ...bisher];
		const wert = alle.slice(0, CRON_VERLAUF_LAENGE).join("\n");
		const anweisungen: D1PreparedStatement[] = [
			this.db
				.prepare(
					"INSERT INTO app_setting (key, value) VALUES (?, ?) " +
						"ON CONFLICT(key) DO UPDATE SET value = excluded.value",
				)
				.bind(SCHLUESSEL_CRON, wert),
		];
		if (marke) {
			anweisungen.push(this.db.prepare("DELETE FROM app_setting WHERE key = ?").bind(marke.schluessel));
			if (marke.verwaistBis !== null) {
				// Die gemeldete Kette als Bereich: Sie reicht vom Anfang bis zur
				// juengsten verwaisten Marke. Alles danach ist juenger als zwei
				// Minuten - ein laufender Aufruf - und bleibt stehen.
				anweisungen.push(
					this.db
						.prepare("DELETE FROM app_setting WHERE key >= ? AND key <= ?")
						.bind(MARKE_VON, marke.verwaistBis),
				);
			}
		}
		const stand: Array<[string, string]> = [];
		if (optionen.fakt) stand.push([`$.${optionen.fakt.bereich}`, JSON.stringify(optionen.fakt.wert)]);
		if (marke?.verwaist) {
			stand.push(["$.ohneAusgang", JSON.stringify({ ...marke.verwaist, gemeldetAm: zeitstempel })]);
		}
		if (stand.length > 0) {
			const pfade = stand.map(() => "?, json(?)").join(", ");
			const werte = stand.flat();
			anweisungen.push(
				this.db
					.prepare(
						`INSERT INTO app_setting (key, value) VALUES (?, json_set('{}', ${pfade})) ` +
							"ON CONFLICT(key) DO UPDATE SET value = CASE WHEN json_valid(value) " +
							`THEN json_set(value, ${pfade}) ELSE json_set('{}', ${pfade}) END`,
					)
					.bind(SCHLUESSEL_STAND, ...werte, ...werte, ...werte),
			);
		}
		await this.db.batch(anweisungen);
	}

	/**
	 * Die Marke "begonnen" setzen (Stufe 18g) - als Baustein fuer den Anfang
	 * des Lage-Batchs (Stufe 18j). Drei Anweisungen in fester Reihenfolge:
	 *
	 * 1. die vorhandenen Marken LESEN - vor dem Setzen, sonst laese der Aufruf
	 *    seine eigene mit;
	 * 2. die eigene SETZEN, mit `gekappt`, wenn schon MARKEN_HOECHSTENS
	 *    liegen und die dritte gleich etwas entfernt;
	 * 3. ueber MARKEN_HOECHSTENS hinaus die AELTESTEN entfernen.
	 *
	 * Gemeldet wird die Kette nicht hier, sondern mit dem naechsten vermerkten
	 * Ausgang: Solange die CPU-Grenze greift, stirbt der meldende Aufruf
	 * genauso - die liegengebliebenen Zeilen SIND die Kette, und der erste
	 * Aufruf, der durchkommt, schreibt sie (der 16.10.2026: achtzehn tote
	 * Aufrufe von 06:30 bis 08:00).
	 */
	cronBeginnenBaustein(jetzt: Date, bereich: string): Baustein<CronMarke> {
		const am = jetzt.toISOString();
		const schluessel = `${MARKE_PRAEFIX}:${am}:${bereich}`;
		const bereichSql = "key >= ? AND key < ?";
		return {
			anweisungen: [
				this.db
					.prepare(`SELECT key, value FROM app_setting WHERE ${bereichSql} ORDER BY key`)
					.bind(MARKE_VON, MARKE_BIS),
				this.db
					.prepare(
						"INSERT INTO app_setting (key, value) VALUES (?, json_object('am', ?, 'bereich', ?, 'gekappt', " +
							`(SELECT COUNT(*) FROM app_setting WHERE ${bereichSql}) >= ${MARKEN_HOECHSTENS})) ` +
							"ON CONFLICT(key) DO UPDATE SET value = excluded.value",
					)
					.bind(schluessel, am, bereich, MARKE_VON, MARKE_BIS),
				this.db
					.prepare(
						`DELETE FROM app_setting WHERE ${bereichSql} AND key < (SELECT key FROM app_setting WHERE ${bereichSql} ` +
							`ORDER BY key DESC LIMIT 1 OFFSET ${MARKEN_HOECHSTENS - 1})`,
					)
					.bind(MARKE_VON, MARKE_BIS, MARKE_VON, MARKE_BIS),
			],
			lesen: ([marken]) => ({ schluessel, ...ketteAus(zeilen<{ key: string; value: string }>(marken), jetzt) }),
		};
	}

	/** Die Marke allein setzen - fuer Tests und den Fall ohne Lage. */
	async cronBeginnen(jetzt: Date, bereich: string): Promise<CronMarke> {
		return einzeln(this.db, this.cronBeginnenBaustein(jetzt, bereich));
	}

	/** Die letzten Cron-Ausgaenge, neueste zuerst - fuer die Einstellungen. */
	async cronVerlauf(): Promise<string[]> {
		return verlaufAus((await einzeln(this.db, this.einstellungenBaustein([SCHLUESSEL_CRON]))).get(SCHLUESSEL_CRON));
	}

	/** Der Stand unter `cron_stand` (Stufe 18j), oder ein leerer. */
	async cronStand(): Promise<CronStand> {
		return standAus((await einzeln(this.db, this.einstellungenBaustein([SCHLUESSEL_STAND]))).get(SCHLUESSEL_STAND));
	}

	async letzterErfolgreicherLauf(): Promise<SyncLauf | null> {
		return this.db
			.prepare("SELECT * FROM psn_sync_run WHERE status = 'erfolg' ORDER BY id DESC LIMIT 1")
			.first<SyncLauf>();
	}

	/**
	 * Fortschritt festhalten - und den Fehlerzaehler loeschen (Stufe 18e).
	 *
	 * Gezaehlt werden Fehlversuche an DERSELBEN Stelle, nicht ueber die Nacht
	 * verteilte: Eine Seite, die beim zweiten Anlauf durchgeht, soll die
	 * naechste nicht belasten.
	 */
	async fortschrittSetzen(laufId: number, naechsterOffset: number): Promise<void> {
		await this.db
			.prepare("UPDATE psn_sync_run SET next_offset = ?, failed_attempts = 0 WHERE id = ?")
			.bind(naechsterOffset, laufId)
			.run();
	}

	/**
	 * Einen Fehlversuch vermerken, ohne den Lauf zu beenden (Stufe 18e).
	 *
	 * Der Lauf bleibt 'laufend', damit der naechste Cron-Aufruf fuenf Minuten
	 * spaeter dieselbe Seite ab `next_offset` erneut holt; die Meldung steht
	 * schon jetzt in `error_message`, sonst waere der Versuch unsichtbar.
	 * Rueckgabe: die Zahl der Fehlversuche nach diesem.
	 */
	async fehlversuchVermerken(laufId: number, meldung: string): Promise<number> {
		const z = await this.db
			.prepare(
				"UPDATE psn_sync_run SET failed_attempts = failed_attempts + 1, error_message = ? " +
					"WHERE id = ? RETURNING failed_attempts",
			)
			.bind(meldung, laufId)
			.first<{ failed_attempts: number }>();
		return z?.failed_attempts ?? 0;
	}

	async abschliessen(laufId: number, titlesSeen: number): Promise<void> {
		await this.db
			.prepare(
				"UPDATE psn_sync_run SET status = 'erfolg', finished_at = datetime('now'), " +
					"titles_seen = ? WHERE id = ?",
			)
			.bind(titlesSeen, laufId)
			.run();
	}

	/** Die Meldung wird vom Aufrufer bereits bereinigt uebergeben. */
	async fehlschlagen(laufId: number, meldung: string): Promise<void> {
		await this.db
			.prepare(
				"UPDATE psn_sync_run SET status = 'fehler', finished_at = datetime('now'), " +
					"error_message = ? WHERE id = ?",
			)
			.bind(meldung, laufId)
			.run();
	}
}
