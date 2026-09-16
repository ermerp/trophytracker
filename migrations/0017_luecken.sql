-- Migration 0017: Luecken (Stufe 14, Use Case 3, Abschnitte 5.3 und 11)
--
-- Zwei Views werden neu gefasst, keine Tabelle aendert sich, keine Zeile
-- wird geschrieben.
--
-- v_luecken
--   * `verworfen` (5.3): Ein plan_entry kauf/verworfen am Release sagt
--     "geprueft, physisch nicht gewuenscht". Die Luecke bleibt als Tatsache
--     in der View und wird nur gekennzeichnet; bis hierher stand die Spalte
--     als Unterabfrage im CSV-Export.
--   * `disc_fassung` (Entscheidung des Nutzers vom 16.09.2026, Block B):
--     Die View liefert neben 'ja' auch Releases mit 'unbekannt', damit die
--     Ansicht sie als "moeglicherweise" hinter einem Aufklapper zeigen und
--     dort ja/nein setzen kann. 'nein' bleibt draussen: Das ist ein
--     ausdrueckliches Urteil des Nutzers. Wer die Luecke als Tatsache
--     braucht (Kaufkandidaten, CSV), filtert auf disc_fassung = 'ja'.
--   * `game_id`, `cover_url` fuer die Kacheln.
--
-- v_kaufkandidaten
--   * schliesst verworfene Kaufeintraege aus (5.3: bisher liess ein
--     verworfener Eintrag den Kandidaten wieder auftauchen) und nimmt aus
--     v_luecken nur disc_fassung = 'ja'.
--
-- Beide Unterabfragen auf plan_entry laufen ueber idx_plan_release
-- (Migration 0008), die auf market_offer ueber idx_market_offer_release.
-- v_kaufkandidaten steht auf v_luecken, deshalb zuerst weg.

DROP VIEW v_kaufkandidaten;
DROP VIEW v_luecken;

-- Use Case 3: Luecken. Digital gespielt, nicht im Regal, Disc-Fassung
-- belegt ('ja') oder unbekannt.
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

-- Use Case 6: Kandidaten fuer die Kaufliste, noch nicht uebernommen.
CREATE VIEW v_kaufkandidaten AS
SELECT 'luecke' AS quelle, release_id, title, platform, bester_gebrauchtpreis_cents
FROM v_luecken
-- Nur belegte Luecken; 'offen' schliesst den bereits uebernommenen Kandidaten
-- aus, 'verworfen' den bewusst abgelehnten (5.3).
WHERE disc_fassung = 'ja'
  AND release_id NOT IN (
    SELECT release_id FROM plan_entry
    WHERE kind = 'kauf' AND status IN ('offen','verworfen') AND release_id IS NOT NULL
  )
UNION ALL
SELECT 'wunsch', pe.release_id, COALESCE(g.title, pe.title_raw),
       r.platform, NULL
FROM plan_entry pe
LEFT JOIN release r ON r.id = pe.release_id
LEFT JOIN game g ON g.id = COALESCE(pe.game_id, r.game_id)
WHERE pe.kind = 'wunsch' AND pe.status = 'offen';
