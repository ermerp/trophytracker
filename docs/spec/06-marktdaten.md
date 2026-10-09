← [Inhaltsverzeichnis](README.md)

## 6. Datenmodell – Marktdaten (Use Case 7)

Die Tabellen sind seit Stufe 1 angelegt und wurden mit Stufe 20 (Gebrauchtpreise) und Stufe 21 (Store-Preise) gefüllt – das Schema stand also vor der Anbindung, die Anbindung war kein Schema-Umbau.

```sql
-- Das günstigste geprüfte Gebrauchtangebot je Release (Stufe 20, Migration 0028).
-- Dreifachnutzen: EAN-Auflösung, Nachweis einer physischen Fassung, Preis.
--
-- Zwei Zeilen je Release, höchstens: `kanal='haendler'` (rebuy/medimops) und
-- `kanal='markt'` (alle Verkäufer). NICHT eine Zeile je Angebot — eBay-Angebote
-- rotieren ständig, Item-Ids wären Wegwerfzeilen, und ihr `in_stock = 1` würde
-- für immer veralten. Der UNIQUE-Index (release_id, kanal) erzwingt die Regel.
CREATE TABLE market_offer (
  id                INTEGER PRIMARY KEY,
  -- Woher die DATEN kommen: 'ebay' für die Browse API, 'rebuy'/'medimops' für
  -- einen Händlerfeed, 'manuell' für einen Handeintrag.
  source            TEXT NOT NULL CHECK (source IN ('rebuy','medimops','manuell','ebay')),
  source_product_id TEXT NOT NULL,
  -- WER verkauft: 'rebuy', 'medimops' oder 'eBay'. Daraus entsteht die
  -- Beschriftung „ab 12,77 € bei rebuy" — ein Angebot, nie ein Wert.
  anbieter          TEXT,
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

CREATE INDEX idx_market_offer_ean ON market_offer(ean);
-- Ersetzt idx_market_offer_release: dieselbe führende Spalte, also kein
-- zusätzlicher Schreibaufwand, und er erzwingt „zwei Zeilen je Release".
CREATE UNIQUE INDEX idx_market_offer_kanal ON market_offer(release_id, kanal);

-- Preisverlauf über beide Kanäle.
-- Wird nur geschrieben, wenn sich der Preis geändert hat.
-- "Kostet 35 EUR" ist keine Entscheidungsgrundlage.
-- "Kostet 35 EUR, lag vor einem Jahr bei 22 EUR" schon.
CREATE TABLE price_snapshot (
  id            INTEGER PRIMARY KEY,
  release_id    INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('psn_store','gebraucht')),
  -- Die Reihe innerhalb des Kanals (Stufe 20e, Migration 0030):
  -- 'haendler' = rebuy/medimops, 'markt' = alle Verkäufer. Getrennt, weil
  -- ein Katalogpreis sich bewusst ändert und ein Marktminimum springt.
  kanal         TEXT,
  source        TEXT NOT NULL,           -- 'psn' | 'rebuy' | 'medimops' | 'ebay'
  condition     TEXT,                    -- nur bei channel='gebraucht'
  price_cents   INTEGER NOT NULL,
  is_sale       INTEGER NOT NULL DEFAULT 0,   -- nur bei channel='psn_store'
  currency      TEXT NOT NULL DEFAULT 'EUR',
  captured_at   TEXT NOT NULL
);

CREATE INDEX idx_price_release ON price_snapshot(release_id, channel, captured_at);
```

Die beiden Kanäle sind nicht vergleichbar und dürfen in der Oberfläche nie zu einem Wert verrechnet werden. Store-Preis heisst "so viel kostet es neu digital", Gebrauchtpreis heisst "so viel verlangt Händler X gerade für die Disc". Beide nebeneinander anzeigen, mit Kanalbezeichnung.

In den Verlauf (`price_snapshot`) kommen seit Stufe 20e **beide Kanäle**, jeder als eigene Reihe (`kanal`); geschrieben wird je Reihe nur bei geändertem Preis. `source` trägt den Anbieter in Kleinschreibung (`rebuy`, `medimops`, `ebay`) und sagt, **wer** das Angebot stellt — er kann innerhalb eines Kanals wechseln und taugt deshalb nicht als Schlüssel der Reihe. Zeilen vom 02.10.2026 tragen noch keinen Kanal: Sie stammen aus dem ersten Durchlauf und sind der angezeigte Preis. Das Diagramm lässt sie weg, statt eine Herkunft zu erfinden (Abschnitt 3). **Angezeigt** wird weiterhin Händler zuerst, sonst Markt.

**Wie schnell der Verlauf wächst** (gemessen am 09.10.2026 über sechs vollständige Tage im
täglichen Takt): **157 Zeilen je Tag** im Kanal `gebraucht` (händler 52, markt 105) und rund **12**
im Store — Store-Preise bewegen sich selten. Der Filter „nur bei Änderung" trägt dabei die
Hauptarbeit: 366 Reihen täglich wären 366 mögliche Zeilen, geschrieben werden 157, die
Änderungsrate liegt also bei **43 %**.

Eine Zeile kostet **118 Byte** — 77 für die Tabelle, 41 für `idx_price_release`; gemessen an
200 000 Zeilen mit diesem Schema in einem Wegwerf-SQLite nach `VACUUM`, nicht geschätzt. Daraus
**7,3 MB im Jahr**, bei einer Datenbank von 8,66 MB. Für D1 ist das belanglos (Free Tier: 5 GB);
es zählt, dass der wöchentliche Dump den Zuwachs dauerhaft in die Historie des
Backup-Repositorys trägt (14.2). **Verdichtet wird deshalb nur beim Lesen** (Entscheidung des
Nutzers vom 09.10.2026) — die Begründung und der Termin, an dem die Frage neu aufgerufen wird,
stehen bei 20f ([16.2](16-2-offene-stufen.md)).

**Der Store-Preis steht in eigenen Spalten an `release`** (Migration 0031, Stufe 21), nicht als Zeile in `market_offer`: `store_price_cents`, `store_base_price_cents`, `store_is_sale`, `store_plus`, `store_produkt_name`, `store_befund` und `store_geprueft_am`, dazu `game.store_concept_id` und `game.store_concept_am`. Ein `kanal = 'store'` in `market_offer` wäre genau die Vermischung, die dieser Abschnitt verbietet – diese Tabelle führt Gebrauchtangebote. Die Historie teilen sich beide in `price_snapshot`, getrennt durch `channel`; der Store hat dort nur eine Reihe, `kanal` bleibt leer. Das Diagramm aus 20f filtert erst nach `channel`, dann nach `kanal`. `store_geprueft_am` trägt einen eigenen Index, weil der nächtliche Schritt in einer Schleife darüber sucht.

An `release` hängen zwei Spalten, die den Befund der Marktsuche festhalten (Migration 0028): `markt_geprueft_am` und `markt_rohangebote`. Zwei statt einer, weil ein Lauf ohne *geprüften* Treffer und ein Lauf ohne ein *einziges* Angebot verschiedene Befunde sind — nur der zweite ist der belastbare Hinweis auf eine reine Download-Fassung (7.3). `markt_geprueft_am` trägt einen eigenen Index, weil der nächtliche Schritt in einer Schleife darüber sucht.
