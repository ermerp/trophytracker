/**
 * Export und Backup (Abschnitt 14).
 *
 * Zwei Aufgaben in einem Repository, weil sie dieselbe Frage beantworten:
 * "Was steht in der Datenbank, und wann wurde es zuletzt gesichert?"
 */

import { EXPORT_ORDNUNG, EXPORT_TABELLEN } from "./export-tabellen";

export { EXPORT_ORDNUNG, EXPORT_TABELLEN, NICHT_EXPORTIERT, type Exporttabelle } from "./export-tabellen";

export type Vollexport = {
	exportiertAm: string;
	schemaVersion: string | null;
	tabellen: Record<string, Record<string, unknown>[]>;
};

export const PLAN_ARTEN = ["wunsch", "todo", "backlog", "kauf"] as const;
export type PlanArt = (typeof PLAN_ARTEN)[number];

export type SammlungZeile = {
	title: string;
	platform: string;
	physical_release_status: "ja" | "nein" | "unbekannt";
	exemplare: number;
	digital: string | null;
	progress_pct: number | null;
	defined_platinum: number | null;
	earned_platinum: number | null;
	status: string | null;
	rating: number | null;
	last_played_at: string | null;
};

export type TrophaeenZeile = {
	title_name: string;
	platform: string;
	title: string | null;
	progress_pct: number;
	earned_bronze: number;
	defined_bronze: number;
	earned_silver: number;
	defined_silver: number;
	earned_gold: number;
	defined_gold: number;
	earned_platinum: number;
	defined_platinum: number;
	last_played_at: string | null;
	release_id: number | null;
};

export type PlanZeile = {
	titel: string | null;
	platform: string | null;
	is_favorite: number;
	position: number | null;
	note: string | null;
	origin: string | null;
	status: string;
	created_at: string;
};

export type LueckeZeile = {
	title: string;
	platform: string;
	progress_pct: number;
	hat_platin: number;
	eigener_status: string | null;
	bester_gebrauchtpreis_cents: number | null;
	verworfen: number;
};

export type Sicherungsstand = {
	letzterErfolgAm: string | null;
	letzterCommit: string | null;
};

/** Wann die Sicherung zuletzt lief - auch die Betriebswarnungen lesen das (18m). */
export const SCHLUESSEL_ERFOLG = "backup_letzter_erfolg_am";
const SCHLUESSEL_COMMIT = "backup_letzter_commit";

export class ExportRepository {
	constructor(private readonly db: D1Database) {}

	/**
	 * Alle Fachtabellen am Stueck.
	 *
	 * `SELECT *` ist hier richtig und der einzige Ort, an dem das gilt: Ein
	 * Export soll *alle* Spalten mitnehmen, auch die, die nach der naechsten
	 * Migration dazukommen. Die Regel "Views listen ihre Spalten explizit auf"
	 * zielt auf das Gegenteil - eine View, deren Ergebnismenge still waechst.
	 *
	 * Ein Batch statt 14 Aufrufe: Der Export laeuft einmal die Woche, liest
	 * jede Tabelle genau einmal und darf das 10-ms-Budget nicht mit
	 * Nacheinander-Warten belasten.
	 */
	async alleTabellen(): Promise<Vollexport> {
		const ergebnisse = await this.db.batch(
			EXPORT_TABELLEN.map((t) => this.db.prepare(`SELECT * FROM ${t} ORDER BY ${EXPORT_ORDNUNG[t] ?? "rowid"}`)),
		);

		const tabellen: Record<string, Record<string, unknown>[]> = {};
		EXPORT_TABELLEN.forEach((t, i) => {
			tabellen[t] = (ergebnisse[i]?.results ?? []) as Record<string, unknown>[];
		});

		return {
			exportiertAm: new Date().toISOString(),
			schemaVersion: await this.schemaVersion(),
			tabellen,
		};
	}

	/**
	 * Hoechste angewendete Migration, damit sich ein alter Export einer
	 * Schemafassung zuordnen laesst. Die Tabelle gehoert Wrangler; fehlt sie
	 * (frische Datenbank ohne Migrationslauf), ist null die ehrliche Antwort.
	 */
	private async schemaVersion(): Promise<string | null> {
		try {
			const r = await this.db
				.prepare("SELECT MAX(name) AS name FROM d1_migrations")
				.first<{ name: string | null }>();
			return r?.name ?? null;
		} catch {
			return null;
		}
	}

	/** Eine Zeile je Release - so, wie die Sammlungsansicht sie zeigt. */
	async listeSammlung(): Promise<SammlungZeile[]> {
		const { results } = await this.db
			.prepare(
				`SELECT g.title, r.platform, r.physical_release_status,
				        (SELECT COUNT(*) FROM physical_copy p WHERE p.release_id = r.id) AS exemplare,
				        (SELECT GROUP_CONCAT(d.source) FROM digital_entitlement d WHERE d.release_id = r.id) AS digital,
				        t.progress_pct, t.defined_platinum, t.earned_platinum, t.last_played_at,
				        ps.status, ps.rating
				 FROM release r
				 JOIN game g ON g.id = r.game_id
				 LEFT JOIN trophy_progress t ON t.release_id = r.id
				 LEFT JOIN play_status ps ON ps.release_id = r.id
				 ORDER BY g.sort_title, r.platform`,
			)
			.all<SammlungZeile>();
		return results;
	}

	/** Die Rohliste von Sony, mit der Zuordnung daneben. */
	async listeTrophaeen(): Promise<TrophaeenZeile[]> {
		const { results } = await this.db
			.prepare(
				`SELECT t.title_name, t.platform, g.title, t.progress_pct,
				        t.earned_bronze, t.defined_bronze, t.earned_silver, t.defined_silver,
				        t.earned_gold, t.defined_gold, t.earned_platinum, t.defined_platinum,
				        t.last_played_at, t.release_id
				 FROM trophy_progress t
				 LEFT JOIN release r ON r.id = t.release_id
				 LEFT JOIN game g ON g.id = r.game_id
				 ORDER BY t.title_name`,
			)
			.all<TrophaeenZeile>();
		return results;
	}

	/**
	 * Wunschliste, To-Do, Backlog oder Kaufliste.
	 *
	 * Ohne Statusfilter: Der Export traegt die Spalte "Status" und soll auch
	 * erledigte und verworfene Eintraege zeigen - die Historie ist der Grund,
	 * aus dem alle vier Listen in einer Tabelle stehen (Abschnitt 5).
	 */
	async listePlan(kind: PlanArt): Promise<PlanZeile[]> {
		const { results } = await this.db
			.prepare(
				`SELECT COALESCE(g.title, pe.title_raw) AS titel, r.platform,
				        pe.is_favorite, pe.position, pe.note, pe.origin,
				        pe.status, pe.created_at
				 FROM plan_entry pe
				 LEFT JOIN release r ON r.id = pe.release_id
				 LEFT JOIN game g ON g.id = COALESCE(pe.game_id, r.game_id)
				 WHERE pe.kind = ?
				 ORDER BY pe.position IS NULL, pe.position, pe.id`,
			)
			.bind(kind)
			.all<PlanZeile>();
		return results;
	}

	/**
	 * Luecken aus v_luecken - nur belegte Disc-Fassungen: Ein `unbekannt`
	 * ist keine Luecke, die sich behaupten liesse (Migration 0017).
	 * `verworfen` kommt seit Stufe 14 aus der View.
	 */
	async listeLuecken(): Promise<LueckeZeile[]> {
		const { results } = await this.db
			.prepare(
				`SELECT l.title, l.platform, l.progress_pct, l.hat_platin, l.eigener_status,
				        l.bester_gebrauchtpreis_cents, l.verworfen
				 FROM v_luecken l
				 WHERE l.disc_fassung = 'ja'
				 ORDER BY l.title, l.platform`,
			)
			.all<LueckeZeile>();
		return results;
	}

	/** Stand der letzten Sicherung. Beides fehlt, solange nie gesichert wurde. */
	async letzteSicherung(): Promise<Sicherungsstand> {
		const { results } = await this.db
			.prepare("SELECT key, value FROM app_setting WHERE key IN (?, ?)")
			.bind(SCHLUESSEL_ERFOLG, SCHLUESSEL_COMMIT)
			.all<{ key: string; value: string }>();

		const werte = new Map(results.map((z) => [z.key, z.value]));
		return {
			letzterErfolgAm: werte.get(SCHLUESSEL_ERFOLG) ?? null,
			letzterCommit: werte.get(SCHLUESSEL_COMMIT) ?? null,
		};
	}

	/**
	 * Erfolgreichen Lauf vermerken.
	 *
	 * "Geprueft, nichts Neues" ist ein Erfolg: Ein unveraenderter Dump heisst,
	 * dass der Lauf durchlief - nicht, dass er ausfiel. Deshalb setzt die
	 * Action den Zeitpunkt auch dann, wenn kein Commit entstand; `commit`
	 * bleibt dann der Hash des letzten tatsaechlichen Commits.
	 */
	async sicherungVermerken(zeitpunkt: string, commit: string | null): Promise<void> {
		const anweisung = this.db.prepare(
			"INSERT INTO app_setting (key, value) VALUES (?, ?) " +
				"ON CONFLICT(key) DO UPDATE SET value = excluded.value",
		);
		const schreibe = [anweisung.bind(SCHLUESSEL_ERFOLG, zeitpunkt)];
		if (commit !== null) schreibe.push(anweisung.bind(SCHLUESSEL_COMMIT, commit));
		await this.db.batch(schreibe);
	}
}
