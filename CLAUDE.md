# Trophytracker

Single-User-Webanwendung zur Verwaltung einer PlayStation-Spielesammlung (PS3, PS4, PS5, PS Vita).

**Die vollständige Spezifikation steht in `docs/spezifikation.md`. Sie ist die maßgebliche Quelle.**
Lies den relevanten Abschnitt, bevor du an einem Feature arbeitest. Diese Datei enthält nur das, was in jeder Sitzung gilt.

---

## Stack

- Backend: Cloudflare Worker, TypeScript, Hono
- Datenbank: Cloudflare D1 (SQLite), Migrations über Wrangler
- Frontend: React + Vite + TypeScript, PWA, als Static Assets im selben Worker ausgeliefert
- Geplante Jobs: Cloudflare Cron Triggers
- Schwere Importe: GitHub Actions (nicht im Worker)
- Zugriffsschutz: Cloudflare Access

## Befehle

```bash
npm run dev                                       # Frontend (Vite), proxyt /api auf :8787
npx wrangler dev                                  # Worker + gebaute Assets, mit lokaler D1
npx wrangler d1 migrations create <db> <name>     # neue Migration
npx wrangler d1 migrations apply <db> --local     # lokal anwenden
npx wrangler d1 export <db> --remote --output=backup.sql
npm run build                                     # Frontend nach frontend/dist
npm test                                          # Vitest
```

Migrationen **niemals** von Hand gegen `--remote` anwenden. Das macht ausschließlich der Deploy-Job.

---

## Regeln, die nicht verhandelbar sind

Diese Punkte sind in der Spezifikation begründet. Wenn eine Änderung sie verletzen würde, weise darauf hin, statt sie zu umgehen.

### Fremddaten und eigene Bewertung nie vermischen

`trophy_progress` kommt von Sony und wird bei jedem Sync überschrieben.
`play_status` ist die Bewertung des Nutzers.

Der Sync ändert `play_status` **nur** beim allerersten Import eines Titels (100 % → `komplettiert`, >0 % → `am_spielen`). Existiert bereits eine Zeile mit einem anderen Wert als `nicht_gespielt`, wird sie nie angefasst. Jede spätere Änderung wandert in `review_queue` und wartet auf eine Entscheidung des Nutzers.

Dasselbe gilt für Zuordnungen: Ein einmal gesetztes `trophy_progress.release_id` wird von keinem automatischen Prozess überschrieben.

**To-Do und Backlog sind mit `play_status` gekoppelt** (Abschnitt 5.5, Entscheidung des Nutzers vom 16.09.2026): To-Do heißt `am_spielen`, Backlog `pausiert` (nie gestartete bleiben `nicht_gespielt`); eine Bewertung legt den Eintrag an, hängt ihn um oder erledigt ihn. Das ist kein dritter automatischer Pfad, sondern dieselbe Nutzerentscheidung in zwei Darstellungen – jeder Schreibpfad läuft über `src/db/kopplung.ts`, der Sync nie. Wer einen neuen Weg auf eine der beiden Listen oder einen neuen Weg zum Status baut, koppelt dort mit.

### Nur PS3, PS4, PS5 und PS Vita

Spiele anderer Plattformen dürfen nirgends auftauchen – nicht in Suche, Kandidaten, Listen oder Zuordnung. Ein IGDB-Eintrag ist nur ein Treffer, wenn er eine der vier Plattformen **nennt**; fehlende Angabe ist kein „vielleicht" (7.6 – die frühere Ausnahme ließ einen PC-Eintrag als PS4-Wunsch durch, vom Nutzer am 16.09.2026 zweimal angemahnt). Jede neue Datenquelle (Feed, Store, Barcode) bekommt dieselbe Prüfung und wird gegen die echten Verknüpfungen gemessen, bevor sie live geht.

### Dreiwertige Felder nicht zu Booleans vereinfachen

`release.physical_release_status` ist `ja` / `nein` / `unbekannt`. Fehlende Daten sind `unbekannt`, niemals `nein`. Ein `nein` setzt ausschließlich der Nutzer von Hand. Automatische Quellen (IGDB seit Stufe 14, Feed ab Stufe 18) setzen **nur** `unbekannt → ja` und fassen weder ein `nein` noch ein bestehendes `ja` an; `physical_source` sagt, wer es war (Abschnitt 3).

Das gilt auch in der Oberfläche: fehlende Preise und unbekannte Werte werden als "unbekannt" angezeigt, nie als "0", "–" oder "nicht verfügbar".

Und für Eingaben: Ein freiwilliges Feld bleibt leer, statt mit einem plausiblen Wert vorbelegt zu werden. **Eine Ausnahme hat der Nutzer am 15.09.2026 ausdrücklich entschieden:** Die Plattform eines Wunsches wird mit der *neuesten* Plattform vorbelegt, die Releases oder IGDB-Eintrag nennen (PS5 > PS4 > PS3 > Vita, `neuestePlattform`), sichtbar in einem Dropdown und vor dem Speichern änderbar, „ohne Plattform" eingeschlossen; der Filter „ohne Plattform" auf der Wunschliste findet, was nachzupflegen ist (Spezifikation Abschnitt 5). Das ist ein Vorschlag mit Korrekturmöglichkeit, kein stiller Standardwert – und für kein anderes Feld ein Freibrief. Ein Vorschlag steht dabei als **konkreter Wert** im Feld („PS4"), nie als Platzhalter („neueste des Treffers", „automatisch"): Wo Treffer verschiedene Werte hätten, gehört das Feld an den Treffer, nicht darüber – Rückmeldung aus der Abnahme von Stufe 11.

Im CSV-Export ist ein **leeres Feld** die Entsprechung davon (Abschnitt 14.4): Das Wort in einer Zahlenspalte wäre dort der schlechtere Weg.

### Kein vollautomatisches Matching

PSN-Trophäentitel, Feed-Artikel und IGDB-Treffer werden **vorgeschlagen**, nicht stillschweigend zugeordnet. Nur ein eindeutiger Treffer mit hoher Ähnlichkeit darf automatisch zugeordnet werden; alles andere landet in einer Zuordnungsansicht.

Beim Wunschlisten-Import gibt es keinen Freitext-Fallback. Zeilen ohne Treffer gehen in die IGDB-Suche. Ein Eintrag ohne Zuordnung entsteht nur auf ausdrückliche Anweisung des Nutzers.

Vorschlagslisten sind **geordnet**, nicht in der Lieferreihenfolge der Quelle: Schlüsseltreffer, dann Hauptspiel-artige Typen vor DLC, dann die Plattform des Spiels (`ordneKandidaten`, Abschnitt 7.6). Zehn Skin-Pakete vor dem Hauptspiel sind kein Vorschlag – das war die erste Rückmeldung aus der Abnahme von Stufe 9.

### Zuordnungen müssen korrigierbar sein

Was halb- oder vollautomatisch entsteht, muss sich in der Oberfläche zurücknehmen lassen: umbenennen, auftrennen, einzeln statt als Gruppe übernehmen. Sonst steht der Nutzer vor einem Ergebnis, das er als falsch erkennt und nicht ändern kann.

Das gilt auch für seine Zwischenentscheidungen: Ein "überspringen" ist eine Entscheidung und darf ein Neuladen überstehen, nicht nur den Moment.

### Berechnetes nicht speichern

Sortierungen der Listen (Favorit, Kritikerwertung, Erscheinungsdatum) werden bei der Abfrage aus gespeicherten Bestandteilen gebildet, nie als Rang abgelegt. Die frühere Rangformel mit Gewichten ist seit Migration 0013 weg (Favorit statt Priorität, Entscheidung des Nutzers vom 15.09.2026, Abschnitt 5.2) – kommt so etwas zurück, gilt dieselbe Regel.

Ebenso: "nur digital gespielt" und "Lücke" sind Views, keine Spalten.

### CPU-Grenze respektieren

Der Free Tier erlaubt 10 ms CPU pro Aufruf. D1-Abfragen und Netzwerk-Wartezeit zählen nicht mit, eigenes Rechnen schon.

- **Cron Trigger helfen nicht.** Auf dem Free Tier gilt für sie dieselbe 10-ms-Grenze wie für normale Anfragen; die 30 Sekunden gibt es erst im Bezahlplan. Der Schutz kommt aus dem Entwurf, nicht aus dem Auslöser: Arbeit pro Aufruf begrenzen und den Fortschritt in der Datenbank halten, damit der nächste Aufruf weitermacht
- Schwere Importe (Händler-Feeds) laufen in einer GitHub Action, nicht im Worker
- Große Fremddaten (Händler-Feeds) werden in der GitHub Action geparst und gefiltert; der Worker bekommt nur fertige Batches
- Rohantworten seitenweise speichern, nicht am Stück parsen

### Zeilenlese-Grenze respektieren

D1 zählt **gelesene Zeilen** (Scans, nicht Ergebniszeilen), und der Free Tier erlaubt 5 Millionen am Tag. Danach antwortet jede Abfrage aus dem Worker bis Mitternacht UTC mit `D1_ERROR`, die Anwendung ist tot. Am 13.09.2026 ist das passiert: Die Sammlungsansicht las ohne Indizes 160 000 Zeilen je Seite, sortiert nach „zuletzt gespielt" 741 000.

- **Jeder Fremdschlüssel hat einen Index** (Migration 0008). Wer eine Tabelle mit `REFERENCES` anlegt, legt den Index in derselben Migration an
- **Korrelierte Unterabfragen nur über indizierte Spalten.** Ein Unterselect je Ergebniszeile ist in Ordnung, wenn er ein Index-Lookup ist; als Tabellenscan multipliziert er sich mit der Zeilenzahl
- `test/lesekosten.spec.ts` misst die heißen Abfragen gegen einen Bestand in Produktionsgröße über `meta.rows_read` der lokalen D1. Neue Listenabfragen kommen dort dazu, bevor sie deployt werden
- `npx wrangler d1 info trophytracker` zeigt `rows_read_24h`; bei mehr als einer Million ohne Import stimmt etwas nicht

### Geheimnisse sind im Typ gekapselt

NPSSO, Refresh- und Access Token wandern ausschliesslich als `Geheimnis` (`src/domain/secret.ts`) durch den Code. `toString()` und `toJSON()` redigieren, der Klartext ist nur über `.offenlegen()` erreichbar. Sie dürfen **nie** in einer API-Antwort, einer Fehlermeldung oder im Log erscheinen, auch nicht gekürzt — `observability.logs` ist eingeschaltet, was einmal drin steht, bleibt liegen.

Daraus folgt: Die Antwort des PSN-Token-Endpunkts wird nie in `psn_raw_response` geschrieben. Dort landen ausschliesslich Trophäen-Seiten. `test/keine-lecks.spec.ts` prüft das über alle Routen, auch in den Fehlerpfaden.

IGDB-Client-Secret und Twitch-Token nehmen denselben Weg. Das Token lebt nur im Speicher der Worker-Instanz, nie in D1 (Abschnitt 7.6). Fehlende IGDB-Secrets oder ein Ratenlimit betreffen ausschliesslich die IGDB-Routen (503), nie die übrige Anwendung.

**Maschinen-Endpunkte tragen keine eigene Token-Prüfung.** `/api/export/*`, `/api/backup/*` und später `/api/imports/feed` laufen über ein Access Service Token; Access steht vor dem ganzen Worker. Kein Bearer-Token im Code — in Stufe 8 entschieden, begründet in Abschnitt 15.3.

### Rohdaten vor Normalisierung

PSN-Antworten werden zuerst unverändert in `psn_raw_response` geschrieben, danach normalisiert. Die beiden Schritte bleiben getrennt, damit die Normalisierung ohne PSN-Zugriff wiederholbar ist.

Der Sync hat deshalb zwei Phasen (`psn_sync_run.phase`): erst `abruf`, dann `normalisierung`, beide mit begrenzter Arbeit je Aufruf. `POST /api/sync/normalize` setzt `normalized_at` zurück und lässt die Normalisierung erneut laufen — ohne PSN.

Das gilt für PSN. IGDB-Antworten werden **nicht** roh abgelegt — offizielle Schnittstelle, klein, jederzeit neu abrufbar; `igdb_candidate` hält nur die normalisierten Kandidaten und ist deshalb `NICHT_EXPORTIERT`.

### Titelnormalisierung ist geteilte Logik

`src/domain/titel.ts` hält `titelSchluessel` (aggressiv, nur zum Vergleichen) und `anzeigeTitel` (zurückhaltend, für `game.title`). Beide werden ab Stufe 9 auch für IGDB und ab Stufe 11 für den Wunschlisten-Import gebraucht — Änderungen dort wirken auf alle Abgleiche. `trophy_progress.title_name` bleibt immer der Rohwert von Sony. `game.title` eines Spiels **mit** Trophäenliste bleibt der daraus normalisierte Titel; ein Spiel **ohne** Trophäenliste (von Hand, aus einem Wunsch) übernimmt beim Verknüpfen den IGDB-Namen, nur dann, nie beim Auffrischen – was der Nutzer umbenennt, bleibt (7.6).

**`game.sort_title` ist abgeleitet und veraltet still**, wenn sich `titelSchluessel` ändert. Nach jeder Änderung an der Normalisierung `POST /api/games/schluessel-neu-berechnen` aufrufen — sonst findet die automatische Zuordnung über `sort_title` falsche oder gar keine Kandidaten. Die Ansicht „Sammlung prüfen" markiert veraltete Schlüssel. Wo der Titel ohnehin vorliegt, den Schlüssel frisch berechnen statt `sort_title` zu lesen; die Spalte ist nur für SQL-Lookups da.

Gegen die echten 431 Titel abgesichert: Diakritika werden gefaltet (sonst wird „Ragnarök" zu „ragnar k"), nicht-lateinische Titel fallen auf den Anzeigenamen zurück (sonst wäre der Schlüssel leer), und ein hängendes „the" nach entfernter Edition wird abgeschnitten.

### Keine echten PSN-Daten als Testdaten

Die Rohantworten in der Produktionsdatenbank wären perfektes Testmaterial und enthalten die vollständige Spielhistorie des Nutzers. Dieses Repository ist öffentlich. Testdaten werden deshalb nachgebaut (`test/trophy-fixtures.ts`), nie kopiert — dieselbe Regel wie beim Datenbank-Dump.

Dasselbe gilt für die Wunschlisten des Nutzers in `wunschlisten/` (per `.gitignore` ausgeschlossen, nur die README ist drin) und für Messskripte gegen echte Daten: Sie bleiben im Scratchpad, ins Repository kommen nur Zahlen.

### Datenbankzugriff kapseln

Kein `env.DB.prepare()` direkt in Route-Handlern. Alle Zugriffe laufen über eine Repository-Schicht in `src/db/`. Das hält einen späteren Wechsel zu Turso, Postgres oder lokalem SQLite auf eine überschaubare Zahl von Dateien begrenzt.

---

## Sicherheit

Niemals ins Repository committen: NPSSO, PSN-Refresh-Token, IGDB/Twitch-Zugangsdaten, AWIN-Feed-URLs (enthalten die Publisher-ID), API-Bearer-Token, Cloudflare-API-Token.

Lokale Geheimnisse gehören in `.dev.vars`, produktive in Cloudflare Secrets. In der `.gitignore` müssen stehen: `.dev.vars`, `.wrangler/`, `*.sql`.

Das Repository ist öffentlich, das Backup-Repository ist privat. Ein Datenbank-Dump darf unter keinen Umständen in diesem Repo landen.

`account_id` und `database_id` sind Bezeichner, keine Zugangsdaten, und dürfen in der Konfiguration stehen.

---

## Arbeitsweise

- **Eine Stufe aus Abschnitt 16 der Spezifikation pro Branch.** Nicht mehrere zusammenfassen.
  Branch-Namen nach dem Muster `stufe-<n>-<kurzbeschreibung>`. Merge nach `main` immer
  mit `--no-ff`, damit jede Stufe im Verlauf ein eigener, umkehrbarer Block bleibt und
  `git revert -m 1 <merge>` eine ganze Stufe zurücknimmt.
- **Dokumentation gehört zur Aufgabe, nicht dahinter.** Es gibt zwei Orte, und beide
  werden im selben Commit aktuell gehalten wie der Code:
  - `docs/spezifikation.md` – die maßgebliche Quelle. Jede Abweichung wird dort
    nachgezogen, an *allen* betroffenen Stellen, mit Versionsnummer in der Kopfzeile.
  - `README.md` – Einrichtung, Secrets, Deployment, Wiederherstellung, aktueller Stand.
    Was ein Aussenstehender braucht, um das Projekt zu betreiben.

  Offene Entscheidungen bleiben ausdrücklich als offen markiert ("in Stufe N zu
  entscheiden"), statt stillschweigend geschlossen zu werden.
- **Vor größeren Aufgaben einen Plan vorlegen**, insbesondere bei allem, was Migrationen oder externe Schnittstellen berührt.
- **Migrationen abwärtskompatibel halten.** Sie laufen vor dem Deployment, der alte Worker läuft in dem Moment noch. Spalten hinzufügen ist unkritisch, Umbenennen braucht zwei Deployments. Eine neue Tabelle gehört zugleich in `EXPORT_TABELLEN` oder `NICHT_EXPORTIERT` (`src/db/export.ts`), sonst fährt sie ungesichert mit.
- **Datenmigrationen weisen ihre Wirkung nach.** Schreibt oder löscht eine Migration Zeilen, prüft der Deploy-Job vorher die Sicherung (INSERT-Zeilen im Dump gegen `COUNT(*)` der Datenbank, Abbruch vor der Migration bei Abweichung) und protokolliert danach die betroffene Zeilenzahl neben der Erwartung. Nur Zahlen ins Log, nie Inhalt — das Repository ist öffentlich. Die Zahlen gehören auch in den Bericht an den Nutzer.
- **Nach jedem Deploy die Produktion selbst prüfen.** Ein grüner Action-Lauf beweist nur, dass die Schritte durchliefen — nicht, dass die neue Fassung ankommt. Die betroffenen Routen und den Asset-Hash des ausgelieferten Frontends über den Access Service Token abrufen (`CF-Access-Client-Id` / `-Secret`, Werte in `.dev.vars`) und das Ergebnis berichten, statt den Nutzer im Browser nachsehen zu lassen. Workflow-Läufe und ihre Logs liest `gh` (Token `claude-code-actions`, nur Actions auf diesem Repo): `gh run list`, und für das Log `gh api repos/ermerp/trophytracker/actions/jobs/<job-id>/logs` — `gh run view --log` liefert in Version 2.46 stillschweigend nichts.
- **Views mit ihren Basistabellen zusammen ändern.** Fasst eine Migration eine Tabelle an, auf der eine View steht, wird die View in **derselben** Migration gedroppt und neu angelegt. Gemessen gegen SQLite 3.46.1: `RENAME COLUMN` schreibt die View-Definition selbst um, aber ein Tabellen-Neuaufbau (`DROP TABLE` + `RENAME TO`) und `DROP COLUMN` scheitern laut mit `error in view …`. Der Neuaufbau ist SQLites Standardweg für jede Constraint- oder Typänderung — ohne vorheriges Droppen der Views ist er schlicht nicht ausführbar, und in der Pipeline wäre das ein roter Deploy mit halb angewendeter Migration.
- **Views listen ihre Spalten explizit auf, nie `SELECT *`.** Das ist der eine Fall, in dem SQLite still danebengreift: Bei `SELECT *` wächst die Ergebnismenge nach einem `ADD COLUMN` lautlos mit, während die Definition in `sqlite_master` unverändert bleibt. Ein Test in `test/migration.spec.ts` hält die Regel fest.
- **Seeds immer als `INSERT OR IGNORE`.** Nicht wegen Idempotenz — Migrationen laufen wegen der `d1_migrations`-Buchführung ohnehin nur einmal —, sondern damit ein erneuter Lauf einen vom Nutzer angepassten Wert niemals zurücksetzt. Kein `CREATE TABLE IF NOT EXISTS`: das verdeckt ein abweichendes Schema, und lautes Scheitern ist dort das bessere Verhalten.
- **Testen, was Logik ist, nicht was Glue ist.** Lohnend: Titel-Normalisierung und Matching, Trophäen-Normalisierung aus Roh-JSON, Wunschlisten-Parser. Diese Funktionen sollen pur bleiben und ohne Datenbank testbar sein. Set-basierte Regeln über den ganzen Bestand – Vorbelegung, Einreihung, Änderungserkennung – sind dagegen bewusst SQL (CPU-Grenze) und werden im Repository-Test gegen die lokale D1 geprüft, mit nachgebauten Zeilen.
- **Abgleichlogik gegen die echten Daten prüfen, bevor sie gebaut wird.** Titelnormalisierung, Matching und Importe treffen auf Fremddaten mit Eigenheiten, die sich nicht erraten lassen. Die Produktivdatenbank ist lesend verfügbar (`wrangler d1 execute --remote --json`), und ein Domain-Modul lässt sich mit `npx esbuild <datei> --format=esm` transpilieren und in Node gegen den echten Bestand laufen lassen — ohne echte Daten ins Repository zu holen.
- **Deutsche Bezeichner in Daten und Oberfläche** (Statuswerte, Anzeigetexte), englische im Code (Variablen, Funktionen). Das Schema in der Spezifikation zeigt die Konvention.
- **Bei Unklarheiten in der Spezifikation nachfragen**, statt eine Annahme zu treffen und weiterzubauen.

## Kontext

Die PSN-Anbindung ist inoffiziell und kann jederzeit brechen. Fehler beim Sync dürfen die Anwendung nie unbenutzbar machen: vorhandene Daten bleiben stehen, der Zustand wird angezeigt, der Nutzer kann ein neues NPSSO eintragen.
