import type { SpielzeitPlattform } from "../domain/psn-besitz";
import type { EventRepository } from "./events";

/**
 * Spielzeit und digitaler Besitz aus PSN (Abschnitt 7.7, Stufe 18c).
 *
 * `psn_played_title` ist gebaut wie `trophy_progress`: Sonys Rohwerte stehen
 * fuer sich, `release_id` ist die Zuordnung und bleibt korrigierbar. Ein
 * Titel ohne Treffer in der Sammlung bleibt liegen - importiert wird nichts
 * (Entscheidung des Nutzers vom 21.09.2026).
 *
 * Bei den Berechtigungen trennt `herkunft` das Erkannte vom Erfassten: Was
 * der Nutzer selbst eingetragen hat, fasst hier nichts an.
 */

export type GespielterTitel = {
	titleId: string;
	name: string;
	platform: SpielzeitPlattform;
	spielzeitSekunden: number | null;
	spielzahl: number | null;
	erstesSpielAm: string | null;
	letztesSpielAm: string | null;
	releaseId: number | null;
};

export class BesitzRepository {
	constructor(
		private readonly db: D1Database,
		private readonly events: EventRepository,
	) {}

	/**
	 * Eine Seite gespielter Titel schreiben.
	 *
	 * Die Zuordnung wird nur gesetzt, wenn sie neu ist - ein von Hand
	 * korrigiertes `release_id` bleibt stehen (dieselbe Regel wie bei
	 * `trophy_progress.release_id`, Abschnitt 4.1). Kein Ereignis: Spielzeit
	 * ist Fremddatum, das sich staendig aendert, und jede Aenderung zu
	 * protokollieren hiesse das Protokoll zu fluten (8.5).
	 */
	async spielzeitSchreiben(titel: readonly GespielterTitel[]): Promise<number> {
		if (titel.length === 0) return 0;
		// D1 erlaubt 100 gebundene Werte je Statement: 8 Werte je Titel,
		// also hoechstens zwoelf je Anweisung.
		const anweisung = this.db.prepare(
			"INSERT INTO psn_played_title " +
				"(title_id, name, platform, play_duration_s, play_count, first_played_at, last_played_at, release_id, synced_at) " +
				"VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) " +
				"ON CONFLICT(title_id) DO UPDATE SET " +
				"name = excluded.name, platform = excluded.platform, play_duration_s = excluded.play_duration_s, " +
				"play_count = excluded.play_count, first_played_at = excluded.first_played_at, " +
				"last_played_at = excluded.last_played_at, synced_at = excluded.synced_at, " +
				"release_id = COALESCE(psn_played_title.release_id, excluded.release_id)",
		);
		const ergebnisse = await this.db.batch(
			titel.map((t) =>
				anweisung.bind(
					t.titleId,
					t.name,
					t.platform,
					t.spielzeitSekunden,
					t.spielzahl,
					t.erstesSpielAm,
					t.letztesSpielAm,
					t.releaseId,
				),
			),
		);
		return ergebnisse.reduce((summe, r) => summe + (r.meta.changes ?? 0), 0);
	}

	/** Spielzeiten eines Spiels, fuer das Spieldetail. */
	async spielzeitenVonSpiel(gameId: number): Promise<Array<{ release_id: number; play_duration_s: number | null; play_count: number | null; first_played_at: string | null; last_played_at: string | null }>> {
		const { results } = await this.db
			.prepare(
				"SELECT p.release_id, p.play_duration_s, p.play_count, p.first_played_at, p.last_played_at " +
					"FROM psn_played_title p JOIN release r ON r.id = p.release_id WHERE r.game_id = ? AND p.release_id IS NOT NULL",
			)
			.bind(gameId)
			.all<{ release_id: number; play_duration_s: number | null; play_count: number | null; first_played_at: string | null; last_played_at: string | null }>();
		return results;
	}

	/**
	 * Eine von PSN erkannte Berechtigung anlegen.
	 *
	 * `ON CONFLICT DO NOTHING` ueber UNIQUE(release_id, source): Eine Zeile,
	 * die der Nutzer selbst angelegt hat, bleibt unveraendert - auch ihre
	 * Herkunft. Rueckgabe: true, wenn eine Zeile entstanden ist.
	 */
	async berechtigungErkennen(releaseId: number, quelle: "kauf" | "plus"): Promise<boolean> {
		const [, eingefuegt] = await this.db.batch([
			// Protokoll mit Quelle 'sync' und Anlass 'psn' - dieselbe Bedingung
			// wie der INSERT, davor im Batch (8.5).
			this.events.insertSelect(
				"SELECT 'sync', r.game_id, r.id, g.title || ' (' || r.platform || ')', 'berechtigung_angelegt', 'source', NULL, ?, 'psn' " +
					"FROM release r JOIN game g ON g.id = r.game_id WHERE r.id = ? " +
					"AND NOT EXISTS (SELECT 1 FROM digital_entitlement d WHERE d.release_id = r.id AND d.source = ?)",
				quelle,
				releaseId,
				quelle,
			),
			this.db
				.prepare(
					"INSERT INTO digital_entitlement (release_id, source, herkunft) VALUES (?, ?, 'psn') " +
						"ON CONFLICT(release_id, source) DO NOTHING RETURNING id",
				)
				.bind(releaseId, quelle),
		]);
		return (eingefuegt.results?.length ?? 0) > 0;
	}

	/**
	 * Gibt es das Spiel ausschliesslich digital?
	 *
	 * Nur dann erledigt ein von PSN erkannter Kauf einen offenen Wunsch
	 * (Entscheidung des Nutzers vom 22.09.2026): Steht dort `ja` oder
	 * `unbekannt`, koennte der Wunsch der Disc gelten, und der Eintrag bleibt
	 * offen. Anders als beim Erfassen von Hand weiss hier niemand, was
	 * gemeint war - deshalb die Zurueckhaltung.
	 */
	async nurDigital(releaseId: number): Promise<boolean> {
		const z = await this.db
			.prepare("SELECT 1 AS x FROM release WHERE id = ? AND physical_release_status = 'nein'")
			.bind(releaseId)
			.first();
		return z !== null;
	}

	/** Liegt am Release schon ein Kauf? Dann schlaegt er PS+ (7.7). */
	async hatKauf(releaseId: number): Promise<boolean> {
		const z = await this.db
			.prepare("SELECT 1 AS x FROM digital_entitlement WHERE release_id = ? AND source = 'kauf'")
			.bind(releaseId)
			.first();
		return z !== null;
	}

	/**
	 * Die PS+-Momentaufnahme abgleichen: Was PSN nicht mehr nennt, faellt
	 * weg (7.7).
	 *
	 * Nur eigene Zeilen (`herkunft = 'psn'`) und nur `plus` - ein Kauf
	 * verfaellt nicht, und Handeingetragenes bleibt unberuehrt. Der Aufrufer
	 * ruft das ausschliesslich nach einem VOLLSTAENDIGEN Durchlauf; ein
	 * Teil-Ergebnis darf nie zu einem Loeschen fuehren.
	 */
	async plusAufraeumen(gesehen: readonly number[]): Promise<number> {
		// Die Liste der gesehenen Releases kann lang sein; D1 erlaubt 100
		// gebundene Werte. Deshalb als Text, nicht als Bind - es sind eigene
		// ganze Zahlen aus der Datenbank, kein Fremdtext.
		const ids = gesehen.filter((n) => Number.isInteger(n)).join(",");
		const bedingung = ids === "" ? "" : ` AND release_id NOT IN (${ids})`;
		const [, geloescht] = await this.db.batch([
			this.events.insertSelect(
				"SELECT 'sync', r.game_id, r.id, g.title || ' (' || r.platform || ')', 'berechtigung_geloescht', 'source', 'plus', NULL, 'psn' " +
					"FROM digital_entitlement d JOIN release r ON r.id = d.release_id JOIN game g ON g.id = r.game_id " +
					`WHERE d.source = 'plus' AND d.herkunft = 'psn'${bedingung.replace("release_id", "d.release_id")}`,
			),
			this.db.prepare(`DELETE FROM digital_entitlement WHERE source = 'plus' AND herkunft = 'psn'${bedingung}`),
		]);
		return geloescht.meta.changes ?? 0;
	}
}
