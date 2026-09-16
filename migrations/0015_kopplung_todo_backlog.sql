-- Migration 0015: Kopplung von To-Do/Backlog und Bewertung (Nachbesserung Stufe 12)
--
-- Entscheidung des Nutzers vom 16.09.2026 (Abschnitt 5.5): Was auf To-Do
-- steht, ist "am Spielen"; was im Backlog steht, ist "pausiert" - und
-- umgekehrt. Ab jetzt halten die Schreibpfade beides zusammen; diese
-- Migration gleicht den Bestand einmalig an, in drei Schritten:
--
--   1. Offene To-Do-Eintraege: play_status wird am_spielen (erwartet 4,
--      alle bisher pausiert aus der Triage).
--   2. Releases mit am_spielen ohne offenen To-Do/Backlog-Eintrag bekommen
--      einen To-Do-Eintrag ans Ende der Liste (erwartet 2).
--   3. Releases mit pausiert ohne offenen Eintrag bekommen einen
--      Backlog-Eintrag (erwartet 1).
--   4. Offene To-Do/Backlog-Eintraege, deren Bewertung durchgespielt,
--      komplettiert oder abgebrochen sagt, werden erledigt (erwartet 0).
--
-- Die Eintraege tragen origin 'triage': Ihre Status kamen aus der Triage.
-- Der Deploy-Job protokolliert danach, wie viele Releases noch abweichen
-- (erwartet 0). Nichts wird geloescht.

UPDATE play_status SET status = 'am_spielen', updated_at = datetime('now')
WHERE status <> 'am_spielen'
  AND release_id IN (SELECT release_id FROM plan_entry
                     WHERE kind = 'todo' AND status = 'offen' AND release_id IS NOT NULL);

INSERT INTO plan_entry (kind, release_id, origin, position)
SELECT 'todo', ps.release_id, 'triage',
       ROW_NUMBER() OVER (ORDER BY ps.release_id)
         + (SELECT COALESCE(MAX(position), 0) FROM plan_entry WHERE kind = 'todo' AND status = 'offen')
FROM play_status ps
WHERE ps.status = 'am_spielen'
  AND NOT EXISTS (SELECT 1 FROM plan_entry pe WHERE pe.release_id = ps.release_id
                    AND pe.kind IN ('todo','backlog') AND pe.status = 'offen');

INSERT INTO plan_entry (kind, release_id, origin)
SELECT 'backlog', ps.release_id, 'triage'
FROM play_status ps
WHERE ps.status = 'pausiert'
  AND NOT EXISTS (SELECT 1 FROM plan_entry pe WHERE pe.release_id = ps.release_id
                    AND pe.kind IN ('todo','backlog') AND pe.status = 'offen');

UPDATE plan_entry SET status = 'erledigt', resolved_at = datetime('now')
WHERE kind IN ('todo','backlog') AND status = 'offen'
  AND release_id IN (SELECT release_id FROM play_status
                     WHERE status IN ('durchgespielt','komplettiert','abgebrochen'));
