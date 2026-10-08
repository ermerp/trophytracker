← [Inhaltsverzeichnis](README.md)

## 4. Datenmodell – Fortschritt (Use Case 2)

### 4.1 Trophäen: Fremddaten

```sql
CREATE TABLE trophy_progress (
  np_communication_id TEXT PRIMARY KEY,
  np_service_name     TEXT NOT NULL,     -- 'trophy' (PS3/PS4/Vita) | 'trophy2' (PS5)
  title_name          TEXT NOT NULL,

  -- Rohwert von PSN, bewusst ohne CHECK. Cross-Gen-Titel teilen sich eine
  -- Trophäenliste und liefern mehrere Plattformen kommagetrennt. Gemessen an
  -- 431 echten Titeln: PS4 (218), PS3 (95), PS5 (61), PSVITA (24),
  -- PSVITA,PS4 (13), PS3,PSVITA,PS4 (10), PS3,PS4 (5), PS3,PSVITA (3),
  -- PS5,PSPC (2). Hier stehen Tatsachen von Sony, keine Auswahl des Nutzers;
  -- das Aufteilen passiert erst beim Matching.
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
  reviewed_progress_pct   INTEGER,   -- Migration 0016, siehe unten
  reviewed_at             TEXT,

  release_id          INTEGER REFERENCES release(id) ON DELETE SET NULL
);

CREATE INDEX idx_trophy_unmatched ON trophy_progress(release_id) WHERE release_id IS NULL;
CREATE INDEX idx_trophy_release   ON trophy_progress(release_id);   -- Migration 0008, siehe Abschnitt 2
```

`reviewed_progress_pct` (Migration 0016) hält den Prozentwert zum Zeitpunkt der Durchsicht, damit der
Prüflisten-Eintrag „100 % → 78 %" sagen kann. Aus den gestempelten Zählern lässt er sich nicht
rekonstruieren: Sony gewichtet nach Trophäenwert, bei **243 von 431** Listen der Sammlung weicht
`progress_pct` vom Verhältnis erspielt/definiert ab. Jeder Stempel schreibt alle vier `reviewed_*`-
Felder zugleich; die Migration hat den Bestand mit dem damals aktuellen Wert nachgefüllt.

Migration 0005 ergänzt `matched_at` und `matched_source` (`automatisch` | `manuell`). Sie halten
fest, wann und wodurch `release_id` gesetzt wurde — die Grundlage dafür, eine Zuordnung später
nachvollziehen und gezielt korrigieren zu können (7.2).

**Platin-Logik:** dreiwertig, nicht Boolean – `erspielt` / `offen` / `nicht_verfuegbar`.
Die Prüfung auf `defined_platinum > 0` ist zwingend: **93 von 431 Titeln der echten Sammlung
definieren gar keine Platin-Trophäe** (22 %). Als Boolean modelliert würden sie dauerhaft als
"Platin offen" erscheinen – dieselbe Haltung wie bei `physical_release_status`.

Migration 0027 ergänzt zwei Stempel. Sie halten den **Versuch**, nicht den
Erfolg: Eine Liste, die PSN nicht mehr kennt, bliebe sonst für immer die
nächste (derselbe Kreislauf wie beim IGDB-Schritt in 18b). `trophies_synced_sum`
hält die Summe aller acht Zähler zum Abrufzeitpunkt — weicht sie ab, hat sich
etwas geändert, und nur dann wird neu geholt (7.7).

```sql
ALTER TABLE trophy_progress ADD COLUMN trophies_synced_at  TEXT;
ALTER TABLE trophy_progress ADD COLUMN trophies_synced_sum INTEGER;
```

### 4.1b Einzeltrophäen (Stufe 19b, Migration 0027)

```sql
CREATE TABLE trophy (
  np_communication_id TEXT    NOT NULL REFERENCES trophy_progress(np_communication_id) ON DELETE CASCADE,
  trophy_id           INTEGER NOT NULL,
  grade               TEXT    NOT NULL CHECK (grade IN ('platin','gold','silber','bronze')),
  name                TEXT    NOT NULL,   -- auch versteckte tragen einen (311 von 311 gemessen)
  detail              TEXT,
  icon_url            TEXT,
  hidden              INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1)),
  group_id            TEXT    NOT NULL DEFAULT 'default',  -- nur 'default' zaehlt aufs Platin
  earned              INTEGER NOT NULL DEFAULT 0 CHECK (earned IN (0,1)),
  earned_at           TEXT,               -- NULL = nicht erspielt
  earned_rate         REAL,               -- Anteil der Spieler; NULL = unbekannt, nie 0
  progress_target     INTEGER,            -- die vier Fortschrittsspalten sind PS5-eigen
  progress_value      INTEGER,            -- und bleiben sonst LEER (Abschnitt 3)
  progress_rate       REAL,
  progressed_at       TEXT,
  synced_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (np_communication_id, trophy_id)
) WITHOUT ROWID;

CREATE INDEX idx_trophy_erspielt ON trophy(earned_at) WHERE earned = 1;

CREATE TABLE trophy_group (
  np_communication_id TEXT NOT NULL REFERENCES trophy_progress(np_communication_id) ON DELETE CASCADE,
  group_id            TEXT NOT NULL,
  name                TEXT NOT NULL,
  detail              TEXT,
  icon_url            TEXT,
  defined_bronze      INTEGER NOT NULL DEFAULT 0,
  defined_silver      INTEGER NOT NULL DEFAULT 0,
  defined_gold        INTEGER NOT NULL DEFAULT 0,
  defined_platinum    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (np_communication_id, group_id)
) WITHOUT ROWID;
```

**`WITHOUT ROWID` ist hier die Antwort auf die Schreibgrenze**, nicht Feinschliff:
Eine normale Tabelle schriebe zwei Zeilen je Trophäe. Derselbe Schlüssel ist
zugleich der Index für „die Trophäen eines Spiels" — 91 gelesene Zeilen statt
eines Laufs über 18 355 — und deckt den Fremdschlüssel ab. **Der Teilindex ist
der Preis des Feeds:** Ohne ihn liest der Dashboard-Feed bei jedem Start den
ganzen Bestand; mit ihm steigt die Erstbefüllung von 18 400 auf 29 500
Schreibungen (15.4).

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

Es gibt genau zwei Automatiken, und sie greifen **ausschliesslich beim ersten Auftreten** einer Trophäenliste an einem Release – solange keine `play_status`-Zeile existiert oder sie `nicht_gespielt` lautet (eine von Hand angelegte Disc, die inzwischen gestartet wurde):

1. `progress_pct = 100` → `komplettiert`
2. `progress_pct > 0` → `am_spielen`

Die Vorbelegung ist ein set-basiertes Statement (`PlayStatusRepository.vorbelegen`) und läuft am Ende jeder Normalisierung sowie nach jeder Zuordnung (7.2), weil ein Status am Release hängt und erst mit der Zuordnung ein Release existiert. Den Bestand, der vor Stufe 6 zugeordnet wurde, holt Migration 0006 einmalig nach (`INSERT OR IGNORE`); der Deploy-Job protokolliert die Zeilenzahl.

**Danach ändert kein automatischer Prozess je wieder einen Status.** Jede spätere Trophäenänderung wandert in die Prüfliste (Abschnitt 8) und wartet auf deine Entscheidung. Auch der Fall "war 100 %, ist durch ein neues DLC nur noch 80 %" führt nicht zu einer stillen Statusänderung – er wird vorgelegt.

**Warum 100 % und nicht Platin:** Platin wird bei den meisten Titeln für das Grundspiel vergeben; DLC-Trophäen zählen nicht hinein. Platin ist damit kein Beleg dafür, dass ein Spiel fertig ist. 100 % ist einer. Deshalb ist Platin nur eine Anzeige, keine Statusquelle.

`komplettiert` und `durchgespielt` gelten in allen Listen und Auswertungen gleichermassen als erledigt. Der Unterschied ist rein beschreibend.

Alle übrigen Abweichungen zwischen Trophäen und Bewertung werden angezeigt, nicht korrigiert. `durchgespielt` bei 20 % Trophäenfortschritt ist ein gültiger Zustand – Story beendet, Sammelaufgaben liegen gelassen.

**Manuell setzen = durchgesehen.** `PUT /api/releases/:id/play-status` setzt Status, Start- und Enddatum, Bewertung (1–10) und Notiz. Wer den Status im Spieldetail setzt, hat das Spiel gesehen: Der Aufruf stempelt zugleich `reviewed_*` auf den aktuellen Trophäenstand und löscht einen offenen `review_queue`-Eintrag (8.1) – sonst legte die Prüfliste dasselbe Spiel gleich noch einmal vor.

Seit der Kopplung (5.5) zieht der Aufruf To-Do und Backlog nach: `am_spielen` legt den To-Do-Eintrag an, `pausiert` den Backlog-Eintrag, `durchgespielt`/`komplettiert`/`abgebrochen` erledigt ihn. Ein `pausiert` ohne Backlog-Eintrag gibt es deshalb nicht mehr – bis Version 28 war das ausdrücklich erlaubt. `PATCH /api/releases/:id/play-status { status }` setzt nur den Status und lässt Datum, Bewertung und Notiz stehen; er koppelt und stempelt wie `PUT`.
