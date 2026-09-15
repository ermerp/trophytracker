# Trophytracker – Technische Spezifikation

*Version 25 – Nachbesserung nach der Abnahme von Stufe 10: Plattform beim Wunsch wählbar (Release nur aus Wunsch zählt nicht zur Sammlung), IGDB-Treffer nur mit fremden Plattformen fallen heraus.*

## 1. Use Cases

| # | Use Case | Abgedeckt durch |
|---|---|---|
| 1 | Sammlung verwalten | `game`, `release`, `physical_copy`, `digital_entitlement` |
| 2 | Fortschritt verfolgen – über Trophäen und eigene Bewertung | `trophy_progress` + `play_status` |
| 3 | Lücken erkennen: bisher nur digital, Disc existiert | `release.physical_release_status`, `v_luecken`; verworfene Lücken siehe 5.3 |
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
| Hosting Frontend | Static Assets im selben Worker |
| Geplanter Sync | Cloudflare Cron Trigger |
| Feed-Import | GitHub Action (siehe 7.3) |
| Deployment/CLI | Wrangler |
| PSN-Trophäen | `psn-api` (npm) oder direkte fetch-Aufrufe |
| Metadaten/Cover | IGDB API (kostenlos über Twitch-Client-ID) |
| Gebrauchtpreise *(optional)* | rebuy / medimops Produktdatenfeed über AWIN |
| Store-Preise *(optional)* | PSN Store Katalog-Endpunkte |

Migrations über Wrangler D1 Migrations. Repository auf GitHub, die Deploy-Action baut und deployt bei Push auf `main`.

**Hinweis zur CPU-Grenze:** Der Free Tier begrenzt auf 10 ms CPU pro Aufruf. D1-Abfragen und Netzwerk-Wartezeit zählen nicht mit, nur Rechenzeit im Worker selbst. Die zusätzlichen Views sind daher unkritisch. Kritisch bleibt ausschliesslich das Parsen grosser Fremddaten – siehe 7.3.

**Hinweis zur Zeilenlese-Grenze:** D1 zählt gelesene Zeilen – gescannte, nicht zurückgegebene – und
der Free Tier erlaubt 5 Millionen am Tag. Ist die Grenze erreicht, antwortet jede Abfrage aus dem
Worker bis Mitternacht UTC mit einem Fehler; die Anwendung ist bis dahin unbenutzbar, die Daten
bleiben unberührt. Das ist am 13.09.2026 eingetreten: Ohne Indizes auf den Fremdschlüsseln war
jeder Join auf `trophy_progress.release_id` ein Tabellenscan, und die korrelierten Unterabfragen
der Sammlungsansicht lasen 160 000 Zeilen je Seite (741 000 bei Sortierung nach „zuletzt
gespielt"). Seit Migration 0008 trägt jeder Fremdschlüssel einen Index; dieselben Abfragen lesen
2 000 bis 5 000 Zeilen. `test/lesekosten.spec.ts` misst die heißen Abfragen gegen einen Bestand in
Produktionsgröße und hält Obergrenzen fest. Regel: Wer eine Tabelle mit `REFERENCES` anlegt, legt
den Index in derselben Migration an; korrelierte Unterabfragen laufen nur über indizierte Spalten.
Migration 0011 holt den in 0008 übersehenen Index auf `plan_entry.game_id` nach (bis Stufe 10 hing
kein Eintrag an einem Spiel) und legt einen auf `game.igdb_id` an; die Wunschliste liest bei 300
Wünschen rund 900 Zeilen, die Absichten eines Spiels sechs.

**Cron Trigger helfen dagegen nicht.** Auf dem Free Tier gilt für sie dieselbe 10-ms-Grenze wie für
normale Anfragen; die 30 Sekunden gibt es erst im Bezahlplan. Der Schutz muss deshalb aus dem
Entwurf kommen, nicht aus dem Auslöser: **Arbeit pro Aufruf begrenzen** (der Trophäen-Sync holt
eine Seite à 100 Titel und merkt sich den nächsten Offset) und **Rohdaten ungeparst ablegen**.

Die Grenze ist gemessen: Mit zwei Seiten je Aufruf lag die CPU-Zeit im p99 bei 8,7 ms von 10 ms
erlaubten, mit einer Seite bei rund der Hälfte. Wer die Seitenzahl ändert, misst nach.

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

**Ein Exemplar belegt die Disc-Fassung.** `physical_copy` hängt an einem konkreten Release; wer ein
Exemplar einträgt, hat die Disc nachweislich in der Hand. Das Anlegen setzt deshalb
`physical_release_status` von `unbekannt` auf `ja` mit `physical_source = 'manuell'` – und nur
das: ein `nein` des Nutzers und ein bereits gesetztes `ja` (etwa aus dem Feed) bleiben unangetastet.
`physical_release_region` bleibt dabei NULL, denn der Besitz belegt die Existenz der Disc, nicht ihre
Region; ein geratenes `PAL` würde den Feed-Abgleich in Stufe 18 irreführen. Das Löschen eines
Exemplars setzt nichts zurück – dass ein Exemplar weg ist, sagt nichts darüber, ob es die Disc gibt.

**Anlegen von Hand.** Spiel und Release entstehen nicht nur aus der Zuordnung (7.2), sondern auch
über `POST /api/games` und `POST /api/releases` – für die Disc, die nie gestartet wurde und deshalb
keine Trophäenliste hat. `POST /api/games` prüft den Titelschlüssel: Gibt es schon ein Spiel mit
demselben `sort_title`, antwortet die Route mit `409` und den Kandidaten, und der Nutzer entscheidet,
ob er dort ein Release anhängt oder mit `trotzdem` ein zweites Spiel anlegt. `DELETE` auf Release
oder Spiel gibt anhängende Trophäenlisten in die Zuordnung zurück (`release_id`, `matched_at` und
`matched_source` werden NULL); Exemplare und Berechtigungen kaskadieren. Bleibt ein Spiel ohne
Release, wird es mit gelöscht – **es sei denn, eine offene Absicht hängt daran** (`plan_entry` mit
`game_id` und `status = 'offen'`): Sonst verschwände ein Wunsch per CASCADE, sobald ein probeweise
angelegtes Release wieder entfernt wird.

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
  reviewed_at             TEXT,

  release_id          INTEGER REFERENCES release(id) ON DELETE SET NULL
);

CREATE INDEX idx_trophy_unmatched ON trophy_progress(release_id) WHERE release_id IS NULL;
CREATE INDEX idx_trophy_release   ON trophy_progress(release_id);   -- Migration 0008, siehe Abschnitt 2
```

Migration 0005 ergänzt `matched_at` und `matched_source` (`automatisch` | `manuell`). Sie halten
fest, wann und wodurch `release_id` gesetzt wurde — die Grundlage dafür, eine Zuordnung später
nachvollziehen und gezielt korrigieren zu können (7.2).

**Platin-Logik:** dreiwertig, nicht Boolean – `erspielt` / `offen` / `nicht_verfuegbar`.
Die Prüfung auf `defined_platinum > 0` ist zwingend: **93 von 431 Titeln der echten Sammlung
definieren gar keine Platin-Trophäe** (22 %). Als Boolean modelliert würden sie dauerhaft als
"Platin offen" erscheinen – dieselbe Haltung wie bei `physical_release_status`.

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

Anders als die Prüfliste legt der Aufruf aber **keinen `plan_entry` an**: „Auf To-Do" und „Ins Backlog" sind Entscheidungen der Triage (8.1), das Spieldetail setzt nur die Bewertung. Ein Release kann deshalb `pausiert` sein, ohne auf einer Liste zu stehen – das ist kein Fehlzustand, den ein späterer Abgleich reparieren dürfte.

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

**Anlegen und Duplikate (Stufe 10, Entscheidungen des Nutzers vom 14.09.2026).** Ein Eintrag von Hand
hat `origin = 'manuell'` und genau eine Quelle: ein Spiel (`game_id`), ein Release (`release_id`),
ein IGDB-Treffer (legt bei Bedarf das Spiel an, Abschnitt 3) oder Freitext (`title_raw`). Freitext
entsteht nur über den ausdrücklichen Knopf nach einer IGDB-Suche (8.2) – kein Fallback, eine
Entscheidung; er hat weder Cover noch Rang (8.3).

- **Die Plattform darf leer bleiben und fällt nie auf einen Standardwert.** Ein Wunsch am Spiel
  sagt „das Spiel", ein Wunsch am Release sagt „diese Fassung". Ein geratenes PS5 bei einem
  angekündigten Titel wäre eine Aussage, die nie getroffen wurde. Wählbar ist sie überall
  (Wunschliste wie Spieldetail); mit Wahl entsteht das Release, falls es fehlt (Abschnitt 3).
  Freitext hat kein Spiel und deshalb nie eine Plattform.
- **Ein offener Eintrag am Spiel und einer an einem seiner Releases sind kein Duplikat**, sondern
  zwei verschiedene Aussagen; sie blockieren sich nicht. Ein zweiter offener Eintrag **derselben Art
  an genau demselben Ziel** ist eines und wird mit `409` abgewiesen. Erledigte und verworfene
  Einträge blockieren nichts – ein Sinneswandel ist ein Feld-Update auf `offen`, kein Neuanlegen.

### 5.1 Priorität und Favorit

Zwei getrennte Felder, weil sie zwei verschiedene Fragen beantworten:

- `priority` (1–5) ist der Regler für die **Sortierung**. Er geht in die Rangformel ein.
- `is_favorite` ist der binäre Anker für **"das will ich wirklich"**. Er filtert, statt zu sortieren, und überlebt jede Änderung der Rangformel unbeschadet.

Ein Favorit mit mässiger Kritikerwertung soll nicht nach unten rutschen, nur weil die Formel gerade anders gewichtet ist. Deshalb ist Favorit kein Prioritätswert 6.

### 5.3 Eine Lücke bewusst verwerfen

Nicht jede Lücke ist ein Kaufwunsch. Ein Spiel, das digital vorliegt und als Disc existiert, taucht
in `v_luecken` auf – aber vielleicht ist die physische Fassung gar nicht gewollt: kein
Sammlerinteresse, zu teuer, oder die digitale Fassung genügt.

**Dafür braucht es kein neues Feld.** Ein `plan_entry` mit `kind = 'kauf'`, `origin = 'luecke'` und
`status = 'verworfen'` sagt genau das aus: geprüft und entschieden. `resolved_at` hält fest, wann.

Die Entscheidung bleibt damit dort, wo alle Absichten liegen, und die Historie geht nicht verloren –
derselbe Grund, aus dem Wunschliste, To-Do, Backlog und Kaufliste in *einer* Tabelle stehen. Ein
späterer Sinneswandel ist ein Feld-Update auf `offen`, kein Neuanlegen.

**Folgen für die Sichten:**

- `v_kaufkandidaten` blendet Releases mit verworfenem Kaufeintrag aus. Bisher filterte die View nur
  auf `status = 'offen'`, wodurch ein verworfener Eintrag den Kandidaten wieder auftauchen ließ –
  das war ein Fehler.
- `v_luecken` behält den Eintrag, kennzeichnet ihn aber über eine Spalte `verworfen`. Eine Lücke ist
  eine **Tatsache** (digital gespielt, Disc existiert, nicht im Regal); dass sie nicht geschlossen
  werden soll, ist eine **Absicht**. Die Tatsache zu löschen, weil die Absicht fehlt, wäre dieselbe
  Vermischung, die Abschnitt 1 als Designfehler benennt.
- Die Lückenansicht blendet verworfene Einträge **standardmäßig aus**, mit einem Umschalter für
  "auch verworfene zeigen". So verschwinden sie aus dem Blick, ohne aus den Daten zu verschwinden.

Umsetzung mit Stufe 14 (Lückenansicht) und Stufe 15 (Kaufliste).

### 5.2 Rangberechnung (Use Case 10)

Der Rang wird **bei der Abfrage berechnet und nie gespeichert**. Gespeichert werden nur die Bestandteile: `game.critic_score`, `plan_entry.priority`, später der Preis. Sobald die Gewichtung angepasst wird – und das wird sie – ist das ein Zahlenwechsel statt einer Datenmigration.

```sql
-- Gewichte liegen in app_setting und sind in den Einstellungen verstellbar.
score = (COALESCE(critic_score, 70) / 100.0) * w_critic
      + (priority / 5.0)                     * w_priority
      + (is_favorite * w_favorite)
```

`COALESCE(critic_score, 70)` ist bewusst gewählt: ein Spiel ohne Wertung soll weder bevorzugt noch bestraft werden. Ein `0` würde unbewertete Titel dauerhaft ans Listenende drücken.

Die Formel steht als pure Funktion in `src/domain/rang.ts` und wird in der Route gerechnet, nicht in SQL: Das Repository liefert die Bestandteile, die Route holt die Gewichte aus `app_setting` und sortiert. Seit Stufe 10 sortiert die Wunschliste danach, Stufe 15 nutzt dieselbe Funktion für die Kaufliste; die Gewichte sind seit Stufe 10 in den Einstellungen verstellbar. Einträge ohne Spiel (Freitext) haben keinen Rang und stehen am Ende (8.3). Die Oberfläche zeigt den Rang als Zahl von 0 bis 100.

Später kommt der Preis als vierter Faktor hinzu und liefert eine Sortierung nach "viel Spiel pro Euro". Bis dahin bleibt `w_price` auf 0.

```sql
CREATE TABLE app_setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- w_critic, w_priority, w_favorite, w_price
```

Vorbelegung aus Migration 0001: `w_critic = 0.5`, `w_priority = 0.3`, `w_favorite = 0.2`,
`w_price = 0`. Die drei wirksamen summieren sich auf 1, ein Favorit erreicht damit maximal
1.0 und alles Übrige höchstens 0.8 – `is_favorite` wirkt additiv. Seeds werden als
`INSERT OR IGNORE` geschrieben, damit ein erneuter Lauf einen angepassten Wert nie
zurücksetzt.

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

**Ablage der Zugangsdaten.** Eine frühere Fassung dieses Abschnitts verlangte „Tokens liegen als
Cloudflare Secret, nicht in D1" und gleichzeitig ein Eingabefeld für ein neues NPSSO. Das schließt
sich aus: Ein Worker kann keine Cloudflare Secrets schreiben, und Secrets-Store-Bindings sind zur
Laufzeit ausschließlich lesbar. Ein Eingabefeld braucht aber eine zur Laufzeit beschreibbare Ablage.

Deshalb: **NPSSO und Refresh-Token liegen AES-GCM-verschlüsselt in `psn_credentials`**, der
Schlüssel als Cloudflare Secret `NPSSO_KEY`. Damit bleibt die Eingabe über die Oberfläche möglich –
auch vom Handy –, und ein Datenbank-Dump enthält keinen verwertbaren Zugang. Der Sinn der
ursprünglichen Regel ist erfüllt, ihr Wortlaut nicht.

Der Refresh-Token nimmt denselben Weg, weil er rotiert und damit genau das Problem hat, an dem die
Secret-Lösung scheitert.

**Reihenfolge beim Anmelden:**

1. Refresh-Token vorhanden und `refresh_expires_at` in der Zukunft → damit einen Access Token holen
2. Schlägt das fehl oder fehlt der Token → aus dem NPSSO neu ableiten, frischen Refresh-Token ablegen
3. Scheitert auch das → `status = 'abgelaufen'`, vorhandene Daten bleiben unangetastet

Der normale Sync fasst das NPSSO damit gar nicht an – schonend gegenüber einer inoffiziellen
Schnittstelle.

**Weder NPSSO noch Refresh- oder Access Token dürfen jemals in einer API-Antwort oder im Log
erscheinen, auch nicht gekürzt.** Durchgesetzt wird das über eine Hülle `Geheimnis`, deren
`toString()` und `toJSON()` redigieren; der Klartext ist nur über einen ausdrücklichen Aufruf
erreichbar. Daraus folgt außerdem: Die Antwort des Token-Endpunkts wird **nie** in
`psn_raw_response` geschrieben – sie enthält den Refresh-Token und stünde sonst in jedem Dump.

### 7.2 Das Matching-Problem

PSN-Trophäentitel lassen sich nicht zuverlässig automatisch auf Releases abbilden: abweichende Editionsnamen, regionale Varianten mit eigener `npCommunicationId`, Cross-Gen-Titel mit geteilter Trophäenliste, Spiele mit mehreren Listen.

**Kein vollautomatisches Matching bauen.** Stattdessen:

1. Vorschlag per normalisiertem Titelvergleich (`src/domain/titel.ts`): Kleinschreibung, Diakritika
   gefaltet, Markenzeichen und Sonderzeichen entfernt, Editions- und Listenzusätze abgeschnitten
2. Eindeutiger Treffer mit hoher Ähnlichkeit → automatisch zuordnen. Konkret: **genau ein** Release,
   dessen Spiel denselben Titelschlüssel trägt und dessen Plattform in der Liste vorkommt, und das
   noch keine Liste trägt. Zwei Kandidaten bedeuten, dass die Entscheidung dem Nutzer gehört
3. Alles andere landet in "nicht zugeordnet"
4. Eigene Oberfläche zum Zuordnen, inklusive Anlegen von Spiel und Release aus dem Trophäeneintrag heraus
5. Einmal gesetzte Zuordnungen sind dauerhaft und werden nie automatisch überschrieben.
   `matched_source` hält fest, ob sie automatisch entstand oder vom Nutzer gesetzt wurde

**Gruppierung.** Trophäenlisten mit gleichem Titelschlüssel werden als *ein* Spiel mit je einem
Release vorgeschlagen – GTA V mit seinen drei Listen wird ein `game` mit drei `release`-Zeilen.
Beanspruchen zwei Listen dieselbe Plattform, werden sie **getrennt** vorgeschlagen: `UNIQUE
(game_id, platform, edition, region)` ließe das nicht zu, und meist sind es tatsächlich
verschiedene Spiele. In den echten Daten trifft es „Call of Duty Modern Warfare" (2019) und
„Call of Duty: Modern Warfare Remastered" (2016), die der Editionsfilter zusammenzieht.

**Geteilte Listen.** 33 der 431 Listen gelten für mehrere Plattformen (`PS3,PSVITA,PS4`). Sony
teilt dort den Fortschritt: Es gibt einen Wert und ein mögliches Platin, und die Antwort verrät
nicht, wo gespielt wurde. Daraus entsteht **ein** Release, dessen Plattform der Nutzer wählt –
vorausgewählt ist die neueste. Ein Release steht für das eigene Exemplar, die Trophäenliste für
Sonys Zählung; beide Releases anzulegen würde Besitz behaupten, den es vielleicht nicht gibt.

**Getrennte Listen sind unabhängig.** Hotline Miami 2 hat eine PS5-Liste bei 82 % und eine
`PS3,PSVITA,PS4`-Liste bei 3 %. Mehrfaches Platin ist damit möglich und wird getrennt geführt.

**Die Trophäenstruktur ist ein Signal, kein Beweis.** Ein portiertes Spiel behält seine Liste, ein
Remake bekommt eine neue. Gemessen an der Sammlung trennt das zuverlässig: Shadow of the Colossus
PS3 18/6/6/1 gegen PS4 25/7/5/1, Uncharted PS3 36/8/3/1 gegen PS4 41/8/4/1 — jeweils verschiedene
Spiele. Aber GTA V hat PS3 47/8/3/1 und PS4/PS5 59/15/3/1, weil die neueren Fassungen
Online-Trophäen brachten, und ist trotzdem ein Spiel. Abweichungen erzeugen deshalb einen
**Hinweis**, keine Trennung.

**„Remastered" und „Remake" werden nicht abgeschnitten**, Editionszusätze schon. Grund aus den
Daten: 20 Titel tragen „Remastered" und sind eigenständige Spiele mit eigener Liste. Dagegen haben
„BioShock Infinite" (PS3) und „BioShock Infinite: The Complete Edition" (PS4) exakt dieselbe
Struktur 55/24/1/1 — dasselbe Spiel mit DLC.

**Zuordnungen sind korrigierbar.** `PATCH /api/games/:id` benennt um,
`POST /api/games/release/:id/abtrennen` löst ein Release in ein neues Spiel heraus. Das sind die
einzigen Stellen, die eine bestehende Zuordnung verändern — auf ausdrückliche Anweisung des
Nutzers. Die Regel, dass **kein automatischer Prozess** eine Zuordnung überschreibt, bleibt
unberührt.

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

Abruf zusammen mit den übrigen IGDB-Metadaten, nicht als eigener Job. `critic_source` hält fest, woher der Wert stammt, damit ein späterer Quellenwechsel nachvollziehbar bleibt. Der Abgleich schreibt `critic_*` nur, wenn `critic_source` leer ist oder `'igdb'` lautet – ein von Hand gesetzter Wert überlebt jede Auffrischung.

## 7.6 IGDB-Abgleich (Stufe 9)

**Zugang.** IGDB läuft über eine Twitch-Anwendung: Client-ID und Client-Secret ergeben per Client-Credentials ein App-Token, das rund 60 Tage gilt. Beide Werte liegen als Cloudflare Secrets `IGDB_CLIENT_ID` und `IGDB_CLIENT_SECRET`. Das Token wird **im Speicher der Worker-Instanz** gehalten, nicht in D1: Es rotiert nicht, ist an die Client-ID gebunden und jederzeit neu erzeugbar – ein neues Isolate holt es sich, ein 401 von IGDB erneuert es genau einmal. Client-Secret und Token laufen als `Geheimnis` (7.1); die Antwort des Token-Endpunkts wird nie protokolliert oder gespeichert. Fehlen die Secrets, antworten nur die Routen mit 503, die IGDB tatsächlich anfragen – die Anwendung bleibt ohne IGDB benutzbar.

**Ratenlimit.** IGDB erlaubt vier Anfragen je Sekunde. Der Client hält zwischen zwei Anfragen mindestens 260 ms Abstand (Wartezeit zählt nicht als CPU); ein 429 beendet den laufenden Schritt sauber, die Oberfläche ruft später erneut.

**Abgleich in Schritten.** `POST /api/igdb/abgleich` sucht je Aufruf für acht Spiele, bei denen noch nie gesucht wurde (`igdb_id IS NULL AND igdb_checked_at IS NULL AND igdb_declined_at IS NULL`), in der Reihenfolge ihrer Id. Der Fortschritt steht in `igdb_checked_at`; die Oberfläche ruft, solange `weiter` zurückkommt – dasselbe Muster wie beim Trophäen-Sync (Abschnitt 2). Die Suche ist auf die PlayStation-Plattformen eingeschränkt (IGDB-IDs 9, 46, 48, 167; PSVR 165 und PSVR2 390 zählen als PS4 und PS5) und schließt Mods, Forks und Updates schon in der Abfrage aus – für „Genshin Impact" bestanden sonst alle zehn Treffer aus Updates.

**Suchbegriff.** `suchbegriff(title)` (`src/domain/igdb.ts`) bereinigt nur für die Anfrage, nie für den Schlüssel: ein Jahr in Klammern aus der Umbenennung durch den Nutzer („God of War (2018)") fällt weg, an Wörter geklebte Ziffern werden getrennt („Velocity2X" → „Velocity 2X"; IGDB findet nur diese Schreibweise).

**Exakte Namensabfrage.** Trifft nach der Volltextsuche kein Kandidat den Schlüssel, fragt der Abgleich zusätzlich exakt nach dem Namen (`name ~ "…"`, Groß-/Kleinschreibung egal) und mischt das Ergebnis vorn ein. IGDBs Volltextsuche übergeht „THE FINALS" und liefert Final Fantasy, während der exakte Name sofort trifft; und in der Handsuche findet „Rainbow Six Siege" damit das Grundspiel, das IGDB ohne „Tom Clancy's" führt und das die Volltextsuche hinter dreißig Editionen versteckt. Eine Anfrage mehr für die rund 50 Spiele ohne Schlüsseltreffer, nicht für alle.

**Nur PlayStation.** Die Rückfälle unten laufen ohne Plattformfilter, weil manche IGDB-Einträge gar keine Plattform nennen. Einträge, die *ausschließlich* fremde Plattformen nennen, fallen deshalb schon in der Normalisierung heraus (`normalisiereTreffer`), wie Mods und Updates – sonst lieferte „Zelda" in der Wunschlisten-Suche Switch-Spiele (Rückmeldung aus der Abnahme von Stufe 10). „Keine Plattform genannt" bleibt zugelassen: fehlende Daten sind kein Gegenbeweis.

**Rückfälle, nur wenn die Suche leer bleibt** (`kandidatenSuchen`, `src/sync/igdb.ts`; trifft 11 von 420 Titeln, kostet also fast nichts): erst der gekürzte Begriff – alles ab „ - ", „:" oder „/" fällt weg („CastleStorm - Complete Edition" → „CastleStorm", „Type:Rider" → „Type") – ohne Plattformfilter, weil manche IGDB-Einträge keine Plattform nennen; dann IGDBs Teilstringsuche über den Namen (`name ~ *"…"*`), der einzige Weg zu „That's You!" oder „We Were Here Too"; zuletzt dieselbe Teilstringsuche mit dem unbereinigten Titel, weil IGDB „OlliOlli2" ohne Leerzeichen schreibt. Was danach noch fehlt (aus der ersten Abnahme: „Poker Night at the Inventory 2", „TownsmenVR", „Wake-up Club"), kennt IGDB unter keiner Schreibweise – das bleibt „Gibt es bei IGDB nicht" oder eine Suche von Hand.

**Reihenfolge der Kandidaten** (`ordneKandidaten`): Die Suche holt 30 Treffer statt 10, weil bei DLC-reichen Titeln das Hauptspiel sonst gar nicht im Ergebnis steht („Batman: Arkham Knight" an Position 13 hinter zwölf Skin-Paketen, „For Honor" an 23). Gespeichert und angezeigt werden die ersten zehn nach dieser Ordnung: Schlüsseltreffer zuerst, dann Hauptspiel-artige Typen (Hauptspiel, Bundle, eigenständige Erweiterung, Remake, Remaster, erweitertes Spiel, Portierung) vor DLC, Erweiterung, Episode, Staffel und Paket, dann Kandidaten mit einer Plattform des Spiels, innerhalb dessen IGDBs Reihenfolge. Die eingebaute Suche (`GET /api/igdb/search`) nutzt dieselben Rückfälle und dieselbe Ordnung; `plattformen=PS4,PS5` gibt ihr die Plattformen mit – ab Stufe 11 auch aus der Wunschliste, wenn dort eine Plattform neben dem Titel steht. Die Ordnung ändert nichts an der automatischen Verknüpfung.

**Eindeutiger Treffer.** Die Regel aus 7.2, auf IGDB übertragen: Automatisch verknüpft wird nur, wenn **genau ein** Kandidat denselben Titelschlüssel trägt wie der bereinigte Suchbegriff. Der Schlüssel wird dabei frisch aus dem Titel berechnet, nicht aus `sort_title` gelesen – die Spalte ist abgeleitet und veraltet still. Drei Verfeinerungen aus der Messung gegen die echten Titel:

- Editionen verweisen mit `version_parent` auf ihr Hauptspiel; ist das Hauptspiel selbst Kandidat, zählt die Edition nicht als zweiter Treffer.
- Ein Bundle gleichen Namens (GTA V als Paket mit GTA Online) zählt nicht gegen das Hauptspiel; nur ohne anderes bleibt es selbst Kandidat.
- Nennt der Kandidat Plattformen und das Spiel hat Releases, muss sich mindestens eine decken. Ein Kandidat ohne Plattformangabe wird nicht ausgeschlossen – fehlende Daten sind kein Gegenbeweis. Genau diese Prüfung löst „God of War (2018)" (PS4) und „God of War (2005)" (PS3) beide richtig auf.

Alles andere landet mit seinen Kandidaten in `igdb_candidate` und wartet in der Prüfansicht. **Gemessen am 14.09.2026 gegen die 420 Spiele der Produktion:** 372 eindeutig, 5 echt mehrdeutig (etwa MediEvil als Remake oder Portierung, Tekken 6), 32 mit Kandidaten ohne Schlüsseltreffer (Abkürzungen, römische Ziffern, fehlende Untertitel), 11 ohne Treffer. In der Stichprobe aller automatischen Treffer keine Fehlzuordnung. Die Messung lief als Skript außerhalb des Repositories; ins Repository kamen nur die Zahlen.

**Was eine Verknüpfung schreibt.** `igdb_id`, `igdb_slug`, `cover_url` (264 × 374, `t_cover_big`), `release_date` aus `first_release_date`, `release_status` daraus abgeleitet (Datum in der Zukunft → `angekuendigt`, keines → `unbekannt`, nie `erschienen` ohne Datum), `critic_score` (gerundetes `aggregated_rating`) und `critic_score_count` mit `critic_source = 'igdb'`, dazu `igdb_matched_at`, `igdb_matched_source` und `igdb_synced_at`.

**Entscheidungen des Nutzers, alle gespeichert und alle korrigierbar** (CLAUDE.md):

- Kandidat übernehmen oder über die eingebaute Suche einen anderen Eintrag wählen → Verknüpfung mit `igdb_matched_source = 'manuell'`; die Metadaten kommen mit einer Anfrage nach Id.
- „Gibt es bei IGDB nicht" → `igdb_declined_at`; das Spiel verlässt Abgleich und Prüfansicht. „Doch suchen" nimmt es zurück.
- Verknüpfung lösen → alles, was von IGDB kam, wird entfernt (Cover, Datum, Status zurück auf `unbekannt`, Wertung nur bei Quelle `'igdb'`); `igdb_checked_at` wird NULL, der nächste Abgleich sucht erneut.
- Umbenennen eines unverknüpften, nicht abgelehnten Spiels setzt `igdb_checked_at` zurück: Der neue Titel ist meist genau die Korrektur, mit der IGDB den Eintrag findet.
- „Offene erneut suchen" (`POST /api/igdb/erneut-suchen`) setzt alle Spiele zur Prüfung zurück in den Abgleich und verwirft ihre Kandidaten – für den Fall, dass die Suchregel besser geworden ist. Verknüpfungen und Ablehnungen bleiben unberührt.

**Auffrischen.** `POST /api/igdb/auffrischen` holt für die 50 am längsten nicht aktualisierten verknüpften Spiele Wertung, Cover und Datum in **einer** Anfrage (`where id = (…)`) erneut. Kritikerwertungen ändern sich mit jeder neuen Rezension; Stufe 17 hängt den Schritt an den Cron.

**Physische Fassung aus IGDB – für Stufe 14 entschieden.** IGDB führt unter `external_games` Händler- und Store-Einträge je Spiel mit `media` (1 = digital, 2 = physisch) und `platform`; gemessen am 14.09.2026 gegen die 419 verknüpften Spiele: 273 haben Einträge, **109 einen physischen** (überwiegend Amazon-Artikelnummern), 22 einen digitalen. Stufe 14 setzt daraus `physical_release_status = 'ja'` mit `physical_source = 'igdb'`, wenn ein physischer Eintrag zu einer Plattform des Releases existiert – und **nur** `ja`: Fehlen sagt nichts, `nein` bleibt Handarbeit (Abschnitt 3). Der AWIN-Feed (7.3, Stufe 18) ist die zweite Quelle; beide dürfen ein `nein` des Nutzers nicht überschreiben. Ob abgelehnte Spiele in `v_ohne_igdb` und damit in der Ansicht „Ohne Zuordnung" erscheinen sollen, entscheidet Stufe 11; die View ist unverändert.

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
| `reviewed_at IS NULL` und `progress_pct < 100` – noch nie durchgesehen, nicht komplett | `erstimport` |
| `earned_total` gestiegen, Status ist gesetzt und nicht `am_spielen` | `neue_trophaeen` |
| `defined_total` gestiegen | `dlc_erweitert` |

Der Sync **schreibt nur in die Warteschlange**, er ändert nie einen Status. Steht ein Release schon in der Warteschlange, wird `detail` aktualisiert statt ein zweiter Eintrag angelegt.

`erstimport` hängt an `reviewed_at`, nicht an der Existenz einer `play_status`-Zeile: Seit Stufe 6 belegt der Sync den Status vor (4.2), fast jedes Release hat also eine Zeile. Die Ersteinrichtung zeigt die Vorbelegung und lässt sie bestätigen oder ändern. Ein im Spieldetail von Hand gesetzter Status zählt bereits als Durchsicht und erscheint nicht mehr als `erstimport`.

**100 % wird nicht vorgelegt.** Ein Titel mit 100 % hat alle Trophäen des Hauptspiels *und* aller DLC – er ist komplettiert, und die Vorbelegung (4.2) hat den Status bereits gesetzt. Da gibt es nichts zu entscheiden, und eine Prüfliste, die Unstrittiges vorlegt, verbraucht die Geduld, die für die strittigen Fälle gebraucht wird. Solche Titel werden deshalb **still als durchgesehen gestempelt** statt eingereiht: `reviewed_*` bekommt den aktuellen Stand, `play_status` bleibt unberührt. Der Stempel ist kein Urteil, sondern der Referenzpunkt – erhöht später ein DLC die Trophäenzahl, fällt der Titel unter 100 % und die Änderungserkennung (Stufe 13) legt ihn vor. Ohne Stempel gäbe es dafür keinen Vergleichswert. Beim Bestand betraf das rund ein Viertel aller Einträge.

**Auslöser der Einreihung.** `ReviewRepository.einreihen` (stempeln und einreihen in einem Batch) läuft am Ende jeder Normalisierung – direkt nach der Vorbelegung – und nach jeder Zuordnung, manuell wie automatisch. Den Bestand hat Migration 0007 einmalig eingereiht, Migration 0009 die 100-%-Titel wieder herausgenommen; der Deploy-Job protokolliert beide Zahlen. Stufe 7 kennt nur `erstimport`; `neue_trophaeen` und `dlc_erweitert` füllt die Änderungserkennung in Stufe 13.

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
| Überspringen | `play_status = 'unentschieden'`; Eintrag verschwindet, das Spiel bleibt über den Status-Filter der Sammlung auffindbar – die zweite Runde |

Die Aktionen setzen **nur den Status**; Bewertung, Notiz und Daten bleiben stehen. „Auf To-Do" und „Ins Backlog" legen den `plan_entry` nur an, wenn am Release noch kein offener `todo`- oder `backlog`-Eintrag hängt. Tastenkürzel 1–7 lösen die Aktionen aus.

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

**Befunde aus den echten Wunschlisten (gemessen am 14.09.2026, vor Stufe 11).** Zwölf Textdateien mit 332 Titelzeilen, gegen `game` und IGDB mit dem Suchweg aus 7.6 gemessen: 20 treffen über den Titelschlüssel ein Spiel der Sammlung, 199 sind bei IGDB eindeutig, 76 haben Kandidaten ohne eindeutigen Treffer, 37 finden nichts. Was der Import daraus können muss:

- **Form der Dateien:** eine Datei je Jahr mit Überschriften `-Januar` … `-Dezember` (Erscheinungsmonat, teils geschätzt), dazu eine Datei mit Abschnitten `PS4` / `PS3`. Vier Dateien mit BOM, eine in Windows-1252, alle mit CRLF. Der Parser nimmt Jahr aus dem Dateinamen und Monat aus der Überschrift als **ungefähres Erscheinungsdatum** mit, die Plattform aus dem Abschnitt; Schreibfehler in Überschriften („-Oktiber", „- August") dürfen nicht als Titel durchgehen.
- **Das Datum entscheidet Mehrdeutigkeiten.** Gleichnamige Spiele sind in den Listen häufig – „Layers of Fear" 2016 und das Remake 2023, „Resident Evil 2", „DOOM", „Oblivion" –, und der Monat aus der Liste liegt meist im richtigen Jahr. Ein Kandidat, dessen `first_release_date` im selben oder angrenzenden Jahr liegt, wird bevorzugt; das ist die Ergänzung zum Plattformabgleich aus 7.6.
- **Doppelungen** (10 von 332): derselbe Titel in zwei Jahren ist meist eine Verschiebung („Iron Harvest" 2020 → 2021) und wird einmal übernommen, mit dem späteren Datum; manchmal ist es ein anderes Spiel („Judgment" 2019, „Lost Judgment" 2021) – dann zeigt die Durchsicht beide.
- **Ohne Treffer** sind vor allem Tippfehler („Assasins", „Yakusa", „Devip May Cry"), deutsche Titel („Mittelerde: Schatten des Krieges", „Der Pate"), Sammelzeilen („Mass Effect 1+2+3", „Yakuza 1-4", „Dark Souls Trilogie") und Arbeitstitel. Genau dafür ist das korrigierbare Suchfeld da; ein automatischer Freitext-Fallback würde hier nur Müll erzeugen.
- **Schon in der Sammlung:** 20 Zeilen treffen ein vorhandenes Spiel. **Entscheidung des Nutzers (14.09.2026): Sie bleiben Wünsche.** Ein digital gespieltes Spiel auf der Wunschliste heißt „physisch besitzen wollen" – das ist genau die Lücke aus Use Case 3. Der Import legt sie also als `wunsch` an, mit `release_id` des vorhandenen Releases statt nur `game_id`, und die Durchsicht kennzeichnet sie („schon gespielt, Wunsch bleibt") statt sie auszusortieren.
- **Alle Dateien sind Wunschlisten**, auch die ältere ohne Jahresgliederung: `kind = 'wunsch'` für jede Zeile, kein Backlog-Import. Sammelzeilen („Mass Effect 1+2+3", „Overlord + 2") meinen mehrere Spiele; der Nutzer trennt sie in der Durchsicht, der Import rät nicht.
- **Bereinigte Fassung.** Aus der Messung ist eine zusammengeführte Liste entstanden (`wunschlisten/wunschliste-bereinigt.txt`, lokal; Tabulator-getrennt: Datum, Titel, Plattform, Status, Original, Hinweis). 330 Zeilen wurden 318 – Doppelte zusammengeführt, das spätere Datum gewinnt –, davon 20 in der Sammlung, 198 eindeutig (6 davon erst über das Jahr aus der Liste), 65 zu prüfen, 35 unbekannt. Der Import in Stufe 11 nimmt beides an: die rohen Jahresdateien und diese Form.

### 8.3 Nachpflege fehlender Metadaten (Use Case 12)

Einträge ohne IGDB-Zuordnung haben kein Cover, keine Kritikerwertung und kein Erscheinungsdatum. Sie funktionieren in allen Listen, fallen aber aus der Rangberechnung heraus (seit Stufe 10: `rang = null`, am Listenende).

Eine Ansicht in den Einstellungen sammelt sie listenübergreifend – aus Wunschliste, To-Do, Backlog und Sammlung gleichermassen – mit demselben IGDB-Suchfeld zum Nachziehen.

Der Aufwand ist gering, weil die Suche aus 8.2 wiederverwendet wird – seit Stufe 9 existiert sie als Komponente `IgdbSuche` im Spieldetail und in der IGDB-Zuordnung (7.6). Falls der Fall in der Praxis nie auftritt, kostet die Ansicht nichts; falls doch, hast du keinen Weg, ihn sonst zu finden.

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

Primär `BarcodeDetector` API (`formats: ['ean_13']`), Fallback `html5-qrcode`. Kamerazugriff braucht HTTPS – über die `workers.dev`-Adresse ohnehin gegeben.

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

Ab Migration 0002 kommen `npsso_ciphertext`, `npsso_iv`, `npsso_stored_at`, `refresh_ciphertext`
und `refresh_iv` hinzu; `psn_sync_run` bekommt `next_offset` für die seitenweise Blätterung.
Migration 0004 ergänzt `psn_sync_run.phase` (`abruf` | `normalisierung`) und
`psn_raw_response.normalized_at`.

**Der Sync hat zwei Phasen.** Erst werden alle Seiten roh abgelegt, danach normalisiert – beides
mit begrenzter Arbeit je Aufruf. Ein Zurücksetzen von `normalized_at` lässt die Normalisierung
erneut laufen, ohne PSN anzusprechen (`POST /api/sync/normalize`). Das ist der praktische Nutzen
der Trennung aus 7.1: Eine fehlerhafte Abbildung wird korrigiert und erneut ausgeführt, statt die
Daten neu holen zu müssen.
Die Verschlüsselung ist in 7.1 begründet.

**Vor dem ersten NPSSO existiert keine Zeile.** Der CHECK kennt bewusst keinen Wert für
"noch nie eingerichtet"; die Abwesenheit der Zeile sagt genau das aus. Stufe 2 legt sie beim
ersten hinterlegten NPSSO an. Dashboard und Einstellungen unterscheiden damit drei Zustände:
keine Zeile ("nicht eingerichtet"), `status = 'abgelaufen'` und `status = 'ok'`.

---

## 11. Abgeleitete Sichten

Views listen ihre Spalten immer explizit auf, nie `SELECT *`. Bei `SELECT *` wächst die Ergebnismenge nach einem `ADD COLUMN` lautlos mit, während die Definition in `sqlite_master` unverändert bleibt – die einzige Stelle, an der SQLite bei Schemaänderungen still danebengreift.

```sql
-- Use Case 3: Lücken. Digital gespielt, Disc existiert, nicht im Regal.
CREATE VIEW v_luecken AS
SELECT
  g.title, r.id AS release_id, r.platform, r.physical_release_region,
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
  AND r.physical_release_status = 'ja'
  AND NOT EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id);

-- Use Case 6: Kandidaten für die Kaufliste, noch nicht übernommen.
CREATE VIEW v_kaufkandidaten AS
SELECT 'luecke' AS quelle, release_id, title, platform, bester_gebrauchtpreis_cents
FROM v_luecken
-- 'offen' schliesst den bereits uebernommenen Kandidaten aus, 'verworfen' den
-- bewusst abgelehnten (5.3). Ohne 'verworfen' taeuchte eine abgelehnte Luecke
-- bei jeder Abfrage wieder als Kandidat auf.
WHERE release_id NOT IN (
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

-- Use Case 8: offene Prüfliste, angereichert für die Anzeige.
CREATE VIEW v_review_offen AS
SELECT rq.reason, rq.detail, rq.enqueued_at,
       g.id AS game_id, g.title, g.cover_url,
       r.id AS release_id, r.platform,
       t.icon_url, t.progress_pct, t.last_played_at,
       (t.defined_platinum > 0 AND t.earned_platinum > 0) AS hat_platin,
       t.defined_bronze, t.defined_silver, t.defined_gold, t.defined_platinum,
       t.earned_bronze, t.earned_silver, t.earned_gold, t.earned_platinum,
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
-- Die Klammern um das OR sind zwingend: AND bindet stärker, ohne sie würde
-- die Bedingung als "physisch ODER (digital UND alles Übrige)" gelesen, und
-- jedes Release mit einer Disc im Regal wäre Kandidat – auch ein zu 100 %
-- durchgespieltes, das bereits auf einer Liste steht.
CREATE VIEW v_backlog_kandidaten AS
SELECT g.title, r.id AS release_id, r.platform
FROM release r
JOIN game g ON g.id = r.game_id
WHERE (EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id)
    OR EXISTS (SELECT 1 FROM digital_entitlement d WHERE d.release_id = r.id))
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
SELECT g.id AS game_id, r.id AS release_id, g.title, r.platform, t.progress_pct, ps.status
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
GET    /api/games/:id                 Detail: Releases, Copies, Trophäen, Status, Preise; seit Stufe 10 `plaene` (offene Absichten am Spiel und seinen Releases)
POST   /api/games                     Body: { titel, plattform, trotzdem? } – 409 mit Kandidaten bei gleichem Titelschlüssel
PATCH  /api/games/:id
DELETE /api/games/:id                 Trophäenlisten zurück in die Zuordnung

POST   /api/releases                  Body: { spielId, plattform } – 409, wenn die Plattform belegt ist
PATCH  /api/releases/:id              inkl. physical_release_status, psn_product_id (ab Stufe 14)
DELETE /api/releases/:id              Trophäenliste zurück in die Zuordnung; leeres Spiel wird mit gelöscht

GET    /api/physical-copies
POST   /api/physical-copies
PATCH  /api/physical-copies/:id
DELETE /api/physical-copies/:id
POST   /api/digital-entitlements
DELETE /api/digital-entitlements/:id

PUT    /api/releases/:id/play-status  Use Case 2: Body { status, begonnenAm?, beendetAm?, bewertung?, notiz? }; gilt als Durchsicht (8.1)
GET    /api/deviations                v_abweichungen, mit spielId/releaseId für den Link ins Spieldetail

GET    /api/trophies
GET    /api/trophies/unmatched
GET    /api/games/uebersicht           Alle Zuordnungen als Tabelle, filter- und durchsuchbar
POST   /api/games/release/:id/abtrennen  Release in ein neues Spiel herauslösen
POST   /api/games/schluessel-neu-berechnen  sort_title aller Spiele aus dem Titel neu ableiten
GET    /api/zuordnung/offen            Gruppenvorschläge, seitenweise
POST   /api/zuordnung/gruppe           Gruppe bestätigen: ein Spiel, mehrere Releases
POST   /api/zuordnung/liste/:npCommId  Einzelne Liste einem Release zuordnen

GET    /api/plans?kind=wunsch|todo|backlog|kauf&status=offen|alle&sort=rang|titel|angelegt&favorit=1
                                      { gewichte, sortierung, eintraege[] }; Rang je Eintrag berechnet (5.2), null ohne Spiel
POST   /api/plans                     Body: { art, spielId | releaseId | igdbId | titel, plattform?, prioritaet?, favorit?, notiz? } – genau eine Quelle;
                                      igdbId legt bei Bedarf ein Spiel an; plattform (nur zu spielId/igdbId) hängt den Wunsch an das Release
                                      dieser Plattform, das bei Bedarf entsteht; 409 mit eintragId bei offenem Duplikat (Abschnitt 5)
PATCH  /api/plans/:id                 Teilmenge von { prioritaet, favorit, notiz, status, art }; Statuswechsel setzt resolved_at
PUT    /api/plans/reorder             Body: { kind, orderedIds } – To-Do-Reihenfolge (Stufe 12)
DELETE /api/plans/:id

GET    /api/review/queue              v_review_offen, paginiert (limit, offset); ein Eintrag je Bildschirm
POST   /api/review/:releaseId/decide  Body: { aktion } – sieben Aktionen aus 8.1; Antwort mit status, planAngelegt, nochOffen
GET    /api/review/progress           { offen, erledigt, gesamt, unentschieden } – unentschieden ist die zweite Runde

GET    /api/igdb/search?q=&plattformen=  Eingebaute Suche mit Rückfällen und Ordnung (7.6), für Spieldetail, Prüfansicht, Import und Nachpflege
GET    /api/igdb/status               { zugangsdaten, gesamt, verknuepft, zurPruefung, ungeprueft, abgelehnt, letzteAktualisierung }
GET    /api/igdb/offen                Prüfansicht: Spiele ohne eindeutigen Treffer mit Kandidaten (limit, offset)
POST   /api/igdb/abgleich             ein Schritt: acht Spiele; { geprueft, verknuepft, vorgeschlagen, ohneTreffer, nochOffen, weiter }
POST   /api/igdb/auffrischen          ein Schritt: 50 verknüpfte Spiele in einer IGDB-Anfrage
POST   /api/igdb/erneut-suchen        alle Spiele zur Prüfung zurück in den Abgleich; { zurueckgesetzt }
GET    /api/unmatched                 v_ohne_igdb (Stufe 11)
POST   /api/unmatched/:quelle/:id/link  Body: { igdbId } – Quelle 'spiel' seit Stufe 9, 'plan_*' ab Stufe 11
DELETE /api/unmatched/spiel/:id/link  Verknüpfung lösen; nimmt alles zurück, was von IGDB kam
POST   /api/unmatched/spiel/:id/ablehnen  "Gibt es bei IGDB nicht" – gespeicherte Entscheidung
POST   /api/unmatched/spiel/:id/suchen    Ablehnung zurücknehmen; der nächste Abgleich sucht erneut

POST   /api/imports/wishlist/parse    Body: { text } → Trefferliste zur Durchsicht
POST   /api/imports/wishlist/confirm  Body: { entries[] } → schreibt plan_entry

GET    /api/export/:liste.csv         sammlung|wunsch|todo|backlog|kauf|luecken|trophaeen; Semikolon und BOM (14.4)
GET    /api/export/backup.json        Vollsicherung: die 14 Fachtabellen, ohne Rohantworten und Zugangsdaten (14.2)
GET    /api/backup/status             { letzterErfolgAm, letzterCommit, tageSeit }
POST   /api/backup/vermerk            Body: { zeitpunkt (ISO), commit? } – die Backup-Action meldet ihren Lauf

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

**Filter auf `/api/games`:** `platform`, `owned` (physisch/digital/beide/keins), `played` (ja/nein), `platinum` (ja/nein/nichtverfuegbar), `playStatus` (die sieben Werte; ein Release ohne Zeile zählt als `nicht_gespielt`), `physicalAvailable` (ja/nein/unbekannt), `search`, dazu `sort` (titel/zuletzt), `limit`, `offset`.

Die Filter gelten auf Release-Ebene: Ein Spiel erscheint, wenn **mindestens ein Release alle Filter zugleich** erfüllt. Releases, die nur einen Wunsch tragen (Abschnitt 3), zählen dabei nicht mit und fehlen auch in der Release-Liste des Spiels. `platform=PS4&owned=physisch` heisst also "hat eine PS4-Disc", nicht "hat irgendeine Disc und irgendein PS4-Release". Unbekannte Filterwerte werden ignoriert, nicht mit `400` beantwortet – ein alter Link soll die Liste zeigen, keine Fehlermeldung. Die Suche ist eine einfache Teilstringsuche im Titel, keine Suche über den Titelschlüssel.

**Zugriffsschutz:** siehe Abschnitt 15.3. Kurz: eine Access-Richtlinie am Worker – da Frontend und API derselbe Worker sind, deckt sie beides in einem ab. Die Maschinen-Endpunkte (`/api/imports/feed`, `/api/export/backup.json`, `/api/backup/vermerk`) laufen seit Stufe 8 über ein **Access Service Token** und tragen deshalb **keine eigene Token-Prüfung im Worker** (Entscheidung in 15.3).

---

## 13. Frontend

| Ansicht | Use Case | Inhalt |
|---|---|---|
| Dashboard | – | Kennzahlen je Plattform, Platin-Zähler, Backlog-Länge, letzter Sync, Warnung bei abgelaufenem NPSSO; offene Prüfliste mit Anzahl **und daneben die Anzahl der `unentschieden`-Einträge mit Link auf die gefilterte Sammlung** – sonst verschwindet die zweite Runde aus dem Blick, sobald die Prüfliste leer ist |
| Sammlung | 1 | Kachelraster mit Covern, Filterleiste, Suche. Schnellerfassung je Release („+ Disc", „+ digital") mit Rückgängig direkt in der Kachel, eigener Status je Release als Text und Filter und Löschen am Kennzeichen – bei 431 Titeln entscheidet die Klickzahl, ob die Ersterfassung des Regals durchgezogen wird. „Spiel anlegen" für Titel ohne Trophäenliste. Seit Stufe 9 das IGDB-Cover im Hochformat; das Trophäensymbol bleibt Rückfall, solange eine Verknüpfung fehlt |
| Spieldetail | 1, 2, 7 | Releases, Exemplare (Zustand, Anleitung, Kaufdatum, Preis, EAN, Notiz), digitale Berechtigungen; je Release „Trophäen (Sony)" und „Eigene Bewertung" (Status, Bewertung 1–10, Begonnen/Beendet, Notiz) nebeneinander, nie verrechnet; Preisverlauf je Kanal; Release hinzufügen und löschen, Spiel löschen. Block „IGDB" (seit Stufe 9): Kritikerwertung mit Anzahl und Quelle, Erscheinungsdatum und Status, Herkunft der Verknüpfung, Link zu igdb.com; „Anderen Eintrag wählen", „Verknüpfung lösen", ohne Verknüpfung Suche und „Gibt es bei IGDB nicht" |
| Zuordnung | – | Nicht gematchte Trophäenlisten mit Vorschlägen |
| IGDB-Zuordnung | – | Spiele ohne eindeutigen IGDB-Treffer als Liste mit Seiten: Kandidaten (Cover, Jahr, Typ, Plattformen, Wertung) zum Übernehmen, „Anders suchen" mit vorbelegtem Begriff, „Gibt es bei IGDB nicht". Eine Liste, kein Ein-Spiel-pro-Bildschirm: Nichts erzwingt eine Reihenfolge, Ausgelassenes bleibt stehen (7.6) |
| Lücken | 3 | Digital gespielt, Disc existiert, nicht im Regal – mit Preis sofern vorhanden. Knopf "physisch nicht gewünscht"; verworfene standardmäßig ausgeblendet, per Umschalter sichtbar |
| Wunschliste | 4, 11 | Nach Rang sortiert (auch Titel, zuletzt angelegt), Favoriten-Filter, erledigte und verworfene standardmäßig ausgeblendet; je Eintrag Cover, Plattform (oder „ohne Plattform"), Kritikerwertung, Rang, Favorit-Stern, Priorität 1–5, Notiz, erledigt/verworfen/wieder öffnen, entfernen; Erscheinungsdatum statt Preis bei angekündigten Titeln. „Wunsch hinzufügen" über die IGDB-Suche mit Plattform-Auswahl, vorbelegt „ohne Plattform" (dann entsteht ein Spiel ohne Release), Freitext nur über „Ohne IGDB-Eintrag übernehmen" nach einer Suche; Rückgängig direkt nach dem Anlegen. Im Spieldetail ein Block „Wunschliste": auf die Liste setzen, Plattform wählbar (auch eine, für die noch kein Release existiert) und standardmäßig leer |
| To-Do | 5a | Kurz und manuell sortierbar (Drag-and-drop) |
| Backlog | 5b | Der grosse Haufen, Kandidatenvorschläge aus dem Besitz, Hochziehen auf To-Do |
| Kaufliste | 6, 10 | Gespeist aus Lücken und Wunschliste, sortiert nach Rang, mit Herkunftskennzeichnung |
| Prüfliste | 8 | Ein Spiel pro Bildschirm, sieben Aktionen mit Tastenkürzeln 1–7, Grund und Vorher-Nachher, aktueller (vorbelegter) Status, Fortschrittsanzeige „noch n von m"; jederzeit verlassen, jede Entscheidung ist schon gespeichert. **Auf dem Handy müssen alle sieben Knöpfe ohne Scrollen sichtbar sein** (zweispaltig, kompakte Karte) – die Ansicht wird bei der Ersteinrichtung mehrere hundert Mal hintereinander bedient. **Die Knopfreihe steht immer an derselben Stelle**, unabhängig von der Titellänge (feste Mindesthöhe der Karte): Wer blind auf dieselbe Position zielt, trifft sonst bei einem zweizeiligen Titel daneben, und eine Fehlentscheidung fällt erst Wochen später auf. Eine Zeile stellt klar: „Du bewertest den Spielstand, nicht den Besitz." |
| Wunschliste importieren | 9 | Textfeld oder Datei, dreigeteilte Trefferliste, IGDB-Suche für Zeilen ohne Treffer |
| Ohne Zuordnung | 12 | Listenübergreifend, mit IGDB-Suchfeld zum Nachziehen |
| Erscheint bald | 11 | Vorgemerkte Titel mit Datum |
| Scannen | 1 | Serienerfassung nach Abschnitt 9 |
| Einstellungen | – | NPSSO, Sync, Sync-Historie, Gewichte der Rangformel (seit Stufe 10), IGDB (Zugangsdaten ja/nein, Zähler verknüpft/zur Prüfung/nicht gesucht/abgelehnt, „Abgleich starten" mit Fortschritt, „Metadaten auffrischen", „Offene erneut suchen"), offene Scans, Abweichungen (seit Stufe 6, mit Link ins Spieldetail), Gewichte der Rangformel, Export und Backup-Status |

**Navigation:** Auf dem Handy eine Icon-Leiste am unteren Rand mit den sechs Hauptansichten (Sammlung, Wunschliste, Lücken, Kaufliste, To-Do, Scannen); alles Weitere über die Sammlungsansicht und die Einstellungen. Die Wunschliste kam mit Stufe 10 in die Leiste (Entscheidung des Nutzers vom 14.09.2026): Sie wird oft bedient, und ein Umweg über die Einstellungen wäre für die häufigste Liste der falsche Platz. Am Desktop dieselbe Navigation als Seitenleiste. Die Prüfliste und der Import sind keine Dauernavigation, sondern werden vom Dashboard aus aufgerufen, solange sie offene Posten haben – mit Anzahl als Kennzeichen.

Routing über `react-router-dom` mit echten Pfaden (`/sammlung`, `/spiel/:id`, `/wunschliste`, `/pruefliste`, `/einstellungen`, `/zuordnung`, `/igdb`, `/pruefen`, `/trophaeen`); der SPA-Fallback des Workers (15.2) liefert für jeden Pfad die `index.html`. Die Leiste zeigt jeweils nur die Hauptansichten, die es schon gibt – seit Stufe 5 Sammlung und Einstellungen, seit Stufe 10 die Wunschliste; Zuordnung, IGDB-Zuordnung, Sammlung prüfen und Trophäen hängen als Werkzeuge an den Einstellungen. Die Sammlungsfilter liegen in der URL, damit „Zurück" aus dem Spieldetail den Stand wiederherstellt.

Bis es das Dashboard gibt, übernimmt ein Hinweisblock oben in der Sammlung dessen Rolle: offene Prüfliste, `unentschieden`-Einträge (auch bei leerer Prüfliste), nicht zugeordnete Trophäenlisten, seit Stufe 8 eine **überfällige Sicherung** (mehr als acht Tage oder noch nie, siehe 14.2) und seit Stufe 9 Spiele, die noch nicht bei IGDB gesucht wurden oder auf die IGDB-Zuordnung warten – jeweils nur bei Anzahl > 0 und mit Link. Beim Dashboard-Bau wandert die Komponente dorthin.

**Darstellungsregeln**

- `physical_release_status = 'unbekannt'` und fehlende Preise werden immer als "unbekannt" ausgewiesen, nie als "nicht verfügbar" oder "0". Die Datenquellen sind lückenhaft, und die Oberfläche darf diese Lücke nicht als Aussage verkleiden.
- Trophäenfortschritt und eigener Status stehen immer nebeneinander, nie ineinander verrechnet.
- Bei unveröffentlichten Titeln steht das Erscheinungsdatum an der Stelle, wo sonst der Preis steht – nicht "0 €" und nicht "nicht verfügbar".
- Store-Preis und Gebrauchtpreis werden getrennt beschriftet.
- Ansichten, die **in Serie** bedient werden – Prüfliste (Use Case 8), Import-Durchsicht (Use Case 9), Serienerfassung beim Scannen (Abschnitt 9.1) –, müssen auf dem Handy ohne Scrollen bedienbar sein, und ihre Bedienelemente stehen unabhängig von der Inhaltslänge an derselben Stelle (feste Mindesthöhe statt mitwachsender Karte). Wer hundertfach blind auf dieselbe Position tippt, trifft sonst bei einem längeren Titel daneben – und eine Fehlentscheidung fällt erst Wochen später auf.

**PWA:** Manifest und Service Worker, Sammlungsdaten für Offline-Lesezugriff cachen.

---

## 14. Backup und Export (Use Case 13)

### 14.1 Was Cloudflare selbst bietet

- **Time Travel** (`wrangler d1 time-travel`) stellt die Datenbank auf einen Zeitpunkt zurück. Gut gegen fehlerhafte Migrationen und versehentliche Massenlöschungen.
- **`wrangler d1 export`** erzeugt jederzeit einen vollständigen SQL-Dump.

Beides liegt beim selben Anbieter wie die Datenbank. Gegen einen Bedienfehler hilft es, gegen ein gelöschtes Konto oder eine versehentlich gelöschte Datenbank nicht. Auf "wie kann ich sicher sein" ist das deshalb keine vollständige Antwort.

### 14.2 Wöchentliche Sicherung ausserhalb von Cloudflare

`.github/workflows/backup.yml` läuft sonntags um 03:17 UTC – bewusst nicht zur vollen Stunde, dort staut GitHub die Cron-Jobs – und ist zusätzlich über `workflow_dispatch` von Hand auslösbar. Die Kopie landet im **privaten** Repository `trophytracker-backup`:

1. `wrangler d1 export --remote --output=backup.sql`
2. `GET /api/export/backup.json` mit dem Service Token `github-backup` holen; enthält die Antwort keine Spiele, bricht der Lauf hier ab – vor jedem Schreiben
3. Dump prüfen: `scripts/sicherung-pruefen.sh` hält die `INSERT`-Zeilen je Tabelle gegen `COUNT(*)` der Datenbank, `scripts/dump-pruefen.sh` prüft ihn auf Klartext-Zugangsdaten. Beide Skripte benutzt auch der Deploy-Job (15.2), damit es nur eine Prüfung gibt
4. Beide Dateien und eine kurze `README.md` ins private Repo kopieren und **nur bei Änderung** committen
5. `POST /api/backup/vermerk` mit Zeitpunkt und Commit – auch bei einem Lauf ohne Änderung

Kostenlos, versioniert, unabhängig vom Cloudflare-Konto. Git liefert die Historie mit, du kannst also auf jeden beliebigen Wochenstand zurück.

Zwei Formate mit Absicht: Der SQL-Dump ist die technisch exakte Sicherung zum Wiedereinspielen (`wrangler d1 execute --file=backup.sql`). Die JSON-Fassung bleibt lesbar und auswertbar, auch wenn es das Projekt eines Tages nicht mehr gibt – bei einer privaten Sammlung mit jahrelanger Historie ist das der eigentliche Wert.

**Umfang von `backup.json`:** `{ exportiertAm, schemaVersion, tabellen }` mit den **14 Fachtabellen** `game`, `release`, `physical_copy`, `digital_entitlement`, `trophy_progress`, `play_status`, `plan_entry`, `review_queue`, `ean_mapping`, `unresolved_scan`, `market_offer`, `price_snapshot`, `app_setting`, `psn_sync_run`. Nicht dabei sind `psn_credentials` (Chiffrate und IVs), `psn_raw_response` (Rohdaten, gross, im SQL-Dump ohnehin enthalten) und `d1_migrations` (Wranglers Buchführung). `schemaVersion` ist der Name der höchsten angewendeten Migration. Die Liste steht als `EXPORT_TABELLEN` in `src/db/export.ts`; ein Test hält fest, dass **jede** Tabelle der Datenbank entweder exportiert oder ausdrücklich ausgenommen ist – eine Tabelle aus einer künftigen Migration kann so nicht stillschweigend ungesichert mitfahren.

**Der Vermerk steht in `app_setting`**, unter `backup_letzter_erfolg_am` und `backup_letzter_commit`. Kein eigenes Feld und keine eigene Tabelle: Es sind zwei Werte, die beim Wiedereinspielen mitkommen sollen. Ein Lauf ohne Commit gilt als Erfolg – „geprüft, nichts Neues" heisst, dass die Sicherung lief, nicht dass sie ausfiel.

Das Datum der letzten erfolgreichen Sicherung steht in den Einstellungen; bis es das Dashboard gibt, warnt der Hinweisblock der Sammlungsansicht (Abschnitt 13) bei **mehr als acht Tagen** oder wenn noch nie gesichert wurde. Acht statt sieben, weil der Lauf wöchentlich ist: Ein Tag Luft verhindert eine Warnung, die sonst jede Woche von allein erscheint. Ein Backup, von dem man nicht weiss, ob es läuft, ist kein Backup.

**Eine Ausfallursache, die kein rotes Log hinterlässt:** GitHub deaktiviert geplante Workflows in Repositories, die 60 Tage lang keine Aktivität hatten, und schickt dem Besitzer eine E-Mail. Das trifft zu, sobald das Projekt fertig ist und niemand mehr committet – also genau dann, wenn die Sicherung am wichtigsten wird. Dagegen hilft kein Workflow, sondern nur die Altersanzeige. Sie ist der Grund, warum es sie gibt.

### 14.3 Wiederherstellung

**Der Dump lässt sich nicht unverändert einspielen.** Das ist das Ergebnis der Probe vom 14.09.2026 und der Grund, warum dieser Abschnitt länger ist als der eine Befehl, der hier früher stand.

**Der Befund.** `wrangler d1 execute --file=backup.sql` gegen eine frische Datenbank scheitert mit

```
no such table: main.release
```

`d1 export` schreibt die Tabellen in der Reihenfolge von `sqlite_master`. Migration 0003 hat `release` neu aufgebaut – `release_neu` anlegen, alte Tabelle droppen, umbenennen –, wodurch ihr Eintrag dort ans Ende rutschte. Im Dump entsteht `release` deshalb erst in Zeile 1515, während schon in Zeile 467 `INSERT INTO "physical_copy"` läuft und die Tabelle für die Fremdschlüsselprüfung braucht. **Neun Tabellen verweisen auf `release`.**

Der Fehler steckte seit Stufe 3 im Backup und wäre ohne die Probe erst im Ernstfall aufgefallen. Jeder künftige Tabellen-Neuaufbau erzeugt ihn erneut – der Neuaufbau ist SQLites Standardweg für Constraint-Änderungen (siehe die Regel zu Views in `CLAUDE.md`).

**Die Lösung** steht als `scripts/dump-ordnen.mjs` im Repository, nicht als Anleitung: Der Ernstfall ist der schlechteste Moment, sich eine Reihenfolge zusammenzusuchen. Zwei Teile:

1. **Schema vor Daten.** Alle `CREATE TABLE` zuerst. Ein Fremdschlüssel auf eine noch nicht existierende Tabelle ist beim Anlegen erlaubt; SQLite löst ihn erst beim Zugriff auf.
2. **Fremdschlüsselprüfung während des Imports aus**, danach `PRAGMA foreign_key_check` über den fertigen Bestand. Die `INSERT`-Anweisungen bleiben in Dump-Reihenfolge, also Kinder vor Eltern. Sie topologisch zu sortieren wäre die Alternative – sie müsste aber bei jedem Schemawandel nachgezogen werden, und geprüft würde am Ende dasselbe. Der Nachlauf prüft es in einem Schritt und über *alle* Beziehungen.

Indizes und Views kommen zum Schluss: Sie stehen auf Tabellen, die dann existieren, und ein Index über leere Tabellen aufzubauen und anschliessend zu füllen ist der langsamere Weg.

Der vollständige Ablauf mit Befehlen steht in der README. Er endet nicht beim Einspielen, sondern beim Vergleich: Zeilenzahlen aller Tabellen gegen die Produktion, `foreign_key_check` ohne Treffer, Views und Indizes vollzählig.

**Probe durchgeführt am 14.09.2026.** Dump 910.717 Byte, 1.762 `INSERT`-Anweisungen, 17 Tabellen, 3.632 geschriebene Zeilen. Alle 17 Tabellen, 7 Views und 18 Indizes stimmen mit der Produktion überein; `PRAGMA foreign_key_check` meldet null Verletzungen. Einzige Abweichung: `app_setting` 6 gegen 4 – der Dump entstand um 09:24:57, der Backup-Vermerk schrieb `backup_letzter_erfolg_am` und `backup_letzter_commit` acht Sekunden später. Die Tabelle steht in der README.

`scripts/dump-ordnen.mjs` ist durch `test/dump-ordnen.spec.ts` abgedeckt – einschliesslich der Fälle, an denen eine naive Zerlegung scheitert: Semikolon im Spieltitel, maskiertes Hochkomma (`'Assassin''s Creed'`), Semikolon im Kommentar.

### 14.4 CSV-Export

`GET /api/export/:liste.csv` für Sammlung, Wunschliste, To-Do, Backlog, Kaufliste, Lücken und Trophäen. Jeweils die Ansicht, die auch die Oberfläche zeigt, mit Kopfzeile und Semikolon als Trennzeichen für Excel im deutschen Gebietsschema. Eine unbekannte Liste beantwortet die Route mit `404`.

**Drei Festlegungen, alle wegen Excel** (`src/domain/csv.ts`, geprüft in `test/csv.spec.ts`):

- **Semikolon** als Trennzeichen. Im deutschen Gebietsschema ist das Komma das Dezimaltrennzeichen; mit Komma als Feldtrenner zerfällt „12,99" in zwei Spalten.
- **BOM** (`\ufeff`) am Anfang. Ohne sie liest Excel die Datei als Windows-1252, und aus „Ragnarök" wird „RagnarÃ¶k".
- **CRLF** als Zeilenende, wie RFC 4180 es vorsieht. Felder werden nur dann in `"` gesetzt, wenn sie `;`, `"` oder einen Zeilenumbruch enthalten; ein `"` im Feld wird verdoppelt.

**Ein leeres Feld bedeutet „unbekannt"** – nie „0", nie „–". Das ist die CSV-Entsprechung der Darstellungsregel aus Abschnitt 13. Werte, die tatsächlich *den Wert* „unbekannt" tragen (`physical_release_status`), stehen dagegen als Wort in der Spalte. Geldbeträge gehen ohne Währungszeichen und ohne Tausenderpunkt heraus (`12,99`), damit Excel die Spalte als Zahl liest.

**Spalten**

| Liste | Kopfzeile |
|---|---|
| `sammlung` (eine Zeile je Release) | Titel; Plattform; Disc-Fassung; Exemplare; Digital; Fortschritt %; Platin; Status; Bewertung; Zuletzt gespielt |
| `trophaeen` | Rohtitel; Plattform(en); Titel (zugeordnet); Fortschritt %; Bronze erspielt; Bronze definiert; Silber erspielt; Silber definiert; Gold erspielt; Gold definiert; Platin erspielt; Platin definiert; Zuletzt gespielt; Zugeordnet |
| `wunsch`, `todo`, `backlog`, `kauf` | Titel; Plattform; Priorität; Favorit; Position; Notiz; Herkunft; Status; Angelegt am |
| `luecken` | Titel; Plattform; Fortschritt %; Platin erspielt; Status; Bester Gebrauchtpreis; Verworfen |

„Platin" in `sammlung` ist dreiwertig als Text (`erspielt` / `offen` / `nicht vorgesehen`) – 93 der 431 Listen haben gar keine Platin-Trophäe, dort wäre „offen" falsch. In `trophaeen` und `luecken` stehen stattdessen die Zahlen beziehungsweise das binäre `hat_platin` der View; die Spalte heisst dort deshalb „Platin erspielt" und behauptet nichts über Verfügbarkeit.

`Status` bleibt leer, wenn es **keine** `play_status`-Zeile gibt. Die Sammlungsansicht behandelt sie beim Filtern als `nicht_gespielt`; im Export wäre das eine Behauptung statt einer Angabe.

Die Trophäen-Zahlen stehen als **getrennte Spalten** je Metall („Bronze erspielt", „Bronze definiert"), nicht als „12/20" in einem Feld: CSV ist zum Auswerten gedacht, und „12/20" lässt sich nicht summieren.

Die Spalte `Verworfen` in `luecken` kommt bis Stufe 14 aus einer Unterabfrage auf `plan_entry` (Abschnitt 5.3) und nicht aus der View – `v_luecken` bekommt sie erst mit der Lückenansicht.

CSV ist für Auswertung und Weitergabe gedacht, nicht als Sicherung: Beziehungen zwischen den Tabellen gehen dabei verloren. Dafür ist der Dump aus 14.2 zuständig.

### 14.5 Nachweis, dass keine Zugangsdaten im Dump stehen

Der Dump wandert wöchentlich in ein Git-Repository, und was einmal in einem Git-Verlauf steht, bleibt dort. NPSSO und Refresh-Token liegen deshalb AES-GCM-verschlüsselt in D1 (Abschnitt 7.1) – aber „liegt verschlüsselt vor" ist eine Behauptung, bis sie geprüft ist. Drei Schichten, weil der Klartext demjenigen, der die Prüfung baut, weder bekannt ist noch sein darf:

1. **Test mit Markierung.** `test/keine-lecks.spec.ts` speichert ein markiertes NPSSO, fährt einen Sync und liest danach **jede** Tabelle aus `sqlite_master` vollständig aus. Inhaltlich dasselbe wie ein `d1 export`, nur ohne Wrangler. Eine Tabelle aus einer künftigen Migration ist damit automatisch mitgeprüft. Dazu ein Fall für `GET /api/export/backup.json`.
2. **Skript gegen den echten Dump.** `scripts/dump-pruefen.sh` läuft in der Backup-Action **und** im Deploy-Job. Es schlägt fehl, wenn `access_token`, `refresh_token`, `"npsso"` oder `npsso=` in einer `INSERT`-Zeile vorkommt, wenn die `psn_credentials`-Zeile einen Wert trägt, der weder Zeitstempel noch gültiges Base64 ist, oder wenn einer dieser Werte **64 Zeichen** lang ist – die Länge eines NPSSO. Die Längenprüfung ist die eigentliche: Ein NPSSO besteht aus Buchstaben und Ziffern, ist also selbst gültiges Base64 und dekodiert zu 48 Byte, die wie Zufall aussehen; eine Prüfung auf druckbare Zeichen im Dekodat läuft daran vorbei. Chiffrat sind 108 Zeichen, ein IV 16. Ins Log kommen nur Zahlen.
3. **Menschliche Gegenprobe.** Der Nutzer sucht im privaten Repo einmal selbst nach seinem NPSSO. Null Treffer ist der einzige Beweis, den niemand anders führen kann.

**Durchgeführt am 14.09.2026**, alle drei Schichten: Der Test läuft über jede Tabelle, `scripts/dump-pruefen.sh` bestand im Backup-Lauf (vier Base64-Werte mit 108/16/72/16 Zeichen, keiner 64), und die Suche im privaten Repo nach den ersten Zeichen des NPSSO ergab `backup.sql:0` und `backup.json:0`.

Als Zugabe eine Prüfung, die *ohne* Kenntnis des Wertes auskommt und deshalb wiederholbar ist: Ein NPSSO ist 64 alphanumerische Zeichen. Im gesamten Dump gibt es **keine** solche Zeichenkette – und die eine 64-Zeichen-Kette, die es gibt, steht in `psn_raw_response`, enthält Leerzeichen und Satzzeichen und ist ein Spieltitel aus einer Sony-Antwort.

---

## 15. Repository, Deployment und Zugriffsschutz (Use Case 14)

### 15.1 Zwei Repositories

| Repo | Sichtbarkeit | Inhalt |
|---|---|---|
| `trophytracker` | öffentlich | Worker, Frontend, Migrations, GitHub Actions, README |
| `trophytracker-backup` | **privat** | wöchentlicher SQL-Dump und JSON-Export |

Die Trennung ist nicht optional. Der Dump aus Abschnitt 14 enthält die vollständige Sammlung; im öffentlichen Repo wäre sie für jeden lesbar, und Git-Historie lässt sich nachträglich nur mit Aufwand bereinigen.

Die Backup-Action bekommt einen **Fine-grained Personal Access Token**, dessen Geltungsbereich ausschliesslich das private Repo umfasst. Nicht den Standard-`GITHUB_TOKEN`, der reicht nicht über das eigene Repository hinaus.

Benötigte GitHub Secrets:

| Secret | Wofür | Ab Stufe | Läuft ab |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Deploy- und Backup-Action | 0 | nein |
| `CLOUDFLARE_ACCOUNT_ID` | Deploy- und Backup-Action | 0 | nein |
| `BACKUP_REPO_TOKEN` | Fine-grained PAT, nur auf `trophytracker-backup` | 8 | **nach einem Jahr** |
| `CF_ACCESS_CLIENT_ID` | Service Token `github-backup` (15.3) | 8 | **nach einem Jahr** |
| `CF_ACCESS_CLIENT_SECRET` | Service Token `github-backup` (15.3) | 8 | **nach einem Jahr** |

Die drei ablaufenden Werte sind der wahrscheinlichste Grund, aus dem die Sicherung eines Tages unbemerkt ausbleibt. Genau dagegen steht die Altersanzeige aus 14.2.

Dazu Cloudflare Secrets am Worker (nicht GitHub): `NPSSO_KEY` (Stufe 2) sowie `IGDB_CLIENT_ID` und `IGDB_CLIENT_SECRET` (Stufe 9, aus der Twitch-Entwicklerkonsole; laufen nicht ab, das daraus abgeleitete Token erneuert der Worker selbst, siehe 7.6).

**Was im öffentlichen Repo unbedenklich ist:** `account_id` und `database_id` in der Wrangler-Konfiguration. Das sind Bezeichner, keine Zugangsdaten – ohne authentifizierten Kontozugriff nutzlos.

**Was dort niemals hingehört:** NPSSO und PSN-Refresh-Token, IGDB/Twitch-Zugangsdaten, AWIN-Feed-URLs (die enthalten die Publisher-ID), das API-Bearer-Token, der Cloudflare-API-Token. Alles davon liegt als Cloudflare Secret beziehungsweise GitHub Secret. `.dev.vars`, `.wrangler/` und `*.sql` gehören in die `.gitignore` – letzteres mit der Ausnahme `!migrations/*.sql`. Ohne diese Ausnahme würden die Migrationen mit ignoriert, und die Deploy-Action liefe gegen ein leeres Verzeichnis.

### 15.2 Automatisches Deployment

**Frontend:** Kein eigenes Hosting. Vite baut das Frontend nach `frontend/dist`, und derselbe Worker liefert es als Static Assets aus (`assets.directory`, `not_found_handling: "single-page-application"`). `run_worker_first: ["/api/*"]` sorgt dafür, dass die API immer den Worker erreicht und alles Übrige auf `index.html` zurückfällt.

Frontend und API teilen sich damit eine Origin: **kein CORS, ein Deploy-Pfad, eine Access-Richtlinie**. Der Preis sind die automatischen PR-Vorschau-URLs, die ein Pages-Projekt mitbrächte; nachrüstbar wären sie über `wrangler versions upload`, dessen Preview-URLs von derselben Access-Richtlinie abgedeckt sind.

**Worker und Datenbank:** GitHub Action mit `cloudflare/wrangler-action`, ausgelöst durch Push auf `main`. Die Reihenfolge der Schritte ist wichtiger als das Werkzeug:

1. `wrangler d1 export` – Sicherung **vor** jeder Schemaänderung
2. Sicherung prüfen (`scripts/sicherung-pruefen.sh`): Der Dump schreibt eine `INSERT`-Zeile je Datensatz; die Zahlen werden je Tabelle gegen `COUNT(*)` der Datenbank gehalten. Weicht eine ab, **bricht der Job hier ab**, vor der Migration. Ins Log kommen nur Zahlen, nie Inhalt
3. Dump auf Klartext prüfen (`scripts/dump-pruefen.sh`, 14.5)
4. `wrangler d1 migrations apply --remote`
5. Datenmigrationen protokollieren ihre Wirkung (0006: `play_status`, 0007: `review_queue`, jeweils neben der Erwartung), damit sie sich gegen eine bekannte Zahl halten lässt
6. `wrangler deploy`

Beide Prüfskripte liegen in `scripts/`, weil die Backup-Action (14.2) dieselben benutzt. Zwei Kopien derselben Prüfung wären zwei Kopien, die auseinanderlaufen.

Schritt 1 ist der Grund, warum das eine Action ist und kein Klick im Dashboard. Eine fehlerhafte Migration ist der wahrscheinlichste Weg, Daten zu verlieren, und der einzige Zeitpunkt, an dem ein frisches Backup wirklich zählt, ist die Sekunde davor. Schritt 2 kam mit der ersten Migration, die Daten schreibt (Stufe 6): Ein Export, den niemand prüft, ist eine Sicherung nur dem Namen nach.

Migrationen laufen **vor** dem Deployment, damit der neue Code nie auf ein altes Schema trifft. Umgekehrt gilt: Migrationen müssen abwärtskompatibel sein, weil der alte Worker in dem Moment noch läuft. Spalten hinzufügen ist unkritisch, Spalten umbenennen nicht – dafür braucht es zwei Deployments.

Benötigte GitHub Secrets: siehe die Tabelle in 15.1. `CLOUDFLARE_API_TOKEN` ist auf Workers Scripts und D1 beschränkt, dazu Account Settings lesend – keine Zone- und keine Pages-Berechtigung.

### 15.3 Zugriffsschutz

Die `workers.dev`-Adresse ist öffentlich erreichbar. Ein Bearer-Token im LocalStorage allein ist dafür zu wenig: einmal geleakt, und die Sammlung ist lesbar, ohne dass es auffällt.

**Cloudflare Access** davor löst das. Zero Trust ist für bis zu 50 Nutzer dauerhaft kostenlos. Beim Onboarding verlangt Cloudflare allerdings **doch Zahlungsdaten**, auch für den Free-Plan – die Dokumentation sagt dazu: "If you chose the Zero Trust Free plan, this step is still needed but you will not be charged." Eingerichtet wird:

- eine Access-Richtlinie direkt am Worker (*Protect this Worker behind Access* → **All traffic**), die dessen `workers.dev`-Adresse, Preview-URLs und spätere Custom Domains gemeinsam abdeckt
- eine Richtlinie über die Option **Cloudflare account**: nur Mitglieder des
  eigenen Cloudflare-Kontos dürfen sich anmelden. Bei einer Single-User-Anwendung
  ist das genau eine Person
- Anmeldung über das Cloudflare-Konto. Die Login-Methode folgt aus der
  Richtlinie: *Cloudflare account* meldet gegen das Konto an, ein Einmalcode
  (One-time PIN) oder ein Anbieter wie Google käme erst bei einer
  adress- oder domainbasierten Richtlinie zum Einsatz

Damit ist das Cloudflare-Konto das einzige Tor zur Anwendung – **Zwei-Faktor-
Anmeldung dort ist Teil des Zugriffsschutzes**, nicht optionaler Komfort.

Der Dialog am Worker bietet nur zwei Richtlinien-Optionen: **Cloudflare account**
und **Email domain**. Ein Selector für einzelne Adressen existiert dort nicht –
den gibt es nur in der klassischen, hostnamenbasierten Access-Anwendung.

**Email domain ist hier die falsche Wahl.** Sie lässt jeden mit einer verifizierten
Adresse bei der angegebenen Domain herein; bei einem Freemail-Anbieter wie `web.de`
wären das Millionen Menschen. Nur bei einer eigenen Firmendomain ergibt die Option
Sinn.

Ergebnis: Der Login steht vor der App, nicht darin. Ohne gültige Sitzung erreicht kein Aufruf den Worker, und der Worker muss keine Sitzungsverwaltung enthalten.

**Keine eigene Domain nötig.** Die Richtlinie hängt am Worker selbst, nicht an einem Hostnamen in einer Zone – seit August 2026 deckt sie damit auch die `workers.dev`-Adresse ab. Die Team-Domain `<team>.cloudflareaccess.com` ist dabei nur der Login-Endpunkt und hostet nichts.

Eine dokumentierte Einschränkung: Worker-Level-Access unterstützt keine WebSockets – Upgrade-Anfragen scheitern mit 403. Für dieses Projekt ohne Belang.

**Ausnahmen für Maschinen.** Die GitHub Actions (Feed-Import, Backup-Export) können keinen Browser-Login durchlaufen. Zwei Wege standen zur Wahl:

- Access Service Token für die Action, oder
- diese Pfade von Access ausnehmen und mit einem eigenen Bearer-Token absichern

**Entschieden in Stufe 8: Access Service Token.** Der zweite Weg ist **verworfen**. Ausschlaggebend war nicht die Eleganz, sondern eine Randbedingung: Die Richtlinie hängt am Worker und schützt ihn als Ganzes – einzelne Pfade lassen sich davon nicht ausnehmen. Ein Bearer-Token-Pfad bräuchte deshalb eine hostnamenbasierte Access-Anwendung und damit eine eigene Domain, also genau die Voraussetzung, die 15.3 sonst ausdrücklich nicht hat. Dazu käme ein zweites Geheimnis, das leaken kann, für dieselbe Frage.

Folgen:

- Es gibt ein eigenes Service Token `github-backup` an der Access-Richtlinie, getrennt von dem, mit dem die Produktion nach einem Deploy geprüft wird. Getrennt, damit sich eines zurückziehen lässt, ohne das andere zu treffen.
- Die Action sendet `CF-Access-Client-Id` und `CF-Access-Client-Secret` als Header.
- **Der Worker trägt keine eigene Token-Prüfung.** `/api/export/*` und `/api/backup/*` sind gewöhnliche Routen; Access steht davor.
- Ein abgelaufenes Service Token äussert sich als `302` auf die Login-Seite, nicht als `401`. Die Action prüft deshalb zusätzlich den Inhalt der Antwort, nicht nur den Status – eine HTML-Loginseite ist kein JSON.

**Falls Access nicht eingerichtet wird**, bleibt das Bearer-Token die Mindestanforderung – aber dann gehört ein Hinweis in die README, dass die Anwendung öffentlich erreichbar ist und ihre Sicherheit an einem einzigen Geheimnis hängt.

### 15.4 Kostenmodell und Schutz vor ungewollten Kosten

Alle genutzten Dienste liegen im Free-Tier. Entscheidend ist, **wie** Cloudflare
mit dem Überschreiten umgeht: Die Free-Pläne rechnen nicht in eine Überziehung
hinein, sondern blocken hart.

| Dienst | Free-Grenze | Bei Überschreitung |
|---|---|---|
| Workers | 100.000 Anfragen/Tag | Fehler 1027 bzw. 429, keine Abrechnung |
| Workers Static Assets | im Workers-Kontingent | 429 statt Auslieferung |
| D1 | 5 GB, 5 Mio. gelesene / 100.000 geschriebene Zeilen pro Tag | Abfragen schlagen fehl, keine Abrechnung |
| Zero Trust Access | 50 Sitze | Weitere Nutzer werden abgewiesen |

Der Wechsel in einen Bezahlmodus ist damit immer eine **ausdrückliche Handlung**
(Upgrade-Klick), kein Nebeneffekt von Nutzung. Für eine Single-User-Anwendung
sind die Grenzen ohnehin um Größenordnungen entfernt: ein Sitz von 50, und ein
Trophäen-Sync erzeugt einige hundert Anfragen, nicht hunderttausend.

Nicht abgedeckt von dieser Zusicherung sind Dienste, die es gar keinen Free-Tier
gibt – wer später etwa Workers Paid für Cron-Häufigkeiten oder R2 hinzunimmt,
trifft diese Entscheidung bewusst. Für den in Abschnitt 2 beschriebenen Stack
ist das nicht nötig.

### 15.5 Was das Teilen wert ist

Das Repo ist ohne deine Daten vollständig nachvollziehbar: Schema, Migrations, Matching-Logik und die Anbindungen sind der interessante Teil, die Sammlung ist es nicht. Wer das Projekt nachbauen will, legt eine eigene D1-Datenbank an und trägt sein eigenes NPSSO ein.

Sinnvoll für die README: Setup-Anleitung, Liste der benötigten Secrets, der Wiederherstellungsablauf aus 14.3 und ein ausdrücklicher Hinweis darauf, dass die PSN-Anbindung inoffiziell ist.

---

## 16. Umsetzungsreihenfolge

Jede Stufe ist einzeln lauffähig und deploybar.

| # | Inhalt | Ergebnis |
|---|---|---|
| 0 | Repos anlegen, Worker mit Hono, Frontend-Gerüst als Static Assets, leere D1, Deploy-Action mit Export vor Migration, Access am Worker | Push auf `main` deployt, App ist geschützt |
| 1 | Vollständige Migration, Repository-Schicht in `src/db/` | Erreichbare leere App mit Schema |
| 2 | PSN-Auth, NPSSO-Eingabe, Rohabruf | Trophäendaten liegen roh vor |
| 3 | Vita als vierte Plattform, Normalisierung als zweite Sync-Phase, Trophäenliste | Use Case 2 teilweise: Trophäen und Platin sichtbar |
| 4 | `game`/`release`, Titelnormalisierung, Gruppenvorschläge, Zuordnungsoberfläche | Sauberes Datenmodell |
| 5 | Besitz erfassen (physisch und digital), Sammlungsansicht mit Filtern | **Use Case 1** |
| 6 | `play_status`, Statuswechsel im Spieldetail, Abweichungsansicht | **Use Case 2** |
| 7 | Prüfliste, zunächst nur `erstimport` | **Use Case 8**, Ersteinrichtung – Datenbestand steht |
| 8 | Backup-Action ins private Repo, CSV-Export | **Use Case 13** – ab jetzt sind Daten drin, die weh tun |
| 9 | IGDB-Anbindung: Cover, Suche, Kritikerwertung, Erscheinungsdaten | Grundlage für 10 bis 13 |
| 10 | `plan_entry`, Wunschliste, Favoriten | **Use Case 4** |
| 11 | Wunschlisten-Import mit Suche, Ansicht "Ohne Zuordnung" | **Use Cases 9 und 12** |
| 12 | To-Do und Backlog mit Sortierung und Kandidatenvorschlägen | **Use Cases 5a und 5b** |
| 13 | Änderungserkennung im Sync: `neue_trophaeen`, `dlc_erweitert` | **Use Case 8** vollständig |
| 14 | `physical_release_status` manuell pflegbar, Lückenansicht, Lücken verwerfen (5.3) | **Use Case 3** |
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
| Backup landet im öffentlichen Repo | Sammlung öffentlich lesbar | Getrennte Repos, Fine-grained Token nur auf das private, `*.sql` in `.gitignore` (Ausnahme `!migrations/*.sql`), Dump nie als Workflow-Artifact |
| Bearer-Token geleakt | Fremdzugriff auf die Daten | Access-Richtlinie am Worker davor; kein Bearer-Token im Worker – Maschinen-Endpunkte laufen über ein Access Service Token (15.3) |
| Zugangsdaten im Backup-Repo | NPSSO im Git-Verlauf, dauerhaft | Verschlüsselt in D1; `scripts/dump-pruefen.sh` in Backup- und Deploy-Job, Test über alle Tabellen, menschliche Gegenprobe (14.5) |
| Service Token oder PAT laufen ab | Sicherung bleibt unbemerkt aus | Altersanzeige in den Einstellungen und Warnung im Hinweisblock ab acht Tagen (14.2); Ablaufdaten in 15.1 |
| Fehlerhafte Migration | Datenverlust | Export als erster Schritt jedes Deploy-Jobs, Migrationen abwärtskompatibel halten |
| D1-Tageslimit für gelesene Zeilen erreicht | Anwendung bis Mitternacht UTC tot | Indizes auf allen Fremdschlüsseln, `test/lesekosten.spec.ts` als Wächter, `rows_read_24h` in `wrangler d1 info` beobachten (Abschnitt 2) |
| Backup läuft unbemerkt nicht mehr | Sicherheit nur scheinbar | Datum der letzten Sicherung steht in den Einstellungen, Warnung im Hinweisblock ab acht Tagen; GitHub schaltet den Zeitplan nach 60 Tagen ohne Repo-Aktivität ab (14.2) |
| Wiederherstellung nie geprobt | Backup unbrauchbar | Probe am 14.09.2026 durchgeführt – sie fand einen echten Fehler (14.3). Ablauf und Ergebnis in der README |
| Dump nicht einspielbar nach Tabellen-Neuaufbau | Backup nur scheinbar brauchbar | `scripts/dump-ordnen.mjs` ordnet Schema vor Daten, `PRAGMA foreign_key_check` prüft danach (14.3); `test/dump-ordnen.spec.ts` hält die Zerlegung fest |
| Kritikerwertung fehlt | Rang verzerrt | `COALESCE(critic_score, 70)` – unbewertete Titel werden weder bevorzugt noch bestraft |
| IGDB-Treffer falsch | Falsches Cover, falsche Wertung im Rang | Nur eindeutige Treffer automatisch, gegen die echten Titel gemessen (7.6); Herkunft in `igdb_matched_source`; jede Verknüpfung im Spieldetail lösbar oder austauschbar |
| Twitch-Token läuft ab | IGDB-Abfragen scheitern | Client-Credentials-Token im Speicher, Erneuerung bei Ablauf oder 401 ohne Zutun (7.6) |
| IGDB-Ratenlimit | Abgleich bricht ab | 260 ms Abstand je Anfrage, acht Spiele je Aufruf, 429 beendet den Schritt sauber und die Oberfläche ruft erneut |
| IGDB-Zugangsdaten fehlen | Kein Cover, keine Wertung | Nur die IGDB-Routen antworten 503, alles andere läuft; Hinweis in den Einstellungen |
| Rangformel passt nicht | Umbauwunsch | Nur Bestandteile gespeichert, Gewichte in `app_setting` verstellbar |
| AWIN-Freigabe abgelehnt | Kein Feed, keine Gebrauchtpreise | Stufen 1–12 sind unabhängig |
| Feed kennt Titel nicht | Physisch-Status und Preis fehlen | Status bleibt `unbekannt`, niemals automatisch `nein` |
| Feedgröße vs. 10 ms CPU | Import bricht ab | Parsen und Filtern in der GitHub Action, Worker bekommt nur Batches |
| Feed zeigt nur Lagerbestand | Kein Marktwert, nur Angebotspreis | Als "Angebot bei Händler X" beschriften, nicht als "Wert" |
| Store-Preise inoffiziell und volatil | Sale verfälscht Verlauf | `is_sale`-Flag, Abruf nur für vorgemerkte Releases |
| Keine freie EAN-Datenbank | Barcode liefert nichts | Eigene Zuordnungstabelle, offene Scans protokolliert |
| D1 relativ jung | Werkzeuge weniger ausgereift | Bei Single-User unkritisch, Schema ist Standard-SQLite und portierbar |
| Ungewollt in einen Bezahlmodus rutschen | Unerwartete Kosten | Free-Pläne blocken bei Überschreitung, statt zu berechnen (15.4); Upgrade ist immer eine ausdrückliche Handlung |
