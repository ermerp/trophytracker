-- Migration 0041: Hinweis an einer Importzeile (Nachtrag f1a, Abschnitt 8.2)
--
-- Zwei Gründe, warum der Import eine Zeile nicht still übernimmt:
--   'jahr'   - der einzige Titeltreffer liegt mehr als ein Jahr neben dem
--              Datum der Liste; die Zeile steht als 'mehrdeutig' zur Durchsicht.
--   'besitz' - am Ziel-Release liegt schon eine Disc oder ein Kauf; die Zeile
--              steht als 'schon_vorhanden' da.
--
-- Eine eigene Spalte statt neuer Werte in `decision` oder `match_kind`: Deren
-- CHECK liesse sich nur mit einem Neubau der Tabelle erweitern, und der alte
-- Worker laeuft beim Anwenden noch. ADD COLUMN ist abwaertskompatibel. Keine
-- View steht auf der Tabelle. Rein additiv, keine Datenmigration; die Tabelle
-- ist Arbeitszustand und NICHT_EXPORTIERT.

ALTER TABLE wishlist_import_line ADD COLUMN hinweis TEXT CHECK (hinweis IN ('jahr','besitz'));
