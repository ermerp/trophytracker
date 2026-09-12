-- Migration 0003: PS Vita als vierte Plattform
--
-- Die Trophaeenliste enthaelt 24 reine Vita-Titel und 26 weitere, bei denen
-- Vita in einer Cross-Gen-Liste steckt. Vom Nutzer entschieden: Vita wird eine
-- vollwertige Plattform, damit sich diese Spiele wie andere erfassen lassen.
--
-- SQLite kann ein CHECK nicht aendern - das erfordert einen Tabellen-Neuaufbau.
-- Damit greift die Regel aus CLAUDE.md: Views, deren Basistabelle angefasst
-- wird, werden in DERSELBEN Migration gedroppt und neu angelegt. Sechs der
-- sieben Views haengen an release; ohne vorheriges Droppen scheitert schon das
-- DROP TABLE mit "error in view ...". v_ohne_igdb ist nicht betroffen.
--
-- Zeitpunkt: release hat aktuell null Zeilen. Ab Stufe 5 waere derselbe Umbau
-- ein Kopiervorgang ueber eine gefuellte Tabelle mit neun Fremdschluessel-
-- Beziehungen.
--
-- Die View-Definitionen in Abschnitt 3 sind wortgleich aus Migration 0001
-- uebernommen.

-- ---------------------------------------------------------------------------
-- 1. Abhaengige Views entfernen
--    v_kaufkandidaten zuerst - sie steht auf v_luecken.
-- ---------------------------------------------------------------------------

DROP VIEW v_kaufkandidaten;
DROP VIEW v_review_offen;
DROP VIEW v_erscheint_bald;
DROP VIEW v_backlog_kandidaten;
DROP VIEW v_abweichungen;
DROP VIEW v_luecken;

-- ---------------------------------------------------------------------------
-- 2. release neu aufbauen, CHECK um PSVITA erweitert
-- ---------------------------------------------------------------------------

CREATE TABLE release_neu (
  id            INTEGER PRIMARY KEY,
  game_id       INTEGER NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('PS3','PS4','PS5','PSVITA')),
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

INSERT INTO release_neu SELECT * FROM release;
DROP TABLE release;
ALTER TABLE release_neu RENAME TO release;

-- ---------------------------------------------------------------------------
-- 3. Views wortgleich wiederherstellen
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
