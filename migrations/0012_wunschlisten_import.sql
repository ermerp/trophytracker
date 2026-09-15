-- Migration 0012: Wunschlisten-Import (Stufe 11, Abschnitt 8.2)
--
-- Der Import laeuft in Schritten, wie der IGDB-Abgleich: 318 Zeilen mit
-- je ein bis vier IGDB-Anfragen passen nicht in einen Aufruf, und eine
-- Entscheidung des Nutzers ("ueberspringen") muss ein Neuladen ueberstehen.
-- Der Zustand eines Laufs liegt deshalb in der Datenbank, nicht im Browser.
--
-- Die drei Tabellen sind Arbeitszustand und werden nicht gesichert
-- (NICHT_EXPORTIERT in src/db/export.ts): Die Quelldateien liegen beim
-- Nutzer, das Ergebnis steht in plan_entry und wird dort gesichert.
--
-- v_ohne_igdb bekommt die Spalte `zustand`, damit die Ansicht "Ohne
-- Zuordnung" abgelehnte Spiele hinter einem Umschalter halten kann
-- (Entscheidung des Nutzers vom 15.09.2026, schliesst den offenen Punkt
-- aus 7.6). View droppen und neu anlegen, Spalten explizit.
--
-- Rein additiv, keine Datenmigration.

CREATE TABLE wishlist_import (
  id          INTEGER PRIMARY KEY,
  source_name TEXT,                 -- Dateiname oder 'Eingabe'
  list_year   INTEGER,              -- aus dem Dateinamen, vom Nutzer korrigierbar
  form        TEXT NOT NULL CHECK (form IN ('jahresliste','plattformliste','tabelle','einfach')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE wishlist_import_line (
  id            INTEGER PRIMARY KEY,
  import_id     INTEGER NOT NULL REFERENCES wishlist_import(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  title         TEXT NOT NULL,      -- bereinigt, vom Nutzer aenderbar
  originals     TEXT NOT NULL,      -- JSON-Liste der Rohzeilen (zusammengefuehrte Doppelungen)
  platform      TEXT CHECK (platform IN ('PS3','PS4','PS5','PSVITA')),
  listed_at     TEXT,               -- 'JJJJ' oder 'JJJJ-MM', ungefaehr; wandert nie in plan_entry
  checked_at    TEXT,               -- NULL = noch nicht abgeglichen (Fortschritt des Schrittlaufs)
  search_path   TEXT,               -- Suchweg aus kandidatenSuchen, nur zur Anzeige
  match_kind    TEXT CHECK (match_kind IN ('sammlung','vorhanden','eindeutig','mehrdeutig','ohne_treffer')),
  game_id       INTEGER REFERENCES game(id) ON DELETE SET NULL,      -- sammlung / vorhanden
  release_id    INTEGER REFERENCES release(id) ON DELETE SET NULL,   -- sammlung mit Plattform
  igdb_id       INTEGER,            -- eindeutiger Treffer
  decision      TEXT NOT NULL DEFAULT 'offen'
                CHECK (decision IN ('offen','uebernommen','uebersprungen','schon_vorhanden','aufgeteilt')),
  plan_entry_id INTEGER REFERENCES plan_entry(id) ON DELETE SET NULL,
  decided_at    TEXT
);

-- Jeder Fremdschluessel bekommt seinen Index in derselben Migration (CLAUDE.md).
CREATE INDEX idx_wl_line_import  ON wishlist_import_line(import_id);
CREATE INDEX idx_wl_line_game    ON wishlist_import_line(game_id);
CREATE INDEX idx_wl_line_release ON wishlist_import_line(release_id);
CREATE INDEX idx_wl_line_plan    ON wishlist_import_line(plan_entry_id);

-- Dieselbe Form wie igdb_candidate (Migration 0010), je Zeile statt je Spiel.
CREATE TABLE wishlist_import_candidate (
  id           INTEGER PRIMARY KEY,
  line_id      INTEGER NOT NULL REFERENCES wishlist_import_line(id) ON DELETE CASCADE,
  igdb_id      INTEGER NOT NULL,
  name         TEXT NOT NULL,
  slug         TEXT,
  cover_url    TEXT,
  release_date TEXT,
  platforms    TEXT,
  game_type    TEXT,
  critic_score INTEGER,
  critic_score_count INTEGER,
  position     INTEGER NOT NULL,
  UNIQUE (line_id, igdb_id)
);

CREATE INDEX idx_wl_candidate_line ON wishlist_import_candidate(line_id);

DROP VIEW v_ohne_igdb;
CREATE VIEW v_ohne_igdb AS
SELECT 'spiel' AS quelle, g.id AS ref_id, g.title,
       CASE WHEN g.igdb_declined_at IS NOT NULL THEN 'abgelehnt'
            WHEN g.igdb_checked_at IS NULL THEN 'nicht_gesucht'
            ELSE 'zur_pruefung' END AS zustand
FROM game g WHERE g.igdb_id IS NULL
UNION ALL
SELECT 'plan_' || pe.kind, pe.id, pe.title_raw, 'freitext'
FROM plan_entry pe
WHERE pe.status = 'offen' AND pe.game_id IS NULL AND pe.release_id IS NULL;
