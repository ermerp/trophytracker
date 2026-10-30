← [Inhaltsverzeichnis](README.md)

## 16. Umsetzungsreihenfolge – die offenen Teile von Stufe 20

Drei Teile standen offen: 20h und 20f sind abgenommen, 20g ist gebaut. Ihre Entscheidungen sind am **09.10.2026** getroffen, auf der
Messung von sechs vollständigen Tagen im täglichen Takt; was trotzdem offen bleibt, steht
unten ausdrücklich als offen.

**Reihenfolge** (Entscheidung des Nutzers vom 09.10.2026): **20h**, dann **20f**, dann
**20g** – danach die finalen Stufen 1, 2, 4, 5. Stufe 3 (Refactoring) ist abgetragen.
20h und 20f sind am 11.10.2026 abgenommen, 20g ist am 30.10.2026 gebaut; offen bleibt dort nur die relative Regel, messbar ab dem 03.11.2026.

**Vor 20g eingeschoben** (16.10.2026): Stufe 18g und die Frage, ob der Free Tier die Automatik noch trägt ([16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md)), dazu die Betriebswarnungen (18m, gebaut am 18.10.2026).

**Reihenfolge** (Entscheidung des Nutzers vom 20.10.2026): **20j – Store in eine GitHub Action**
nach dem Muster von 20i (gebaut am 22.10.2026, [7.4](07-4-store-preise.md); der Store-Schritt im Worker geht erst nach einem fehlerfreien Probelauf über `workflow_dispatch` und spätestens um 20:30 UTC desselben Tages vom Netz, sonst eine Nacht später; [16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md)) →
**der Markt auf 20:17 / 22:17** mit Schwelle 30 h für `markt_geprueft` und Stillstand (Nachtrag
**20i-c**, gebaut am 23.10.2026, erste Abende 23.10.; Entscheidung vom 22.10.2026, eine Änderung je Nacht) →
**20k – Spielerwertung** (gebaut am 22.10.2026, deployt am 24.10. nach der Nachtauswertung, weil sie das
Auffrischen ändert, das das Wartungsfenster jede Nacht ruft; [5.2](05-1-favorit-und-sortierung.md),
[7.5](07-5-kritikerwertungen.md); den Altbestand füllt „Auffrischen") → **18n – Obergrenze fürs
IGDB-Auffrischen** (Vorgabe des Nutzers vom 24.10.2026, gebaut am 24.10.): höchstens ⌈verknüpfte
Spiele ÷ 200⌉ Aufrufe je Nacht ([10.1](10-1-cron-schritte.md) Schritt 12) und `auffrischen_stau` zur
Kenntnis (grau) ab 11 Tagen ([Betriebswarnungen](16-2-betriebswarnungen.md)). Eigene Nacht: deployt am
25.10. nach der Nachtauswertung, scharf spätestens in der Nacht zum 01.11. → **Index-Nachtrag** für die
Auswahlen des Lage-Batches, mit dem Bestand der Lesekosten-Messung und dem Ziel, den
Wartungs-Leerlauf (rund 2 000 Zeilen je Aufruf, 23.10.2026) zu senken – er rückt vor, weil der
**Vorwärm-Versuch gestrichen** ist: „Ausgang begonnen" läuft schon vor jeder Lage
([16-2-cpu-je-schritt.md](16-2-cpu-je-schritt.md), Entscheidung vom 23.10.2026); ein Markt-Lage-Schritt
gegen die Zeilen entfällt vorerst → **18m-b** → **neu bewerten: Nachtläufe
bis 05:00 UTC und Cron je Minute** – ohne Markt und Store werden beide Fenster fast leer.

**20g vorgezogen** (Entscheidung des Nutzers vom 30.10.2026): 20g kommt **vor** Index-Nachtrag, 18m-b
und die Neubewertung. Keiner davon ist Bedingung für 20g, und 20g rechnet in den Abendläufen
(Preisschritte als Action), nicht in den Nachtfenstern. Gebaut wird bis zum 02.11., deployt frühestens
nach der Bewertung vom 02.11. – bis dahin bleibt der Worker unverändert. Gebaut am 30.10.2026
([16-2-preisalarm.md](16-2-preisalarm.md)).
Gebaut sind 18k-b (Kaufliste gebündelt, CPU gemessen am 25.10.: Median 19 statt 35–108 ms), 20i (Markt als Action, erste
volle Nacht 20.10.) und 20i-b (Frist 12 Stunden, Rückfall, Warnung; erste Nacht 21.10. wie gebaut; [16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md)).
Am 02.11.2026 wird das Budget arbeitender Aufrufe neu bewertet. Fest sind die Abhängigkeiten:

- **20g kommt nach 20i**; der Allzeittief-Auslöser bliebe bis zum 03.11.2026 ohnehin still
  (Mindesthistorie, unten). Deploy frühestens am 02.11.2026 nach der Bewertung.
- **18n kommt vor die Nacht zum 01.11.** und vor den Index-Nachtrag: Der bringt die Auffrisch-Auswahl
  auf den Teilindex aus 18n und misst den Zähler im Lage-Batch mit.
- **Der Index-Nachtrag kommt vor die Entscheidung „Cron je Minute"** ([16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md)).
  Geht der Markt in die Action, entfällt seine Auswahl im Lage-Batch (596 Zeilen je Wartungsaufruf);
  der Nachtrag betrifft dann noch IGDB-Auffrischen und Disc-Prüfung.
- **Der große Wunschlisten-Import erst nach 20i und nach der Kapazitätsfrage:** Der Weg für den
  Markt ist entschieden (GitHub Action, 19.10.2026); offen bleibt, ob die Action den größeren
  Bestand im täglichen Takt trägt, und „Cron je Minute"
  ([16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md)); was sie für den täglichen Takt heißt, steht
  unten.
- **Endlos-Scrollen** in Sammlung und Änderungsprotokoll ist gebaut (Stufe 22, 24.10.2026,
  [16-2-endlos-scrollen.md](16-2-endlos-scrollen.md)), mit ihr `paths-ignore` für Doku-Pushes ([15.2](15-repository-deployment.md)).
- **Veraltete Ansichten aufgeräumt** (Stufe 23, 29.10.2026): nur `/trophaeen` samt `GET /api/trophies`
  entfernt – Sammlung und Spieldetail zeigen dasselbe besser. Die Durchsicht aller 22 Routen fand keine
  weitere: `/pruefen` ist die einzige Stelle für „Release abtrennen" und „Sortierschlüssel neu berechnen"
  ([13.1](13-1-ansichten-listen-und-werkzeuge.md)), die übrigen Werkzeuge verlinken Offenes, Listen oder
  Feed, „Abweichungen" zeigt sonst niemand, „Anzeige" ist bewusst dauerhaft.

#### 20h – Angebotskorrektur (**abgeschlossen am 11.10.2026**)

Ein untaugliches Angebot lässt sich verwerfen und das Verwerfen zurücknehmen. Idee des Nutzers
vom 02.10.2026; sein Beispiel war *11-11: Memories Retold* für 6,98 € mit „Nur Disc" im
Angebotstitel. Gebaut wie geplant – Migration 0033, Sperrliste je Release statt Löschen, Filter
in `guenstigstesGeprueft`, zwei Routen plus eine Leseroute für die Tafel. **Der Stand steht in
[6](06-marktdaten.md), [7.3](07-3-ebay.md), [12](12-api-routen-extern-und-sync.md) und
[8.5](08-5-aenderungsprotokoll.md)**; der Bauplan ist damit aufgegangen und entfallen.

**Zwei Abweichungen vom Bauplan**, beide Entscheidungen des Nutzers vom 11.10.2026: Die
Sperrliste trägt `titel` und `preis_cents` mit (ohne sie könnte die Rücknahme nur eine Zahl
nennen), und die Rücknahme steht im Punktmenü **aller vier Ansichten** statt als Zusatzzeile
nur im Spieldetail. Dazu eine dritte, technische: Die Routen heißen `/api/sync/markt/verwerfen`
– `src/api/markt.ts` hängt unter `/api/sync`, der Bauplan nannte den Pfad ohne dieses Präfix.

**Was das Rückgängig nicht kann**, steht in [6](06-marktdaten.md): Ist das verworfene Angebot
inzwischen verkauft, holt es auch die Rücknahme nicht zurück.

#### 20f – Preisverlauf als Diagramm (**abgeschlossen am 11.10.2026**)

Je Release ein Diagramm im Spieldetail, zugeklappt, mit drei getrennten Reihen – Händler,
Markt, Store –, die nach Abschnitt 6 nie verrechnet werden. Gebaut ohne Migration: Die
Leseroute trägt `idx_price_release`, und die Verdichtung beim Lesen braucht keine neue Spalte.
**Der Stand steht in [6](06-marktdaten.md), [12](12-api-routen-extern-und-sync.md) und
[13.1](13-1-ansichten.md)**; der Bauplan ist damit aufgegangen und entfallen.

**Vier Entscheidungen des Nutzers vom 11.10.2026**: Inline-SVG statt einer Diagramm-Bibliothek;
die Reihen als **Treppe**, deren letzte Stufe bis heute läuft; **Antippen** statt Hover, weil
es auf dem Handy keines gibt; und Farbsatz **ohne Gold** – der Akzent bleibt Favoritenstern,
100 % und Platin.

**Zwei Befunde aus dem Prototyp**, die der Bauplan nicht hatte: Eine gemeinsame Preisachse
quetscht Händler und Markt platt, sobald der Store weit darüber liegt – es gibt deshalb **ein
Diagramm je Kanal**; und am Desktop braucht die Fläche mehr Höhe (120 statt 84 px), sonst läuft
die Treppe als flacher Strich durch die Breite.

**Offen, ausdrücklich:** Die Verdichtung **beim Schreiben** wird **im Januar 2027 neu
aufgerufen** – dann liegen rund zehnmal so viele Punkte vor, und erst dann greift überhaupt die
Wochenstufe der Leseverdichtung. Vorschlag war „Tageswerte 90 Tage, danach ein Wert je Woche";
zur zweiten Frage, welcher Wert je Woche überlebt (Minimum, Median, letzter), ist nichts
entschieden. Kommt sie, gehört sie in ein **drittes Cron-Fenster** – drei der fünf erlaubten
Einträge sind frei.

#### 20g – Preisalarm (**gebaut am 30.10.2026**, Deploy nach der Bewertung vom 02.11.)

Steht in [16-2-preisalarm.md](16-2-preisalarm.md): Kanal, Auslöser, Schreibweg, Oberfläche und was
offen bleibt.

#### Offen, bevor der grosse Wunschlisten-Import kommt

**Die Fensterkapazität entscheidet, ob der tägliche Takt überlebt** – und damit, ob 20f
weiter Punkte bekommt und 20g weiter melden kann. Gemessen am 09.10.2026: Der
Gebrauchtpreis-Schritt belegt **24 von 36** Aufrufen der Wartung und endet neun Minuten vor
Fensterschluss ([10.1](10-1-cron.md)). Die Decke des täglichen Takts liegt bei **520 bis 660
Releases**; im Zuschnitt sind **431**.

Die **zehn noch nicht importierten Wunschlisten** der finalen Stufe 1 brauchen diese Luft
auf – heute stammen 57 offene Wünsche aus drei Listen. **Zu entscheiden, bevor importiert
wird:** ob der Takt täglich bleibt (dann muss der Zuschnitt enger werden oder ein weiteres
Cron-Fenster dazu), oder ob er auf zwei Tage geht (dann halbiert sich die Punktdichte, die
20f und 20g tragen). Vorher ist jede Antwort eine Schätzung auf unvollständigem Bestand.

**Ungeklärt, als Befund notiert:** `rows_read_24h` stand am 09.10.2026 bei **1 212 977**.
Über einer Million ohne Import heisst laut CLAUDE.md „stimmt etwas nicht". Der gerechnete
Leerlauf einer Nacht ist 80 784, die arbeitenden Aufrufe erklären rund 60 000 weitere
(`markt` 24 × 940 – seit 20h 1 000 –, `store` 10 × 791, `jahre` 18 060) – der Rest ist **nicht erklärt**. Das
Fenster ist rollierend und enthielt einen Arbeitstag mit Deploy-Prüfungen; das ist eine
Vermutung, keine Messung – und **eine, die am 11.10.2026 nicht trug:** An dem Tag liefen zwei
Deploys samt Produktionsprüfungen, und der Zähler stand bei **282 512**. Deploy-Betrieb allein
erklärt die Million also nicht; näher liegt die Messsitzung des 09.10. selbst, die über sechs
Tage Preisverlauf und alle Releases gelesen hat. Gehört einmal eigens angesehen, blockiert
aber keine Teilstufe.

#### Offen: die CPU-Grenze, Betriebswarnungen, Nachtläufe bis 05:00 UTC

Stehen in [16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md) (die Nachträge 18i bis 20i, Budget und
Wege je Schritt), [16-2-cpu-je-schritt.md](16-2-cpu-je-schritt.md) (die Messungen je Schritt) und
[16-2-betriebswarnungen.md](16-2-betriebswarnungen.md) (Stufe 18m mit dem Nachtrag 18m-b und der
offene Punkt nach 20i).

**Die fünf finalen Stufen** – die Sammlung finalisieren, Oberfläche, Refactoring
(abgetragen), Wiederherstellungsprobe, Außendarstellung – stehen in
[16.4](16-4-finale-stufen.md).
