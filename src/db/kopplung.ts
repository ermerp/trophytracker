import { listeFuerStatus, statusFuerListe, type Listenart } from "../domain/kopplung";
import type { PlayStatus } from "../domain/play-status";
import type { EventRepository } from "./events";
import { POSITION_ANS_ENDE, type PlanHerkunft, type PlanRepository } from "./plan";
import type { PlayStatusRepository } from "./play-status";

/**
 * Kopplung von Liste und Bewertung (Abschnitt 5.5): die eine Stelle, an der
 * ein Listenknopf den Status schreibt und eine Bewertung den Eintrag
 * nachzieht. Jeder Schreibpfad - /api/plans, /api/releases/:id/play-status,
 * die Triage - ruft hierher, damit "To-Do heisst am Spielen" ueberall
 * dasselbe bedeutet. Der Sync ruft nie hierher.
 */
export class Kopplung {
	constructor(
		private readonly db: D1Database,
		private readonly plan: PlanRepository,
		private readonly playStatus: PlayStatusRepository,
		private readonly events: EventRepository,
	) {}

	/**
	 * Liste → Status. Nach einer Listenaktion (anlegen, umhaengen, wieder
	 * oeffnen) den Status setzen; gilt als Durchsicht wie jede Bewertung von
	 * Hand (4.2). Gibt den neuen Status zurueck, null wenn er bleibt.
	 */
	async statusNachListe(releaseId: number, kind: Listenart): Promise<PlayStatus | null> {
		const aktuell = (await this.playStatus.fuerRelease(releaseId))?.status ?? null;
		const neu = statusFuerListe(kind, aktuell);
		if (neu === null) return null;
		await this.playStatus.statusSetzen(releaseId, neu);
		return neu;
	}

	/**
	 * Status → Liste. Nach einer Bewertung den Eintrag anlegen, umhaengen
	 * oder schliessen. Gibt zurueck, was geschehen ist.
	 */
	async listeNachStatus(
		releaseId: number,
		status: PlayStatus,
		origin: PlanHerkunft,
	): Promise<{ eintragAngelegt: boolean; eintraegeErledigt: number }> {
		const liste = listeFuerStatus(status);
		if (liste === null) return { eintragAngelegt: false, eintraegeErledigt: 0 };
		if (liste === "erledigt") return { eintragAngelegt: false, eintraegeErledigt: await this.eintraegeSchliessen(releaseId) };
		return { eintragAngelegt: await this.eintragSicherstellen(releaseId, liste, origin), eintraegeErledigt: 0 };
	}

	/**
	 * Genau ein offener To-Do- oder Backlog-Eintrag je Release: Haengt schon
	 * einer der anderen Art daran, wird er umgehaengt (To-Do ans Ende, Backlog
	 * ohne Position); fehlt einer, entsteht er. Gibt zurueck, ob ein neuer
	 * entstand.
	 */
	async eintragSicherstellen(releaseId: number, kind: Listenart, origin: PlanHerkunft): Promise<boolean> {
		const offen = await this.db
			.prepare("SELECT id, kind FROM plan_entry WHERE release_id = ? AND kind IN ('todo','backlog') AND status = 'offen'")
			.bind(releaseId)
			.first<{ id: number; kind: Listenart }>();
		if (offen) {
			if (offen.kind !== kind) await this.plan.aendern(offen.id, { kind }, "kopplung");
			return false;
		}
		await this.db.batch([
			this.events.statement({ source: "nutzer", kind: "liste_eintrag_angelegt", releaseId, field: kind, neu: "offen", detail: "kopplung" }),
			this.db
				.prepare(
					"INSERT INTO plan_entry (kind, release_id, origin, position) " +
						`VALUES (?, ?, ?, CASE WHEN ? = 'todo' THEN ${POSITION_ANS_ENDE} END)`,
				)
				.bind(kind, releaseId, origin, kind),
		]);
		return true;
	}

	/** Offene To-Do- und Backlog-Eintraege eines Releases als erledigt schliessen. */
	async eintraegeSchliessen(releaseId: number): Promise<number> {
		const [, r] = await this.db.batch([
			// Protokoll (8.5) vor dem UPDATE, dieselbe Bedingung; idx_plan_release.
			this.events.insertSelect(
				"SELECT 'nutzer', r.game_id, pe.release_id, g.title || ' (' || r.platform || ')', 'liste_eintrag_erledigt', pe.kind, NULL, NULL, 'kopplung' " +
					"FROM plan_entry pe JOIN release r ON r.id = pe.release_id JOIN game g ON g.id = r.game_id " +
					"WHERE pe.release_id = ? AND pe.kind IN ('todo','backlog') AND pe.status = 'offen'",
				releaseId,
			),
			this.db
				.prepare(
					"UPDATE plan_entry SET status = 'erledigt', resolved_at = datetime('now') " +
						"WHERE release_id = ? AND kind IN ('todo','backlog') AND status = 'offen'",
				)
				.bind(releaseId),
		]);
		return r.meta.changes ?? 0;
	}
}
