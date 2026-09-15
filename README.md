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

**Stufe 10 abgeschlossen** ([Umsetzungsreihenfolge](docs/spezifikation.md#16-umsetzungsreihenfolge)).
Die Anwendung läuft unter `trophytracker.philipp-ermer-bvb.workers.dev`. Aus
den Trophäenlisten lassen sich Spiele und Releases anlegen, dazu Besitz
erfassen (Use Case 1) und je Release die eigene Bewertung setzen (Use Case 2).
Die Prüfliste führt einmal durch den ganzen Bestand (Use Case 8, vorerst nur
`erstimport`). **Die Ersteinrichtung ist am 14.09.2026 durchlaufen:** alle 431
Trophäenlisten sind bewertet, die Warteschlange ist leer. Damit steht der
Datenbestand – und ab hier steckt darin Arbeit, die PlayStation nicht
zurückliefert. Stufe 8 sichert ihn wöchentlich ins private Repository und
liefert den CSV-Export (Use Case 13). Stufe 9 holt Cover, Kritikerwertung und
Erscheinungsdatum von IGDB; Stufe 10 baut darauf die Wunschliste mit Favoriten,
Priorität und Rang (Use Case 4) – die erste der vier Absichts-Listen, deren
Routen und Repository auch To-Do, Backlog und Kaufliste tragen werden.

> **Beide Abnahmen sind am 14.09.2026 erfolgt.** Im Dump steht kein NPSSO im
> Klartext (drei Schichten, siehe [Sicherung](#sicherung)), und die
> [Wiederherstellung](#wiederherstellung) ist einmal durchgespielt — sie hat
> dabei einen echten Fehler gefunden: Der Dump liess sich nicht unverändert
> einspielen. Behoben, geprüft, dokumentiert.

Was steht und in Betrieb nachgewiesen ist:

| | |
|---|---|
| Deployment | Push auf `main` baut, sichert, migriert und deployt |
| Sicherung vor Migration | `d1 export --remote` läuft als erster Schritt jedes Deploys |
| Frontend und API | ein Worker, eine Origin, kein CORS |
| Zugriffsschutz | Access-Richtlinie am Worker, Option *Cloudflare account* |
| Login | über das Cloudflare-Konto, auch mobil erprobt |
| Schema | 18 Tabellen, 7 Views, elf Migrationen |
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
| Offene Posten | Hinweisblock in der Sammlung: Prüfliste, `unentschieden`, nicht zugeordnete Listen, überfällige Sicherung – bis es das Dashboard gibt |
| Sicherung geprüft | Der Export wird vor der Migration gegen die Zeilenzahlen der Datenbank gehalten; Datenmigrationen protokollieren ihre Wirkung |
| Lesekosten | Indizes auf allen Fremdschlüsseln; `test/lesekosten.spec.ts` misst die heißen Abfragen gegen 430 Listen (D1 Free Tier: 5 Mio. gelesene Zeilen/Tag) |
| Sicherung ausserhalb von Cloudflare | Wöchentliche GitHub Action legt `backup.sql` und `backup.json` im privaten Repo `trophytracker-backup` ab; Datum der letzten Sicherung in den Einstellungen, Warnung ab acht Tagen |
| Export | Sieben CSV-Listen und die JSON-Vollsicherung, verlinkt in den Einstellungen |
| Maschinen-Endpunkte | Access Service Token statt Bearer-Token – kein zweites Geheimnis im Worker |
| IGDB | Abgleich in Schritten à acht Spiele; nur eindeutige Treffer automatisch (gegen die 420 echten Titel gemessen: 372 eindeutig, keine Fehlzuordnung); Prüfansicht mit Kandidaten; Cover im Hochformat in der Sammlung; Kritikerwertung und Erscheinungsdatum im Spieldetail; jede Verknüpfung lösbar. **Abgenommen am 14.09.2026: 419 von 420 verknüpft**, eines bewusst abgelehnt (Vita-Wecker-App, IGDB kennt sie nicht) |
| Wiederherstellung | am 14.09.2026 vollständig durchgespielt, alle 17 Tabellen, 7 Views und 18 Indizes stimmen überein, `foreign_key_check` ohne Treffer (Stand vor Migration 0011, seitdem 20 Indizes) |
| Wunschliste | Eigene Ansicht in der Leiste: nach Rang sortiert (berechnet, nie gespeichert), Favoriten-Filter, Priorität 1–5, Notiz, erledigt/verworfen; neue Wünsche über die IGDB-Suche (nur PlayStation-Einträge), Plattform wählbar und standardmäßig leer – ohne Plattform ein Spiel ohne Release, mit Plattform ein Release, das erst mit Besitz oder Fortschritt in der Sammlung erscheint; Freitext nur ausdrücklich. Ein Wunsch am Spiel und einer am Release sind zwei Aussagen, nur dasselbe Ziel ist ein Duplikat |
| Rangformel | Gewichte in den Einstellungen verstellbar; `src/domain/rang.ts` ist die eine Stelle für die Formel |

Ohne Anmeldung antworten `/`, `/api/health` und beliebige SPA-Pfade mit `302` auf
den Login unter `trophytracker.cloudflareaccess.com`.

**Als Nächstes: Stufe 11 – Wunschlisten-Import mit Suche, Ansicht „Ohne
Zuordnung"** (Use Cases 9 und 12). Die Routen `/api/plans` und die IGDB-Suche
mit dem Knopf „Ohne IGDB-Eintrag übernehmen" stehen seit Stufe 10; der Import
setzt darauf auf und nimmt die rohen Jahresdateien wie die bereinigte Liste
(`wunschlisten/wunschliste-bereinigt.txt`, lokal) an – Befunde in
[Abschnitt 8.2](docs/spezifikation.md#82-wunschlisten-import-aus-textdateien-use-case-9).

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

   | Secret | Wofür | Ab Stufe | Läuft ab |
   |---|---|---|---|
   | `CLOUDFLARE_API_TOKEN` | Deploy- und Backup-Action | 0 | nein |
   | `CLOUDFLARE_ACCOUNT_ID` | Deploy- und Backup-Action | 0 | nein |
   | `BACKUP_REPO_TOKEN` | Fine-grained PAT, nur auf das private Backup-Repo | 8 | **nach einem Jahr** |
   | `CF_ACCESS_CLIENT_ID` | Service Token `github-backup` für die Backup-Action | 8 | **nach einem Jahr** |
   | `CF_ACCESS_CLIENT_SECRET` | dasselbe Token, Secret-Teil | 8 | **nach einem Jahr** |

   Die drei ablaufenden Werte sind der wahrscheinlichste Grund, aus dem die
   Sicherung eines Tages unbemerkt ausbleibt. `BACKUP_REPO_TOKEN` ist ein
   Fine-grained PAT mit **Contents: Read and write** ausschliesslich auf
   `trophytracker-backup`; der Standard-`GITHUB_TOKEN` reicht nicht über das
   eigene Repository hinaus. Gegen das Vergessen steht die Altersanzeige in den
   Einstellungen – siehe [Sicherung](#sicherung).

   Dazu **Cloudflare Secrets** (nicht GitHub):

   | Secret | Wofür | Ab Stufe |
   |---|---|---|
   | `NPSSO_KEY` | Schlüssel für die Verschlüsselung von NPSSO und Refresh-Token in D1 | 2 |
   | `IGDB_CLIENT_ID` | Twitch-Anwendung für IGDB, siehe [IGDB-Anbindung](#igdb-anbindung) | 9 |
   | `IGDB_CLIENT_SECRET` | dieselbe Anwendung, Secret-Teil | 9 |

   ```bash
   openssl rand -base64 32              # 32 Byte, Base64
   npx wrangler secret put NPSSO_KEY    # produktiv
   npx wrangler secret put IGDB_CLIENT_ID
   npx wrangler secret put IGDB_CLIENT_SECRET
   ```

   Lokal gehören dieselben Werte in `.dev.vars` (siehe `.dev.vars.example`).
   Fehlen die IGDB-Werte, läuft die Anwendung trotzdem – nur die IGDB-Routen
   antworten mit 503, und die Einstellungen zeigen den Hinweis.

5. **Zugriffsschutz einrichten** – siehe unten.

6. **Geheimnisse für die externen Anbindungen** kommen als Cloudflare Secrets
   dazu, sobald die jeweilige Stufe erreicht ist (NPSSO und PSN-Refresh-Token ab
   Stufe 2, IGDB/Twitch ab Stufe 9 – siehe oben –, AWIN-Feed-URL ab Stufe 18).
   Lokal gehören sie in `.dev.vars`, niemals ins Repository.

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

## IGDB-Anbindung

Cover, Kritikerwertung (`aggregated_rating`) und Erscheinungsdatum kommen von
[IGDB](https://www.igdb.com), einer offiziellen, kostenlosen Schnittstelle
([Spezifikation 7.6](docs/spezifikation.md#76-igdb-abgleich-stufe-9)).

**Zugang einrichten.** IGDB läuft über eine Twitch-Anwendung:

1. Unter https://dev.twitch.tv/console/apps eine Anwendung anlegen (Kategorie
   „Application Integration", OAuth-Redirect `http://localhost`; er wird nicht
   benutzt)
2. Client-ID und ein Client-Secret erzeugen
3. Beide als Cloudflare Secrets setzen (siehe [Einrichtung](#einrichtung-eines-eigenen-kontos))
   und lokal in `.dev.vars` eintragen

Das App-Token (rund 60 Tage gültig) holt sich der Worker selbst per
Client-Credentials und hält es im Speicher der Instanz; bei Ablauf oder einem
401 von IGDB erneuert er es. Es steht nirgends in der Datenbank. IGDB erlaubt
vier Anfragen je Sekunde – der Client hält 260 ms Abstand.

**Abgleich.** In den Einstellungen unter „IGDB" stehen die Zähler und der Knopf
„Abgleich starten". Ein Aufruf sucht für acht Spiele; die Oberfläche ruft
weiter, bis nichts mehr offen ist – 420 Spiele dauern rund zwei Minuten.
Automatisch verknüpft wird nur ein **eindeutiger** Treffer: genau ein
Kandidat mit demselben Titelschlüssel, Editionen und Bundles zählen nicht
gegen das Hauptspiel, Plattformen müssen sich decken. Alles andere landet mit
seinen Kandidaten in der **IGDB-Zuordnung** (Werkzeug in den Einstellungen):
Kandidat antippen, anders suchen oder „Gibt es bei IGDB nicht" – jede
Entscheidung ist sofort gespeichert. Der Hinweisblock in der Sammlung zeigt,
wie viele Spiele noch warten.

Die Kandidaten stehen sortiert: Schlüsseltreffer zuerst, dann Hauptspiele,
Remakes und Remaster vor DLC und Paketen, dann die Plattform des Spiels. Bleibt
die Suche leer, greifen Rückfälle (gekürzter Begriff, ohne Plattformfilter,
Teilstringsuche) – Details in [Spezifikation 7.6](docs/spezifikation.md#76-igdb-abgleich-stufe-9).
„Offene erneut suchen" schickt alle Spiele zur Prüfung noch einmal durch die
Suche, wenn die Regel besser geworden ist.

Gegen die echten 420 Titel gemessen, bevor die Regel gebaut wurde: 372
eindeutig, 5 echt mehrdeutig, 32 mit passenden Kandidaten, 11 ohne Treffer,
keine Fehlzuordnung in der Stichprobe. Sonys Schreibweisen („Velocity2X") und
deine Jahreszusätze („God of War (2018)") werden nur für die Suche bereinigt;
die Unterscheidung gleichnamiger Spiele übernimmt der Plattformabgleich.

**Korrigieren.** Im Spieldetail zeigt der Block „IGDB" Wertung, Datum und
Herkunft der Verknüpfung mit Link zu igdb.com. „Anderen Eintrag wählen" öffnet
die Suche, „Verknüpfung lösen" entfernt alles, was von IGDB kam. Eine von
Hand gesetzte Kritikerwertung (`critic_source = 'manuell'`, ab einer späteren
Stufe) überschreibt IGDB nie.

**Auffrischen.** „Metadaten auffrischen" holt für die 50 am längsten nicht
aktualisierten Spiele Wertung, Cover und Datum in einer Anfrage erneut.
Kritikerwertungen ändern sich mit jeder Rezension; Stufe 17 hängt den Schritt
an den Cron.

```
GET  /api/igdb/status            Zähler und ob Zugangsdaten hinterlegt sind
POST /api/igdb/abgleich          ein Schritt, { weiter } solange etwas offen ist
POST /api/igdb/auffrischen       50 Spiele in einer IGDB-Anfrage
GET  /api/igdb/offen             Prüfansicht mit Kandidaten
POST /api/igdb/erneut-suchen     offene Spiele zurück in den Abgleich
GET  /api/igdb/search?q=&plattformen=  Suche mit Rückfällen, auch für Import und Nachpflege (Stufe 11)
```

**Alte Wunschlisten** gehören als Textdateien in `wunschlisten/` (lokal,
per `.gitignore` ausgeschlossen). Sie sind am 14.09.2026 gegen Sammlung und
IGDB gemessen worden – 332 Zeilen, 20 schon in der Sammlung, 199 eindeutig,
76 mit Kandidaten, 37 ohne Treffer. Daraus ist `wunschlisten/wunschliste-bereinigt.txt`
entstanden (tabulatorgetrennt: Datum, Titel, Plattform, Status, Original,
Hinweis); der Import in Stufe 11 nimmt die rohen Jahresdateien und diese Form.
Alles sind Wünsche, auch schon Gespieltes – Folgerungen in
[Spezifikation 8.2](docs/spezifikation.md#82-wunschlisten-import-aus-textdateien-use-case-9).

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

`GET /api/export/backup.json`, `POST /api/backup/vermerk` und später
`POST /api/imports/feed` werden von GitHub Actions aufgerufen und können keinen
Browser-Login durchlaufen.

**Entschieden in Stufe 8: Access Service Token.** Der Alternativweg – diese
Pfade von Access ausnehmen und mit einem eigenen Bearer-Token absichern – ist
**verworfen**. Ausschlaggebend war eine Randbedingung, keine Geschmacksfrage:
Die Richtlinie hängt am Worker und schützt ihn als Ganzes, einzelne Pfade
lassen sich davon nicht ausnehmen. Der Bearer-Weg bräuchte deshalb eine
hostnamenbasierte Access-Anwendung und damit eine eigene Domain – genau die
Voraussetzung, die dieses Projekt sonst nicht hat. Dazu käme ein zweites
Geheimnis, das leaken kann, für dieselbe Frage.

**Folge: Der Worker trägt keine eigene Token-Prüfung.** `/api/export/*` und
`/api/backup/*` sind gewöhnliche Routen; Access steht davor. Siehe
[Abschnitt 15.3](docs/spezifikation.md#153-zugriffsschutz).

**Eingerichtet sind zwei Access Service Tokens** (Zero Trust → Access →
Service Auth → Service Tokens). Sie hängen an einer eigenen Richtlinie der
Anwendung mit der Aktion *Service Auth*; Aufrufe senden `CF-Access-Client-Id`
und `CF-Access-Client-Secret` als Header und umgehen damit den Browser-Login,
ohne die Richtlinie für Personen aufzuweichen. Zwei statt einem, damit sich
eines zurückziehen lässt, ohne das andere zu treffen.

| Token | Wofür | Werte liegen |
|---|---|---|
| `claude-code` | Prüfungen gegen die Produktion nach einem Deploy | `.dev.vars` (lokal, gitignored) |
| `github-backup` | Backup-Action ab Stufe 8 | GitHub Secrets `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` |

Dazu ein **GitHub**-Token, der mit Cloudflare nichts zu tun hat:

| Token | Wofür | Geltungsbereich | Liegt |
|---|---|---|---|
| `claude-code-actions` | Workflow-Läufe und Logs lesen, Workflows auslösen | Fine-grained PAT, nur `ermerp/trophytracker`, **Actions: Read and write** + Metadata | `~/.config/gh/hosts.yml` (lokal, via `gh auth login`) |

Bewusst **ohne** Zugriff auf `trophytracker-backup`: Dort liegt die vollständige
Sammlung, und zum Lesen von Workflow-Logs braucht es sie nicht. Läuft im
September 2027 ab.

> `gh run view --log` liefert in gh 2.46 nichts (bekannter Fehler beim
> Entpacken des Log-Archivs, stiller Exit 0). Der API-Weg funktioniert:
> `gh api repos/ermerp/trophytracker/actions/jobs/<job-id>/logs`

Ein Service-Token-Secret beginnt mit `cfast_` und wird nur beim Anlegen
angezeigt. Läuft es ab (Voreinstellung ein Jahr), scheitern die Aufrufe mit
einer **302 auf die Login-Seite – nicht mit 401**. Die Backup-Action prüft
deshalb nicht nur den Statuscode, sondern auch den Inhalt der Antwort: eine
HTML-Loginseite ist kein JSON.

Beispielaufruf gegen die Produktion:

```bash
curl -sS -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
        -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  https://trophytracker.<subdomain>.workers.dev/api/backup/status
```

## Deployment

Jeder Push auf `main` löst [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
aus. Die Reihenfolge ist der eigentliche Inhalt:

1. `npm ci`, `npm test`, `npm run build`
2. `wrangler d1 export` – **Sicherung vor jeder Schemaänderung**, anschliessend
   geprüft (`scripts/sicherung-pruefen.sh`): `INSERT`-Zeilen je Tabelle im Dump
   gegen `COUNT(*)` der Datenbank. Weicht eine Zahl ab, bricht der Job vor der
   Migration ab. Nur Zahlen im Log
3. `scripts/dump-pruefen.sh` – der Dump darf weder NPSSO noch Refresh- oder
   Access Token im Klartext enthalten
4. `wrangler d1 migrations apply --remote`
5. Datenmigrationen protokollieren ihre Wirkung – `play_status` (0006) und
   `review_queue` (0007), jeweils neben der Erwartung
6. `wrangler deploy`

Beide Prüfskripte liegen in `scripts/`, weil die Backup-Action dieselben
benutzt. Zwei Kopien derselben Prüfung wären zwei Kopien, die auseinanderlaufen.

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
`trophytracker-backup` ist ein eigener Workflow, siehe [Sicherung](#sicherung).

Pull Requests durchlaufen Tests und Build, deployen aber nicht.

**Nach einem Deploy zeigt ein offener Tab noch die alte Fassung.** Das Frontend
hat bis Stufe 17 (PWA) keine Aktualisierungslogik: einmal hart neu laden
(Strg+F5; auf dem Handy Tab schließen und neu öffnen). Ob die neue Fassung
ausgeliefert wird, lässt sich am Asset-Hash prüfen – der Name von
`/assets/index-*.js` in der ausgelieferten Seite muss dem in `frontend/dist`
entsprechen.

## Wenn die Anwendung mit 500 antwortet

Häufigste Ursache ist das Tageslimit des D1-Free-Tier: 5 Millionen **gelesene**
Zeilen (gescannte, nicht zurückgegebene). Prüfen:

```bash
npx wrangler d1 info trophytracker    # rows_read_24h - rollierendes 24-h-Fenster,
                                      # nicht der Tageszähler
npx wrangler d1 execute trophytracker --remote --command "SELECT 1"
```

Meldet die zweite Abfrage `code: 7500`, ist das Limit erreicht. Es wird um
**Mitternacht UTC** zurückgesetzt; abgewiesene Abfragen werden nicht nachgeholt,
die gespeicherten Daten bleiben unberührt. Bis dahin ist auch kein Deploy
möglich, weil die Sicherungsprüfung selbst liest.

Vorbeugung ist Sache des Entwurfs: Jeder Fremdschlüssel hat einen Index
(Migration 0008), und `test/lesekosten.spec.ts` misst die heißen Abfragen gegen
einen Bestand in Produktionsgröße. Zum Vergleich: Eine Sammlungsseite liest rund
2 000 Zeilen, ein Prüflisten-Eintrag rund 3 000; ein kompletter Durchgang durch
430 Einträge kostete rund eine Million.

## Sicherung

Time Travel und `d1 export` liegen beim selben Anbieter wie die Datenbank.
Gegen einen Bedienfehler helfen sie, gegen ein verlorenes Cloudflare-Konto
nicht. Deshalb legt [`.github/workflows/backup.yml`](.github/workflows/backup.yml)
eine Kopie **ausserhalb** ab: im privaten Repository `trophytracker-backup`.

**Wann.** Sonntags um 03:17 UTC – bewusst nicht zur vollen Stunde, dort staut
GitHub die Cron-Jobs aller Repositories. Von Hand startbar über Actions →
„Sicherung" → *Run workflow*.

**Was der Lauf tut**

1. `wrangler d1 export --remote` → `backup.sql`
2. `GET /api/export/backup.json` mit dem Service Token `github-backup`;
   enthält die Antwort keine Spiele, bricht der Lauf ab – **vor** jedem Schreiben
3. `scripts/sicherung-pruefen.sh`: `INSERT`-Zeilen je Tabelle gegen `COUNT(*)`
4. `scripts/dump-pruefen.sh`: kein NPSSO, kein Refresh- oder Access Token im
   Klartext
5. beide Dateien und eine kurze `README.md` ins private Repo, **Commit nur bei
   Änderung**
6. `POST /api/backup/vermerk` – auch bei einem Lauf ohne Änderung

Der erste manuelle Lauf ist zugleich der Verbindungstest für Repo, PAT und
Service Token. Ein eigener Testworkflow erübrigt sich: Stimmt eines von beiden
nicht, scheitert schon Schritt 2 oder der Klon in Schritt 5 – und zwar bevor
irgendetwas geschrieben wird.

**Erster Lauf am 14.09.2026**, 26 Sekunden: `backup.sql` 910.717 Byte mit 1.762
`INSERT`-Zeilen, `backup.json` 569.884 Byte mit 14 Tabellen, Schemastand
`0009`. Zeilenabgleich und Klartext-Prüfung bestanden, Commit `e0b8569`.

**Inhalt des Backup-Repos**

| Datei | Inhalt |
|---|---|
| `backup.sql` | vollständiger D1-Dump, zum Wiedereinspielen |
| `backup.json` | die 14 Fachtabellen als lesbare Zweitform – ohne `psn_credentials`, `psn_raw_response` und `d1_migrations` |

Zwei Formate mit Absicht: Der Dump ist die technisch exakte Sicherung, das JSON
bleibt auswertbar, auch wenn es dieses Projekt eines Tages nicht mehr gibt.

`backup.sql` lässt sich **nicht unverändert** einspielen — warum und was
stattdessen zu tun ist, steht unter [Wiederherstellung](#wiederherstellung).

**Ob es läuft.** Die Einstellungen zeigen „Letzte Sicherung: … (Commit …)".
Bleibt sie länger als acht Tage aus oder gab es nie eine, steht eine Warnung im
Hinweisblock der Sammlung. Acht statt sieben Tage, weil der Lauf wöchentlich
ist – ein Tag Luft verhindert eine Warnung, die sonst jede Woche von allein
erscheint. Der wahrscheinlichste Grund für ein stilles Ausbleiben sind die drei
Secrets, die nach einem Jahr ablaufen (siehe [Secrets](#einrichtung-eines-eigenen-kontos)).

Der zweite: **GitHub deaktiviert geplante Workflows nach 60 Tagen ohne
Repo-Aktivität** und schickt dir eine E-Mail. Wieder anschalten ist ein Klick
unter Actions. Das trifft zu, sobald am Projekt nicht mehr gearbeitet wird –
also genau dann, wenn die Sicherung am wichtigsten ist.

**Kein NPSSO im Dump.** Der Dump landet dauerhaft in einem Git-Verlauf, deshalb
drei Schichten statt einer:

| Schicht | Wo | Was sie prüft |
|---|---|---|
| Test mit Markierung | `test/keine-lecks.spec.ts` | speichert ein markiertes NPSSO, fährt einen Sync und liest danach **jede** Tabelle aus `sqlite_master` – inhaltlich dasselbe wie ein `d1 export` |
| Skript gegen den Dump | `scripts/dump-pruefen.sh`, in Backup- **und** Deploy-Job | verbotene Bezeichner in `INSERT`-Zeilen; jeder Wert in `psn_credentials` ist Zeitstempel, Statuswort oder Base64 – und **nie 64 Zeichen lang**, der Länge eines NPSSO |
| Menschliche Gegenprobe | einmal, von Hand | im privaten Repo nach den ersten Zeichen des eigenen NPSSO suchen. Null Treffer ist der einzige Beweis, den kein Skript führen kann |

Die Längenprüfung ist die eigentliche: Ein NPSSO besteht aus Buchstaben und
Ziffern, ist also selbst gültiges Base64 und dekodiert zu 48 Byte, die wie
Zufall aussehen – eine Prüfung auf druckbare Zeichen läuft daran vorbei
(gemessen, nicht vermutet). Die Länge nicht: Chiffrat sind 108 Zeichen, ein IV 16.

**Am 14.09.2026 durchgeführt, alle drei Schichten.** Die Suche im privaten Repo
nach den ersten Zeichen des NPSSO ergab `backup.sql:0` und `backup.json:0`.

Als wiederholbare Zugabe eine Prüfung, die *ohne* Kenntnis des Wertes auskommt:
Ein NPSSO ist 64 alphanumerische Zeichen — im gesamten Dump gibt es keine
solche Zeichenkette. Die eine 64-Zeichen-Kette, die es gibt, steht in
`psn_raw_response`, enthält Leerzeichen und Satzzeichen und ist ein Spieltitel
aus einer Sony-Antwort.

## Wunschliste und Absichten

Wunschliste, To-Do, Backlog und Kaufliste liegen in einer Tabelle `plan_entry`
([Abschnitt 5](docs/spezifikation.md#5-datenmodell--absichten-use-cases-4-5-6));
Stufe 10 bedient die Wunschliste, die Routen kennen alle vier Arten:

```
GET    /api/plans?kind=wunsch&status=offen|alle&sort=rang|titel|angelegt&favorit=1
POST   /api/plans        { art, spielId | releaseId | igdbId | titel, prioritaet?, favorit?, notiz? }
PATCH  /api/plans/:id    Teilmenge von { prioritaet, favorit, notiz, status, art }
DELETE /api/plans/:id
```

Der Rang wird bei jeder Abfrage aus Kritikerwertung, Priorität und Favorit mit
den Gewichten aus den Einstellungen berechnet und nie gespeichert. Die
Plattform bleibt leer, solange keine gewählt wird; ein Standardwert wäre eine
Behauptung. Ohne Plattform legt ein Wunsch aus der IGDB-Suche ein Spiel **ohne
Release** an; mit Plattform entsteht das Release, und es zählt **nicht zur
Sammlung, solange es nur den Wunsch trägt** – ein Wunsch ist kein Besitz. Im
Spieldetail ist es immer sichtbar. Ein Wunsch am Spiel und einer an einem
seiner Releases sind zwei verschiedene Aussagen und blockieren sich nicht; nur
dasselbe Ziel derselben Art antwortet mit `409`.

## Export

Die Einstellungen verlinken sieben CSV-Listen und die JSON-Vollsicherung:

```
GET /api/export/sammlung.csv     GET /api/export/kauf.csv
GET /api/export/wunsch.csv       GET /api/export/luecken.csv
GET /api/export/todo.csv         GET /api/export/trophaeen.csv
GET /api/export/backlog.csv      GET /api/export/backup.json
```

CSV mit **Semikolon** als Trennzeichen, **BOM** am Anfang und **CRLF** als
Zeilenende – alles drei wegen Excel im deutschen Gebietsschema: Mit Komma als
Feldtrenner zerfällt „12,99" in zwei Spalten, und ohne BOM wird aus „Ragnarök"
ein „RagnarÃ¶k".

**Ein leeres Feld bedeutet „unbekannt"** – nie „0" und nie „–". Werte, die
tatsächlich *den Wert* „unbekannt" tragen (Disc-Fassung), stehen als Wort da.
Spaltenlisten: [Abschnitt 14.4](docs/spezifikation.md#144-csv-export).

CSV ist zum Auswerten und Weitergeben gedacht, **nicht als Sicherung**: Die
Beziehungen zwischen den Tabellen gehen dabei verloren. Dafür ist der Dump da.

## Wiederherstellung

**Der Dump lässt sich nicht unverändert einspielen.** Das ist gemessen, nicht
vermutet: Die Probe am 14.09.2026 scheiterte beim ersten Versuch mit
`no such table: main.release`.

Grund: `d1 export` schreibt die Tabellen in der Reihenfolge von `sqlite_master`.
Migration 0003 hat `release` neu aufgebaut, wodurch ihr Eintrag dort ans Ende
rutschte — im Dump entsteht sie erst in Zeile 1515, während schon in Zeile 467
`INSERT INTO "physical_copy"` läuft und die Tabelle für die
Fremdschlüsselprüfung braucht. Neun Tabellen verweisen auf `release`. Der
Fehler steckte seit Stufe 3 im Backup und wäre ohne die Probe erst im Ernstfall
aufgefallen.

Deshalb ordnet `scripts/dump-ordnen.mjs` den Dump um: Schema vor Daten,
Fremdschlüsselprüfung während des Imports aus, danach `PRAGMA foreign_key_check`
über den fertigen Bestand. Als Skript und nicht als Anleitung — der Ernstfall
ist der schlechteste Moment, sich eine Reihenfolge zusammenzusuchen.

### Ablauf

**1. Dump holen** — beliebiger Commit, Git hat jeden Wochenstand:

```bash
git clone git@github.com:ermerp/trophytracker-backup.git
```

**2. Datenbank anlegen und Dump vorbereiten:**

```bash
npx wrangler d1 create trophytracker-restore
node scripts/wiederherstellung-vorbereiten.mjs \
  ../trophytracker-backup/backup.sql /tmp/restore.sql
```

Das Skript gibt nur Zahlen aus (Anweisungen, Tabellen, `INSERT`-Zeilen) — ein
Dump trägt die vollständige Sammlung, und dieses Repository ist öffentlich.

**3. Einspielen:**

```bash
npx wrangler d1 execute trophytracker-restore --remote --file=/tmp/restore.sql
```

**4. Prüfen — das gehört zum Ablauf, nicht dahinter.** Der Import lief mit
abgeschalteter Fremdschlüsselprüfung; ob der Bestand stimmt, sagt erst dieser
Schritt:

```bash
npx wrangler d1 execute trophytracker-restore --remote \
  --command "PRAGMA foreign_key_check"            # muss leer bleiben

for db in trophytracker trophytracker-restore; do
  echo "== $db"
  npx wrangler d1 execute "$db" --remote --json --command \
    "SELECT (SELECT COUNT(*) FROM game) AS game,
            (SELECT COUNT(*) FROM \"release\") AS release,
            (SELECT COUNT(*) FROM trophy_progress) AS trophy_progress,
            (SELECT COUNT(*) FROM play_status) AS play_status,
            (SELECT COUNT(*) FROM physical_copy) AS physical_copy,
            (SELECT COUNT(*) FROM digital_entitlement) AS digital_entitlement,
            (SELECT COUNT(*) FROM plan_entry) AS plan_entry,
            (SELECT COUNT(*) FROM review_queue) AS review_queue,
            (SELECT COUNT(*) FROM app_setting) AS app_setting,
            (SELECT COUNT(*) FROM sqlite_master WHERE type='view') AS views,
            (SELECT COUNT(*) FROM sqlite_master WHERE type='index') AS indizes"
done
```

**5. Im Ernstfall** die `database_id` in `wrangler.jsonc` auf die neue Datenbank
umstellen und deployen. **Bei der blossen Probe** stattdessen aufräumen:

```bash
npx wrangler d1 delete trophytracker-restore
```

> ⚠️ Den Namen zweimal lesen. Das ist der einzige Schritt im ganzen Vorgang,
> bei dem ein Tippfehler tatsächlich Schaden anrichtet.

### Ergebnis der Probe vom 14.09.2026

Dump 910.717 Byte, 1.762 `INSERT`-Anweisungen, 17 Tabellen, 3.632 geschriebene
Zeilen. `PRAGMA foreign_key_check`: **null Verletzungen**.

| Tabelle | Produktion | Wiederhergestellt |
|---|---|---|
| game | 420 | 420 |
| release | 431 | 431 |
| trophy_progress | 431 | 431 |
| play_status | 431 | 431 |
| physical_copy | 2 | 2 |
| digital_entitlement | 2 | 2 |
| plan_entry | 24 | 24 |
| review_queue | 0 | 0 |
| ean_mapping, unresolved_scan, market_offer, price_snapshot | 0 | 0 |
| psn_sync_run | 1 | 1 |
| psn_raw_response | 5 | 5 |
| psn_credentials | 1 | 1 |
| d1_migrations | 9 | 9 |
| app_setting | 6 | **4** |
| Views | 7 | 7 |
| Indizes | 18 | 18 |

Die Abweichung bei `app_setting` ist erklärt und kein Mangel: Der Dump entstand
um 09:24:57 UTC, der Backup-Vermerk schrieb `backup_letzter_erfolg_am` und
`backup_letzter_commit` acht Sekunden später. Genau diese beiden Schlüssel
fehlen, alle vier Gewichte der Rangformel sind da.

Zusätzlich bietet Cloudflare `wrangler d1 time-travel` zum Zurückstellen auf
einen Zeitpunkt. Das hilft gegen Bedienfehler, aber nicht gegen ein verlorenes
Konto — dafür ist der wöchentliche Export in das private Repository zuständig.

## Aufbau

```
migrations/    nummerierte SQL-Dateien, laufen genau einmal
scripts/       Prüfskripte für Deploy und Backup, dazu die Wiederherstellung
src/index.ts   Hono-App, hängt Repositories je Anfrage ein
src/api/       Route-Module
src/db/        Repository-Schicht – der einzige Ort mit D1-Zugriff
src/domain/    reine Logik ohne Datenbank, z. B. Titelnormalisierung, IGDB-Abgleichregel
src/psn/       PSN-Client (inoffiziell), src/igdb/ der IGDB-Client (Twitch-Token)
src/sync/      Trophäen-Sync und IGDB-Abgleich in begrenzten Schritten
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
