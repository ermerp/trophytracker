← [Inhaltsverzeichnis](README.md)

## 7.7 PSN jenseits der Trophäen – Einzeltrophäen: Bau und Anzeige (Stufe 19b)

Fortsetzung von [7.7 – Einzeltrophäen](07-7-einzeltrophaeen.md) (Messung, Statistiken, Dashboard-Block).

### Wie es gebaut ist

**Zwei Tabellen, beide `WITHOUT ROWID`** (Migration 0027; Schema in [4.1b](04-fortschritt.md)).
`trophy` trägt Definition und eigenen Stand je Trophäe, `trophy_group` die Gruppen der rund 18 %
Listen, die welche haben. `WITHOUT ROWID` ist die Antwort auf die Schreibgrenze: Eine normale
Tabelle mit demselben Primärschlüssel schriebe zwei Zeilen je Trophäe, hier liegt die Zeile **im**
Schlüssel. Derselbe Schlüssel beginnt mit `np_communication_id` und ist damit zugleich der Index
für „die Trophäen eines Spiels" – gemessen **91 gelesene Zeilen** statt eines Scans über 18 490.

**Zwei Stempel an `trophy_progress`**, und sie sind der Grund, warum sich der Füllschritt nicht im
Kreis dreht. `trophies_synced_at` hält den **Versuch**, nicht den Erfolg: Eine Liste, die PSN nicht
mehr kennt (404 bei einem delisteten Titel), bliebe sonst für immer die nächste.
`trophies_synced_sum` hält die Summe aller acht Zähler zum Abrufzeitpunkt; weicht sie ab, hat sich
an der Liste etwas geändert, und nur dann wird neu geholt. Das ist „danach nur bei Änderung" ohne
Absprache mit der Änderungserkennung aus Stufe 13 und ohne zweite Abfrage – beide Werte stehen in
derselben Zeile.

**Zwei Routen** (Abschnitt 12): `POST /api/sync/trophaeen` holt eine Portion von **vier** Listen,
`GET /api/sync/trophaeen` sagt, wie weit es ist. Die Vier kommt aus der **Dauer**, nicht aus der
Anfragengrenze: Vier Listen sind rund neun Abrufe und drei Sekunden und überstehen damit eine
Mobilfunkverbindung. Das sind 108 Anfragen für den ganzen Bestand statt 31 – nicht die Obergrenze
entscheidet, sondern die Dauer ([lehren.md](../lehren.md)). Jede Portion trägt
`AbortSignal.timeout(30 s)`, liegt in einem eigenen `try`, wird bei einem Netzfehler einmal
wiederholt und danach benannt; `wakeLock` hält den Bildschirm wach, solange der Durchlauf läuft.
**Der Ausgang wird aufgeschrieben, nicht nur zurückgegeben:** Zahl, Zeitpunkt und Grund liegen in
`app_setting`, der Block nennt sie („Zuletzt angehalten (1.10.2026, 21:40): Trophäenabruf antwortete
mit 429"), und sie überleben ein Neuladen. Der Fortschritt zählt den **Bestand**; was der aktuelle
Druck geholt hat, steht als eigene Zahl daneben.

**Gemessen in `test/lesekosten.spec.ts`** gegen 430 Listen mit 18 490 Trophäen, Lese- **und**
Schreibseite:

| | Zeilen | |
|---|---|---|
| Trophäen eines Spiels | **91** | Bereich im Primärschlüssel, kein Scan |
| Auswahl des Füllschritts, etwas offen | **1** | findet die erste offene Liste sofort |
| Auswahl des Füllschritts, **nichts offen** | **430** | der Dauerbetrieb – 15 480 je Nacht |
| Feed, 30-Tage-Fenster | **180** | über den Teilindex, nicht über den Bestand |

Die dritte Zeile ist die, auf die es ankommt: Sie läuft 36-mal je Nacht, während die zweite nur
während der Erstbefüllung auftritt. Nur den günstigen Fall zu messen wäre derselbe Fehler wie „nur
den Leerlauf zählen" (10.1).

**Zwei Regeln, die beim Bauen entstanden sind** (Hergang in [lehren.md](../lehren.md)):

- Der Vollexport sortiert nach dem Primärschlüssel, wo einer eingetragen ist (`EXPORT_ORDNUNG`,
  `src/db/export.ts`) – eine `WITHOUT ROWID`-Tabelle hat kein `rowid`.
- `scripts/sicherung-pruefen.sh` fragt zuerst `sqlite_master`, nennt fehlende Tabellen im Log und
  überspringt sie. Es läuft im Deploy-Job **vor** der Migration, kann eine neu angelegte Tabelle
  dort also noch nicht finden.

### Die Anzeige

**Die Trophäenliste hängt am Release, nicht am Spiel.** Sonys Liste hängt am Titel, und ein Spiel
mit PS4- und PS5-Fassung hat zwei davon mit eigenem Fortschritt; sie zusammenzuwerfen ergäbe einen
Zähler, den es nirgends gibt. `GET /api/releases/:id/trophaeen` liefert sie, und die Oberfläche holt
sie **erst beim Aufklappen** – eine Liste sind 91 gelesene Zeilen. Gestaltung der Liste: siehe
[13](13-2-darstellungsregeln.md), am Prototyp entschieden.

**Über die zwei Spalten entscheidet die Breite der Liste, nicht die des Fensters**
(`container-type: inline-size`, ab 38 rem). Eine Medienabfrage wäre hier falsch: Die Liste steht in
der Release-Karte und ist bei 1280 px Fenster nur rund 470 px breit – `@media (min-width: 48rem)`
griff trotzdem, jede Spalte bekam 230 px, und „Schließe die Einführung ab." stand auf zwei Zeilen.

**Eine versteckte Trophäe, die man hat, ist kein Geheimnis mehr.** Zugedeckt bleibt nur, was
versteckt **und noch nicht erspielt** ist; der Schieberegler erscheint nur, wenn es überhaupt etwas
zuzudecken gibt. Die Überschrift steht über den Trophäenzeichen und nennt die Zahl direkt
(„Trophäen – 11 von 49", mit dem Winkel zum Aufklappen).

**Der Dashboard-Feed liest seine zwei Quellen über `GET /api/feed`.** Das Änderungsprotokoll behält
`/api/events` und sein Keyset; der Feed mischt zur Lesezeit und zeigt acht Zeilen. Den Satz bildet
der Worker (`beschreibeFeedTrophaeen`), nicht die Oberfläche. **Bronze wird nie genannt:** Es ist
die Grundmenge, und „12 Trophäen, davon 1 Gold und 11 Bronze" sagt dasselbe zweimal. Besteht eine
Zeile nur aus einer Stufe, heißt sie direkt so.

**Der Feed bleibt, wie er ist** (Entscheidung des Nutzers vom 01.10.2026): Dass Sync- und
IGDB-Zeilen die Trophäen verdrängen, ist eine Folge des Aufbaus der Sammlung – „irgendwann steht die
Sammlung und es wird ruhiger". Die drei vorgeschlagenen Eingriffe (feste Plätze,
Maschinenereignisse ausblenden, mehr Zeilen) sind **verworfen, nicht vergessen**.

**„Trophäen je Jahr" wird nachts einmal gerechnet und abgelegt** (Vorschlag des Nutzers vom
01.10.2026). Die Auswertung muss jede erspielte Trophäe ansehen: **18 060 gelesene Zeilen** bei 430
Listen, gegen 6 840 für das ganze übrige Dashboard, und ein Indexhinweis
(`INDEXED BY idx_trophy_erspielt`) ändert daran **nichts** – ebenfalls gemessen. Mit dem nächtlichen
Zwischenspeicher sind es **535 statt 18 060**, und damit steht der Block offen statt hinter einem
Klick. **Das ist eine bewusste Ausnahme von „Berechnetes nicht speichern" (5.2):** Gespeichert wird
kein Rang und keine Sortierung – der Fall, den die Regel meint –, sondern eine Summe über
unveränderliche Geschichte; vergangene Jahre sind abgeschlossene Tatsachen, nur das laufende wird
live gezählt. Der Zwischenspeicher ist eine Beschleunigung, keine Quelle: Fehlt er, rechnet die
Route einmal alles. **Jede Säule ist ein Knopf** – überfahren am Rechner, antippen auf dem Handy,
und eine Zeile darunter nennt Jahr und Zahl; sechzehn Beschriftungen an den Säulen wären auf 360 px
nicht lesbar, und ohne Auswahl steht dort das beste Jahr.

**„Letztes Platin"** nennt den echten Zeitpunkt samt Namen der Trophäe – `trophy.earned_at` liefert
genau das, was 19a mit „Zuletzt gespielt · mit Platin" noch fehlte.

**Zwei Lesekosten-Regeln aus dieser Stufe** (Hergang in [lehren.md](../lehren.md)): Die Frage „ist
die Erstbefüllung durch?" beantwortet `offeneListen()` aus `trophy_progress` (431 Zeilen), nicht
`fuellstand()` mit `COUNT(*) FROM trophy`; die Feed-Route liest damit **607 statt 18 500** Zeilen.
Und gemessen wird die **Route**, nicht die Abfrage – `test/lesekosten.spec.ts` tut das seit dem
01.10.2026.
