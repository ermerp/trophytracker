import type { TrophyEintrag } from "../domain/gruppen";
import { titelSchluessel, type Plattform } from "../domain/titel";

export type ZuOrdnenderRelease = {
	npCommunicationId: string;
	plattform: Plattform;
};

export type GruppeErgebnis = {
	gameId: number;
	releaseIds: number[];
	/** Listen, die schon zugeordnet waren und deshalb uebersprungen wurden. */
	uebersprungen: string[];
};

export type SpielZeile = {
	id: number;
	title: string;
	sort_title: string;
	cover_url: string | null;
	releases: number;
};

/**
 * Spiele und Releases.
 *
 * Der Kern ist gruppeAnlegen: Aus einer bestaetigten Gruppe entsteht ein
 * `game` mit je einem `release` pro Trophaeenliste - so beschreibt es
 * Abschnitt 3 am Beispiel GTA V.
 */
export class GamesRepository {
	constructor(private readonly db: D1Database) {}

	/** Alle noch nicht zugeordneten Trophaeenlisten, als Rohdaten fuer die Gruppierung. */
	async unzugeordnet(): Promise<TrophyEintrag[]> {
		const { results } = await this.db
			.prepare(
				"SELECT np_communication_id, title_name, platform, progress_pct, " +
					"defined_platinum, earned_platinum, icon_url " +
					"FROM trophy_progress WHERE release_id IS NULL",
			)
			.all<TrophyEintrag>();
		return results;
	}

	async anzahlUnzugeordnet(): Promise<number> {
		const z = await this.db
			.prepare("SELECT COUNT(*) AS n FROM trophy_progress WHERE release_id IS NULL")
			.first<{ n: number }>();
		return z?.n ?? 0;
	}

	/**
	 * Legt ein Spiel mit seinen Releases an und verknuepft die Trophaeenlisten.
	 *
	 * Alles in einem Batch: Eine halb angelegte Gruppe waere beim naechsten
	 * Aufruf nicht als solche erkennbar.
	 *
	 * Die Verknuepfung setzt release_id nur, wenn es NULL ist. Die Regel aus
	 * CLAUDE.md gilt auch hier: Eine einmal getroffene Zuordnung ueberschreibt
	 * kein Prozess - auch dieser nicht.
	 */
	async gruppeAnlegen(
		titel: string,
		releases: ZuOrdnenderRelease[],
	): Promise<GruppeErgebnis> {
		if (releases.length === 0) throw new Error("Eine Gruppe braucht mindestens ein Release.");

		const spiel = await this.db
			.prepare(
				"INSERT INTO game (title, sort_title) VALUES (?, ?) RETURNING id",
			)
			.bind(titel, titelSchluessel(titel))
			.first<{ id: number }>();
		if (!spiel) throw new Error("Spiel konnte nicht angelegt werden.");

		const releaseIds: number[] = [];
		const uebersprungen: string[] = [];

		for (const r of releases) {
			const angelegt = await this.db
				.prepare("INSERT INTO release (game_id, platform) VALUES (?, ?) RETURNING id")
				.bind(spiel.id, r.plattform)
				.first<{ id: number }>();
			if (!angelegt) throw new Error("Release konnte nicht angelegt werden.");
			releaseIds.push(angelegt.id);

			const ergebnis = await this.db
				.prepare(
					"UPDATE trophy_progress SET release_id = ?, matched_at = datetime('now'), " +
						"matched_source = 'manuell' " +
						"WHERE np_communication_id = ? AND release_id IS NULL",
				)
				.bind(angelegt.id, r.npCommunicationId)
				.run();

			if ((ergebnis.meta.changes ?? 0) === 0) uebersprungen.push(r.npCommunicationId);
		}

		return { gameId: spiel.id, releaseIds, uebersprungen };
	}

	/** Eine einzelne Liste einem bestehenden Release zuordnen. */
	async listeZuordnen(
		npCommunicationId: string,
		releaseId: number,
		quelle: "automatisch" | "manuell",
	): Promise<boolean> {
		const ergebnis = await this.db
			.prepare(
				"UPDATE trophy_progress SET release_id = ?, matched_at = datetime('now'), " +
					"matched_source = ? WHERE np_communication_id = ? AND release_id IS NULL",
			)
			.bind(releaseId, quelle, npCommunicationId)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	/**
	 * Kandidaten fuer die automatische Zuordnung.
	 *
	 * Liefert je Titelschluessel und Plattform die Releases. Der Aufrufer
	 * ordnet nur zu, wenn es genau einen Treffer gibt (Abschnitt 7.2).
	 */
	async releasesNachSchluessel(
		schluessel: string,
	): Promise<Array<{ id: number; platform: string }>> {
		const { results } = await this.db
			.prepare(
				"SELECT r.id, r.platform FROM release r JOIN game g ON g.id = r.game_id " +
					"WHERE g.sort_title = ?",
			)
			.bind(schluessel)
			.all<{ id: number; platform: string }>();
		return results;
	}

	async spieleListe(limit: number, offset: number): Promise<{ zeilen: SpielZeile[]; gesamt: number }> {
		const gesamt = await this.db.prepare("SELECT COUNT(*) AS n FROM game").first<{ n: number }>();
		const { results } = await this.db
			.prepare(
				"SELECT g.id, g.title, g.sort_title, g.cover_url, " +
					"(SELECT COUNT(*) FROM release r WHERE r.game_id = g.id) AS releases " +
					"FROM game g ORDER BY g.sort_title LIMIT ? OFFSET ?",
			)
			.bind(limit, offset)
			.all<SpielZeile>();
		return { zeilen: results, gesamt: gesamt?.n ?? 0 };
	}

	async spielDetail(id: number) {
		const spiel = await this.db.prepare("SELECT * FROM game WHERE id = ?").bind(id).first();
		if (!spiel) return null;

		const { results: releases } = await this.db
			.prepare(
				"SELECT r.id, r.platform, r.edition, r.region, r.physical_release_status, " +
					"t.np_communication_id, t.title_name, t.platform AS trophy_platform, " +
					"t.progress_pct, t.defined_platinum, t.earned_platinum " +
					"FROM release r LEFT JOIN trophy_progress t ON t.release_id = r.id " +
					"WHERE r.game_id = ? ORDER BY r.platform",
			)
			.bind(id)
			.all();

		return { spiel, releases };
	}
}
