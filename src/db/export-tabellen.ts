/**
 * Welche Tabellen in backup.json gehoeren und wie sie sortiert werden
 * (Abschnitt 14.2).
 *
 * Eine eigene Datei ohne Klasse (Nachtrag vom 02.11.2026): Zwei Wege bauen
 * backup.json - die Route im Worker und `scripts/json-aus-dump.mjs` in der
 * Sicherungs-Action -, und beide lesen DIESE Liste. Node laedt die Datei ohne
 * Uebersetzung; `export.ts` mit seiner Klasse kann es nicht.
 */

/**
 * Die Fachtabellen, die in backup.json gehoeren.
 *
 * Feste Liste, kein `sqlite_master`-Durchlauf: Tabellennamen lassen sich in
 * SQLite nicht binden, sie werden also in den Abfragetext eingesetzt. Aus
 * einer Konstante ist das unbedenklich, aus einer Abfrage waere es eine
 * Angewohnheit, die irgendwann auf Nutzereingaben trifft.
 *
 * Bewusst NICHT dabei (test/export-route.spec.ts haelt die Vollstaendigkeit
 * dieser Aufzaehlung fest):
 * - `psn_credentials` - Chiffrate und IVs. Der Schluessel liegt als
 *   Cloudflare Secret; ohne ihn sind sie nutzlos, im privaten Repo haben sie
 *   trotzdem nichts verloren.
 * - `psn_raw_response` - Rohantworten von Sony, gross und jederzeit erneut
 *   abrufbar. Der SQL-Dump aus `d1 export` hat sie ohnehin.
 * - `d1_migrations` - Wranglers eigene Buchfuehrung, kommt beim
 *   Wiedereinspielen aus dem Dump.
 * `psn_played_title` wird dagegen exportiert: Die Spielzeit ist zwar
 * Fremddatum, aber die Zuordnung zum Release ist eine Entscheidung (von Hand
 * korrigierbar), und PSN liefert alte Werte nicht nach - was einmal weg ist,
 * kommt nicht zurueck.
 *
 * - `igdb_candidate` - Suchergebnisse von IGDB fuer die Pruefansicht,
 *   abgeleitet und jederzeit neu abrufbar. Die Entscheidungen des Nutzers
 *   (Verknuepfung, Ablehnung) stehen in `game` und werden gesichert.
 * - `wishlist_import`, `wishlist_import_line`, `wishlist_import_candidate` -
 *   Arbeitszustand eines Wunschlisten-Imports (Stufe 11). Die Quelldateien
 *   liegen beim Nutzer, das Ergebnis steht in `plan_entry`.
 */
export const EXPORT_TABELLEN = [
	"game",
	"release",
	"physical_copy",
	"digital_entitlement",
	"trophy_progress",
	"play_status",
	"plan_entry",
	"review_queue",
	"ean_mapping",
	"unresolved_scan",
	"market_offer",
	// Die Sperrliste der verworfenen Angebote (Migration 0033). Sie wird
	// exportiert, weil sie eine ENTSCHEIDUNG DES NUTZERS haelt, die kein Sync
	// zurueckbringt - genau das Kriterium, mit dem game_event exportiert wird
	// (14.2). Ohne sie waeren nach einer Wiederherstellung alle verworfenen
	// Angebote wieder die guenstigsten.
	"market_offer_verworfen",
	"price_snapshot",
	"app_setting",
	"psn_sync_run",
	"game_event",
	"psn_played_title",
	// Nur Zeitpunkte, kein Token (Migration 0026). Die Zeitreihe ist der ganze
	// Zweck der Tabelle und nach einem Verlust nicht wiederherstellbar.
	"psn_zugang",
	// Einzeltrophaeen (Migration 0027, Entscheidung des Nutzers vom
	// 01.10.2026). Fremddatum, aber nicht billig wiederzubeschaffen: Ein
	// erneutes Fuellen kostet 940 PSN-Anfragen. Der Dump waechst dadurch um
	// rund 3-4 MB je Woche - gemessen, nicht geschaetzt: 2,32 MB Symboladressen,
	// 0,91 MB Beschreibungen, 0,32 MB Namen (7.7).
	"trophy",
	"trophy_group",
] as const;

/** Tabellen, die es gibt und die absichtlich nicht exportiert werden. */
export const NICHT_EXPORTIERT = [
	"psn_credentials",
	"psn_raw_response",
	"d1_migrations",
	"igdb_candidate",
	"wishlist_import",
	"wishlist_import_line",
	"wishlist_import_candidate",
] as const;

export type Exporttabelle = (typeof EXPORT_TABELLEN)[number];

/**
 * Wonach eine Tabelle im Export sortiert wird. Ohne Eintrag: `rowid`.
 *
 * **Nicht jede Tabelle hat eine rowid.** `trophy` und `trophy_group` sind
 * `WITHOUT ROWID` (Migration 0027, wegen der Schreibgrenze), und dort ist
 * `ORDER BY rowid` kein leeres Ergebnis, sondern ein Fehler - der ganze
 * Export antwortete mit 500, bis diese Tabelle hier stand. Gefunden von
 * `test/export-route.spec.ts`, bevor es irgendwo hinkam.
 *
 * Sortiert wird nach dem Primaerschluessel: Er ist bei einer
 * WITHOUT-ROWID-Tabelle ohnehin die Ablagereihenfolge, der Export liest sie
 * also der Reihe nach und nicht quer.
 */
export const EXPORT_ORDNUNG: Partial<Record<Exporttabelle, string>> = {
	trophy: "np_communication_id, trophy_id",
	trophy_group: "np_communication_id, group_id",
};
