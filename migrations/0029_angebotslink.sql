-- Migration 0029: Der Angebotslink in den Listen (Stufe 20e)
--
-- Der Preis ist seit Stufe 20 in Luecken und Kaufliste zu sehen, der Weg zum
-- Angebot aber nur im Spieldetail. Wer in der Liste einen Preis sieht, will
-- ihn nachsehen koennen (Wunsch des Nutzers vom 02.10.2026).
--
-- `market_offer.url` liegt bereits vor; sie fehlt nur in den beiden Views.
-- Eine Spalte an einer View heisst DROP und CREATE - und v_kaufkandidaten
-- liest v_luecken, muss also zuerst weichen (CLAUDE.md).
--
-- Ein eBay-Angebot verschwindet, wenn es verkauft ist. Der Link kann deshalb
-- bis zu eine Auffrischung alt sein und ins Leere fuehren; das laesst sich
-- nicht verhindern, nur beschriften.

DROP VIEW v_kaufkandidaten;
DROP VIEW v_luecken;

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
  -- Haendlerpreis zuerst, breiter Markt als Rueckfall. Zwei LEFT JOINs statt
  -- korrelierter Unterabfragen: Der UNIQUE-Index (release_id, kanal) erlaubt
  -- je Kanal hoechstens eine Zeile, also vervielfacht der Join nichts, und
  -- Preis, Anbieter und Link kommen aus DEMSELBEN Lookup (Messung in 0028).
  COALESCE(mh.price_cents, mm.price_cents) AS bester_gebrauchtpreis_cents,
  COALESCE(mh.anbieter, mm.anbieter) AS gebrauchtpreis_anbieter,
  COALESCE(mh.url, mm.url) AS gebrauchtpreis_url,
  r.markt_geprueft_am,
  r.markt_rohangebote
FROM trophy_progress t
JOIN release r ON r.id = t.release_id
JOIN game g ON g.id = r.game_id
LEFT JOIN play_status ps ON ps.release_id = r.id
LEFT JOIN market_offer mh ON mh.release_id = r.id AND mh.kanal = 'haendler' AND mh.in_stock = 1
LEFT JOIN market_offer mm ON mm.release_id = r.id AND mm.kanal = 'markt' AND mm.in_stock = 1
WHERE t.progress_pct > 0
  AND r.physical_release_status IN ('ja', 'unbekannt')
  AND NOT EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id);

CREATE VIEW v_kaufkandidaten AS
SELECT 'luecke' AS quelle, NULL AS plan_id, l.release_id, l.game_id, l.title, l.platform,
       l.cover_url, g.critic_score, 0 AS is_favorite, l.bester_gebrauchtpreis_cents,
       l.gebrauchtpreis_anbieter, l.gebrauchtpreis_url
FROM v_luecken l
JOIN game g ON g.id = l.game_id
WHERE l.disc_fassung = 'ja'
  AND NOT EXISTS (
    SELECT 1 FROM plan_entry k WHERE k.release_id = l.release_id
      AND k.kind = 'kauf' AND k.status IN ('offen','verworfen')
  )
UNION ALL
SELECT 'wunsch', pe.id, pe.release_id, g.id, COALESCE(g.title, pe.title_raw), r.platform,
       g.cover_url, g.critic_score, pe.is_favorite, NULL, NULL, NULL
FROM plan_entry pe
LEFT JOIN release r ON r.id = pe.release_id
LEFT JOIN game g ON g.id = COALESCE(pe.game_id, r.game_id)
WHERE pe.kind = 'wunsch' AND pe.status = 'offen'
  AND NOT EXISTS (
    SELECT 1 FROM plan_entry k WHERE k.release_id = pe.release_id
      AND k.kind = 'kauf' AND k.status IN ('offen','verworfen')
  )
  AND NOT EXISTS (
    SELECT 1 FROM plan_entry k WHERE k.game_id = pe.game_id
      AND k.kind = 'kauf' AND k.status IN ('offen','verworfen')
  )
  AND NOT (g.release_status = 'angekuendigt' AND (g.release_date IS NULL OR g.release_date > date('now')));
