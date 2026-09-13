import { wirkung, type ReviewAktion, type ReviewGrund } from "../domain/review";
import type { PlayStatus } from "../domain/play-status";
import type { PlayStatusRepository } from "./play-status";

export type ReviewZeile = {
	reason: ReviewGrund;
	detail: string | null;
	enqueued_at: string;
	game_id: number;
	title: string;
	cover_url: string | null;
	release_id: number;
	platform: string;
	icon_url: string | null;
	progress_pct: number | null;
	last_played_at: string | null;
	hat_platin: number | null;
	defined_bronze: number | null;
	defined_silver: number | null;
	defined_gold: number | null;
	defined_platinum: number | null;
	earned_bronze: number | null;
	earned_silver: number | null;
	earned_gold: number | null;
	earned_platinum: number | null;
	aktueller_status: PlayStatus | null;
};

export type ReviewFortschritt = {
	offen: number;
	erledigt: number;
	gesamt: number;
	/** Die zweite Runde: bewusst uebersprungen, ueber den Status-Filter auffindbar. */
	unentschieden: number;
};

/**
 * Pruefliste (Abschnitt 8.1).
 *
 * Der Sync schreibt nur in die Warteschlange, nie einen Status. Stufe 7
 * kennt nur den Grund 'erstimport'; neue_trophaeen und dlc_erweitert kommen
 * mit der Aenderungserkennung in Stufe 13.
 */
export class ReviewRepository {
	constructor(
		private readonly db: D1Database,
		private readonly playStatus: PlayStatusRepository,
	) {}

	/**
	 * erstimport = zugeordnet und noch nie durchgesehen (reviewed_at IS NULL).
	 * Nicht "keine play_status-Zeile": seit Stufe 6 belegt der Sync den
	 * Status vor, fast jedes Release hat also eine. Idempotent.
	 */
	async einreihen(): Promise<number> {
		const ergebnis = await this.db
			.prepare(
				"INSERT OR IGNORE INTO review_queue (release_id, reason) " +
					"SELECT t.release_id, 'erstimport' FROM trophy_progress t " +
					"WHERE t.release_id IS NOT NULL AND t.reviewed_at IS NULL",
			)
			.run();
		return ergebnis.meta.changes ?? 0;
	}

	async naechste(limit: number, offset: number): Promise<ReviewZeile[]> {
		const { results } = await this.db
			.prepare(
				"SELECT reason, detail, enqueued_at, game_id, title, cover_url, release_id, platform, " +
					"icon_url, progress_pct, last_played_at, hat_platin, " +
					"defined_bronze, defined_silver, defined_gold, defined_platinum, " +
					"earned_bronze, earned_silver, earned_gold, earned_platinum, aktueller_status " +
					"FROM v_review_offen LIMIT ? OFFSET ?",
			)
			.bind(limit, offset)
			.all<ReviewZeile>();
		return results;
	}

	async anzahlOffen(): Promise<number> {
		const z = await this.db.prepare("SELECT COUNT(*) AS n FROM review_queue").first<{ n: number }>();
		return z?.n ?? 0;
	}

	async fortschritt(): Promise<ReviewFortschritt> {
		const z = await this.db
			.prepare(
				"SELECT (SELECT COUNT(*) FROM review_queue) AS offen, " +
					"(SELECT COUNT(*) FROM trophy_progress WHERE release_id IS NOT NULL AND reviewed_at IS NOT NULL) AS erledigt, " +
					"(SELECT COUNT(*) FROM trophy_progress WHERE release_id IS NOT NULL) AS gesamt, " +
					"(SELECT COUNT(*) FROM play_status WHERE status = 'unentschieden') AS unentschieden",
			)
			.first<ReviewFortschritt>();
		return z ?? { offen: 0, erledigt: 0, gesamt: 0, unentschieden: 0 };
	}

	/**
	 * Eine Entscheidung, ein Batch - sofort gespeichert (Risikotabelle:
	 * "Triage bricht in der Mitte ab").
	 *
	 * Status ueber statusStatement, damit Datum, Bewertung und Notiz stehen
	 * bleiben. plan_entry nur, wenn noch kein offener todo/backlog-Eintrag
	 * am Release haengt. Gibt null zurueck, wenn kein Eintrag offen ist.
	 */
	async entscheiden(
		releaseId: number,
		aktion: ReviewAktion,
	): Promise<{ status: PlayStatus | null; planAngelegt: boolean } | null> {
		const offen = await this.db
			.prepare("SELECT 1 AS x FROM review_queue WHERE release_id = ?")
			.bind(releaseId)
			.first();
		if (!offen) return null;

		const w = wirkung(aktion);
		const statements: D1PreparedStatement[] = [];
		if (w.status) statements.push(this.playStatus.statusStatement(releaseId, w.status));
		statements.push(...this.playStatus.stempelStatements(releaseId));
		if (w.plan) {
			statements.push(
				this.db
					.prepare(
						"INSERT INTO plan_entry (kind, release_id, origin) SELECT ?, ?, 'triage' " +
							"WHERE NOT EXISTS (SELECT 1 FROM plan_entry WHERE release_id = ? " +
							"AND kind IN ('todo','backlog') AND status = 'offen')",
					)
					.bind(w.plan, releaseId, releaseId),
			);
		}

		const ergebnisse = await this.db.batch(statements);
		const planAngelegt = w.plan !== null && (ergebnisse.at(-1)?.meta.changes ?? 0) > 0;

		const status = w.status ?? (await this.playStatus.fuerRelease(releaseId))?.status ?? null;
		return { status, planAngelegt };
	}
}
