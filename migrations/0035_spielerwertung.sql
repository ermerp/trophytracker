-- Migration 0035: Die Spielerwertung von IGDB (Stufe 20k)
--
-- IGDB liefert neben dem Kritikerschnitt (`aggregated_rating`, in
-- critic_score) die Wertung seiner Nutzer (`rating`). Sie ist dem Nutzer
-- wichtiger als die Kritikerwertung (Entscheidung vom 22.10.2026): Sie
-- sortiert die Listen, "Favoriten zuerst" eingeschlossen, und steht auf den
-- Karten als "Wertung". Gemessen am 22.10.2026 gegen IGDB: 458 von 478
-- verknuepften Spielen haben eine (Kritikerwertung: 430), im Median mit 186
-- Stimmen.
--
-- Keine Quellenspalte wie bei critic_*: Die Spielerwertung kommt nur von
-- IGDB und laesst sich nicht von Hand setzen (7.5).
--
-- Rein additiv; der alte Worker liest die neuen Spalten nicht. Keine
-- Datenmigration: Gefuellt wird beim Verknuepfen und Auffrischen (7.6), der
-- Bestand ueber die naechtliche Auffrischung (Frist sieben Tage) oder den
-- Knopf "Auffrischen". Keine View liest `game` mit SELECT *; die
-- Kandidaten-Views bleiben unveraendert, die Listen joinen `game` selbst.
ALTER TABLE game ADD COLUMN user_score INTEGER;
ALTER TABLE game ADD COLUMN user_score_count INTEGER;

-- Die Kandidaten einer IGDB-Suche (Pruefansicht, Wunschlisten-Import)
-- zeigen ebenfalls die Spielerwertung.
ALTER TABLE igdb_candidate ADD COLUMN user_score INTEGER;
ALTER TABLE igdb_candidate ADD COLUMN user_score_count INTEGER;
ALTER TABLE wishlist_import_candidate ADD COLUMN user_score INTEGER;
ALTER TABLE wishlist_import_candidate ADD COLUMN user_score_count INTEGER;
