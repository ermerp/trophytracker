import type { IgdbKandidat, IgdbMetadaten } from "../domain/igdb";

export type UngeprueftesSpiel = {
	id: number;
	title: string;
	sort_title: string;
	/** Kommagetrennt aus release.platform, oder null ohne Release. */
	plattformen: string | null;
};

export type OffenesSpiel = UngeprueftesSpiel & {
	igdb_checked_at: string;
	icon_url: string | null;
};

export type KandidatZeile = {
	game_id: number;
	igdb_id: number;
	name: string;
	slug: string | null;
	cover_url: string | null;
	release_date: string | null;
	platforms: string | null;
	game_type: string | null;
	critic_score: number | null;
	critic_score_count: number | null;
	position: number;
};

export type IgdbZaehlung = {
	gesamt: number;
	verknuepft: number;
	zurPruefung: number;
	ungeprueft: number;
	abgelehnt: number;
	letzteAktualisierung: string | null;
};

export type Verknuepfungsquelle = "automatisch" | "manuell";

export type OhneZuordnungZeile = {
	quelle: "spiel" | "plan_wunsch" | "plan_todo" | "plan_backlog" | "plan_kauf";
	ref_id: number;
	title: string;
	zustand: "nicht_gesucht" | "zur_pruefung" | "abgelehnt" | "freitext";
};

/**
 * Buchfuehrung des IGDB-Abgleichs auf `game` und die Kandidaten in
 * `igdb_candidate` (Abschnitt 7.6).
 *
 * Die Zustaende eines Spiels sind aus den Zeitstempeln abgeleitet, es gibt
 * keine Statusspalte (Migration 0010). Kritikerwertungen werden nur
 * ueberschrieben, wenn sie von IGDB stammen oder noch fehlen -
 * critic_source ist genau dafuer da (Abschnitt 7.5).
 */
export class IgdbRepository {
	constructor(private readonly db: D1Database) {}

	private static readonly UNGEPRUEFT =
		"igdb_id IS NULL AND igdb_checked_at IS NULL AND igdb_declined_at IS NULL";
	private static readonly ZUR_PRUEFUNG =
		"igdb_id IS NULL AND igdb_checked_at IS NOT NULL AND igdb_declined_at IS NULL";

	/** Die naechsten Spiele, bei denen noch nie gesucht wurde. */
	async naechsteUngeprueft(n: number): Promise<UngeprueftesSpiel[]> {
		const { results } = await this.db
			.prepare(
				"SELECT g.id, g.title, g.sort_title, " +
					"(SELECT GROUP_CONCAT(r.platform) FROM release r WHERE r.game_id = g.id) AS plattformen " +
					`FROM game g WHERE ${IgdbRepository.UNGEPRUEFT} ORDER BY g.id LIMIT ?`,
			)
			.bind(n)
			.all<UngeprueftesSpiel>();
		return results;
	}

	/** Spiel und Plattformen fuer die manuelle Verknuepfung im Spieldetail. */
	async spiel(id: number): Promise<UngeprueftesSpiel | null> {
		return this.db
			.prepare(
				"SELECT g.id, g.title, g.sort_title, " +
					"(SELECT GROUP_CONCAT(r.platform) FROM release r WHERE r.game_id = g.id) AS plattformen " +
					"FROM game g WHERE g.id = ?",
			)
			.bind(id)
			.first<UngeprueftesSpiel>();
	}

	/**
	 * Verknuepft ein Spiel mit einem IGDB-Eintrag und uebernimmt die
	 * Metadaten. Loescht die Kandidaten und hebt eine Ablehnung auf - die
	 * Verknuepfung ist die neuere Entscheidung.
	 */
	async verknuepfen(
		gameId: number,
		m: IgdbMetadaten,
		quelle: Verknuepfungsquelle,
	): Promise<boolean> {
		const [update] = await this.db.batch([
			this.db
				.prepare(
					"UPDATE game SET igdb_id = ?, igdb_slug = ?, cover_url = ?, release_date = ?, release_status = ?, " +
						IgdbRepository.KRITIK_SETZEN +
						"igdb_matched_at = datetime('now'), igdb_matched_source = ?, " +
						"igdb_checked_at = datetime('now'), igdb_synced_at = datetime('now'), igdb_declined_at = NULL " +
						"WHERE id = ?",
				)
				.bind(
					m.igdbId,
					m.igdbSlug,
					m.coverUrl,
					m.releaseDate,
					m.releaseStatus,
					m.criticScore,
					m.criticScoreCount,
					quelle,
					gameId,
				),
			this.db.prepare("DELETE FROM igdb_candidate WHERE game_id = ?").bind(gameId),
		]);
		return (update.meta.changes ?? 0) > 0;
	}

	/**
	 * Kritikerwertung nur schreiben, wenn sie fehlt oder von IGDB stammt.
	 * Zwei Bindings: score, count.
	 */
	private static readonly KRITIK_SETZEN =
		"critic_score = CASE WHEN critic_source IS NULL OR critic_source = 'igdb' THEN ? ELSE critic_score END, " +
		"critic_score_count = CASE WHEN critic_source IS NULL OR critic_source = 'igdb' THEN ? ELSE critic_score_count END, " +
		"critic_source = CASE WHEN critic_source IS NULL OR critic_source = 'igdb' THEN 'igdb' ELSE critic_source END, " +
		"critic_updated_at = CASE WHEN critic_source IS NULL OR critic_source = 'igdb' THEN datetime('now') ELSE critic_updated_at END, ";

	/** Metadaten eines verknuepften Spiels erneut uebernehmen. */
	async auffrischen(gameId: number, m: IgdbMetadaten): Promise<boolean> {
		const ergebnis = await this.db
			.prepare(
				"UPDATE game SET igdb_slug = ?, cover_url = ?, release_date = ?, release_status = ?, " +
					IgdbRepository.KRITIK_SETZEN +
					"igdb_synced_at = datetime('now') WHERE id = ? AND igdb_id = ?",
			)
			.bind(
				m.igdbSlug,
				m.coverUrl,
				m.releaseDate,
				m.releaseStatus,
				m.criticScore,
				m.criticScoreCount,
				gameId,
				m.igdbId,
			)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	/** Verknuepfte Spiele, die am laengsten nicht aufgefrischt wurden. */
	async zumAuffrischen(n: number): Promise<Array<{ id: number; igdb_id: number }>> {
		const { results } = await this.db
			.prepare(
				"SELECT id, igdb_id FROM game WHERE igdb_id IS NOT NULL " +
					"ORDER BY igdb_synced_at IS NOT NULL, igdb_synced_at, id LIMIT ?",
			)
			.bind(n)
			.all<{ id: number; igdb_id: number }>();
		return results;
	}

	/**
	 * Kandidaten einer Suche ohne eindeutigen Treffer ablegen und die Suche
	 * als erledigt stempeln. Auch eine leere Liste ist ein Ergebnis: Das
	 * Spiel wandert dann ohne Vorschlaege in die Pruefansicht.
	 */
	async kandidatenSetzen(gameId: number, kandidaten: readonly IgdbKandidat[]): Promise<void> {
		const einfuegen = this.db.prepare(
			"INSERT OR IGNORE INTO igdb_candidate (game_id, igdb_id, name, slug, cover_url, release_date, " +
				"platforms, game_type, critic_score, critic_score_count, position, fetched_at) " +
				"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
		);
		await this.db.batch([
			this.db.prepare("DELETE FROM igdb_candidate WHERE game_id = ?").bind(gameId),
			...kandidaten.map((k, i) =>
				einfuegen.bind(
					gameId,
					k.igdbId,
					k.name,
					k.slug,
					k.coverUrl,
					k.releaseDate,
					k.plattformen.length > 0 ? k.plattformen.join(",") : null,
					k.typ,
					k.criticScore,
					k.criticScoreCount,
					i,
				),
			),
			this.db
				.prepare("UPDATE game SET igdb_checked_at = datetime('now') WHERE id = ?")
				.bind(gameId),
		]);
	}

	/** Entscheidung des Nutzers: Diesen Titel gibt es bei IGDB nicht. */
	async ablehnen(gameId: number): Promise<boolean> {
		const [update] = await this.db.batch([
			this.db
				.prepare(
					"UPDATE game SET igdb_declined_at = datetime('now'), " +
						"igdb_checked_at = COALESCE(igdb_checked_at, datetime('now')) " +
						"WHERE id = ? AND igdb_id IS NULL",
				)
				.bind(gameId),
			this.db.prepare("DELETE FROM igdb_candidate WHERE game_id = ?").bind(gameId),
		]);
		return (update.meta.changes ?? 0) > 0;
	}

	/**
	 * Suche freigeben: Ablehnung und Suchstempel zuruecknehmen, damit der
	 * naechste Abgleich das Spiel wieder aufnimmt. Nur ohne Verknuepfung.
	 */
	async erneutSuchen(gameId: number): Promise<boolean> {
		const ergebnis = await this.db
			.prepare(
				"UPDATE game SET igdb_declined_at = NULL, igdb_checked_at = NULL " +
					"WHERE id = ? AND igdb_id IS NULL",
			)
			.bind(gameId)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	/** Alle Spiele zur Pruefung zurueck in die Suche (nach einer neuen Suchregel). */
	async offeneZuruecksetzen(): Promise<number> {
		const [update] = await this.db.batch([
			this.db.prepare(
				`UPDATE game SET igdb_checked_at = NULL WHERE ${IgdbRepository.ZUR_PRUEFUNG}`,
			),
			this.db.prepare(
				"DELETE FROM igdb_candidate WHERE game_id IN (SELECT id FROM game WHERE igdb_id IS NULL AND igdb_checked_at IS NULL)",
			),
		]);
		return update.meta.changes ?? 0;
	}

	/**
	 * Verknuepfung loesen. Nimmt alles zurueck, was von IGDB kam - Cover,
	 * Datum, Wertung (nur bei Quelle 'igdb') - und gibt das Spiel wieder in
	 * die Suche. Korrigierbarkeit nach CLAUDE.md.
	 */
	async verknuepfungLoesen(gameId: number): Promise<boolean> {
		const ergebnis = await this.db
			.prepare(
				"UPDATE game SET igdb_id = NULL, igdb_slug = NULL, igdb_matched_at = NULL, igdb_matched_source = NULL, " +
					"igdb_synced_at = NULL, igdb_checked_at = NULL, igdb_declined_at = NULL, " +
					"cover_url = NULL, release_date = NULL, release_status = 'unbekannt', " +
					"critic_score = CASE WHEN critic_source = 'igdb' THEN NULL ELSE critic_score END, " +
					"critic_score_count = CASE WHEN critic_source = 'igdb' THEN NULL ELSE critic_score_count END, " +
					"critic_updated_at = CASE WHEN critic_source = 'igdb' THEN NULL ELSE critic_updated_at END, " +
					"critic_source = CASE WHEN critic_source = 'igdb' THEN NULL ELSE critic_source END " +
					"WHERE id = ? AND igdb_id IS NOT NULL",
			)
			.bind(gameId)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	/** Spiele zur Pruefung mit ihren Kandidaten, seitenweise. */
	async offen(
		limit: number,
		offset: number,
	): Promise<{ spiele: OffenesSpiel[]; kandidaten: KandidatZeile[]; gesamt: number }> {
		const [zaehlung, seite] = await this.db.batch([
			this.db.prepare(`SELECT COUNT(*) AS n FROM game WHERE ${IgdbRepository.ZUR_PRUEFUNG}`),
			this.db
				.prepare(
					"SELECT g.id, g.title, g.sort_title, g.igdb_checked_at, " +
						"(SELECT GROUP_CONCAT(r.platform) FROM release r WHERE r.game_id = g.id) AS plattformen, " +
						"(SELECT t.icon_url FROM trophy_progress t JOIN release r2 ON r2.id = t.release_id " +
						"  WHERE r2.game_id = g.id AND t.icon_url IS NOT NULL ORDER BY r2.platform DESC LIMIT 1) AS icon_url " +
						`FROM game g WHERE ${IgdbRepository.ZUR_PRUEFUNG} ORDER BY g.sort_title LIMIT ? OFFSET ?`,
				)
				.bind(limit, offset),
		]);
		const spiele = seite.results as OffenesSpiel[];
		const gesamt = (zaehlung.results[0] as { n: number } | undefined)?.n ?? 0;
		if (spiele.length === 0) return { spiele, kandidaten: [], gesamt };

		const ids = spiele.map((s) => s.id);
		const { results: kandidaten } = await this.db
			.prepare(
				"SELECT game_id, igdb_id, name, slug, cover_url, release_date, platforms, game_type, " +
					"critic_score, critic_score_count, position FROM igdb_candidate " +
					`WHERE game_id IN (${ids.map(() => "?").join(",")}) ORDER BY game_id, position`,
			)
			.bind(...ids)
			.all<KandidatZeile>();
		return { spiele, kandidaten, gesamt };
	}

	/**
	 * Alles ohne IGDB-Zuordnung, listenuebergreifend (v_ohne_igdb, 8.3).
	 * Abgelehnte Spiele nur auf Wunsch - die Ablehnung ist eine gespeicherte
	 * Entscheidung und steht standardmaessig nicht im Weg.
	 */
	async ohneZuordnung(mitAbgelehnten: boolean): Promise<OhneZuordnungZeile[]> {
		const { results } = await this.db
			.prepare(
				"SELECT quelle, ref_id, title, zustand FROM v_ohne_igdb " +
					(mitAbgelehnten ? "" : "WHERE zustand <> 'abgelehnt' ") +
					"ORDER BY quelle, title",
			)
			.all<OhneZuordnungZeile>();
		return results;
	}

	async zaehlung(): Promise<IgdbZaehlung> {
		const z = await this.db
			.prepare(
				"SELECT COUNT(*) AS gesamt, " +
					"SUM(igdb_id IS NOT NULL) AS verknuepft, " +
					`SUM(${IgdbRepository.ZUR_PRUEFUNG}) AS zurPruefung, ` +
					`SUM(${IgdbRepository.UNGEPRUEFT}) AS ungeprueft, ` +
					"SUM(igdb_id IS NULL AND igdb_declined_at IS NOT NULL) AS abgelehnt, " +
					"MAX(igdb_synced_at) AS letzteAktualisierung FROM game",
			)
			.first<IgdbZaehlung>();
		return {
			gesamt: z?.gesamt ?? 0,
			verknuepft: z?.verknuepft ?? 0,
			zurPruefung: z?.zurPruefung ?? 0,
			ungeprueft: z?.ungeprueft ?? 0,
			abgelehnt: z?.abgelehnt ?? 0,
			letzteAktualisierung: z?.letzteAktualisierung ?? null,
		};
	}
}
