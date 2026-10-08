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
| 02.10.2026 | Seine Idee „ungültiges Angebot" – gehört zu 20g | [16.2](spec/16-2-offene-stufen.md) |
| 02.10.2026 | Die fünf finalen Stufen bleiben **bewusst ohne Nummer** | [16.2](spec/16-2-offene-stufen.md) |
| 03.10.2026 | Abnahme-Befund: innerhalb der Treffergruppe gewinnt der **kürzeste** Produktname | [7.4](spec/07-4-store-preise.md) |
| 08.10.2026 | Das Spieldetail sagt schlicht „im deutschen Store nicht erhältlich" | [7.4](spec/07-4-store-preise.md) |
| 08.10.2026 | Er will grundsätzlich die **ungeschnittenen** Fassungen – die Frage ist bei „Die Sammlung finalisieren" vorgemerkt | [7.4](spec/07-4-store-preise.md), [16.2](spec/16-2-offene-stufen.md) |

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
| 15.09.2026 | Zählt ein **verworfener** Wunsch beim Wunschlisten-Import als Doppelung? | [8.2](spec/08-2-wunschlisten-import.md) |

Was in den offenen Stufen 20f und 20g noch zu entscheiden ist, steht dort:
[16.2](spec/16-2-offene-stufen.md).
