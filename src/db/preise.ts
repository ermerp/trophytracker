/**
 * Der Preisverlauf eines Release, wie ihn das Diagramm liest (Stufe 20f).
 *
 * Eigene Datei, weil `price_snapshot` zwei Schreiber hat - `markt.ts` fuer
 * `channel='gebraucht'` und `store.ts` fuer `channel='psn_store'` - und
 * keiner von beiden die Tabelle allein besitzt. Hier wird nur gelesen; es
 * gibt nichts zu protokollieren (8.5 kennt kein Ereignis je Preis, Preise
 * haben mit `price_snapshot` ihre eigene Historie).
 */

/**
 * Bis hierher wird tageweise verdichtet, davor wochenweise. Als Text im
 * Statement, nie als Bind (CLAUDE.md).
 *
 * Verdichtet wird nur beim LESEN (Entscheidung des Nutzers vom 09.10.2026):
 * Der Bestand bleibt vollstaendig, und ein Diagramm auf 360 px kann ohnehin
 * keine 365 Punkte zeigen. Die Wochenstufe greift erstmals im Januar 2027 -
 * der erste Punkt mit Kanal ist vom 04.10.2026 -, also genau dann, wenn die
 * Verdichtung beim Schreiben neu aufgerufen wird (16.2).
 */
const TAGESSTUFE = "-90 days";

/** Die drei Reihen des Diagramms. `store` ist `channel='psn_store'`, die beiden anderen sind `kanal`. */
export type PreisReihe = "haendler" | "markt" | "store";

/** Ein verdichteter Punkt: der LETZTE Stand seines Eimers, nicht dessen Tief. */
export type PreisPunkt = {
	reihe: PreisReihe;
	stand: string;
	preisCents: number;
	quelle: string;
};

/**
 * Ein Eimer liefert den letzten Punkt, nicht sein Tief - das Diagramm ist
 * eine Treppe (Entscheidung des Nutzers vom 11.10.2026): Geschrieben wird nur
 * bei Aenderung, dazwischen gilt der alte Preis weiter.
 *
 * Das traegt `MAX(p.captured_at)` als EINZIGES min/max-Aggregat: Nur dann
 * garantiert SQLite, dass die nackten Spalten `price_cents` und `source` aus
 * eben dieser Zeile stammen. Ein zweites Aggregat - etwa ein Eimer-Tief -
 * wuerde die Garantie aufheben und die Treppe still verfaelschen.
 * `test/preise-repo.spec.ts` haelt das mit drei Punkten in einem Eimer fest.
 *
 * Zwei getrennte `NOT EXISTS` statt eines `OR`: Ein `OR` ueber zwei Spalten
 * in einer Unterabfrage laesst SQLite den Index fallen (CLAUDE.md). Ein
 * `NOT IN` waere schlicht falsch - `NULL NOT IN (...)` ist `NULL`, das
 * striche jeden Punkt ohne Kennung.
 */
const EIMER =
	`CASE WHEN p.captured_at >= datetime('now', '${TAGESSTUFE}') ` +
	"THEN substr(p.captured_at, 1, 10) " +
	"ELSE date(p.captured_at, 'weekday 0', '-6 days') END";

export const VERLAUF_SQL =
	"SELECT CASE WHEN p.channel = 'psn_store' THEN 'store' ELSE p.kanal END AS reihe, " +
	"MAX(p.captured_at) AS stand, p.price_cents AS preisCents, p.source AS quelle " +
	"FROM price_snapshot p " +
	"WHERE p.release_id = ? " +
	// Die 239 Punkte vom 02.10.2026 tragen keinen Kanal: Sie stammen aus dem
	// ersten Durchlauf vor Stufe 20e. Das Diagramm laesst sie weg, statt eine
	// Herkunft zu erfinden (Abschnitt 6).
	"AND (p.kanal IS NOT NULL OR p.channel = 'psn_store') " +
	"AND NOT EXISTS (SELECT 1 FROM market_offer_verworfen v " +
	"WHERE v.release_id = p.release_id AND v.ebay_item_id = p.ebay_item_id) " +
	// Rueckfall auf eine geschlossene Altlast: `price_snapshot.ebay_item_id`
	// kam mit Migration 0033 ohne Backfill, die 1 383 Punkte davor tragen
	// keine Kennung (4 von 4 danach tragen eine). Ohne diesen Zweig bliebe
	// genau der Fall stehen, der Stufe 20h ausgeloest hat: das Angebot zu
	// 7,02 EUR bei *11-11: Memories Retold*. Er trifft am 11.10.2026 genau
	// einen Punkt. Restrisiko: Ein Altpunkt mit zufaellig gleichem Preis aus
	// einem anderen Angebot verschwindet mit.
	"AND NOT EXISTS (SELECT 1 FROM market_offer_verworfen v " +
	"WHERE v.release_id = p.release_id AND p.ebay_item_id IS NULL " +
	"AND p.channel = 'gebraucht' AND v.preis_cents = p.price_cents) " +
	`GROUP BY reihe, ${EIMER} ORDER BY reihe, stand`;

export class PreiseRepository {
	constructor(private readonly db: D1Database) {}

	/**
	 * Die Punkte eines Release, verdichtet und ohne verworfene Angebote.
	 *
	 * Gemessen am 11.10.2026 gegen die Produktion: 38 gelesene Zeilen fuer das
	 * Release mit den meisten Punkten (12 Punkte in 3 Reihen). `EXPLAIN QUERY
	 * PLAN` nimmt `idx_price_release (release_id=?)` und fuer die Sperrliste
	 * den Primaerschluessel als COVERING INDEX.
	 */
	async verlauf(releaseId: number): Promise<PreisPunkt[]> {
		const { results } = await this.db.prepare(VERLAUF_SQL).bind(releaseId).all<PreisPunkt>();
		return results ?? [];
	}
}
