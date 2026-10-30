← [Inhaltsverzeichnis](README.md) · [16.2 offene Stufen](16-2-offene-stufen.md)

## 16. Umsetzungsreihenfolge – 20g Preisalarm

**Gebaut am 30.10.2026** auf `stufe-20g-preisalarm`, vorgezogen vor Index-Nachtrag, 18m-b und die
Neubewertung (Entscheidung des Nutzers vom 30.10.2026). **Deployt wird frühestens nach der
Bewertung am 02.11.2026**, bis dahin bleibt der Worker unverändert ([16-2-offene-stufen.md](16-2-offene-stufen.md)).

Die Glocke in der Kopfzeile meldet einen Preis, der zu einer offenen Absicht passt.

#### Kanal

**Der Kanal folgt der Absicht** (Entscheidung des Nutzers vom 09.10.2026), für Alarm *und*
Anzeige: Disc-Fassung `ja` → Gebrauchtpreis; `nein` oder „physisch nicht gewünscht" (verworfener
Kauf, [5.3](05-3-luecke-verwerfen.md)) → Store-Preis; `unbekannt` → **zur Lesezeit** (Entscheidung
vom 11.10.2026): Gebrauchtzweig, sobald eine Gebrauchtreihe besteht, sonst Store. Nichts davon ist
gespeichert (`alarmKanal`, `src/domain/preisalarm.ts`). Der Schritt des anderen Kanals meldet für
dieses Release nichts.

Reichweite am 09.10.2026 über die 60 Releases mit offener Absicht: 48 mit `ja`, 12 mit `unbekannt`,
0 mit `nein`. **Am 30.10.2026:** 51 im Gebrauchtzweig, **8 im Store-Zweig**, 1 ohne Reihe im
eigenen Kanal. Gebaut ist der Store-Zweig trotzdem von Anfang an – in der
finalen Stufe 1 tragen 113 der 157 offenen Releases den Befund „eBay kennt kein Angebot".

#### Zwei Auslöser, eine Meldung

1. **Grenze** am Release, „Preisalarm unter … €". **Sie sitzt am Release, nicht an der Absicht**
   (Entscheidung vom 30.10.2026): Ein Wunsch auf der Kaufliste ist eine Kopie, der Wunsch bleibt
   offen – zwei Grenzen hätten keine Regel. Wirksam und sichtbar nur bei offener Absicht. Das Feld
   bleibt **leer, nie vorbelegt** (Abschnitt 3): 29 der 41 Reihen auf der Wunschliste standen am
   09.10. unter 15 €, eine globale Vorbelegung löste sofort 29 Meldungen aus. Gemessen wird am
   tiefsten aktuellen Preis des Kanals. **Sie meldet beim Unterschreiten** und wird erst wieder
   scharf, wenn der Preis über die Grenze zurückgeht – oder die Grenze neu gesetzt wird
   (`preis_grenze_am`). **Eine neue Grenze über dem aktuellen Preis meldet beim nächsten Abendlauf**
   (Entscheidung vom 30.10.2026); das Feld sagt dann gleich „liegt schon darunter".
2. **Allzeittief**, je Reihe gerechnet – Händler und Markt werden nie verrechnet (Abschnitt 6):
   **Mindesthistorie 30 Tage** seit dem ersten Punkt der Reihe, **mindestens 3 Punkte** mit dem
   neuen, **Mindesttiefe 10 %** unter dem bisherigen Tief. Gezählt in Tagen, nicht in Punkten – eine
   Reihe mit wenigen Punkten ist ein stabiler Preis. Verworfene Angebote (20h) zählen beim Tief
   nicht mit, wie im Diagramm.

**Je Release und Kanal eine Meldung mit dem tiefsten Preis** (Entscheidung vom 30.10.2026), nicht
eine je Reihe: Am 18.10. fiel derselbe Preis in Händler- und Marktreihe desselben Titels – das wären
zwei Zeilen für ein Angebot gewesen. Bei Gleichstand zwischen Grenze und Tief trägt das Tief.

**Warum eine Mindesttiefe:** Ohne sie feuert allein die Händlerreihe rund 20-mal je Nacht – ihre
neuen Tiefs liegen im Median 3,7 % unter dem bisherigen, zwei Drittel flacher als 5 %
([7.3](07-3-ebay-reihen.md)). Gemessen am 09.10.: mit 10 % 2,5 Meldungen je Nacht statt 5,8, 12 der
15 aus der Marktreihe. **Nachgerechnet am 30.10.2026** auf den Reihen der offenen Absichten (ohne die
30-Tage-Hürde): 23 Auslöser in 23 Nächten (07.–29.10.), höchstens 4 in einer Nacht, 16 aus dem
Markt, 7 vom Händler, 0 aus dem Store.

**Wann es scharf wird:** Die ersten Punkte mit Kanal stammen vom 03.10. (Store) und 04.10.
(Gebraucht). Am 03.11.2026 haben **12 der 85** Reihen im passenden Kanal 30 Tage Geschichte und drei
Punkte; 80 erreichen die 30 Tage bis Mitte November, alle bis zum 23.11. (Stand 30.10.).

#### Wo gerechnet wird

**Im Preisschritt selbst**, nicht als eigener Cron-Schritt: Er ist der einzige Zeitpunkt, an dem
sich etwas ändern kann, und „die Nebenwirkung gehört an den Schritt". Seit 20i und 20j sind das die
Portionsrouten der Abendläufe (`POST /api/sync/markt/ergebnisse`, `/store/ergebnisse`), nicht die
Nachtfenster. Der Lese-Batch liest dazu die Lage der Releases mit offener Absicht (drei Anweisungen,
`PreisalarmRepository.lageAnweisungen`), `alarmPruefen` entscheidet, und höchstens eine Anweisung je
Release kommt **ans Ende** desselben Schreib-Batches. Sie scheitert nicht (`INSERT OR IGNORE`, UPDATE
mit Bedingung); täte sie es doch, bleibt die Portion fällig wie bei jedem anderen Fehler im Batch.

**Portion:** Mit der Meldung sind es beim Markt bis zu acht Anweisungen je Release, sechs Releases
wären 52 gewesen. **`MARKT_JE_POST` ist seit 20g 5** (5 × 8 + 4 = 44), rund 87 statt 72 Portionen je
Abend. Beim Store bleiben es 10 (10 × 4 + 4 = 44).

**Lesekosten** (`test/lesekosten.spec.ts`, Bestand von einem Jahr: 60 Absichten mit je drei Reihen zu
120 Punkten, gemessen am 30.10.2026, Ausgang gegen `main` im eigenen Worktree): Markt-Portion mit
Absicht 1 400 statt 110 Zeilen, ohne Absicht 130 statt 105, Store-Portion 1 500 statt 130, Glocke 100,
Spieldetail 42 statt 36. Die Lage liest die Punkte der Reihen und wächst mit ihnen – am 30.10. haben
die Reihen der offenen Absichten im Mittel 13 Punkte.

#### Wie eine Meldung lebt

`preis_alarm` (Migration 0037): höchstens **eine offene je Release und Kanal** (eindeutiger
Teilindex); ein tieferer Preis aktualisiert sie, ein gleicher oder höherer lässt sie stehen – ein
Preis, der dreimal fällt, meldet einmal mit dem tiefsten Stand. Keine Sperrfrist (Entscheidung vom
11.10.2026).

- **Quittiert wird über den Haken** (Entscheidung vom 30.10.2026). Der Titel führt ins Spieldetail,
  ohne zu quittieren.
- **Stammt die Meldung aus einem später verworfenen Angebot (20h), entfällt sie** (`entfallen_am`).
  Der danach tiefste Punkt löst keine neue aus – er stand schon da. **Die Rücknahme des Verwerfens
  stellt sie wieder her**, wenn zu Release und Kanal inzwischen keine andere offen ist.
- **Ohne offene Absicht** fällt eine Meldung zur Lesezeit aus der Glocke.
- **Kein Ereignis** für eine Meldung („kein Ereignis je Preis", 8.5) und keins fürs Quittieren. Die
  Grenze ist ein Feld des Releases und protokolliert als `release_geaendert`.
- `preis_alarm` wird exportiert: Ohne sie stünden nach einer Wiederherstellung alle quittierten
  Meldungen wieder offen da (14.2).

#### Oberfläche

**Ton Türkis `--preisalarm` (#39b5a4)** – eine gute Nachricht, keine wartende Arbeit. Gold liegt zu
nah am Warn-Gelb (Vorgabe vom 18.10.2026), das Grün von „am Spielen" ist zugleich PS Vita und wäre
neben einem Vita-Kennzeichen doppeldeutig (Entscheidung vom 30.10.2026, am Prototyp). **Die Glocke
wird türkis**, sobald ein Preisalarm offen ist: Rangfolge Rot → Preis → Posten → zur Kenntnis
([13.2](13-2-darstellungsregeln.md)). Die Gruppe „Preise" steht in der Tafel zwischen „Handeln" und
„Offene Posten": Titel mit Plattform, darunter Reihe, Preis und Grund, rechts der Haken. Das Feld
„Preisalarm unter … €" steht in der Release-Karte unter den Preisen und sagt, für welchen Kanal es
gerade gilt.

#### Offen, ausdrücklich

- **Die relative Regel** („20 % unter dem 30-Tage-Median") ist **nicht entschieden** und bleibt ein
  möglicher Nachtrag, messbar ab dem 03.11.2026. Der Median über `price_snapshot` ist **nicht** der
  Median des Preises – geschrieben wird nur bei Änderung, Tage mit Bewegung wiegen schwerer. Richtig
  gerechnet braucht es eine Treppenfunktion oder eine bewusst in Kauf genommene Verzerrung.
- **Vor dem ersten Lauf, der Meldungen schreibt** (ab dem 03.11.), wird die vollständige Liste
  dessen vorgelegt, was auslösen würde (CLAUDE.md, automatischer Schreibpfad).
- **CPU der Portionsrouten** nach dem Deploy an der Telemetry messen; ob die Action mit 87 Portionen
  grün bleibt.
