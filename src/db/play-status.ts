import type { PlayStatus } from "../domain/play-status";
import type { EventRepository } from "./events";

export type PlayStatusZeile = {
	release_id: number;
	status: PlayStatus;
	started_at: string | null;
	finished_at: string | null;
	rating: number | null;
	notes: string | null;
	updated_at: string;
};

export type PlayStatusFelder = {
	status: PlayStatus;
	startedAt?: string | null;
	finishedAt?: string | null;
	rating?: number | null;
	notes?: string | null;
};

export type AbweichungZeile = {
	game_id: number;
	release_id: number;
	title: string;
	platform: string;
	progress_pct: number | null;
	status: PlayStatus;
};

/**
 * Eigene Bewertung (Abschnitt 4.2).
 *
 * Zwei Schreibpfade, streng getrennt:
 *   setzen / statusSetzen - der Nutzer entscheidet (Spieldetail, Pruefliste,
 *                 Listenknoepfe ueber die Kopplung, 5.5); ueberschreibt immer
 *   vorbelegen  - die einzige Automatik; schreibt nur, wo keine Zeile ist
 *                 oder 'nicht_gespielt' steht, und ruehrt sonst nichts an
 *
 * Wer hier einen dritten automatischen Pfad ergaenzt, hebelt die Trennung
 * von Fremddaten und eigener Bewertung aus.
 */
export class PlayStatusRepository {
	constructor(
		private readonly db: D1Database,
		private readonly events: EventRepository,
	) {}

	async fuerRelease(releaseId: number): Promise<PlayStatusZeile | null> {
		return this.db
			.prepare(
				"SELECT release_id, status, started_at, finished_at, rating, notes, updated_at " +
					"FROM play_status WHERE release_id = ?",
			)
			.bind(releaseId)
			.first<PlayStatusZeile>();
	}

	async fuerSpiel(gameId: number): Promise<PlayStatusZeile[]> {
		const { results } = await this.db
			.prepare(
				"SELECT release_id, status, started_at, finished_at, rating, notes, updated_at " +
					"FROM play_status WHERE release_id IN (SELECT id FROM release WHERE game_id = ?)",
			)
			.bind(gameId)
			.all<PlayStatusZeile>();
		return results;
	}

	/**
	 * Nutzerentscheidung. Setzt die Bewertung und gilt zugleich als
	 * Durchsicht (Abschnitt 8.1): reviewed_* wird auf den aktuellen
	 * Trophaeenstand gestempelt und ein offener Pruefeintrag entfernt - sonst
	 * legte die Pruefliste dasselbe Spiel gleich noch einmal vor.
	 *
	 * Alles in einem Batch. Gibt false zurueck, wenn das Release fehlt.
	 */
	async setzen(releaseId: number, felder: PlayStatusFelder): Promise<PlayStatusZeile | null> {
		const release = await this.db.prepare("SELECT 1 AS x FROM release WHERE id = ?").bind(releaseId).first();
		if (!release) return null;
		const vorher = await this.fuerRelease(releaseId);

		await this.db.batch([
			...this.ereignisse(releaseId, vorher, felder),
			this.db
				.prepare(
					"INSERT INTO play_status (release_id, status, started_at, finished_at, rating, notes) " +
						"VALUES (?, ?, ?, ?, ?, ?) " +
						"ON CONFLICT(release_id) DO UPDATE SET status = excluded.status, " +
						"started_at = excluded.started_at, finished_at = excluded.finished_at, " +
						"rating = excluded.rating, notes = excluded.notes, updated_at = datetime('now')",
				)
				.bind(
					releaseId,
					felder.status,
					felder.startedAt ?? null,
					felder.finishedAt ?? null,
					felder.rating ?? null,
					felder.notes ?? null,
				),
			...this.stempelStatements(releaseId),
		]);

		return this.fuerRelease(releaseId);
	}

	/** Nur den Status, mit Stempel (statusStatement + stempelStatements) - fuer Listenknoepfe und PATCH. */
	async statusSetzen(releaseId: number, status: PlayStatus): Promise<PlayStatusZeile | null> {
		const release = await this.db.prepare("SELECT 1 AS x FROM release WHERE id = ?").bind(releaseId).first();
		if (!release) return null;
		const vorher = (await this.fuerRelease(releaseId))?.status ?? null;
		await this.db.batch([
			...this.statusStatements(releaseId, vorher, status),
			...this.stempelStatements(releaseId),
		]);
		return this.fuerRelease(releaseId);
	}

	/**
	 * statusStatement samt Protokoll (8.5): Der Aufrufer kennt den alten
	 * Status schon, ein unveraenderter Wert erzeugt kein Ereignis.
	 */
	statusStatements(releaseId: number, vorher: PlayStatus | null, status: PlayStatus, detail?: string): D1PreparedStatement[] {
		const statements = [this.statusStatement(releaseId, status)];
		if (vorher !== status) {
			statements.unshift(
				this.events.statement({ source: "nutzer", kind: "status_geaendert", releaseId, alt: vorher, neu: status, detail }),
			);
		}
		return statements;
	}

	/** Protokoll fuer setzen: Status und jedes geaenderte Bewertungsfeld einzeln. */
	private ereignisse(releaseId: number, vorher: PlayStatusZeile | null, felder: PlayStatusFelder): D1PreparedStatement[] {
		const statements: D1PreparedStatement[] = [];
		if (vorher?.status !== felder.status) {
			statements.push(
				this.events.statement({ source: "nutzer", kind: "status_geaendert", releaseId, alt: vorher?.status ?? null, neu: felder.status }),
			);
		}
		const paare: Array<[string, string | number | null, string | number | null]> = [
			["started_at", vorher?.started_at ?? null, felder.startedAt ?? null],
			["finished_at", vorher?.finished_at ?? null, felder.finishedAt ?? null],
			["rating", vorher?.rating ?? null, felder.rating ?? null],
			["notes", vorher?.notes ?? null, felder.notes ?? null],
		];
		for (const [field, alt, neu] of paare) {
			if (String(alt ?? "") === String(neu ?? "")) continue;
			statements.push(this.events.statement({ source: "nutzer", kind: "bewertung_geaendert", releaseId, field, alt, neu }));
		}
		return statements;
	}

	/**
	 * Nur den Status setzen - Datum, Bewertung und Notiz bleiben stehen.
	 * Fuer die Pruefliste: Eine Triage-Entscheidung darf keine Notiz
	 * loeschen. Stempelt und raeumt wie setzen.
	 */
	statusStatement(releaseId: number, status: PlayStatus): D1PreparedStatement {
		return this.db
			.prepare(
				"INSERT INTO play_status (release_id, status) VALUES (?, ?) " +
					"ON CONFLICT(release_id) DO UPDATE SET status = excluded.status, updated_at = datetime('now')",
			)
			.bind(releaseId, status);
	}

	/**
	 * Durchsicht festhalten (Abschnitt 8.1): reviewed_* auf den aktuellen
	 * Trophaeenstand stempeln und den offenen Pruefeintrag entfernen. Von
	 * setzen und von der Pruefliste gemeinsam benutzt, damit "durchgesehen"
	 * ueberall dasselbe heisst. Der Prozentwert kommt mit, weil er sich aus
	 * den Zaehlern nicht rekonstruieren laesst (Sony gewichtet) und die
	 * Aenderungserkennung ihn fuer "100 % → 78 %" braucht.
	 */
	stempelStatements(releaseId: number): D1PreparedStatement[] {
		return [
			this.db
				.prepare(
					"UPDATE trophy_progress SET " +
						"reviewed_earned_total = earned_bronze + earned_silver + earned_gold + earned_platinum, " +
						"reviewed_defined_total = defined_bronze + defined_silver + defined_gold + defined_platinum, " +
						"reviewed_progress_pct = progress_pct, " +
						"reviewed_at = datetime('now') WHERE release_id = ?",
				)
				.bind(releaseId),
			this.db.prepare("DELETE FROM review_queue WHERE release_id = ?").bind(releaseId),
		];
	}

	/**
	 * Vorbelegung nach Abschnitt 4.2 - set-basiert, ein Statement.
	 *
	 * Schreibt fuer jede zugeordnete Liste mit Fortschritt eine Zeile, wenn
	 * keine existiert, und ersetzt eine bestehende nur, wenn sie
	 * 'nicht_gespielt' lautet (Risikotabelle, Abschnitt 17). Jeder andere
	 * Wert ist eine Entscheidung des Nutzers und bleibt stehen - auch
	 * 'am_spielen' bei inzwischen 100 %: das ist ein Fall fuer die
	 * Pruefliste, nicht fuer eine stille Aenderung.
	 *
	 * Rueckgabe: Zahl der angelegten oder geaenderten Zeilen.
	 */
	async vorbelegen(): Promise<number> {
		// Protokoll (8.5) im selben Batch davor, mit derselben Bedingung wie
		// der Konfliktzweig: nur Releases ohne Zeile oder mit 'nicht_gespielt'.
		const [, ergebnis] = await this.db.batch([
			this.events.insertSelect(
				"SELECT 'sync', r.game_id, t.release_id, g.title || ' (' || r.platform || ')', 'status_vorbelegt', 'status', " +
					"ps.status, CASE WHEN t.progress_pct >= 100 THEN 'komplettiert' ELSE 'am_spielen' END, NULL " +
					"FROM trophy_progress t JOIN release r ON r.id = t.release_id JOIN game g ON g.id = r.game_id " +
					"LEFT JOIN play_status ps ON ps.release_id = t.release_id " +
					"WHERE t.release_id IS NOT NULL AND t.progress_pct > 0 " +
					"AND (ps.release_id IS NULL OR ps.status = 'nicht_gespielt')",
			),
			this.db.prepare(
				"INSERT INTO play_status (release_id, status) " +
					"SELECT t.release_id, CASE WHEN t.progress_pct >= 100 THEN 'komplettiert' ELSE 'am_spielen' END " +
					"FROM trophy_progress t WHERE t.release_id IS NOT NULL AND t.progress_pct > 0 " +
					"ON CONFLICT(release_id) DO UPDATE SET status = excluded.status, updated_at = datetime('now') " +
					"WHERE play_status.status = 'nicht_gespielt'",
			),
		]);
		return ergebnis.meta.changes ?? 0;
	}

	async abweichungen(): Promise<AbweichungZeile[]> {
		const { results } = await this.db
			.prepare(
				"SELECT game_id, release_id, title, platform, progress_pct, status " +
					"FROM v_abweichungen ORDER BY title, platform",
			)
			.all<AbweichungZeile>();
		return results;
	}
}
