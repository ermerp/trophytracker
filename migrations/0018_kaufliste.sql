-- Migration 0018: Kaufliste und "Erscheint bald" (Stufe 15, Use Cases 6, 10, 11)
--
-- Zwei Views werden neu gefasst, keine Tabelle aendert sich. Ein UPDATE
-- gleicht den Bestand an die neue Regel an (siehe unten).
--
-- v_kaufkandidaten (Abschnitt 5, Entscheidungen des Nutzers vom 16.09.2026)
--   * Ein Wunsch kommt als KOPIE auf die Kaufliste (neuer kauf-Eintrag mit
--     origin 'wunsch', der Wunsch bleibt offen). Damit er danach nicht
--     Kandidat bleibt, fallen Wuensche mit einem kauf-Eintrag am selben Ziel
--     (offen oder verworfen) heraus - dieselbe Regel wie bei den Luecken.
--   * Angekuendigte Titel sind keine Kandidaten (8.4). Die Bedingung ist
--     datumsbewusst: Ein Spiel, dessen Datum verstrichen ist, zaehlt als
--     erschienen, auch wenn release_status noch nicht umgestellt wurde
--     (das macht "Metadaten auffrischen", taeglich erst der Cron ab Stufe 17).
--   * plan_id, game_id, cover_url, critic_score, is_favorite fuer die Anzeige.
--
-- v_erscheint_bald: game_id, cover_url, release_id, platform fuer die
--   Anzeige; ebenfalls datumsbewusst, sonst stuende ein Titel nach seinem
--   Erscheinen noch unter "bald". Ohne Datum ans Ende.
--
-- Datenmigration: Wer eine Disc oder eine digitale Berechtigung erfasst,
-- hat den Wunsch erfuellt und den Kauf erledigt - ab Stufe 15 schliesst
-- das Erfassen offene wunsch-/kauf-Eintraege am Release und am Spiel
-- automatisch (Abschnitt 5, zweite Ausnahme neben der Kopplung 5.5). Das
-- UPDATE holt den Bestand nach: erwartet 1 Zeile (Anno 117, der Anlass der
-- Entscheidung). Der Deploy-Job protokolliert die verbleibende Zahl
-- (erwartet 0). Nichts wird geloescht.
--
-- Alle Unterabfragen auf plan_entry laufen ueber idx_plan_release und
-- idx_plan_game, die auf physical_copy und digital_entitlement ueber
-- idx_physical_copy_release und idx_digital_release (Migration 0008).

DROP VIEW v_kaufkandidaten;
DROP VIEW v_erscheint_bald;

-- Use Case 6: Kandidaten fuer die Kaufliste, noch nicht uebernommen.
CREATE VIEW v_kaufkandidaten AS
SELECT 'luecke' AS quelle, NULL AS plan_id, l.release_id, l.game_id, l.title, l.platform,
       l.cover_url, g.critic_score, 0 AS is_favorite, l.bester_gebrauchtpreis_cents
FROM v_luecken l
JOIN game g ON g.id = l.game_id
-- Nur belegte Luecken; 'offen' schliesst den bereits uebernommenen Kandidaten
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
  -- Zwei Unterabfragen statt eines OR, damit beide ueber ihren Index laufen.
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

-- Use Case 11: vorgemerkte Titel, die noch erscheinen.
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

-- Bestandsangleich (siehe Kopf): offene Wuensche und Kaeufe an Releases mit
-- Besitz - oder am Spiel eines solchen Releases - sind erledigt.
UPDATE plan_entry SET status = 'erledigt', resolved_at = datetime('now')
WHERE kind IN ('wunsch','kauf') AND status = 'offen'
  AND (release_id IN (SELECT release_id FROM physical_copy
                      UNION SELECT release_id FROM digital_entitlement)
    OR game_id IN (SELECT r.game_id FROM release r
                   WHERE r.id IN (SELECT release_id FROM physical_copy
                                  UNION SELECT release_id FROM digital_entitlement)));
