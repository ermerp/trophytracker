-- Migration 0033: Angebotskorrektur (Stufe 20h, Abschnitte 6 und 7.3)
--
-- Ein untaugliches Angebot laesst sich verwerfen. Beispiel des Nutzers vom
-- 02.10.2026: "11-11: Memories Retold" fuer 6,98 EUR mit "Nur Disc" im
-- Angebotstitel - der Titelabgleich sieht darin keinen Widerspruch, der
-- Mensch sofort.
--
-- NICHTS WIRD GELOESCHT UND NICHTS MARKIERT. Ein Punkt im Preisverlauf ist
-- gestrichen, WEIL seine Angebotskennung auf der Sperrliste des Releases
-- steht - eine Bedingung beim Lesen, kein zweiter gespeicherter Zustand
-- ("Berechnetes nicht speichern"). Drei Folgen:
--
--   * "Rueckgaengig" ist eine geloeschte Zeile in der Sperrliste; alle
--     Punkte sind augenblicklich zurueck. Keine Kopie, keine
--     Sonderbehandlung - und genau das Rueckgaengig, das CLAUDE.md fuer
--     jede halbautomatische Entscheidung verlangt.
--   * price_snapshot bleibt reine anhaengende Historie - dieselbe
--     Eigenschaft, auf der die Entscheidung "Verdichtung nur beim Lesen"
--     ruht (16.2).
--   * Das Diagramm (20f) und der Alarm (20g) muessen den Filter beide
--     anwenden. Das ist die eine Stelle, an der dieser Entwurf teurer ist
--     als ein DELETE; dafuer ist es ein Lookup ueber release_id auf eine
--     Tabelle mit wenigen Zeilen.
--
-- Abwaertskompatibel: ADD COLUMN und eine neue Tabelle. Der alte Worker
-- laeuft waehrend der Migration weiter und liest die neuen Spalten nicht.

-- Die eBay-Angebotskennung (legacyItemId), zwoelfstellig. KEIN UNIQUE-Index:
-- Gemessen am 09.10.2026 ueber die 370 Angebotszeilen der Produktion stehen
-- dort nur 350 verschiedene Kennungen - 20 Angebote sind gleichzeitig das
-- guenstigste fuer ZWEI verschiedene Releases (ein Buendel oder dieselbe
-- Fassung, die auf zwei Plattform-Releases passt; am 11.10.2026 sind es
-- 372 Zeilen auf 357 Kennungen, also 15). Dieselbe Kennung steht damit
-- rechtmaessig in zwei Zeilen.
ALTER TABLE market_offer ADD COLUMN ebay_item_id TEXT;

-- Dieselbe Kennung am Verlaufspunkt. Daran haengt der Filter: Ein Punkt
-- gehoert zu einem Angebot, und ein verworfenes Angebot nimmt seine Punkte
-- mit aus dem Diagramm.
--
-- FUER DIE ALTZEILEN GIBT ES KEINEN BACKFILL - price_snapshot fuehrt keine
-- URL, aus der sich die Kennung ziehen liesse. Die Punkte seit dem 02.10.2026
-- bleiben ohne Kennung und sind nur ueber den Preis zu treffen (1 282 am
-- 09.10.2026, 1 383 am 11.10.2026 - der Bestand waechst taeglich). Das ist kein Fehler, sondern der Stand: Wer sie spaeter
-- leer findet, hat die richtige Datenbank vor sich.
ALTER TABLE price_snapshot ADD COLUMN ebay_item_id TEXT;

-- Die Sperrliste. JE RELEASE, nicht global: Ein Verwerfen fuer das
-- PS4-Release darf dasselbe Angebot beim PS5-Release nicht stillschweigend
-- mitnehmen - der Nutzer hat ueber EINEN Preis entschieden (Befund der
-- 20 doppelten Kennungen oben).
--
-- `titel` und `preis_cents` halten fest, WAS verworfen wurde (Entscheidung
-- des Nutzers vom 09.10.2026). Ohne sie koennte die Ruecknahme nur eine Zahl
-- nennen - die Kennung allein ist nicht lesbar, und "zuruecknehmen" ohne zu
-- sagen, was zurueckkommt, ist keine Korrektur, sondern ein Sprung ins
-- Dunkle. Beide Spalten sind eine Entscheidung des Nutzers, die kein Sync
-- ueberschreibt; deshalb stehen sie hier und nicht in market_offer, deren
-- Zeile der naechste Lauf ueberschreibt.
--
-- Der Primaerschluessel ist zugleich der Index, ueber den der Filter liest -
-- ein zusaetzlicher Index auf release_id waere dieselbe fuehrende Spalte und
-- damit nur Schreibaufwand. KEIN `WITHOUT ROWID`, damit der Export
-- `ORDER BY rowid` behaelt und EXPORT_ORDNUNG unberuehrt bleibt
-- (src/db/export.ts).
CREATE TABLE market_offer_verworfen (
  release_id    INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  ebay_item_id  TEXT NOT NULL,
  titel         TEXT NOT NULL,
  preis_cents   INTEGER NOT NULL,
  verworfen_am  TEXT NOT NULL,
  PRIMARY KEY (release_id, ebay_item_id)
);

-- Backfill der vorhandenen Angebotszeilen aus ihrer URL. Das Praefix
-- `https://www.ebay.de/itm/` ist 24 Zeichen lang, danach steht die Kennung
-- bis zum `?`.
--
-- Der Ausdruck ist zweimal lesend gegen die Produktion geprueft (als SELECT):
-- am 09.10.2026 370 Zeilen, am 11.10.2026 372 - beide Male trifft das Muster
-- ALLE eBay-Zeilen, und alle Kennungen sind zwoelfstellig und reine Ziffern.
-- Kein Sonderfall.
--
-- ERWARTET WIRD DESHALB DIE GLEICHHEIT, nicht die Momentzahl: Jede
-- eBay-Zeile traegt danach eine Kennung. Die Zahl selbst waechst mit jedem
-- Nachtlauf, der ein neues Release erfasst.
--
-- Zeilen ohne `?` in der URL bleiben leer statt falsch: Ein Angebot ohne
-- Kennung ist gueltig, nur nicht verwerfbar (ein Fall fuer NULL).
UPDATE market_offer
   SET ebay_item_id = substr(substr(url, 25), 1, instr(substr(url, 25), '?') - 1)
 WHERE source = 'ebay' AND url LIKE 'https://www.ebay.de/itm/%?%';

-- Die Views muessen mit: Sie zaehlen ihre Spalten auf (nie SELECT *,
-- test/migration.spec.ts haelt die Regel), und die Kennung muss in der
-- Oberflaeche ankommen - ohne sie wuesste der Verwerfen-Knopf nicht, WAS er
-- verwirft. Die beiden ALTER TABLE allein haetten die Views nicht angefasst
-- (Praezedenz: Migration 0010 und 0030); die neuen Spalten tun es.
--
-- v_kaufkandidaten zuerst weg, weil sie auf v_luecken steht - genau das
-- Muster aus Migration 0029.
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
  -- Preis, Anbieter, Link und Kennung kommen aus DEMSELBEN Lookup
  -- (Messung in 0028).
  COALESCE(mh.price_cents, mm.price_cents) AS bester_gebrauchtpreis_cents,
  COALESCE(mh.anbieter, mm.anbieter) AS gebrauchtpreis_anbieter,
  COALESCE(mh.url, mm.url) AS gebrauchtpreis_url,
  COALESCE(mh.ebay_item_id, mm.ebay_item_id) AS gebrauchtpreis_item_id,
  -- Wie viele Angebote fuer dieses Release verworfen sind. Ein korrelierter
  -- COUNT ueber den Primaerschluessel der Sperrliste, nicht ueber einen
  -- Tabellenscan. Er steht hier, damit die Liste sagen kann, WARUM der Preis
  -- fehlt oder hoeher ist - "Gebraucht: unbekannt" ohne Hinweis sieht aus
  -- wie "eBay kennt nichts" und waere genau die Verwechslung, vor der
  -- Abschnitt 3 warnt.
  (SELECT COUNT(*) FROM market_offer_verworfen v WHERE v.release_id = r.id) AS gebrauchtpreis_verworfen,
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
       l.gebrauchtpreis_anbieter, l.gebrauchtpreis_url, l.gebrauchtpreis_item_id,
       l.gebrauchtpreis_verworfen
FROM v_luecken l
JOIN game g ON g.id = l.game_id
WHERE l.disc_fassung = 'ja'
  AND NOT EXISTS (
    SELECT 1 FROM plan_entry k WHERE k.release_id = l.release_id
      AND k.kind = 'kauf' AND k.status IN ('offen','verworfen')
  )
UNION ALL
SELECT 'wunsch', pe.id, pe.release_id, g.id, COALESCE(g.title, pe.title_raw), r.platform,
       g.cover_url, g.critic_score, pe.is_favorite, NULL, NULL, NULL, NULL, 0
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
