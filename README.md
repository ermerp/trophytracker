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

**Stufen bis 18c abgenommen** (22.09.2026) ([Umsetzungsreihenfolge](docs/spezifikation.md#16-umsetzungsreihenfolge)).
Die Anwendung läuft unter `trophytracker.philipp-ermer-bvb.workers.dev`. Aus
den Trophäenlisten lassen sich Spiele und Releases anlegen, dazu Besitz
erfassen (Use Case 1) und je Release die eigene Bewertung setzen (Use Case 2).
Die Prüfliste führt einmal durch den ganzen Bestand (Use Case 8, zunächst nur
`erstimport`). **Die Ersteinrichtung ist am 14.09.2026 durchlaufen:** alle 431
Trophäenlisten sind bewertet, die Warteschlange ist leer. Damit steht der
Datenbestand – und ab hier steckt darin Arbeit, die PlayStation nicht
zurückliefert. Stufe 8 sichert ihn wöchentlich ins private Repository und
liefert den CSV-Export (Use Case 13). Stufe 9 holt Cover, Kritikerwertung und
Erscheinungsdatum von IGDB; Stufe 10 baut darauf die Wunschliste mit Favoriten
(Use Case 4) – die erste der vier Absichts-Listen, deren
Routen und Repository auch To-Do, Backlog und Kaufliste tragen werden. Stufe 11
holt die alten Wunschlisten aus Textdateien herein (Use Case 9) und sammelt
alles ohne IGDB-Eintrag in einer Ansicht zum Nachziehen (Use Case 12).
**Abgenommen am 15.09.2026**, die ersten drei Listen sind importiert. Stufe 12
bringt To-Do in eigener Reihenfolge und das Backlog mit Kandidaten aus dem
Besitz (Use Cases 5a und 5b); nach der ersten Durchsicht am 16.09.2026 sind
beide Listen mit der Bewertung gekoppelt (To-Do = am Spielen, Backlog =
pausiert, Migration 0015), IGDB-Einträge ohne PlayStation-Plattform sind
nirgends mehr ein Treffer, und die Listen haben ein Suchfeld.
**Abgenommen am 16.09.2026.** Stufe 13 macht Use Case 8 vollständig: Der Sync
vergleicht jede Liste mit dem Stempel ihrer letzten Durchsicht und legt in der
Prüfliste vor, was sich seither geändert hat – „Du hast weitergespielt"
(`neue_trophaeen`, nicht bei `am_spielen`) und „Neue DLC-Trophäen erschienen"
(`dlc_erweitert`), mit Vorher-Nachher in Prozent (Migration 0016). Der Sync
ändert dabei nie einen Status. **Abgenommen am 16.09.2026** – am Abnahmetag
gab es keine Änderung zu melden, der erste echte Eintrag steht noch aus.
Stufe 14 bringt die Lücken (Use Case 3): Die Disc-Fassung je Release kommt aus
IGDBs Händlereinträgen (199 von 481 Releases, Rest `unbekannt`), von Hand nur
ein `nein` oder eine Korrektur; die Ansicht `/luecken` zeigt, was digital
gespielt ist, als Disc existiert und nicht im Regal steht, und lässt eine Lücke
als „physisch nicht gewünscht" verwerfen (Migration 0017). **Abgenommen am
16.09.2026**: 197 Releases aus IGDB belegt, 165 Lücken; die 249 mit
unbekannter Disc-Fassung bleiben offen, bis der Händlerfeed (Stufe 20)
nachfüllt – IGDB kennt Discs nur positiv (Amazon-Einträge). Stufe 15 bringt
die Kaufliste (Use Cases 6 und 10) mit Kandidaten aus Lücken und Wünschen und
„Erscheint bald" (Use Case 11). Drei Entscheidungen vom 16.09.2026 prägen sie:
Ein Wunsch kommt als **Kopie** auf die Kaufliste und bleibt, bis der Kauf
erledigt ist; „erledigt" am Kauf erledigt den Wunsch mit; und wer eine Disc
oder Berechtigung erfasst, hat gekauft – Kauf- und Wunscheintrag verschwinden
von selbst (Migration 0018 gleicht den Bestand an, eine Zeile).
**Abgenommen am 16.09.2026.** Stufe 16 bringt das Änderungsprotokoll: Jede
Zeile in `game_event` (Migration 0019) sagt, wer wann was geschrieben hat – du,
der PSN-Sync, IGDB oder der Import –, geschrieben ausschließlich in der
Repository-Schicht, im selben Batch wie die Änderung. Der Sync protokolliert
nur Erkanntes, IGDB nur Entscheidungen und Statuswechsel, der Verlauf beginnt
mit dem Deploy und wird unbegrenzt aufbewahrt und mitgesichert (vier
Entscheidungen vom 16.09.2026). Sichtbar als Block „Verlauf" im Spieldetail
und als Ansicht „Änderungen" mit Quellenfilter. **Abgenommen am 16.09.2026.**
Stufe 17 bringt den Barcode-Scan (Abschnitt 9): `/scannen` in der Leiste, mit
der Handy-Kamera und der Laptop-Webcam, ohne externe EAN-Quelle – ein Code wird
beim ersten Mal aus der eigenen Sammlung gewählt (oder das Spiel angelegt) und
ist danach bekannt. Zuordnen legt Disc und Mapping an, erledigt Kauf- und
Wunscheinträge und steht im Verlauf als „per Barcode". Keine Migration.
Stufe 17b holt zu liegen gebliebenen Codes den Titel per täglichem Job und legt
sie in `/scans` zur Entscheidung vor (Migration 0020). **Beide abgenommen am
19.09.2026**: PS3-Regal gescannt, 34 Discs per Barcode erfasst; 22 Codes, die
die Quelle nicht kennt, bleiben offen, bis eBay als zweite Quelle freigegeben ist.
Stufe 17c löst die offene Frage aus 17b ein: Seit der eBay-Entwicklerzugang da
ist, holt der Scanner den Titel zu einem unbekannten Code **live beim Scannen**
statt erst nachts – ein Code, den die Sammlung nicht kennt, fällt auf, solange
die Hülle in der Hand liegt. Der Abgleich bekam dabei zwei gemessene
Korrekturen (Mehrheit über mehrere Angebote, Ballast vor Ziffern); gemessen
gegen die echten Codes: 37 von 37 richtig, kein Fehlgriff, 16 von 22 offenen
mit Vorschlag. Stufe 18 bringt die [Automatik](#automatik) – ein Cron Trigger holt die Trophäen
nachts von allein, gibt erschienene Titel frei und frischt IGDB-Metadaten auf,
je Aufruf ein Schritt (Migration 0021) – und macht das Frontend zur
[installierbaren App](#als-app-installieren) mit Offline-Lesezugriff. Die
Abnahme steht aus: Der erste Nachtlauf ist am Folgemorgen zu prüfen.

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
| Schema | 21 Tabellen, 7 Views, siebzehn Migrationen |
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
| Prüfliste | Ein Spiel pro Bildschirm, sechs Aktionen (Tasten 1–6; „Spiele gerade" ging mit der Kopplung in „Auf To-Do" auf), „noch n von m", jederzeit verlassen; Einreihung am Ende jedes Syncs und nach jeder Zuordnung. 100 % wird nicht vorgelegt, sondern still gestempelt. Drei Gründe: `erstimport`, `neue_trophaeen` („40 % → 55 %, 3 neue Trophäen erspielt"), `dlc_erweitert` („100 % → 78 %, Liste um 12 Trophäen gewachsen") – der Vergleich läuft gegen den Stempel der letzten Durchsicht, Migration 0016 |
| Datenbestand | 431 Trophäenlisten, 420 Spiele; bewertet: 167 komplettiert, 119 abgebrochen, 118 durchgespielt, 25 pausiert, 2 am Spielen |
| Offene Posten | Hinweisblock in der Sammlung: Prüfliste, `unentschieden`, nicht zugeordnete Listen, überfällige Sicherung – bis es das Dashboard gibt |
| Sicherung geprüft | Der Export wird vor der Migration gegen die Zeilenzahlen der Datenbank gehalten; Datenmigrationen protokollieren ihre Wirkung |
| Lesekosten | Indizes auf allen Fremdschlüsseln; `test/lesekosten.spec.ts` misst die heißen Abfragen gegen 430 Listen (D1 Free Tier: 5 Mio. gelesene Zeilen/Tag) |
| Sicherung ausserhalb von Cloudflare | Wöchentliche GitHub Action legt `backup.sql` und `backup.json` im privaten Repo `trophytracker-backup` ab; Datum der letzten Sicherung in den Einstellungen, Warnung ab acht Tagen |
| Export | Sieben CSV-Listen und die JSON-Vollsicherung, verlinkt in den Einstellungen |
| Maschinen-Endpunkte | Access Service Token statt Bearer-Token – kein zweites Geheimnis im Worker |
| IGDB | Abgleich in Schritten à acht Spiele; nur eindeutige Treffer automatisch (gegen die 420 echten Titel gemessen: 372 eindeutig, keine Fehlzuordnung); Prüfansicht mit Kandidaten; Cover im Hochformat in der Sammlung; Kritikerwertung und Erscheinungsdatum im Spieldetail; jede Verknüpfung lösbar. **Abgenommen am 14.09.2026: 419 von 420 verknüpft**, eines bewusst abgelehnt (Vita-Wecker-App, IGDB kennt sie nicht) |
| Wiederherstellung | am 14.09.2026 vollständig durchgespielt, alle 17 Tabellen, 7 Views und 18 Indizes stimmen überein, `foreign_key_check` ohne Treffer (Stand vor Migration 0011; seit Migration 0012 sind es 21 Tabellen und 25 Indizes) |
| Nur PlayStation | PS3, PS4, PS5, Vita – sonst nichts: IGDB-Einträge ohne genannte PlayStation-Plattform sind nirgends ein Treffer (auch nicht ohne Plattformangabe, seit 16.09.2026), jede IGDB-Abfrage filtert, `release.platform` erlaubt nur die vier Werte |
| IGDB-Titel | Ein von Hand oder aus einem Wunsch angelegtes Spiel übernimmt beim Verknüpfen den IGDB-Namen als Titel (nicht beim Auffrischen, nie bei Spielen mit Trophäenliste); änderbar im Spieldetail – die Überschrift ist ein Eingabefeld |
| Wunschliste | Eigene Ansicht in der Leiste: Favoriten zuerst, dann Kritikerwertung (auch Wertung, Titel, Erscheinungsdatum, zuletzt angelegt); Filter Favoriten, Plattformen, „ohne Plattform"; Favorit-Stern, Plattform-Dropdown je Eintrag, Notiz, erledigt/verworfen; neue Wünsche über die IGDB-Suche (nur PlayStation-Einträge), Plattform-Dropdown an jedem Treffer, vorbelegt mit dessen neuester – mit Plattform ein Release, das erst mit Besitz oder Fortschritt in der Sammlung erscheint, ohne Plattform ein Spiel ohne Release; Freitext nur ausdrücklich. Ein Wunsch am Spiel und einer am Release sind zwei Aussagen, nur dasselbe Ziel ist ein Duplikat. **Abgenommen am 15.09.2026**; Priorität und Rang danach auf Wunsch des Nutzers entfernt (Migration 0013) |
| Wunschlisten-Import | Textdatei oder Textfeld, Jahreslisten mit Monatsüberschriften (auch mit Tippfehlern), Plattform-Abschnitte, die bereinigte Tabellenform; Lauf in der Datenbank, Abgleich in Schritten à acht Zeilen (erst Sammlung, dann IGDB, Jahr aus der Liste entscheidet Gleichnamige); Eindeutige und Sammlungstreffer mit einem Knopf, der Rest als Liste mit Kandidaten, Suche, „Ohne IGDB-Eintrag übernehmen", umbenennen, aufteilen, überspringen – jede Entscheidung sofort gespeichert, Rückgängig |
| Ohne Zuordnung | Freitext-Einträge und Spiele ohne IGDB-Eintrag listenübergreifend, mit Suche zum Nachziehen; abgelehnte hinter einem Umschalter |
| To-Do | In der Leiste, Backlog als Reiter daneben: eine Spalte in eigener Reihenfolge, Ziehen am Griff (Maus, Finger, Tastatur) oder Pfeilknöpfe, sofort gespeichert. **Gekoppelt mit der Bewertung** (Entscheidung vom 16.09.2026): To-Do heißt „am Spielen", „ins Backlog" setzt „pausiert", „durchgespielt"/„abgebrochen" auf der Kachel schließen den Eintrag |
| Lücken | In der Leiste: digital gespielt, Disc-Fassung belegt, nicht im Regal; „physisch nicht gewünscht" ist ein verworfener Kaufeintrag (Rückgängig, „wieder als Lücke zeigen"); darunter zugeklappt „Disc-Fassung unbekannt" mit „Disc gibt es" / „gibt es nicht" / „physisch nicht gewünscht" je Zeile. Disc-Fassung aus IGDB (`external_games`, Knopf „Disc-Fassungen prüfen" in den Einstellungen, 50 Spiele je Anfrage, nur `unbekannt` → `ja`, nach 30 Tagen erneut) oder von Hand im Spieldetail (Dropdown mit Quelle); PSN-Produkt-Id je Release pflegbar |
| Backlog | Sortiert und gefiltert wie die Wunschliste, „auf To-Do" hängt ans Ende und setzt „am Spielen"; Backlog heißt „pausiert", nie gestartete bleiben „nicht gespielt". Kandidaten aus dem Besitz (Disc oder digitale Berechtigung, kein Fortschritt, keine Liste) mit „ins Backlog", „auf To-Do", „nicht vorgesehen" (gespeicherte Ablehnung, Migration 0014); im Spieldetail „Auf To-Do" / „Ins Backlog" je Release. Beim Entfernen eines Eintrags gehen Release und Spiel mit, wenn sonst nichts daran hängt. **Stufe 12 abgenommen am 16.09.2026** |
| Kaufliste | In der Leiste, sortiert und gefiltert wie die Wunschliste, jede Kachel mit Herkunft. Kandidaten in zwei Blöcken: belegte Lücken („auf die Kaufliste", „physisch nicht gewünscht") und offene Wünsche („auf die Kaufliste" als Kopie, auch auf der Wunsch-Kachel); Angekündigte fehlen. „erledigt" am Kauf erledigt den Wunsch mit; Disc oder Berechtigung erfassen erledigt beide automatisch, mit „ins Backlog übernehmen" und Rückgängig. Im Spieldetail „Auf die Kaufliste" je Release. Gebrauchtpreis „unbekannt" bis Stufe 20 (Migration 0018). **Stufe 15 abgenommen am 16.09.2026** |
| Erscheint bald | Werkzeug in den Einstellungen, verlinkt von Wunsch- und Kaufliste, sobald ein vorgemerkter Titel noch nicht erschienen ist; ein verstrichenes Datum macht ihn zum Kaufkandidaten, den Status hebt der nächtliche Cron nach, außerdem „Metadaten auffrischen" (Stufe 18) |
| Automatik | Cron Trigger, nachts alle fünf Minuten zwischen 03:00 und 05:59 UTC, je Aufruf ein Schritt: Erschienene freigeben, hängende Läufe abbrechen, Trophäen-Sync (ein Versuch je Nacht), IGDB-Auffrischen (Frist 7 Tage), Disc-Fassungen. Block „Automatik" in den Einstellungen, Hinweisblock bei Fehler oder abgelaufenem Zugang (Migration 0021) |
| App | Installierbar (PWA) mit Pokal-Symbol; offline alle Leseansichten aus dem letzten Stand, Balken „Offline"; Seite und API Network-First, damit die Access-Anmeldung weiter greift |
| Spiel anlegen | In Sammlung und Scanner ein Formular: Plattform wählen, Titel suchen, IGDB-Treffer antippen – das Spiel entsteht verknüpft, mit Cover und Wertung (die Plattform steht am Treffer, vorbelegt mit dessen neuester). „Ohne IGDB-Eintrag anlegen" für Titel, die IGDB nicht kennt; die bekommen im Spieldetail „Gibt es bei IGDB nicht" |
| Scannen | In der Leiste (`/scannen`): Kamera (Rückkamera am Handy, „Kamera wechseln" am Laptop), Standard-API `BarcodeDetector` mit dem Polyfill `barcode-detector` als Fallback (ZXing-WASM, vom eigenen Worker ausgeliefert, Pille „Fallback"), Textfeld als Notnagel mit Prüfziffer; ein Code gilt erst nach zwei übereinstimmenden Lesungen (die Prüfziffer allein fängt nicht jeden Fehlgriff – gemessen am 17.09.2026). Kette: bekannter Code → Karte mit „Weiteres Exemplar"; sonst Suche in der Sammlung (Knopf je Release, „andere Plattform") oder „Spiel anlegen" wie in der Sammlung; „Später" lässt den Code als offenen Scan in den Einstellungen, „Verwerfen" wirft eine Fehllesung sofort weg (mit Rückfrage). Zuordnen = Disc mit EAN + Mapping + erledigte Kauf-/Wunscheinträge, mit Rückgängig; die Erkennung läuft in Serie weiter. „Überspringen" geht weiter, ohne etwas zu speichern (seit Stufe 17d – davor „Später" und ein Sammelmodus, beides mit offenen Scans entfallen). Unbekannte Codes löst seit Stufe 17c eBay live auf; ein Treffer aus der Sammlung erscheint als dieselbe Karte wie ein bekannter Code – mit Cover, „im Regal ×n" und „Disc erfassen" (9.2) |
| EAN-Auflösung | Kette beim Scannen: eigenes `ean_mapping` (rein lokal, kein Netz) → Händlerfeed → **eBay live** (seit Stufe 17c, Titelvorschlag mit Kandidaten der Sammlung) → Suche/Anlegen von Hand. Ein einmal zugeordneter Code wird nie wieder online nachgeschlagen |
| Offene Scans (bis 17d) | Werkzeug in den Einstellungen (`/scans`): Ein täglicher GitHub-Job holt Titel zu gescannten Codes bei upcitemdb (die freie Quelle drosselt nach je sechs Abfragen um 90 Sekunden – deshalb außerhalb des Workers), die Ansicht gleicht sie mit der Sammlung ab und legt sie in Blöcken vor: eindeutig mit „Alle erfassen", ohne eindeutiges Ziel mit Kandidaten und Suche, ohne Titel mit dem Stand des Jobs. Erfassen läuft über dieselbe Route wie der Scanner, Rückgängig stellt den offenen Scan wieder her. Gemessen an 56 PS3-Codes: 35 kannte die Quelle, 22 davon eindeutig (Migration 0020) |
| Änderungen | Werkzeug in den Einstellungen (`/aenderungen`): wer wann was geschrieben hat, neueste zuerst, nach Quelle filterbar (du, PSN-Sync, IGDB, Import), je Zeile mit Link ins Spiel; „ältere laden". Im Spieldetail derselbe Verlauf als Block. Nur lesend – Bewertung, Listen, Besitz, Zuordnung, IGDB-Entscheidungen, Vorbelegung und Prüflisten-Einträge werden protokolliert, Cover/Wertung beim Auffrischen und die To-Do-Reihenfolge nicht (Migration 0019) |

Ohne Anmeldung antworten `/`, `/api/health` und beliebige SPA-Pfade mit `302` auf
den Login unter `trophytracker.cloudflareaccess.com`.

**Stufe 18c ist abgenommen** (22.09.2026): Der Cron holt nachts Spielzeit
(`playDuration`, `playCount`) und den digitalen Besitz samt der Unterscheidung
gekauft/PS+ – ohne dass etwas von Hand einzutragen wäre. Die Spielzeit steht im
Spieldetail und ist Sortierkriterium der Sammlung; digitale Berechtigungen
erscheinen als Pillen an der Kachel wie bisher, nur eben von allein. Gemessen:
236 Releases bekommen Spielzeit, 56 Kauf- und 160 PS+-Einträge entstehen.
**Als Nächstes: Stufe 19 – Oberfläche**, dahinter 19b (Einzeltrophäen). Danach die
Oberfläche (19), dahinter die Einzeltrophäen je Spiel (19b). Beide
PSN-Stufen ergänzen nur, was die Sammlung schon kennt, und importieren nichts.

**Stufe 18 ist seit dem 22.09.2026 abgenommen:** PWA installiert und offline
geprüft, nächtliche Läufe am 20., 21. und 22.09. mit je 431 Titeln, in der Nacht
zum 22.09. zusätzlich 368 aufgefrischte Spiele. Der IGDB-Schritt hatte zwei
Nächte geschwiegen – Stufe 18b hat ihn repariert (gebundener Parameter in
`datetime('now', ?)` durch Text ersetzt) und zugleich nachprüfbar gemacht.
Reihenfolge danach, am
16.09.2026 entschieden: 19 Oberfläche (Dashboard, Kacheln, Handy-Layout), 20
AWIN-Feed, 21 PSN Store-Preise (Abschnitt 16 der Spezifikation). Jeder neue
Schreiber hängt sich ins Änderungsprotokoll ein (Abschnitt 8.5). Die Messung aus Stufe 17 ist erledigt: upcitemdb
kennt 35 von 56 Codes, 22 davon führen eindeutig zu einem Spiel der Sammlung.

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
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/5+3-5+*+*+*"
```

Der Pfad `/cdn-cgi/` läuft am Asset-Fallback vorbei; das ältere `/__scheduled`
liefert nur die `index.html`. Das Ergebnis steht als Zeile `cron: …` im
Terminal des Workers, ohne hinterlegtes NPSSO bleibt es beim IGDB-Teil.

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
   Stufe 2, IGDB/Twitch ab Stufe 9 – siehe oben –, AWIN-Feed-URL ab Stufe 20).
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

**Am Ende jeder Normalisierung** (und nach jeder Zuordnung) läuft ein Batch
`ReviewRepository.einreihen`: 100-%-Titel werden still gestempelt, nie
durchgesehene Listen als `erstimport` eingereiht, und gestempelte Listen mit
dem Stempel ihrer letzten Durchsicht verglichen – mehr erspielt (außer bei
`am_spielen`) heißt `neue_trophaeen`, eine gewachsene Liste `dlc_erweitert`
(Abschnitt 8.1). Das Sync-Ergebnis meldet die neuen Einträge je Grund
(`eingereihtNachGrund`). Der Sync schreibt nur in die Warteschlange, nie
einen Status.

Läuft das NPSSO ab, ist das kein Fehlerfall, sondern ein regulärer Zustand:
`status` wird `abgelaufen`, vorhandene Daten bleiben stehen, und in den
Einstellungen lässt sich ein neues NPSSO eintragen. Seit Stufe 18 steht das
auch im Hinweisblock der Sammlung – „der nächtliche Abruf steht still".

## Automatik

Seit Stufe 18 läuft ein Cron Trigger (`wrangler.jsonc`, `*/5 3-5 * * *`):
**alle fünf Minuten zwischen 03:00 und 05:59 UTC**, also 5–8 Uhr Sommerzeit
beziehungsweise 4–7 Uhr Winterzeit, 36 Aufrufe je Nacht. Der Free Tier gibt
einem Cron-Aufruf dieselben 10 ms CPU wie einer Anfrage; deshalb tut jeder
Aufruf genau **eine** Sache und merkt sich den Stand in der Datenbank
([Abschnitt 10.1](docs/spezifikation.md#101-automatik-der-cron-trigger-stufe-18)):

1. erschienene Titel freigeben (`angekuendigt → erschienen`, nur SQL)
2. einen seit über drei Stunden hängenden Sync-Lauf auf `fehler` setzen
3. läuft ein Sync, einen Schritt davon (eine Seite holen oder auswerten)
3b. Spielzeit (täglich, zwei Aufrufe) und die Kaufliste (wöchentlich, rund 15
   Aufrufe) – beide seitenweise, beide ergänzen nur und importieren nichts
4. sonst, wenn heute noch kein Cron-Lauf war und kein Handabruf erfolgreich: einen
   Sync starten – **ein Versuch je Nacht**, ein Fehler wird erst in der nächsten
   Nacht wiederholt
5. sonst IGDB-Metadaten auffrischen – 50 Spiele, deren Stand älter als sieben Tage ist
6. sonst Disc-Fassungen aus IGDB prüfen (30-Tage-Frist)

Ein voller Sync braucht bei 431 Titeln rund elf Aufrufe. Ist der Zugang
`abgelaufen`, legt der Cron gar keinen Lauf an; ein neues NPSSO in den
Einstellungen genügt, dann geht es in der nächsten Nacht von allein weiter.

Was der Cron tut, steht an vier Stellen: in den Einstellungen unter **Automatik**
(letzter automatischer Abruf **und** der Ausgang des letzten Cron-Aufrufs), im
Hinweisblock der Sammlung, wenn der Nachtlauf fehlgeschlagen ist, in
`GET /api/sync/status` als `cronAusgang` und als Zeile `cron: …` in den
Worker-Logs (Cloudflare-Dashboard → Worker → Logs) – nur Zahlen und feste Texte.
Der Eintrag in der Datenbank ist seit Stufe 18b dabei, weil Worker-Logs nur live
einsehbar sind: Ohne ihn lässt sich am Morgen nicht sagen, ob ein Schritt
scheiterte oder schlicht nichts zu tun fand.
`GET /api/sync/status` nennt `letzterAutomatischerLauf`, jeder Lauf trägt
`ausloeser` (`nutzer` oder `cron`).

Der Cron benutzt dieselben Pfade wie der Knopf „Jetzt abrufen". Ein Klick, während
nachts ein Lauf offen ist, setzt denselben Lauf fort; die Schritte vertragen das.

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
Kritikerwertungen ändern sich mit jeder Rezension; seit Stufe 18 macht das der
nächtliche Cron mit einer Frist von sieben Tagen je Spiel – der Knopf bleibt
für sofort.

**Disc-Fassungen prüfen (Stufe 14).** IGDB führt je Spiel Händlereinträge
(`external_games`) mit Medium und Plattform. Der Knopf fragt sie für 50
verknüpfte Spiele je Aufruf ab und setzt `Disc-Fassung: ja` (Quelle `igdb`)
für jedes Release, dessen Plattform ein physischer Eintrag nennt – nur von
`unbekannt` aus; ein `nein` und ein bestehendes `ja` bleiben. Geprüfte Spiele
kommen nach 30 Tagen wieder dran, weil IGDB nachträgt. Gemessen am 16.09.2026
gegen 469 verknüpfte Spiele: 226 mit physischem Eintrag, alle 2 020 Einträge
mit Plattform, 199 von 481 Releases bekommen ein `ja`. Was IGDB nicht kennt,
bleibt `unbekannt` – nie `nein`; das setzt du im Spieldetail oder in der
Lückenansicht unter „Disc-Fassung unbekannt". Details in
[Spezifikation 7.6](docs/spezifikation.md#76-igdb-abgleich-stufe-9) und
[Abschnitt 3](docs/spezifikation.md#3-datenmodell--sammlung).

```
GET  /api/igdb/status            Zähler und ob Zugangsdaten hinterlegt sind
POST /api/igdb/abgleich          ein Schritt, { weiter } solange etwas offen ist
POST /api/igdb/auffrischen       50 Spiele in einer IGDB-Anfrage
POST /api/igdb/physisch          Disc-Fassung aus external_games, 50 Spiele je Aufruf, { weiter }
GET  /api/igdb/offen             Prüfansicht mit Kandidaten
POST /api/igdb/erneut-suchen     offene Spiele zurück in den Abgleich
GET  /api/igdb/search?q=&plattformen=  Suche mit Rückfällen, auch für Import und Nachpflege
GET  /api/unmatched?abgelehnte=1 alles ohne IGDB-Eintrag (v_ohne_igdb), abgelehnte nur mit Parameter
POST /api/unmatched/plan_wunsch/:id/link  Freitext-Eintrag einem IGDB-Treffer zuordnen (auch plan_todo, plan_backlog, plan_kauf)
```

**Alte Wunschlisten** gehören als Textdateien in `wunschlisten/` (lokal,
per `.gitignore` ausgeschlossen). Sie sind am 14.09.2026 gegen Sammlung und
IGDB gemessen worden – 332 Zeilen, 20 schon in der Sammlung, 199 eindeutig,
76 mit Kandidaten, 37 ohne Treffer. Daraus ist `wunschlisten/wunschliste-bereinigt.txt`
entstanden (tabulatorgetrennt: Datum, Titel, Plattform, Status, Original,
Hinweis); der Import nimmt die rohen Jahresdateien und diese Form, siehe
[Wunschlisten-Import](#wunschlisten-import). Alles sind Wünsche, auch schon
Gespieltes – Folgerungen in
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
Symbol (ein Pokal – bewusst ohne PlayStation-Marken, das Repository ist
öffentlich) und ein Service Worker.

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
[Abschnitt 13](docs/spezifikation.md#13-frontend).

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
| **upcitemdb** | nächtlicher GitHub-Job | 100/Tag, 90 s Pause nach je 6 | Rückfall für Codes, die eBay nicht kennt |

Die eBay-Zugangsdaten (App ID und Cert ID aus einem **Production**-Keyset unter
https://developer.ebay.com/my/keys) liegen an drei voneinander getrennten Orten –
jeder Ort ist eine eigene Ablage, dieselben zwei Werte:

```bash
# 1. lokal, für `wrangler dev` – in .dev.vars, niemals ins Repository
EBAY_CLIENT_ID=…
EBAY_CLIENT_SECRET=…

# 2. für den laufenden Worker (Produktion)
npx wrangler secret put EBAY_CLIENT_ID
npx wrangler secret put EBAY_CLIENT_SECRET
```

3. Für den nächtlichen Job als **GitHub-Secrets**: Repository → Settings →
Secrets and variables → Actions → New repository secret, Namen `EBAY_CLIENT_ID`
und `EBAY_CLIENT_SECRET`.

Fehlen sie, antwortet nur `GET /api/scan/:ean/online` mit `503`; Scanner und
Anwendung laufen unverändert weiter. Beim Anlegen des Keysets verlangt eBay
einmalig eine Angabe zu „Marketplace Account Deletion" – da die Anwendung keine
eBay-Nutzerdaten speichert, ist dort die Ausnahme („Exempt") richtig.

## Ein Code, der sich nicht zuordnen lässt

Bis Stufe 17d legte der Scanner solche Codes als **offene Scans** ab, und ein
nächtlicher Job holte dazu Titel. Das ist abgeschafft: Ein Barcode ohne seine
Hülle war später nicht mehr zuzuordnen – die Liste erzeugte Arbeit statt Nutzen
(Entscheidung vom 21.09.2026, Begründung in
[Abschnitt 9.3](docs/spezifikation.md#93-warum-es-keine-offenen-scans-mehr-gibt-stufe-17d)).

Heute gilt: Der Titel kommt sofort (eBay, sonst upcitemdb), das Spiel lässt sich
im selben Fenster anlegen. Wer gerade nicht zuordnen will, drückt
**Überspringen** – gespeichert wird nichts, die Disc steht im Regal, ein
erneuter Scan holt den Code zurück.

Die Tabelle `unresolved_scan` bleibt vorerst leer bestehen; ein `DROP TABLE`
bräuchte zwei Deployments und hat keine Eile.

## Wunschliste und Absichten

Wunschliste, To-Do, Backlog und Kaufliste liegen in einer Tabelle `plan_entry`
([Abschnitt 5](docs/spezifikation.md#5-datenmodell--absichten-use-cases-4-5-6));
Stufe 10 bedient die Wunschliste, Stufe 12 To-Do und Backlog, Stufe 15 die
Kaufliste – die Routen kennen alle vier Arten:

```
GET    /api/plans?kind=wunsch|todo|backlog|kauf&status=offen|alle&sort=favorit|wertung|titel|release|angelegt|position&favorit=1&plattform=PS4,PS5,ohne&suche=
POST   /api/plans        { art, spielId | releaseId | igdbId | titel, plattform?, favorit?, notiz?, status?, herkunft? }
PATCH  /api/plans/:id    Teilmenge von { favorit, notiz, status, art, plattform }; kauf erledigt → wuenscheErledigt
PUT    /api/plans/reorder  { art, orderedIds } – To-Do-Reihenfolge
DELETE /api/plans/:id    räumt Release und Spiel ab, wenn sonst nichts daran hängt
GET    /api/backlog-candidates   { anzahl, abgelehnt, kandidaten[] }
GET    /api/purchase-candidates  { anzahl, luecken, wuensche, kandidaten[] } – aus v_kaufkandidaten
GET    /api/upcoming             { anzahl, eintraege[] } – aus v_erscheint_bald
PATCH  /api/releases/:id/play-status  { status } – nur der Status; koppelt wie PUT
```

**Kaufliste** (Stufe 15, Entscheidungen vom 16.09.2026): Ein Wunsch kommt als
**Kopie** auf die Kaufliste (`herkunft: 'wunsch'`, Favorit kommt mit) und
bleibt offen, bis der Kauf erledigt ist – das ist die eine Stelle, an der ein
Übergang kein Feld-Update ist. `v_kaufkandidaten` nennt belegte Lücken ohne
Kaufeintrag und offene Wünsche, die noch nicht kopiert wurden, und lässt
Angekündigte weg. „erledigt" am Kaufeintrag erledigt den offenen Wunsch am
selben Ziel mit (am Release und am Spiel); `verworfen` nicht. Wer eine Disc
oder eine digitale Berechtigung erfasst (`POST /api/physical-copies`,
`POST /api/digital-entitlements`), hat gekauft: Der Worker erledigt offene
Kauf- und Wunscheinträge am Release und am Spiel von selbst und nennt sie in
der Antwort (`absichtenErledigt`, dazu `aufListe`); die Oberfläche bietet
„ins Backlog übernehmen" an und öffnet die Einträge beim Rückgängig wieder.
Migration 0018 hat den Bestand einmal angeglichen; der Deploy-Job zählt
seither offene Wünsche und Käufe an Releases mit Besitz (erwartet 0).

**To-Do und Backlog sind mit der Bewertung gekoppelt** (Abschnitt 5.5,
Entscheidung vom 16.09.2026): Was auf To-Do steht, ist `am_spielen`, was im
Backlog steht, `pausiert` – nur ein nie gestartetes Spiel bleibt
`nicht_gespielt`. Jeder Schreibpfad hält beides zusammen: Listenknöpfe
setzen den Status, eine Bewertung legt den Eintrag an, hängt ihn um oder
schließt ihn (`durchgespielt`, `komplettiert`, `abgebrochen`). Der Sync
koppelt nie. Migration 0015 hat den Bestand angeglichen; der Deploy-Job
zählt seither die Abweichungen (erwartet 0).

**To-Do** ist die einzige Liste mit eigener Reihenfolge (`position`): Neues
hängt ans Ende, `PUT /api/plans/reorder` schreibt die ganze Liste neu, im
Browser per Drag-and-drop (`@dnd-kit`, auch Finger und Tastatur) oder
Pfeilknöpfen. Migration 0014 gibt den To-Do-Einträgen aus der Triage eine
Position; der Deploy-Job protokolliert, wie viele ohne Position bleiben
(erwartet 0). **Backlog-Kandidaten** sind Releases im Besitz ohne
Trophäenfortschritt, die auf keiner Liste stehen; „nicht vorgesehen" legt einen
verworfenen Backlog-Eintrag an, den die View ausblendet – die Liste bleibt so
frei von Titeln, die nie gespielt werden sollen. Wird die Bewertung eines
Releases `durchgespielt`, `komplettiert` oder `abgebrochen`, schließt der
Worker den Eintrag (Kopplung, siehe oben).

Sortiert wird bei der Abfrage aus gespeicherten Bestandteilen – Favoriten
zuerst, dann Kritikerwertung; eine Rangformel mit Gewichten gab es bis
Migration 0013 (Priorität entfernt, Entscheidung vom 15.09.2026). Die
Plattform wird mit der **neuesten** vorbelegt, die Releases oder IGDB-Eintrag
nennen (`plattform` fehlt oder `'auto'`), und ist vor dem Speichern und
später per `PATCH` änderbar; `''` heißt ausdrücklich ohne. Mit Plattform
entsteht das Release, und es zählt **nicht zur Sammlung, solange es nur den
Wunsch trägt** – ein Wunsch ist kein Besitz. Ohne Plattform bleibt ein Spiel
aus der IGDB-Suche **ohne Release**; der Filter „ohne Plattform" findet solche
Wünsche zum Nachpflegen. Im Spieldetail ist das Spiel immer sichtbar. Ein Wunsch am Spiel und einer an einem
seiner Releases sind zwei verschiedene Aussagen und blockieren sich nicht; nur
dasselbe Ziel derselben Art antwortet mit `409`.

### Wunschlisten-Import

Seit Stufe 11 unter `/import` (Werkzeug in den Einstellungen, Link auf der
Wunschliste). Eine Datei oder eingefügter Text, ein Titel pro Zeile. Erkannt
werden Jahreslisten mit Überschriften `-Januar` … `-Dezember` (auch mit
Tippfehlern), Listen mit Abschnitten `PS4` / `PS3`, die bereinigte Tabellenform
(Datum, Titel, Plattform; die übrigen Spalten werden ignoriert) und einfache
Listen. UTF-8 mit oder ohne BOM, sonst Windows-1252; das Jahr kommt aus dem
Dateinamen und ist vor dem Einlesen korrigierbar.

Der Import ist ein **Lauf in der Datenbank** (`wishlist_import*`, nicht in der
Sicherung – die Quelldateien liegen bei dir, das Ergebnis in `plan_entry`):

```
POST   /api/imports/wishlist                     { text, dateiname?, jahr? } → Lauf mit Zeilen
GET    /api/imports/wishlist[/:id][?gruppe=klar|unklar|uebersprungen|uebernommen]
POST   /api/imports/wishlist/:id/abgleich        ein Schritt, acht Zeilen, { weiter }
POST   /api/imports/wishlist/:id/uebernehmen     ein Schritt, 25 klare Zeilen
POST   /api/imports/wishlist/:id/zeilen/:z/entscheiden   { aktion: igdb|freitext|ueberspringen|zuruecknehmen }
PATCH  /api/imports/wishlist/:id/zeilen/:z       { titel } – umbenennen, neu suchen
POST   /api/imports/wishlist/:id/zeilen/:z/aufteilen     { titel: [...] }
DELETE /api/imports/wishlist/:id
```

Der Abgleich läuft in Schritten wie der IGDB-Abgleich – erst gegen die
Sammlung über den Titelschlüssel, dann gegen IGDB; das Jahr aus der Liste
entscheidet Gleichnamige („Layers of Fear" 2016 oder 2023) und wird sonst
nicht gespeichert. Jede klare Zeile bekommt die neueste Plattform des Treffers
vorgeschlagen (oder die aus dem Abschnitt der Liste), änderbar im Dropdown vor
der Übernahme; bei Zeilen zur Durchsicht steht das Dropdown an jedem Treffer. Eindeutige Treffer, Sammlungstreffer und schon angelegte
Spiele sind **ein Block mit einem Knopf**; ein digital gespieltes Spiel bleibt
ein Wunsch – „physisch besitzen wollen". Mehrdeutige und Zeilen ohne Treffer
stehen als Liste zur Einzelentscheidung: Kandidat übernehmen, anders suchen,
„Ohne IGDB-Eintrag übernehmen", umbenennen, aufteilen („Mass Effect 1+2+3"),
überspringen. Jede Entscheidung ist sofort gespeichert und überlebt ein
Neuladen; Rückgängig löscht den angelegten Wunsch wieder. Der Wunsch hängt am
Release der gewählten Plattform (entsteht bei Bedarf), ohne Plattform am
Spiel. Hängt am Ziel schon ein offener Wunsch, wird die Zeile als
„schon auf der Wunschliste" ausgelassen – ein zweiter Import derselben Datei
erzeugt keine Dubletten.

### Lücken

`/luecken` (Use Case 3, [Abschnitt 5.3](docs/spezifikation.md#53-eine-lücke-bewusst-verwerfen)):
digital gespielt, Disc-Fassung belegt, nicht im Regal – aus `v_luecken`.
„Physisch nicht gewünscht" legt einen Kaufeintrag mit `origin = 'luecke'` und
`status = 'verworfen'` an; die Lücke bleibt in den Daten und wird nur
ausgeblendet („auch verworfene zeigen"). Rückgängig und „wieder als Lücke
zeigen" löschen den Eintrag. Darunter zugeklappt „Disc-Fassung unbekannt":
dieselben Releases ohne Beleg für eine Disc, mit „Disc gibt es" / „gibt es
nicht" – beides gilt als deine Entscheidung (Quelle `manuell`) – und „physisch
nicht gewünscht", das die Frage offen lässt und das Release trotzdem ausblendet.

```
GET  /api/gaps?verworfene=1&unbekannte=1   { anzahl, verworfen, unbekannt, luecken[], moeglich[] }
POST /api/gaps/:releaseId/verwerfen        physisch nicht gewünscht; 409 bei vorhandenem Kaufeintrag
PATCH /api/releases/:id                    { discFassung: ja|nein|unbekannt, psnProductId }
```

### Ohne Zuordnung

`/ohne-zuordnung` sammelt alles ohne IGDB-Eintrag: Freitext-Einträge aus allen
vier Listen, Spiele in der IGDB-Zuordnung, noch nicht gesuchte Spiele – mit
demselben Suchfeld zum Nachziehen. Abgelehnte („gibt es bei IGDB nicht")
stehen hinter „auch abgelehnte zeigen" mit „Doch suchen".

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
Größenordnungen entfernt. Der Cron (36 Aufrufe je Nacht, einer von fünf
erlaubten Triggern je Konto) zählt als Anfragen und liest im Leerlauf rund
80 000 Zeilen je Nacht.

## Was niemals ins Repository gehört

NPSSO und PSN-Refresh-Token, IGDB/Twitch-Zugangsdaten, AWIN-Feed-URLs (sie
enthalten die Publisher-ID), API-Bearer-Token, der Cloudflare-API-Token – und
unter keinen Umständen ein Datenbank-Dump. `.dev.vars`, `.wrangler/` und `*.sql`
stehen in der `.gitignore`; `migrations/*.sql` ist davon ausgenommen, weil die
Migrationen eingecheckt sein müssen.
