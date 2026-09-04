# Trophytracker

Single-User-Webanwendung zur Verwaltung einer PlayStation-Spielesammlung (PS3, PS4, PS5).

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

### Dreiwertige Felder nicht zu Booleans vereinfachen

`release.physical_release_status` ist `ja` / `nein` / `unbekannt`. Fehlende Daten sind `unbekannt`, niemals `nein`. Ein `nein` setzt ausschließlich der Nutzer von Hand.

Das gilt auch in der Oberfläche: fehlende Preise und unbekannte Werte werden als "unbekannt" angezeigt, nie als "0", "–" oder "nicht verfügbar".

### Kein vollautomatisches Matching

PSN-Trophäentitel, Feed-Artikel und IGDB-Treffer werden **vorgeschlagen**, nicht stillschweigend zugeordnet. Nur ein eindeutiger Treffer mit hoher Ähnlichkeit darf automatisch zugeordnet werden; alles andere landet in einer Zuordnungsansicht.

Beim Wunschlisten-Import gibt es keinen Freitext-Fallback. Zeilen ohne Treffer gehen in die IGDB-Suche. Ein Eintrag ohne Zuordnung entsteht nur auf ausdrückliche Anweisung des Nutzers.

### Berechnetes nicht speichern

Die Rangformel (Kritikerwertung, Priorität, Favorit, später Preis) wird bei der Abfrage berechnet. Gespeichert werden nur die Bestandteile, die Gewichte liegen in `app_setting`.

Ebenso: "nur digital gespielt" und "Lücke" sind Views, keine Spalten.

### CPU-Grenze respektieren

Der Free Tier erlaubt 10 ms CPU pro Aufruf. D1-Abfragen und Netzwerk-Wartezeit zählen nicht mit, eigenes Rechnen schon.

- **Cron Trigger helfen nicht.** Auf dem Free Tier gilt für sie dieselbe 10-ms-Grenze wie für normale Anfragen; die 30 Sekunden gibt es erst im Bezahlplan. Der Schutz kommt aus dem Entwurf, nicht aus dem Auslöser: Arbeit pro Aufruf begrenzen und den Fortschritt in der Datenbank halten, damit der nächste Aufruf weitermacht
- Schwere Importe (Händler-Feeds) laufen in einer GitHub Action, nicht im Worker
- Große Fremddaten (Händler-Feeds) werden in der GitHub Action geparst und gefiltert; der Worker bekommt nur fertige Batches
- Rohantworten seitenweise speichern, nicht am Stück parsen

### Geheimnisse sind im Typ gekapselt

NPSSO, Refresh- und Access Token wandern ausschliesslich als `Geheimnis` (`src/domain/secret.ts`) durch den Code. `toString()` und `toJSON()` redigieren, der Klartext ist nur über `.offenlegen()` erreichbar. Sie dürfen **nie** in einer API-Antwort, einer Fehlermeldung oder im Log erscheinen, auch nicht gekürzt — `observability.logs` ist eingeschaltet, was einmal drin steht, bleibt liegen.

Daraus folgt: Die Antwort des PSN-Token-Endpunkts wird nie in `psn_raw_response` geschrieben. Dort landen ausschliesslich Trophäen-Seiten. `test/keine-lecks.spec.ts` prüft das über alle Routen, auch in den Fehlerpfaden.

### Rohdaten vor Normalisierung

PSN-Antworten werden zuerst unverändert in `psn_raw_response` geschrieben, danach normalisiert. Die beiden Schritte bleiben getrennt, damit die Normalisierung ohne PSN-Zugriff wiederholbar ist.

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
- **Migrationen abwärtskompatibel halten.** Sie laufen vor dem Deployment, der alte Worker läuft in dem Moment noch. Spalten hinzufügen ist unkritisch, Umbenennen braucht zwei Deployments.
- **Views mit ihren Basistabellen zusammen ändern.** Fasst eine Migration eine Tabelle an, auf der eine View steht, wird die View in **derselben** Migration gedroppt und neu angelegt. Gemessen gegen SQLite 3.46.1: `RENAME COLUMN` schreibt die View-Definition selbst um, aber ein Tabellen-Neuaufbau (`DROP TABLE` + `RENAME TO`) und `DROP COLUMN` scheitern laut mit `error in view …`. Der Neuaufbau ist SQLites Standardweg für jede Constraint- oder Typänderung — ohne vorheriges Droppen der Views ist er schlicht nicht ausführbar, und in der Pipeline wäre das ein roter Deploy mit halb angewendeter Migration.
- **Views listen ihre Spalten explizit auf, nie `SELECT *`.** Das ist der eine Fall, in dem SQLite still danebengreift: Bei `SELECT *` wächst die Ergebnismenge nach einem `ADD COLUMN` lautlos mit, während die Definition in `sqlite_master` unverändert bleibt. Ein Test in `test/migration.spec.ts` hält die Regel fest.
- **Seeds immer als `INSERT OR IGNORE`.** Nicht wegen Idempotenz — Migrationen laufen wegen der `d1_migrations`-Buchführung ohnehin nur einmal —, sondern damit ein erneuter Lauf einen vom Nutzer angepassten Wert niemals zurücksetzt. Kein `CREATE TABLE IF NOT EXISTS`: das verdeckt ein abweichendes Schema, und lautes Scheitern ist dort das bessere Verhalten.
- **Testen, was Logik ist, nicht was Glue ist.** Lohnend: Titel-Normalisierung und Matching, Trophäen-Normalisierung aus Roh-JSON, Änderungserkennung für die `review_queue`, Rangformel. Diese Funktionen sollen pur bleiben und ohne Datenbank testbar sein.
- **Deutsche Bezeichner in Daten und Oberfläche** (Statuswerte, Anzeigetexte), englische im Code (Variablen, Funktionen). Das Schema in der Spezifikation zeigt die Konvention.
- **Bei Unklarheiten in der Spezifikation nachfragen**, statt eine Annahme zu treffen und weiterzubauen.

## Kontext

Die PSN-Anbindung ist inoffiziell und kann jederzeit brechen. Fehler beim Sync dürfen die Anwendung nie unbenutzbar machen: vorhandene Daten bleiben stehen, der Zustand wird angezeigt, der Nutzer kann ein neues NPSSO eintragen.
