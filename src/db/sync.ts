export type SyncStatus = "laufend" | "erfolg" | "fehler";

export type SyncLauf = {
	id: number;
	started_at: string;
	finished_at: string | null;
	status: SyncStatus;
	error_message: string | null;
	titles_seen: number | null;
	next_offset: number;
};

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
