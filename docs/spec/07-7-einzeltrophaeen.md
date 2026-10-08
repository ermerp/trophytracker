← [Inhaltsverzeichnis](README.md)

## 7.7 PSN jenseits der Trophäen – Einzeltrophäen (Stufe 19b)

Definition, eigener Stand, Erspiel-Zeitpunkt und weltweite Seltenheit je Trophäe, dazu Gruppen
(Hauptspiel gegen DLC) und das Trophäen-Level. **18 355 Trophäen in 431 Listen**, abgenommen am
02.10.2026. Die Erstbefüllung hat **31 566 Zeilen geschrieben** von den 100 000, die der Tag
erlaubt – gerechnet waren rund 37 000 (15.4).

### Was die Messung ergab (01.10.2026, vor dem Bauen)

Gemessen wie bei 18c: ein Skript im Scratchpad gegen das echte Konto, lesend, ins Repository kamen
nur Zahlen. Fünf Listen im Detail, 45 im Überblick.

- **`npServiceName` ist Pflicht, und zwar für beide Dienste.** Ohne den Parameter antworten alle
  drei Endpunkte mit **404** – auch für `trophy`-Listen, wo er wie ein Vorgabewert aussieht. Der
  Wert steht in `trophy_progress.np_service_name` und wird mitgegeben, nie geraten.
- **Versteckte Trophäen tragen Namen und Beschreibung** (311 von 311 in der Stichprobe), also kann
  `trophy.name` `NOT NULL` sein. Ob eine versteckte Trophäe *angezeigt* wird, ist eine Frage der
  Oberfläche (13), keine der Daten.
- **Nur 18 % der Listen haben DLC-Gruppen** (8 von 45). Der dritte Abruf läuft damit rund
  **78-statt 431-mal** – `hasTrophyGroups` sagt in den Definitionen selbst, ob er nötig ist. Der
  Bestand kostet grob **940 Anfragen** statt der 1 293 für drei Abrufe je Liste.
- **Eine Seite je Liste genügt.** `limit=200` liefert alle Trophäen in einem Zug; die größte Liste
  hat 128. `totalItemCount` wird gegen die gelieferte Zahl geprüft, damit ein Teilergebnis auffällt.
- **Der Erspiel-Zeitpunkt ist da, wo er gebraucht wird.** `earnedDateTime` steht an jeder
  erspielten Trophäe (76 von 76 in der Stichprobe, ISO mit `Z`) und fehlt an den übrigen – genau die Form, die der Feed braucht
  (8.5): `earned_at` ist `NULL` oder ein echter Zeitpunkt.
- **Die Abrufe sind schnell und das Ratenlimit weit weg.** 45 Abrufe ohne Pause: **kein einziger
  429**, Schnitt 264 ms, längster 482 ms, zusammen 11,9 s. Die ganze Erstbefüllung läuft in
  **rund vier Minuten**; der Portionsknopf ist damit keine Geduldsfrage, sondern Rücksicht auf eine
  inoffizielle Schnittstelle und auf die Schreibgrenze.
- **`trophySummary` bestätigt 19a.** Sony nennt Level **514**, Stufe 6, und als Summe 7 844 Bronze,
  2 348 Silber, 812 Gold, 164 Platin – **11 168, genau die Summe über `trophy_progress`**. Die
  Entscheidung vom 24.09.2026, die Zähler je Stufe über *alle* Listen zu bilden, trifft damit
  nachweislich Sonys eigene Zahl. Vom Abruf gebraucht wird nur das Level.

**Seltenheit und Fortschritt, nachgemessen am 01.10.2026:**

- **`trophyEarnedRate` ist der Anteil der Spieler des Spiels, die diese Trophäe haben**, geliefert
  als **Text** (`"42.6"`). `trophyRare` ist dieselbe Zahl in Sonys vier Fächern; gemessen an 526
  Trophäen liegen die Schwellen bei **5, 15 und 50 Prozent** (`0`: 0,1–5,0 %, `1`: 5,1–15,0 %,
  `2`: 16,1–49,5 %, `3`: 51,4–90,2 %) – `trophyRare: 2` bei 42,6 % ist damit kein Widerspruch,
  sondern Sonys „selten" reicht bis zur Hälfte aller Spieler. Gespeichert wird die **Prozentzahl**, die Beschriftung
  entsteht zur Lesezeit aus diesen Schwellen (5.2) – so hängt die Oberfläche nicht an einem fremden
  Stufenwert, trifft aber dieselben vier Fächer.
- **Der Fortschrittszähler ist PS5-eigen.** `trophyProgressTargetValue` steht an der Definition,
  `progress`, `progressRate` und `progressedDateTime` am eigenen Stand, beides als Text. Gemessen
  über **alle 63 PS5-Listen**: 21 mit Zielwert (360 Trophäen), davon 9 mit eigenem Fortschritt (158 Trophäen, 90 mit Zeitpunkt). In
  45 PS3/PS4/Vita-Listen mit 2 125 Trophäen: **kein einziger** Zielwert. Daraus vier Spalten an
  `trophy` – `progress_target`, `progress_value`, `progress_rate`, `progressed_at` –, und sie sind
  **leer, wo Sony nichts erhebt**: Bei PS3, PS4 und Vita steht dort nicht „unbekannt", sondern gar
  nichts, genau wie bei der Spielzeit (Abschnitt 3 und 13).
- **50 Fremdanfragen je Worker-Aufruf** (Free Tier, gegen Cloudflares Dokumentation geprüft am
  01.10.2026; Paid: 10 000). Eine Wall-Clock-Grenze gibt es dagegen nicht, solange der Client
  verbunden bleibt. Die Portionierung ist damit **keine Frage der Geduld, sondern eine harte
  Grenze**: 940 Anfragen brauchen mindestens 19 Aufrufe, einer reicht nie.

**Was die Antworten sonst hergeben:**

- **`trophySummary` liefert mehr als das Level:** `trophyPoint` (310 380),
  `trophyLevelBasePoint`, `trophyLevelNextPoint`, `progress` (13) und `tier` (6). „Level 514 ·
  13 % bis 515" ist damit **ohne weiteren Abruf** möglich.
- **Das Symbol je Trophäe ist die teuerste Spalte.** 1 333 von 1 333 tragen `trophyIconUrl`, im
  Schnitt 126 Zeichen – hochgerechnet **2,32 MB** von rund 3,55 MB Text der ganzen Tabelle (Namen
  0,32 MB, Beschreibungen 0,91 MB).
- **Die Adresse lässt sich nicht verkürzen, und das ist gemessen.** Nur die UUID zu speichern
  scheitert: Sony liefert **zwei** Hosts (`image.api.playstation.com` 805-mal,
  `psnobj.prod.dl.playstation.net` 528-mal), und nur **40 %** der Adressen folgen dem Muster
  `.../psnobj/{listenId}/{uuid}.png`.
- **`trophySetVersion` steht im Kopf des Gruppen-Endpunkts** und wäre ein billigeres
  Änderungssignal als der Zählervergleich aus Stufe 13 – **aber nur für die 18 % der Listen, deren
  Gruppen geholt werden.** Als allgemeiner Ersatz taugt sie nicht; notiert, nicht geplant.

### Welche Statistiken die Tabelle möglich macht

Alles ohne weiteren PSN-Abruf, alles zur Lesezeit gerechnet (5.2). **Entschieden am 01.10.2026**
(Nutzer), welche davon in den Prototyp gehen:

| | |
|---|---|
| **Trophäen je Jahr** aus `earned_at` | **gebaut**, eigener Block |
| **Trophäen-Level** aus `trophySummary`, mit Punkten und Fortschritt zur nächsten Stufe | **gebaut** – und zwar **im** heutigen Trophäen-Block, nicht daneben |
| **Symbol je Trophäe** in der Liste je Spiel | **gebaut**, die Liste trägt sie |
| Seltenste erspielte Trophäe (`MIN(earned_rate)`) | **verworfen** am 01.10.2026 am Prototyp – „finde ich nicht interessant" |
| Dauer von der ersten Trophäe bis zum Platin je Spiel | später, nicht verworfen |
| Wie viele versteckte Trophäen noch offen sind | später, nicht verworfen |

Die letzten beiden bleiben ausdrücklich offen und nicht abgelehnt – sie brauchen keinen weiteren
Abruf und können jederzeit nachkommen.

### Der Block auf dem Dashboard

**Das Level ersetzt den Trophäen-Block, es ergänzt ihn nicht** (Entscheidung des Nutzers vom
01.10.2026 am Prototyp): Level, Punkte und „1 560 bis Level 515" stehen im Kopf desselben Blocks.
Dadurch wächst das Dashboard um **einen** Block statt um zwei, und die Zahl, die Sony nennt, steht
neben der Zahl, die wir selbst bilden – die beiden stimmen überein.

**Die vier Stufen tragen keine Kacheln.** Sie stehen als **Symbol und absolute Zahl** in der freien
Fläche rechts neben der Level-Zahl, über dem Fortschrittsbalken – ohne das Wort und ohne „von 338",
weil beides in der aufklappbaren Tabelle „Anteil je Stufe" darunter steht. Der Block ist damit vier
Zeilen hoch statt neun. Sie sind gleichmässig verteilt und **auf Augenhöhe mit der Level-Zahl**:
2,4 rem am Desktop, über 30 rem 1,5 rem, darunter 1,15 rem.

**Auf 360 px bricht die Stufenreihe auf eine eigene Zeile um** und nimmt dort die volle Breite ein.
Das ist gemessen: „514 Level" und die vier Zahlen brauchen mehr als die **296 px**, die bei 360 px
Gerätebreite im Block zur Verfügung stehen – auch mit kleineren Maßen, geprüft bis 430 px. In eine
Zeile ginge es nur ohne das Wort „Level", und ein nacktes „514" über einem Trophäenblock liest sich
wie eine Anzahl.

Der Umbruch wird **erzwungen** (`min-width: 15rem`), nicht dem Flex-Kasten überlassen: Ohne das
schrumpft er, statt umzubrechen, und die letzte Zahl läuft aus dem Block heraus. Und die Zahl trägt
`white-space: nowrap`, weil das **Tausendertrennzeichen ein Leerraum und damit eine Umbruchstelle
ist** – das trifft jede Zahl über tausend in der Anwendung ([lehren.md](../lehren.md)).

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
