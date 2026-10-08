← [Inhaltsverzeichnis](README.md)

### 8.5 Änderungsprotokoll je Spiel (Stufe 16)

Jede Zeile in `game_event` sagt, **wer** wann **was** geschrieben hat. Die Quelle je Zeile macht das Prinzip „Fremddaten und eigene Bewertung nie vermischen" erstmals sichtbar: Ein Status von `sync` ist eine Vorbelegung, einer von `nutzer` eine Entscheidung. Alles, was ab Stufe 17 schreibt – Scanner, Cron-Sync, Feed –, wird von Anfang an protokolliert statt nachgerüstet (Reihenfolge-Entscheidung des Nutzers vom 16.09.2026).

```sql
CREATE TABLE game_event (
  id          INTEGER PRIMARY KEY,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  source      TEXT NOT NULL CHECK (source IN ('nutzer','sync','igdb','import','feed','migration')),
  game_id     INTEGER REFERENCES game(id) ON DELETE SET NULL,
  release_id  INTEGER REFERENCES release(id) ON DELETE SET NULL,
  label       TEXT NOT NULL,   -- Titel (und Plattform) zum Zeitpunkt des Ereignisses
  kind        TEXT NOT NULL,   -- Ereignisart, Liste in src/domain/ereignis.ts
  field       TEXT,            -- betroffenes Feld, z. B. 'status', 'physical_release_status', 'kind'
  old_value   TEXT,
  new_value   TEXT,
  detail      TEXT             -- Zusatz: Prüflisten-Detail, Anlass eines Listeneintrags, Slug
);
-- idx_event_game (game_id, id), idx_event_release (release_id), idx_event_source (source, id)
```

**Vier Entscheidungen des Nutzers vom 16.09.2026:**

1. **Der Sync protokolliert nur Erkanntes.** Trophäenliste erstmals gesehen (`liste_neu`, noch ohne Spiel, Label = Sony-Titel), automatische Zuordnung (`zugeordnet`), Vorbelegung (`status_vorbelegt`) und Prüflisten-Einträge (`pruefliste_eingereiht` mit dem Vorher-Nachher-Text) – **einmalig**: Ein offener Eintrag, dessen Detail beim nächsten Sync nur aktualisiert wird, ist kein neues Ereignis. Keine Einzeltrophäen, nichts bei unverändertem Stand (Zeilenlese-Grenze).
2. **IGDB protokolliert nur Entscheidungen und Statuswechsel.** Verknüpft / gelöst / abgelehnt, Titel aus IGDB übernommen (`spiel_umbenannt`, Quelle `igdb`), Disc-Fassung `unbekannt → ja` (`disc_fassung_belegt`), `angekuendigt → erschienen` (`erschienen`). Nicht Cover, Kritikerwertung und Datum beim täglichen Auffrischen – das wäre Rauschen.
3. **Aufbewahrung unbegrenzt**, die Tabelle ist die 15. Fachtabelle in `EXPORT_TABELLEN` (14.2). Bei der Nutzung des Nutzers sind das grob einige tausend Zeilen im Jahr; die Ansichten lesen seitenweise per Keyset (`vor=<id>`), nie per OFFSET.
4. **Start bei null.** Migration 0019 legt nur die Tabelle an. Vorhandene Stempel (`matched_at`, `reviewed_at`, `updated_at`) sagen „wann", nicht „was" – eine Rückrechnung wäre geraten.

**Wer schreibt, und wie.** Ausschließlich die Repository-Schicht (`src/db/`), nie eine Route. `EventRepository.statement` liefert das INSERT, das der jeweilige Schreibpfad in **denselben Batch** wie seine Änderung hängt – Änderung und Protokoll kommen zusammen an oder bleiben zusammen aus. Set-basierte Schreiber (Vorbelegung, Einreihung, Disc-Fassung aus IGDB, `erschieneneFreigeben`, Kopplung) protokollieren per `INSERT … SELECT` mit **derselben Bedingung wie das UPDATE, davor im Batch** – so steht der alte Wert noch. Ein Ereignis, das ein Löschen festhält, läuft vor dem DELETE; `game_id` und `release_id` fallen danach per `ON DELETE SET NULL` weg, das Label bleibt. Wo ein Wert „alt → neu" nötig ist, liest der Schreibpfad den alten Wert per Primärschlüssel und schreibt bei Gleichheit **kein** Ereignis.

Der Scanner (Stufe 17) schreibt nichts Eigenes: Er ruft `addPhysicalCopy` mit Anlass `scan` auf – „Disc erfasst (per Barcode)" – und bei einem neuen Release `releaseFuerPlattform` mit demselben Detail; das Mapping in `ean_mapping` bekommt kein Ereignis, weil es dieselbe Entscheidung ist. Die Quelle wird aus vorhandenen Feldern abgeleitet, nicht durch alle Routen gereicht: `plan_entry.origin = 'import'` → `import`, sonst `nutzer`; `matched_source = 'automatisch'` → `sync` (7.2) beziehungsweise `igdb` (7.6), `manuell` → `nutzer`. Der Wunschlisten-Import gibt `import` an die Spiel- und Release-Anlage weiter (`zielAusKandidat`). Die Kopplung (5.5) und das Erledigen beim Erfassen (5) bleiben die einzigen Kopplungspfade; sie tragen nur ein `detail` (`kopplung`, `besitz`, `kauf`), keinen neuen Weg.

**Ereignisarten** (`EREIGNIS_ARTEN`, kein CHECK in der Datenbank, weil Stufe 17, 18 und 20 neue anhängen): `liste_neu`, `zugeordnet`, `zuordnung_geloest`, `spiel_angelegt`, `spiel_umbenannt`, `spiel_geloescht`, `release_angelegt`, `release_abgetrennt`, `release_geloescht`, `release_geaendert` (Disc-Fassung, PSN-Produkt-Id), `disc_fassung_belegt`, `status_geaendert`, `bewertung_geaendert` (je Feld), `status_vorbelegt`, `pruefliste_eingereiht`, `pruefliste_entschieden`, `liste_eintrag_angelegt` / `_geaendert` (umgehängt, Status, Favorit, Notiz, Ziel) / `_erledigt` / `_geloescht`, `exemplar_angelegt` / `_geaendert` / `_geloescht`, `berechtigung_angelegt` / `_geloescht`, `igdb_verknuepft`, `igdb_geloest`, `igdb_abgelehnt`, `erschienen`.

**Bewusst nicht protokolliert:** die To-Do-Reihenfolge (`neuOrdnen`), die Neuberechnung der Sortierschlüssel (abgeleitet), IGDB-Kandidaten und Suchstempel (Arbeitszustand), das Auffrischen von Cover, Wertung und Datum, die Zeilen eines Wunschlisten-Imports (Arbeitszustand – erst die Übernahme als `plan_entry` zählt) und die Sync-Läufe selbst (`psn_sync_run` ist deren Protokoll).

**Lesen.** Der Satz für die Oberfläche („Status: am Spielen → durchgespielt (aus der Prüfliste)") entsteht zur Lesezeit in `beschreibeEreignis` (`src/domain/ereignis.ts`) und wird nie gespeichert (5.2); fehlende Werte heißen „leer". `GET /api/games/:id/events` liefert den Verlauf eines Spiels, `GET /api/events` alles mit Quellenfilter; beide neueste zuerst, `weiter` sagt, ob es ältere gibt. Gemessen in `test/lesekosten.spec.ts` bei 4 000 Ereignissen: 11 Zeilen für den Verlauf eines Spiels, 51 je Seite der Gesamtansicht – auch auf der zweiten Seite, weil `vor` als eigene Bedingung im Text steht und nicht als `(? IS NULL OR id < ?)` (damit las SQLite 2 052). Die Protokollzeilen der Vorbelegung lesen den Bestand ein zweites Mal (1 708 Zeilen bei 430 Listen), die der Einreihung 430.

**Der Dashboard-Feed hat ab Stufe 19b zwei Quellen, das Protokoll behält eine** (Entscheidung des
Nutzers vom 01.10.2026). Eine erspielte Trophäe ist **kein** `game_event`: Niemand hat etwas
geschrieben, und 11 168 Zeilen Fremddaten ins Protokoll zu kippen widerspräche „der Sync
protokolliert nur Erkanntes". Der Feed liest sie deshalb **direkt aus `trophy`** und mischt sie zur
Lesezeit unter die Ereignisse – dieselbe Haltung wie „Berechnetes nicht speichern" (5.2). Daraus
folgt die Arbeitsteilung:

| | Quelle | Sortierung |
|---|---|---|
| „Neu" auf dem Dashboard (`GET /api/feed`) | `game_event` **und** `trophy` | nach Zeit, gemischt |
| Änderungen (`GET /api/events`) | nur `game_event` | Keyset über `id` |
| Verlauf eines Spiels (`GET /api/games/:id/events`) | nur `game_event` | Keyset über `id` |

Die Trennung ist keine Bequemlichkeit, sondern hält das Keyset der beiden Protokollansichten
heil: Zwei Quellen mit zwei Zeitachsen lassen sich nicht über eine Id blättern. Der Feed braucht
das nicht – er zeigt acht Zeilen und verlinkt auf die Ansichten.

**Verdichtung (Entscheidung des Nutzers vom 01.10.2026).** Je **Spiel und Tag** eine Zeile:
„12 Trophäen, davon 1 Gold". **Platin steht immer für sich**, mit seinem eigenen Zeitpunkt, und
zählt in der Sammelzeile nicht mit – ein Platin ist der Abschluss, keine Position in einer Liste.
Der Zeitpunkt einer Sammelzeile ist das **späteste** `earned_at` ihres Tages, damit sie sich
richtig zwischen die Ereignisse einsortiert. Die Sätze entstehen zur Lesezeit wie alle anderen,
in `src/domain/ereignis.ts`, aber in einer **eigenen** Liste neben `EREIGNIS_ARTEN`: Was nie in
`game_event` geschrieben wird, gehört nicht in die Liste dessen, was dort stehen darf. Die Quelle
der Zeile ist `sync` – die Trophäe kommt von Sony.

**Zwei Dinge halten die Erstbefüllung aus dem Feed heraus**, und es braucht beide:

1. **Das Zeitfenster zählt das Erspielt-Datum, nicht den Abrufzeitpunkt.** Sonst stünden beim
   ersten Füllen 11 168 Trophäen aus fünfzehn Jahren als „neu" im Feed. Mit dem Fenster sind es
   die des letzten Monats – also das, was tatsächlich neu ist.
2. **Solange die Erstbefüllung läuft, zeigt der Feed gar keine Trophäenzeilen.** Das Fenster
   allein genügt nicht: Die Erstbefüllung geht Liste für Liste, nicht nach Datum, und so
   erschiene drei Wochen lang jede Nacht eine Handvoll Zeilen mit **rückdatiertem** Zeitpunkt –
   ein Feed, der nach hinten wächst. Erst wenn der Bestand vollständig ist, stimmt die Zeitachse.

**Die Lesekosten entscheidet ein Index, nicht die Abfrage.** Der Feed ist die erste Seite nach
jedem Start der App (Abschnitt 2); ein `WHERE earned_at >= …` ohne Index liest bei jedem Aufruf
alle 18 355 Trophäen. `trophy` bekommt deshalb einen Teilindex auf dem Erspielt-Datum, und die
Abfrage liest nur das Fenster. Das kostet beim Schreiben: Die Erstbefüllung steigt von rund
18 400 auf **rund 29 500 geschriebene Zeilen** (eine je Trophäe, plus eine je *erspielter*
Trophäe im Teilindex) – von 100 000 am Tag (15.4).
