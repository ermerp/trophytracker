import type { AlarmKanal, AlarmLage, AlarmReihe, AlarmSchreiben, Punkt } from "../domain/preisalarm";

/**
 * Preisalarm (Stufe 20g): die Lage vor dem Schreiben, die Meldungen hinter
 * der Glocke und das Quittieren.
 *
 * Ob ein Preis meldet, entscheidet `src/domain/preisalarm.ts`. Hier steht nur,
 * was er dafuer liest und wie das Ergebnis in den Batch des Preisschritts
 * kommt: Markt und Store holen sich die Anweisungen von hier und haengen sie
 * in IHREN Schreib-Batch - die Nebenwirkung gehoert an den Schritt (CLAUDE.md).
 *
 * **Kein Ereignis:** Eine Meldung entsteht aus einem Preis, und je Preis gibt
 * es kein Ereignis (8.5). Das Quittieren aendert weder Bewertung noch Listen,
 * Besitz, Zuordnung oder Release. Die Grenze dagegen ist ein Feld des
 * Releases und wird in `GamesRepository.releaseAendern` protokolliert.
 */

/** Offene Absicht auf einem Release - die Bedingung, unter der ueberhaupt gemeldet wird. */
const OFFENE_ABSICHT =
	"EXISTS (SELECT 1 FROM plan_entry pe WHERE pe.release_id = r.id AND pe.kind IN ('wunsch','kauf') AND pe.status = 'offen')";

/** Eine Meldung, wie die Glocke sie zeigt. */
export type OffenerAlarm = {
	id: number;
	releaseId: number;
	gameId: number;
	titel: string;
	plattform: string;
	kanal: AlarmKanal;
	art: "tief" | "grenze";
	reihe: AlarmReihe;
	preisCents: number;
	vorherCents: number;
	aktualisiertAm: string;
};

const platzhalter = (n: number) => Array.from({ length: n }, () => "?").join(", ");

export class PreisalarmRepository {
	constructor(private readonly db: D1Database) {}

	/**
	 * Die Lage fuer die Releases einer Portion: drei Anweisungen, die der
	 * Aufrufer in SEINEN Lese-Batch legt, und wie ihr Ergebnis gelesen wird.
	 *
	 * Nur Releases mit offener Absicht kommen zurueck - ohne sie meldet
	 * nichts, und die Punkte der uebrigen werden gar nicht erst gelesen.
	 * Verworfene Angebote (20h) fallen aus den Punkten heraus, wie im
	 * Diagramm: Ihr Preis war nie einer.
	 *
	 * Gelesen werden nur die Punkte des Kanals, den der Schritt liefert - der
	 * Store-Schritt braucht die Gebrauchtreihen nicht, und umgekehrt
	 * (gemessen am 30.10.2026: 3 900 statt rund 1 300 Zeilen je Store-Portion
	 * im Bestand von einem Jahr). Ob ein Release ueberhaupt zu diesem Kanal
	 * gehoert, sagt die erste Abfrage (`hat_gebraucht`).
	 *
	 * Hoechstens so viele Ids wie eine Portion (10), weit unter 100 Binds.
	 */
	lageAnweisungen(
		ids: readonly number[],
		kanal: AlarmKanal,
	): {
		anweisungen: D1PreparedStatement[];
		lesen: (ergebnisse: D1Result[]) => Map<number, AlarmLage>;
	} {
		if (ids.length === 0) return { anweisungen: [], lesen: () => new Map() };
		const p = platzhalter(ids.length);
		const anweisungen = [
			this.db
				.prepare(
					"SELECT r.id AS release_id, r.physical_release_status AS disc, r.preis_grenze_cents, r.preis_grenze_am, " +
						"EXISTS (SELECT 1 FROM plan_entry k WHERE k.release_id = r.id AND k.kind = 'kauf' AND k.status = 'verworfen') AS kauf_verworfen, " +
						"EXISTS (SELECT 1 FROM price_snapshot s WHERE s.release_id = r.id AND s.channel = 'gebraucht' AND s.kanal IS NOT NULL) AS hat_gebraucht, " +
						"(SELECT MAX(a.erstellt_am) FROM preis_alarm a WHERE a.release_id = r.id AND a.art = 'grenze') AS letzte_grenze " +
						`FROM release r WHERE r.id IN (${p}) AND ${OFFENE_ABSICHT}`,
				)
				.bind(...ids),
			this.db
				.prepare(
					"SELECT id, release_id, kanal, preis_cents FROM preis_alarm " +
						`WHERE release_id IN (${p}) AND quittiert_am IS NULL AND entfallen_am IS NULL`,
				)
				.bind(...ids),
			this.db
				.prepare(
					"SELECT p.release_id, CASE WHEN p.channel = 'psn_store' THEN 'store' ELSE p.kanal END AS reihe, " +
						"p.price_cents, p.captured_at FROM price_snapshot p JOIN release r ON r.id = p.release_id " +
						`WHERE p.release_id IN (${p}) AND ${kanal === "gebraucht" ? "p.channel = 'gebraucht' AND p.kanal IS NOT NULL" : "p.channel = 'psn_store'"} ` +
						`AND ${OFFENE_ABSICHT} ` +
						"AND NOT EXISTS (SELECT 1 FROM market_offer_verworfen v WHERE v.release_id = p.release_id AND v.ebay_item_id = p.ebay_item_id)",
				)
				.bind(...ids),
		];
		return {
			anweisungen,
			lesen: ([releases, offen, punkte]) => {
				const lage = new Map<number, AlarmLage>();
				for (const z of (releases?.results ?? []) as Array<{
					release_id: number;
					disc: string;
					preis_grenze_cents: number | null;
					preis_grenze_am: string | null;
					kauf_verworfen: number;
					hat_gebraucht: number;
					letzte_grenze: string | null;
				}>) {
					lage.set(z.release_id, {
						releaseId: z.release_id,
						disc: z.disc,
						kaufVerworfen: z.kauf_verworfen === 1,
						hatGebrauchtreihe: z.hat_gebraucht === 1,
						grenzeCents: z.preis_grenze_cents,
						grenzeAm: z.preis_grenze_am,
						punkte: {},
						offen: {},
						letzteGrenzeAm: z.letzte_grenze,
					});
				}
				for (const z of (offen?.results ?? []) as Array<{ id: number; release_id: number; kanal: AlarmKanal; preis_cents: number }>) {
					const l = lage.get(z.release_id);
					if (l) l.offen[z.kanal] = { id: z.id, preisCents: z.preis_cents };
				}
				for (const z of (punkte?.results ?? []) as Array<{
					release_id: number;
					reihe: AlarmReihe;
					price_cents: number;
					captured_at: string;
				}>) {
					const l = lage.get(z.release_id);
					if (!l) continue;
					const liste: Punkt[] = (l.punkte[z.reihe] ??= []);
					liste.push({ preisCents: z.price_cents, am: z.captured_at });
				}
				return lage;
			},
		};
	}

	/**
	 * Die Anweisung zu einer Meldung, fuer den Schreib-Batch des Preisschritts.
	 *
	 * Eine tiefere Meldung aendert die offene (`ersetzt`); die Bedingung auf
	 * "noch offen" laesst sie ins Leere laufen, wenn der Nutzer zwischen Lesen
	 * und Schreiben quittiert hat. Eine neue Meldung kommt als `INSERT OR
	 * IGNORE`: Besteht schon eine offene zu Release und Kanal, haelt der
	 * eindeutige Teilindex sie fest, ohne den ganzen Batch - und damit die
	 * Preise der Portion - scheitern zu lassen.
	 */
	schreibAnweisung(a: AlarmSchreiben): D1PreparedStatement {
		if (a.ersetzt !== null) {
			return this.db
				.prepare(
					"UPDATE preis_alarm SET art = ?, reihe = ?, preis_cents = ?, vorher_cents = ?, ebay_item_id = ?, " +
						"aktualisiert_am = datetime('now') WHERE id = ? AND quittiert_am IS NULL AND entfallen_am IS NULL",
				)
				.bind(a.art, a.reihe, a.preisCents, a.vorherCents, a.ebayItemId, a.ersetzt);
		}
		return this.db
			.prepare(
				"INSERT OR IGNORE INTO preis_alarm (release_id, kanal, art, reihe, preis_cents, vorher_cents, ebay_item_id, " +
					"erstellt_am, aktualisiert_am) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
			)
			.bind(a.releaseId, a.kanal, a.art, a.reihe, a.preisCents, a.vorherCents, a.ebayItemId);
	}

	/**
	 * Ein Angebot wird verworfen (20h): Stammt die offene Meldung aus ihm,
	 * entfaellt sie. Der danach tiefste Punkt loest keine neue aus - er stand
	 * schon da, als der Nutzer verwarf. Fuer den Batch von `MarktRepository.verwerfen`.
	 */
	entfallenAnweisung(releaseId: number, itemId: string): D1PreparedStatement {
		return this.db
			.prepare(
				"UPDATE preis_alarm SET entfallen_am = datetime('now') " +
					"WHERE release_id = ? AND ebay_item_id = ? AND quittiert_am IS NULL AND entfallen_am IS NULL",
			)
			.bind(releaseId, itemId);
	}

	/**
	 * Die Ruecknahme des Verwerfens stellt die Meldung wieder her - "Rueckgaengig"
	 * stellt den Stand vor der Aktion vollstaendig her, auch das, was der
	 * Schreibpfad nebenbei entfernt hat (CLAUDE.md). Nur die juengste
	 * entfallene, und nur, wenn zu Release und Kanal inzwischen keine andere
	 * offen ist: Der eindeutige Teilindex liesse den Batch sonst scheitern.
	 */
	wiederherstellenAnweisung(releaseId: number, itemId: string): D1PreparedStatement {
		return this.db
			.prepare(
				"UPDATE preis_alarm SET entfallen_am = NULL WHERE id = (" +
					"SELECT a.id FROM preis_alarm a WHERE a.release_id = ? AND a.ebay_item_id = ? " +
					"AND a.entfallen_am IS NOT NULL AND a.quittiert_am IS NULL " +
					"AND NOT EXISTS (SELECT 1 FROM preis_alarm b WHERE b.release_id = a.release_id AND b.kanal = a.kanal " +
					"AND b.quittiert_am IS NULL AND b.entfallen_am IS NULL) " +
					"ORDER BY a.entfallen_am DESC, a.id DESC LIMIT 1)",
			)
			.bind(releaseId, itemId);
	}

	/**
	 * Die offenen Meldungen fuer die Glocke, neueste zuerst. Eine Meldung zu
	 * einem Release ohne offene Absicht faellt heraus: Wer gekauft hat,
	 * braucht keinen Preis mehr - gelesen, nicht gespeichert.
	 */
	async offene(): Promise<OffenerAlarm[]> {
		const { results } = await this.db
			.prepare(
				"SELECT a.id, a.release_id AS releaseId, r.game_id AS gameId, g.title AS titel, r.platform AS plattform, " +
					"a.kanal, a.art, a.reihe, a.preis_cents AS preisCents, a.vorher_cents AS vorherCents, " +
					"a.aktualisiert_am AS aktualisiertAm " +
					"FROM preis_alarm a JOIN release r ON r.id = a.release_id JOIN game g ON g.id = r.game_id " +
					`WHERE a.quittiert_am IS NULL AND a.entfallen_am IS NULL AND ${OFFENE_ABSICHT} ` +
					"ORDER BY a.aktualisiert_am DESC, a.id DESC",
			)
			.all<OffenerAlarm>();
		return results ?? [];
	}

	/** Quittieren ueber den Haken. Gibt zurueck, ob eine offene Meldung getroffen wurde. */
	async quittieren(id: number): Promise<boolean> {
		const r = await this.db
			.prepare("UPDATE preis_alarm SET quittiert_am = datetime('now') WHERE id = ? AND quittiert_am IS NULL AND entfallen_am IS NULL")
			.bind(id)
			.run();
		return (r.meta.changes ?? 0) > 0;
	}
}
