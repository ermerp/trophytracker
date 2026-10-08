← [Inhaltsverzeichnis](README.md)

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

  -- Use Case 10: Kritikerwertung, Sortierkriterium der Listen (5.2).
  critic_score       INTEGER,           -- 0-100
  critic_score_count INTEGER,           -- Anzahl eingeflossener Reviews
  critic_source      TEXT,              -- 'igdb' | 'opencritic' | 'manuell'
  critic_updated_at  TEXT,

  -- Buchführung des IGDB-Abgleichs (7.6, Migration 0010). Kein Statusfeld:
  -- die Zustände sind aus den Zeitstempeln ableitbar.
  igdb_slug           TEXT,             -- für den Link auf igdb.com
  igdb_checked_at     TEXT,             -- letzte Suche bei IGDB
  igdb_matched_at     TEXT,
  igdb_matched_source TEXT CHECK (igdb_matched_source IN ('automatisch','manuell')),
  igdb_declined_at    TEXT,             -- Nutzer: "gibt es bei IGDB nicht"
  igdb_synced_at      TEXT,             -- letzte Übernahme der Metadaten

  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Kandidaten einer IGDB-Suche ohne eindeutigen Treffer, für die Prüfansicht
-- (7.6). Abgeleitet und jederzeit neu abrufbar, deshalb nicht in backup.json;
-- die Entscheidungen des Nutzers stehen in game.
CREATE TABLE igdb_candidate (
  id           INTEGER PRIMARY KEY,
  game_id      INTEGER NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  igdb_id      INTEGER NOT NULL,
  name         TEXT NOT NULL,
  slug         TEXT,
  cover_url    TEXT,
  release_date TEXT,
  platforms    TEXT,                    -- "PS3,PS4", nur die vier eigenen
  game_type    TEXT,                    -- Anzeigetext: 'Hauptspiel', 'DLC', 'Remake', ...
  critic_score INTEGER,
  critic_score_count INTEGER,
  position     INTEGER NOT NULL,        -- Reihenfolge der IGDB-Antwort
  fetched_at   TEXT NOT NULL,
  UNIQUE (game_id, igdb_id)
);

-- Wunschlisten-Import (8.2, Migration 0012): ein Lauf je Datei, eine Zeile
-- je Titel, Kandidaten je Zeile. Arbeitszustand, nicht in backup.json - die
-- Quelldateien liegen beim Nutzer, das Ergebnis steht in plan_entry.
CREATE TABLE wishlist_import (
  id          INTEGER PRIMARY KEY,
  source_name TEXT,                     -- Dateiname oder 'Eingabe'
  list_year   INTEGER,                  -- aus dem Dateinamen, korrigierbar
  form        TEXT NOT NULL CHECK (form IN ('jahresliste','plattformliste','tabelle','einfach')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE wishlist_import_line (
  id            INTEGER PRIMARY KEY,
  import_id     INTEGER NOT NULL REFERENCES wishlist_import(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  title         TEXT NOT NULL,          -- bereinigt, vom Nutzer änderbar
  originals     TEXT NOT NULL,          -- JSON-Liste der Rohzeilen (zusammengeführte Doppelungen)
  platform      TEXT CHECK (platform IN ('PS3','PS4','PS5','PSVITA')),
  listed_at     TEXT,                   -- 'JJJJ' oder 'JJJJ-MM', nur zum Abgleich
  checked_at    TEXT,                   -- NULL = noch nicht abgeglichen
  search_path   TEXT,                   -- Suchweg aus 7.6, nur zur Anzeige
  match_kind    TEXT CHECK (match_kind IN ('sammlung','vorhanden','eindeutig','mehrdeutig','ohne_treffer')),
  game_id       INTEGER REFERENCES game(id) ON DELETE SET NULL,
  release_id    INTEGER REFERENCES release(id) ON DELETE SET NULL,
  igdb_id       INTEGER,                -- eindeutiger Treffer
  decision      TEXT NOT NULL DEFAULT 'offen'
                CHECK (decision IN ('offen','uebernommen','uebersprungen','schon_vorhanden','aufgeteilt')),
  plan_entry_id INTEGER REFERENCES plan_entry(id) ON DELETE SET NULL,
  decided_at    TEXT
);

-- wishlist_import_candidate: wie igdb_candidate, mit line_id statt game_id
-- und ohne fetched_at; UNIQUE (line_id, igdb_id).

-- Ein Spiel auf einer konkreten Plattform.
-- Zwingend getrennt: GTA V existiert auf PS3, PS4 und PS5
-- mit je eigener Trophäenliste und eigenem Preis.
-- Vita ist seit Migration 0003 dabei: Die Trophäenliste enthielt 24 reine
-- Vita-Titel und 26 weitere in Cross-Gen-Listen.
CREATE TABLE release (
  id            INTEGER PRIMARY KEY,
  game_id       INTEGER NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('PS3','PS4','PS5','PSVITA')),
  edition       TEXT,
  region        TEXT,

  -- Use Case 3: existiert eine Disc-Fassung?
  -- Dreiwertig. NIEMALS Boolean: bei fehlenden Daten würde die App
  -- "gibt es nicht" behaupten und genau die gesuchten Spiele verstecken.
  physical_release_status TEXT NOT NULL DEFAULT 'unbekannt'
                          CHECK (physical_release_status IN ('ja','nein','unbekannt')),
  physical_release_region TEXT,
  physical_source         TEXT,          -- 'igdb' (Stufe 14) | 'manuell' | 'feed' (Stufe 20)
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

**Ein Exemplar belegt die Disc-Fassung.** `physical_copy` hängt an einem konkreten Release; wer ein
Exemplar einträgt, hat die Disc nachweislich in der Hand. Das Anlegen setzt deshalb
`physical_release_status` von `unbekannt` auf `ja` mit `physical_source = 'manuell'` – und nur
das: ein `nein` des Nutzers und ein bereits gesetztes `ja` (etwa aus dem Feed) bleiben unangetastet.
`physical_release_region` bleibt dabei NULL, denn der Besitz belegt die Existenz der Disc, nicht ihre
Region; ein geratenes `PAL` würde den Feed-Abgleich in Stufe 20 irreführen. Das Löschen eines
Exemplars setzt nichts zurück – dass ein Exemplar weg ist, sagt nichts darüber, ob es die Disc gibt.

**Drei Quellen, eine Rangfolge (Stufe 14).** `physical_source` sagt, wer den Status gesetzt hat:
`igdb` (Händlereintrag mit physischem Medium, 7.6), `manuell` (Exemplar angelegt oder ausdrücklich
über `PATCH /api/releases/:id` gesetzt) oder später `feed` (Stufe 20). Automatische Quellen setzen
**nur** `unbekannt → ja`; ein `nein` und ein bereits gesetztes `ja` fassen sie nie an – das Urteil
des Nutzers steht über jeder Quelle. Setzt der Nutzer `unbekannt`, nimmt er sein Urteil zurück:
`physical_source` wird NULL, `physical_checked_at` bleibt, und der IGDB-Schritt kommt nach seiner
Frist von selbst wieder vorbei. `physical_checked_at` ist der Fortschrittsstempel des IGDB-Schritts,
kein Gütesiegel: Er wird auch gesetzt, wenn IGDB nichts Physisches kennt.

**Anlegen von Hand.** Spiel und Release entstehen nicht nur aus der Zuordnung (7.2), sondern auch
über `POST /api/games` und `POST /api/releases` – für die Disc, die nie gestartet wurde und deshalb
keine Trophäenliste hat. `POST /api/games` prüft den Titelschlüssel: Gibt es schon ein Spiel mit
demselben `sort_title`, antwortet die Route mit `409` und den Kandidaten, und der Nutzer entscheidet,
ob er dort ein Release anhängt oder mit `trotzdem` ein zweites Spiel anlegt. `DELETE` auf Release
oder Spiel gibt anhängende Trophäenlisten in die Zuordnung zurück (`release_id`, `matched_at` und
`matched_source` werden NULL); Exemplare und Berechtigungen kaskadieren. Bleibt ein Spiel ohne
Release, wird es mit gelöscht – **es sei denn, eine Absicht hängt daran** (`plan_entry` mit
`game_id`, seit Stufe 12 in jedem Status, davor nur `offen`): Sonst verschwände ein Wunsch per
CASCADE, sobald ein probeweise angelegtes Release wieder entfernt wird; ein erledigter oder
verworfener ist Historie und hält das Spiel ebenso (Abschnitt 5, Waisen).

**Spiel ohne Release, Release nur aus Wunsch (seit Stufe 10).** Ein Wunsch aus der IGDB-Suche legt
ein Spiel mit den IGDB-Metadaten an, **ohne Release**, solange keine Plattform gewählt ist: Ein Wunsch
braucht weder Release noch Plattform (8.4), und eine geratene Plattform wäre eine Behauptung, die der
Nutzer nie aufgestellt hat. Wählt er eine, entsteht das Release dieser Plattform (oder wird
wiederverwendet) und der Wunsch hängt daran – dort, wo später Kaufliste und Preise hängen. **Ein
Release, das nur einen Wunsch trägt, zählt nicht zur Sammlung:** keine Trophäenliste, kein Exemplar,
keine digitale Berechtigung, aber ein offener `wunsch`-Eintrag (`GamesRepository.NUR_WUNSCH`). Es
erscheint in der Sammlung, sobald Besitz oder Fortschritt dazukommt; Spieldetail und „Sammlung
prüfen" zeigen es immer. Ein Wunsch ist kein Besitz, aber der Nutzer soll sagen dürfen, für welche
Plattform er ihn hat (Entscheidung vom 15.09.2026). Gibt es bereits ein Spiel mit derselben
`igdb_id`, wird es wiederverwendet.

---

**Spielzeit und digitaler Besitz aus PSN (Stufe 18c, Migration 0023).** `psn_played_title` hält, was Sony über gespielte Titel weiß – Spielzeit, Spielzähler, erstes und letztes Spieldatum –, gebaut wie `trophy_progress`: Der Primärschlüssel ist Sonys `title_id`, und `release_id` ist die *Zuordnung*, nicht das Datum selbst. Geht sie daneben, bleibt das Fremddatum unversehrt; eine von Hand gesetzte Zuordnung überschreibt kein Lauf (`COALESCE`). Ein Titel ohne Treffer in der Sammlung bleibt mit `release_id IS NULL` liegen – **importiert wird nichts** (Entscheidung des Nutzers vom 21.09.2026).

`digital_entitlement.herkunft` (`nutzer` / `psn`) trennt Erfasstes von Erkanntem, wie `physical_source` bei der Disc-Fassung. Was der Nutzer selbst eingetragen hat, fasst kein Lauf an; umgekehrt trägt eine von PSN erkannte Zeile in der Oberfläche **kein Löschkreuz** – der nächste Lauf legte sie ohnehin wieder an, und ein wirkungsloses Kreuz wäre eine Falle (7.7).
