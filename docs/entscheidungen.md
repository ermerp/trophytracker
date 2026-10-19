# Entscheidungen des Nutzers

Jede Entscheidung, die in der Spezifikation mit Datum festgehalten ist, hier als
knappe Liste. Die Begründung steht im genannten Abschnitt in
[`spec/`](spec/README.md) – diese Datei ist ein Verzeichnis, keine Zweitstelle.

Diese Datei wird **nicht routinemäßig gelesen**. Wer wissen will, was gilt,
liest den Abschnitt; wer wissen will, **seit wann und warum so entschieden
wurde**, sieht hier nach.

Vier Entscheidungen kehren eine frühere um. Sie stehen unten als Paar.

| Datum | Entscheidung | Abschnitt |
|---|---|---|
| 14.09.2026 | Ein Listeneintrag hat genau **eine** Quelle; Freitext nur über einen ausdrücklichen Knopf | [5](spec/05-absichten.md) |
| 14.09.2026 | Mehrdeutige Zeilen des Wunschlisten-Imports **bleiben Wünsche** | [8.2](spec/08-2-wunschlisten-import.md) |
| 15.09.2026 | Die Plattform wird **vorgeschlagen und bleibt änderbar** (kehrt den 14.09. um) | [5](spec/05-absichten.md) |
| 15.09.2026 | Der Vorschlag steht als **konkreter Wert am Treffer**, nie als Platzhalter | [5](spec/05-absichten.md) |
| 15.09.2026 | Ein Wunsch darf eine Plattform tragen, auch ohne Besitz | [3](spec/03-sammlung.md) |
| 15.09.2026 | `DELETE /api/plans/:id` räumt ein **verwaistes** Release und Spiel mit auf | [5](spec/05-absichten.md) |
| 15.09.2026 | **Priorität (1–5) abgeschafft**, der Favorit reicht | [5.1](spec/05-1-favorit-und-sortierung.md) |
| 15.09.2026 | Mit der Priorität fällt die **Rangformel** (Migration 0013 löscht `w_*`) | [5.2](spec/05-1-favorit-und-sortierung.md) |
| 15.09.2026 | Ablauf des Wunschlisten-Imports in vier Schritten | [8.2](spec/08-2-wunschlisten-import.md) |
| 15.09.2026 | Nennt die Liste keine Plattform, ist das Ziel die **neueste** | [8.2](spec/08-2-wunschlisten-import.md) |
| 15.09.2026 | Das Datum einer Wunschlisten-Zeile wird **nicht** gespeichert | [8.2](spec/08-2-wunschlisten-import.md) |
| 15.09.2026 | Abgelehnte Spiele stehen hinter einem Umschalter, mit „Doch suchen" | [8.3](spec/08-3-metadaten.md) |
| 15.09.2026 | Die Oberfläche wird eine **eigene Stufe** (bis dahin Funktion vor Form) | [16](spec/16-1-abgeschlossene-stufen.md) |
| 16.09.2026 | **Wunsch → Kauf ist eine Kopie**, der Wunsch bleibt offen | [5](spec/05-absichten.md) |
| 16.09.2026 | **Besitz erfassen erledigt Kauf und Wunsch**, ohne Rückfrage (Anlass: Anno 117) | [5](spec/05-absichten.md) |
| 16.09.2026 | **Kopplung** von To-Do/Backlog und `play_status` | [5.5](spec/05-4-todo-und-kopplung.md) |
| 16.09.2026 | `unbekannt` bekommt in der Lückenansicht einen eigenen Block (Block B) | [5.3](spec/05-3-luecke-verwerfen.md) |
| 16.09.2026 | Dritter Knopf „physisch nicht gewünscht" **auch in Block B** | [5.3](spec/05-3-luecke-verwerfen.md) |
| 16.09.2026 | Suchfeld in der Filterleiste aller drei Listen | [5.2](spec/05-1-favorit-und-sortierung.md) |
| 16.09.2026 | **Nur PlayStation, ohne Ausnahme**: ein IGDB-Eintrag ohne Plattformangabe ist kein Treffer | [7.6](spec/07-6-igdb.md) |
| 16.09.2026 | Ein Spiel **ohne** Trophäenliste übernimmt beim Verknüpfen den IGDB-Namen | [7.6](spec/07-6-igdb.md) |
| 16.09.2026 | Der Disc-Status kommt aus IGDB, der Rest bleibt `unbekannt`; nichts von Hand je Release | [7.6](spec/07-6-igdb.md), [5.3](spec/05-3-luecke-verwerfen.md) |
| 16.09.2026 | `dlc_erweitert` hat **keinen** Statusfilter | [8.1](spec/08-1-pruefliste.md) |
| 16.09.2026 | Das **Änderungsprotokoll** ist seine Idee und wird eine eigene Stufe, vor dem Scanner | [8.5](spec/08-5-aenderungsprotokoll.md), [16](spec/16-1-abgeschlossene-stufen.md) |
| 16.09.2026 | Vier Entscheidungen zum Protokoll: Sync protokolliert nur **Erkanntes**, IGDB nur **Entscheidungen**, Aufbewahrung **unbegrenzt**, **Start bei null** | [8.5](spec/08-5-aenderungsprotokoll.md) |
| 16.09.2026 | Reihenfolge der Stufen: 19 → 20 → 21 | [16](spec/16-1-abgeschlossene-stufen.md) |
| 16.09.2026 | Eingabegeräte beim Scannen: Handy-Kamera und Laptop-Webcam, **kein** USB-Handscanner | [9.1](spec/09-barcode.md) |
| 16.09.2026 | Polyfill `barcode-detector` statt `html5-qrcode` | [9.1](spec/09-barcode.md) |
| 16.09.2026 | **Keine externe EAN-Quelle** in Stufe 17 (gemessen mit drei Codes seiner Discs) | [9.2](spec/09-barcode.md) |
| 18.09.2026 | **Nutzerdaten ändert nur der Nutzer, in der Anwendung** – nie per Skript oder API | [16](spec/16-1-abgeschlossene-stufen.md) |
| 18.09.2026 | Rückmeldung: UPC-A mit führender Null lesen, die Prüfziffer bleibt gültig | [9.1](spec/09-barcode.md) |
| 18.09.2026 | Rückmeldung: Spiel **in einem Schritt** anlegen, nicht über zwei Bildschirme | [9.2](spec/09-barcode.md) |
| 18.09.2026 | Entscheidungen zu Stufe 17b (offene Scans zuordnen) | [16](spec/16-1-abgeschlossene-stufen.md) |
| 19.09.2026 | **Ein** Nachtfenster für alles, was PSN anfasst; ein Versuch je Nacht, keine Wiederholung nach `fehler` | [10.1](spec/10-1-cron.md) |
| 19.09.2026 | Ergänzung: hängengebliebene Läufe werden abgebrochen | [10.1](spec/10-1-cron.md) |
| 19.09.2026 | Alle Leseansichten müssen offline funktionieren; eigenes Pokal-Symbol | [13](spec/13-3-gestaltung-und-pwa.md) |
| 19.09.2026 | **Keine PlayStation-Logos oder -Schriftzüge**, auch nicht angedeutet | [13](spec/13-3-gestaltung-und-pwa.md) |
| 19.09.2026 | Apostrophe werden bei der Suche übergangen | [12](spec/12-api-routen.md) |
| 21.09.2026 | Ein PSN-Titel ohne Treffer in der Sammlung wird **nicht importiert** | [3](spec/03-sammlung.md), [7.7](spec/07-7-psn-weitere-daten.md) |
| 21.09.2026 | Beim Holen gilt derselbe Entwurf wie beim Sync: begrenzte Arbeit, Fortschritt in der Datenbank | [7.7](spec/07-7-psn-weitere-daten.md) |
| 21.09.2026 | **eBay live beim Scannen** statt nachts (Stufe 17c) | [9.2](spec/09-barcode.md) |
| 21.09.2026 | **Offene Scans abschaffen** (Stufe 17d): „Ein Code ohne seine Hülle lässt sich später nicht mehr zuordnen" | [9.3](spec/09-barcode.md) |
| 22.09.2026 | Sortierung nach **Spielzeit**; Titel ohne Spielzeit ans Ende | [5.2](spec/05-1-favorit-und-sortierung.md) |
| 22.09.2026 | Rückmeldung: die **ganze Karte** ist der Anfasser, die Pfeilknöpfe fallen weg | [5.4](spec/05-4-todo-und-kopplung.md) |
| 22.09.2026 | Beim digitalen Besitz nur **zwei** Zustände: `kauf` schlägt `plus` | [7.7](spec/07-7-psn-weitere-daten.md) |
| 22.09.2026 | Die PS+-Seite ist eine **Momentaufnahme**; `kauf` wird nie entfernt | [7.7](spec/07-7-psn-weitere-daten.md) |
| 22.09.2026 | **Keine Rohablage** für Spielzeit und Kaufliste | [7.7](spec/07-7-psn-weitere-daten.md) |
| 22.09.2026 | Ein erkannter Kauf erledigt einen Wunsch nur, wenn der Wunsch „nur digital" ist | [7.7](spec/07-7-psn-weitere-daten.md) |
| 22.09.2026 | 19c ist Vorbedingung für 19b; 19b kommt **nach** der Oberfläche | [16](spec/16-1-abgeschlossene-stufen.md) |
| 22.09.2026 | Die Notiz steht nicht mehr auf der Karte, nur im Spieldetail | [13](spec/13-1-ansichten.md) |
| 23.09.2026 | Das Dashboard wird als **19a** aus Stufe 19 herausgelöst | [16](spec/16-1-abgeschlossene-stufen.md) |
| 23.09.2026 | **Nur dunkel** – ein einziger Tokensatz | [13](spec/13-3-gestaltung-und-pwa.md) |
| 23.09.2026 | Eine an PlayStation angelehnte Hausschrift **abgelehnt**, Saira stattdessen | [13](spec/13-3-gestaltung-und-pwa.md) |
| 24.09.2026 | Trophäen-Zähler über **alle** Listen, auch nicht zugeordnete | [16](spec/16-1-abgeschlossene-stufen.md) |
| 24.09.2026 | Schrift aus zehn verglichenen gewählt | [13](spec/13-3-gestaltung-und-pwa.md) |
| 24.09.2026 | Filter in **zwei Ebenen** – 23 Chips nebeneinander waren „zu lang" | [13](spec/13-3-gestaltung-und-pwa.md) |
| 24.09.2026 | App-Symbol: Pokal im Fortschrittsring, aus zehn Entwürfen | [13](spec/13-3-gestaltung-und-pwa.md) |
| 24.09.2026 | Der **Ansatz**, das Cron-Fenster zu teilen | [10.1](spec/10-1-cron.md) |
| 27.09.2026 | „Es sind **zwei Achsen**, nicht vier Listen" | [5](spec/05-absichten.md) |
| 27.09.2026 | Ein Eintrag hängt **immer an einem Release**, nie am Spiel | [5](spec/05-absichten.md) |
| 27.09.2026 | **Je Release genau eine Disc**, sonst `409` in beiden Schreibwegen | [3](spec/03-sammlung.md) |
| 27.09.2026 | **Warnung und Information sind getrennt**: Gelb nur für Stillstand, Zählendes an die Glocke | [13](spec/13-2-darstellungsregeln.md) |
| 27.09.2026 | Entscheidungen zum Spieldetail (19c), an drei Prototypen abgestimmt | [13](spec/13-1-ansichten.md) |
| 27.09.2026 | „Kartei" als zweite Gestaltungslinie **verworfen** – ein Entwurf, kein Designwechsler | [16](spec/16-1-abgeschlossene-stufen.md) |
| 27.09.2026 | **Zwei Cron-Einträge** statt einem | [10.1](spec/10-1-cron.md) |
| 27.09.2026 | Der Verlauf verdichtet **jede gleichartige Arbeit**, nicht nur den Leerlauf | [10.1](spec/10-1-cron.md) |
| 27.09.2026 | 18e fasst drei angestaute Befunde in einer Stufe | [16](spec/16-1-abgeschlossene-stufen.md) |
| 27.09.2026 | Stufe 21 ist **nicht vorziehbar** | [7.4](spec/07-4-store-preise.md) |
| 28.09.2026 | „ohne Plattform" entfällt in **allen vier** Listen | [5](spec/05-absichten.md) |
| 28.09.2026 | Je ein Test für fehlenden Schlüssel, ausdrückliches `null` und leeren Text | [5](spec/05-absichten.md) |
| 29.09.2026 | **Sonys Anmeldung wird nicht nachgebaut** – kein Passwort, kein Headless-Browser, keine Erweiterung | [7.1](spec/07-1-psn-trophaeen.md) |
| 29.09.2026 | Rückmeldung: nichts heraussuchen, der **ganze** eingefügte Text wird geprüft | [7.1](spec/07-1-psn-trophaeen.md) |
| 29.09.2026 | Seine Idee: `psn_zugang` zeichnet auf, wie lange ein Zugang **hält** | [7.1](spec/07-1-psn-trophaeen.md) |
| 01.10.2026 | Erstbefüllung **nachts plus Portionsknopf**, mit Pause und Abbruch bei `429` | [7.7](spec/07-7-einzeltrophaeen.md) |
| 01.10.2026 | **Keine Rohablage** für die Einzeltrophäen | [7.7](spec/07-7-einzeltrophaeen.md) |
| 01.10.2026 | Gruppen und Trophäen-Level in **dieselbe** Stufe | [7.7](spec/07-7-einzeltrophaeen.md) |
| 01.10.2026 | Seltenheitsstufe und Fortschrittszähler je Trophäe sind im Umfang | [7.7](spec/07-7-einzeltrophaeen.md) |
| 01.10.2026 | Welche Statistiken in den Prototyp gehen; „Seltenste erspielte Trophäe" **verworfen** | [7.7](spec/07-7-einzeltrophaeen.md) |
| 01.10.2026 | Das **Level ersetzt** den Trophäen-Block, es ergänzt ihn nicht | [7.7](spec/07-7-einzeltrophaeen.md) |
| 01.10.2026 | Die vier Stufen ohne Kacheln, auf Augenhöhe mit der Level-Zahl (vier Rückmeldungen am Prototyp) | [7.7](spec/07-7-einzeltrophaeen.md) |
| 01.10.2026 | Sein Vorschlag: „Trophäen je Jahr" **nachts rechnen und ablegen** – bewusste Ausnahme von „Berechnetes nicht speichern" | [7.7](spec/07-7-einzeltrophaeen.md) |
| 01.10.2026 | **Versteckte Trophäen sind zugedeckt, nicht weggelassen** | [13](spec/13-2-darstellungsregeln.md) |
| 01.10.2026 | Die Trophäenliste wird am **Prototyp** entschieden, vor dem Code | [13](spec/13-1-ansichten.md) |
| 01.10.2026 | `trophy` kommt in die **Sicherung** | [14.2](spec/14-backup-export.md) |
| 01.10.2026 | Eine erspielte Trophäe wird **kein** `game_event` | [8.5](spec/08-5-aenderungsprotokoll.md) |
| 01.10.2026 | Der Feed hat zwei Quellen, das Protokoll behält **eine** | [8.5](spec/08-5-aenderungsprotokoll.md) |
| 01.10.2026 | Verdichtung im Feed je Spiel und Tag, **Platin für sich** | [8.5](spec/08-5-aenderungsprotokoll.md) |
| 01.10.2026 | Breite am Desktop: **80 rem** | [13](spec/13-3-gestaltung-und-pwa.md) |
| 01.10.2026 | **Der Feed bleibt, wie er ist** – drei Eingriffe verworfen | [7.7](spec/07-7-einzeltrophaeen.md) |
| 01.10.2026 | Rückmeldung: der Fortschritt zählt den **Bestand**, nicht den Druck | [7.7](spec/07-7-einzeltrophaeen.md) |
| 01.10.2026 | Sein Hinweis auf die Zeilenlese-Grenze (4,16 von 5 Mio.) | [7.7](spec/07-7-einzeltrophaeen.md) |
| 02.10.2026 | **Händlerpreis zuerst**, sonst der günstigste geprüfte Markttreffer | [7.3](spec/07-3-ebay.md) |
| 02.10.2026 | Skalierte Wortgrenze: „lieber kein Vorschlag als ein falscher" | [7.3](spec/07-3-ebay.md) |
| 02.10.2026 | Gebrauchtpreise werden **täglich** geholt | [7.3](spec/07-3-ebay.md) |
| 02.10.2026 | Rückmeldung: das native `<select>` wird ein gemeinsames Sortier-Bedienelement | [5.2](spec/05-1-favorit-und-sortierung.md), [7.3](spec/07-3-ebay.md) |
| 02.10.2026 | **Block B hat nur noch zwei Knöpfe** | [5.3](spec/05-3-luecke-verwerfen.md) |
| 02.10.2026 | Releases mit digitaler Berechtigung `source='kauf'` sind vom Store-Preis **ausgenommen** (`plus` schließt nicht aus) | [7.4](spec/07-4-store-preise.md) |
| 02.10.2026 | **Nicht nach dem Store-Preis sortieren** – zwei Preissortierungen passen bei 360 px nicht | [7.4](spec/07-4-store-preise.md) |
| 02.10.2026 | Vier Wünsche zu Stufe 20e | [16](spec/16-1-abgeschlossene-stufen.md) |
| 02.10.2026 | Seine Idee „ungültiges Angebot" – wurde Teilstufe 20h, abgenommen am 11.10.2026 | [6](spec/06-marktdaten.md), [7.3](spec/07-3-ebay.md) |
| 02.10.2026 | Die fünf finalen Stufen bleiben **bewusst ohne Nummer** | [16.4](spec/16-4-finale-stufen.md) |
| 03.10.2026 | Abnahme-Befund: innerhalb der Treffergruppe gewinnt der **kürzeste** Produktname | [7.4](spec/07-4-store-preise.md) |
| 08.10.2026 | Das Spieldetail sagt schlicht „im deutschen Store nicht erhältlich" | [7.4](spec/07-4-store-preise.md) |
| 08.10.2026 | Er will grundsätzlich die **ungeschnittenen** Fassungen – die Frage ist bei „Die Sammlung finalisieren" vorgemerkt | [7.4](spec/07-4-store-preise.md), [16.4](spec/16-4-finale-stufen.md) |
| 08.10.2026 | Die Dokumentation wird aufgeteilt, und **keine regelmäßig gelesene Datei geht über rund 15 KB** – Abschnitt 7, 8, 13 und 16 deshalb je Unterabschnitt | [CLAUDE.md](../CLAUDE.md) |
| 08.10.2026 | Der Versionsabsatz wird auf **eine Zeile je Version** verdichtet – aber erst, nachdem je Eintrag geprüft ist, ob seine Messwerte im zugehörigen Abschnitt stehen | [changelog.md](changelog.md) |
| 09.10.2026 | Beim Wunschlisten-Import blockieren **nur offene** Wünsche; ein verworfener zählt nicht als Doppelung (`verworfen` trüge sonst zwei Bedeutungen, und für „nie wieder" gibt es „entfernen") | [8.2](spec/08-2-wunschlisten-import.md) |

## Umkehrungen

Vier Entscheidungen haben eine frühere aufgehoben. Beide Daten gehören
zusammen, weil die zweite ohne die erste nicht zu verstehen ist.

| zuerst | dann | worum es geht |
|---|---|---|
| 14.09.2026: die Plattform wird gesetzt | **15.09.2026**: sie wird vorgeschlagen und bleibt änderbar | ein Vorschlag mit Korrekturmöglichkeit, kein stiller Standardwert ([5](spec/05-absichten.md)) |
| 15.09.2026: „ohne Plattform" bleibt wählbar | **27./28.09.2026**: ein Wunsch hängt immer an einem Release | erst die Plattform entscheidet über Lücke, Kauf und Preis ([5](spec/05-absichten.md)) |
| 16.09.2026: dritter Knopf auch in Block B | **02.10.2026**: Block B hat zwei Knöpfe | in Block B steht eine einzige Frage; die Absicht entscheidet sich danach ([5.3](spec/05-3-luecke-verwerfen.md)) |
| bis Version 30: fehlende Plattformangabe ist kein Gegenbeweis | **16.09.2026**: ohne nachgewiesene Plattform kein Treffer | ein PC-Eintrag war als PS4-Wunsch durchgekommen ([7.6](spec/07-6-igdb.md)) |

## Offen

Eine Frage ist gestellt und **nicht** entschieden. Sie bleibt hier stehen,
damit sie nicht stillschweigend geschlossen wird.

| Datum | Frage | Abschnitt |
|---|---|---|
| 09.10.2026 | Soll der Wunschlisten-Import **Besitz** prüfen? Ein erledigter Wunsch blockiert nicht, eine alte Liste legt ihn also neu an – zu entscheiden bei „Die Sammlung finalisieren" | [8.2](spec/08-2-wunschlisten-import.md) |

Beantwortet am 09.10.2026: ob ein **verworfener** Wunsch als Doppelung zählt (Frage vom
15.09.2026) – nein, siehe die Liste oben.

**09.10.2026, Refactoring (finale Stufe 3), vier Entscheidungen zur Ablage** – alle im Vorfeld
gestellt, weil sie die Gestalt des Repositories festlegen (13.3, 16.2):

- **Die Detailansicht wandert vollständig** nach `frontend/src/spieldetail/`, Einstieg
  eingeschlossen. Die Alternative – Einstieg bleibt oben, nur die Teile wandern – hätte `App.tsx`
  unberührt gelassen, aber den Ordner halb gemacht.
- **Die Kaskade von `App.css` bleibt unangetastet:** nur lückenlose Ausschnitte, keine
  Verschiebung, auch um den Preis, dass zwei Ansichten zwei Dateien tragen. Verschiebungen wären
  mit Nachweis erlaubt gewesen; der Nutzer hat den beweisbaren Weg gewählt.
- **`.leise` bleibt**, obwohl ungenutzt: gewolltes Paar mit `.still` aus Stufe 19c.
- **Testreporter `dot`** – nach der Messung zurückgenommen und vom Nutzer **bestätigt**
  („Reporter bleibt ungesetzt, deine Messung gilt"): `dot` ergab 209 statt 71 Zeilen, weil es in
  einer Pipe je Datei eine Zeile schreibt und zusätzlich die Messwerte druckt. Knapp wird die
  Ausgabe stattdessen über `WRANGLER_LOG=error` (13 Zeilen). Die ursprüngliche Wahl stand auf
  einer geschätzten Zahl von mir; der Vorfall steht in [`lehren.md`](lehren.md).

**09.10.2026, Nachtrag c zum Refactoring, drei Entscheidungen zur Typprüfung** (15.1, 16.2):

- **Die Env-Geheimnisse stehen von Hand und optional in `src/env.d.ts`**, die Bindings werden als
  `CfBindings` erzeugt. Zur Wahl stand auch, `.dev.vars.example` in der Action als `--env-file`
  einzuhängen – kleinerer Eingriff, aber die Prüfung hätte den falschen Typ `NPSSO_KEY: string`
  bestätigt. Ausschlaggebend war die vor der Frage gemessene Zahl: Derselbe ungeprüfte
  Secret-Zugriff fällt gegen die optionale Typisierung auf und gegen die erzeugte nicht.
- **In zwei Schritten**, Mechanik getrennt von den Testkorrekturen – gleiche Endlage, aber die
  Historie trennt beides.
- **Ein reparierter Test wird nachgewiesen:** Der Nutzer hat verlangt, den wirkungslosen Leck-Test
  nach der Korrektur gegen eine absichtlich undichte Stelle laufen zu lassen (er muss rot werden,
  dann zurückbauen) und zu datieren, seit wann er grün war, ohne zu prüfen. Daraus ist die
  geschärfte Belegregel in CLAUDE.md geworden; der Vorfall steht in [`lehren.md`](lehren.md).
  **Ein PR nur zum Vorführen des Riegels war nicht nötig** – die Action zeigt den Schritt als
  gelaufen, der Fehlschlag ist lokal belegt.

**09.10.2026, Reihenfolge und Altbestand** (16.2):

- **20f und 20g kommen als Nächstes**, danach die finalen Stufen 1, 2, 4, 5 in ihrer geplanten
  Reihenfolge. Stufe 3 (Refactoring) ist abgetragen.
- **Die zwölf Zeilen in `unresolved_scan` sind Material, keine Altlast.** In Stufe 1 werden sie
  lesend aufgelistet (`ean`, `title_raw`), nur im Chat; der Nutzer prüft sie gegen die Sammlung.
  Erst danach und **vor Stufe 4** fällt die Tabelle, in zwei Deployments.
- **Die Basisadresse steht in der README einmal als `BASIS`-Variable**, die Beispiele benutzen
  `$BASIS` – kopierfertig für den Nutzer, eindeutig für andere. Löst die Platzhalter
  `<subdomain>` ab.

**09.10.2026, Preisverlauf und Preisalarm** (16.2, 16.3) – entschieden auf der Messung von
sechs vollständigen Tagen im täglichen Takt:

- **Reihenfolge: Angebotskorrektur zuerst**, als eigene Teilstufe **20h**, dann 20f
  (Preisverlauf), dann 20g (Preisalarm). Grund: Jeder Tag ohne Korrektur schreibt 157 Punkte
  ohne Angebotskennung, und 13 % der Markttreffer sind Kandidaten für ein untaugliches
  Angebot.
- **Verdichtung des Preisverlaufs nur beim Lesen.** Der Bestand bleibt vollständig
  (7,3 MB im Jahr); die Leseroute liefert je Reihe höchstens rund 120 Punkte. Die Frage nach
  einer Verdichtung beim Schreiben wird **im Januar 2027 neu aufgerufen** – sie ist jederzeit
  nachholbar, und sie wäre die einzige der drei Varianten, die Daten unumkehrbar vernichtet.
- **Die Angebotskennung kommt in beide Tabellen**, `market_offer` und `price_snapshot`. Nur
  dann lässt sich genau der Punkt streichen, der von einem verworfenen Angebot stammt: In 9 %
  der Reihen kommt derselbe Preis mehrfach vor.
- **Der Alarm ist absolut und kanalgebunden**, dazu ein **Allzeittief-Alarm** mit
  Mindesthistorie. Der Kanal folgt der Absicht: Disc-Fassung `ja` → Gebrauchtpreis, `nein`
  oder „physisch nicht gewünscht" → Store-Preis, `unbekannt` → beide anzeigen, nicht
  alarmieren. **Die relative Regel (20 % unter dem 30-Tage-Median) bleibt ausdrücklich
  offen** als späterer Nachtrag.

Was in 20f und 20g noch offen ist, steht dort: [16.2](spec/16-2-offene-stufen.md).

## Stufe 20h, 11.10.2026 – zwei Entscheidungen zur Angebotskorrektur

| Datum | Entscheidung | Abschnitt |
|---|---|---|
| 11.10.2026 | **Die Rücknahme steht im Punktmenü aller vier Ansichten**, nicht als Zusatzzeile nur im Spieldetail (so der Bauplan). Das Menü gibt es überall schon; eine fünfte Angabe in einer Zeile, die auf 360 px voll ist, hätte es nicht gegeben | [7.3](spec/07-3-ebay.md) |
| 11.10.2026 | **Ein loser Datenträger wird automatisch übergangen – aber nur beim Preis.** Nicht in `KEIN_DATENTRAEGER` aufnehmen: Das hätte auch den Disc-Nachweis gekostet, und eine lose Disc belegt die Disc-Fassung besonders gut. Stattdessen zwei Antworten aus `guenstigstesGeprueft` | [7.3](spec/07-3-ebay.md) |
| 11.10.2026 | **Die Sperrliste trägt `titel` und `preis_cents` mit.** Ohne sie könnte die Rücknahme nur eine Zahl nennen – die eBay-Kennung allein ist nicht lesbar, und „zurücknehmen", ohne zu sagen, was zurückkommt, ist keine Korrektur | [6](spec/06-marktdaten.md) |

## Stufe 20f, 11.10.2026 – vier Entscheidungen zum Preisverlauf

| Datum | Entscheidung | Abschnitt |
|---|---|---|
| 11.10.2026 | **Inline-SVG statt einer Diagramm-Bibliothek.** Der Umfang ist klein (drei Reihen, nach einem Jahr rund 130 Punkte, kein Zoom), und eine Canvas-Bibliothek kennt keine CSS-Variablen – die Tokenfarben müssten über `getComputedStyle` ausgelesen werden | [6](spec/06-marktdaten.md) |
| 11.10.2026 | **Die Reihen werden als Treppe gezeichnet, nicht als Linie von Punkt zu Punkt.** Geschrieben wird nur bei Änderung; dazwischen gilt der alte Preis weiter, und die letzte Stufe läuft bis heute | [6](spec/06-marktdaten.md) |
| 11.10.2026 | **Antippen zeigt Preis und Datum** – auf dem Handy gibt es kein Hover. Der Wert steht in einer festen Zeile über dem Diagramm, nicht in einer schwebenden Tafel. **Gewählt wird die nächstliegende Kurve, nicht ein Punkt** (nachgeschärft am selben Tag): Ein Punkt ist 3,5 px breit, und ein Trefferfeld je Stufe verdeckt die dichtere von zwei Reihen | [13.1](spec/13-1-ansichten.md) |
| 11.10.2026 | **Farbsatz ohne Gold** (Händler hellblau, Markt grün, Store violett). Gold ist der einzige Akzent und gehört Favoritenstern, 100 % und Platin – nicht einer Preisreihe | [13.3](spec/13-3-gestaltung-und-pwa.md) |

## Stufe 20g, 11.10.2026 – drei Entscheidungen zum Preisalarm

Getroffen, bevor 20g gebaut wird; sie schließen die drei Fragen, die [16.2](spec/16-2-offene-stufen.md) seit dem 09.10.2026 offen führte.

| Datum | Entscheidung | Abschnitt |
|---|---|---|
| 11.10.2026 | **`unbekannt` ohne Gebrauchtreihe fällt in den Store-Zweig**, und zwar **zur Lesezeit** bestimmt: Sobald eine Gebrauchtreihe besteht oder die Disc-Fassung `ja` ist, gilt der Gebrauchtzweig. So alarmiert ein Eintrag auf dem einzigen Kanal, den er hat, und wechselt von selbst mit – ohne gespeicherte Zuordnung, die veralten könnte | [16.2](spec/16-2-offene-stufen.md) |
| 11.10.2026 | **Meldungen werden durch Antippen quittiert. Keine Sperrfrist, sondern höchstens eine offene Meldung je Reihe:** Ein tieferes Tief aktualisiert die offene Meldung, statt eine neue anzulegen. Die absolute Schwelle meldet beim Unterschreiten und wird erst wieder scharf, wenn der Preis darüber zurückgeht | [16.2](spec/16-2-offene-stufen.md) |
| 11.10.2026 | **Stammt ein gemeldetes Tief aus einem später verworfenen Angebot (20h), entfällt die Meldung** – und der danach tiefste Punkt löst **keine** neue aus: Er stand schon da, als verworfen wurde, und eine Korrektur soll nichts Neues melden | [16.2](spec/16-2-offene-stufen.md) |

## Stufe 18g und die CPU-Grenze, 16.10.2026

| Datum | Entscheidung | Abschnitt |
|---|---|---|
| 16.10.2026 | **Kein Bezahlplan, die Anwendung bleibt auf dem Free Tier** – auch nachdem gemessen ist, dass kein Cron-Schritt unter 10 ms CPU bleibt | [10.1](spec/10-1-cron.md) |
| 16.10.2026 | **Die Marke „begonnen" wird unabhängig von der Ursache gebaut:** Sie ändert kein Verhalten, sie macht nur sichtbar, was spurlos verschwindet. **Verwaist ab zwei Minuten** – der nächste reguläre Aufruf kommt nach fünf Minuten und muss sie sicher erkennen, die doppelte Auslösung lag eine Minute auseinander | [10.1](spec/10-1-cron-verlauf.md) |
| 16.10.2026 | **`offen` in der Marktzeile zählt nur Releases der Auswahl** (gebaut als „in der Auswahl fällig", weil „in der Auswahl ungestempelt" dauerhaft 0 wäre) | [10.1](spec/10-1-cron-schritte.md) |
| 16.10.2026 | **Erst messen, dann über eine Verlagerung in GitHub Actions entscheiden:** Leerlauf, kleinste Arbeitseinheit je Schritt, Cron je Minute. Gemessen wird in einem **eigenen Worker ohne D1 und ohne Secrets**, nicht als Vorschau-Version des Produktions-Workers (die hätte alle Routen, die Produktions-D1 und alle Secrets, und ob Access die Vorschau-Adressen schützt, ist nicht sicher); Code auf eigenem Branch, der Worker wird danach gelöscht | [16.2](spec/16-2-offene-stufen.md) |
| 16.10.2026 | **Bestätigt sich der Abgleich als Ursache, richtet sich die Behebung an „Abgleiche bereiten den Bestand einmal vor" aus** – Index einmal je Aufruf statt jedes Angebot gegen alle Spiele –, in einem eigenen Nachtrag | [16.2](spec/16-2-offene-stufen.md) |
| 16.10.2026 | **Für den Nachweis des D1-Anteils eine Wegwerf-D1** – leer, nur nachgebaute Zeilen, danach gelöscht und bestätigt –, gemessen auch über die Größe der Ergebnisse (1, 100, 1 000 Zeilen), um Kosten je Aufruf und je Zeile zu trennen | [10.1](spec/10-1-cron.md) |
| 16.10.2026 | **Bevor der Marktschritt als Kandidat für GitHub Actions gilt, wird geprüft, ob sich die vorbereitete Sammlung auf Modulebene halten lässt** (Ergebnis: keine warme Instanz, 0 von 28) | [16.2](spec/16-2-offene-stufen.md) |
| 16.10.2026 | **Die Token-Erneuerung im PSN-Leerlauf wird ein eigener kleiner Nachtrag**, unabhängig vom Rest | [16.2](spec/16-2-offene-stufen.md) |
| 16.10.2026 | **Die Messzahlen kommen erst in die Spezifikation, wenn der D1-Anteil belegt ist** | [10.1](spec/10-1-cron.md) |
| 16.10.2026 | **Reihenfolge und Zuschnitt der CPU-Nachträge:** 18i Token im Leerlauf → 18j Ablauf (Lese- und Schreib-Batch je Cron-Aufruf, gemessen am Leerlauf) → 18k Spielzeit mit `IN`-Listen und 18l Store-Leser (ein Release je Aufruf) → nachmessen → 20i Markt (Titel einmal zerlegen, D1 bündeln). **Jeder Punkt ein eigener Nachtrag**, damit jeder einzeln zurücknehmbar und seine Wirkung einzeln belegt ist; zwischen 18j und 18k/18l eine Nacht | [16.2](spec/16-2-offene-stufen.md) |
| 16.10.2026 | **Bündeln ist das Grundmuster aller Cron-Schritte, als Regel in CLAUDE.md – als Rangfolge, nicht absolut:** gleichartige Abfragen zusammenfassen, unabhängige in einen Batch, nacheinander nur Abhängiges; ein Lese- und ein Schreib-Batch je Aufruf als Ziel, ein Schreib-Batch nur mit dem, was gemeinsam gelingen oder scheitern soll. Budget Median um 5 ms, P99 unter 10 ms | CLAUDE.md, [10.1](spec/10-1-cron.md) |
| 16.10.2026 | **Zwischen Wortindex-Zeile, Cron je Minute und GitHub Actions für den Marktschritt wird erst mit den Zahlen aus 20i entschieden** | [16.2](spec/16-2-offene-stufen.md) |
| 17.10.2026 | **Die Marke „begonnen" wird eine Zeile je Aufruf**, gelesen über einen Schlüsselbereich statt `LIKE`; Marken älter als einen Tag werden **gemeldet, nicht still entfernt**, und über 200 kappt der Lage-Batch mit `gekappt=ja` in der nächsten Meldung | [10.1](spec/10-1-cron-verlauf.md) |
| 17.10.2026 | **Aufräumen der Rohantworten wird eine Daueraufgabe** im Lage-Batch jedes Wartungsaufrufs; `geloescht=` steht nur an der Zeile, wenn etwas gelöscht wurde | [10.1](spec/10-1-cron-schritte.md) |
| 17.10.2026 | **Der Lage-Batch ist eine Transaktion mit Schreibzugriffen:** Reihenfolge festgelegt und im Code begründet, und benannt, was beim Scheitern einer Anweisung geschieht (alles zurück, „cron: abgebrochen", die ganze Automatik steht) | [10.1](spec/10-1-cron.md) |
| 17.10.2026 | **Die Portionsknöpfe bekommen ihre Auswahl aus denselben Bausteinen wie der Cron** – keine zweite Fassung einer Abfrage (die Lehre aus 18e) | [10.1](spec/10-1-cron.md) |
| 17.10.2026 | **`naechsteZumFuellen` ohne `OR`**, gemessen mit eingerichtetem Zugang; dafür eine Migration in 18j | [10.1](spec/10-1-cron-schritte.md) |
| 17.10.2026 | **Der Cron schreibt Fakten (`cron_stand`) schon in 18j, ohne Anzeige** – die Betriebswarnungen fassen den Cron dann nicht mehr an | [10.1](spec/10-1-cron-verlauf.md) |
| 17.10.2026 | **Der Standort des Crons wird nur dokumentiert**; ob er sich festlegen lässt, wird nach 18j bis 18l recherchiert | [16.2](spec/16-2-cpu-und-betrieb.md) |
| 17.10.2026 | **Für 20i vorgemerkt: Marktfrist kürzer als 24 Stunden** (Vorschlag 20), damit Releases nicht täglich hinter das Fenster rutschen | [16.2](spec/16-2-cpu-und-betrieb.md) |
| 17.10.2026 | **Betriebswarnungen in der App als nächste Stufe nach 18j**, vor 20g; Plan erst nach dem Deploy von 18j; gemeinsam mit dem Preisalarm in der Glocke, optisch getrennt | [16.2](spec/16-2-cpu-und-betrieb.md) |
| 17.10.2026 | **Die Nachtläufe sollen spätestens um 05:00 UTC fertig sein** – eigener Nachtrag nach 20i, mit zwei Prüffragen (UTC-Datum, Kapazität) | [16.2](spec/16-2-cpu-und-betrieb.md) |
| 18.10.2026 | **Betriebswarnungen als Stufe 18m**, eine Route für alle Warnungen; die drei bestehenden (Zugang, Nachtlauf, Sicherung) ziehen mit um | [16.2](spec/16-2-cpu-und-betrieb.md) |
| 18.10.2026 | **Schwellen der Betriebswarnungen:** 26 h ohne Ausgang rot; NPSSO 14 Tage vorher „zur Kenntnis", 3 Tage vorher rot, Text „läuft laut Sony am … ab" | [16.2](spec/16-2-cpu-und-betrieb.md) |
| 18.10.2026 | **Ein gescheiterter Nacht-Sync ist „zur Kenntnis", zwei Nächte hintereinander rot** – bis 18m stand schon einer im gelben Block. Scheitert er am abgelaufenen oder ungültigen Zugang, ist das **sofort rot** über die Regel „Zugang abgelaufen", unabhängig von der Zahl der Nächte | [16.2](spec/16-2-cpu-und-betrieb.md) |
| 18.10.2026 | **Kurze Fehler zeigt 18m nicht;** der Zähler „Fehler in dieser Nacht" je Bereich kommt als eigener Nachtrag 18m-b (Reset beim ersten Aufruf eines neuen UTC-Tags), nicht in 18k | [16.2](spec/16-2-cpu-und-betrieb.md) |
| 18.10.2026 | **Der Bestand der Lesekosten-Messung kommt auf Produktionsgröße, spätestens in 20i** | [16.2](spec/16-2-cpu-und-betrieb.md) |
| 18.10.2026 | **Am Prototyp von 18m:** „zur Kenntnis" still (grau, keine neue Farbe); die Glocke zählt die höchste Stufe; der Block auf der Seite trägt nur Rot | [16.2](spec/16-2-cpu-und-betrieb.md) |
| 18.10.2026 | **Der Preisalarm (20g) bekommt einen eigenen Ton, nicht Gold** – Gold liegt zu nah am Warn-Gelb, ein Preisalarm ist eine gute Nachricht; ein Grün aus den Tokens im 20g-Prototyp prüfen | [16.2](spec/16-2-offene-stufen.md) |
| 18.10.2026 | **Der Index-Nachtrag für die drei Auswahlen des Lage-Batches kommt vor die Entscheidung „Cron je Minute"**, spätestens mit 20i | [16.2](spec/16-2-cpu-und-betrieb.md) |
| 18.10.2026 | **Das Zugangsende ist das frühere von Sonys Ankündigung und „eingetragen + kürzeste gemessene Lebensdauer"**; die Vorläufe 14 (zur Kenntnis) und 3 Tage (rot) bleiben, die Einstellungen rechnen dasselbe. Ersetzt die feste 18-Tage-Schwelle aus 19e und die zuvor beschlossene Rechnung nach Sonys Datum | [7.1](spec/07-1-psn-trophaeen.md) |
| 18.10.2026 | **18l ohne „ein Release je Aufruf": Die Store-Portion bleibt bei zehn** und wird zusammen mit „Cron je Minute" entschieden – mit einem Release je Aufruf bekämen nur ~22 von 79 Releases je Nacht einen frischen Preis. Aus der Nacht zum 19.10. wird die CPU je Store-Release abgeleitet und daraus, wie viele ins Budget von ~5 ms passen | [16.2](spec/16-2-cpu-und-betrieb.md) |
| 18.10.2026 | **Das NPSSO wird bewusst erst ab dem 21.10. erneuert**, um die Zugangswarnung in beiden Stufen zu beobachten (zur Kenntnis bis 20.10., rot ab 21.10.) | [7.1](spec/07-1-psn-trophaeen.md) |
| 18.10.2026 | **Die Erinnerung „Projektstand" hält nur Sitzungsstand, der in wenigen Tagen erledigt ist**; Dauerhaftes steht in 16.2, `/wrapup` streicht Erledigtes | CLAUDE.md, Session-Abschluss |
| 18.10.2026 | **`/catchup` liest die ersten fünf Tabellenzeilen des Changelogs** und aus 16.2 nur die nächste Stufe und die offenen Punkte | CLAUDE.md, Session-Start |
| 19.10.2026 | **Das Zugangsende zählt Kalendertage in Ortszeit (Europe/Berlin)**, nicht abgerundete 24-Stunden-Spannen: rot ab 21.10. wie geplant, am 19.10. „in 5 Tagen" | [7.1](spec/07-1-psn-trophaeen.md) |
| 19.10.2026 | **Die kürzere Frist aus 20i gilt für Markt und Store** – beide wandern sonst täglich hinter das Fenster | [16.2](spec/16-2-cpu-und-betrieb.md) |
