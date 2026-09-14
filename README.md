# Trophytracker

Single-User-Webanwendung zur Verwaltung einer PlayStation-Spielesammlung
(PS3, PS4, PS5, PS Vita):
Besitz, Trophäenfortschritt, eigene Bewertung, Wunsch- und Kaufliste.

Die vollständige Spezifikation steht in [`docs/spezifikation.md`](docs/spezifikation.md).

> **Die PSN-Anbindung ist inoffiziell.** Sony stellt kein öffentliches API für
> Trophäendaten bereit; die Anwendung nutzt die Endpunkte, die auch die
> PlayStation-App verwendet. Sie können sich jederzeit ändern oder wegfallen.
> Die Anwendung ist darauf ausgelegt: Ein fehlgeschlagener Sync lässt vorhandene
> Daten unangetastet und macht nichts unbenutzbar.

## Stand

**Stufe 7 abgeschlossen** ([Umsetzungsreihenfolge](docs/spezifikation.md#16-umsetzungsreihenfolge)).
Die Anwendung läuft unter `trophytracker.philipp-ermer-bvb.workers.dev`. Aus
den Trophäenlisten lassen sich Spiele und Releases anlegen, dazu Besitz
erfassen (Use Case 1) und je Release die eigene Bewertung setzen (Use Case 2).
Die Prüfliste führt einmal durch den ganzen Bestand (Use Case 8, vorerst nur
`erstimport`). **Die Ersteinrichtung ist am 14.09.2026 durchlaufen:** alle 431
Trophäenlisten sind bewertet, die Warteschlange ist leer. Damit steht der
Datenbestand – und ab hier steckt darin Arbeit, die PlayStation nicht
zurückliefert. Stufe 8 sichert ihn ins private Repository.

Was steht und in Betrieb nachgewiesen ist:

| | |
|---|---|
| Deployment | Push auf `main` baut, sichert, migriert und deployt |
| Sicherung vor Migration | `d1 export --remote` läuft als erster Schritt jedes Deploys |
| Frontend und API | ein Worker, eine Origin, kein CORS |
| Zugriffsschutz | Access-Richtlinie am Worker, Option *Cloudflare account* |
| Login | über das Cloudflare-Konto, auch mobil erprobt |
| Schema | 16 Tabellen, 7 Views, acht Migrationen |
| Datenzugriff | Repository-Schicht in `src/db/` |
| PSN-Anbindung | NPSSO-Eingabe, Rohabruf der Trophäenliste, Refresh-Token-Erneuerung |
| Normalisierung | zweite Sync-Phase, ohne PSN wiederholbar |
| Ansicht | Trophäenliste mit Sortierung, Platin-Filter und Blätterung |
| Zuordnung | Gruppenvorschläge nach Titel, ein Spiel mit mehreren Releases |
| Sammlung | Kachelraster mit Filtern (Plattform, Besitz, gespielt, Platin, Disc-Fassung), Suche, Schnellerfassung mit Rückgängig |
| Spieldetail | Exemplare mit Zustand, Kaufdatum, Preis, EAN; digitale Quellen (Kauf, PS Plus, Testversion); Releases anlegen und löschen |
| Besitz | Spiele ohne Trophäenliste von Hand anlegen, Dublettenwarnung über den Titelschlüssel |
| Navigation | `react-router-dom`, Leiste unten (Handy) bzw. seitlich (Desktop), Filter in der URL |
| Bewertung | Status, Bewertung 1–10, Begonnen/Beendet, Notiz je Release; Vorbelegung beim ersten Auftreten einer Trophäenliste, danach nie mehr automatisch angefasst |
| Abweichungen | Trophäenstand und Bewertung passen nicht zusammen – zur Durchsicht in den Einstellungen |
| Prüfliste | Ein Spiel pro Bildschirm, sieben Aktionen (Tasten 1–7), „noch n von m", jederzeit verlassen; Einreihung am Ende jedes Syncs und nach jeder Zuordnung. 100 % wird nicht vorgelegt, sondern still gestempelt |
| Datenbestand | 431 Trophäenlisten, 420 Spiele; bewertet: 167 komplettiert, 119 abgebrochen, 118 durchgespielt, 25 pausiert, 2 am Spielen |
| Offene Posten | Hinweisblock in der Sammlung: Prüfliste, `unentschieden`, nicht zugeordnete Listen – bis es das Dashboard gibt |
| Sicherung geprüft | Der Export wird vor der Migration gegen die Zeilenzahlen der Datenbank gehalten; Datenmigrationen protokollieren ihre Wirkung |
| Lesekosten | Indizes auf allen Fremdschlüsseln; `test/lesekosten.spec.ts` misst die heißen Abfragen gegen 430 Listen (D1 Free Tier: 5 Mio. gelesene Zeilen/Tag) |

Ohne Anmeldung antworten `/`, `/api/health` und beliebige SPA-Pfade mit `302` auf
den Login unter `trophytracker.cloudflareaccess.com`.

## Architektur in einem Absatz

**Ein** Cloudflare Worker liefert sowohl das gebaute React-Frontend (als Static
Assets) als auch die API unter `/api/*`. Dadurch teilen sich beide eine Origin:
kein CORS, ein Deploy-Pfad, eine Access-Richtlinie. Die Daten liegen in
Cloudflare D1.

## Lokale Entwicklung

```bash
npm ci
npm run build        # Frontend nach frontend/dist

# Zwei Terminals:
npx wrangler dev     # Worker + Assets + lokale D1 auf :8787
npm run dev          # Vite mit HMR auf :5173, proxyt /api auf :8787
```

Für die Arbeit am Frontend ist `npm run dev` der richtige Einstieg. Um zu prüfen,
was produktiv tatsächlich ausgeliefert wird, `npm run build` und dann
`npx wrangler dev` allein aufrufen.

Die lokale Entwicklung läuft gegen eine **lokale** D1 in `.wrangler/`, nicht gegen
die produktive Datenbank. Nur Befehle mit `--remote` fassen die echten Daten an.

```bash
npm test             # Vitest
```

## Einrichtung eines eigenen Kontos

Das Repository ist ohne die Daten vollständig nachvollziehbar. Wer es nachbauen
will, braucht ein eigenes Cloudflare-Konto und ein eigenes NPSSO.

1. **D1-Datenbank anlegen**

   ```bash
   npx wrangler login
   npx wrangler d1 create trophytracker
   ```

   Wrangler trägt das Binding selbst in `wrangler.jsonc` ein – **hängt dabei aber
   einen zusätzlichen Eintrag an, statt einen vorhandenen zu füllen**, und benennt
   das Binding nach der Datenbank. Danach kontrollieren, dass genau ein Eintrag
   unter `d1_databases` steht und das Binding `DB` heißt; der Code greift über
   `env.DB` darauf zu.

   `database_id` und `account_id` sind Bezeichner, keine Zugangsdaten, und dürfen
   im öffentlichen Repository stehen.

   Prüfen lässt sich das Ergebnis ohne Deployment:

   ```bash
   npx wrangler deploy --dry-run   # muss env.DB und env.ASSETS zeigen, sonst nichts
   npx wrangler d1 info trophytracker
   ```

2. **`workers.dev`-Subdomain anlegen.** Einmal Dashboard → Workers & Pages
   öffnen; die Subdomain wird dabei automatisch erzeugt und du wählst ihren
   Namen. Ohne sie hat `wrangler deploy` kein Ziel und die Deploy-Action
   scheitert im letzten Schritt – anlegen kann Wrangler sie in CI nicht, weil
   das eine interaktive Eingabe wäre.

   ```bash
   # Gegenprobe, bevor die Action laeuft:
   curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/<account_id>/workers/subdomain"
   ```

3. **Cloudflare-API-Token erstellen** (My Profile → API Tokens → Custom token),
   bewusst eng geschnitten:

   | Bereich | Berechtigung |
   |---|---|
   | Account → Workers Scripts | Edit |
   | Account → D1 | Edit |
   | Account → Account Settings | Read |

   Keine Zone- und keine Pages-Berechtigung nötig.

4. **GitHub Secrets** hinterlegen (Settings → Secrets and variables → Actions):

   | Secret | Wofür | Ab Stufe |
   |---|---|---|
   | `CLOUDFLARE_API_TOKEN` | Deploy-Action | 0 |
   | `CLOUDFLARE_ACCOUNT_ID` | Deploy-Action | 0 |
   | `BACKUP_REPO_TOKEN` | Fine-grained PAT, nur auf das private Backup-Repo | 8 |

   Dazu ein **Cloudflare Secret** (nicht GitHub):

   | Secret | Wofür |
   |---|---|
   | `NPSSO_KEY` | Schlüssel für die Verschlüsselung von NPSSO und Refresh-Token in D1 |

   ```bash
   openssl rand -base64 32              # 32 Byte, Base64
   npx wrangler secret put NPSSO_KEY    # produktiv
   ```

   Lokal gehört derselbe Wert in `.dev.vars` (siehe `.dev.vars.example`).

5. **Zugriffsschutz einrichten** – siehe unten.

6. **Geheimnisse für die externen Anbindungen** kommen als Cloudflare Secrets
   dazu, sobald die jeweilige Stufe erreicht ist (NPSSO und PSN-Refresh-Token ab
   Stufe 2, IGDB/Twitch ab Stufe 9, AWIN-Feed-URL ab Stufe 18). Lokal gehören sie
   in `.dev.vars`, niemals ins Repository.

## PlayStation-Anbindung

Die Anbindung ist inoffiziell. Der Zugang läuft über das **NPSSO** – ein Cookie
aus dem angemeldeten Browser, kein Passwort:

1. Bei PlayStation anmelden
2. https://ca.account.sony.com/api/v1/ssocookie aufrufen
3. Den Wert des Feldes `npsso` in den Einstellungen der App eintragen

**Ablage.** NPSSO und Refresh-Token liegen AES-GCM-verschlüsselt in D1, der
Schlüssel als Cloudflare Secret. Ein Datenbank-Dump enthält damit keinen
verwertbaren Zugang. Warum nicht als Cloudflare Secret: Ein Worker kann keine
Secrets schreiben, ein Eingabefeld braucht aber eine beschreibbare Ablage –
siehe [Abschnitt 7.1](docs/spezifikation.md#71-psn-trophäen).

**Keiner dieser Werte erscheint jemals in einer API-Antwort oder im Log**, auch
nicht gekürzt. Durchgesetzt über die Hülle `Geheimnis` in
[`src/domain/secret.ts`](src/domain/secret.ts), geprüft von
`test/keine-lecks.spec.ts`.

**Abruf.** Ein Aufruf von `POST /api/sync` holt **eine** Seite à 100 Titel und
merkt sich den nächsten Offset – der Free Tier erlaubt 10 ms CPU je Aufruf, und
Cron Trigger haben dieselbe Grenze. Die Oberfläche ruft so lange erneut auf, bis
der Durchlauf fertig ist.

Die Seitenzahl je Aufruf ist gemessen, nicht geschätzt. Werte je Aufruf, gegen
die echte Sammlung von 431 Titeln:

| Aufruf | CPU |
|---|---|
| Abruf einer Seite | 3 ms |
| Normalisierung einer Seite | 5–7 ms |
| Übrige Routen | 0–3 ms |

Von 10 ms erlaubten. Die Arbeit je Aufruf ist konstant – 100 Titel je Seite,
unabhängig von der Größe der Sammlung –, der Wert wächst also nicht mit.
Steigt er bei einer späteren Messung über 8 ms, wird eine Seite in zwei
Hälften verarbeitet.

Nachmessen: GraphQL-Analytics (`workersInvocationsAdaptive`) für Quantile,
Workers-Observability (`telemetry/query`) für die Zuordnung je Route – nur
letztere zeigt, *welcher* Aufruf teuer ist. Die Antworten werden **unverändert** abgelegt; die
Normalisierung ist ein eigener Schritt in Stufe 3 und braucht keinen
PSN-Zugriff.

**Zwei Phasen.** Ein Lauf holt zuerst alle Seiten roh, danach normalisiert er
sie zu `trophy_progress` – beides mit begrenzter Arbeit je Aufruf. Die
Normalisierung fasst PSN nicht an und lässt sich jederzeit wiederholen:

```
POST /api/sync/normalize     # setzt zurück, danach normalisiert POST /api/sync erneut
```

Das ist der praktische Nutzen der Trennung: Ist die Abbildung falsch, wird sie
korrigiert und erneut ausgeführt, statt die Daten neu von Sony zu holen.

Läuft das NPSSO ab, ist das kein Fehlerfall, sondern ein regulärer Zustand:
`status` wird `abgelaufen`, vorhandene Daten bleiben stehen, und in den
Einstellungen lässt sich ein neues NPSSO eintragen.

## Zugriffsschutz

Die `workers.dev`-Adresse ist öffentlich erreichbar, deshalb steht
**Cloudflare Access** davor. Zero Trust ist für bis zu 50 Nutzer kostenlos –
beim Onboarding verlangt Cloudflare trotzdem Zahlungsdaten. Laut Dokumentation:
*"If you chose the Zero Trust Free plan, this step is still needed but you will
not be charged."* Siehe [Kosten](#kosten).

1. Dashboard → Zero Trust → Team-Namen wählen (ergibt
   `<team>.cloudflareaccess.com`, den Login-Endpunkt). Die Team-Domain hostet
   nichts, sie führt nur die Anmeldung durch.
2. Login-Methode. **Welche greift, hängt von der Richtlinie ab** (Schritt 4):

   | Richtlinie | Anmeldung läuft über |
   |---|---|
   | *Cloudflare account* | das Cloudflare-Konto selbst – kein Code, keine Einrichtung nötig |
   | *Email domain* | einen Identitätsanbieter, z. B. One-time PIN mit Code per E-Mail |

   Bei *Cloudflare account* ist hier also **nichts zu tun**. Ein separat unter
   Zero Trust → *Integrations → Identity providers* eingerichteter One-time-PIN-
   Anbieter bleibt dann ungenutzt.

   Weil damit das Cloudflare-Konto das einzige Tor zur Anwendung ist, gehört dort
   **Zwei-Faktor-Anmeldung** aktiviert.

   Prüfen lässt sich der Stand ohne Dashboard:

   ```bash
   curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/<account_id>/access/identity_providers"
   ```
3. Nach dem ersten erfolgreichen Deploy: Workers & Pages → `trophytracker` →
   Tab **Access** → *Protect this Worker behind Access* → **All traffic**.
4. Im selben Dialog unter **Authentication policy** die Option
   **Cloudflare account** wählen: nur Mitglieder des eigenen Cloudflare-Kontos
   dürfen sich anmelden – bei einer Single-User-Anwendung genau eine Person.

   > **Nicht "Email domain" wählen.** Die Option lässt jeden mit einer
   > verifizierten Adresse bei der angegebenen Domain herein. Bei einem
   > Freemail-Anbieter wie `web.de` wären das Millionen Menschen. Sie ergibt nur
   > bei einer eigenen Firmendomain Sinn.

   Einen Selector für einzelne E-Mail-Adressen gibt es in diesem Dialog nicht;
   den bietet nur die klassische, hostnamenbasierte Access-Anwendung. Für eine
   feinere Richtlinie – mehrere Anbieter, Service Tokens, Gerätevorgaben – lässt
   sich die Anwendung nachträglich in Zero Trust bearbeiten.

Die Richtlinie hängt am Worker, nicht an einem Hostnamen – deshalb ist **keine
eigene Domain nötig**, und sie deckt `workers.dev`-Adresse, Preview-URLs und
spätere Custom Domains gemeinsam ab. Einschränkung: WebSockets werden hinter
Worker-Level-Access nicht unterstützt (403 beim Upgrade); die Anwendung nutzt
keine.

Prüfen, dass es greift:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://trophytracker.<subdomain>.workers.dev/api/health
# 302 (auf cloudflareaccess.com) oder 403 – niemals 200
```

### Maschinen-Endpunkte

`POST /api/imports/feed` und `GET /api/export/backup.json` werden von GitHub
Actions aufgerufen und können keinen Browser-Login durchlaufen. Wie sie
abgesichert werden – Access Service Token oder eigenes Bearer-Token –
**ist noch nicht entschieden und wird in Stufe 8 festgelegt**, wenn mit der
Backup-Action der erste dieser Endpunkte tatsächlich existiert. Siehe
[Abschnitt 15.3](docs/spezifikation.md#153-zugriffsschutz).

## Deployment

Jeder Push auf `main` löst [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
aus. Die Reihenfolge ist der eigentliche Inhalt:

1. `npm ci`, `npm test`, `npm run build`
2. `wrangler d1 export` – **Sicherung vor jeder Schemaänderung**, anschliessend
   geprüft: `INSERT`-Zeilen je Tabelle im Dump gegen `COUNT(*)` der Datenbank.
   Weicht eine Zahl ab, bricht der Job vor der Migration ab. Nur Zahlen im Log
3. `wrangler d1 migrations apply --remote`
4. Datenmigrationen protokollieren ihre Wirkung – `play_status` (0006) und
   `review_queue` (0007), jeweils neben der Erwartung
5. `wrangler deploy`

Schritt 2 ist der Grund, warum das eine Action ist und kein Klick im Dashboard:
Eine fehlerhafte Migration ist der wahrscheinlichste Weg, Daten zu verlieren,
und der einzige Zeitpunkt, an dem ein frisches Backup zählt, ist die Sekunde
davor.

Migrationen laufen **vor** dem Deployment, damit neuer Code nie auf ein altes
Schema trifft. Umgekehrt müssen sie **abwärtskompatibel** sein, weil in diesem
Moment noch der alte Worker läuft: Spalten hinzufügen ist unkritisch, Spalten
umbenennen braucht zwei Deployments.

Der Dump aus Schritt 2 wird bewusst **nicht** als Workflow-Artifact hochgeladen –
Artifacts eines öffentlichen Repositories sind über den Run-Link herunterladbar.
Er sichert diesen einen Lauf ab. Die dauerhafte Sicherung ins private Repository
`trophytracker-backup` kommt in Stufe 8.

Pull Requests durchlaufen Tests und Build, deployen aber nicht.

## Wiederherstellung

Einmal testweise durchspielen, solange nichts kaputt ist – ein ungetestetes
Backup ist eine Vermutung.

```bash
npx wrangler d1 create trophytracker-restore
npx wrangler d1 execute trophytracker-restore --remote --file=backup.sql
```

Danach die `database_id` in `wrangler.jsonc` auf die neue Datenbank umstellen und
deployen.

Zusätzlich bietet Cloudflare `wrangler d1 time-travel` zum Zurückstellen auf
einen Zeitpunkt. Das hilft gegen Bedienfehler, aber nicht gegen ein verlorenes
Konto – dafür ist der wöchentliche Export in das private Repository zuständig.

## Aufbau

```
migrations/    nummerierte SQL-Dateien, laufen genau einmal
src/index.ts   Hono-App, hängt Repositories je Anfrage ein
src/api/       Route-Module
src/db/        Repository-Schicht – der einzige Ort mit D1-Zugriff
src/domain/    reine Logik ohne Datenbank, z. B. die Gewichte der Rangformel
frontend/      React + Vite, wird als Static Assets mit dem Worker ausgeliefert
```

**Route-Handler rufen niemals `env.DB.prepare()` auf.** Sie greifen über
`c.var.repos` zu. Das hält einen späteren Wechsel zu Turso, Postgres oder
lokalem SQLite auf `src/db/` begrenzt.

Getestet wird, was Logik ist, nicht was Glue ist: Die Views werden gegen
eingespielte Daten geprüft, die Gewichte-Validierung ohne Datenbank. Die Tests
laufen gegen dasselbe Schema wie Produktion – `vitest.config.mts` liest die
Migrationen aus `migrations/` ein und wendet sie je Testlauf an.

```bash
npx wrangler d1 migrations apply trophytracker --local   # Schema lokal anlegen
npm test
```

## Zuordnung von Trophäenlisten

Aus einer Trophäenliste wird ein `release`, aus mehreren Listen desselben
Spiels **ein** `game` mit mehreren Releases — GTA V erscheint einmal in der
Sammlung, mit drei Plattformen.

Die Gruppierung schlägt vor, sie entscheidet nicht. Nichts wird ohne
Bestätigung geschrieben (Abschnitt 7.2). Zwei Sonderfälle:

- **Geteilte Listen** (`PS3,PSVITA,PS4`) gelten bei Sony für mehrere
  Plattformen und teilen den Fortschritt. Daraus entsteht ein Release, dessen
  Plattform du wählst — vorausgewählt ist die neueste.
- **Gleiche Plattform zweimal** in einer Gruppe deutet auf verschiedene Spiele
  hin. Sie werden getrennt vorgeschlagen, mit Hinweis.

Ab dem zweiten Sync ordnet die Automatik neue Listen zu, wenn es **genau
einen** passenden Kandidaten gibt. Alles andere bleibt offen.

**Die Trophäenstruktur verrät Remakes.** Ein portiertes Spiel behält seine
Liste, ein Remake bekommt eine neue — Shadow of the Colossus hat auf PS3
18/6/6/1 und auf PS4 25/7/5/1. Weichen die Strukturen innerhalb einer Gruppe
ab, erscheint ein Hinweis. Kein Automatismus: GTA V weicht ebenfalls ab und ist
trotzdem ein Spiel.

**Korrigieren.** Die Ansicht „Sammlung prüfen" zeigt alle Zuordnungen als
Tabelle, eine Zeile je Release, mit Filter auf Auffälligkeiten. Titel lassen
sich direkt ändern, und ein Release lässt sich als eigenes Spiel abtrennen.

Ändert sich die Titelnormalisierung, veralten die Sortierschlüssel: Die
automatische Zuordnung sucht darüber und findet dann falsche oder gar keine
Kandidaten. Die Ansicht markiert veraltete Schlüssel und bietet den Knopf zum
Neuberechnen.

## Kosten

Der gesamte Stack liegt im Free-Tier. Wichtiger als die Grenzen ist, wie
Cloudflare mit dem Überschreiten umgeht: Die Free-Pläne **blocken**, statt in
eine Überziehung hineinzurechnen.

| Dienst | Free-Grenze | Bei Überschreitung |
|---|---|---|
| Workers (inkl. Static Assets) | 100.000 Anfragen/Tag | Fehler 1027 bzw. 429, keine Abrechnung |
| D1 | 5 GB, 5 Mio. gelesene / 100.000 geschriebene Zeilen pro Tag | Abfragen schlagen fehl, keine Abrechnung |
| Zero Trust Access | 50 Sitze | weitere Nutzer werden abgewiesen |

Der Wechsel in einen Bezahlmodus ist deshalb immer eine ausdrückliche Handlung,
kein Nebeneffekt von Nutzung. Für einen einzelnen Nutzer sind die Grenzen um
Größenordnungen entfernt.

## Was niemals ins Repository gehört

NPSSO und PSN-Refresh-Token, IGDB/Twitch-Zugangsdaten, AWIN-Feed-URLs (sie
enthalten die Publisher-ID), API-Bearer-Token, der Cloudflare-API-Token – und
unter keinen Umständen ein Datenbank-Dump. `.dev.vars`, `.wrangler/` und `*.sql`
stehen in der `.gitignore`; `migrations/*.sql` ist davon ausgenommen, weil die
Migrationen eingecheckt sein müssen.
