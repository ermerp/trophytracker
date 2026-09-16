import type { TrophyTitel } from "../domain/normalize";

export type TrophySortierung = "zuletzt" | "fortschritt" | "titel";

export type TrophyZeile = TrophyTitel & {
	release_id: number | null;
	synced_at: string;
};

export type TrophyListe = {
	zeilen: TrophyZeile[];
	gesamt: number;
};

/**
 * Zugriff auf trophy_progress.
 *
 * Die Tabelle haelt Fremddaten von Sony und wird bei jedem Sync ueberschrieben.
 * Drei Feldgruppen gehoeren aber NICHT dazu und duerfen von keinem
 * automatischen Prozess angefasst werden (CLAUDE.md, Abschnitt 4):
 *
 *   release_id                    - die Zuordnung, die der Nutzer trifft
 *   reviewed_earned_total         - Referenzstand der letzten Durchsicht
 *   reviewed_defined_total
 *   reviewed_progress_pct
 *   reviewed_at
 *
 * Sie fehlen deshalb bewusst im ON-CONFLICT-Zweig unten. Wer dort ein Feld
 * ergaenzt, hebelt die Trennung von Fremddaten und eigener Bewertung aus.
 */
export class TrophiesRepository {
	constructor(private readonly db: D1Database) {}

	/**
	 * Schreibt eine Seite normalisierter Titel.
	 *
	 * Als Batch, damit eine Seite entweder ganz oder gar nicht ankommt - ein
	 * halb geschriebener Stand waere beim naechsten Lauf nicht erkennbar.
	 */
	async upsertSeite(titel: TrophyTitel[]): Promise<number> {
		if (titel.length === 0) return 0;

		const anweisung = this.db.prepare(
			`INSERT INTO trophy_progress (
				np_communication_id, np_service_name, title_name, platform, icon_url,
				defined_bronze, defined_silver, defined_gold, defined_platinum,
				earned_bronze, earned_silver, earned_gold, earned_platinum,
				progress_pct, last_played_at, synced_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
			ON CONFLICT(np_communication_id) DO UPDATE SET
				np_service_name  = excluded.np_service_name,
				title_name       = excluded.title_name,
				platform         = excluded.platform,
				icon_url         = excluded.icon_url,
				defined_bronze   = excluded.defined_bronze,
				defined_silver   = excluded.defined_silver,
				defined_gold     = excluded.defined_gold,
				defined_platinum = excluded.defined_platinum,
				earned_bronze    = excluded.earned_bronze,
				earned_silver    = excluded.earned_silver,
				earned_gold      = excluded.earned_gold,
				earned_platinum  = excluded.earned_platinum,
				progress_pct     = excluded.progress_pct,
				last_played_at   = excluded.last_played_at,
				synced_at        = excluded.synced_at`,
			// release_id und reviewed_* stehen absichtlich nicht in dieser Liste.
		);

		await this.db.batch(
			titel.map((t) =>
				anweisung.bind(
					t.np_communication_id,
					t.np_service_name,
					t.title_name,
					t.platform,
					t.icon_url,
					t.defined_bronze,
					t.defined_silver,
					t.defined_gold,
					t.defined_platinum,
					t.earned_bronze,
					t.earned_silver,
					t.earned_gold,
					t.earned_platinum,
					t.progress_pct,
					t.last_played_at,
				),
			),
		);
		return titel.length;
	}

	/** Traegt dieses Release bereits eine Trophaeenliste? */
	async releaseIstBelegt(releaseId: number): Promise<boolean> {
		const z = await this.db
			.prepare("SELECT 1 AS x FROM trophy_progress WHERE release_id = ? LIMIT 1")
			.bind(releaseId)
			.first<{ x: number }>();
		return z !== null;
	}

	async anzahl(): Promise<number> {
		const zeile = await this.db
			.prepare("SELECT COUNT(*) AS n FROM trophy_progress")
			.first<{ n: number }>();
		return zeile?.n ?? 0;
	}

	async liste(optionen: {
		limit: number;
		offset: number;
		sortierung: TrophySortierung;
		nurPlatin: boolean;
	}): Promise<TrophyListe> {
		// Feste Zuordnung statt Zeichenkette aus der Anfrage - kein Weg fuer
		// eingeschleustes SQL in die ORDER-BY-Klausel.
		const ordnung: Record<TrophySortierung, string> = {
			zuletzt: "last_played_at DESC NULLS LAST, title_name ASC",
			fortschritt: "progress_pct DESC, title_name ASC",
			titel: "title_name COLLATE NOCASE ASC",
		};

		const bedingung = optionen.nurPlatin
			? "WHERE defined_platinum > 0 AND earned_platinum > 0"
			: "";

		const gesamtZeile = await this.db
			.prepare(`SELECT COUNT(*) AS n FROM trophy_progress ${bedingung}`)
			.first<{ n: number }>();

		const { results } = await this.db
			.prepare(
				`SELECT np_communication_id, np_service_name, title_name, platform, icon_url,
				        defined_bronze, defined_silver, defined_gold, defined_platinum,
				        earned_bronze, earned_silver, earned_gold, earned_platinum,
				        progress_pct, last_played_at, synced_at, release_id
				 FROM trophy_progress ${bedingung}
				 ORDER BY ${ordnung[optionen.sortierung]}
				 LIMIT ? OFFSET ?`,
			)
			.bind(optionen.limit, optionen.offset)
			.all<TrophyZeile>();

		return { zeilen: results, gesamt: gesamtZeile?.n ?? 0 };
	}
}
