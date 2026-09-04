-- Migration 0001: Grundschema
--
-- Vollstaendiges Schema aus den Abschnitten 3 bis 11 der Spezifikation.
-- Reihenfolge so gewaehlt, dass Fremdschluessel beim Anlegen aufgehen.
--
-- market_offer und price_snapshot bleiben bis Stufe 18 leer. Sie werden
-- trotzdem jetzt angelegt (Abschnitt 6): die spaetere Anbindung soll ein
-- reiner Import-Job sein und kein Schema-Umbau.

-- ---------------------------------------------------------------------------
-- 1. Sammlung (Abschnitt 3)
-- ---------------------------------------------------------------------------

-- Das Spiel als Konzept, plattformunabhaengig ("Bloodborne").
CREATE TABLE game (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  sort_title    TEXT NOT NULL,
  cover_url     TEXT,
  igdb_id       INTEGER,

  -- Use Case 11: unveroeffentlichte Titel duerfen auf die Wunschliste.
  release_date   TEXT,
  release_status TEXT NOT NULL DEFAULT 'unbekannt'
                 CHECK (release_status IN ('erschienen','angekuendigt','unbekannt')),

  -- Use Case 10: Bestandteile speichern, nie den fertigen Rang.
  critic_score       INTEGER,
  critic_score_count INTEGER,
  critic_source      TEXT,
  critic_updated_at  TEXT,

  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ein Spiel auf einer konkreten Plattform. Zwingend getrennt: GTA V existiert
-- auf PS3, PS4 und PS5 mit je eigener Trophaeenliste und eigenem Preis.
CREATE TABLE release (
  id            INTEGER PRIMARY KEY,
  game_id       INTEGER NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('PS3','PS4','PS5')),
  edition       TEXT,
  region        TEXT,

  -- Dreiwertig. NIEMALS Boolean: bei fehlenden Daten wuerde die App
  -- "gibt es nicht" behaupten und genau die gesuchten Spiele verstecken.
  physical_release_status TEXT NOT NULL DEFAULT 'unbekannt'
                          CHECK (physical_release_status IN ('ja','nein','unbekannt')),
  physical_release_region TEXT,
  physical_source         TEXT,
  physical_checked_at     TEXT,

  psn_product_id          TEXT,

  UNIQUE (game_id, platform, edition, region)
);

CREATE TABLE physical_copy (
  id            INTEGER PRIMARY KEY,
  release_id    INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  ean           TEXT,
  condition     TEXT CHECK (condition IN ('neu','sehr gut','gut','akzeptabel')),
  has_manual    INTEGER NOT NULL DEFAULT 0,
  purchase_date TEXT,
  purchase_price_cents INTEGER,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Quelle unterscheiden: PS-Plus-Zugriff ist kein dauerhafter Besitz.
CREATE TABLE digital_entitlement (
  id            INTEGER PRIMARY KEY,
  release_id    INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  source        TEXT NOT NULL CHECK (source IN ('kauf','plus','trial','sonstiges')),
  acquired_at   TEXT,
  UNIQUE (release_id, source)
);

-- ---------------------------------------------------------------------------
-- 2. Fortschritt (Abschnitt 4)
-- ---------------------------------------------------------------------------

-- Fremddaten von Sony. Wird bei jedem Sync ueberschrieben.
CREATE TABLE trophy_progress (
  np_communication_id TEXT PRIMARY KEY,
  np_service_name     TEXT NOT NULL,
  title_name          TEXT NOT NULL,
  platform            TEXT NOT NULL,
  icon_url            TEXT,

  defined_bronze      INTEGER NOT NULL DEFAULT 0,
  defined_silver      INTEGER NOT NULL DEFAULT 0,
  defined_gold        INTEGER NOT NULL DEFAULT 0,
  defined_platinum    INTEGER NOT NULL DEFAULT 0,

  earned_bronze       INTEGER NOT NULL DEFAULT 0,
  earned_silver       INTEGER NOT NULL DEFAULT 0,
  earned_gold         INTEGER NOT NULL DEFAULT 0,
  earned_platinum     INTEGER NOT NULL DEFAULT 0,

  progress_pct        INTEGER NOT NULL DEFAULT 0,
  last_played_at      TEXT,
  synced_at           TEXT NOT NULL,

  -- Referenzstand der letzten Durchsicht. Bewusst gegen den letzten
  -- *geprueften* Stand verglichen, nicht gegen den letzten Sync: sonst gehen
  -- Aenderungen verloren, die sich ueber mehrere Syncs ansammeln.
  reviewed_earned_total   INTEGER,
  reviewed_defined_total  INTEGER,
  reviewed_at             TEXT,

  release_id          INTEGER REFERENCES release(id) ON DELETE SET NULL
);

-- Eigene Einschaetzung. Wird ausschliesslich manuell gesetzt.
-- Ein Spiel kann Platin haben und trotzdem 'abgebrochen' sein.
CREATE TABLE play_status (
  release_id    INTEGER PRIMARY KEY REFERENCES release(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN (
                  'nicht_gespielt','am_spielen','pausiert',
                  'durchgespielt','komplettiert','abgebrochen',
                  'unentschieden'
                )),
  started_at    TEXT,
  finished_at   TEXT,
  rating        INTEGER CHECK (rating BETWEEN 1 AND 10),
  notes         TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- 3. Absichten (Abschnitt 5)
-- ---------------------------------------------------------------------------

-- Wunschliste, To-Do, Backlog und Kaufliste in einer Tabelle mit Typ-Feld.
-- Grund ist der Lebenszyklus Wunsch -> Kauf -> Backlog -> erledigt: bei drei
-- Tabellen waere jeder Uebergang ein Loeschen-und-Neuanlegen, und die
-- Historie ginge verloren. Hier ist es ein Feld-Update.
CREATE TABLE plan_entry (
  id            INTEGER PRIMARY KEY,

  kind          TEXT NOT NULL CHECK (kind IN ('wunsch','todo','backlog','kauf')),

  -- Absteigende Konkretheit. Mindestens eines muss gesetzt sein.
  release_id    INTEGER REFERENCES release(id) ON DELETE CASCADE,
  game_id       INTEGER REFERENCES game(id) ON DELETE CASCADE,
  title_raw     TEXT,

  position      INTEGER,
  priority      INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  is_favorite   INTEGER NOT NULL DEFAULT 0,
  note          TEXT,

  origin        TEXT CHECK (origin IN ('luecke','wunsch','manuell','import','triage')),

  status        TEXT NOT NULL DEFAULT 'offen'
                CHECK (status IN ('offen','erledigt','verworfen')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at   TEXT,

  CHECK (release_id IS NOT NULL OR game_id IS NOT NULL OR title_raw IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- 4. Pruefliste und Barcode (Abschnitte 8, 9)
-- ---------------------------------------------------------------------------

CREATE TABLE review_queue (
  release_id    INTEGER PRIMARY KEY REFERENCES release(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL CHECK (reason IN (
                  'erstimport','neue_trophaeen','dlc_erweitert'
                )),
  detail        TEXT,
  enqueued_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ean_mapping (
  ean           TEXT PRIMARY KEY,
  release_id    INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  source        TEXT NOT NULL DEFAULT 'manuell',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Damit unbekannte Codes nicht verloren gehen, wenn beim Scannen nicht
-- sofort zugeordnet werden soll.
CREATE TABLE unresolved_scan (
  ean           TEXT PRIMARY KEY,
  scan_count    INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- 5. Marktdaten (Abschnitt 6) - bleiben bis Stufe 18 leer
-- ---------------------------------------------------------------------------

-- Dreifachnutzen: EAN-Aufloesung, Nachweis einer physischen Fassung, Preis.
CREATE TABLE market_offer (
  id                INTEGER PRIMARY KEY,
  source            TEXT NOT NULL CHECK (source IN ('rebuy','medimops','manuell')),
  source_product_id TEXT NOT NULL,
  ean               TEXT,
  title_raw         TEXT NOT NULL,
  platform_raw      TEXT,
  condition         TEXT,
  price_cents       INTEGER,
  currency          TEXT NOT NULL DEFAULT 'EUR',
  in_stock          INTEGER NOT NULL DEFAULT 0,
  url               TEXT,
  imported_at       TEXT NOT NULL,
  release_id        INTEGER REFERENCES release(id) ON DELETE SET NULL,
  UNIQUE (source, source_product_id)
);

-- Preisverlauf ueber beide Kanaele. Wird nur geschrieben, wenn sich der Preis
-- geaendert hat. "Kostet 35 EUR" ist keine Entscheidungsgrundlage.
-- "Kostet 35 EUR, lag vor einem Jahr bei 22 EUR" schon.
CREATE TABLE price_snapshot (
  id            INTEGER PRIMARY KEY,
  release_id    INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('psn_store','gebraucht')),
  source        TEXT NOT NULL,
  condition     TEXT,
  price_cents   INTEGER NOT NULL,
  is_sale       INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'EUR',
  captured_at   TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 6. Sync-Protokoll (Abschnitt 10)
-- ---------------------------------------------------------------------------

CREATE TABLE psn_sync_run (
  id            INTEGER PRIMARY KEY,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  status        TEXT NOT NULL CHECK (status IN ('laufend','erfolg','fehler')),
  error_message TEXT,
  titles_seen   INTEGER
);

-- Rohdaten vor Normalisierung: erlaubt beliebiges Wiederholen ohne
-- PSN-Zugriff und liefert echte Testdaten.
CREATE TABLE psn_raw_response (
  id            INTEGER PRIMARY KEY,
  sync_run_id   INTEGER NOT NULL REFERENCES psn_sync_run(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  payload       TEXT NOT NULL,
  fetched_at    TEXT NOT NULL
);

-- Singleton. Es wird bewusst KEINE Zeile angelegt: der CHECK kennt keinen
-- Wert fuer "noch nie eingerichtet", und das Fehlen der Zeile sagt genau das
-- aus. Stufe 2 schreibt sie beim ersten NPSSO.
CREATE TABLE psn_credentials (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_expires_at TEXT,
  last_success_at    TEXT,
  status             TEXT NOT NULL CHECK (status IN ('ok','abgelaufen','fehler'))
);

-- ---------------------------------------------------------------------------
-- 7. Einstellungen (Abschnitt 5.2)
-- ---------------------------------------------------------------------------

CREATE TABLE app_setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 8. Indizes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_trophy_unmatched ON trophy_progress(release_id) WHERE release_id IS NULL;
CREATE INDEX idx_plan_offen       ON plan_entry(kind, status, position);
CREATE INDEX idx_market_offer_ean ON market_offer(ean);
CREATE INDEX idx_price_release    ON price_snapshot(release_id, channel, captured_at);

-- ---------------------------------------------------------------------------
-- 9. Abgeleitete Sichten (Abschnitt 11)
--
-- Konvention: Views listen ihre Spalten immer explizit auf, nie SELECT *.
-- Bei SELECT * waechst die Ergebnismenge nach einem ADD COLUMN lautlos mit,
-- waehrend die Definition in sqlite_master unveraendert bleibt.
-- ---------------------------------------------------------------------------

-- Use Case 3: Luecken. Digital gespielt, Disc existiert, nicht im Regal.
CREATE VIEW v_luecken AS
SELECT
  g.title, r.id AS release_id, r.platform, r.physical_release_region,
  t.progress_pct,
  (t.defined_platinum > 0 AND t.earned_platinum > 0) AS hat_platin,
  ps.status AS eigener_status,
  (SELECT MIN(price_cents) FROM market_offer m
     WHERE m.release_id = r.id AND m.in_stock = 1) AS bester_gebrauchtpreis_cents
FROM trophy_progress t
JOIN release r ON r.id = t.release_id
JOIN game g ON g.id = r.game_id
LEFT JOIN play_status ps ON ps.release_id = r.id
WHERE t.progress_pct > 0
  AND r.physical_release_status = 'ja'
  AND NOT EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id);

-- Use Case 6: Kandidaten fuer die Kaufliste, noch nicht uebernommen.
CREATE VIEW v_kaufkandidaten AS
SELECT 'luecke' AS quelle, release_id, title, platform, bester_gebrauchtpreis_cents
FROM v_luecken
WHERE release_id NOT IN (
  SELECT release_id FROM plan_entry
  WHERE kind = 'kauf' AND status = 'offen' AND release_id IS NOT NULL
)
UNION ALL
SELECT 'wunsch', pe.release_id, COALESCE(g.title, pe.title_raw),
       r.platform, NULL
FROM plan_entry pe
LEFT JOIN release r ON r.id = pe.release_id
LEFT JOIN game g ON g.id = COALESCE(pe.game_id, r.game_id)
WHERE pe.kind = 'wunsch' AND pe.status = 'offen';

-- Use Case 8: offene Pruefliste, angereichert fuer die Anzeige.
CREATE VIEW v_review_offen AS
SELECT rq.reason, rq.detail, rq.enqueued_at,
       g.title, r.id AS release_id, r.platform,
       t.progress_pct,
       (t.defined_platinum > 0 AND t.earned_platinum > 0) AS hat_platin,
       t.earned_bronze, t.earned_silver, t.earned_gold,
       ps.status AS aktueller_status
FROM review_queue rq
JOIN release r ON r.id = rq.release_id
JOIN game g ON g.id = r.game_id
LEFT JOIN trophy_progress t ON t.release_id = r.id
LEFT JOIN play_status ps ON ps.release_id = r.id
ORDER BY
  CASE rq.reason WHEN 'dlc_erweitert' THEN 1
                 WHEN 'neue_trophaeen' THEN 2 ELSE 3 END,
  t.progress_pct DESC;

-- Use Case 12: alles ohne IGDB-Zuordnung, listenuebergreifend.
CREATE VIEW v_ohne_igdb AS
SELECT 'spiel' AS quelle, g.id AS ref_id, g.title
FROM game g WHERE g.igdb_id IS NULL
UNION ALL
SELECT 'plan_' || pe.kind, pe.id, pe.title_raw
FROM plan_entry pe
WHERE pe.status = 'offen' AND pe.game_id IS NULL AND pe.release_id IS NULL;

-- Use Case 11: vorgemerkte Titel, die noch erscheinen.
CREATE VIEW v_erscheint_bald AS
SELECT g.title, g.release_date, pe.id AS plan_id, pe.kind, pe.is_favorite
FROM plan_entry pe
JOIN game g ON g.id = COALESCE(pe.game_id,
                (SELECT game_id FROM release WHERE id = pe.release_id))
WHERE pe.status = 'offen'
  AND g.release_status = 'angekuendigt'
ORDER BY g.release_date;

-- Use Case 5b: Kandidaten fuer den Backlog - im Besitz, nie angefasst.
--
-- ABWEICHUNG von Abschnitt 11: Die Klammern um das OR fehlten dort. Da AND
-- staerker bindet, wurde die Bedingung als
--   physical OR (digital AND alle-uebrigen)
-- gelesen - jedes Release mit einer Disc im Regal galt damit als Kandidat,
-- auch ein zu 100 % durchgespieltes, das bereits auf einer Liste steht.
-- Die Absicht steht im Kommentar der View: "im Besitz, nie angefasst".
CREATE VIEW v_backlog_kandidaten AS
SELECT g.title, r.id AS release_id, r.platform
FROM release r
JOIN game g ON g.id = r.game_id
WHERE (EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id)
    OR EXISTS (SELECT 1 FROM digital_entitlement d WHERE d.release_id = r.id))
AND NOT EXISTS (
  SELECT 1 FROM trophy_progress t WHERE t.release_id = r.id AND t.progress_pct > 0
)
AND COALESCE((SELECT status FROM play_status WHERE release_id = r.id),
             'nicht_gespielt') = 'nicht_gespielt'
AND r.id NOT IN (SELECT release_id FROM plan_entry
                 WHERE kind IN ('todo','backlog') AND status='offen' AND release_id IS NOT NULL);

-- Trophaeen und eigene Bewertung weichen ab. Nicht als Fehler behandeln,
-- nur zur Durchsicht anzeigen.
CREATE VIEW v_abweichungen AS
SELECT g.title, r.platform, t.progress_pct, ps.status
FROM play_status ps
JOIN release r ON r.id = ps.release_id
JOIN game g ON g.id = r.game_id
LEFT JOIN trophy_progress t ON t.release_id = r.id
WHERE (ps.status IN ('durchgespielt','komplettiert') AND COALESCE(t.progress_pct,0) < 20)
   OR (ps.status = 'nicht_gespielt' AND COALESCE(t.progress_pct,0) > 0);

-- ---------------------------------------------------------------------------
-- 10. Gewichte der Rangformel (Abschnitt 5.2)
--
-- OR IGNORE ist Konvention fuer Seeds: sie duerfen einen vom Nutzer
-- angepassten Wert niemals zuruecksetzen.
-- w_price bleibt 0, bis Preise existieren.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO app_setting (key, value) VALUES
  ('w_critic',   '0.5'),
  ('w_priority', '0.3'),
  ('w_favorite', '0.2'),
  ('w_price',    '0');
