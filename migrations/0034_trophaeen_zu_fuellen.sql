-- Migration 0034: Die Auswahl der Einzeltrophaeen ohne OR (Stufe 18j)
--
-- Befund aus der Nacht zum 17.10.2026 (D1-Analytics je Abfrage): Der
-- Leerlauf im PSN-Fenster las je Aufruf rund 430 Zeilen ueber
-- `naechsteZumFuellen` - die ganze Tabelle trophy_progress, um
-- festzustellen, dass keine Liste offen ist. Die Lesekosten-Messung sah das
-- nicht: Sie lief ohne PSN-Zugang, und ohne Zugang kommt der Cron gar nicht
-- bis zu diesem Schritt (10.1).
--
-- Die Bedingung war ein OR ueber zwei Faelle - noch nie geholt
-- (`trophies_synced_at IS NULL`) oder die Zaehlersumme weicht vom Stempel ab.
-- Fuer die zweite Haelfte hilft kein gewoehnlicher Index: Sie vergleicht
-- Spalten derselben Zeile miteinander. Es sind deshalb zwei TEILINDIZES, je
-- einer fuer einen Fall, und die Auswahl fragt beide als UNION ab (CLAUDE.md:
-- kein OR, sondern zwei Index-Lookups mit den Filtern in den Teilabfragen).
-- Im Leerlauf sind beide leer - dieselbe Regel wie in 0032: Eine Frage nach
-- "ist etwas offen?" beantwortet die kleine Menge, nicht die grosse.
--
-- Die Bedingung im Index muss WOERTLICH der Bedingung der Abfrage
-- entsprechen, sonst greift SQLite nicht zu; beide stehen deshalb in
-- `src/db/trophaeen.ts` neben dieser Migration (ZAEHLERSUMME).
-- np_service_name steht mit im Index, damit die Auswahl die Tabelle gar
-- nicht anfasst.
CREATE INDEX idx_trophy_progress_nie_geholt ON trophy_progress(np_communication_id, np_service_name)
	WHERE trophies_synced_at IS NULL;
CREATE INDEX idx_trophy_progress_geaendert ON trophy_progress(np_communication_id, np_service_name)
	WHERE trophies_synced_sum <> (earned_bronze + earned_silver + earned_gold + earned_platinum + defined_bronze + defined_silver + defined_gold + defined_platinum);

-- Dazu, aus derselben Messung (Stufe 18j): Die Freigabe erschienener Titel
-- (8.4) laeuft seit 18j im Lage-Batch JEDES Wartungsaufrufs und las zweimal
-- die ganze Tabelle game - einmal fuer das Protokoll, einmal fuer das
-- UPDATE, zusammen 860 Zeilen im Test und 2 x 479 in der Produktion (Nacht
-- zum 17.10.2026). Die bisherige Lesekosten-Messung zaehlte nur eine der
-- beiden Abfragen, weil sie eine Abschrift mass statt des Aufrufs. Angekuendigt
-- sind wenige Spiele; der Teilindex enthaelt nur sie.
CREATE INDEX idx_game_angekuendigt ON game(release_date) WHERE release_status = 'angekuendigt';
