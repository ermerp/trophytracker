← [Inhaltsverzeichnis](README.md)

## 16. Umsetzungsreihenfolge – die offenen Teile von Stufe 20

Drei Teile standen offen, zwei davon (20h und 20f) sind abgenommen. Ihre Entscheidungen sind am **09.10.2026** getroffen, auf der
Messung von sechs vollständigen Tagen im täglichen Takt; was trotzdem offen bleibt, steht
unten ausdrücklich als offen.

**Reihenfolge** (Entscheidung des Nutzers vom 09.10.2026): **20h**, dann **20f**, dann
**20g** – danach die finalen Stufen 1, 2, 4, 5. Stufe 3 (Refactoring) ist abgetragen.
20h und 20f sind am 11.10.2026 abgenommen. Für 20g ist alles entschieden außer der relativen Regel, die ab dem 03.11.2026 messbar wird.

**Vor 20g eingeschoben** (16.10.2026): Stufe 18g und die Frage, ob der Free Tier die Automatik noch trägt ([16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md)), dazu die Betriebswarnungen (18m, gebaut am 18.10.2026).

**Reihenfolge** (Entscheidung des Nutzers vom 20.10.2026): **20j – Store in eine GitHub Action**
nach dem Muster von 20i (gebaut am 22.10.2026, [7.4](07-4-store-preise.md); der Store-Schritt im Worker geht erst nach einem fehlerfreien Probelauf über `workflow_dispatch` und spätestens um 20:30 UTC desselben Tages vom Netz, sonst eine Nacht später; [16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md)) →
**der Markt auf 20:17 / 22:17** mit Schwelle 30 h für `markt_geprueft` und Stillstand (Nachtrag
**20i-c**, gebaut am 23.10.2026, erste Abende 23.10.; Entscheidung vom 22.10.2026, eine Änderung je Nacht) →
**20k – Spielerwertung** (gebaut am 22.10.2026, deployt am 24.10. nach der Nachtauswertung, weil sie das
Auffrischen ändert, das das Wartungsfenster jede Nacht ruft; [5.2](05-1-favorit-und-sortierung.md),
[7.5](07-5-kritikerwertungen.md); den Altbestand füllt „Auffrischen") → **18n – Obergrenze fürs
IGDB-Auffrischen** (Vorgabe des Nutzers vom 24.10.2026): Am 24.10. trugen 420 von 478 Stempeln den
20.10., nach dem Auffrischen von Hand alle den 24.10. – ohne Grenze frischt eine Nacht je Woche
rund zehn Aufrufe zu 20–54 ms auf. Höchstens ⌈verknüpfte Spiele ÷ 200⌉ Aufrufe zu 50 je Nacht
(Frist sieben Tage plus 75 % Puffer: ein voller Stau ist bei jeder Größe nach höchstens vier Nächten
abgebaut, simuliert am 24.10.2026); die Stempel bleiben in Gruppen, die Grenze kappt nur. Dazu
`auffrischen_stau` zur Kenntnis (grau), wenn der älteste Auffrischstempel älter als 11 Tage ist
(eigene Abfrage über einen Teilindex auf `igdb_synced_at`, nicht die Auswahl). Eigene Nacht: Deploy
am 25.10. nach der Nachtauswertung, scharf spätestens in der Nacht zum 01.11. → **Index-Nachtrag** für die
Auswahlen des Lage-Batches, mit dem Bestand der Lesekosten-Messung und dem Ziel, den
Wartungs-Leerlauf (rund 2 000 Zeilen je Aufruf, 23.10.2026) zu senken – er rückt vor, weil der
**Vorwärm-Versuch gestrichen** ist: „Ausgang begonnen" läuft schon vor jeder Lage
([16-2-cpu-je-schritt.md](16-2-cpu-je-schritt.md), Entscheidung vom 23.10.2026); ein Markt-Lage-Schritt
gegen die Zeilen entfällt vorerst → **veraltete Ansichten aufräumen** (Vorgabe des Nutzers vom
21.10.2026): `/trophaeen`, die Rohliste von Sony aus Stufe 3, steht nur noch unter „Werkzeuge" und
zeigt nichts, was Sammlung und Spieldetail nicht besser zeigen – entfernen, und dabei alle Ansichten
darauf prüfen, ob es weitere solche gibt (13.1 nennt sie nicht alle). **Sie braucht keinen eigenen
Nachtplatz und kann an jedem Tag parallel laufen** (geprüft am 23.10.2026): `/trophaeen` liest nur
`GET /api/trophies` und damit `trophies.liste`, die sonst niemand ruft, auch kein Cron-Schritt. Das gilt
für diese Ansicht; jede weitere, die dabei wegfallen soll, wird ebenso geprüft → **18m-b** → **neu bewerten: Nachtläufe
bis 05:00 UTC und Cron je Minute** – ohne Markt und Store werden beide Fenster fast leer → **20g**.
Gebaut sind 18k-b (Kaufliste gebündelt, CPU um den 25.10. messen), 20i (Markt als Action, erste
volle Nacht 20.10.) und 20i-b (Frist 12 Stunden, Rückfall, Warnung; erste Nacht 21.10. wie gebaut; [16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md)).
Am 02.11.2026 wird das Budget arbeitender Aufrufe neu bewertet. Fest sind die Abhängigkeiten:

- **20g kommt nach 20i**; der Allzeittief-Auslöser bliebe bis zum 03.11.2026 ohnehin still
  (Mindesthistorie, unten). **Wann 20g kommt, ist offen.**
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

#### 20g – Preisalarm

Die Glocke in der Kopfzeile meldet einen Preis, der zur Absicht passt.

**Ein eigener Ton, nicht Gold** (Vorgabe des Nutzers vom 18.10.2026, am Prototyp von 18m): Gold liegt
zu nah am Warn-Gelb, und ein Preisalarm ist eine gute Nachricht, keine wartende Arbeit. Im Prototyp
von 20g wird ein Grün aus den Tokens (`--st-am_spielen`) neben Rot, Grau und Gelb der Glocke geprüft;
die Gruppe in der Tafel steht zwischen Warnungen und Posten ([16.2](16-2-betriebswarnungen.md), 18m).

**Der Kanal folgt der Absicht** (Entscheidung des Nutzers vom 09.10.2026) – für Alarm *und*
Anzeige: Disc-Fassung `ja` → Gebrauchtpreis, `nein` oder „physisch nicht gewünscht"
([5.3](05-3-luecke-verwerfen.md)) → Store-Preis, `unbekannt` → beide anzeigen. **Welcher Zweig
bei `unbekannt` alarmiert, entscheidet sich zur LESEZEIT** (Entscheidung des Nutzers vom
11.10.2026): Sobald eine Gebrauchtreihe besteht oder die Disc-Fassung auf `ja` steht, gilt der
Gebrauchtzweig; sonst der Store-Zweig. Damit alarmiert ein Eintrag auf dem einzigen Kanal, den
er hat, statt auf keinem – und er wechselt von selbst mit, wenn eBay später doch etwas findet.
Keine gespeicherte Zuordnung, die veralten könnte („Berechnetes nicht speichern"). Reichweite am 09.10.2026 über die 60 Releases mit offener Kauf- oder
Wunschabsicht: **48 mit `ja`** (alle mit Gebrauchtreihe), **12 mit `unbekannt`**, **0 mit
`nein`** und 0 mit verworfenem Lücken-Kauf. Der Store-Zweig ist damit heute leer und füllt
sich in der finalen Stufe 1, wo 113 der 157 offenen Releases den Befund „eBay kennt kein
Angebot" tragen; gebaut wird er trotzdem mit, sonst erbt ihn später niemand.

**Zwei Auslöser, beide entschieden:**

1. **Absolut** – eine Schwelle je offener Absicht. Das Feld bleibt **leer**, nie vorbelegt
   (Abschnitt 3): 29 der 41 Reihen auf der Wunschliste stehen schon unter 15 €, eine globale
   Vorbelegung löste sofort 29 Meldungen aus. Braucht 20f nicht und hat keine Falschmeldungen.
2. **Allzeittief**, mit vier Bedingungen zugleich: der Kanal passt zur Absicht; der Punkt ist
   das Tief **seiner** Reihe (Händler und Markt werden nie verrechnet, Abschnitt 6);
   **Mindesthistorie 30 Tage seit dem ersten Punkt der Reihe und mindestens 3 Punkte**; und
   **Mindesttiefe 10 %** unter dem bisherigen Tief. Die Mindesthistorie zählt in **Tagen,
   nicht in Punkten** – eine Reihe mit wenigen Punkten ist ein *stabiler* Preis und damit die
   bessere Grundlage. Praktische Folge: Der Alarm wird gebaut, bleibt aber **bis zum
   03.11.2026 still** (erste Punkte mit Kanal am 04.10., Store am 03.10.).

**Warum eine Mindesttiefe sein muss:** Ohne sie feuert allein die Händlerreihe rund 20-mal je
Nacht – ihre neuen Tiefs liegen im Median **3,7 %** unter dem bisherigen, zwei Drittel
flacher als 5 % ([7.3](07-3-ebay-reihen.md)). Mit 10 % bleiben auf den offenen Absichten **2,5
Meldungen je Nacht statt 5,8**, und 12 der 15 kommen aus der Marktreihe.

**Gerechnet wird im Preisschritt selbst**, nicht als eigener Cron-Schritt: Er ist der einzige
Zeitpunkt, an dem sich etwas ändern kann, er kennt den neuen Punkt schon, und „die
Nebenwirkung gehört an den Schritt, nicht an seinen Auslöser" (CLAUDE.md). Das Wartungsfenster
trägt keinen 16. Schritt ([10.1](10-1-cron.md)).

**Wie eine Meldung lebt** (Entscheidung des Nutzers vom 11.10.2026):

- **Quittiert wird durch Antippen.** Ohne Quittung stünde dasselbe Tief jede Nacht erneut da.
- **Keine Sperrfrist, sondern höchstens eine offene Meldung je Reihe.** Ein tieferes Tief
  **aktualisiert** die offene Meldung, statt eine zweite anzulegen – ein Preis, der in drei
  Nächten dreimal fällt, meldet einmal mit dem tiefsten Stand. Das ist die Antwort auf
  dieselbe Frage, die eine Sperrfrist lösen sollte, ohne eine Frist zu erfinden, die niemand
  gemessen hat.
- **Die absolute Schwelle meldet beim Unterschreiten** und wird erst wieder scharf, wenn der
  Preis über die Schwelle zurückgeht. Sonst meldete ein Eintrag, der dauerhaft darunter
  liegt, jede Nacht.
- **Stammt ein gemeldetes Tief aus einem später verworfenen Angebot (20h), entfällt die
  Meldung** – mit `price_snapshot.ebay_item_id` ist der Punkt eindeutig. **Der danach tiefste
  Punkt löst keine neue aus:** Er stand schon da, als der Nutzer das Angebot verwarf, und eine
  Korrektur soll nichts Neues melden.

**Offen, ausdrücklich:**

- **Die relative Regel** („20 % unter dem 30-Tage-Median") ist **nicht entschieden** und
  bleibt ein möglicher Nachtrag. Messbar wird sie ab dem **03.11.2026**. Dann steht auch die
  Frage, die sie technisch trägt: Der Median über `price_snapshot` ist **nicht** der Median
  des Preises – geschrieben wird nur bei Änderung, also wiegen Tage mit Bewegung schwerer.
  Richtig gerechnet braucht es eine Treppenfunktion (letzten Wert fortschreiben) oder eine
  bewusst in Kauf genommene Verzerrung.

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
