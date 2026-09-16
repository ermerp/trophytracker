import { wirkung, type ReviewAktion, type ReviewGrund } from "../domain/review";
import type { PlayStatus } from "../domain/play-status";
import type { Kopplung } from "./kopplung";
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
		private readonly kopplung: Kopplung,
	) {}

	/**
	 * erstimport = zugeordnet, noch nie durchgesehen (reviewed_at IS NULL)
	 * und **unter 100 %**.
	 *
	 * 100 % heisst: alle Trophaeen des Hauptspiels und aller DLC erspielt.
	 * Da gibt es nichts zu entscheiden, der Status steht aus der Vorbelegung
	 * schon auf 'komplettiert'. Solche Titel werden deshalb still gestempelt
	 * statt vorgelegt - das erste Statement unten. Der Stempel ist kein
	 * Urteil, sondern der Referenzpunkt: Erhoeht spaeter ein DLC die
	 * Trophaeenzahl, faellt der Titel unter 100 % und die
	 * Aenderungserkennung (Stufe 13) legt ihn vor. Ohne Stempel gaebe es
	 * dafuer keinen Vergleichswert.
	 *
	 * Nicht "keine play_status-Zeile": seit Stufe 6 belegt der Sync den
	 * Status vor, fast jedes Release hat also eine. Idempotent.
	 */
	async einreihen(): Promise<{ eingereiht: number; alsKomplettGestempelt: number }> {
		const [gestempelt, eingereiht] = await this.db.batch([
			this.db.prepare(
				"UPDATE trophy_progress SET " +
					"reviewed_earned_total = earned_bronze + earned_silver + earned_gold + earned_platinum, " +
					"reviewed_defined_total = defined_bronze + defined_silver + defined_gold + defined_platinum, " +
					"reviewed_at = datetime('now') " +
					"WHERE release_id IS NOT NULL AND reviewed_at IS NULL AND progress_pct >= 100",
			),
			// Nach dem Stempeln tragen die 100-%-Titel reviewed_at und fallen
			// hier von selbst heraus - keine zweite Bedingung noetig.
			this.db.prepare(
				"INSERT OR IGNORE INTO review_queue (release_id, reason) " +
					"SELECT t.release_id, 'erstimport' FROM trophy_progress t " +
					"WHERE t.release_id IS NOT NULL AND t.reviewed_at IS NULL",
			),
		]);
		return {
			eingereiht: eingereiht.meta.changes ?? 0,
			alsKomplettGestempelt: gestempelt.meta.changes ?? 0,
		};
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
	 * Eine Entscheidung, ein Batch fuer Status und Stempel - sofort
	 * gespeichert (Risikotabelle: "Triage bricht in der Mitte ab"). Danach
	 * die Kopplung (5.5): "Auf To-Do" und "Ins Backlog" legen den Eintrag an
	 * oder haengen einen vorhandenen um; jeder andere Status zieht die Liste
	 * nach (am_spielen → To-Do, durchgespielt → erledigt). Ein nie gestartetes
	 * Spiel kommt ins Backlog, ohne pausiert zu werden.
	 *
	 * Status ueber statusStatement, damit Datum, Bewertung und Notiz stehen
	 * bleiben. Gibt null zurueck, wenn kein Eintrag offen ist.
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
		const aktuell = (await this.playStatus.fuerRelease(releaseId))?.status ?? null;
		const status = w.plan === "backlog" && (aktuell === null || aktuell === "nicht_gespielt") ? null : w.status;

		const statements: D1PreparedStatement[] = [];
		if (status) statements.push(this.playStatus.statusStatement(releaseId, status));
		statements.push(...this.playStatus.stempelStatements(releaseId));
		await this.db.batch(statements);

		let planAngelegt = false;
		if (w.plan) {
			planAngelegt = await this.kopplung.eintragSicherstellen(releaseId, w.plan, "triage");
		} else if (status ?? aktuell) {
			planAngelegt = (await this.kopplung.listeNachStatus(releaseId, (status ?? aktuell)!, "triage")).eintragAngelegt;
		}

		return { status: status ?? aktuell, planAngelegt };
	}
}
