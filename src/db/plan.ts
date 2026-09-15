export const PLAN_ARTEN = ["wunsch", "todo", "backlog", "kauf"] as const;
export type PlanArt = (typeof PLAN_ARTEN)[number];

export const PLAN_STATUS = ["offen", "erledigt", "verworfen"] as const;
export type PlanStatus = (typeof PLAN_STATUS)[number];

export const PLAN_HERKUNFT = ["luecke", "wunsch", "manuell", "import", "triage"] as const;
export type PlanHerkunft = (typeof PLAN_HERKUNFT)[number];

/** Genau eine der drei Quellen; die Route prueft das, die Datenbank erzwingt es per CHECK. */
export type PlanZiel =
	| { releaseId: number; gameId?: undefined; titleRaw?: undefined }
	| { gameId: number; releaseId?: undefined; titleRaw?: undefined }
	| { titleRaw: string; releaseId?: undefined; gameId?: undefined };

export type PlanFelder = {
	priority?: number;
	isFavorite?: boolean;
	note?: string | null;
	status?: PlanStatus;
	kind?: PlanArt;
};

/** Eine Zeile der Liste: der Eintrag mit dem, was Spiel und Release dazu wissen. */
export type PlanZeile = {
	id: number;
	kind: PlanArt;
	release_id: number | null;
	game_id: number | null;
	title_raw: string | null;
	position: number | null;
	priority: number;
	is_favorite: number;
	note: string | null;
	origin: PlanHerkunft | null;
	status: PlanStatus;
	created_at: string;
	resolved_at: string | null;
	/** COALESCE(g.title, title_raw) */
	titel: string;
	/** Spiel-Id, auch wenn der Eintrag ueber ein Release haengt. */
	spiel_id: number | null;
	platform: string | null;
	cover_url: string | null;
	critic_score: number | null;
	release_date: string | null;
	release_status: string | null;
};

const SPALTEN: Record<keyof PlanFelder, string> = {
	priority: "priority",
	isFavorite: "is_favorite",
	note: "note",
	status: "status",
	kind: "kind",
};

function wert(feld: keyof PlanFelder, felder: PlanFelder): unknown {
	if (feld === "isFavorite") return felder.isFavorite ? 1 : 0;
	return felder[feld] ?? null;
}

const AUSWAHL =
	"SELECT pe.id, pe.kind, pe.release_id, pe.game_id, pe.title_raw, pe.position, pe.priority, " +
	"pe.is_favorite, pe.note, pe.origin, pe.status, pe.created_at, pe.resolved_at, " +
	"COALESCE(g.title, pe.title_raw) AS titel, g.id AS spiel_id, r.platform, " +
	"g.cover_url, g.critic_score, g.release_date, g.release_status " +
	"FROM plan_entry pe " +
	"LEFT JOIN release r ON r.id = pe.release_id " +
	"LEFT JOIN game g ON g.id = COALESCE(pe.game_id, r.game_id) ";

/**
 * Absichten (Abschnitt 5): Wunschliste, To-Do, Backlog und Kaufliste in einer
 * Tabelle. Stufe 10 bedient die Wunschliste; die Methoden sind fuer alle vier
 * Arten geschrieben, damit die spaeteren Stufen denselben Weg nehmen.
 *
 * Der Rang wird nicht hier berechnet: Das Repository liefert die Bestandteile
 * (critic_score, priority, is_favorite), die Route rechnet mit den Gewichten
 * aus app_setting (src/domain/rang.ts). Nichts davon wird gespeichert.
 */
export class PlanRepository {
	constructor(private readonly db: D1Database) {}

	/**
	 * Alle Eintraege einer Art, ohne Blaetterung: Die Listen sind klein (die
	 * Wunschliste nach dem Import rund 350 Zeilen), und die Sortierung nach
	 * Rang passiert erst in der Route. Der Zugriff laeuft ueber idx_plan_offen.
	 */
	async liste(kind: PlanArt, status: PlanStatus | "alle"): Promise<PlanZeile[]> {
		const sql = AUSWAHL + "WHERE pe.kind = ?" + (status === "alle" ? "" : " AND pe.status = ?") + " ORDER BY pe.id";
		const abfrage = status === "alle" ? this.db.prepare(sql).bind(kind) : this.db.prepare(sql).bind(kind, status);
		const { results } = await abfrage.all<PlanZeile>();
		return results;
	}

	async eintrag(id: number): Promise<PlanZeile | null> {
		return this.db.prepare(AUSWAHL + "WHERE pe.id = ?").bind(id).first<PlanZeile>();
	}

	/**
	 * Offene Eintraege zu einem Spiel - am Spiel selbst oder an einem seiner
	 * Releases. Zwei Index-Lookups (idx_plan_game, idx_plan_release).
	 */
	async offeneFuerSpiel(gameId: number): Promise<PlanZeile[]> {
		const { results } = await this.db
			.prepare(
				AUSWAHL +
					"WHERE pe.status = 'offen' AND (pe.game_id = ? " +
					"OR pe.release_id IN (SELECT id FROM release WHERE game_id = ?)) ORDER BY pe.id",
			)
			.bind(gameId, gameId)
			.all<PlanZeile>();
		return results;
	}

	/**
	 * Duplikatpruefung nach der Regel aus Abschnitt 5: Ein offener Eintrag am
	 * Spiel und einer an einem seiner Releases sind zwei verschiedene
	 * Aussagen. Nur genau dasselbe Ziel derselben Art zaehlt als Duplikat.
	 * Freitext wird nicht geprueft - er hat kein Ziel, das sich vergleichen liesse.
	 */
	async offenerEintrag(kind: PlanArt, ziel: PlanZiel): Promise<number | null> {
		if (ziel.titleRaw !== undefined) return null;
		const spalte = ziel.releaseId !== undefined ? "release_id" : "game_id";
		const r = await this.db
			.prepare(`SELECT id FROM plan_entry WHERE kind = ? AND status = 'offen' AND ${spalte} = ?`)
			.bind(kind, ziel.releaseId ?? ziel.gameId)
			.first<{ id: number }>();
		return r?.id ?? null;
	}

	async anlegen(
		kind: PlanArt,
		ziel: PlanZiel,
		origin: PlanHerkunft,
		felder: Pick<PlanFelder, "priority" | "isFavorite" | "note"> = {},
	): Promise<number> {
		const r = await this.db
			.prepare(
				"INSERT INTO plan_entry (kind, release_id, game_id, title_raw, priority, is_favorite, note, origin) " +
					"VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
			)
			.bind(
				kind,
				ziel.releaseId ?? null,
				ziel.gameId ?? null,
				ziel.titleRaw ?? null,
				felder.priority ?? 3,
				felder.isFavorite ? 1 : 0,
				felder.note ?? null,
				origin,
			)
			.first<{ id: number }>();
		if (!r) throw new Error("Eintrag konnte nicht angelegt werden.");
		return r.id;
	}

	/**
	 * Nur die uebergebenen Felder aendern. Ein Statuswechsel setzt resolved_at:
	 * auf jetzt bei erledigt/verworfen, auf NULL zurueck bei offen - ein
	 * Sinneswandel ist ein Feld-Update, kein Neuanlegen (5.3).
	 */
	async aendern(id: number, felder: PlanFelder): Promise<boolean> {
		const keys = (Object.keys(felder) as Array<keyof PlanFelder>).filter((k) => felder[k] !== undefined);
		if (keys.length === 0) return (await this.eintrag(id)) !== null;

		const setzungen = keys.map((k) => `${SPALTEN[k]} = ?`);
		if (felder.status !== undefined) {
			setzungen.push(felder.status === "offen" ? "resolved_at = NULL" : "resolved_at = datetime('now')");
		}
		const ergebnis = await this.db
			.prepare(`UPDATE plan_entry SET ${setzungen.join(", ")} WHERE id = ?`)
			.bind(...keys.map((k) => wert(k, felder)), id)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	/**
	 * Freitext-Eintrag nachtraeglich einem Spiel zuordnen (8.3): game_id
	 * setzen, title_raw leeren. Nur fuer Eintraege ohne Spiel und Release.
	 */
	async spielZuordnen(id: number, gameId: number): Promise<boolean> {
		const ergebnis = await this.db
			.prepare("UPDATE plan_entry SET game_id = ?, title_raw = NULL WHERE id = ? AND game_id IS NULL AND release_id IS NULL")
			.bind(gameId, id)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	async loeschen(id: number): Promise<boolean> {
		const ergebnis = await this.db.prepare("DELETE FROM plan_entry WHERE id = ?").bind(id).run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}
}
