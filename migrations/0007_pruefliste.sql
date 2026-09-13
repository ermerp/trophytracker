-- Migration 0007: Pruefliste (Stufe 7, Use Case 8)
--
-- 1. v_review_offen bekommt game_id, Bild und Trophaeenverteilung, damit die
--    Pruefliste "ein Spiel pro Bildschirm" ohne zweite Abfrage zeichnen kann.
--    View gedroppt und neu angelegt, Spalten explizit.
--
-- 2. Bestand einreihen (Abschnitt 8.1): Jede zugeordnete Trophaeenliste, die
--    noch nie durchgesehen wurde (reviewed_at IS NULL), kommt als
--    'erstimport' in die Warteschlange. Releases, deren Status seit Stufe 6
--    von Hand gesetzt wurde, tragen reviewed_at und fallen heraus.
--    Dieselbe Regel laeuft danach im Code (ReviewRepository.einreihen) am
--    Ende jeder Normalisierung und nach jeder Zuordnung; diese Migration
--    holt nur den Bestand nach. Der Deploy-Job protokolliert die Zeilenzahl.

DROP VIEW v_review_offen;

-- Use Case 8: offene Pruefliste, angereichert fuer die Anzeige.
CREATE VIEW v_review_offen AS
SELECT rq.reason, rq.detail, rq.enqueued_at,
       g.id AS game_id, g.title, g.cover_url,
       r.id AS release_id, r.platform,
       t.icon_url, t.progress_pct, t.last_played_at,
       (t.defined_platinum > 0 AND t.earned_platinum > 0) AS hat_platin,
       t.defined_bronze, t.defined_silver, t.defined_gold, t.defined_platinum,
       t.earned_bronze, t.earned_silver, t.earned_gold, t.earned_platinum,
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

INSERT OR IGNORE INTO review_queue (release_id, reason)
SELECT t.release_id, 'erstimport'
FROM trophy_progress t
WHERE t.release_id IS NOT NULL AND t.reviewed_at IS NULL;
