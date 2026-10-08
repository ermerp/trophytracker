← [Inhaltsverzeichnis](README.md)

## 11. Abgeleitete Sichten

Views listen ihre Spalten immer explizit auf, nie `SELECT *`. Bei `SELECT *` wächst die Ergebnismenge nach einem `ADD COLUMN` lautlos mit, während die Definition in `sqlite_master` unverändert bleibt – die einzige Stelle, an der SQLite bei Schemaänderungen still danebengreift.

```sql
-- Use Case 3: Lücken. Digital gespielt, nicht im Regal, Disc-Fassung
-- belegt ('ja') oder unbekannt (Migration 0017, 5.3): Die Ansicht trennt
-- beides; Kaufkandidaten und CSV filtern auf disc_fassung = 'ja'.
CREATE VIEW v_luecken AS
SELECT
  g.id AS game_id, g.title, g.cover_url,
  r.id AS release_id, r.platform, r.physical_release_region,
  r.physical_release_status AS disc_fassung,
  r.physical_source AS disc_quelle,
  t.progress_pct,
  (t.defined_platinum > 0 AND t.earned_platinum > 0) AS hat_platin,
  ps.status AS eigener_status,
  -- Absicht statt Tatsache: Die Luecke bleibt bestehen, ist aber als bewusst
  -- abgelehnt gekennzeichnet (5.3). Die Ansicht blendet sie standardmaessig aus.
  EXISTS (SELECT 1 FROM plan_entry pe WHERE pe.release_id = r.id
            AND pe.kind = 'kauf' AND pe.status = 'verworfen') AS verworfen,
  (SELECT MIN(price_cents) FROM market_offer m
     WHERE m.release_id = r.id AND m.in_stock = 1) AS bester_gebrauchtpreis_cents
FROM trophy_progress t
JOIN release r ON r.id = t.release_id
JOIN game g ON g.id = r.game_id
LEFT JOIN play_status ps ON ps.release_id = r.id
WHERE t.progress_pct > 0
  AND r.physical_release_status IN ('ja', 'unbekannt')
  AND NOT EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id);

-- Use Case 6: Kandidaten für die Kaufliste, noch nicht übernommen
-- (Migration 0018). Zwei Unterabfragen statt eines OR, damit beide über
-- ihren Index laufen (idx_plan_release, idx_plan_game).
CREATE VIEW v_kaufkandidaten AS
SELECT 'luecke' AS quelle, NULL AS plan_id, l.release_id, l.game_id, l.title, l.platform,
       l.cover_url, g.critic_score, 0 AS is_favorite, l.bester_gebrauchtpreis_cents
FROM v_luecken l
JOIN game g ON g.id = l.game_id
-- Nur belegte Luecken. 'offen' schliesst den bereits uebernommenen Kandidaten
-- aus, 'verworfen' den bewusst abgelehnten (5.3).
WHERE l.disc_fassung = 'ja'
  AND NOT EXISTS (
    SELECT 1 FROM plan_entry k WHERE k.release_id = l.release_id
      AND k.kind = 'kauf' AND k.status IN ('offen','verworfen')
  )
UNION ALL
SELECT 'wunsch', pe.id, pe.release_id, g.id, COALESCE(g.title, pe.title_raw), r.platform,
       g.cover_url, g.critic_score, pe.is_favorite, NULL
FROM plan_entry pe
LEFT JOIN release r ON r.id = pe.release_id
LEFT JOIN game g ON g.id = COALESCE(pe.game_id, r.game_id)
WHERE pe.kind = 'wunsch' AND pe.status = 'offen'
  -- Schon auf der Kaufliste (Kopie) oder dort verworfen: kein Kandidat mehr.
  AND NOT EXISTS (
    SELECT 1 FROM plan_entry k WHERE k.release_id = pe.release_id
      AND k.kind = 'kauf' AND k.status IN ('offen','verworfen')
  )
  AND NOT EXISTS (
    SELECT 1 FROM plan_entry k WHERE k.game_id = pe.game_id
      AND k.kind = 'kauf' AND k.status IN ('offen','verworfen')
  )
  -- Angekuendigt ist kein Kaufkandidat (8.4); ein verstrichenes Datum zaehlt als erschienen.
  AND NOT (g.release_status = 'angekuendigt' AND (g.release_date IS NULL OR g.release_date > date('now')));

-- Use Case 8: offene Prüfliste, angereichert für die Anzeige.
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

-- Use Case 12: alles ohne IGDB-Zuordnung, listenübergreifend. `zustand`
-- seit Migration 0012, damit die Ansicht abgelehnte Spiele hinter einem
-- Umschalter halten kann (8.3).
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

-- Use Case 11: vorgemerkte Titel, die noch erscheinen (Migration 0018,
-- datumsbewusst wie v_kaufkandidaten; ohne Datum ans Ende).
CREATE VIEW v_erscheint_bald AS
SELECT g.id AS game_id, g.title, g.cover_url, g.release_date,
       pe.release_id, r.platform,
       pe.id AS plan_id, pe.kind, pe.is_favorite
FROM plan_entry pe
LEFT JOIN release r ON r.id = pe.release_id
JOIN game g ON g.id = COALESCE(pe.game_id, r.game_id)
WHERE pe.status = 'offen'
  AND g.release_status = 'angekuendigt'
  AND (g.release_date IS NULL OR g.release_date > date('now'))
ORDER BY g.release_date IS NULL, g.release_date, g.title;

-- Use Case 5b: Kandidaten für den Backlog – im Besitz, nie angefasst.
-- Die Klammern um das OR sind zwingend: AND bindet stärker, ohne sie würde
-- die Bedingung als "physisch ODER (digital UND alles Übrige)" gelesen, und
-- jedes Release mit einer Disc im Regal wäre Kandidat – auch ein zu 100 %
-- durchgespieltes, das bereits auf einer Liste steht.
-- Seit Migration 0014 mit Spiel-Id, Cover und Wertung für die Anzeige, und
-- 'verworfen' schliesst den als "nicht vorgesehen" abgelehnten Kandidaten
-- aus (5.4) – sonst tauchte er bei jeder Abfrage wieder auf.
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
AND r.id NOT IN (SELECT release_id FROM plan_entry
                 WHERE kind IN ('todo','backlog') AND status IN ('offen','verworfen')
                   AND release_id IS NOT NULL);

-- Trophäen und eigene Bewertung weichen ab. Nicht als Fehler behandeln,
-- nur zur Durchsicht anzeigen.
CREATE VIEW v_abweichungen AS
SELECT g.id AS game_id, r.id AS release_id, g.title, r.platform, t.progress_pct, ps.status
FROM play_status ps
JOIN release r ON r.id = ps.release_id
JOIN game g ON g.id = r.game_id
LEFT JOIN trophy_progress t ON t.release_id = r.id
WHERE (ps.status IN ('durchgespielt','komplettiert') AND COALESCE(t.progress_pct,0) < 20)
   OR (ps.status = 'nicht_gespielt' AND COALESCE(t.progress_pct,0) > 0);
```
