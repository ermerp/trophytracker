-- Migration 0013: Favorit statt Prioritaet, kein Rang (Nachbesserung Stufe 11)
--
-- Entscheidung des Nutzers vom 15.09.2026: Die Prioritaet 1-5 ist unnoetig,
-- Favorit oder nicht reicht; damit entfaellt die Rangformel und mit ihr die
-- Gewichte in app_setting. Die Wunschliste sortiert stattdessen Favoriten
-- zuerst, dann nach Kritikerwertung (Abschnitt 5.2).
--
-- DROP COLUMN scheitert in SQLite, solange eine View die Tabelle referenziert
-- ("error in view", CLAUDE.md). Deshalb werden alle Views auf plan_entry
-- vorher gedroppt und danach wortgleich neu angelegt: v_kaufkandidaten,
-- v_erscheint_bald, v_backlog_kandidaten, v_ohne_igdb. idx_plan_offen
-- (kind, status, position) ist nicht betroffen.
--
-- Datenmigration: vier Zeilen aus app_setting (w_critic, w_priority,
-- w_favorite, w_price). Der Deploy-Job protokolliert die verbleibende
-- Anzahl (erwartet 0). Die Prioritaetswerte selbst gehen verloren - das ist
-- die Entscheidung.

DROP VIEW v_kaufkandidaten;
DROP VIEW v_erscheint_bald;
DROP VIEW v_backlog_kandidaten;
DROP VIEW v_ohne_igdb;

ALTER TABLE plan_entry DROP COLUMN priority;

DELETE FROM app_setting WHERE key IN ('w_critic', 'w_priority', 'w_favorite', 'w_price');

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

-- Use Case 12: alles ohne IGDB-Zuordnung, listenuebergreifend (Migration 0012).
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
