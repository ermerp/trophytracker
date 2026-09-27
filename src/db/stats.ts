import { ERLAUBTE_PLATTFORMEN, type Plattform } from "../domain/titel";
import { PLAY_STATUS, type PlayStatus } from "../domain/play-status";

/**
 * Kennzahlen fuers Dashboard (Stufe 19a, Abschnitt 13).
 *
 * Rein lesend: Es entsteht keine Aenderung, deshalb auch kein `game_event`
 * (8.5). Alle Abfragen laufen in einem Batch und sind einzeln in
 * test/lesekosten.spec.ts gemessen - das Dashboard ist die erste Seite nach
 * jedem Start der App und darf nicht teuer sein (Zeilenlese-Grenze,
 * Abschnitt 2).
 *
 * Zwei Dinge, die hier bewusst NICHT passieren:
 *
 * - Die Plattform kommt aus `release.platform`, nie aus
 *   `trophy_progress.platform`. Sonys Rohwert ist mehrwertig: 33 der 431
 *   Listen tragen "PSVITA,PS4" oder "PS3,PSVITA,PS4", zwei sogar
 *   "PS5,PSPC". Eine Gruppierung darueber erfaende Plattformen, die es nicht
 *   gibt - und ein "PSPC" verstiesse gegen "nur PS3, PS4, PS5 und Vita" (7.6).
 * - Kein `UNION ALL` ueber die Zaehler. D1 erlaubt hoechstens fuenf Terme in
 *   einem zusammengesetzten SELECT (gemessen am 24.09.2026 gegen Produktion
 *   und lokale D1: sechs antworten mit "too many terms in compound SELECT").
 *   Gezaehlt wird deshalb per SUM(bedingung) und GROUP BY, wie in
 *   IgdbRepository.zaehlung() und ReviewRepository.zaehlungNachGrund().
 */

/**
 * Ein Release, das nur einen Wunsch traegt, gehoert nicht zur Sammlung
 * (Abschnitt 3). Wortgleich mit `GamesRepository.NUR_WUNSCH`, nur ohne den
 * dortigen LEFT JOIN auf trophy_progress - das Dashboard zaehlt sonst eine
 * andere Sammlung als die Sammlungsansicht. `test/stats-repo.spec.ts` haelt
 * fest, dass beide dieselbe Menge ergeben.
 */
export const NUR_WUNSCH =
	"(NOT EXISTS (SELECT 1 FROM trophy_progress t0 WHERE t0.release_id = r.id) " +
	"AND NOT EXISTS (SELECT 1 FROM physical_copy p0 WHERE p0.release_id = r.id) " +
	"AND NOT EXISTS (SELECT 1 FROM digital_entitlement d0 WHERE d0.release_id = r.id) " +
	"AND EXISTS (SELECT 1 FROM plan_entry pe0 WHERE pe0.release_id = r.id " +
	"AND pe0.kind = 'wunsch' AND pe0.status = 'offen'))";

/**
 * Je Plattform. Jede Unterabfrage ist ein Index-Lookup ueber einen
 * Fremdschluessel (Migration 0008), kein Tabellenscan - und keine benutzt ein
 * OR ueber zwei Spalten, das SQLite auf idx_plan_offen ausweichen liesse
 * (gemessen in Stufe 15).
 */
export const PLATTFORM_SQL =
	"SELECT r.platform AS platform, COUNT(*) AS releases, COUNT(DISTINCT r.game_id) AS spiele, " +
	"SUM(EXISTS (SELECT 1 FROM trophy_progress t1 WHERE t1.release_id = r.id)) AS mit_liste, " +
	"SUM(EXISTS (SELECT 1 FROM trophy_progress t2 WHERE t2.release_id = r.id " +
	"AND t2.defined_platinum > 0)) AS platin_moeglich, " +
	"SUM(EXISTS (SELECT 1 FROM trophy_progress t3 WHERE t3.release_id = r.id " +
	"AND t3.defined_platinum > 0 AND t3.earned_platinum > 0)) AS platin, " +
	"SUM(EXISTS (SELECT 1 FROM physical_copy p1 WHERE p1.release_id = r.id)) AS disc, " +
	"SUM(EXISTS (SELECT 1 FROM digital_entitlement d1 WHERE d1.release_id = r.id)) AS digital " +
	`FROM release r WHERE NOT ${NUR_WUNSCH} GROUP BY r.platform`;

/** Ein Release ohne Zeile in play_status zaehlt als 'nicht_gespielt' (Abschnitt 12). */
export const STATUS_SQL =
	"SELECT COALESCE(ps.status, 'nicht_gespielt') AS status, COUNT(*) AS n " +
	"FROM release r LEFT JOIN play_status ps ON ps.release_id = r.id " +
	`WHERE NOT ${NUR_WUNSCH} GROUP BY 1`;

/**
 * Trophaeen je Stufe - ueber ALLE Listen, ohne JOIN.
 *
 * Bewusst ohne Verknuepfung auf release: Eine noch nicht zugeordnete Liste
 * traegt trotzdem erspielte Trophaeen, und die Summe soll der Zahl bei PSN
 * entsprechen (Entscheidung des Nutzers vom 24.09.2026). `ohne_zuordnung`
 * sagt, wie viele das sind.
 *
 * Platin ist dreiwertig (Abschnitt 13): `platin_moeglich` zaehlt die Listen
 * MIT Platin-Trophaee, nicht alle - 93 der 431 haben gar keine.
 */
export const TROPHAEEN_SQL =
	"SELECT COUNT(*) AS listen, SUM(release_id IS NULL) AS ohne_zuordnung, " +
	"SUM(defined_bronze) AS definiert_bronze, SUM(earned_bronze) AS erspielt_bronze, " +
	"SUM(defined_silver) AS definiert_silber, SUM(earned_silver) AS erspielt_silber, " +
	"SUM(defined_gold) AS definiert_gold, SUM(earned_gold) AS erspielt_gold, " +
	"SUM(defined_platinum) AS definiert_platin, SUM(earned_platinum) AS erspielt_platin, " +
	"SUM(defined_platinum > 0) AS platin_moeglich, " +
	"SUM(defined_platinum > 0 AND earned_platinum > 0) AS platin_erspielt " +
	"FROM trophy_progress";

/** Offene Eintraege auf To-Do und Backlog, ueber idx_plan_offen. */
export const LISTEN_SQL =
	"SELECT kind, COUNT(*) AS n FROM plan_entry " +
	"WHERE kind IN ('backlog','todo') AND status = 'offen' GROUP BY kind";

/**
 * Spiele, die mindestens ein Release in der Sammlung haben.
 *
 * Ueber `release` statt ueber `game`: Die Bedingung braucht ohnehin eine
 * Release-Zeile, und so faellt der zweite Tabellenscan weg (gemessen 1 293
 * gelesene Zeilen weniger). Ein Spiel ohne jedes Release zaehlt damit nicht
 * mit - das ist richtig, es hat nichts in der Sammlung.
 */
export const SPIELE_SQL = `SELECT COUNT(DISTINCT r.game_id) AS n FROM release r WHERE NOT ${NUR_WUNSCH}`;

/**
 * Das zuletzt GESPIELTE Spiel mit Platin - nicht das zuletzt erspielte.
 *
 * Wann ein Platin erspielt wurde, weiss die Datenbank nicht: Von 164 Spielen
 * mit Platin hat keines ein `finished_at` (gemessen 27.09.2026), und der
 * Zeitpunkt je Trophaee kommt erst mit Stufe 19b (7.7). Die Ueberschrift in
 * der Oberflaeche sagt das auch so; mit 19b tauscht hier nur die Abfrage.
 *
 * 431 Zeilen ohne Index auf last_played_at sind ein Scan - bei dieser
 * Groessenordnung billiger als ein weiterer Index.
 */
export const LETZTES_PLATIN_SQL =
	"SELECT g.id AS game_id, g.title, g.cover_url, r.platform, " +
	"t.progress_pct, t.last_played_at, " +
	"t.earned_bronze, t.earned_silver, t.earned_gold, t.earned_platinum " +
	"FROM trophy_progress t JOIN release r ON r.id = t.release_id JOIN game g ON g.id = r.game_id " +
	"WHERE t.earned_platinum > 0 AND t.last_played_at IS NOT NULL " +
	"ORDER BY t.last_played_at DESC LIMIT 1";

export type PlattformZeile = {
	platform: string;
	releases: number;
	spiele: number;
	mit_liste: number;
	platin_moeglich: number;
	platin: number;
	disc: number;
	digital: number;
};

export type TrophaeenZeile = {
	listen: number;
	ohne_zuordnung: number;
	definiert_bronze: number | null;
	erspielt_bronze: number | null;
	definiert_silber: number | null;
	erspielt_silber: number | null;
	definiert_gold: number | null;
	erspielt_gold: number | null;
	definiert_platin: number | null;
	erspielt_platin: number | null;
	platin_moeglich: number | null;
	platin_erspielt: number | null;
};

export type LetztesPlatinZeile = {
	game_id: number;
	title: string;
	cover_url: string | null;
	platform: string;
	progress_pct: number;
	last_played_at: string | null;
	earned_bronze: number;
	earned_silver: number;
	earned_gold: number;
	earned_platinum: number;
};

export type Kennzahlen = {
	spiele: number;
	releases: number;
	plattformen: Record<Plattform, PlattformZeile>;
	status: Record<PlayStatus, number>;
	trophaeen: TrophaeenZeile;
	listen: { backlog: number; todo: number };
	letztesPlatin: LetztesPlatinZeile | null;
};

/** Eine leere Zeile, damit eine Plattform ohne Release als 0 erscheint statt zu fehlen. */
function leerePlattform(platform: string): PlattformZeile {
	return {
		platform,
		releases: 0,
		spiele: 0,
		mit_liste: 0,
		platin_moeglich: 0,
		platin: 0,
		disc: 0,
		digital: 0,
	};
}

export class StatsRepository {
	constructor(private readonly db: D1Database) {}

	/**
	 * Alle Kennzahlen in einem Batch.
	 *
	 * Die Ergebnisse kippen in vorbelegte Records - fehlende Plattformen und
	 * Status erscheinen dann als 0 statt zu fehlen (dasselbe Muster wie
	 * ReviewRepository.zaehlungNachGrund).
	 */
	async kennzahlen(): Promise<Kennzahlen> {
		const [plattformen, status, trophaeen, listen, spiele, letztes] = await this.db.batch([
			this.db.prepare(PLATTFORM_SQL),
			this.db.prepare(STATUS_SQL),
			this.db.prepare(TROPHAEEN_SQL),
			this.db.prepare(LISTEN_SQL),
			this.db.prepare(SPIELE_SQL),
			this.db.prepare(LETZTES_PLATIN_SQL),
		]);

		const jePlattform = Object.fromEntries(
			ERLAUBTE_PLATTFORMEN.map((p) => [p, leerePlattform(p)]),
		) as Record<Plattform, PlattformZeile>;
		for (const zeile of plattformen.results as PlattformZeile[]) {
			// Eine unbekannte Plattform kann es wegen des CHECK auf release
			// nicht geben; faellt sie doch an, bleibt sie draussen statt eine
			// fuenfte Spalte aufzumachen (7.6).
			if (zeile.platform in jePlattform) jePlattform[zeile.platform as Plattform] = zeile;
		}

		const jeStatus = Object.fromEntries(PLAY_STATUS.map((s) => [s, 0])) as Record<PlayStatus, number>;
		for (const zeile of status.results as { status: string; n: number }[]) {
			if (zeile.status in jeStatus) jeStatus[zeile.status as PlayStatus] = zeile.n;
		}

		const jeListe = { backlog: 0, todo: 0 };
		for (const zeile of listen.results as { kind: string; n: number }[]) {
			if (zeile.kind === "backlog" || zeile.kind === "todo") jeListe[zeile.kind] = zeile.n;
		}

		return {
			spiele: (spiele.results[0] as { n: number } | undefined)?.n ?? 0,
			releases: Object.values(jePlattform).reduce((summe, z) => summe + z.releases, 0),
			plattformen: jePlattform,
			status: jeStatus,
			trophaeen: trophaeen.results[0] as TrophaeenZeile,
			listen: jeListe,
			letztesPlatin: (letztes.results[0] as LetztesPlatinZeile | undefined) ?? null,
		};
	}
}
