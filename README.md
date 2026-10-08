# Trophytracker

Single-User-Webanwendung zur Verwaltung einer PlayStation-Spielesammlung
(PS3, PS4, PS5, PS Vita):
Besitz, Trophäenfortschritt, eigene Bewertung, Wunsch- und Kaufliste.

Die vollständige Spezifikation steht in [`docs/spec/`](docs/spec/README.md).

> **Die PSN-Anbindung ist inoffiziell.** Sony stellt kein öffentliches API für
> Trophäendaten bereit; die Anwendung nutzt die Endpunkte, die auch die
> PlayStation-App verwendet. Sie können sich jederzeit ändern oder wegfallen.
> Die Anwendung ist darauf ausgelegt: Ein fehlgeschlagener Sync lässt vorhandene
> Daten unangetastet und macht nichts unbenutzbar.

## Stand

**Alle Funktionsstufen sind durch; Stufe 21 ist am 08.10.2026 abgenommen.** Offen
sind nur noch zwei Nachträge zu den Preisen (20f Preisverlauf als Diagramm, 20g
Preisalarm – beide warten auf eine Entscheidung) und die fünf finalen Stufen:
Sammlung finalisieren, Oberfläche und Bedienbarkeit, Refactoring,
Wiederherstellungsprobe, Außendarstellung. Die Einzelheiten stehen in
[Abschnitt 16](docs/spec/16-umsetzung.md), die Fassungsgeschichte in
[`docs/changelog.md`](docs/changelog.md).

In Betrieb nachgewiesen: 431 Trophäenlisten, 478 Spiele, 490 Releases, 53
erfasste Discs, nächtliche Läufe seit dem 20.09.2026.

| Funktion | Stand | Abschnitt |
|---|---|---|
| Deployment | GitHub Action baut und deployt bei Push auf `main`, Migrationen davor | [15.2](docs/spec/15-repository-deployment.md) |
| Sicherung vor Migration | Dump gegen die Zeilenzahlen der Datenbank, Abbruch bei Abweichung; Datenmigrationen protokollieren ihre Wirkung | [14.2](docs/spec/14-backup-export.md) |
| Zugriffsschutz | Cloudflare Access vor dem ganzen Worker, ein Access Service Token für Maschinen-Endpunkte | [15.3](docs/spec/15-repository-deployment.md) |
| Schema | 26 Tabellen, 32 Migrationen, sieben Views; Zugriff nur über `src/db/` | [3](docs/spec/03-sammlung.md), [11](docs/spec/11-sichten.md) |
| PSN-Anbindung | NPSSO einfügen, Token-Kette mit Rückfall, Zustand dreistufig mit Frühwarnung ab 18 Tagen | [7.1](docs/spec/07-1-psn-trophaeen.md) |
| Trophäen-Sync | Zwei Phasen (Abruf, Normalisierung), begrenzte Arbeit je Aufruf, Rohantworten der jüngsten drei Läufe | [10](docs/spec/10-sync-protokoll.md) |
| Zuordnung | Trophäenlisten als Gruppenvorschläge, einzeln korrigierbar, auftrennbar | [7.2](docs/spec/07-2-matching.md) |
| Sammlung | Kacheln oder Zeilen (je Liste gemerkt), Chip-Filter, Suche hinter der Lupe, Seiten à 100 | [13](docs/spec/13-1-ansichten.md) |
| Spieldetail | Heldenblock, eine Karte je Release, Besitz als zwei Knöpfe, Trophäenliste, Verlauf | [13](docs/spec/13-1-ansichten.md) |
| Besitz | Disc **je Release genau eine** oder digitale Berechtigung mit Quelle; Erfassen erledigt Kauf und Wunsch | [3](docs/spec/03-sammlung.md), [5](docs/spec/05-absichten.md) |
| Navigation | Vier Symbole in der Leiste unten (Handy) bzw. Seitenleiste mit Text (Desktop), Filter in der URL | [13](docs/spec/13-2-darstellungsregeln.md) |
| Bewertung | Fünf Werte, nie vom Sync überschrieben; zieht To-Do und Backlog nach | [4.2](docs/spec/04-fortschritt.md), [5.5](docs/spec/05-4-todo-und-kopplung.md) |
| Abweichungen | Wo Trophäenstand und eigene Bewertung auseinandergehen, mit Link ins Spiel | [11](docs/spec/11-sichten.md) |
| Prüfliste | Ein Spiel pro Bildschirm, sechs Aktionen mit Tastenkürzeln; Einträge für Erstimport, neue Trophäen, DLC | [8.1](docs/spec/08-1-pruefliste.md) |
| Nur PlayStation | PS3, PS4, PS5, Vita – sonst nichts. Ein IGDB-Eintrag ohne genannte Plattform ist nirgends ein Treffer | [7.6](docs/spec/07-6-igdb.md) |
| IGDB | Cover, Kritikerwertung, Erscheinungsdatum, Disc-Nachweis; nächtliches Auffrischen mit 7-Tage-Frist | [7.6](docs/spec/07-6-igdb.md) |
| IGDB-Titel | Ein Spiel ohne Trophäenliste übernimmt beim Verknüpfen den IGDB-Namen, änderbar im Spieldetail | [7.6](docs/spec/07-6-igdb.md) |
| Ohne Zuordnung | Freitext-Einträge und Spiele ohne IGDB-Eintrag listenübergreifend, abgelehnte hinter einem Umschalter | [8.3](docs/spec/08-3-metadaten.md) |
| Wunschliste | Favoriten zuerst, dann Kritikerwertung; Filter, Notiz, erledigt/verworfen. Jeder Wunsch hängt an einem Release | [5](docs/spec/05-absichten.md) |
| Wunschlisten-Import | Datei oder Textfeld, Jahres- und Plattformlisten, Abgleich in Schritten, Durchsicht je Zeile | [8.2](docs/spec/08-2-wunschlisten-import.md) |
| To-Do | Eigene Reihenfolge, die **ganze Karte** zieht (Finger, Maus, Tastatur), sofort gespeichert; heißt „am Spielen" | [5.4](docs/spec/05-4-todo-und-kopplung.md) |
| Backlog | Sortiert und gefiltert wie die Wunschliste, Kandidaten aus dem Besitz; heißt „pausiert" | [5.4](docs/spec/05-4-todo-und-kopplung.md) |
| Lücken | Digital gespielt, Disc belegt. Block A mit drei Knöpfen, darunter zuklappbar „Disc-Fassung unbekannt" mit **zwei** | [5.3](docs/spec/05-3-luecke-verwerfen.md) |
| Kaufliste | Kandidaten aus belegten Lücken und offenen Wünschen; ein Wunsch kommt als **Kopie**, der Wunsch bleibt offen | [5](docs/spec/05-absichten.md) |
| Erscheint bald | Unveröffentlichte Titel, `angekuendigt → erschienen` täglich im Cron | [8.4](docs/spec/08-4-unveroeffentlicht.md) |
| Gebrauchtpreise | Zwei eBay-Suchen je Release (Händler, Markt), Titelabgleich Pflicht, als Link aufs Angebot, sortierbar | [7.3](docs/spec/07-3-ebay.md) |
| Store-Preise | Neupreis der digitalen Fassung aus der gerenderten Produktseite, „im PS-Plus-Katalog", Angebote mit Grundpreis | [7.4](docs/spec/07-4-store-preise.md) |
| Spielzeit und digitaler Besitz | Aus PSN ergänzt, nie importiert; `kauf` schlägt `plus`, PS+ ist eine Momentaufnahme | [7.7](docs/spec/07-7-psn-weitere-daten.md) |
| Einzeltrophäen | 18 355 Trophäen mit Seltenheit, Stufe und Fortschrittszähler; Liste je Release, Level und Jahre im Dashboard | [7.7](docs/spec/07-7-einzeltrophaeen.md) |
| Dashboard | Kennzahlen je Plattform, Trophäen je Stufe, Feed aus zwei Quellen; Warnung gelb, Zählendes an der Glocke | [13](docs/spec/13-1-ansichten.md) |
| Spiel anlegen | Aus der Sammlung oder beim Scannen, mit IGDB-Suche oder ohne IGDB-Eintrag | [9.2](docs/spec/09-barcode.md) |
| Scannen | Kamera (Handy, Webcam), EAN-13/UPC-A/EAN-8, zwei Lesungen zur Bestätigung (UPC-A drei); „Überspringen" speichert nichts | [9](docs/spec/09-barcode.md) |
| EAN-Auflösung | `ean_mapping` → `market_offer` → **eBay live** → upcitemdb als Rückfall, alles im Moment des Scannens | [9.2](docs/spec/09-barcode.md) |
| Änderungen | `/aenderungen`: wer wann was geschrieben hat, nach Quelle filterbar, Keyset-Blätterung; im Spieldetail als Block | [8.5](docs/spec/08-5-aenderungsprotokoll.md) |
| Automatik | Zwei Cron-Fenster à 36 Aufrufe (PSN 03–05 UTC, Wartung 06–08 UTC), je Aufruf **ein** Schritt, Verlauf verdichtet | [10.1](docs/spec/10-1-cron.md) |
| App | Installierbar (PWA) mit eigenem Pokal-Symbol; offline alle Leseansichten, Balken „Offline" | [13](docs/spec/13-3-gestaltung-und-pwa.md) |
| Gestaltung | Linie „Vitrine", nur dunkel, alle Werte aus `frontend/src/tokens.css`, Saira, eigener Zeichensatz | [13](docs/spec/13-3-gestaltung-und-pwa.md) |
| Lesekosten | `test/lesekosten.spec.ts` misst die heißen Abfragen gegen Produktionsgröße, Leseansichten und Schreibschritte | [2](docs/spec/02-stack.md) |
| Sicherung | Wöchentliche GitHub Action ins private Repo, zwei Formate, Warnung ab acht Tagen Alter | [14.2](docs/spec/14-backup-export.md) |
| Wiederherstellung | Geprobt am 14.09.2026 – der Dump wird vorher sortiert (`scripts/dump-ordnen.mjs`), sonst scheitert er | [14.3](docs/spec/14-backup-export.md) |
| Export | CSV je Liste und `backup.json` mit 19 Fachtabellen, beides über den Access Service Token | [14.4](docs/spec/14-backup-export.md) |

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

**Testdaten für die lokale D1:**

```bash
node scripts/testdaten.mjs > /tmp/testdaten.sql
npx wrangler d1 execute trophytracker --local --file=/tmp/testdaten.sql
```

Das erzeugt rund 430 erfundene Trophäenlisten über die vier Plattformen – die
Größenordnung der echten Sammlung, aber Phantasietitel. Gebraucht wird das, um
Ansichten vor dem Deploy anzusehen (headless Chrome gegen `wrangler dev`) und
nicht nur zu bauen. **Echte PSN-Daten kommen dafür nie in Frage:** Die
Rohantworten in der Produktion enthalten die vollständige Spielhistorie, und
dieses Repository ist öffentlich. Das Skript beginnt mit `DELETE` über alle
Fachtabellen und gehört deshalb niemals an `--remote`.

**Scanner lokal testen:** Kamerazugriff braucht einen sicheren Kontext –
`http://localhost:5173` und `http://localhost:8787` sind einer, eine Adresse im
LAN vom Handy aus nicht. Am Laptop läuft der Scanner also unter `npm run dev`
mit der Webcam (Firefox und Desktop-Chrome nehmen den Polyfill-Pfad, sichtbar
an der Pille „Fallback"); das Handy testet gegen die Produktion, die per
`workers.dev` ohnehin HTTPS hat. Die ZXing-WASM-Datei (rund 1 MB) liegt nach
`npm run build` unter `frontend/dist/assets/` und kommt vom eigenen Worker,
nicht von einem CDN. Ohne Kamera lässt sich jeder Weg über das Textfeld
„EAN eintippen" durchspielen; eine gültige Test-EAN ist `4006381333931`.

**Cron lokal auslösen:** `npx wrangler dev --test-scheduled` startet den Worker
mit einem Testeinstieg für den Cron; ein Aufruf entspricht einem nächtlichen
Schritt:

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/5+3-5+*+*+*"   # PSN-Fenster
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/5+6-8+*+*+*"   # Wartungsfenster
curl "http://localhost:8787/cdn-cgi/handler/scheduled"                      # ohne Ausdruck: beides
```

Der Pfad `/cdn-cgi/` läuft am Asset-Fallback vorbei; das ältere `/__scheduled`
liefert nur die `index.html`. Das Ergebnis steht als Zeile `cron: …` im
Terminal des Workers, ohne hinterlegtes NPSSO bleibt es beim IGDB-Teil.

**In der Produktion gibt es diesen Weg nicht.** Cloudflare dokumentiert keine
Möglichkeit, den `scheduled`-Einstieg eines deployten Workers von aussen zu
rufen; anstossen lassen sich dort nur die Handrouten, und die schreiben keine
Verlaufszeile, kennen keinen Bereich und wiederholen nichts. Wer den Cron prüfen
will, wartet die Nacht ab – oder spielt sie lokal durch.

**Und „Jetzt abrufen" ersetzt den Nachtlauf.** Ein erfolgreicher Handabruf vom
selben Tag lässt den Cron den Sync überspringen (10.1, Schritt 3). Wer am Abend
auf den Knopf drückt, hat am nächsten Morgen keine Cron-Sync-Zeilen im Verlauf.

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
   Stufe 2, IGDB/Twitch ab Stufe 9 – siehe oben –, eBay ab Stufe 17c; dieselben
   eBay-Zugangsdaten tragen seit Stufe 20 die Gebrauchtpreise).
   Lokal gehören sie in `.dev.vars`, niemals ins Repository.

## PlayStation-Anbindung

Die Anbindung ist inoffiziell. Der Zugang läuft über das **NPSSO** – ein Cookie
aus dem angemeldeten Browser, kein Passwort:

Seit Stufe 19e führt der Knopf **„Zugang erneuern"** in den Einstellungen durch den
Vorgang:

1. Knopf drücken – Sonys Seite geht in einem neuen Tab auf
2. Dort kopieren – am Handy mit einem langen Tippen auf die Zeichenfolge, die
   damit am Stück markiert ist; „Alles auswählen" geht genauso. Sonys Seite
   stellt das JSON sehr klein dar; lesen muss man es nicht
3. Zurück zu Trophytracker – die App liest die Zwischenablage, prüft den Zugang
   gegen PSN und speichert ihn

Nichts heraussuchen: Das Feld nimmt den blanken Wert, das ganze JSON und die ganze
Seite an. Fehlt die Zwischenablage-Berechtigung, steht der Weg von Hand darunter.

**Automatisch geht es nicht, und das ist gemessen** (29.09.2026): Sony erlaubt den
Abruf von fremder Herkunft zwar (CORS steht offen), aber der Browser hängt das
Cookie dabei nicht an (`SameSite`) – dieselbe Regel, die verhindert, dass eine
beliebige Webseite deine PSN-Sitzung mitliest. Ein neues Tab auslesen darf eine
Seite ebenso wenig. Der Kopierschritt ist deshalb nicht wegzubekommen, nur kurz zu
halten.

**Wie lange ein Zugang hält, zeichnet die App auf** (`psn_zugang`, Migration 0026).
Sony kündigt beim Ausstellen rund 60 Tage an; der Zugang vom 04.09.2026 hielt 25.
Gewarnt wird deshalb nach Alter – ab 18 Tagen –, nicht nach Sonys Zahl, und gezählt
werden nur abgelehnte Zugänge: Wer früher erneuert, erfährt nie, wie lange seiner
gehalten hätte.

**Ablage.** NPSSO und Refresh-Token liegen AES-GCM-verschlüsselt in D1, der
Schlüssel als Cloudflare Secret. Ein Datenbank-Dump enthält damit keinen
verwertbaren Zugang. Warum nicht als Cloudflare Secret: Ein Worker kann keine
Secrets schreiben, ein Eingabefeld braucht aber eine beschreibbare Ablage –
siehe [Abschnitt 7.1](docs/spec/07-1-psn-trophaeen.md).

**Keiner dieser Werte erscheint jemals in einer API-Antwort oder im Log**, auch
nicht gekürzt. Durchgesetzt über die Hülle `Geheimnis` in
[`src/domain/secret.ts`](src/domain/secret.ts), geprüft von
`test/keine-lecks.spec.ts`.

**Abruf.** Ein Aufruf von `POST /api/sync` holt **eine** Seite à 100 Titel und
merkt sich den nächsten Offset – der Free Tier erlaubt 10 ms CPU je Aufruf, und
Cron Trigger haben dieselbe Grenze. Die Oberfläche ruft so lange erneut auf, bis
der Durchlauf fertig ist. Ein Lauf hat **zwei Phasen**: erst alle Seiten roh
holen, dann zu `trophy_progress` normalisieren. Die Normalisierung fasst PSN
nicht an und lässt sich jederzeit wiederholen:

```
POST /api/sync/normalize     # setzt zurück, danach normalisiert POST /api/sync erneut
```

Das ist der praktische Nutzen der Trennung: Ist die Abbildung falsch, wird sie
korrigiert und erneut ausgeführt, statt die Daten neu von Sony zu holen. Die
gemessenen CPU-Werte je Aufruf, die Portionierung und was am Ende jeder
Normalisierung in die Prüfliste eingereiht wird, stehen in
[Abschnitt 10](docs/spec/10-sync-protokoll.md) und
[8.1](docs/spec/08-1-pruefliste.md).

**CPU nachmessen:** GraphQL-Analytics (`workersInvocationsAdaptive`) für
Quantile, Workers-Observability (`telemetry/query`) für die Zuordnung je Route –
nur letztere zeigt, *welcher* Aufruf teuer ist.

Läuft das NPSSO ab, ist das kein Fehlerfall, sondern ein regulärer Zustand:
`status` wird `abgelaufen`, vorhandene Daten bleiben stehen, und in den
Einstellungen lässt sich ein neues eintragen. Das steht auch im Hinweisblock der Sammlung – „der nächtliche Abruf steht still".

## Automatik

Nachts laufen zwei Cron-Fenster, je Aufruf **genau ein** Schritt – die 10 ms CPU
des Free Tier tragen nicht mehr. Welche Schritte es sind, in welcher Reihenfolge
und mit welchen Fristen, steht in [Abschnitt 10.1](docs/spec/10-1-cron.md).

| Fenster | Ausdruck | Aufrufe | Was dort läuft |
|---|---|---|---|
| PSN | `*/5 3-5 * * *` | 36 | hängende Läufe abbrechen, Trophäen-Sync (ein Lauf je Nacht), Spielzeit, Kaufliste, Einzeltrophäen, Trophäen-Level, Store-Preise |
| Wartung | `*/5 6-8 * * *` | 36 | erschienene Titel freigeben, IGDB auffrischen, Disc-Fassungen, Gebrauchtpreise, Trophäen je Jahr, Rohantworten aufräumen |

**Nachsehen, ob die Nacht gelaufen ist:** Einstellungen → „Automatik". Dort
stehen beide Fenster, der letzte automatische Abruf und der **Verlauf der letzten
zwanzig Aufrufe**; gleichartige Arbeit ist zu einer Zeile verdichtet, der
Fortschritt als Spanne (`sync ×5 offset=100→400`). Eine ganze Nacht sind
normalerweise sieben Zeilen. Ein abgelaufener PSN-Zugang und ein
fehlgeschlagener Nachtlauf jünger als 24 Stunden erscheinen im Hinweisblock der
Startseite.

**Von Hand anstoßen** geht für jeden Schritt: „Jetzt synchronisieren",
„Kaufliste jetzt abrufen", „Trophäen holen" (Portionsknopf), „Marktpreise
jetzt abrufen", „Store-Preise jetzt abrufen". Das überspringt die Frist, nicht
die Portionierung.

**Örtlich prüfen:**

```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/5+3-5+*+*+*"   # PSN-Fenster
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/5+6-8+*+*+*"   # Wartung
curl "http://localhost:8787/cdn-cgi/handler/scheduled"                      # beides
```

Der Pfad `/cdn-cgi/` läuft am Asset-Fallback vorbei, `/__scheduled` nicht.

## IGDB-Anbindung

Cover, Kritikerwertungen, Erscheinungsdaten und der Disc-Nachweis kommen von
IGDB. Wie gesucht und zugeordnet wird, welche Rückfälle es gibt und warum ein
Eintrag ohne genannte PlayStation-Plattform nie ein Treffer ist, steht in
[Abschnitt 7.6](docs/spec/07-6-igdb.md).

**Zugang einrichten.** IGDB läuft über eine Twitch-Anwendung:

1. Unter https://dev.twitch.tv/console/apps eine Anwendung anlegen (Kategorie
   „Application Integration", OAuth-Redirect `http://localhost`)
2. Client-ID und ein Client-Secret erzeugen
3. Beide als Cloudflare Secrets setzen (siehe [Einrichtung](#einrichtung-eines-eigenen-kontos)):
   `IGDB_CLIENT_ID` und `IGDB_CLIENT_SECRET`, lokal dieselben Namen in `.dev.vars`

Ohne die beiden Werte antworten **nur** die IGDB-Routen mit `503`; die übrige
Anwendung läuft weiter. Das Twitch-Token holt der Worker selbst und hält es im
Speicher, nie in der Datenbank.

**Bedienen.** In den Einstellungen unter „IGDB" stehen die Zähler (verknüpft, zur
Prüfung, nicht gesucht, abgelehnt) und drei Knöpfe: „Abgleich starten" (acht
Spiele je Schritt, mit Fortschritt), „Metadaten auffrischen" (50 Spiele je
Anfrage) und „Offene erneut suchen". Mehrdeutiges geht nach `/igdb`, Spiele ohne
Eintrag nach `/ohne-zuordnung`. Im Spieldetail zeigt das Punktmenü der Kopfzeile
„Anderen Eintrag wählen", „Verknüpfung lösen" und „Gibt es bei IGDB nicht".

**Alte Wunschlisten** gehören als Textdateien in `wunschlisten/` (lokal,
`.gitignore`) und werden über `/import` eingelesen.

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

`GET /api/export/backup.json` und `POST /api/backup/vermerk` werden von GitHub
Actions aufgerufen und können keinen Browser-Login durchlaufen. (Ein
`POST /api/imports/feed` war für den AWIN-Händlerfeed vorgesehen und ist mit
ihm entfallen – Stufe 20 holt die Marktdaten live über eBay.)

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
[Abschnitt 15.3](docs/spec/15-repository-deployment.md#153-zugriffsschutz).

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
5. Datenmigrationen protokollieren ihre Wirkung – `play_status` (0006),
   `review_queue` (0007), Rangformel (0013), To-Do-Positionen (0014),
   Kopplung (0015), `reviewed_progress_pct` (0016) –, jeweils neben der
   Erwartung
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

**Nach einem Deploy genügt ein normales Neuladen.** Seit Stufe 18 liefert der
Service Worker die Seite selbst Network-First und aktualisiert sich still
(`autoUpdate`); nur die gehashten Assets liegen im Precache. Ob die neue Fassung
ausgeliefert wird, lässt sich am Asset-Hash prüfen – der Name von
`/assets/index-*.js` in der ausgelieferten Seite muss dem in `frontend/dist`
entsprechen. Die Ausgabe von `wrangler deploy` nennt außerdem den Cron
(`schedule: */5 3-5 * * *`); ob er läuft, zeigt am Folgemorgen
`GET /api/sync/status` → `letzterAutomatischerLauf`.

## Als App installieren

Das Frontend ist seit Stufe 18 eine PWA (`vite-plugin-pwa`): Manifest, eigenes
Symbol (ein Pokal in einem Fortschrittsring – bewusst ohne PlayStation-Marken,
das Repository ist öffentlich) und ein Service Worker. Der Ring ist zu 87 %
geschlossen: Eine Sammlung ist nie ganz fertig.

- **Android, Chrome:** Menü → „App installieren" beziehungsweise „Zum
  Startbildschirm hinzufügen".
- **iPhone, Safari:** Teilen → „Zum Home-Bildschirm".
- **Desktop, Chrome/Edge:** Symbol „Installieren" in der Adressleiste.

Die Anmeldung über Cloudflare Access läuft in der installierten App wie im
Browser; die Kamera des Scanners funktioniert auch im Vollbildmodus.

**Offline** zeigt die App den zuletzt geladenen Stand aller Leseansichten –
Sammlung, Spieldetail, Listen, Cover – mit einem Balken „Offline – du siehst den
zuletzt geladenen Stand". Änderungen sind erst wieder online möglich; eine
Warteschlange gibt es nicht. Wie das mit Access zusammenspielt (Seite und API
Network-First, nichts von einer Weiterleitung im Cache), steht in
[Abschnitt 13](docs/spec/13-frontend.md).

Die PNG-Symbole entstehen aus `frontend/public/icon.svg`:

```bash
cd frontend && npx pwa-assets-generator     # Konfiguration in pwa-assets.config.ts
```

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
**Ein Deploy kostet rund 250 000 gelesene Zeilen** (gemessen am 01.10.2026):
`d1 export` liest die ganze Datenbank, und die ist mit den Einzeltrophäen von
1,79 auf 8,3 MB gewachsen. An einem knappen Tag ist das der größte einzelne
Posten — vor dem Pushen lohnt der Blick auf `rows_read_24h`.

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
| `backup.json` | die 15 Fachtabellen (seit Stufe 16 mit `game_event`) als lesbare Zweitform – ohne `psn_credentials`, `psn_raw_response` und `d1_migrations` |

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

## EAN-Quellen und Zugangsdaten

Titel zu Barcodes kommen aus zwei Quellen, in dieser Reihenfolge:

| Quelle | Wo | Kontingent | Wofür |
|---|---|---|---|
| **eBay Browse API** | im Worker, live beim Scannen | 5 000/Tag, keine Drosselung | der Normalfall seit Stufe 17c |
| **upcitemdb** | im Worker, als Rückfall | 100/Tag, 90 s Pause nach je 6 | für Codes, die eBay nicht kennt; braucht keine Zugangsdaten |

Beide laufen **live im Worker, im Moment des Scannens** – upcitemdb drosselt hart,
wird aber nur selten gefragt, und ein Fehler dort heißt schlicht „kein Titel".

Die eBay-Zugangsdaten (App ID und Cert ID aus einem **Production**-Keyset unter
https://developer.ebay.com/my/keys) liegen an zwei getrennten Orten – dieselben
zwei Werte, zwei eigene Ablagen:

```bash
# 1. lokal, für `wrangler dev` – in .dev.vars, niemals ins Repository
EBAY_CLIENT_ID=…
EBAY_CLIENT_SECRET=…

# 2. für den laufenden Worker (Produktion)
npx wrangler secret put EBAY_CLIENT_ID
npx wrangler secret put EBAY_CLIENT_SECRET
```

Fehlen sie, antwortet nur `GET /api/scan/:ean/online` mit `503`; Scanner und
Anwendung laufen unverändert weiter. Beim Anlegen des Keysets verlangt eBay
einmalig eine Angabe zu „Marketplace Account Deletion" – da die Anwendung keine
eBay-Nutzerdaten speichert, ist dort die Ausnahme („Exempt") richtig.

## Ein Code, der sich nicht zuordnen lässt

Bis Stufe 17d legte der Scanner solche Codes als **offene Scans** ab, und ein
nächtlicher Job holte dazu Titel. Das ist abgeschafft: Ein Barcode ohne seine
Hülle war später nicht mehr zuzuordnen – die Liste erzeugte Arbeit statt Nutzen
(Entscheidung vom 21.09.2026, Begründung in
[Abschnitt 9.3](docs/spec/09-3-ean-quellen.md#93-es-gibt-keine-offenen-scans-stufe-17d)).

Heute gilt: Der Titel kommt sofort (eBay, sonst upcitemdb), das Spiel lässt sich
im selben Fenster anlegen. Wer gerade nicht zuordnen will, drückt
**Überspringen** – gespeichert wird nichts, die Disc steht im Regal, ein
erneuter Scan holt den Code zurück.

Die Tabelle `unresolved_scan` bleibt vorerst leer bestehen; ein `DROP TABLE`
bräuchte zwei Deployments und hat keine Eile.

## Wunschliste und Absichten

Vier Listen auf zwei Achsen – *haben wollen* (Wunsch, Kauf) und *spielen wollen*
(To-Do, Backlog) –, dazu die Lückenansicht. Das Modell, die Übergänge zwischen
den Listen, die Kopplung mit der eigenen Bewertung und der Wunschlisten-Import
stehen in [Abschnitt 5](docs/spec/05-absichten.md) und
[8.2](docs/spec/08-2-wunschlisten-import.md).

Für den Betrieb reicht:

- **Jeder Eintrag hängt an einem Release**, also an einer Plattform – „ohne
  Plattform" gibt es nicht. Einzige Ausnahme ist ein Freitext-Eintrag, und der
  trägt in der Liste das Kennzeichen „Freitext".
- **Besitz erfassen erledigt Kauf und Wunsch** ohne Rückfrage; die Antwort nennt,
  was dabei geschlossen wurde.
- **Ein Wunsch auf der Kaufliste ist eine Kopie** – der Wunsch bleibt offen.
- **To-Do heißt „am Spielen", Backlog „pausiert".** Wer die Bewertung ändert,
  ändert damit die Liste, und umgekehrt.
- Eine Liste importieren geht über `/import` (Datei oder Textfeld); Zeilen ohne
  Treffer gehen in die IGDB-Suche, nie in einen Freitext-Eintrag.

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
Spaltenlisten: [Abschnitt 14.4](docs/spec/14-backup-export.md#144-csv-export).

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
fehlen, alle vier Gewichte der damaligen Rangformel sind da (seit Migration
0013 gelöscht).

Zusätzlich bietet Cloudflare `wrangler d1 time-travel` zum Zurückstellen auf
einen Zeitpunkt. Das hilft gegen Bedienfehler, aber nicht gegen ein verlorenes
Konto — dafür ist der wöchentliche Export in das private Repository zuständig.

## Aufbau

```
migrations/    nummerierte SQL-Dateien, laufen genau einmal
scripts/       Prüfskripte für Deploy und Backup, dazu die Wiederherstellung
src/index.ts   Hono-App, hängt Repositories je Anfrage ein; dazu der Cron-Einstieg `scheduled`
src/api/       Route-Module
src/db/        Repository-Schicht – der einzige Ort mit D1-Zugriff
src/domain/    reine Logik ohne Datenbank, z. B. Titelnormalisierung, IGDB-Abgleichregel
src/psn/       PSN-Client (inoffiziell), src/igdb/ der IGDB-Client (Twitch-Token)
src/sync/      Trophäen-Sync und IGDB-Abgleich in begrenzten Schritten; cron.ts ordnet sie für die Nacht
frontend/      React + Vite als PWA (vite-plugin-pwa), wird als Static Assets mit dem Worker ausgeliefert
```

**Route-Handler rufen niemals `env.DB.prepare()` auf.** Sie greifen über
`c.var.repos` zu. Das hält einen späteren Wechsel zu Turso, Postgres oder
lokalem SQLite auf `src/db/` begrenzt.

Getestet wird, was Logik ist, nicht was Glue ist: Die Views werden gegen
eingespielte Daten geprüft, der Wunschlisten-Parser ohne Datenbank. Die Tests
laufen gegen dasselbe Schema wie Produktion – `vitest.config.mts` liest die
Migrationen aus `migrations/` ein und wendet sie je Testlauf an.

```bash
npx wrangler d1 migrations apply trophytracker --local   # Schema lokal anlegen
npm test
```

## Zuordnung von Trophäenlisten

Warum Trophäenlisten nicht automatisch zugeordnet werden, wie Gruppen entstehen
und wie sich eine Zuordnung zurücknehmen lässt, steht in
[Abschnitt 7.2](docs/spec/07-2-matching.md). Bedient wird das über `/zuordnung`
(Gruppenvorschläge) und `/pruefen` (Sammlung prüfen).

## Kosten

Alles läuft im **Free Tier**: Worker-Anfragen, D1-Speicher und die gelesenen
Zeilen liegen Größenordnungen unter den Grenzen. Die **72 Cron-Aufrufe je Nacht**
(zwei Einträge von fünf erlaubten) zählen als Anfragen und lesen im Leerlauf
rund 80 800 Zeilen; eine Nacht mit Arbeit liegt bei gut 200 000 von fünf
Millionen. **Die engere Grenze ist das Schreiben** – 100 000 Zeilen am Tag,
sobald eine Stufe den Bestand einmal durchschreibt. Ein Zahlungsmittel ist nicht
hinterlegt; Cloudflare kann den Free Tier nicht automatisch verlassen.
Einzelheiten und Messwerte: [Abschnitt 15.4](docs/spec/15-repository-deployment.md).

## Was niemals ins Repository gehört

NPSSO und PSN-Refresh-Token, IGDB/Twitch-Zugangsdaten, eBay-Zugangsdaten,
API-Bearer-Token, der Cloudflare-API-Token – und
unter keinen Umständen ein Datenbank-Dump. `.dev.vars`, `.wrangler/` und `*.sql`
stehen in der `.gitignore`; `migrations/*.sql` ist davon ausgenommen, weil die
Migrationen eingecheckt sein müssen.
