-- Migration 0010: IGDB-Anbindung (Stufe 9, Abschnitt 7.6)
--
-- game traegt seit Migration 0001 die Zielspalten (cover_url, igdb_id,
-- release_date, release_status, critic_*). Was fehlt, ist die Buchfuehrung
-- des Abgleichs: Wann wurde gesucht, wie kam die Verknuepfung zustande,
-- hat der Nutzer entschieden, dass es keinen Eintrag gibt.
--
-- Kein Statusfeld - die Zustaende sind aus den Zeitstempeln ableitbar:
--   noch nicht gesucht  igdb_id IS NULL AND igdb_checked_at IS NULL AND igdb_declined_at IS NULL
--   zur Pruefung        igdb_id IS NULL AND igdb_checked_at IS NOT NULL AND igdb_declined_at IS NULL
--   verknuepft          igdb_id IS NOT NULL
--   abgelehnt           igdb_declined_at IS NOT NULL
--
-- Rein additiv. Views auf game listen ihre Spalten explizit (v_ohne_igdb,
-- v_erscheint_bald, v_luecken, ...), ein ADD COLUMN aendert sie nicht.

ALTER TABLE game ADD COLUMN igdb_slug           TEXT;   -- fuer den Link auf igdb.com
ALTER TABLE game ADD COLUMN igdb_checked_at     TEXT;   -- letzte Suche bei IGDB
ALTER TABLE game ADD COLUMN igdb_matched_at     TEXT;
ALTER TABLE game ADD COLUMN igdb_matched_source TEXT
  CHECK (igdb_matched_source IN ('automatisch','manuell'));
ALTER TABLE game ADD COLUMN igdb_declined_at    TEXT;   -- Nutzer: "gibt es bei IGDB nicht"
ALTER TABLE game ADD COLUMN igdb_synced_at      TEXT;   -- letzte Uebernahme der Metadaten

-- Kandidaten einer Suche ohne eindeutigen Treffer, fuer die Pruefansicht.
-- Abgeleitet und jederzeit neu abrufbar - deshalb NICHT_EXPORTIERT in
-- src/db/export.ts. Die Entscheidungen des Nutzers stehen in game.
CREATE TABLE igdb_candidate (
  id           INTEGER PRIMARY KEY,
  game_id      INTEGER NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  igdb_id      INTEGER NOT NULL,
  name         TEXT NOT NULL,
  slug         TEXT,
  cover_url    TEXT,
  release_date TEXT,
  platforms    TEXT,               -- "PS3,PS4", nur die vier eigenen
  game_type    TEXT,               -- Anzeigetext, z. B. 'Hauptspiel', 'DLC'
  critic_score INTEGER,
  critic_score_count INTEGER,
  position     INTEGER NOT NULL,   -- Reihenfolge der IGDB-Antwort
  fetched_at   TEXT NOT NULL,
  UNIQUE (game_id, igdb_id)
);

-- Fremdschluessel bekommen ihren Index in derselben Migration (Abschnitt 2).
CREATE INDEX idx_igdb_candidate_game ON igdb_candidate(game_id);
