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

export type Einreihung = {
	/** Neue Zeilen je Grund - aktualisierte Details zaehlen nicht mit. */
	erstimport: number;
	neueTrophaeen: number;
	dlcErweitert: number;
	alsKomplettGestempelt: number;
};

export function einreihungSumme(e: Pick<Einreihung, "erstimport" | "neueTrophaeen" | "dlcErweitert">): number {
	return e.erstimport + e.neueTrophaeen + e.dlcErweitert;
}

const EARNED = "(t.earned_bronze + t.earned_silver + t.earned_gold + t.earned_platinum)";
const DEFINED = "(t.defined_bronze + t.defined_silver + t.defined_gold + t.defined_platinum)";

/**
 * Pruefliste (Abschnitt 8.1).
 *
 * Der Sync schreibt nur in die Warteschlange, nie einen Status. Drei Gruende:
 * 'erstimport' fuer nie durchgesehene Listen, 'neue_trophaeen' und
 * 'dlc_erweitert' aus dem Vergleich mit dem Stempel der letzten Durchsicht
 * (Aenderungserkennung, Stufe 13).
 */
export class ReviewRepository {
	constructor(
		private readonly db: D1Database,
		private readonly playStatus: PlayStatusRepository,
		private readonly kopplung: Kopplung,
	) {}

	/**
	 * Stempeln und einreihen, ein Batch, set-basiert (CPU-Grenze). Laeuft am
	 * Ende jeder Normalisierung und nach jeder Zuordnung. Idempotent.
	 *
	 * 1. 100 % wird nicht vorgelegt, sondern still gestempelt: alle Trophaeen
	 *    des Hauptspiels und aller DLC erspielt, der Status steht aus der
	 *    Vorbelegung schon auf 'komplettiert'. Der Stempel ist kein Urteil,
	 *    sondern der Referenzpunkt fuer Schritt 3.
	 *
	 * 2. erstimport = zugeordnet, noch nie durchgesehen (reviewed_at IS NULL)
	 *    und - nach Schritt 1 von selbst - unter 100 %. Nicht "keine
	 *    play_status-Zeile": seit Stufe 6 belegt der Sync den Status vor.
	 *
	 * 3. Aenderungserkennung, nur fuer gestempelte Listen, gegen den letzten
	 *    *geprueften* Stand (4.1), nicht den letzten Sync:
	 *      - Liste gewachsen (defined > Stempel)   → 'dlc_erweitert', ohne
	 *        Statusfilter: eine Erweiterung ist eine Aenderung am Spiel
	 *        selbst und gerade bei einem aktiv gespielten Titel relevant
	 *      - mehr erspielt (earned > Stempel)      → 'neue_trophaeen', aber
	 *        nicht bei 'am_spielen': eigener Fortschritt am laufenden Spiel
	 *        ist der Normalfall, keine Nachricht
	 *    Beides zugleich → 'dlc_erweitert', das detail nennt beides. Schon in
	 *    der Warteschlange → Grund und detail aktualisiert, enqueued_at bleibt.
	 *    Ein 'erstimport'-Eintrag kollidiert nie, er setzt reviewed_at IS
	 *    NULL voraus. Sinkende Zaehler erzeugen nichts.
	 *
	 * Rueckgabe: neue Zeilen je Grund, als Differenz der Zaehlung vor und
	 * nach dem Batch - meta.changes zaehlte aktualisierte Details mit.
	 */
	async einreihen(): Promise<Einreihung> {
		const vorher = await this.zaehlungNachGrund();
		const [gestempelt] = await this.db.batch([
			this.db.prepare(
				"UPDATE trophy_progress SET " +
					"reviewed_earned_total = earned_bronze + earned_silver + earned_gold + earned_platinum, " +
					"reviewed_defined_total = defined_bronze + defined_silver + defined_gold + defined_platinum, " +
					"reviewed_progress_pct = progress_pct, " +
					"reviewed_at = datetime('now') " +
					"WHERE release_id IS NOT NULL AND reviewed_at IS NULL AND progress_pct >= 100",
			),
			this.db.prepare(
				"INSERT OR IGNORE INTO review_queue (release_id, reason) " +
					"SELECT t.release_id, 'erstimport' FROM trophy_progress t " +
					"WHERE t.release_id IS NOT NULL AND t.reviewed_at IS NULL",
			),
			this.db.prepare(
				"INSERT INTO review_queue (release_id, reason, detail) " +
					"SELECT t.release_id, " +
					`CASE WHEN ${DEFINED} > t.reviewed_defined_total THEN 'dlc_erweitert' ELSE 'neue_trophaeen' END, ` +
					`CASE WHEN ${DEFINED} > t.reviewed_defined_total THEN ` +
					`printf('%d %% → %d %%, Liste um %d Trophäen gewachsen', t.reviewed_progress_pct, t.progress_pct, ${DEFINED} - t.reviewed_defined_total) ` +
					`|| CASE WHEN ${EARNED} > t.reviewed_earned_total THEN printf(', %d davon erspielt', ${EARNED} - t.reviewed_earned_total) ELSE '' END ` +
					`ELSE printf('%d %% → %d %%, %d neue Trophäen erspielt', t.reviewed_progress_pct, t.progress_pct, ${EARNED} - t.reviewed_earned_total) END ` +
					"FROM trophy_progress t JOIN play_status ps ON ps.release_id = t.release_id " +
					"WHERE t.release_id IS NOT NULL AND t.reviewed_at IS NOT NULL " +
					`AND (${DEFINED} > t.reviewed_defined_total ` +
					`OR (${EARNED} > t.reviewed_earned_total AND ps.status <> 'am_spielen')) ` +
					"ON CONFLICT(release_id) DO UPDATE SET reason = excluded.reason, detail = excluded.detail",
			),
		]);
		const nachher = await this.zaehlungNachGrund();
		return {
			erstimport: nachher.erstimport - vorher.erstimport,
			neueTrophaeen: nachher.neue_trophaeen - vorher.neue_trophaeen,
			dlcErweitert: nachher.dlc_erweitert - vorher.dlc_erweitert,
			alsKomplettGestempelt: gestempelt.meta.changes ?? 0,
		};
	}

	private async zaehlungNachGrund(): Promise<Record<ReviewGrund, number>> {
		const { results } = await this.db
			.prepare("SELECT reason, COUNT(*) AS n FROM review_queue GROUP BY reason")
			.all<{ reason: ReviewGrund; n: number }>();
		const z: Record<ReviewGrund, number> = { erstimport: 0, neue_trophaeen: 0, dlc_erweitert: 0 };
		for (const r of results) z[r.reason] = r.n;
		return z;
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
