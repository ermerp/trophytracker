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
		return this.db
			.prepare("SELECT * FROM psn_sync_run WHERE status = 'laufend' ORDER BY id DESC LIMIT 1")
			.first<SyncLauf>();
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
	 * Alle Laeufe, die an oder nach dem UTC-Datum `datum` (YYYY-MM-DD)
	 * gestartet wurden. Der Cron entscheidet daran, ob heute noch ein Lauf
	 * faellig ist (Abschnitt 10.1). Wenige Zeilen: ein bis zwei je Tag.
	 */
	async laeufeSeit(datum: string): Promise<SyncLauf[]> {
		const { results } = await this.db
			.prepare("SELECT * FROM psn_sync_run WHERE started_at >= ? ORDER BY id")
			.bind(datum)
			.all<SyncLauf>();
		return results;
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
		// Der Modifier steht als Text im Statement, nicht als Bind: Zahl aus
		// einer Konstanten, nie aus einer Eingabe (CLAUDE.md, Stufe 18d).
		const frist = `datetime('now', '-${Math.trunc(stunden)} hours')`;
		const ergebnis = await this.db
			.prepare(
				"UPDATE psn_sync_run SET status = 'fehler', finished_at = datetime('now'), error_message = ? " +
					"WHERE status = 'laufend' AND MAX(started_at, COALESCE((SELECT MAX(MAX(r.fetched_at, COALESCE(r.normalized_at, ''))) " +
					`FROM psn_raw_response r WHERE r.sync_run_id = psn_sync_run.id), '')) < ${frist}`,
			)
			.bind(haengerMeldung(stunden))
			.run();
		return ergebnis.meta.changes ?? 0;
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
		const ergebnis = await this.db
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
			.bind(laeufe)
			.run();
		return ergebnis.meta.changes ?? 0;
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
		const z = await this.db
			.prepare("SELECT value FROM app_setting WHERE key = ?")
			.bind(schluessel)
			.first<{ value: string }>();
		return z?.value ?? null;
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
	 * Den Ausgang eines Cron-Aufrufs festhalten (nur Zahlen und feste Texte).
	 *
	 * Folgt er einem Aufruf derselben Arbeit, werden beide zu einer Zeile
	 * verdichtet, statt die Nacht aus dem Verlauf zu draengen (Stufe 18d fuer
	 * den Leerlauf, 18e fuer jede Arbeit). Ein Lebenszeichen bleibt so oder so
	 * stehen: Die verdichtete Zeile traegt die Zeit des juengsten Aufrufs.
	 */
	async cronAusgangVermerken(zeitstempel: string, zeile: string): Promise<void> {
		const bisher = await this.cronVerlauf();
		const neue = `${zeitstempel} ${zeile}`;
		const verdichtet = bisher[0] ? verdichte(bisher[0], neue) : null;
		const alle = verdichtet ? [verdichtet, ...bisher.slice(1)] : [neue, ...bisher];
		const wert = alle.slice(0, CRON_VERLAUF_LAENGE).join("\n");
		await this.db
			.prepare(
				"INSERT INTO app_setting (key, value) VALUES (?, ?) " +
					"ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			)
			.bind(SCHLUESSEL_CRON, wert)
			.run();
	}

	/** Die letzten Cron-Ausgaenge, neueste zuerst - fuer die Einstellungen. */
	async cronVerlauf(): Promise<string[]> {
		const z = await this.db
			.prepare("SELECT value FROM app_setting WHERE key = ?")
			.bind(SCHLUESSEL_CRON)
			.first<{ value: string }>();
		return z?.value ? z.value.split("\n").filter((l) => l !== "") : [];
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
