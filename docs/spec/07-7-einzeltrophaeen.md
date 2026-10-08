← [Inhaltsverzeichnis](README.md)

## 7.7 PSN jenseits der Trophäen – Einzeltrophäen (Stufe 19b)

### Was die Messung der Einzeltrophäen ergab (01.10.2026, vor dem Bauen)

Gemessen wie bei 18c: ein Skript im Scratchpad gegen das echte Konto, lesend, ins Repository kommen
nur Zahlen. Fünf Listen im Detail, 45 im Überblick. **Zwei Ergebnisse ändern den Entwurf, eines
bestätigt eine Entscheidung aus 19a.**

- **`npServiceName` ist Pflicht, und zwar für beide Dienste.** Ohne den Parameter antworten alle
  drei Endpunkte mit **404** – auch für `trophy`-Listen, wo er wie ein Vorgabewert aussieht.
  `?npServiceName=trophy` liefert dieselbe Liste anstandslos mit 128 Trophäen. Der Wert steht in
  `trophy_progress.np_service_name` und wird mitgegeben, nie geraten. Ohne diese Messung wäre das
  ein 404 in der ersten Nacht gewesen, bei dem die Liste selbst wie das Problem aussieht.
- **Versteckte Trophäen tragen Namen und Beschreibung.** 311 versteckte in der Stichprobe, **311
  davon mit Namen** – `trophy.name` kann `NOT NULL` sein, und die Oberfläche braucht keinen
  eigenen Zustand „Sony sagt es nicht". Ob eine versteckte Trophäe *angezeigt* werden soll, ist
  damit eine Gestaltungsfrage und keine Datenfrage.
- **Nur 18 % der Listen haben DLC-Gruppen** (8 von 45). Der dritte Abruf läuft damit rund **78-mal
  statt 431-mal**: Die Definitionen sagen in `hasTrophyGroups` selbst, ob er nötig ist. Der
  Bestand kostet damit grob **940 Anfragen** statt der 1 293, die drei Abrufe je Liste bedeutet
  hätten.
- **Eine Seite je Liste genügt.** `limit=200` liefert alle Trophäen in einem Zug; die größte Liste
  der Sammlung hat 128. Die Blätterung, die für die 11 Listen über 100 vorgesehen war, entfällt –
  `totalItemCount` wird trotzdem gegen die gelieferte Zahl geprüft, damit ein Teilergebnis
  auffällt.
- **Der Erspiel-Zeitpunkt ist da, wo er gebraucht wird.** `earnedDateTime` steht an jeder
  erspielten Trophäe (76 von 76 in der Stichprobe, ISO mit `Z`) und fehlt an den nicht erspielten.
  Das ist genau die Form, die der Feed braucht (8.5): `earned_at` ist `NULL` oder ein echter
  Zeitpunkt, nie ein Platzhalter.
- **Die Seltenheit kommt als Text.** `trophyEarnedRate` ist `"42.6"`, nicht `42.6`, dazu ein
  eigener Stufenwert `trophyRare` als Zahl. Die Zahl wird beim Normalisieren geparst; **welche
  Schwellen Sonys `trophyRare` meint, ist nicht gemessen** und bleibt offen – die Oberfläche
  bildet ihre Abstufung deshalb aus der Prozentzahl, nicht aus dem fremden Stufenwert.
- **Die Abrufe sind schnell und das Ratenlimit weit weg.** 45 Abrufe ohne Pause: **kein einziges
  429**, Schnitt 264 ms, längster 482 ms, zusammen 11,9 s. Hochgerechnet läuft die ganze
  Erstbefüllung in **rund vier Minuten** – der Portionsknopf ist damit keine Geduldsfrage mehr,
  sondern nur noch Rücksicht auf eine inoffizielle Schnittstelle und auf die Schreibgrenze.
- **`trophySummary` bestätigt 19a.** Sony nennt Level **514**, Stufe 6, und als Summe 7 844 Bronze,
  2 348 Silber, 812 Gold, 164 Platin – **11 168, genau die Summe über `trophy_progress` in der
  Datenbank**. Die Entscheidung vom 24.09.2026, die Zähler je Stufe über *alle* Listen zu bilden,
  trifft damit nachweislich Sonys eigene Zahl. Vom Abruf gebraucht wird nur das Level.

**Nachgemessen am 01.10.2026, auf zwei Hinweise des Nutzers hin – beide trafen zu, und einer
ändert das Schema:**

- **`trophyEarnedRate` ist der Anteil der Spieler des Spiels, die diese Trophäe haben**, und
  `trophyRare` ist genau dieselbe Zahl in Sonys vier Fächern. Gemessen an 526 Trophäen:
  `0` reicht von 0,1 % bis 5,0 %, `1` von 5,1 % bis 15,0 %, `2` von 16,1 % bis 49,5 %, `3` von
  51,4 % bis 90,2 %. Die Schwellen liegen damit bei 5, 15 und 50 Prozent. **Die Unklarheit aus
  der ersten Messung ist damit erledigt:** Der Wert `trophyRare: 2` bei 42,6 % war kein
  Widerspruch, sondern Sonys „selten" reicht bis zur Hälfte aller Spieler. Gespeichert wird die
  **Prozentzahl**, die Beschriftung entsteht zur Lesezeit aus diesen Schwellen (5.2) – so hängt
  die Oberfläche nicht an einem fremden Stufenwert, trifft aber dieselben vier Fächer wie Sony.
- **Es gibt den Fortschrittszähler, und er ist PS5-eigen.** `trophyProgressTargetValue` steht an
  der Definition, `progress`, `progressRate` und `progressedDateTime` am eigenen Stand – beides
  als **Text**, wie die Seltenheit. Gemessen über **alle 63 PS5-Listen**: 21 Listen mit Zielwert
  (360 Trophäen), davon 9 mit eigenem Fortschritt (158 Trophäen, 90 mit Zeitpunkt). In 45
  PS3/PS4/Vita-Listen mit 2 125 Trophäen: **kein einziger** Zielwert. Beispiel aus der Messung:
  Ziel 20, eigener Stand 15, nicht erspielt – „15 von 20". Eine erspielte Trophäe trägt keinen
  `progress` mehr, der Zielwert bleibt.

  Daraus vier Spalten an `trophy`, die der erste Entwurf nicht hatte: `progress_target`,
  `progress_value`, `progress_rate` und `progressed_at`. Sie sind **leer, wo Sony nichts erhebt** –
  und damit ein Fall der Regel aus Abschnitt 3 und 13: Bei PS3, PS4 und Vita steht dort nicht
  „unbekannt", sondern **gar nichts**, genau wie bei der Spielzeit. Ohne diesen Hinweis wäre das
  eine Migration nach der Migration geworden.

- **Eine Platformgrenze, die der Entwurf vom 27.09. nicht kannte: 50 Fremdanfragen je Aufruf.**
  Gegen Cloudflares Dokumentation geprüft am 01.10.2026 (Free: 50, Paid: 10 000). Eine Wall-Clock-
  Grenze gibt es dagegen nicht, solange der Client verbunden bleibt. Damit ist die Portionierung
  **keine Frage der Geduld, sondern eine harte Grenze**: 940 Anfragen brauchen mindestens 19
  Aufrufe, einer reicht nie. Eine Portion von 16 Listen sind 32 bis 48 Anfragen und bleibt
  darunter.

**Was die Antworten sonst noch hergeben (gemessen am 01.10.2026, Frage des Nutzers):**

- **`trophySummary` liefert mehr als das Level.** Neben `trophyLevel` (514) stehen dort
  `trophyPoint` (310 380), `trophyLevelBasePoint`, `trophyLevelNextPoint` und `progress` (13) sowie
  `tier` (6). Damit ist „Level 514 · 13 % bis 515" **ohne weiteren Abruf** möglich – derselbe
  Abruf, der ohnehin für das Level läuft.
- **Jede Trophäe hat ein Symbol, und es ist die teuerste Spalte.** 1 333 von 1 333 in der
  Stichprobe tragen `trophyIconUrl`, im Schnitt 126 Zeichen – hochgerechnet **2,32 MB** von rund
  3,55 MB Text der ganzen Tabelle (Namen 0,32 MB, Beschreibungen 0,91 MB). Das bestätigt die
  Schätzung „3–4 MB je Sicherung" als Messung.
- **Die Adresse lässt sich nicht verkürzen, und das ist gemessen, nicht vermutet.** Die Idee, nur
  die UUID zu speichern und die Adresse aus der Listen-Id wieder zusammenzusetzen, scheitert:
  Sony liefert **zwei** Hosts (`image.api.playstation.com` in 805 Fällen,
  `psnobj.prod.dl.playstation.net` in 528), und nur **40 %** der Adressen folgen dem Muster
  `.../psnobj/{listenId}/{uuid}.png`. Die Adresse wird deshalb unverändert gespeichert.
- **`trophySetVersion` steht im Kopf des Gruppen-Endpunkts**, dazu `trophyTitleName`,
  `trophyTitleIconUrl`, `trophyTitlePlatform` und die Definitionszähler je Gruppe. Die Version
  wäre ein billigeres Änderungssignal als der Zählervergleich aus Stufe 13 – **aber nur für die
  18 % der Listen, deren Gruppen überhaupt geholt werden.** Als allgemeiner Ersatz taugt sie
  damit nicht; notiert als Möglichkeit, nicht als Plan.

**Was die Tabelle an Statistiken erst möglich macht** – alles ohne weiteren PSN-Abruf, alles zur
Lesezeit gerechnet (5.2). **Entschieden am 01.10.2026** (Nutzer), welche davon in den Prototyp
gehen:

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

**Das Level ersetzt den Trophäen-Block, es ergänzt ihn nicht** (Entscheidung des Nutzers vom
01.10.2026 am Prototyp): Level, Punkte und „1 560 bis Level 515" stehen im Kopf desselben Blocks.
Dadurch wächst das Dashboard um **einen** Block statt um zwei, und die Zahl, die Sony nennt, steht
neben der Zahl, die wir selbst bilden – die beiden stimmen überein (gemessen, siehe oben).

**Die vier Stufen verlieren dabei ihre Kacheln** (zweite Rückmeldung des Nutzers am Prototyp,
01.10.2026): Sie stehen als **Symbol und absolute Zahl** in der freien Fläche rechts neben der
Level-Zahl, über dem Fortschrittsbalken – ohne das Wort und ohne „von 338". Beides steht ohnehin
in der aufklappbaren Tabelle „Anteil je Stufe" darunter, die unverändert bleibt. Der Block ist
damit vier Zeilen hoch statt neun.

**Sie nehmen die Fläche auch ein, statt an ihrem Rand zu kleben** (dritte und vierte Rückmeldung,
beide mit einem Bild): gleichmässig verteilt und **auf Augenhöhe mit der Level-Zahl** – 2,4 rem am
Desktop, dieselbe Grösse wie das Level, über 30 rem 1,5 rem, darunter 1,15 rem. Der erste Versuch
stellte sie klein an den rechten Rand und liess dazwischen ein leeres Band stehen; der zweite
machte sie grösser, aber immer noch halb so gross wie nötig. Beide Male war es im Bild sofort zu
sehen und im CSS nicht – der Nutzer hat die gewünschte Grösse am Ende in Paint zusammenkopiert,
und das war die schnellste Verständigung von allen.

**Auf dem Gerät des Nutzers bricht die Stufenreihe auf eine eigene Zeile um** und nimmt dort die
volle Breite ein. Das ist gemessen, nicht geschätzt: „514 Level" und die vier Zahlen brauchen mehr
als die 296 px, die bei 360 px Gerätebreite im Block zur Verfügung stehen – auch mit kleineren
Maßen, geprüft bis 430 px. In eine Zeile ginge es nur ohne das Wort „Level", und ein nacktes „514"
über einem Trophäenblock liest sich wie eine Anzahl.

Der Umbruch wird dabei **erzwungen** (`min-width: 15rem`), nicht dem Flex-Kasten überlassen:
Ohne das schrumpft er, statt umzubrechen, und die letzte Zahl läuft aus dem Block heraus – bei
360 px gesehen, nachdem die Zahlen gewachsen waren.

Und die Zahl selbst bekommt `white-space: nowrap`: Bei 360 px wurde aus „2 348" ein „2" über
einem „348", weil das **Tausendertrennzeichen ein Leerraum ist** und damit eine Umbruchstelle.
Das trifft jede Zahl über tausend in der Anwendung, nicht nur diese – gefunden an genau dieser
Stelle, als die Ziffern gross genug waren, dass es auffiel.

### Wie es gebaut ist (Stufe 19b, 01.10.2026)

**Zwei Tabellen, beide `WITHOUT ROWID`** (Migration 0027). `trophy` trägt Definition und eigenen
Stand je Trophäe, `trophy_group` die Gruppen der rund 18 % Listen, die welche haben. `WITHOUT
ROWID` ist dabei die Antwort auf die Schreibgrenze: Eine normale Tabelle mit demselben
Primärschlüssel schriebe zwei Zeilen je Trophäe, hier ist die Zeile **im** Schlüssel abgelegt.
Derselbe Schlüssel beginnt mit `np_communication_id` und ist damit zugleich der Index für „die
Trophäen eines Spiels" – gemessen **91 gelesene Zeilen** statt eines Scans über 18 490.

**Zwei Stempel an `trophy_progress`**, und sie sind der Grund, warum sich der Füllschritt nicht im
Kreis dreht. `trophies_synced_at` hält den **Versuch**, nicht den Erfolg: Eine Liste, die PSN nicht
mehr kennt (404 bei einem delisteten Titel), bliebe sonst für immer die nächste – genau der Fall,
der den IGDB-Schritt in 18b zwei Nächte stilllegte. `trophies_synced_sum` hält die Summe aller acht
Zähler zum Abrufzeitpunkt; weicht sie ab, hat sich an der Liste etwas geändert, und nur dann wird
neu geholt. Das ist „danach nur bei Änderung" ohne Absprache mit der Änderungserkennung aus Stufe
13 und ohne zweite Abfrage – beide Werte stehen in derselben Zeile.

**Gemessen in `test/lesekosten.spec.ts`** gegen 430 Listen mit 18 490 Trophäen, Lese- **und**
Schreibseite:

| | Zeilen | |
|---|---|---|
| Trophäen eines Spiels | **91** | Bereich im Primärschlüssel, kein Scan |
| Auswahl des Füllschritts, etwas offen | **1** | findet die erste offene Liste sofort |
| Auswahl des Füllschritts, **nichts offen** | **430** | der Dauerbetrieb – 15 480 je Nacht |
| Feed, 30-Tage-Fenster | **180** | über den Teilindex, nicht über den Bestand |

Die dritte Zeile ist die, auf die es ankommt: Sie läuft 36-mal je Nacht, während die zweite nur
während der Erstbefüllung auftritt. Nur den günstigen Fall zu messen wäre derselbe Fehler wie
„nur den Leerlauf zählen" (10.1).

**Der Knopf hielt beim ersten echten Durchlauf bei 126 von 431 Listen an** (01.10.2026, gemeldet
vom Nutzer). Gespeichert waren 5 464 Trophäen, alle gestempelt – die Daten waren in Ordnung, die
Schleife war es nicht. Zwei Fehler, beide in der Oberfläche:

- **Ein fehlgeschlagener `fetch` sprang aus der Schleife heraus**, und zwar an jeder Meldung
  vorbei: Der Fortschrittstext fror bei der letzten Zahl ein, der Block darüber zeigte weiter den
  alten Stand, und der Knopf war wieder bedienbar, ohne dass irgendwo stand, warum. Von außen sah
  das aus wie „hängt". Jetzt liegt ein `try` um **jede Portion**, ein Netzfehler wird einmal
  wiederholt und danach benannt, und der Stand wird im `finally` neu geladen – nach einem Abbruch
  erst recht.
- **Der Bildschirm sperrt, bevor die vier Minuten um sind.** Ein Tab im Hintergrund bekommt seine
  Zeitgeber gedrosselt und laufende Abrufe abgebrochen; neun Portionen sind rund anderthalb
  Minuten, und genau dort war Schluss. Der Durchlauf hält den Bildschirm jetzt über `wakeLock`
  wach, solange er läuft. Wo es die Schnittstelle nicht gibt, läuft alles wie bisher.

**Beim zweiten Versuch hielt er schon nach zwei Portionen an, bei 154 Listen** – und jetzt zeigte
sich, dass die Erklärung zwar da war, aber am falschen Ort: Fortschritt und Meldung teilten sich
die Zeilen mit dem Kauflisten-Knopf. Der Fortschritt stand **über** dem Block, die Meldung
mehrere Bildschirme **darunter**, hinter dem Cron-Verlauf. Der Nutzer konnte beide Male nicht
sehen, warum. Beides steht jetzt direkt unter seinem Knopf. Das ist dieselbe Art Fehler wie die
Zustandsfarben in 19c: im Code unsichtbar, im Bild sofort da – und gefunden hat ihn nicht das
Rendern, sondern der Nutzer.

**Und der Ausgang wird aufgeschrieben, nicht nur zurückgegeben.** `POST /api/sync/trophaeen` legt
seit dem 01.10.2026 Zahl, Zeitpunkt und Grund in `app_setting` ab; `GET` gibt sie heraus, und der
Block nennt sie („Zuletzt angehalten (1.10.2026, 21:40): Trophäenabruf antwortete mit 429"). Vorher
stand die Meldung ausschließlich im Browser des Nutzers und war nach einem Neuladen fort – zweimal
blieb der Knopf stehen, und beide Male war hinterher **nicht festzustellen, woran**. Das ist die
Lehre aus 18e an einer Stelle, an die ich sie nicht angelegt hatte: **Ein Schritt, der ruht, sagt
warum.** Der fortlaufende Stand steht dafür in der Datenbank: Was gestempelt ist, ist fertig, und
ein erneuter Druck macht genau dort weiter.

**Beim dritten Mal stand die Antwort da, und sie war eine andere als vermutet.** Die Aufzeichnung
nannte eine Portion mit **14 Listen, 401 Trophäen und keiner Meldung** – die Portion war also
sauber durchgelaufen. Danach kam keine Anfrage mehr beim Worker an, und die Oberfläche wartete
still weiter: Der Nutzer beschrieb es als „der Zähler geht nur hoch, wenn ich die Seite neu lade",
und genau das ist das Bild einer Schleife, die **mitten im Abruf hängt** statt beendet zu sein –
der Block wird erst im `finally` aufgefrischt, und das kam nie.

Damit war die Ratenlimit-Vermutung vom selben Abend **widerlegt**, und zwar durch die Zahl, die
eigens dafür aufgeschrieben wurde. Die wirkliche Ursache ist eine Lücke im Abbruchschutz:

- **`fetch` wartet von sich aus unbegrenzt.** Das Wiederholen aus 64a greift nur bei einem
  *Fehler*; eine Anfrage, die nie antwortet, wird nie zu einem. Jede Portion trägt jetzt
  `AbortSignal.timeout(30 s)` – ein Hänger wird damit zu einem Fehler, der Text sagt es, und der
  Knopf ist wieder bedienbar.
- **Die Portion war nach der falschen Grenze geschnitten.** Vierzehn Listen kamen aus den 50
  erlaubten Fremdanfragen je Worker-Aufruf – die Rechnung stimmte, der Zuschnitt nicht: Das sind
  rund dreißig PSN-Abrufe und **zehn Sekunden und mehr in einer einzigen Anfrage**. Auf einem
  Handy ist das eine Ewigkeit. Seit dem 01.10.2026 sind es **vier Listen**, rund neun Abrufe und
  drei Sekunden; 108 Anfragen für den Bestand statt 31, dafür übersteht jede einzelne eine
  Mobilfunkverbindung. **Nicht die Obergrenze entscheidet, sondern die Dauer** – ein Test hält
  beides fest.
- **Die Zahl im Block zieht jetzt nach jeder Portion mit**, statt bis zum Ende stillzustehen.
- **Und der Fortschritt zählt den Bestand, nicht den Druck.** Die Zeile stellte die Listen *dieses*
  Durchlaufs neben die Gesamtzahl aller – nach einem Abbruch begann sie damit wieder bei null,
  obwohl schon 168 von 431 Listen geholt waren (Rückmeldung des Nutzers vom 01.10.2026). Jetzt
  steht dort der Stand des Bestands, und was dieser Druck geholt hat, steht als eigene Zahl
  daneben.

Die Lehre über die Stufe hinaus: Die Aufzeichnung aus 64a hat sich sofort bezahlt gemacht. Ohne
sie wäre die naheliegende Vermutung (ein Ratenlimit) gebaut worden, und sie war falsch.

**Am 01.10.2026 ist die Erstbefüllung durchgelaufen: 18 355 Trophäen in 431 Listen, 0 offen.** Das
ist auf die Trophäe genau die Summe, die `trophy_progress` aus Sonys Zählern nennt – zwei Wege,
dieselbe Zahl. Der Weg dorthin brauchte vier Anläufe und drei Fehler in der Oberfläche, keinen
einzigen in den Daten: Was einmal gestempelt war, blieb stehen, und jeder Druck machte dort
weiter.

**Zwei Routen** (Abschnitt 12): `POST /api/sync/trophaeen` holt eine Portion von **vierzehn**
Listen, `GET /api/sync/trophaeen` sagt, wie weit es ist. Die Vierzehn kommt nicht aus Bequemlichkeit
– ein Worker-Aufruf darf höchstens **50 Fremdanfragen** machen (15.4), eine Liste kostet zwei bis
drei, und mit sechzehn wären es 48 plus eine mögliche Token-Erneuerung. Die Oberfläche ruft nach,
bis nichts mehr offen ist: 431 Listen sind rund 31 Aufrufe.

**Zwei Funde beim Bauen, beide an Stellen, die eine neue Tabelle für selbstverständlich hielten:**

- Der Vollexport sortierte jede Tabelle mit `ORDER BY rowid` – und eine `WITHOUT ROWID`-Tabelle
  hat keine. Der ganze Export antwortete mit `500`. Er sortiert jetzt nach dem Primärschlüssel, wo
  einer eingetragen ist (`EXPORT_ORDNUNG`, `src/db/export.ts`). Gefunden von
  `test/export-route.spec.ts`, bevor es irgendwo hinkam.
- `scripts/sicherung-pruefen.sh` setzte seine Tabellenliste ungeprüft in ein `SELECT` mit einer
  Unterabfrage je Tabelle. Das Skript läuft im Deploy-Job **vor** der Migration – eine Tabelle, die
  erst diese Migration anlegt, kann es dort noch nicht geben; die Abfrage scheiterte, `jq` brach ab,
  und der erste Deploy-Versuch der Stufe 19b blieb stehen, **bevor** die Migration lief. Die
  Produktion blieb dabei unberührt, der Abbruch war die richtige Reaktion auf die falsche Ursache.
  Jetzt fragt das Skript zuerst `sqlite_master`, nennt fehlende Tabellen im Log und überspringt
  sie – beim nächsten Deploy sind sie da und werden gezählt. Eine Tabelle, die aus der Produktion
  **verschwindet**, fällt in derselben Zeile auf.

### Teil 2: die Anzeige (Stufe 19b, 01.10.2026)

**Die Trophäenliste hängt am Release, nicht am Spiel.** Sonys Liste hängt am Titel, und ein Spiel
mit PS4- und PS5-Fassung hat zwei davon mit eigenem Fortschritt; sie zusammenzuwerfen ergäbe einen
Zähler, den es nirgends gibt. `GET /api/releases/:id/trophaeen` liefert sie, und die Oberfläche
holt sie **erst beim Aufklappen** – eine Liste sind 91 gelesene Zeilen, und ein Spiel mit drei
Releases soll sie nicht alle mitbringen.

**Der Dashboard-Feed liest seine zwei Quellen über `GET /api/feed`.** Das Änderungsprotokoll
behält `/api/events` und sein Keyset; der Feed mischt zur Lesezeit und zeigt acht Zeilen. Den Satz
bildet der Worker (`beschreibeFeedTrophaeen`), nicht die Oberfläche – eine Zeile, ein Text, eine
Stelle. **Bronze wird dabei nie genannt:** Es ist die Grundmenge, und „12 Trophäen, davon 1 Gold
und 11 Bronze" sagt dasselbe zweimal. Besteht eine Zeile nur aus einer Stufe, heißt sie direkt
„1 Gold-Trophäe" statt „1 Trophäe, davon 1 Gold".

**„Trophäen je Jahr" hängt an einer eigenen Route und an einem Klick – und das ist gemessen.** Die
Auswertung muss jede erspielte Trophäe ansehen: **18 060 gelesene Zeilen** bei 430 Listen, gegen
6 840 für das ganze übrige Dashboard. Ein Indexhinweis (`INDEXED BY idx_trophy_erspielt`) ändert
daran **nichts** – ebenfalls gemessen, 18 060 so wie so. Im Batch der Startseite wäre die Zahl
damit die teuerste Abfrage der ersten Seite nach jedem Start der App (Abschnitt 2). Sie steht
deshalb hinter „anzeigen" und wird erst dann geholt. Gespeichert wird sie nicht – sie ist
berechnet (5.2).

**Vier Fehler, die erst das Rendern gezeigt hat**, keiner davon beim Lesen des Codes sichtbar:

- **`.deckel` gab es schon** – als Cover-Platzhalter mit Seitenverhältnis und 1,6 rem Schrift. Die
  zugedeckte Trophäe wurde dadurch zu einem riesigen leeren Kasten. Die neue Klasse heißt
  `.trophdeckel`; alle übrigen neuen Namen sind unter `.troph` verschachtelt und kollidieren nicht.
- **Zwei Spalten nach der Fensterbreite waren falsch.** Im Prototyp lag die Liste über die ganze
  Seite, in der Anwendung steht sie in der Release-Karte – bei 1280 px Fenster rund 470 px breit.
  `@media (min-width: 48rem)` griff trotzdem, jede Spalte bekam 230 px, und „Schließe die
  Einführung ab." stand auf zwei Zeilen. Jetzt entscheidet eine **Container-Abfrage** über die
  Breite der Liste selbst (`container-type: inline-size`, ab 38 rem).
- **Ein Block ohne Ordnungszahl landet im Desktop-Raster ganz vorn.** „Trophäen je Jahr" stand über
  den Kennzahlen, weil `order` dort je Klasse vergeben wird und die Vorgabe `0` ist.
- **Ein einzelnes Jahr als goldene Fläche über die ganze Breite** war keine Aussage. Das beste Jahr
  wird nur hervorgehoben, wenn es mehrere gibt.

**Fünf Nachbesserungen aus der Abnahme am 01.10.2026** (Rückmeldungen des Nutzers):

- **Eine versteckte Trophäe, die man hat, ist kein Geheimnis mehr.** Zugedeckt bleibt nur, was
  versteckt **und noch nicht erspielt** ist; der Schieberegler erscheint nur, wenn es überhaupt
  etwas zuzudecken gibt. Vorher verschwieg die Liste dem Nutzer seine eigene Leistung.
- **Die Überschrift steht über den Trophäenzeichen und nennt die Zahl direkt** („Trophäen – 11 von
  49" mit dem Winkel zum Aufklappen, demselben wie überall). Vorher stand dort „anzeigen", und die
  Zahl erschien erst nach dem Laden. Die Zeichen bleiben beim Öffnen stehen, die Liste wächst
  darunter.
- **Das Trophäen-Level war nicht zu sehen, weil nur der Cron es holt.** Der Knopf in den
  Einstellungen heißt jetzt „Level und Jahre auffrischen", sobald nichts mehr zu füllen ist, und
  holt beides sofort – sonst stünde das Dashboard bis zum nächsten Nachtlauf ohne Level und ohne
  Fortschrittsbalken da.
- **„Trophäen je Jahr" wird nachts einmal gerechnet und abgelegt** (Vorschlag des Nutzers:
  „kann man sich dann nicht die Werte außer für dieses Jahr speichern?"). Vergangene Jahre sind
  abgeschlossene Tatsachen; nur das laufende wird beim Lesen live gezählt – gemessen **535 statt
  18 060 Zeilen**. **Das ist eine bewusste Ausnahme von „Berechnetes nicht speichern" (5.2)** –
  gespeichert wird kein Rang und keine Sortierung, der Fall, den die Regel meint, sondern eine
  Summe über unveränderliche Geschichte, und der Zwischenspeicher ist eine Beschleunigung, keine
  Quelle: Fehlt er, rechnet die Route einmal alles. **Damit steht der Block wieder offen** statt
  hinter einem Klick (Wunsch des Nutzers) – der Grund, ihn zu verstecken, war allein der Preis.
- **Jede Säule ist ein Knopf:** überfahren am Rechner, antippen auf dem Handy, und eine Zeile
  darunter nennt Jahr und Zahl. Sechzehn Beschriftungen an den Säulen wären auf 360 px nicht
  lesbar; ohne Auswahl steht dort das beste Jahr – die Aussage, die ohne Zutun gilt.
- **Die Chips der Trophäenliste sind keine Filterleiste.** `.chips` ist für die Sammlung gebaut:
  Sie ragt mit negativen Rändern aus dem Kasten, scrollt waagerecht und trägt unten eine Linie. In
  der Trophäenliste ragte diese Linie links heraus und hörte rechts mitten im Kasten auf
  (Bildschirmfoto des Nutzers). Jetzt wird nur das Aussehen der einzelnen Chips geerbt, nicht das
  Verhalten der Leiste – **die zweite Klassenkollision in dieser Stufe**, nach `.deckel`. Eine
  gemeinsame Klasse ist eine Zusage über ihren Kontext, und beide Male war die Zusage falsch.
- **„Zuletzt gespielt · mit Platin" heißt jetzt „Letztes Platin"** und nennt den echten Zeitpunkt
  samt Namen der Trophäe. Die Frage des Nutzers – „könnte das jetzt nicht einfach ‚letztes Platin'
  sein?" – beantwortet sich mit ja: `trophy.earned_at` liefert genau das, was 19a fehlte. Dabei
  fiel ein „Invalid Date" auf: `datum()` kannte ISO und den blanken Tag, aber nicht SQLites
  „2026-09-22 12:59:31" mit Leerzeichen.

**Offen und dem Nutzer vorgelegt:** Im Feed stehen trotz 22 erspielter Trophäen im Fenster keine
Trophäenzeilen – **234 Ereignisse sind neuer** als die jüngste Trophäe vom 21.09.2026 und belegen
alle acht Plätze. Der Feed sortiert richtig; die Frage ist, ob „neueste acht" das richtige Maß ist,
wenn Sync und IGDB an einem Tag Dutzende Zeilen erzeugen.

**Drei Darstellungsfehler aus der zweiten Abnahmerunde (01.10.2026)**, alle drei vom Nutzer mit
Bildschirmfoto gemeldet und alle drei im Code unsichtbar:

- **`.stufe` war zweimal vergeben** – einmal als Tabellenzeile von „Anteil je Stufe" (19a), einmal
  als Trophäenzeichen im Spieldetail (19c). Die spätere Regel gewann: `display: inline-flex`
  machte aus jeder Tabellenzeile einen Inline-Kasten, „Platin 164 / 338" und „Gold 812 / 1564"
  liefen in einer Zeile ineinander, und der Balken mit `flex: 1` fiel auf Breite null zusammen.
  Die Zeichen heißen jetzt `.stufenzeichen`. **Das ist die dritte Klassenkollision dieser Stufe**
  nach `.deckel` und `.chips` – eine gemeinsame Klasse ist eine Zusage über ihren Kontext, und
  dreimal war die Zusage falsch.
- **Der Balken ist ein `<span>`, und ein Inline-Kasten nimmt keine Höhe an.** Deshalb blieben die
  farbigen Verhältnisbalken auch nach der Umbenennung unsichtbar, obwohl Breite und Metallfarbe im
  Markup standen. `.balken` trägt jetzt `display: block`; überall sonst ist er ein `<div>` und war
  es ohnehin.
- **Auf breiten Bildschirmen endete die Kopfzeile mitten im Fenster.** `main` war auf 64 rem
  gedeckelt – am Notebook richtig, auf einem 1920er Bildschirm nicht: Die Linie hörte nach 1 024 px
  auf, und die Glocke hängt an ihrem Ende. **Der erste Versuch hob den Deckel ganz auf, und das war
  zu viel:** Er behob die Kopfzeile, zog aber *jede* Ansicht über die volle Bildschirmbreite – dem
  Nutzer fiel es am nächsten Tag auf („war das so geplant?"). Gezeigt hatte ich danach nur das
  Dashboard, wo es am wenigsten auffiel; die Reichweite der Änderung hätte ich dazusagen müssen.
  **Entschieden am 01.10.2026: 80 rem.** Breiter als vorher, aber eine Textzeile bleibt lesbar –
  die Kopfzeile reicht entsprechend weiter und endet weiterhin mit dem Inhalt, was auf einem
  zentrierten Layout gewollt aussieht statt abgeschnitten.

  **Der dritte Anlauf war nötig, weil `main` zwei `max-width`-Regeln hatte** (02.10.2026): eine aus
  Stufe 5 und eine aus der Gestaltungslinie von Stufe 19. Geändert wurde die erste, gewirkt hat die
  zweite – die 80 rem blieben wirkungslos, das Layout stand weiter auf 64, und der gemeldete Fehler
  war am nächsten Tag zurück. **Geprüft hatte ich nur den Asset-Hash**, also dass die neue Fassung
  ankommt, nicht dass sie etwas bewirkt. Die ältere Regel trägt jetzt keinen Deckel mehr, und über
  der wirksamen steht, dass sie die wirksame ist. Gemessen bei 1920 px: Die Linie endet bei 1 705,
  der Feed bei 1 697 – die Kopfzeile reicht jetzt bis über dessen Rand.

**Der Feed bleibt, wie er ist** (Entscheidung des Nutzers vom 01.10.2026): Dass Sync- und
IGDB-Zeilen die Trophäen verdrängen, ist eine Folge des Aufbaus der Sammlung – „irgendwann steht
die Sammlung und es wird ruhiger". Die drei vorgeschlagenen Eingriffe (feste Plätze, Maschinen-
ereignisse ausblenden, mehr Zeilen) sind damit **verworfen, nicht vergessen**.

**Die Zeilenlese-Grenze ist am 01.10.2026 fast erreicht worden – 4,16 von 5 Mio.** (Hinweis des
Nutzers). Nicht die Schreibungen waren das Problem (31 566 von 100 000, wie gerechnet), sondern
**eine einzige Zeile**: `fuellstand()` zählt mit `COUNT(*) FROM trophy` den ganzen Bestand, und sie
stand an zwei Stellen, die oft laufen:

- **in der Feed-Route**, also bei jedem Öffnen des Dashboards – 18 355 Zeilen je Aufruf, zusätzlich
  zu den 6 840 der Kennzahlen;
- **am Ende jeder Portion** der Erstbefüllung – 108 Portionen × rund 19 000 Zeilen sind grob
  2 Mio. allein dafür.

Beide fragen nur „ist die Erstbefüllung durch?", und das steht in `trophy_progress`: 431 Zeilen.
`offeneListen()` beantwortet es, `fuellstand()` bleibt den Einstellungen und dem Portionsknopf.
**Gemessen: Die Feed-Route liest jetzt 607 statt 18 500 Zeilen.**

**Die Lehre ist wörtlich die vom 28.09.2026, nur eine Ebene höher.** Damals maß
`test/lesekosten.spec.ts` nur Leseansichten und nicht die Schreibschritte; hier maß sie die
**Abfrage** des Feeds (183 Zeilen) und nicht die **Route**, die noch eine zweite machte. Eine
Messung, die nur einen Teil des Aufrufs zählt, beschreibt den Aufruf nicht. Der Test misst jetzt
die Route.
