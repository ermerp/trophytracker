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
  -- eBays Angebotskennung (`legacyItemId`), zwölfstellig (Stufe 20h,
  -- Migration 0033). KEIN UNIQUE-Index: Gemessen am 09.10.2026 stehen in
  -- 370 Angebotszeilen nur 350 verschiedene Kennungen, am 11.10.2026 in 372
  -- nur 357 — ein Angebot kann gleichzeitig das günstigste für zwei
  -- verschiedene Releases sein.
  ebay_item_id      TEXT,
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
  -- Das Angebot, zu dem dieser Punkt gehört (Stufe 20h, Migration 0033).
  -- Daran hängt der Filter der verworfenen Angebote. Die Punkte seit dem
  -- 02.10.2026 bleiben leer: `price_snapshot` führt keine URL, aus der die
  -- Kennung nachzutragen wäre (1 383 am 11.10.2026).
  ebay_item_id  TEXT,
  captured_at   TEXT NOT NULL
);

CREATE INDEX idx_price_release ON price_snapshot(release_id, channel, captured_at);

-- Verworfene Angebote (Stufe 20h, Migration 0033). Je Release, nicht global:
-- Ein Verwerfen für das PS4-Release darf dasselbe Angebot beim PS5-Release
-- nicht mitnehmen — der Nutzer hat über EINEN Preis entschieden.
--
-- `titel` und `preis_cents` halten fest, WAS verworfen wurde (Entscheidung
-- des Nutzers vom 11.10.2026): Die Kennung allein ist nicht lesbar, und
-- „zurücknehmen", ohne zu sagen, was zurückkommt, ist keine Korrektur. Sie
-- stehen hier und nicht in `market_offer`, deren Zeile der nächste Lauf
-- überschreibt.
--
-- Der Primärschlüssel ist zugleich der Index, über den der Filter liest.
-- Kein `WITHOUT ROWID`, damit der Export `ORDER BY rowid` behält (14.2).
CREATE TABLE market_offer_verworfen (
  release_id    INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  ebay_item_id  TEXT NOT NULL,
  titel         TEXT NOT NULL,
  preis_cents   INTEGER NOT NULL,
  verworfen_am  TEXT NOT NULL,
  PRIMARY KEY (release_id, ebay_item_id)
);
```

### Ein Punkt wird gestrichen, nicht gelöscht (Stufe 20h)

Ein untaugliches Angebot lässt sich verwerfen — der Fall des Nutzers vom 02.10.2026 war
*11-11: Memories Retold* für 6,98 € mit „Nur Disc" im Angebotstitel. **Gelöscht wird dabei
nichts.** Ein Punkt ist gestrichen, *weil* seine Angebotskennung auf der Sperrliste des
Releases steht: eine Bedingung beim Lesen, kein zweiter gespeicherter Zustand („Berechnetes
nicht speichern"). Drei Folgen:

- **„Rückgängig" ist eine gelöschte Zeile in der Sperrliste**; alle Punkte sind augenblicklich
  zurück. Keine Kopie, keine Sonderbehandlung.
- `price_snapshot` bleibt reine anhängende Historie — dieselbe Eigenschaft, auf der die
  Entscheidung „Verdichtung nur beim Lesen" ruht.
- **Das Diagramm (20f) wendet den Filter an, der Alarm (20g) muss es ebenso.** Das ist die
  eine Stelle, an der dieser Entwurf teurer ist als ein `DELETE`; dafür ist es ein Lookup über
  `release_id` auf eine Tabelle mit wenigen Zeilen (gemessen: 60 gelesene Zeilen für eine
  Portion von 20 Releases).

**Was das Rückgängig nicht kann:** Nach dem Verwerfen läuft derselbe Neuabruf wie im Cron. War
das verworfene das einzige Angebot, setzt er `in_stock = 0`, und der Preis steht als
„unbekannt" da. Die Rücknahme holt ihn zurück, **sofern eBay das Angebot noch führt** — ist es
inzwischen verkauft, bleibt es fort. Das ist keine Lücke im Rückgängig, sondern die Grenze
einer Fremdquelle: Ein Preis, den niemand mehr anbietet, würde sonst erfunden.

### Der Verlauf als Diagramm (Stufe 20f)

`GET /api/releases/:id/preise` ([12](12-api-routen-extern-und-sync.md)) ist die **einzige**
lesende Route auf `price_snapshot`; bis Stufe 20f wurde die Tabelle nur geschrieben und
exportiert. Sie liefert eine flache Liste von Punkten und `bis`, den Zeitstempel des
**Servers** – die letzte Stufe der Treppe läuft bis dorthin, und eine falsch gestellte Uhr des
Geräts zöge sie sonst in die Zukunft.

**Gezeichnet wird eine Treppe, keine Linie von Punkt zu Punkt** (Entscheidung des Nutzers vom
11.10.2026): Geschrieben wird nur bei Änderung, zwischen zwei Punkten gilt der alte Preis
weiter. Deshalb liefert ein Eimer den **letzten** Stand, nicht sein Tief – was im SQL daran
hängt, dass `MAX(captured_at)` das **einzige** min/max-Aggregat ist. Nur dann garantiert
SQLite, dass die nackten Spalten aus eben dieser Zeile stammen; ein zweites Aggregat
verfälscht die Treppe still (nachgewiesen am 11.10.2026, indem der Defekt absichtlich
eingebaut wurde).

**Ein Diagramm je Kanal, übereinander**, mit gemeinsamer Zeit- und eigener Preisachse. Mit
einer gemeinsamen Preisachse wurden Händler und Markt zu einem flachen Strich am unteren Rand,
sobald der Store weit darüber liegt (12,16 € gegen 69,99 € bei *Tales of Arise*) – im
Prototyp vom 11.10.2026 gesehen, nicht im Code. Händler und Markt teilen sich eine Achse:
derselbe Kanal, sie sollen vergleichbar liegen.

**Der Filter der verworfenen Angebote hat zwei Zweige.** Der erste trifft die Angebotskennung.
Der zweite ist ein begrenzter Rückfall: Ein Punkt **ohne** Kennung im Kanal `gebraucht` wird
gestrichen, wenn sein Preis einem verworfenen Preis desselben Releases gleicht. Ohne ihn
bliebe genau der Fall stehen, der Stufe 20h ausgelöst hat – `ebay_item_id` kam mit Migration
0033 ohne Backfill, die **1 383 Punkte davor tragen keine Kennung** (4 von 4 danach tragen
eine). Am 11.10.2026 trifft der zweite Zweig **genau einen Punkt**. **Restrisiko, ausdrücklich:**
Ein Altpunkt mit zufällig gleichem Preis aus einem anderen Angebot verschwindet mit. Als
Lesebedingung ist der Zweig jederzeit zurücknehmbar; trägt jeder neue Punkt eine Kennung, kann
er ohne Verlust entfallen.

**Verdichtet wird beim Lesen**, in SQL: tageweise innerhalb von 90 Tagen, davor auf den Montag
der Woche. Beide Stufen liefern ein Datum als Schlüssel. Gemessen am 11.10.2026 ist die
Verdichtung **noch untätig** – die größte Reihe hat 7 Punkte, im Mittel sind es 2,06 über 672
Reihen –; die Wochenstufe greift erstmals im Januar 2027. Lesekosten: **1 129 Zeilen** für ein
Release mit 450 Punkten und einer Sperrliste von 40 Zeilen, **2 Zeilen** für ein Release ohne
Punkte (`test/lesekosten.spec.ts`). Die Route läuft nur im Spieldetail, auf Klick, nie im Cron.

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
