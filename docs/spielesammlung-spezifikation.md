# Spielesammlung – Technische Spezifikation

*Version 6 – Repository-Aufteilung, automatisches Deployment, Zugriffsschutz über Cloudflare Access.*

## 1. Use Cases

| # | Use Case | Abgedeckt durch |
|---|---|---|
| 1 | Spielesammlung verwalten | `game`, `release`, `physical_copy`, `digital_entitlement` |
| 2 | Fortschritt verfolgen – über Trophäen und eigene Bewertung | `trophy_progress` + `play_status` |
| 3 | Lücken erkennen: bisher nur digital, Disc existiert | `release.physical_release_status`, `v_luecken` |
| 4 | Wunschliste | `plan_entry` mit `kind = 'wunsch'` |
| 5a | To-Do: was spiele ich als nächstes (kurz, geordnet) | `plan_entry` mit `kind = 'todo'` |
| 5b | Backlog / Pile of Shame: irgendwann mal | `plan_entry` mit `kind = 'backlog'` |
| 6 | Kaufliste aus Lücken und Wunschliste | `plan_entry` mit `kind = 'kauf'`, gespeist aus `v_kaufkandidaten` |
| 7 | Preise: PSN Store für digital, Gebrauchtmarkt für physisch | `price_snapshot.channel`, `market_offer` |
| 8 | Prüfliste: Trophäen-Bestand durchgehen, erstmalig und bei Änderungen | `review_queue` |
| 9 | Wunschlisten aus Textdateien importieren | Import-Ansicht, `plan_entry.origin = 'import'` |
| 10 | Kritikerwertung und eigene Priorität zu einem Rang verrechnen | `game.critic_score`, `plan_entry.priority`, Rangformel |
| 11 | Noch nicht erschienene Titel vormerken | `game.release_status`, `v_erscheint_bald` |
| 12 | Lückenhafte Metadaten nachpflegen | `v_ohne_igdb` |
| 13 | Datenbestand sichern und exportieren | Abschnitt 14 |
| 14 | Projekt öffentlich teilen, Daten privat halten | Abschnitt 15 |

**Zwei Designprinzipien, die sich durch das ganze Modell ziehen**

*Besitz, Fortschritt und Absicht sind unabhängige Achsen.* Keines ist ein Zustand des anderen. Ein Spiel kann physisch vorliegen, digital gespielt worden sein und trotzdem auf der Kaufliste stehen (andere Plattform). Wer das als ein Statusfeld modelliert, baut spätestens beim dritten Sonderfall um.

*Fremddaten und eigene Bewertung werden nie vermischt.* Trophäen kommen von Sony und werden bei jedem Sync überschrieben. `play_status` ist deine Einschätzung und wird von keinem automatischen Prozess angefasst. Die Oberfläche zeigt beides nebeneinander.

---

## 2. Stack

| Komponente | Technologie |
|---|---|
| Backend | Cloudflare Worker, TypeScript, Hono |
| Datenbank | Cloudflare D1 (SQLite) |
| Frontend | React + Vite + TypeScript, als PWA |
| Hosting Frontend | Cloudflare Pages |
| Geplanter Sync | Cloudflare Cron Trigger |
| Feed-Import | GitHub Action (siehe 7.3) |
| Deployment/CLI | Wrangler |
| PSN-Trophäen | `psn-api` (npm) oder direkte fetch-Aufrufe |
| Metadaten/Cover | IGDB API (kostenlos über Twitch-Client-ID) |
| Gebrauchtpreise *(optional)* | rebuy / medimops Produktdatenfeed über AWIN |
| Store-Preise *(optional)* | PSN Store Katalog-Endpunkte |

Migrations über Wrangler D1 Migrations. Repository auf GitHub, Pages baut bei Push automatisch.

**Hinweis zur CPU-Grenze:** Der Free Tier begrenzt auf 10 ms CPU pro Aufruf. D1-Abfragen und Netzwerk-Wartezeit zählen nicht mit, nur Rechenzeit im Worker selbst. Die zusätzlichen Views sind daher unkritisch. Kritisch bleibt ausschliesslich das Parsen grosser Fremddaten – siehe 7.3.

---

## 3. Datenmodell – Sammlung

```sql
-- Das Spiel als Konzept, plattformunabhängig ("Bloodborne")
CREATE TABLE game (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  sort_title    TEXT NOT NULL,
  cover_url     TEXT,
  igdb_id       INTEGER,

  -- Use Case 11: unveröffentlichte Titel dürfen auf die Wunschliste.
  release_date   TEXT,                  -- ISO, kann in der Zukunft liegen
  release_status TEXT NOT NULL DEFAULT 'unbekannt'
                 CHECK (release_status IN ('erschienen','angekuendigt','unbekannt')),

  -- Use Case 10: Kritikerwertung. Bestandteile speichern, nie den fertigen Rang.
  critic_score       INTEGER,           -- 0-100
  critic_score_count INTEGER,           -- Anzahl eingeflossener Reviews
  critic_source      TEXT,              -- 'igdb' | 'opencritic' | 'manuell'
  critic_updated_at  TEXT,

  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ein Spiel auf einer konkreten Plattform.
-- Zwingend getrennt: GTA V existiert auf PS3, PS4 und PS5
-- mit je eigener Trophäenliste und eigenem Preis.
CREATE TABLE release (
  id            INTEGER PRIMARY KEY,
  game_id       INTEGER NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('PS3','PS4','PS5')),
  edition       TEXT,
  region        TEXT,

  -- Use Case 3: existiert eine Disc-Fassung?
  -- Dreiwertig. NIEMALS Boolean: bei fehlenden Daten würde die App
  -- "gibt es nicht" behaupten und genau die gesuchten Spiele verstecken.
  physical_release_status TEXT NOT NULL DEFAULT 'unbekannt'
                          CHECK (physical_release_status IN ('ja','nein','unbekannt')),
  physical_release_region TEXT,
  physical_source         TEXT,          -- 'feed' | 'manuell' | 'igdb'
  physical_checked_at     TEXT,

  psn_product_id          TEXT,          -- für Store-Preisabfrage (Use Case 7)

  UNIQUE (game_id, platform, edition, region)
);

CREATE TABLE physical_copy (
  id            INTEGER PRIMARY KEY,
  release_id    INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  ean           TEXT,
  condition     TEXT CHECK (condition IN ('neu','sehr gut','gut','akzeptabel')),
  has_manual    INTEGER NOT NULL DEFAULT 0,
  purchase_date TEXT,
  purchase_price_cents INTEGER,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Quelle unterscheiden: PS-Plus-Zugriff ist kein dauerhafter Besitz.
CREATE TABLE digital_entitlement (
  id            INTEGER PRIMARY KEY,
  release_id    INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  source        TEXT NOT NULL CHECK (source IN ('kauf','plus','trial','sonstiges')),
  acquired_at   TEXT,
  UNIQUE (release_id, source)
);
```

---

## 4. Datenmodell – Fortschritt (Use Case 2)

### 4.1 Trophäen: Fremddaten

```sql
CREATE TABLE trophy_progress (
  np_communication_id TEXT PRIMARY KEY,
  np_service_name     TEXT NOT NULL,     -- 'trophy' (PS3/PS4/Vita) | 'trophy2' (PS5)
  title_name          TEXT NOT NULL,
  platform            TEXT NOT NULL,
  icon_url            TEXT,

  defined_bronze      INTEGER NOT NULL DEFAULT 0,
  defined_silver      INTEGER NOT NULL DEFAULT 0,
  defined_gold        INTEGER NOT NULL DEFAULT 0,
  defined_platinum    INTEGER NOT NULL DEFAULT 0,

  earned_bronze       INTEGER NOT NULL DEFAULT 0,
  earned_silver       INTEGER NOT NULL DEFAULT 0,
  earned_gold         INTEGER NOT NULL DEFAULT 0,
  earned_platinum     INTEGER NOT NULL DEFAULT 0,

  progress_pct        INTEGER NOT NULL DEFAULT 0,
  last_played_at      TEXT,
  synced_at           TEXT NOT NULL,

  -- Referenzstand der letzten Durchsicht. Grundlage der Änderungserkennung.
  -- Bewusst gegen den letzten *geprüften* Stand verglichen, nicht gegen den
  -- letzten Sync: sonst gehen Änderungen verloren, die sich über mehrere
  -- Syncs zwischen zwei Durchsichten ansammeln.
  reviewed_earned_total   INTEGER,
  reviewed_defined_total  INTEGER,
  reviewed_at             TEXT,

  release_id          INTEGER REFERENCES release(id) ON DELETE SET NULL
);

CREATE INDEX idx_trophy_unmatched ON trophy_progress(release_id) WHERE release_id IS NULL;
```

**Platin-Logik:** `defined_platinum > 0 AND earned_platinum > 0`.
Die Prüfung auf `defined_platinum > 0` ist zwingend – viele PS3-Titel und kleinere Spiele haben gar keine Platin-Trophäe und würden sonst dauerhaft als "Platin offen" erscheinen.

### 4.2 Eigene Bewertung

```sql
-- Deine Einschätzung. Wird ausschliesslich manuell gesetzt.
-- Ein Spiel kann Platin haben und trotzdem 'abgebrochen' sein.
CREATE TABLE play_status (
  release_id    INTEGER PRIMARY KEY REFERENCES release(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN (
                  'nicht_gespielt','am_spielen','pausiert',
                  'durchgespielt','komplettiert','abgebrochen',
                  'unentschieden'          -- in der Triage bewusst übersprungen
                )),
  started_at    TEXT,
  finished_at   TEXT,
  rating        INTEGER CHECK (rating BETWEEN 1 AND 10),
  notes         TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Regeln für den Sync:**

Es gibt genau zwei Automatiken, und sie greifen **ausschliesslich beim allerersten Import** eines Titels, also solange keine `play_status`-Zeile existiert:

1. `progress_pct = 100` → `komplettiert`
2. `progress_pct > 0` → `am_spielen`

**Danach ändert kein automatischer Prozess je wieder einen Status.** Jede spätere Trophäenänderung wandert in die Prüfliste (Abschnitt 8) und wartet auf deine Entscheidung. Auch der Fall "war 100 %, ist durch ein neues DLC nur noch 80 %" führt nicht zu einer stillen Statusänderung – er wird vorgelegt.

**Warum 100 % und nicht Platin:** Platin wird bei den meisten Titeln für das Grundspiel vergeben; DLC-Trophäen zählen nicht hinein. Platin ist damit kein Beleg dafür, dass ein Spiel fertig ist. 100 % ist einer. Deshalb ist Platin nur eine Anzeige, keine Statusquelle.

`komplettiert` und `durchgespielt` gelten in allen Listen und Auswertungen gleichermassen als erledigt. Der Unterschied ist rein beschreibend.

Alle übrigen Abweichungen zwischen Trophäen und Bewertung werden angezeigt, nicht korrigiert. `durchgespielt` bei 20 % Trophäenfortschritt ist ein gültiger Zustand – Story beendet, Sammelaufgaben liegen gelassen.

---

## 5. Datenmodell – Absichten (Use Cases 4, 5, 6)

Wunschliste, To-Do, Backlog und Kaufliste sind strukturell identisch: eine geordnete Liste von Spielen mit einer Absicht. Sie liegen deshalb in **einer** Tabelle mit Typ-Feld.

**To-Do und Backlog sind bewusst getrennt.** To-Do ist die kurze, manuell sortierte Liste "das spiele ich als nächstes"; Backlog ist der ungeordnete Haufen "irgendwann mal". Zusammengelegt verliert die To-Do-Liste genau die Eigenschaft, die sie nützlich macht – ihre Kürze.

Der Grund ist nicht Sparsamkeit, sondern der Lebenszyklus. Ein Spiel wandert typischerweise Wunsch → Kauf → Backlog → erledigt. Bei drei Tabellen ist jeder Übergang ein Löschen-und-Neuanlegen mit eigener Logik, und die Historie geht verloren. Hier ist es ein Feld-Update.

```sql
CREATE TABLE plan_entry (
  id            INTEGER PRIMARY KEY,

  kind          TEXT NOT NULL CHECK (kind IN ('wunsch','todo','backlog','kauf')),

  -- Absteigende Konkretheit. Mindestens eines muss gesetzt sein.
  release_id    INTEGER REFERENCES release(id) ON DELETE CASCADE,
  game_id       INTEGER REFERENCES game(id) ON DELETE CASCADE,
  title_raw     TEXT,                    -- freie Eingabe, Spiel noch nicht angelegt

  position      INTEGER,                 -- manuelle Reihenfolge, für To-Do zentral
  priority      INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  is_favorite   INTEGER NOT NULL DEFAULT 0,   -- der persönliche Anker, s.u.
  note          TEXT,

  origin        TEXT CHECK (origin IN ('luecke','wunsch','manuell','import','triage')),

  status        TEXT NOT NULL DEFAULT 'offen'
                CHECK (status IN ('offen','erledigt','verworfen')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at   TEXT,

  CHECK (release_id IS NOT NULL OR game_id IS NOT NULL OR title_raw IS NOT NULL)
);

CREATE INDEX idx_plan_offen ON plan_entry(kind, status, position);
```

**Übergänge**

| Von | Auslöser | Nach |
|---|---|---|
| `wunsch` | auf Kaufliste gesetzt | `kauf`, `origin='wunsch'` |
| Lücke (abgeleitet) | auf Kaufliste gesetzt | `kauf`, `origin='luecke'` |
| `kauf` | `physical_copy` oder `digital_entitlement` angelegt | `status='erledigt'`, optional neuer `todo`- oder `backlog`-Eintrag |
| `backlog` | hochgezogen | `todo`, mit `position` |
| `todo` / `backlog` | `play_status` wird `durchgespielt`/`komplettiert`/`abgebrochen` | `status='erledigt'` |

Diese Übergänge werden vorgeschlagen, nicht erzwungen. Beim Erfassen einer Disc erscheint ein Hinweis "Stand auf deiner Kaufliste – erledigt setzen und ins Backlog übernehmen?".

### 5.1 Priorität und Favorit

Zwei getrennte Felder, weil sie zwei verschiedene Fragen beantworten:

- `priority` (1–5) ist der Regler für die **Sortierung**. Er geht in die Rangformel ein.
- `is_favorite` ist der binäre Anker für **"das will ich wirklich"**. Er filtert, statt zu sortieren, und überlebt jede Änderung der Rangformel unbeschadet.

Ein Favorit mit mässiger Kritikerwertung soll nicht nach unten rutschen, nur weil die Formel gerade anders gewichtet ist. Deshalb ist Favorit kein Prioritätswert 6.

### 5.2 Rangberechnung (Use Case 10)

Der Rang wird **bei der Abfrage berechnet und nie gespeichert**. Gespeichert werden nur die Bestandteile: `game.critic_score`, `plan_entry.priority`, später der Preis. Sobald die Gewichtung angepasst wird – und das wird sie – ist das ein Zahlenwechsel statt einer Datenmigration.

```sql
-- Gewichte liegen in app_setting und sind in den Einstellungen verstellbar.
score = (COALESCE(critic_score, 70) / 100.0) * w_critic
      + (priority / 5.0)                     * w_priority
      + (is_favorite * w_favorite)
```

`COALESCE(critic_score, 70)` ist bewusst gewählt: ein Spiel ohne Wertung soll weder bevorzugt noch bestraft werden. Ein `0` würde unbewertete Titel dauerhaft ans Listenende drücken.

Später kommt der Preis als vierter Faktor hinzu und liefert eine Sortierung nach "viel Spiel pro Euro". Bis dahin bleibt `w_price` auf 0.

```sql
CREATE TABLE app_setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- w_critic, w_priority, w_favorite, w_price
```

---

## 6. Datenmodell – Marktdaten (Use Case 7)

Zunächst inaktiv. Die Tabellen werden in Stufe 1 mit angelegt und bleiben leer, damit die spätere Anbindung ein reiner Import-Job ist und kein Schema-Umbau.

```sql
-- Aktueller Stand aus einem Händler-Produktdatenfeed.
-- Dreifachnutzen: EAN-Auflösung, Nachweis einer physischen Fassung, Preis.
CREATE TABLE market_offer (
  id                INTEGER PRIMARY KEY,
  source            TEXT NOT NULL CHECK (source IN ('rebuy','medimops','manuell')),
  source_product_id TEXT NOT NULL,
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

-- Preisverlauf über beide Kanäle.
-- Wird nur geschrieben, wenn sich der Preis geändert hat.
-- "Kostet 35 EUR" ist keine Entscheidungsgrundlage.
-- "Kostet 35 EUR, lag vor einem Jahr bei 22 EUR" schon.
CREATE TABLE price_snapshot (
  id            INTEGER PRIMARY KEY,
  release_id    INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('psn_store','gebraucht')),
  source        TEXT NOT NULL,           -- 'psn' | 'rebuy' | 'medimops'
  condition     TEXT,                    -- nur bei channel='gebraucht'
  price_cents   INTEGER NOT NULL,
  is_sale       INTEGER NOT NULL DEFAULT 0,   -- nur bei channel='psn_store'
  currency      TEXT NOT NULL DEFAULT 'EUR',
  captured_at   TEXT NOT NULL
);

CREATE INDEX idx_price_release ON price_snapshot(release_id, channel, captured_at);
```

Die beiden Kanäle sind nicht vergleichbar und dürfen in der Oberfläche nie zu einem Wert verrechnet werden. Store-Preis heisst "so viel kostet es neu digital", Gebrauchtpreis heisst "so viel verlangt Händler X gerade für die Disc". Beide nebeneinander anzeigen, mit Kanalbezeichnung.

---

## 7. Externe Anbindungen

### 7.1 PSN-Trophäen

Kein offizielles API. Ablauf: NPSSO-Cookie aus dem eingeloggten Browser → Access Code → Access Token und Refresh Token.

Endpunkt `GET /api/trophy/v1/users/me/trophyTitles`, paginiert. Die v2-Trophy-API deckt PS5, PS4, PS3 und Vita gemeinsam ab.

**Der Refresh Token läuft ab.** Das ist kein Fehlerfall, sondern ein regulärer Zustand und wird als solcher gebaut:

- `psn_credentials.status` wird `abgelaufen`
- Dashboard zeigt einen deutlichen Hinweis
- Einstellungen bieten ein Feld für den neuen NPSSO
- Der Sync bricht sauber ab, vorhandene Daten bleiben unangetastet

**Sync-Ablauf:** `psn_sync_run` anlegen → alle Seiten abrufen und roh in `psn_raw_response` schreiben → daraus `trophy_progress` per UPSERT normalisieren → `release_id` und `play_status` unangetastet lassen → Status setzen. Die Trennung von Abruf und Normalisierung erlaubt beliebiges Wiederholen ohne PSN-Zugriff und liefert echte Testdaten.

Tokens liegen als Cloudflare Secret, nicht in D1. Der Sync läuft im Cron Trigger, nicht im Request-Pfad.

### 7.2 Das Matching-Problem

PSN-Trophäentitel lassen sich nicht zuverlässig automatisch auf Releases abbilden: abweichende Editionsnamen, regionale Varianten mit eigener `npCommunicationId`, Cross-Gen-Titel mit geteilter Trophäenliste, Spiele mit mehreren Listen.

**Kein vollautomatisches Matching bauen.** Stattdessen:

1. Vorschlag per normalisiertem Titelvergleich (Kleinschreibung, Sonderzeichen entfernt, Editionszusätze abgeschnitten)
2. Eindeutiger Treffer mit hoher Ähnlichkeit → automatisch zuordnen
3. Alles andere landet in "nicht zugeordnet"
4. Eigene Oberfläche zum Zuordnen, inklusive Anlegen von Spiel und Release aus dem Trophäeneintrag heraus
5. Einmal gesetzte Zuordnungen sind dauerhaft und werden nie automatisch überschrieben

Dieselbe Regel gilt für `market_offer` → `release`.

### 7.3 Händler-Feed (optional, spät)

rebuy und medimops stellen Produktdatenfeeds über AWIN bereit, nach Freigabe des Publisher-Profils. Ein Feed enthält EAN, Titel, Plattform, Zustand, Preis, Verfügbarkeit und Link – und deckt damit Barcode-Auflösung, Nachweis einer physischen Fassung und Gebrauchtpreis auf einmal ab.

**Der Import läuft nicht im Worker.** Die Kataloge umfassen Millionen Artikel und sprengen die CPU-Grenze sofort. Stattdessen:

1. GitHub Action (täglich) lädt den Feed
2. Filtert auf PS3/PS4/PS5
3. Sendet Batches an `POST /api/imports/feed`
4. Worker macht UPSERT auf `market_offer`, schreibt bei Preisänderung einen `price_snapshot` mit `channel='gebraucht'`
5. EANs mit eindeutiger Release-Zuordnung landen in `ean_mapping`

**Ableitung von `physical_release_status`:** Erscheint ein Release im Feed → `ja`, `physical_source='feed'`, Region `PAL`. Der Umkehrschluss ist unzulässig: fehlt ein Titel, bleibt der Status `unbekannt`. Ein `nein` wird ausschliesslich manuell gesetzt.

**Falls keine Freigabe kommt:** Die App bleibt vollständig funktionsfähig. Der Barcode-Scan arbeitet über `ean_mapping`, `physical_release_status` wird manuell gepflegt, die Lückenansicht funktioniert ohne Preisspalte.

### 7.4 PSN Store-Preise (optional, zuletzt)

Ebenfalls inoffiziell, über die Katalog-Endpunkte des Store. Voraussetzung ist `release.psn_product_id`, das beim Trophäen-Matching oder manuell gepflegt wird.

Abruf im Cron Trigger, und ausschliesslich für Releases, die auf einer `plan_entry` stehen oder in der Lückenansicht auftauchen. Nicht für die gesamte Sammlung – das ist unnötiger Traffic gegen eine inoffizielle Schnittstelle.

Sale-Preise werden mit `is_sale = 1` markiert, damit ein Rabattzeitraum den Verlauf nicht verfälscht.

---

## 7.5 Kritikerwertungen (Use Case 10)

**IGDB** ist die erste Wahl: bereits im Stack für Cover und Metadaten, kostenlos, und liefert mit `aggregated_rating` einen Kritikerschnitt samt Anzahl eingeflossener Reviews.

**Metacritic scheidet aus** – keine offene API, und Scraping verstösst gegen deren Nutzungsbedingungen.

**OpenCritic** betreibt eine öffentliche API und rechnet mit einem einfachen arithmetischen Mittel statt Metacritics undurchsichtiger Gewichtung. Als optionale Zweitquelle sinnvoll, als Pflichtabhängigkeit nicht nötig.

Abruf zusammen mit den übrigen IGDB-Metadaten, nicht als eigener Job. `critic_source` hält fest, woher der Wert stammt, damit ein späterer Quellenwechsel nachvollziehbar bleibt.

---

## 8. Prüfliste und Import

### 8.1 Die Prüfliste (Use Case 8)

Ersteinrichtung und laufende Pflege sind derselbe Vorgang: Spiele, bei denen die Trophäendaten und deine Bewertung auseinanderlaufen, werden dir einzeln vorgelegt. Deshalb gibt es **eine** Warteschlange und **eine** Oberfläche, nicht zwei.

```sql
CREATE TABLE review_queue (
  release_id    INTEGER PRIMARY KEY REFERENCES release(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL CHECK (reason IN (
                  'erstimport',        -- erstmals gesehen, nie bewertet
                  'neue_trophaeen',    -- du hast weitergespielt
                  'dlc_erweitert'      -- das Spiel hat neue Trophäen bekommen
                )),
  detail        TEXT,                  -- z.B. "100 % → 78 %, 12 neue Trophäen"
  enqueued_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Befüllung durch den Sync.** Nach der Normalisierung wird je Release der aktuelle Stand gegen `reviewed_*` verglichen:

| Bedingung | Reason |
|---|---|
| keine `play_status`-Zeile vorhanden | `erstimport` |
| `earned_total` gestiegen, Status ist gesetzt und nicht `am_spielen` | `neue_trophaeen` |
| `defined_total` gestiegen | `dlc_erweitert` |

Der Sync **schreibt nur in die Warteschlange**, er ändert nie einen Status. Steht ein Release schon in der Warteschlange, wird `detail` aktualisiert statt ein zweiter Eintrag angelegt.

Der Filter "nicht `am_spielen`" ist wichtig: bei einem Spiel, das du gerade aktiv zockst, kommen bei jedem Sync neue Trophäen dazu. Das ist keine Nachricht, sondern der Normalfall – es würde die Liste sonst zumüllen.

**Die Oberfläche.** Ein Spiel pro Bildschirm mit Cover, Plattform, Trophäenverteilung, Platin-Kennzeichen und – bei Änderungen – dem Vorher-Nachher-Vergleich aus `detail`. Der Grund steht als Überschrift: "Du hast weitergespielt" oder "Neue DLC-Trophäen erschienen".

| Aktion | Wirkung |
|---|---|
| Durchgespielt | `play_status = 'durchgespielt'` |
| Abgebrochen | `play_status = 'abgebrochen'` |
| Spiele gerade | `play_status = 'am_spielen'` |
| Auf To-Do | `play_status = 'pausiert'` + `plan_entry(kind='todo', origin='triage')` |
| Ins Backlog | `play_status = 'pausiert'` + `plan_entry(kind='backlog', origin='triage')` |
| Unverändert lassen | Status bleibt, Eintrag verschwindet trotzdem |

**Jede Entscheidung** löscht die Zeile aus `review_queue` und stempelt `reviewed_earned_total`, `reviewed_defined_total` und `reviewed_at` auf den aktuellen Stand. Damit ist der Referenzpunkt gesetzt, und dasselbe Spiel taucht erst bei der nächsten echten Änderung wieder auf.

"Unverändert lassen" ist deshalb keine leere Aktion: sie sagt "ich habe es gesehen und es bleibt abgebrochen". Ohne diese Möglichkeit bekämst du bei jedem Sync denselben Hinweis erneut.

Fortschrittsanzeige "noch 47 von 210" und jederzeitiges Abbrechen sind Pflicht, nicht Komfort – niemand arbeitet die Ersteinrichtung in einer Sitzung durch. Bei laufendem Betrieb sind es dann meist ein bis zwei Einträge pro Woche.

### 8.2 Wunschlisten-Import aus Textdateien (Use Case 9)

Eingabe: Datei-Upload oder Einfügen in ein Textfeld, ein Titel pro Zeile. Leerzeilen und führende Aufzählungszeichen werden entfernt.

**Ablauf**

1. Zeilen einlesen, gegen `game` und IGDB abgleichen
2. Ergebnisliste zur Durchsicht, dreigeteilt: eindeutige Treffer, mehrdeutige Treffer mit Auswahl, ohne Treffer
3. Erst nach Bestätigung werden `plan_entry`-Zeilen mit `kind='wunsch'`, `origin='import'` geschrieben

**Zeilen ohne Treffer werden nicht stillschweigend als Freitext übernommen.** Sie landen in einem Nachbearbeitungsschritt mit einem eingebauten IGDB-Suchfeld: Suchbegriff anpassen, Treffer auswählen, fertig. Titel aus Textdateien sind abgekürzt, falsch geschrieben und mehrdeutig – eine Suche mit korrigierbarer Eingabe löst das, ein automatischer Fallback erzeugt nur Datenmüll.

Ein Eintrag ohne IGDB-Zuordnung entsteht **nur auf ausdrückliche Anweisung** ("trotzdem übernehmen"). Das ist der richtige Weg für Titel, die IGDB nicht kennt – etwa sehr frühe Ankündigungen –, aber es ist eine bewusste Entscheidung, kein Nebeneffekt.

### 8.3 Nachpflege fehlender Metadaten (Use Case 12)

Einträge ohne IGDB-Zuordnung haben kein Cover, keine Kritikerwertung und kein Erscheinungsdatum. Sie funktionieren in allen Listen, fallen aber aus der Rangberechnung heraus.

Eine Ansicht in den Einstellungen sammelt sie listenübergreifend – aus Wunschliste, To-Do, Backlog und Sammlung gleichermassen – mit demselben IGDB-Suchfeld zum Nachziehen.

Der Aufwand ist gering, weil die Suche aus 8.2 wiederverwendet wird. Falls der Fall in der Praxis nie auftritt, kostet die Ansicht nichts; falls doch, hast du keinen Weg, ihn sonst zu finden.

### 8.4 Unveröffentlichte Titel (Use Case 11)

Ein Wunschlisteneintrag braucht weder Release noch Plattform noch Trophäendaten. Kommt der Titel aus IGDB, werden `release_date` und `release_status = 'angekuendigt'` mitgeführt.

**Folgen für die übrigen Ansichten:**

- Die Kaufliste blendet `angekuendigt` aus. Eine Gebrauchtpreisabfrage für ein nicht erschienenes Spiel ist sinnlos.
- Die Wunschliste zeigt das Erscheinungsdatum statt eines Preises.
- Eine eigene Ansicht "Erscheint bald" listet vorgemerkte Titel mit Datum in den nächsten Monaten.
- Ein täglicher Abgleich hebt `angekuendigt` auf `erschienen`, sobald das Datum überschritten ist. Der Eintrag rückt damit automatisch in die Kaufkandidaten.

---

## 9. Barcode-Erfassung

### 9.1 Erfassung

Primär `BarcodeDetector` API (`formats: ['ean_13']`), Fallback `html5-qrcode`. Kamerazugriff braucht HTTPS – über Pages ohnehin gegeben.

Serienerfassung: nach jedem erkannten Code wird die Auflösung eingeblendet, ohne den Scanner zu schliessen. Für das Ersterfassen eines Regals ist das der Unterschied zwischen zehn Minuten und einem Abend.

### 9.2 Auflösungskette

| Stufe | Quelle | Ergebnis |
|---|---|---|
| 1 | `ean_mapping` | Direkter Treffer, Erfassung mit einem Klick |
| 2 | `market_offer` per EAN | Titel und Plattform bekannt → Release vorschlagen, `ean_mapping` automatisch schreiben |
| 3 | `game` per Titelsuche | Nutzer wählt aus, `ean_mapping` wird geschrieben |
| 4 | kein Treffer | Formular mit vorbelegter EAN, Zuordnung wird gespeichert |

Stufen 1, 3 und 4 laufen ohne Feed. Der Barcode-Scan hängt damit **nicht** an der AWIN-Freigabe; Stufe 2 ist eine Verbesserung, kein Fundament.

```sql
CREATE TABLE ean_mapping (
  ean           TEXT PRIMARY KEY,
  release_id    INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  source        TEXT NOT NULL DEFAULT 'manuell',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Damit unbekannte Codes nicht verloren gehen, wenn beim Scannen
-- nicht sofort zugeordnet werden soll.
CREATE TABLE unresolved_scan (
  ean           TEXT PRIMARY KEY,
  scan_count    INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 10. Sync-Protokoll

```sql
CREATE TABLE psn_sync_run (
  id            INTEGER PRIMARY KEY,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  status        TEXT NOT NULL CHECK (status IN ('laufend','erfolg','fehler')),
  error_message TEXT,
  titles_seen   INTEGER
);

CREATE TABLE psn_raw_response (
  id            INTEGER PRIMARY KEY,
  sync_run_id   INTEGER NOT NULL REFERENCES psn_sync_run(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  payload       TEXT NOT NULL,
  fetched_at    TEXT NOT NULL
);

CREATE TABLE psn_credentials (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_expires_at TEXT,
  last_success_at    TEXT,
  status             TEXT NOT NULL CHECK (status IN ('ok','abgelaufen','fehler'))
);
```

---

## 11. Abgeleitete Sichten

```sql
-- Use Case 3: Lücken. Digital gespielt, Disc existiert, nicht im Regal.
CREATE VIEW v_luecken AS
SELECT
  g.title, r.id AS release_id, r.platform, r.physical_release_region,
  t.progress_pct,
  (t.defined_platinum > 0 AND t.earned_platinum > 0) AS hat_platin,
  ps.status AS eigener_status,
  (SELECT MIN(price_cents) FROM market_offer m
     WHERE m.release_id = r.id AND m.in_stock = 1) AS bester_gebrauchtpreis_cents
FROM trophy_progress t
JOIN release r ON r.id = t.release_id
JOIN game g ON g.id = r.game_id
LEFT JOIN play_status ps ON ps.release_id = r.id
WHERE t.progress_pct > 0
  AND r.physical_release_status = 'ja'
  AND NOT EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id);

-- Use Case 6: Kandidaten für die Kaufliste, noch nicht übernommen.
CREATE VIEW v_kaufkandidaten AS
SELECT 'luecke' AS quelle, release_id, title, platform, bester_gebrauchtpreis_cents
FROM v_luecken
WHERE release_id NOT IN (
  SELECT release_id FROM plan_entry
  WHERE kind = 'kauf' AND status = 'offen' AND release_id IS NOT NULL
)
UNION ALL
SELECT 'wunsch', pe.release_id, COALESCE(g.title, pe.title_raw),
       r.platform, NULL
FROM plan_entry pe
LEFT JOIN release r ON r.id = pe.release_id
LEFT JOIN game g ON g.id = COALESCE(pe.game_id, r.game_id)
WHERE pe.kind = 'wunsch' AND pe.status = 'offen';

-- Use Case 8: offene Prüfliste, angereichert für die Anzeige.
CREATE VIEW v_review_offen AS
SELECT rq.reason, rq.detail, rq.enqueued_at,
       g.title, r.id AS release_id, r.platform,
       t.progress_pct,
       (t.defined_platinum > 0 AND t.earned_platinum > 0) AS hat_platin,
       t.earned_bronze, t.earned_silver, t.earned_gold,
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

-- Use Case 12: alles ohne IGDB-Zuordnung, listenübergreifend.
CREATE VIEW v_ohne_igdb AS
SELECT 'spiel' AS quelle, g.id AS ref_id, g.title
FROM game g WHERE g.igdb_id IS NULL
UNION ALL
SELECT 'plan_' || pe.kind, pe.id, pe.title_raw
FROM plan_entry pe
WHERE pe.status = 'offen' AND pe.game_id IS NULL AND pe.release_id IS NULL;

-- Use Case 11: vorgemerkte Titel, die noch erscheinen.
CREATE VIEW v_erscheint_bald AS
SELECT g.title, g.release_date, pe.id AS plan_id, pe.kind, pe.is_favorite
FROM plan_entry pe
JOIN game g ON g.id = COALESCE(pe.game_id,
                (SELECT game_id FROM release WHERE id = pe.release_id))
WHERE pe.status = 'offen'
  AND g.release_status = 'angekuendigt'
ORDER BY g.release_date;

-- Use Case 5b: Kandidaten für den Backlog – im Besitz, nie angefasst.
CREATE VIEW v_backlog_kandidaten AS
SELECT g.title, r.id AS release_id, r.platform
FROM release r
JOIN game g ON g.id = r.game_id
WHERE EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id)
   OR EXISTS (SELECT 1 FROM digital_entitlement d WHERE d.release_id = r.id)
AND NOT EXISTS (
  SELECT 1 FROM trophy_progress t WHERE t.release_id = r.id AND t.progress_pct > 0
)
AND COALESCE((SELECT status FROM play_status WHERE release_id = r.id),
             'nicht_gespielt') = 'nicht_gespielt'
AND r.id NOT IN (SELECT release_id FROM plan_entry
                 WHERE kind IN ('todo','backlog') AND status='offen' AND release_id IS NOT NULL);

-- Trophäen und eigene Bewertung weichen ab. Nicht als Fehler behandeln,
-- nur zur Durchsicht anzeigen.
CREATE VIEW v_abweichungen AS
SELECT g.title, r.platform, t.progress_pct, ps.status
FROM play_status ps
JOIN release r ON r.id = ps.release_id
JOIN game g ON g.id = r.game_id
LEFT JOIN trophy_progress t ON t.release_id = r.id
WHERE (ps.status IN ('durchgespielt','komplettiert') AND COALESCE(t.progress_pct,0) < 20)
   OR (ps.status = 'nicht_gespielt' AND COALESCE(t.progress_pct,0) > 0);
```

---

## 12. API-Routen

```
GET    /api/games                     Liste mit Filtern
GET    /api/games/:id                 Detail: Releases, Copies, Trophäen, Status, Preise
POST   /api/games
PATCH  /api/games/:id
DELETE /api/games/:id

POST   /api/releases
PATCH  /api/releases/:id              inkl. physical_release_status, psn_product_id
DELETE /api/releases/:id

GET    /api/physical-copies
POST   /api/physical-copies
PATCH  /api/physical-copies/:id
DELETE /api/physical-copies/:id
POST   /api/digital-entitlements
DELETE /api/digital-entitlements/:id

PUT    /api/releases/:id/play-status  Use Case 2: eigene Bewertung setzen
GET    /api/deviations                v_abweichungen

GET    /api/trophies
GET    /api/trophies/unmatched
POST   /api/trophies/:npCommId/match
POST   /api/trophies/:npCommId/create-game

GET    /api/plans?kind=wunsch|todo|backlog|kauf&status=offen&sort=rang
POST   /api/plans
PATCH  /api/plans/:id                 inkl. kind-Wechsel, status, is_favorite
PUT    /api/plans/reorder             Body: { kind, orderedIds } – To-Do-Reihenfolge
DELETE /api/plans/:id

GET    /api/review/queue              v_review_offen, paginiert
POST   /api/review/:releaseId/decide  Body: { action } – siehe 8.1
GET    /api/review/progress           erledigt / offen

GET    /api/igdb/search?q=            Eingebaute Suche für Import und Nachpflege
GET    /api/unmatched                 v_ohne_igdb
POST   /api/unmatched/:quelle/:id/link  Body: { igdbId }

POST   /api/imports/wishlist/parse    Body: { text } → Trefferliste zur Durchsicht
POST   /api/imports/wishlist/confirm  Body: { entries[] } → schreibt plan_entry

GET    /api/export/:liste.csv         sammlung|wunsch|todo|backlog|kauf|luecken|trophaeen
GET    /api/export/backup.json        Vollsicherung, nur mit Backup-Token

GET    /api/upcoming                  v_erscheint_bald
GET    /api/settings/weights          Rangformel-Gewichte
PUT    /api/settings/weights

GET    /api/gaps                      v_luecken
GET    /api/purchase-candidates       v_kaufkandidaten
GET    /api/backlog-candidates        v_backlog_kandidaten

POST   /api/scan                      Body: { ean }
GET    /api/scan/unresolved
POST   /api/scan/:ean/assign          Body: { releaseId }

GET    /api/releases/:id/prices?channel=
POST   /api/imports/feed              Batch-Upsert, nur GitHub Action
POST   /api/sync
GET    /api/sync/status
POST   /api/settings/npsso

GET    /api/stats
```

**Filter auf `/api/games`:** `platform`, `owned` (physisch/digital/beide/keins), `played` (ja/nein), `platinum` (ja/nein/nichtverfuegbar), `playStatus`, `physicalAvailable` (ja/nein/unbekannt), `search`.

**Zugriffsschutz:** siehe Abschnitt 15.3. Kurz: Cloudflare Access vor Frontend und API, zusätzlich ein Bearer-Token für die Maschinen-Endpunkte (`/api/imports/feed`, `/api/export/backup.json`), die keinen Browser-Login durchlaufen können.

---

## 13. Frontend

| Ansicht | Use Case | Inhalt |
|---|---|---|
| Dashboard | – | Kennzahlen je Plattform, Platin-Zähler, Backlog-Länge, letzter Sync, Warnung bei abgelaufenem NPSSO |
| Sammlung | 1 | Kachelraster mit Covern, Filterleiste, Suche |
| Spieldetail | 1, 2, 7 | Releases, Exemplare, Trophäen je Stufe, eigener Status, Preisverlauf je Kanal |
| Zuordnung | – | Nicht gematchte Trophäenlisten mit Vorschlägen |
| Lücken | 3 | Digital gespielt, Disc existiert, nicht im Regal – mit Preis sofern vorhanden |
| Wunschliste | 4, 11 | Nach Rang sortiert, Favoriten-Filter, Erscheinungsdatum bei unveröffentlichten Titeln |
| To-Do | 5a | Kurz und manuell sortierbar (Drag-and-drop) |
| Backlog | 5b | Der grosse Haufen, Kandidatenvorschläge aus dem Besitz, Hochziehen auf To-Do |
| Kaufliste | 6, 10 | Gespeist aus Lücken und Wunschliste, sortiert nach Rang, mit Herkunftskennzeichnung |
| Prüfliste | 8 | Ein Spiel pro Bildschirm, sechs Aktionen, Grund und Vorher-Nachher, Fortschrittsanzeige |
| Wunschliste importieren | 9 | Textfeld oder Datei, dreigeteilte Trefferliste, IGDB-Suche für Zeilen ohne Treffer |
| Ohne Zuordnung | 12 | Listenübergreifend, mit IGDB-Suchfeld zum Nachziehen |
| Erscheint bald | 11 | Vorgemerkte Titel mit Datum |
| Scannen | 1 | Serienerfassung nach Abschnitt 9 |
| Einstellungen | – | NPSSO, Sync, Sync-Historie, offene Scans, Abweichungen, Gewichte der Rangformel, Export und Backup-Status |

**Navigation:** Auf dem Handy eine Icon-Leiste am unteren Rand mit den fünf Hauptansichten (Sammlung, Lücken, Kaufliste, To-Do, Scannen); alles Weitere über die Sammlungsansicht und die Einstellungen. Am Desktop dieselbe Navigation als Seitenleiste. Die Prüfliste und der Import sind keine Dauernavigation, sondern werden vom Dashboard aus aufgerufen, solange sie offene Posten haben – mit Anzahl als Kennzeichen.

**Darstellungsregeln**

- `physical_release_status = 'unbekannt'` und fehlende Preise werden immer als "unbekannt" ausgewiesen, nie als "nicht verfügbar" oder "0". Die Datenquellen sind lückenhaft, und die Oberfläche darf diese Lücke nicht als Aussage verkleiden.
- Trophäenfortschritt und eigener Status stehen immer nebeneinander, nie ineinander verrechnet.
- Bei unveröffentlichten Titeln steht das Erscheinungsdatum an der Stelle, wo sonst der Preis steht – nicht "0 €" und nicht "nicht verfügbar".
- Store-Preis und Gebrauchtpreis werden getrennt beschriftet.

**PWA:** Manifest und Service Worker, Sammlungsdaten für Offline-Lesezugriff cachen.

---

## 14. Backup und Export (Use Case 13)

### 14.1 Was Cloudflare selbst bietet

- **Time Travel** (`wrangler d1 time-travel`) stellt die Datenbank auf einen Zeitpunkt zurück. Gut gegen fehlerhafte Migrationen und versehentliche Massenlöschungen.
- **`wrangler d1 export`** erzeugt jederzeit einen vollständigen SQL-Dump.

Beides liegt beim selben Anbieter wie die Datenbank. Gegen einen Bedienfehler hilft es, gegen ein gelöschtes Konto oder eine versehentlich gelöschte Datenbank nicht. Auf "wie kann ich sicher sein" ist das deshalb keine vollständige Antwort.

### 14.2 Wöchentliche Sicherung ausserhalb von Cloudflare

Eine GitHub Action läuft wöchentlich und legt eine Kopie in einem **privaten** Repository ab:

1. `wrangler d1 export --remote --output=backup.sql`
2. Dump committen, wenn er sich geändert hat
3. Zusätzlich `GET /api/export/backup.json` als lesbare Zweitform

Kostenlos, versioniert, unabhängig vom Cloudflare-Konto. Git liefert die Historie mit, du kannst also auf jeden beliebigen Wochenstand zurück.

Zwei Formate mit Absicht: Der SQL-Dump ist die technisch exakte Sicherung zum Wiedereinspielen (`wrangler d1 execute --file=backup.sql`). Die JSON-Fassung bleibt lesbar und auswertbar, auch wenn es das Projekt eines Tages nicht mehr gibt – bei einer privaten Sammlung mit jahrelanger Historie ist das der eigentliche Wert.

Das Dashboard zeigt das Datum der letzten erfolgreichen Sicherung. Ein Backup, von dem man nicht weiss, ob es läuft, ist kein Backup.

### 14.3 Wiederherstellung

Der Ablauf gehört in die README, nicht nur in den Kopf:

```
wrangler d1 create spielesammlung-restore
wrangler d1 execute spielesammlung-restore --remote --file=backup.sql
```

Danach die Binding-ID in der Wrangler-Konfiguration umstellen und deployen. **Einmal testweise durchspielen**, solange nichts kaputt ist – ein ungetestetes Backup ist eine Vermutung.

### 14.4 CSV-Export

`GET /api/export/:liste.csv` für Sammlung, Wunschliste, To-Do, Backlog, Kaufliste, Lücken und Trophäen. Jeweils die Ansicht, die auch die Oberfläche zeigt, mit Kopfzeile und Semikolon als Trennzeichen für Excel im deutschen Gebietsschema.

CSV ist für Auswertung und Weitergabe gedacht, nicht als Sicherung: Beziehungen zwischen den Tabellen gehen dabei verloren. Dafür ist der Dump aus 14.2 zuständig.

---

## 15. Repository, Deployment und Zugriffsschutz (Use Case 14)

### 15.1 Zwei Repositories

| Repo | Sichtbarkeit | Inhalt |
|---|---|---|
| `spielesammlung` | öffentlich | Worker, Frontend, Migrations, GitHub Actions, README |
| `spielesammlung-backup` | **privat** | wöchentlicher SQL-Dump und JSON-Export |

Die Trennung ist nicht optional. Der Dump aus Abschnitt 14 enthält die vollständige Sammlung; im öffentlichen Repo wäre sie für jeden lesbar, und Git-Historie lässt sich nachträglich nur mit Aufwand bereinigen.

Die Backup-Action bekommt einen **Fine-grained Personal Access Token**, dessen Geltungsbereich ausschliesslich das private Repo umfasst. Nicht den Standard-`GITHUB_TOKEN`, der reicht nicht über das eigene Repository hinaus.

**Was im öffentlichen Repo unbedenklich ist:** `account_id` und `database_id` in der Wrangler-Konfiguration. Das sind Bezeichner, keine Zugangsdaten – ohne authentifizierten Kontozugriff nutzlos.

**Was dort niemals hingehört:** NPSSO und PSN-Refresh-Token, IGDB/Twitch-Zugangsdaten, AWIN-Feed-URLs (die enthalten die Publisher-ID), das API-Bearer-Token, der Cloudflare-API-Token. Alles davon liegt als Cloudflare Secret beziehungsweise GitHub Secret. `.dev.vars`, `.wrangler/` und `*.sql` gehören in die `.gitignore`.

### 15.2 Automatisches Deployment

**Frontend:** Git-Integration von Cloudflare Pages. Repo verbinden, Build-Kommando setzen, fertig – jeder Push auf `main` deployt. Pull Requests bekommen automatisch eine Vorschau-URL.

**Worker und Datenbank:** GitHub Action mit `cloudflare/wrangler-action`, ausgelöst durch Push auf `main`. Die Reihenfolge der Schritte ist wichtiger als das Werkzeug:

1. `wrangler d1 export` – Sicherung **vor** jeder Schemaänderung
2. `wrangler d1 migrations apply --remote`
3. `wrangler deploy`

Schritt 1 ist der Grund, warum das eine Action ist und kein Klick im Dashboard. Eine fehlerhafte Migration ist der wahrscheinlichste Weg, Daten zu verlieren, und der einzige Zeitpunkt, an dem ein frisches Backup wirklich zählt, ist die Sekunde davor.

Migrationen laufen **vor** dem Deployment, damit der neue Code nie auf ein altes Schema trifft. Umgekehrt gilt: Migrationen müssen abwärtskompatibel sein, weil der alte Worker in dem Moment noch läuft. Spalten hinzufügen ist unkritisch, Spalten umbenennen nicht – dafür braucht es zwei Deployments.

Benötigte GitHub Secrets: `CLOUDFLARE_API_TOKEN` (Berechtigungen auf Workers Scripts, D1 und Pages beschränkt), `CLOUDFLARE_ACCOUNT_ID`, `BACKUP_REPO_TOKEN`.

### 15.3 Zugriffsschutz

Die Pages-Adresse ist öffentlich erreichbar. Ein Bearer-Token im LocalStorage allein ist dafür zu wenig: einmal geleakt, und die Sammlung ist lesbar, ohne dass es auffällt.

**Cloudflare Access** davor löst das. Zero Trust ist für bis zu 50 Nutzer dauerhaft kostenlos, ohne Kreditkarte. Eingerichtet wird:

- eine Access-Anwendung über die Pages-Domain und die Worker-Route
- eine Richtlinie, die genau eine E-Mail-Adresse zulässt
- Anmeldung per Einmalcode oder über einen Identitätsanbieter wie Google

Ergebnis: Der Login steht vor der App, nicht darin. Ohne gültige Sitzung erreicht kein Aufruf den Worker, und der Worker muss keine Sitzungsverwaltung enthalten.

**Ausnahmen für Maschinen.** Die GitHub Actions (Feed-Import, Backup-Export) können keinen Browser-Login durchlaufen. Zwei Wege:

- Access Service Token für die Action, oder
- diese Pfade von Access ausnehmen und mit einem eigenen Bearer-Token absichern

Das Service Token ist sauberer, weil dann alles über einen Mechanismus läuft. Das Bearer-Token ist einfacher einzurichten. Beides ist vertretbar; die Entscheidung gehört in die README.

**Falls Access nicht eingerichtet wird**, bleibt das Bearer-Token die Mindestanforderung – aber dann gehört ein Hinweis in die README, dass die Anwendung öffentlich erreichbar ist und ihre Sicherheit an einem einzigen Geheimnis hängt.

### 15.4 Was das Teilen wert ist

Das Repo ist ohne deine Daten vollständig nachvollziehbar: Schema, Migrations, Matching-Logik und die Anbindungen sind der interessante Teil, die Sammlung ist es nicht. Wer das Projekt nachbauen will, legt eine eigene D1-Datenbank an und trägt sein eigenes NPSSO ein.

Sinnvoll für die README: Setup-Anleitung, Liste der benötigten Secrets, der Wiederherstellungsablauf aus 14.3 und ein ausdrücklicher Hinweis darauf, dass die PSN-Anbindung inoffiziell ist.

---

## 16. Umsetzungsreihenfolge

Jede Stufe ist einzeln lauffähig und deploybar.

| # | Inhalt | Ergebnis |
|---|---|---|
| 0 | Repos anlegen, Pages-Git-Integration, Deploy-Action, Cloudflare Access | Push auf `main` deployt, App ist geschützt |
| 1 | Wrangler-Setup, Worker mit Hono, D1, vollständige Migration | Erreichbare leere App |
| 2 | PSN-Auth, NPSSO-Eingabe, Rohabruf | Trophäendaten liegen roh vor |
| 3 | Normalisierung, einfache Listenansicht | Use Case 2 teilweise: Trophäen und Platin sichtbar |
| 4 | `game`/`release`, Matching-Vorschläge, Zuordnungsoberfläche | Sauberes Datenmodell |
| 5 | Besitz erfassen (physisch und digital), Sammlungsansicht mit Filtern | **Use Case 1** |
| 6 | `play_status`, Statuswechsel im Spieldetail, Abweichungsansicht | **Use Case 2** |
| 7 | Prüfliste, zunächst nur `erstimport` | **Use Case 8**, Ersteinrichtung – Datenbestand steht |
| 8 | Backup-Action ins private Repo, CSV-Export | **Use Case 13** – ab jetzt sind Daten drin, die weh tun |
| 9 | IGDB-Anbindung: Cover, Suche, Kritikerwertung, Erscheinungsdaten | Grundlage für 10 bis 13 |
| 10 | `plan_entry`, Wunschliste, Favoriten | **Use Case 4** |
| 11 | Wunschlisten-Import mit Suche, Ansicht "Ohne Zuordnung" | **Use Cases 9 und 12** |
| 12 | To-Do und Backlog mit Sortierung und Kandidatenvorschlägen | **Use Cases 5a und 5b** |
| 13 | Änderungserkennung im Sync: `neue_trophaeen`, `dlc_erweitert` | **Use Case 8** vollständig |
| 14 | `physical_release_status` manuell pflegbar, Lückenansicht | **Use Case 3** |
| 15 | Kaufliste mit Kandidaten und Rangberechnung, "Erscheint bald" | **Use Cases 6, 10, 11** |
| 16 | Barcode-Scan mit Auflösungskette (ohne Feed) | Komfort bei Erfassung |
| 17 | Cron Trigger, PWA | Automatik und Komfort |
| 18 | AWIN-Feed: Gebrauchtpreise, automatischer Physisch-Status | **Use Case 7**, Teil 1 |
| 19 | PSN Store-Preise | **Use Case 7**, Teil 2 |

Nach Stufe 15 sind alle Use Cases ausser 7 vollständig erfüllt. Stufe 16 und 17 hängen an externen Freigaben beziehungsweise inoffiziellen Schnittstellen und stehen deshalb am Ende – die Tabellen dafür existieren aber ab Stufe 1.

**Zwei Reihenfolge-Entscheidungen, die vom Use-Case-Nummern abweichen**

*Die Triage (Stufe 7) kommt früh*, direkt nachdem `play_status` existiert. Sie ist der Schritt, der aus rohen Trophäendaten einen brauchbaren Datenbestand macht. Alles danach – To-Do, Backlog, Lücken – arbeitet auf ihrem Ergebnis. Zieht man sie nach hinten, baut man Listen, die vorerst leer bleiben.

*Stufe 0 steht vor allem anderen.* Deployment-Pipeline und Zugriffsschutz nachträglich einzuziehen bedeutet, jede bis dahin gebaute Route erneut anzufassen. Am Anfang sind es zwei Stunden Einrichtung, später ein Umbau.

*Das Backup (Stufe 8) kommt früh*, direkt nachdem die Ersteinrichtung durch ist. Ab diesem Punkt steckt Arbeit in der Datenbank, die sich nicht per Knopfdruck wiederherstellen lässt – die Trophäen kämen aus PSN zurück, deine Bewertungen nicht. Backup zu bauen, wenn man es braucht, ist zu spät.

*Die Änderungserkennung (Stufe 13) kommt später als die Prüfliste selbst.* Stufe 7 baut die Oberfläche und den `erstimport`-Fall; die Erkennung von `neue_trophaeen` und `dlc_erweitert` setzt darauf auf und braucht erst dann zu existieren, wenn ein zweiter Sync überhaupt stattgefunden hat.

*Die Lücken (Stufe 14) kommen spät*, obwohl Use Case 3 niedrig nummeriert ist. Sie hängen an `physical_release_status`, der ohne Feed manuell gepflegt werden muss – sinnvoll erst, wenn die Sammlung steht.

---

## 17. Bekannte Risiken

| Risiko | Auswirkung | Umgang |
|---|---|---|
| PSN-API ist inoffiziell | Sony kann Endpunkte ändern | Rohdaten speichern, Sync-Fehler brechen die App nicht |
| NPSSO läuft ab | Sync schlägt fehl | Als regulärer Zustand modelliert, UI-Hinweis plus Eingabefeld |
| Trophäen-Matching unsauber | Falsche Zuordnungen | Manuelle Zuordnung ist verbindlich, nie automatisch überschreiben |
| Sync überschreibt eigene Bewertung | Datenverlust bei `play_status` | Automatik greift nur bei fehlender Zeile oder `nicht_gespielt` |
| Triage bricht in der Mitte ab | Halber Datenbestand | Jede Entscheidung wird sofort gespeichert, `unentschieden` hält Zweifelsfälle auffindbar |
| Wunschlisten-Import trifft falsch | Datenmüll in der Liste | Keine automatische Übernahme, kein Freitext-Fallback, IGDB-Suche für Zeilen ohne Treffer |
| Prüfliste läuft voll | Wird ignoriert und damit nutzlos | Aktiv gespielte Titel erzeugen keine Einträge, "unverändert lassen" setzt den Referenzpunkt neu |
| Cloudflare-Konto weg | Totalverlust | Wöchentlicher Export in ein privates GitHub-Repository, ausserhalb von Cloudflare |
| Backup landet im öffentlichen Repo | Sammlung öffentlich lesbar | Getrennte Repos, Fine-grained Token nur auf das private, `*.sql` in `.gitignore` |
| Bearer-Token geleakt | Fremdzugriff auf die Daten | Cloudflare Access davor, Token nur noch für Maschinen-Endpunkte |
| Fehlerhafte Migration | Datenverlust | Export als erster Schritt jedes Deploy-Jobs, Migrationen abwärtskompatibel halten |
| Backup läuft unbemerkt nicht mehr | Sicherheit nur scheinbar | Datum der letzten Sicherung steht auf dem Dashboard |
| Wiederherstellung nie geprobt | Backup unbrauchbar | Ablauf in der README, einmal testweise durchgespielt |
| Kritikerwertung fehlt | Rang verzerrt | `COALESCE(critic_score, 70)` – unbewertete Titel werden weder bevorzugt noch bestraft |
| Rangformel passt nicht | Umbauwunsch | Nur Bestandteile gespeichert, Gewichte in `app_setting` verstellbar |
| AWIN-Freigabe abgelehnt | Kein Feed, keine Gebrauchtpreise | Stufen 1–12 sind unabhängig |
| Feed kennt Titel nicht | Physisch-Status und Preis fehlen | Status bleibt `unbekannt`, niemals automatisch `nein` |
| Feedgröße vs. 10 ms CPU | Import bricht ab | Parsen und Filtern in der GitHub Action, Worker bekommt nur Batches |
| Feed zeigt nur Lagerbestand | Kein Marktwert, nur Angebotspreis | Als "Angebot bei Händler X" beschriften, nicht als "Wert" |
| Store-Preise inoffiziell und volatil | Sale verfälscht Verlauf | `is_sale`-Flag, Abruf nur für vorgemerkte Releases |
| Keine freie EAN-Datenbank | Barcode liefert nichts | Eigene Zuordnungstabelle, offene Scans protokolliert |
| D1 relativ jung | Werkzeuge weniger ausgereift | Bei Single-User unkritisch, Schema ist Standard-SQLite und portierbar |
