import type { SpielzeitPlattform } from "../domain/psn-besitz";
import { zeilen } from "./baustein";
import type { EventRepository } from "./events";

/** Berechtigungen je INSERT: zwei Binds je Zeile, D1 erlaubt 100 je Statement. */
const BERECHTIGUNGEN_JE_STUECK = 45;

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
		// Die ganze Seite in EINEM Batch (Stufe 18k; bis dahin ein Batch je
		// zwoelf Titel, 17 D1-Aufrufe je Seite). Je Anweisung zwoelf Zeilen
		// als `VALUES (…), (…)`: D1 erlaubt 100 gebundene Werte je Statement,
		// und hier sind es acht je Titel.
		//
		// Scheitert eine Anweisung, scheitert der Batch ganz - die Seite ist
		// dann nicht geschrieben, der Schritt meldet "fehler", und der
		// Spielzeit-Stand versucht dieselbe Seite im naechsten Aufruf erneut
		// (`spielzeitLauf`). Halb geschrieben bleibt nichts.
		const stuecke: GespielterTitel[][] = [];
		for (let i = 0; i < titel.length; i += 12) stuecke.push(titel.slice(i, i + 12));
		const ergebnisse = await this.db.batch(
			stuecke.map((s) =>
				this.db
					.prepare(
						"INSERT INTO psn_played_title " +
							"(title_id, name, platform, play_duration_s, play_count, first_played_at, last_played_at, release_id, synced_at) " +
							`VALUES ${s.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))").join(", ")} ` +
							"ON CONFLICT(title_id) DO UPDATE SET " +
							"name = excluded.name, platform = excluded.platform, play_duration_s = excluded.play_duration_s, " +
							"play_count = excluded.play_count, first_played_at = excluded.first_played_at, " +
							"last_played_at = excluded.last_played_at, synced_at = excluded.synced_at, " +
							"release_id = COALESCE(psn_played_title.release_id, excluded.release_id)",
					)
					.bind(
						...s.flatMap((t) => [
							t.titleId,
							t.name,
							t.platform,
							t.spielzeitSekunden,
							t.spielzahl,
							t.erstesSpielAm,
							t.letztesSpielAm,
							t.releaseId,
						]),
					),
			),
		);
		// Die Summe ist hier richtig: Im Batch steht keine Protokollzeile,
		// nur die eigentliche Aenderung (8.5).
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
	 * Die von PSN erkannten Berechtigungen einer Seite anlegen - in EINEM
	 * Batch (Stufe 18k-b). Bis dahin ein Batch je Eintrag; zusammen mit den
	 * Lookups waren das bis zu 150 Abfragen je Aufruf gegen die
	 * dokumentierten 50 (10.1).
	 *
	 * `ON CONFLICT DO NOTHING` ueber UNIQUE(release_id, source): Eine Zeile,
	 * die der Nutzer selbst angelegt hat, bleibt unveraendert - auch ihre
	 * Herkunft. Rueckgabe: die Releases, an denen eine Zeile ENTSTANDEN ist,
	 * aus `RETURNING` des INSERT allein - nie aus dem Protokoll.
	 *
	 * Je Quelle und Stueck zwei Anweisungen, in dieser Reihenfolge: das
	 * Protokoll mit derselben Bedingung wie der INSERT (NOT EXISTS), davor,
	 * damit es nur Neues sieht (8.5) - dann der INSERT. Scheitert eine
	 * Anweisung, scheitert der Batch ganz: Keine Berechtigung und kein
	 * Ereignis der Seite stehen da, der Schritt meldet "fehler", und der
	 * naechste Lauf holt dieselbe Seite neu (`besitzLauf` rueckt den Start
	 * dann nicht vor). Stillstehen kann dabei nur die Kaufliste.
	 */
	async berechtigungenErkennen(neu: {
		kauf: readonly number[];
		plus: readonly number[];
	}): Promise<{ kauf: number[]; plus: number[] }> {
		const anweisungen: D1PreparedStatement[] = [];
		const inserts: Array<{ quelle: "kauf" | "plus"; index: number }> = [];
		for (const quelle of ["kauf", "plus"] as const) {
			const ids = [...new Set(neu[quelle])];
			// Zwei Binds je Zeile im INSERT, also hoechstens 45 Zeilen - D1
			// erlaubt 100 gebundene Werte je Statement. Eine Seite hat 50.
			for (let i = 0; i < ids.length; i += BERECHTIGUNGEN_JE_STUECK) {
				const stueck = ids.slice(i, i + BERECHTIGUNGEN_JE_STUECK);
				const platzhalter = stueck.map(() => "?").join(", ");
				anweisungen.push(
					// Protokoll mit Quelle 'sync' und Anlass 'psn'.
					this.events.insertSelect(
						"SELECT 'sync', r.game_id, r.id, g.title || ' (' || r.platform || ')', 'berechtigung_angelegt', 'source', NULL, ?, 'psn' " +
							`FROM release r JOIN game g ON g.id = r.game_id WHERE r.id IN (${platzhalter}) ` +
							"AND NOT EXISTS (SELECT 1 FROM digital_entitlement d WHERE d.release_id = r.id AND d.source = ?)",
						quelle,
						...stueck,
						quelle,
					),
				);
				inserts.push({ quelle, index: anweisungen.length });
				anweisungen.push(
					this.db
						.prepare(
							"INSERT INTO digital_entitlement (release_id, source, herkunft) VALUES " +
								stueck.map(() => "(?, ?, 'psn')").join(", ") +
								" ON CONFLICT(release_id, source) DO NOTHING RETURNING release_id",
						)
						.bind(...stueck.flatMap((id) => [id, quelle])),
				);
			}
		}
		const raus = { kauf: [] as number[], plus: [] as number[] };
		if (anweisungen.length === 0) return raus;
		const ergebnisse = await this.db.batch(anweisungen);
		for (const { quelle, index } of inserts) {
			for (const z of zeilen<{ release_id: number }>(ergebnisse[index])) raus[quelle].push(z.release_id);
		}
		return raus;
	}

	/**
	 * Welche dieser Releases gibt es ausschliesslich digital?
	 *
	 * Nur dann erledigt ein von PSN erkannter Kauf einen offenen Wunsch
	 * (Entscheidung des Nutzers vom 22.09.2026): Steht dort `ja` oder
	 * `unbekannt`, koennte der Wunsch der Disc gelten, und der Eintrag bleibt
	 * offen. Anders als beim Erfassen von Hand weiss hier niemand, was
	 * gemeint war - deshalb die Zurueckhaltung. Eine Anweisung fuer alle neu
	 * erkannten Kaeufe einer Seite (Stufe 18k-b); hoechstens 50 Binds.
	 */
	async nurDigitalUnter(releaseIds: readonly number[]): Promise<Set<number>> {
		if (releaseIds.length === 0) return new Set();
		const { results } = await this.db
			.prepare(
				`SELECT id FROM release WHERE id IN (${releaseIds.map(() => "?").join(", ")}) AND physical_release_status = 'nein'`,
			)
			.bind(...releaseIds)
			.all<{ id: number }>();
		return new Set(results.map((z) => z.id));
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
