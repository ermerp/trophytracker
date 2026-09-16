-- Migration 0019: Aenderungsprotokoll je Spiel (Stufe 16, Abschnitt 8.5)
--
-- Eine neue Tabelle, keine View aendert sich, keine Zeile wird geschrieben:
-- Der Verlauf beginnt mit diesem Deploy (Entscheidung des Nutzers vom
-- 16.09.2026 - vorhandene Stempel wie matched_at oder reviewed_at sagen
-- "wann", nicht "was", eine Rueckrechnung waere geraten).
--
-- game_event haelt fest, wer wann was geschrieben hat. Die Quelle je Zeile
-- macht "Fremddaten und eigene Bewertung nie vermischen" sichtbar:
--   nutzer     Entscheidung von Hand (Bewertung, Listen, Besitz, Zuordnung)
--   sync       PSN-Sync (neue Liste, automatische Zuordnung, Vorbelegung,
--              Pruefliste)
--   igdb       IGDB (automatische Verknuepfung, Disc-Fassung, erschienen)
--   import     Wunschlisten-Import (Uebernahme als Eintrag)
--   feed       Haendlerfeed, reserviert fuer Stufe 20
--   migration  Datenmigration, reserviert
--
-- game_id und release_id mit ON DELETE SET NULL, nicht CASCADE: "Spiel
-- geloescht" muss das Loeschen ueberleben. label nennt dann noch den Titel
-- - ein Protokoll haelt fest, was zum Zeitpunkt galt, das ist kein
-- berechneter Wert im Sinne von Abschnitt 5.2.
--
-- kind traegt bewusst kein CHECK: Stufe 17 (Scan), 18 (Cron) und 20 (Feed)
-- bringen neue Arten, und die Liste steht in src/domain/ereignis.ts.
--
-- Die globale Ansicht liest nach id absteigend (Primaerschluessel), der
-- Verlauf je Spiel ueber idx_event_game; der Quellenfilter laeuft ueber
-- idx_event_source (gemessen in test/lesekosten.spec.ts).

CREATE TABLE game_event (
  id          INTEGER PRIMARY KEY,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  source      TEXT NOT NULL CHECK (source IN ('nutzer','sync','igdb','import','feed','migration')),
  game_id     INTEGER REFERENCES game(id) ON DELETE SET NULL,
  release_id  INTEGER REFERENCES release(id) ON DELETE SET NULL,
  label       TEXT NOT NULL,
  kind        TEXT NOT NULL,
  field       TEXT,
  old_value   TEXT,
  new_value   TEXT,
  detail      TEXT
);

CREATE INDEX idx_event_game    ON game_event(game_id, id);
CREATE INDEX idx_event_release ON game_event(release_id);
CREATE INDEX idx_event_source  ON game_event(source, id);
