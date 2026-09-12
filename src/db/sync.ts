export type SyncStatus = "laufend" | "erfolg" | "fehler";

export type SyncPhase = "abruf" | "normalisierung";

export type SyncLauf = {
	id: number;
	started_at: string;
	finished_at: string | null;
	status: SyncStatus;
	error_message: string | null;
	titles_seen: number | null;
	next_offset: number;
	phase: SyncPhase;
};

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

	async letzterLauf(): Promise<SyncLauf | null> {
		return this.db
			.prepare("SELECT * FROM psn_sync_run ORDER BY id DESC LIMIT 1")
			.first<SyncLauf>();
	}

	async starten(): Promise<SyncLauf> {
		const zeile = await this.db
			.prepare(
				"INSERT INTO psn_sync_run (started_at, status, next_offset) " +
					"VALUES (datetime('now'), 'laufend', 0) RETURNING *",
			)
			.first<SyncLauf>();
		if (!zeile) throw new Error("Sync-Lauf konnte nicht angelegt werden.");
		return zeile;
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
					"finished_at = NULL, error_message = NULL WHERE id = ?",
			)
			.bind(laufId)
			.run();
	}

	async letzterErfolgreicherLauf(): Promise<SyncLauf | null> {
		return this.db
			.prepare("SELECT * FROM psn_sync_run WHERE status = 'erfolg' ORDER BY id DESC LIMIT 1")
			.first<SyncLauf>();
	}

	async fortschrittSetzen(laufId: number, naechsterOffset: number): Promise<void> {
		await this.db
			.prepare("UPDATE psn_sync_run SET next_offset = ? WHERE id = ?")
			.bind(naechsterOffset, laufId)
			.run();
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
