import type { TrophyTitel } from "../domain/normalize";
import type { Baustein } from "./baustein";
import { EREIGNIS_SPALTEN, type EventRepository } from "./events";

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
/** 15 gebundene Werte je Titel, hoechstens 100 je Anweisung (Stufe 18p). */
const TITEL_JE_UPSERT = 6;

export class TrophiesRepository {
	constructor(
		private readonly db: D1Database,
		private readonly events: EventRepository,
	) {}

	/**
	 * Schreibt eine Seite normalisierter Titel.
	 *
	 * Als Batch, damit eine Seite entweder ganz oder gar nicht ankommt - ein
	 * halb geschriebener Stand waere beim naechsten Lauf nicht erkennbar.
	 */
	async upsertSeite(titel: TrophyTitel[]): Promise<number> {
		if (titel.length === 0) return 0;
		await this.db.batch(this.upsertSeiteBaustein(titel).anweisungen);
		return titel.length;
	}

	/**
	 * Dieselbe Seite als Baustein (Stufe 18p) - die Normalisierung haengt das
	 * Markieren der Rohantwort und das Zaehlen in denselben Batch.
	 *
	 * **Mehrzeilig, sechs Titel je Anweisung**: D1 erlaubt 100 gebundene Werte,
	 * ein Titel braucht 15. Bis 18p war es eine Anweisung je Titel, mit dem
	 * Protokoll 104 je Seite - D1 dokumentiert 50 Abfragen je Aufruf auf dem
	 * Free Tier, und jede Anweisung eines Batches zaehlt (CLAUDE.md). Jetzt
	 * sind es fuer 100 Titel 17 plus vier fuer das Protokoll.
	 */
	upsertSeiteBaustein(titel: TrophyTitel[]): Baustein<number> {
		if (titel.length === 0) return { anweisungen: [], lesen: () => 0 };
		const zeile = "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))";
		const upserts: D1PreparedStatement[] = [];
		for (let i = 0; i < titel.length; i += TITEL_JE_UPSERT) {
			const teil = titel.slice(i, i + TITEL_JE_UPSERT);
			upserts.push(
				this.db
					.prepare(
						`INSERT INTO trophy_progress (
							np_communication_id, np_service_name, title_name, platform, icon_url,
							defined_bronze, defined_silver, defined_gold, defined_platinum,
							earned_bronze, earned_silver, earned_gold, earned_platinum,
							progress_pct, last_played_at, synced_at
						) VALUES ${teil.map(() => zeile).join(", ")}
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
					)
					.bind(
						...teil.flatMap((t) => [
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
						]),
					),
			);
		}
		return {
			// Protokoll (8.5): Listen, die es noch nicht gibt, VOR dem Upsert
			// - danach waeren sie nicht mehr von bekannten zu unterscheiden.
			// Ohne Spiel und Release, das Label ist der Sony-Titel; die
			// Zuordnung kommt als eigenes Ereignis.
			anweisungen: [...this.listeNeuStatements(titel), ...upserts],
			lesen: () => titel.length,
		};
	}

	/**
	 * Hoechstens 33 Titel je Statement: D1 erlaubt 100 gebundene Werte je
	 * Abfrage, und jeder Titel braucht drei.
	 */
	private listeNeuStatements(titel: TrophyTitel[]): D1PreparedStatement[] {
		const statements: D1PreparedStatement[] = [];
		for (let i = 0; i < titel.length; i += 33) {
			const teil = titel.slice(i, i + 33);
			const werte = teil.map(() => "(?, ?, ?)").join(", ");
			statements.push(
				this.db
					.prepare(
						`WITH v(np, titel, plattform) AS (VALUES ${werte}) ` +
							`INSERT INTO game_event (${EREIGNIS_SPALTEN}) ` +
							"SELECT 'sync', NULL, NULL, v.titel || ' (' || v.plattform || ')', 'liste_neu', 'platform', NULL, v.plattform, v.np " +
							"FROM v WHERE NOT EXISTS (SELECT 1 FROM trophy_progress t WHERE t.np_communication_id = v.np)",
					)
					.bind(...teil.flatMap((t) => [t.np_communication_id, t.title_name, t.platform])),
			);
		}
		return statements;
	}

	/**
	 * Welche dieser Releases tragen bereits eine Trophaeenliste? In Stuecken zu
	 * 100 (D1: hoechstens 100 gebundene Werte), ein D1-Aufruf (Stufe 18p).
	 */
	async belegteReleases(ids: readonly number[]): Promise<Set<number>> {
		const einmal = [...new Set(ids)];
		const raus = new Set<number>();
		if (einmal.length === 0) return raus;
		const stuecke: number[][] = [];
		for (let i = 0; i < einmal.length; i += 100) stuecke.push(einmal.slice(i, i + 100));
		const ergebnisse = await this.db.batch<{ release_id: number }>(
			stuecke.map((s) =>
				this.db
					.prepare(`SELECT DISTINCT release_id FROM trophy_progress WHERE release_id IN (${s.map(() => "?").join(", ")})`)
					.bind(...s),
			),
		);
		for (const e of ergebnisse) for (const z of e.results ?? []) raus.add(z.release_id);
		return raus;
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
}
