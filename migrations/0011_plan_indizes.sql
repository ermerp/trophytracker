-- Migration 0011: Indizes fuer die Wunschliste (Stufe 10)
--
-- plan_entry.game_id ist ein Fremdschluessel ohne Index - Migration 0008 hat
-- nur release_id bedacht, weil bis dahin kein Eintrag an einem Spiel hing.
-- Ab Stufe 10 fragt das Spieldetail je Aufruf "offene Absichten zu diesem
-- Spiel" ab; ohne Index waere das ein Tabellenscan je Detailansicht.
--
-- game.igdb_id: Beim Anlegen eines Wunsches aus der IGDB-Suche wird ein
-- schon vorhandenes Spiel mit derselben IGDB-Id wiederverwendet statt
-- doppelt angelegt. Der Lookup laeuft je Anlegen einmal.
--
-- Rein additiv, keine View betroffen, keine Datenmigration.

CREATE INDEX idx_plan_game ON plan_entry(game_id);
CREATE INDEX idx_game_igdb ON game(igdb_id);
