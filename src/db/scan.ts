import type { Plattform } from "../domain/titel";

/** Stufe 1 der Kette (9.2): der Code ist schon einem Release zugeordnet. */
export type MappingTreffer = {
	release_id: number;
	game_id: number;
	title: string;
	platform: Plattform;
	cover_url: string | null;
	/** Exemplare an diesem Release - "im Regal ×n" in der Oberflaeche. */
	exemplare: number;
};

/** Stufe 2 der Kette: ein Haendlerangebot kennt Titel und Plattform (ab Stufe 20 gefuellt). */
export type AngebotTreffer = {
	title_raw: string;
	platform_raw: string | null;
};

export type OffenerScan = {
	ean: string;
	scan_count: number;
	first_seen_at: string;
	last_seen_at: string;
	/** Titelvorschlag einer EAN-Quelle (Stufe 17b); null, solange keiner vorliegt. */
	title_raw: string | null;
	title_source: string | null;
	checked_at: string | null;
};

/**
 * Barcode-Erfassung (Abschnitt 9, Stufe 17): Zuordnungstabelle und offene
 * Scans. Die Disc selbst legt OwnershipRepository.addPhysicalCopy an -
 * mit dem Protokolleintrag; hier entsteht kein game_event, weil das Mapping
 * dieselbe Nutzerentscheidung ist wie das Exemplar und die offenen Scans
 * kein Spiel kennen.
 *
 * Beide Auflösungen sind Index-Lookups (ean ist Primaerschluessel,
 * idx_market_offer_ean); die Titelsuche der Stufe 3 laeuft ueber die
 * gemessene Abfrage von GET /api/games.
 */
export class ScanRepository {
	constructor(private readonly db: D1Database) {}

	async aufloesen(ean: string): Promise<{ mapping: MappingTreffer | null; angebot: AngebotTreffer | null }> {
		const [m, a] = await this.db.batch([
			this.db
				.prepare(
					"SELECT r.id AS release_id, r.game_id, g.title, r.platform, g.cover_url, " +
						"(SELECT COUNT(*) FROM physical_copy p WHERE p.release_id = r.id) AS exemplare " +
						"FROM ean_mapping e JOIN release r ON r.id = e.release_id JOIN game g ON g.id = r.game_id " +
						"WHERE e.ean = ?",
				)
				.bind(ean),
			this.db
				.prepare("SELECT title_raw, platform_raw FROM market_offer WHERE ean = ? ORDER BY id LIMIT 1")
				.bind(ean),
		]);
		return {
			mapping: (m.results[0] as MappingTreffer | undefined) ?? null,
			angebot: (a.results[0] as AngebotTreffer | undefined) ?? null,
		};
	}

	/** Unbekannten Code festhalten; beim zweiten Mal zaehlt er hoch. Liefert den Zaehler. */
	async vermerken(ean: string): Promise<number> {
		const z = await this.db
			.prepare(
				"INSERT INTO unresolved_scan (ean) VALUES (?) " +
					"ON CONFLICT(ean) DO UPDATE SET scan_count = scan_count + 1, last_seen_at = datetime('now') " +
					"RETURNING scan_count",
			)
			.bind(ean)
			.first<{ scan_count: number }>();
		return z?.scan_count ?? 1;
	}

	/** Zaehler eines offenen Scans, ohne ihn zu veraendern; 0, wenn es keinen gibt. */
	async zaehler(ean: string): Promise<number> {
		const z = await this.db.prepare("SELECT scan_count FROM unresolved_scan WHERE ean = ?").bind(ean).first<{ scan_count: number }>();
		return z?.scan_count ?? 0;
	}

	/**
	 * Code einem Release zuordnen. Ein vorhandenes Mapping wird ueberschrieben:
	 * Das ist die Korrektur einer Nutzerentscheidung durch den Nutzer, kein
	 * automatischer Prozess. Der offene Scan ist damit erledigt.
	 */
	async zuordnen(ean: string, releaseId: number, quelle: "manuell" | "feed" = "manuell"): Promise<void> {
		await this.db.batch([
			this.db
				.prepare(
					"INSERT INTO ean_mapping (ean, release_id, source) VALUES (?, ?, ?) " +
						"ON CONFLICT(ean) DO UPDATE SET release_id = excluded.release_id, source = excluded.source",
				)
				.bind(ean, releaseId, quelle),
			this.db.prepare("DELETE FROM unresolved_scan WHERE ean = ?").bind(ean),
		]);
	}

	/** Titel und Plattform eines Releases fuer die Antwort nach dem Zuordnen; null, wenn es fehlt. */
	async releaseKopf(releaseId: number): Promise<{ game_id: number; title: string; platform: Plattform } | null> {
		return this.db
			.prepare("SELECT r.game_id, g.title, r.platform FROM release r JOIN game g ON g.id = r.game_id WHERE r.id = ?")
			.bind(releaseId)
			.first<{ game_id: number; title: string; platform: Plattform }>();
	}

	/**
	 * Vorschlag verwerfen, Code behalten (9.3): Die Quelle hat zu einem
	 * richtigen Code einen falschen Datensatz - gemessen am 18.09.2026 kam
	 * fuer einen Sony-Code (711719…) Zahnpasta zurueck. `checked_at` bleibt:
	 * Dieselbe Quelle wuerde dasselbe antworten; eine zweite Quelle findet den
	 * Code ueber den fehlenden Titel.
	 */
	async vorschlagVerwerfen(ean: string): Promise<boolean> {
		const r = await this.db
			.prepare("UPDATE unresolved_scan SET title_raw = NULL, title_source = NULL WHERE ean = ? AND title_raw IS NOT NULL")
			.bind(ean)
			.run();
		return (r.meta.changes ?? 0) > 0;
	}

	async mappingLoeschen(ean: string): Promise<boolean> {
		const r = await this.db.prepare("DELETE FROM ean_mapping WHERE ean = ?").bind(ean).run();
		return (r.meta.changes ?? 0) > 0;
	}

	async offene(limit = 200): Promise<OffenerScan[]> {
		const { results } = await this.db
			.prepare(
				"SELECT ean, scan_count, first_seen_at, last_seen_at, title_raw, title_source, checked_at " +
					"FROM unresolved_scan ORDER BY last_seen_at DESC, ean LIMIT ?",
			)
			.bind(limit)
			.all<OffenerScan>();
		return results;
	}

	/**
	 * Codes, zu denen noch niemand gefragt hat - die Arbeitsliste des Jobs
	 * (Abschnitt 9.3). `checked_at` haelt auch einen erfolglosen Versuch fest,
	 * damit dieselben Codes nicht jeden Tag das Kontingent aufbrauchen.
	 */
	async ungeprueft(limit: number): Promise<string[]> {
		const { results } = await this.db
			.prepare("SELECT ean FROM unresolved_scan WHERE checked_at IS NULL ORDER BY last_seen_at DESC LIMIT ?")
			.bind(limit)
			.all<{ ean: string }>();
		return results.map((r) => r.ean);
	}

	/** Titelvorschlag einer Quelle festhalten; `titel` null heisst "Quelle kennt den Code nicht". */
	async vorschlagSetzen(ean: string, titel: string | null, quelle: string): Promise<boolean> {
		const r = await this.db
			.prepare(
				"UPDATE unresolved_scan SET title_raw = ?, title_source = ?, checked_at = datetime('now') WHERE ean = ?",
			)
			.bind(titel, titel === null ? null : quelle, ean)
			.run();
		return (r.meta.changes ?? 0) > 0;
	}

	async offenenLoeschen(ean: string): Promise<boolean> {
		const r = await this.db.prepare("DELETE FROM unresolved_scan WHERE ean = ?").bind(ean).run();
		return (r.meta.changes ?? 0) > 0;
	}
}
