-- Migration 0028: Gebrauchtpreise und Disc-Nachweis aus eBay (Stufe 20, 7.3)
--
-- Abschnitt 7.3 hat fuer Use Case 7 einen AWIN-Haendlerfeed (rebuy, medimops)
-- vorgesehen. Der Weg ist am 02.10.2026 verworfen worden, und nicht aus
-- Bequemlichkeit: Das Bewerbungsformular verlangt die URL, auf der Affiliate
-- Marketing betrieben wird, jeder Haendler gibt seinen Feed einzeln frei -
-- und AWIN schliesst ein Publisher-Konto, dem binnen zwei Jahren keine
-- Provision gutgeschrieben wurde. Bei dieser Anwendung wird nie eine
-- gutgeschrieben; der Zugang haette ein eingebautes Ablaufdatum gehabt.
--
-- Stattdessen: Beide Haendler verkaufen ihren Bestand selbst ueber eBay
-- ('rebuy-shop', 'medimops_shop'), und die eBay Browse API laeuft seit Stufe
-- 17c live im Worker. Dieselben Haendler, dieselben Zustandsstufen, dieselben
-- Preise - ueber eine offizielle Schnittstelle.
--
-- VOR DEM BAUEN GEMESSEN (02.10.2026, 980 Abfragen ueber alle 490 Releases,
-- nur Zahlen ins Repository):
--
--   - Preis fuer 293 von 490 Releases, davon 120 von rebuy oder medimops.
--   - Gegenprobe: Von 235 durch IGDB belegten Discs findet eBay 224 (95 %).
--     Deshalb ist das AUSBLEIBEN eines Angebots aussagekraeftig - nur 8 von
--     235 belegten Discs haben gar kein Angebot (3 %). Das ist der Hinweis
--     fuer Block B der Lueckenansicht (5.3); ein `nein` setzt weiterhin
--     ausschliesslich der Nutzer (Abschnitt 3).
--   - Ohne Titelabgleich waere der roh guenstigste Treffer in 21 % der Faelle
--     ein anderes Spiel. eBays Relevanzsortierung ist keine Zuordnung.
--   - Wikidata (`P437`) ist als Quelle fuer "nur digital" VERWORFEN: 48 der
--     235 belegten Discs fuehrt es als "nur digital" - 20 % Fehlrate.
--
-- Zwei Zeilen je Release, hoechstens: der guenstigste geprueffte Treffer bei
-- den Haendlern und der im breiten Markt. Nicht eine Zeile je Angebot -
-- eBay-Angebote rotieren staendig, Item-Ids waeren Wegwerfzeilen, und ihr
-- `in_stock = 1` wuerde fuer immer veralten.

-- Woher der Disc-Nachweis kommt und was dabei herauskam. Zwei Spalten statt
-- einer: Ein Lauf ohne Treffer und ein Lauf ohne ein einziges Angebot sind
-- verschiedene Befunde, und nur der zweite ist der starke Hinweis (3 %).
ALTER TABLE release ADD COLUMN markt_geprueft_am TEXT;
ALTER TABLE release ADD COLUMN markt_rohangebote INTEGER;

-- Die Spalte, ueber die der Schritt in einer Schleife sucht - und damit nach
-- CLAUDE.md indexpflichtig, obwohl sie kein Fremdschluessel ist (dieselbe
-- Lehre wie bei game.sort_title, Migration 0025). Gemessen am 02.10.2026:
-- Die Auswahl las ueber v_luecken 3 424 Zeilen, um zehn Releases zu finden;
-- mit diesem Index sind es rund 60. SQLite sortiert NULL in ASC nach vorne,
-- also liefert ORDER BY markt_geprueft_am die ungeprueften von selbst zuerst
-- und kann nach LIMIT abbrechen.
CREATE INDEX idx_release_markt ON release(markt_geprueft_am);

-- Die Views stehen auf market_offer und muessen vor dem Neuaufbau weg
-- (CLAUDE.md): Ein Tabellen-Neuaufbau scheitert sonst mit "error in view".
-- v_kaufkandidaten zuerst - sie liest v_luecken.
DROP VIEW v_kaufkandidaten;
DROP VIEW v_luecken;

-- Neuaufbau: `source` nimmt 'ebay' auf, dazu `kanal` und `anbieter`.
CREATE TABLE market_offer_neu (
  id                INTEGER PRIMARY KEY,
  -- Woher die DATEN kommen: ein Haendlerfeed hiesse 'rebuy'/'medimops',
  -- die Browse API heisst 'ebay'. 'manuell' bleibt fuer Handeintraege.
  source            TEXT NOT NULL CHECK (source IN ('rebuy','medimops','manuell','ebay')),
  source_product_id TEXT NOT NULL,
  -- WER verkauft - 'rebuy', 'medimops' oder 'eBay'. Daraus entsteht die
  -- Beschriftung "ab 12,77 EUR bei rebuy"; sie sagt Angebot, nie Wert
  -- (Abschnitt 6 und die Risikozeile zum Haendlerpreis).
  anbieter          TEXT,
  -- 'haendler' = nur rebuy/medimops, 'markt' = alle Verkaeufer. NULL bei
  -- einer Zeile, die nicht aus der eBay-Suche stammt.
  kanal             TEXT CHECK (kanal IN ('haendler','markt')),
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

INSERT INTO market_offer_neu
  (id, source, source_product_id, anbieter, kanal, ean, title_raw, platform_raw,
   condition, price_cents, currency, in_stock, url, imported_at, release_id)
SELECT id, source, source_product_id, NULL, NULL, ean, title_raw, platform_raw,
       condition, price_cents, currency, in_stock, url, imported_at, release_id
FROM market_offer;

DROP TABLE market_offer;
ALTER TABLE market_offer_neu RENAME TO market_offer;

-- Stufe 2 der Barcode-Kette sucht ueber die EAN (9.2).
CREATE INDEX idx_market_offer_ean ON market_offer(ean);
-- Ersetzt idx_market_offer_release: dieselbe fuehrende Spalte, also kein
-- zusaetzlicher Schreibaufwand, und er erzwingt zugleich die Regel "zwei
-- Zeilen je Release, hoechstens". NULL-kanal bleibt mehrfach erlaubt -
-- SQLite behandelt NULLs in einem UNIQUE-Index als verschieden, ein
-- Haendlerfeed koennte also weiter viele Zeilen je Release halten.
CREATE UNIQUE INDEX idx_market_offer_kanal ON market_offer(release_id, kanal);

-- Use Case 3: Luecken. Digital gespielt, nicht im Regal, Disc-Fassung
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
  -- Haendlerpreis zuerst, breiter Markt als Rueckfall (Entscheidung des
  -- Nutzers vom 02.10.2026). Zwei LEFT JOINs statt korrelierter
  -- Unterabfragen: Der UNIQUE-Index (release_id, kanal) erlaubt je Kanal
  -- hoechstens eine Zeile, also vervielfacht der Join nichts - und Preis und
  -- Anbieter kommen aus DEMSELBEN Lookup. Gemessen am 02.10.2026 gegen 430
  -- Listen und 688 Angebotszeilen: mit korrelierten Unterabfragen 5 712
  -- gelesene Zeilen, mit diesen Joins 3 497. Bei leerer Tabelle sind es 2 194
  -- gegen 2 620 der alten Fassung mit MIN() - die Ansicht ist damit billiger
  -- als VOR dieser Stufe.
  COALESCE(mh.price_cents, mm.price_cents) AS bester_gebrauchtpreis_cents,
  COALESCE(mh.anbieter, mm.anbieter) AS gebrauchtpreis_anbieter,
  -- Begruendung fuer Block B: wann zuletzt gesucht wurde und ob eBay in der
  -- Plattform-Kategorie ueberhaupt etwas kennt. 0 Rohangebote ist der starke
  -- Hinweis auf eine reine Download-Fassung (3 % Fehlrate, gemessen).
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

-- Use Case 6: Kandidaten für die Kaufliste, noch nicht übernommen
-- (Migration 0018). Zwei Unterabfragen statt eines OR, damit beide über
-- ihren Index laufen (idx_plan_release, idx_plan_game).
CREATE VIEW v_kaufkandidaten AS
SELECT 'luecke' AS quelle, NULL AS plan_id, l.release_id, l.game_id, l.title, l.platform,
       l.cover_url, g.critic_score, 0 AS is_favorite, l.bester_gebrauchtpreis_cents,
       l.gebrauchtpreis_anbieter
FROM v_luecken l
JOIN game g ON g.id = l.game_id
WHERE l.disc_fassung = 'ja'
  AND NOT EXISTS (
    SELECT 1 FROM plan_entry k WHERE k.release_id = l.release_id
      AND k.kind = 'kauf' AND k.status IN ('offen','verworfen')
  )
UNION ALL
SELECT 'wunsch', pe.id, pe.release_id, g.id, COALESCE(g.title, pe.title_raw), r.platform,
       g.cover_url, g.critic_score, pe.is_favorite, NULL, NULL
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
