← [Inhaltsverzeichnis](README.md)

## 16. Umsetzungsreihenfolge – die offenen Teile von Stufe 20

Drei Teile standen offen, zwei davon (20h und 20f) sind abgenommen. Ihre Entscheidungen sind am **09.10.2026** getroffen, auf der
Messung von sechs vollständigen Tagen im täglichen Takt; was trotzdem offen bleibt, steht
unten ausdrücklich als offen.

**Reihenfolge** (Entscheidung des Nutzers vom 09.10.2026): **20h**, dann **20f**, dann
**20g** – danach die finalen Stufen 1, 2, 4, 5. Stufe 3 (Refactoring) ist abgetragen.
20h und 20f sind am 11.10.2026 abgenommen; **als Nächstes 20g** – dort ist alles entschieden außer der relativen Regel, die ab dem 03.11.2026 messbar wird.

**Vor 20g eingeschoben** (16.10.2026): Stufe 18g und die Frage, ob der Free Tier die Automatik noch trägt (unten, „Offen: die CPU-Grenze"). Wann 20g folgt, ist danach zu entscheiden.

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

#### Offen: die CPU-Grenze

Seit dem 10.10.2026 bricht die Laufzeit Cron-Aufrufe an der 10-ms-Grenze ab; kein Schritt bleibt
darunter, auch der Leerlauf nicht. **Gemessen ist seit Stufe 18h, wohin die CPU geht: in die
D1-Aufrufe** (rund 0,7 ms je Abfrage des echten Codes, ein Batch kostet je Anweisung ein
Zwanzigstel), nicht ins Rechnen ([10.1](10-1-cron.md), „Was ein Aufruf wirklich an CPU kostet").
Der Bezahlplan ist ausgeschlossen (Entscheidung des Nutzers vom 16.10.2026).

**Was daraus je Schritt folgt** – gerechnet mit den gemessenen Einzelkosten, noch nicht gebaut:

- **Leerlauf** (10 bzw. 16 Abfragen, 7–11 ms mit echter D1): unter 10 ms nur mit weniger
  Abfragen. Den größten Einzelposten im PSN-Fenster nimmt der Nachtrag unten weg.
- **Spielzeit** (217 Abfragen je Seite): der Abgleich je Titel als **ein Batch** statt 200
  einzelner Abfragen; dann rund 5 ms D1 plus 6 ms Rechnen für 200 Titel. Die Seitengröße ist im
  Code einstellbar (`GESPIELTE_JE_SEITE`); bei 100 Titeln läge eine Seite um 8 ms.
- **Sync** (5–6 Abfragen, ein Batch mit 104 Anweisungen): rund 4 ms D1, 3 ms Rechnen, dazu die
  echte Seite aus dem Netz – grenzwertig.
- **Store** (je Release ein Batch, die Seite als Strom): rund 1 ms D1 plus 3 ms Lesen je Release;
  **ein Release je Aufruf** trägt, zehn nicht. Am Stück zu lesen wäre billiger, aber dann wird die
  ganze Seite geholt (380 KB bis 1,4 MB, 7.4).
- **Gebrauchtpreise:** Die Grundlast eines Aufrufs (vier Abfragen, Sammlung laden und
  vorbereiten) liegt schon bei 5–8 ms, jedes Release kostet 3–4 ms mehr (94 ms für 20 mit echter D1). **Trägt auch mit einem
  Release je Aufruf nicht.** Die Sammlung auf Modulebene zu halten bringt nichts – **kein**
  Cron-Aufruf traf in der Messung eine warme Instanz (0 von 28 im Minutentakt). Denkbar bleibt,
  den vorbereiteten Wortindex **als eine Zeile** abzulegen (eine Abfrage statt 479 Titel zerlegen) –
  das wäre Berechnetes, das gespeichert wird, und damit eine Entscheidung des Nutzers wie bei
  „Trophäen je Jahr" (7.7). Sonst ist der Schritt der Kandidat für GitHub Actions.

**Cron je Minute** (`* * * * *` ist erlaubt): 180 statt 36 Aufrufe je Fenster, je Konto sind fünf
Einträge erlaubt, zwei sind belegt. Selbst wenn jeder Aufruf als Anfrage zählt, sind es rund 540
am Tag gegen 100 000. Eine Änderung am Cron braucht bis zu 15 Minuten, bis sie wirkt. Der
Leerlauf der Wartung läse dann rund 480 000 Zeilen je Nacht statt 96 000. **Es hilft nur Schritten,
die je Aufruf unter 10 ms bleiben** – also erst nach den Änderungen oben.

**Zu entscheiden:** je Schritt, welcher Weg – Abfragen bündeln, kleinere Portion mit Cron je Minute,
Wortindex als Zeile, oder GitHub Actions. Für GitHub Actions ist vorab zu prüfen, ob PSN die
Adressen von GitHub abweist, wie es für die Kaufliste und Cloudflares Adressen vermutet wird (7.7).

**Die Reihenfolge der Nachträge** (Entscheidung des Nutzers vom 16.10.2026), jeder einzeln
zurücknehmbar und einzeln gemessen: **18i** Token-Erneuerung im PSN-Leerlauf (gebaut, 10.1
Schritt 7) → **18j** Ablauf: ein Lese- und ein Schreib-Batch je Cron-Aufruf, gemessen am Leerlauf,
nach der Regel in CLAUDE.md (CPU-Grenze) → **18k** Spielzeit mit `IN`-Listen und **18l** Store-Leser (ein
Release je Aufruf, Bytes sammeln und einmal dekodieren statt je Stück zu suchen; ganz am Stück
wäre bei 380 KB bis 1,4 MB je Seite teurer) – beide in derselben Nacht, aber eine Nacht nach 18j,
damit ihre Wirkung nicht mit der Grundlast vermischt → nachmessen → **20i** Markt. Erst mit den
Zahlen aus 20i entscheidet der Nutzer zwischen Wortindex-Zeile, Cron je Minute und GitHub Actions.

**Danach, als eigener Nachtrag: der Marktschritt** – an der Regel „Abgleiche bereiten den Bestand
einmal vor" ausgerichtet: Titel einmal zerlegen statt je Prüfung, ein Wortindex je Aufruf statt
jedes Angebot gegen alle Spiele (Vorgabe des Nutzers vom 16.10.2026). Dazu gehört die **Auswahl,
die im Leerlauf 430 Zeilen liest** (10.1, Schritt 14). Derselbe Fehler wie bei `offen` steckt in
der Store-Zeile: `offen` zählt dort Releases ohne Stempel mit Produkt-Id im ganzen Bestand, nicht
das Fällige – nicht angefasst, notiert.

**Die fünf finalen Stufen** – die Sammlung finalisieren, Oberfläche, Refactoring
(abgetragen), Wiederherstellungsprobe, Außendarstellung – stehen in
[16.4](16-4-finale-stufen.md).
