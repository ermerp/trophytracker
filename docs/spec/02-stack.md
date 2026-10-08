← [Inhaltsverzeichnis](README.md)

## 2. Stack

| Komponente | Technologie |
|---|---|
| Backend | Cloudflare Worker, TypeScript, Hono |
| Datenbank | Cloudflare D1 (SQLite) |
| Frontend | React + Vite + TypeScript, als PWA |
| Hosting Frontend | Static Assets im selben Worker |
| Geplanter Sync | Cloudflare Cron Trigger – `*/5 3-5 * * *`, ein Schritt je Aufruf (10.1) |
| Feed-Import | GitHub Action (siehe 7.3) |
| Deployment/CLI | Wrangler |
| PSN-Trophäen | `psn-api` (npm) oder direkte fetch-Aufrufe |
| Metadaten/Cover | IGDB API (kostenlos über Twitch-Client-ID) |
| Titel zu Barcodes | eBay Browse API (Developer-Account), upcitemdb als Rückfall – beide live im Worker (9.2) |
| Gebrauchtpreise | eBay Browse API, Händler- und Marktsuche je Release (7.3) |
| Store-Preise | gerenderte Produktseite des PSN Store, als Strom gelesen (7.4) |

Migrations über Wrangler D1 Migrations. Repository auf GitHub, die Deploy-Action baut und deployt bei Push auf `main`.

**Hinweis zur CPU-Grenze:** Der Free Tier begrenzt auf 10 ms CPU pro Aufruf. D1-Abfragen und Netzwerk-Wartezeit zählen nicht mit, nur Rechenzeit im Worker selbst. Die zusätzlichen Views sind daher unkritisch. Kritisch bleibt ausschliesslich das Parsen grosser Fremddaten – siehe 7.3.

**Hinweis zur Zeilenlese-Grenze:** D1 zählt gelesene Zeilen – gescannte, nicht zurückgegebene – und
der Free Tier erlaubt 5 Millionen am Tag. Ist die Grenze erreicht, antwortet jede Abfrage aus dem
Worker bis Mitternacht UTC mit einem Fehler; die Anwendung ist bis dahin unbenutzbar, die Daten
bleiben unberührt. **Jede Spalte, über die in einer Schleife gesucht wird, braucht einen Index** – Fremdschlüssel oder
nicht. Beide Hälften dieser Regel sind teuer gelernt worden (13.09.2026 und 28.09.2026,
Migrationen 0008, 0011 und 0025, Hergang in [lehren.md](../lehren.md)); die Zahlen dahinter: ohne
Index auf den Fremdschlüsseln las die Sammlungsansicht **160 000 Zeilen je Seite** und
**741 000** sortiert nach „zuletzt gespielt", heute 2 000 bis 5 000; ohne Index auf
`game.sort_title` las der Titelabgleich **480 Zeilen je Aufruf** statt vier, 303-mal je Nacht und
730-mal je Kaufliste-Durchlauf, was `rows_read_24h` ohne jeden Import auf **1 335 628** brachte.
Kein `UNIQUE` auf `sort_title`: Zwei Spiele dürfen denselben Schlüssel tragen, das ist der
mehrdeutige Fall aus 7.2.

`test/lesekosten.spec.ts` misst die heißen Abfragen gegen einen Bestand in Produktionsgröße und
hält Obergrenzen fest – **Leseansichten und Schreibschritte**. Ein Sync-Schritt, der je Eintrag
eine Abfrage macht, gehört genauso dort hinein wie eine Listenansicht. Korrelierte Unterabfragen
laufen nur über indizierte Spalten.
Migration 0011 holt den in 0008 übersehenen Index auf `plan_entry.game_id` nach (bis Stufe 10 hing
kein Eintrag an einem Spiel) und legt einen auf `game.igdb_id` an; die Wunschliste liest bei 300
Wünschen rund 900 Zeilen, die Absichten eines Spiels sechs. `v_backlog_kandidaten` liest bei 470
Releases im Besitz rund 1 800 Zeilen (vier Index-Lookups je Release, Stufe 12).

**Zwei harte Grenzen von D1 im Statement selbst.** Erstens **100 gebundene Werte je Statement** –
ein `INSERT … VALUES (?,?,?), …` über eine ganze Seite passt nicht, und `/api/games` kappt `limit`
deshalb auf 100 (gemessen am 18.09.2026: mit 200 antwortete die Produktion mit `500`). Zweitens
**höchstens fünf Terme in einem zusammengesetzten SELECT**: Fünf mit `UNION ALL` verbundene
Teilabfragen gehen, sechs antworten mit `too many terms in compound SELECT` (SQLITE_ERROR 7500).
Gemessen am 24.09.2026 gegen Produktion **und** lokale D1 – anders als beim Bind-Limit scheitert
das also schon im Test. Eine Kennzahlentabelle als ein grosses `UNION ALL` ist damit ausgeschlossen;
gezählt wird per `SUM(bedingung)` und `GROUP BY` in einem Batch (Stufe 19a, `src/db/stats.ts`).

**Cron Trigger helfen dagegen nicht.** Auf dem Free Tier gilt für sie dieselbe 10-ms-Grenze wie für
normale Anfragen; die 30 Sekunden gibt es erst im Bezahlplan (geprüft gegen die Cloudflare-Doku am
19.09.2026: 10 ms je Cron-Aufruf, 5 Cron Trigger je Konto). Der Schutz muss deshalb aus dem
Entwurf kommen, nicht aus dem Auslöser: **Arbeit pro Aufruf begrenzen** (der Trophäen-Sync holt
eine Seite à 100 Titel und merkt sich den nächsten Offset) und **Rohdaten ungeparst ablegen**.
Genau so arbeitet die Automatik seit Stufe 18: Der Cron feuert alle fünf Minuten in einem
Nachtfenster und tut je Aufruf einen Schritt; der Fortschritt steht in `psn_sync_run` (10.1).

Die Grenze ist gemessen: Mit zwei Seiten je Aufruf lag die CPU-Zeit im p99 bei 8,7 ms von 10 ms
erlaubten, mit einer Seite bei rund der Hälfte. Wer die Seitenzahl ändert, misst nach.
