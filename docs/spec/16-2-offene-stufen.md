← [Inhaltsverzeichnis](README.md)

## 16. Umsetzungsreihenfolge – die offenen Teile von Stufe 20

Drei Teile stehen offen. Ihre Entscheidungen sind am **09.10.2026** getroffen, auf der
Messung von sechs vollständigen Tagen im täglichen Takt; was trotzdem offen bleibt, steht
unten ausdrücklich als offen.

**Reihenfolge** (Entscheidung des Nutzers vom 09.10.2026): **20h**, dann **20f**, dann
**20g** – danach die finalen Stufen 1, 2, 4, 5. Stufe 3 (Refactoring) ist abgetragen.

#### 20h – Angebotskorrektur (die nächste Teilstufe)

Ein untaugliches Angebot lässt sich verwerfen; das Angebot wird dauerhaft übergangen, seine
Punkte verschwinden aus dem Verlauf, und das nächstgünstigste wird sofort nachgeladen. Idee
des Nutzers vom 02.10.2026; sein Beispiel war *11-11: Memories Retold* für 6,98 € mit „Nur
Disc" im Angebotstitel. Dieselbe Regel wie bei Zuordnungen – was halb- oder vollautomatisch
entsteht, muss sich zurücknehmen lassen (CLAUDE.md) –, nur bisher nicht für Preise.

**Herausgelöst aus 20g und vorgezogen** (09.10.2026). Drei gemessene Gründe: Jeder Tag
schreibt **157 Punkte** ohne Angebotskennung, die später nicht mehr zuzuordnen sind; **13 %**
der Markttreffer liegen unter der Hälfte des Händlerpreises und sind damit Kandidaten für ein
untaugliches Angebot ([7.3](07-3-ebay.md)); und der Allzeittief-Alarm aus 20g würde genau
dieses Muster als Meldung erben.

**Der vollständige Bauplan steht in [16.3](16-3-stufe-20h.md)** – Migration, Filter, Routen,
Oberfläche, Tests und Abnahme, so festgehalten, dass eine neue Sitzung danach bauen kann.

#### 20f – Preisverlauf als Diagramm

**Preisverlauf als Diagramm** (wie Idealo oder SteamDB), zwei getrennte Reihen je Release — die ruhige Händlerkurve und die springende Marktkurve; der Store-Preis ist seit Stufe 21 der dritte Kanal, der nach Abschnitt 6 **nie** mit dem Gebrauchtpreis verrechnet werden darf.

**Gebraucht wird dafür erst eine Leseroute:** `price_snapshot` wird heute nur geschrieben (`src/db/store.ts`, `src/db/markt.ts`) und exportiert – keine Route liest es. Der Routenkatalog in [12](12-api-routen-extern-und-sync.md) führt sie deshalb nicht; sie kommt mit dieser Stufe dazu. Sie **filtert die Punkte verworfener Angebote aus** (20h) – das ist die Bedingung beim Lesen, die dort an die Stelle eines Löschens tritt.

**Verdichtet wird nur beim Lesen** (Entscheidung des Nutzers vom 09.10.2026). Der Bestand
bleibt vollständig; die Leseroute liefert je Reihe höchstens rund 120 Punkte – tageweise im
nahen Bereich, wochenweise weiter hinten, gerechnet in SQL. Begründung und Zahlen:

- Ein Diagramm auf 360 px kann keine 365 Punkte zeigen; die Verdichtung beim Lesen löst
  **das** Problem, das 20f tatsächlich hat.
- Der Speicher ist das kleinere Problem: **7,3 MB im Jahr** gegen 2,2 MB mit Verdichtung beim
  Schreiben ([6](06-marktdaten.md)). Für D1 ist beides belanglos; es zählt, dass der
  wöchentliche Dump den Zuwachs dauerhaft in die Historie des Backup-Repositorys trägt
  ([14.2](14-backup-export.md)).
- Verdichten beim Schreiben ist **jederzeit nachholbar** und die einzige der drei Varianten,
  die Daten unumkehrbar vernichtet. Sie hätte heute auf sechs Tagen Messung entschieden
  werden müssen und bräuchte einen täglichen Cron-Schritt dort, wo das Wartungsfenster am
  engsten ist ([10.1](10-1-cron.md)), plus einen Index auf `captured_at`.

**Offen, ausdrücklich:** Die Verdichtung **beim Schreiben** wird **im Januar 2027 neu
aufgerufen** – dann liegen rund zehnmal so viele Punkte vor. Vorschlag war „Tageswerte 90
Tage, danach ein Wert je Woche"; zur zweiten Frage, welcher Wert je Woche überlebt (Minimum,
Median, letzter), ist nichts entschieden. Kommt sie, gehört sie in ein **drittes
Cron-Fenster** – drei der fünf erlaubten Einträge sind frei.

#### 20g – Preisalarm

Die Glocke in der Kopfzeile meldet einen Preis, der zur Absicht passt.

**Der Kanal folgt der Absicht** (Entscheidung des Nutzers vom 09.10.2026) – für Alarm *und*
Anzeige: Disc-Fassung `ja` → Gebrauchtpreis, `nein` oder „physisch nicht gewünscht"
([5.3](05-3-luecke-verwerfen.md)) → Store-Preis, `unbekannt` → beide anzeigen, **nicht**
alarmieren. Reichweite am 09.10.2026 über die 60 Releases mit offener Kauf- oder
Wunschabsicht: **48 mit `ja`** (alle mit Gebrauchtreihe), **12 mit `unbekannt`**, **0 mit
`nein`** und 0 mit verworfenem Lücken-Kauf. Der Store-Zweig ist damit heute leer und füllt
sich in der finalen Stufe 1, wo 113 der 157 offenen Releases den Befund „eBay kennt kein
Angebot" tragen; gebaut wird er trotzdem mit, sonst erbt ihn später niemand.

**Zwei Regeln, beide entschieden:**

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
flacher als 5 % ([7.3](07-3-ebay.md)). Mit 10 % bleiben auf den offenen Absichten **2,5
Meldungen je Nacht statt 5,8**, und 12 der 15 kommen aus der Marktreihe.

**Gerechnet wird im Preisschritt selbst**, nicht als eigener Cron-Schritt: Er ist der einzige
Zeitpunkt, an dem sich etwas ändern kann, er kennt den neuen Punkt schon, und „die
Nebenwirkung gehört an den Schritt, nicht an seinen Auslöser" (CLAUDE.md). Das Wartungsfenster
trägt keinen 16. Schritt ([10.1](10-1-cron.md)).

**Offen, ausdrücklich:**

- **Die relative Regel** („20 % unter dem 30-Tage-Median") ist **nicht entschieden** und
  bleibt ein möglicher Nachtrag. Messbar wird sie ab dem **03.11.2026**. Dann steht auch die
  Frage, die sie technisch trägt: Der Median über `price_snapshot` ist **nicht** der Median
  des Preises – geschrieben wird nur bei Änderung, also wiegen Tage mit Bewegung schwerer.
  Richtig gerechnet braucht es eine Treppenfunktion (letzten Wert fortschreiben) oder eine
  bewusst in Kauf genommene Verzerrung.
- **Ob `unbekannt` ohne jede Gebrauchtreihe in den Store-Zweig fällt.** Tendenz des Nutzers
  vom 09.10.2026: **ja, Store-Zweig.** Es betrifft 12 der 60 offenen Einträge: Sie haben
  keine Gebrauchtreihe – deshalb sind sie unbekannt, eBay kennt dort nichts –, aber alle zwölf
  haben einen Store-Preis. „Beide anzeigen, nicht alarmieren" heißt dort also, dass der
  einzige vorhandene Kanal nichts auslöst. Entschieden wird es, wenn 20g geplant wird.
- **Quittierung und Sperrfrist.** Ohne Quittung stünde dasselbe Tief jede Nacht erneut da;
  ohne Sperrfrist meldet ein Preis, der in drei Nächten dreimal fällt, dreimal. Hängt am
  Entwurf der Glocke.
- **Ob ein Allzeittief aus einem später verworfenen Angebot (20h) seine Meldung rückwirkend
  verliert.** Technisch trägt es: Mit `price_snapshot.ebay_item_id` ist der Punkt eindeutig.

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
(`markt` 24 × 940, `store` 10 × 791, `jahre` 18 060) – der Rest ist **nicht erklärt**. Das
Fenster ist rollierend und enthielt einen Arbeitstag mit Deploy-Prüfungen; das ist eine
Vermutung, keine Messung. Gehört einmal eigens angesehen, blockiert aber keine Teilstufe.

**Die fünf finalen Stufen** – die Sammlung finalisieren, Oberfläche, Refactoring
(abgetragen), Wiederherstellungsprobe, Außendarstellung – stehen in
[16.4](16-4-finale-stufen.md).
