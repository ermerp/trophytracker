← [Inhaltsverzeichnis](README.md)

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

**Was dort niemals hingehört:** NPSSO und PSN-Refresh-Token, IGDB/Twitch-Zugangsdaten, eBay-Cert-ID und Application-Token, das API-Bearer-Token, der Cloudflare-API-Token. Alles davon liegt als Cloudflare Secret beziehungsweise GitHub Secret. `.dev.vars`, `.wrangler/` und `*.sql` gehören in die `.gitignore` – letzteres mit der Ausnahme `!migrations/*.sql`. Ohne diese Ausnahme würden die Migrationen mit ignoriert, und die Deploy-Action liefe gegen ein leeres Verzeichnis.

**Was erzeugt ist, gehört ebenfalls nicht hinein** (seit 09.10.2026): `worker-configuration.d.ts` entsteht aus `npm run cf-typegen` – 15 392 Zeilen, davon 15 379 Runtime-Typen von workerd. Die eingecheckte Fassung war beim Entfernen bereits veraltet. Die Deploy-Action erzeugt sie in **beiden** Jobs vor Test und Build, die README nennt den Aufruf nach einem frischen Klon. **Erzeugt wird nur die Binding-Hälfte** (`wrangler types --env-interface CfBindings`): `DB` und `ASSETS` aus `wrangler.jsonc`, abgelegt als `CfBindings`. Die fünf Geheimnisse des Workers stehen eingecheckt in `src/env.d.ts` und dort **optional**; `Env` ist `Omit<CfBindings, keyof WorkerGeheimnisse> & WorkerGeheimnisse`. Früher las Wrangler sie aus `.dev.vars`, und das war an zwei Stellen falsch: In der Action fehlt die Datei – `tsc` meldete dort sechs Fehler in `src/index.ts` –, und produktiv sind es Cloudflare Secrets, die Wrangler **nie** sieht. Ein erzeugtes `NPSSO_KEY: string` behauptete also das Gegenteil von dem, was der Code tut, der überall auf Abwesenheit prüft. Gemessen am 09.10.2026: mit und ohne `.dev.vars` je 0 Fehler, und derselbe ungeprüfte Secret-Zugriff fällt gegen die optionale Typisierung auf (Exit 2), gegen die erzeugte nicht (Exit 0). `CF_ACCESS_CLIENT_ID`/`_SECRET` stehen bewusst **nicht** darin: Zugangsdaten des Betreibers für die Prüfaufrufe (15.3), vom Worker nie gelesen.

**`--include-runtime=false` taugt hier nicht**, obwohl Wrangler es kann (26 statt 15 392 Zeilen): Die Runtime-Typen kommen ausschliesslich aus dieser Datei – `@cloudflare/workers-types` ist nicht installiert –, und ohne sie meldet `tsc` 64 Fehler, angefangen bei `Cannot find name 'D1Database'`.

### 15.2 Automatisches Deployment

**Frontend:** Kein eigenes Hosting. Vite baut das Frontend nach `frontend/dist`, und derselbe Worker liefert es als Static Assets aus (`assets.directory`, `not_found_handling: "single-page-application"`). `run_worker_first: ["/api/*"]` sorgt dafür, dass die API immer den Worker erreicht und alles Übrige auf `index.html` zurückfällt.

Frontend und API teilen sich damit eine Origin: **kein CORS, ein Deploy-Pfad, eine Access-Richtlinie**. Der Preis sind die automatischen PR-Vorschau-URLs, die ein Pages-Projekt mitbrächte; nachrüstbar wären sie über `wrangler versions upload`, dessen Preview-URLs von derselben Access-Richtlinie abgedeckt sind.

**Worker und Datenbank:** GitHub Action mit `cloudflare/wrangler-action`, ausgelöst durch Push auf `main`. Die Reihenfolge der Schritte ist wichtiger als das Werkzeug:

0. Im Job davor: `npm ci`, `npm run cf-typegen`, `npm run typecheck`, `npm test`, `npm run build`. Die Typprüfung nimmt `src/` und `test/` und hängt seit dem 09.10.2026 dort – vorher prüfte sie **niemand**: vitest transpiliert mit esbuild ohne Typprüfung, und `npm run build` baut nur das Frontend (dessen `tsc -b` darin steckt)
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
| Workers (Fremdanfragen) | 50 je Aufruf | weitere `fetch` schlagen fehl – gegen die Dokumentation geprüft am 01.10.2026 |
| Workers Static Assets | im Workers-Kontingent | 429 statt Auslieferung |
| D1 | 5 GB, 5 Mio. gelesene / 100.000 geschriebene Zeilen pro Tag | Abfragen schlagen fehl, keine Abrechnung |
| Zero Trust Access | 50 Sitze | Weitere Nutzer werden abgewiesen |

Der Wechsel in einen Bezahlmodus ist damit immer eine **ausdrückliche Handlung**
(Upgrade-Klick), kein Nebeneffekt von Nutzung. Für eine Single-User-Anwendung
sind die Grenzen ohnehin um Größenordnungen entfernt: ein Sitz von 50, und ein
Trophäen-Sync erzeugt einige hundert Anfragen, nicht hunderttausend. Die 72 Cron-Aufrufe je
Nacht (10.1, zwei Einträge von fünf erlaubten) zählen als Anfragen. **Gemessen am 01.10.2026:
116 040 gelesene und 799 geschriebene Zeilen in 24 Stunden**; die Rechnung aus den Einzelkosten
liegt heute bei rund 80 800 im Leerlauf (10.1), und die 24-Stunden-Messung liegt vor der
Erweiterung des Wartungsfensters. Von den beiden Grenzen ist die **Schreibgrenze** die
engere, sobald eine Stufe den Bestand einmal durchschreibt: Stufe 19b käme mit 18 355 Trophäen
auf rund 37 000 Schreibungen (7.7).

Nicht abgedeckt von dieser Zusicherung sind Dienste, die es gar keinen Free-Tier
gibt – wer später etwa Workers Paid für Cron-Häufigkeiten oder R2 hinzunimmt,
trifft diese Entscheidung bewusst. Für den in Abschnitt 2 beschriebenen Stack
ist das nicht nötig.

### 15.5 Was das Teilen wert ist

Das Repo ist ohne deine Daten vollständig nachvollziehbar: Schema, Migrations, Matching-Logik und die Anbindungen sind der interessante Teil, die Sammlung ist es nicht. Wer das Projekt nachbauen will, legt eine eigene D1-Datenbank an und trägt sein eigenes NPSSO ein.

Sinnvoll für die README: Setup-Anleitung, Liste der benötigten Secrets, der Wiederherstellungsablauf aus 14.3 und ein ausdrücklicher Hinweis darauf, dass die PSN-Anbindung inoffiziell ist.
