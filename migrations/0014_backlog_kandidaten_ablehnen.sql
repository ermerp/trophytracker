-- Migration 0014: Backlog-Kandidaten ablehnen (Stufe 12)
--
-- Entscheidung des Nutzers vom 15.09.2026: Ein Kandidat fuer den Backlog
-- (im Besitz, nie angefasst) laesst sich als "nicht vorgesehen" ablehnen -
-- ein plan_entry mit kind='backlog' und status='verworfen', dieselbe Form
-- wie bei verworfenen Luecken (5.3). Die View blendet ihn deshalb aus;
-- bisher filterte sie nur auf 'offen', und ein abgelehnter Kandidat taeuchte
-- bei jeder Abfrage wieder auf - dieselbe Korrektur wie bei v_kaufkandidaten.
--
-- Dazu liefert die View Spiel-Id, Cover und Kritikerwertung, damit die
-- Kandidatenliste ohne zweiten Join angezeigt werden kann.
--
-- Datenmigration: Offene To-Do-Eintraege ohne Position - die aus der Triage
-- (Stufe 7) - bekommen eine, in der Reihenfolge ihrer Anlage hinter allen
-- vorhandenen Positionen. Sonst landete der naechste neue Eintrag mit
-- MAX(position) + 1 = 1 VOR ihnen, und "ans Ende" stimmte nicht. Erwartet:
-- danach 0 offene To-Do-Eintraege ohne Position; der Deploy-Job
-- protokolliert die Zahl. UPDATE ... FROM wertet die Unterabfrage einmal
-- vor dem Schreiben aus (SQLite 3.33+).

UPDATE plan_entry SET position = neu.p
FROM (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY id)
           + (SELECT COALESCE(MAX(position), 0) FROM plan_entry WHERE kind = 'todo' AND status = 'offen') AS p
  FROM plan_entry
  WHERE kind = 'todo' AND status = 'offen' AND position IS NULL
) AS neu
WHERE plan_entry.id = neu.id;

-- Views listen ihre Spalten explizit auf.

DROP VIEW v_backlog_kandidaten;

-- Use Case 5b: Kandidaten fuer den Backlog - im Besitz, nie angefasst.
-- Die Klammern um das OR sind zwingend: AND bindet staerker, ohne sie wuerde
-- die Bedingung als "physisch ODER (digital UND alles Uebrige)" gelesen, und
-- jedes Release mit einer Disc im Regal waere Kandidat - auch ein zu 100 %
-- durchgespieltes, das bereits auf einer Liste steht.
CREATE VIEW v_backlog_kandidaten AS
SELECT g.id AS game_id, g.title, g.cover_url, g.critic_score, r.id AS release_id, r.platform
FROM release r
JOIN game g ON g.id = r.game_id
WHERE (EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id)
    OR EXISTS (SELECT 1 FROM digital_entitlement d WHERE d.release_id = r.id))
AND NOT EXISTS (
  SELECT 1 FROM trophy_progress t WHERE t.release_id = r.id AND t.progress_pct > 0
)
AND COALESCE((SELECT status FROM play_status WHERE release_id = r.id),
             'nicht_gespielt') = 'nicht_gespielt'
-- 'offen' schliesst den uebernommenen Kandidaten aus, 'verworfen' den
-- bewusst abgelehnten ("nicht vorgesehen").
AND r.id NOT IN (SELECT release_id FROM plan_entry
                 WHERE kind IN ('todo','backlog') AND status IN ('offen','verworfen')
                   AND release_id IS NOT NULL);
