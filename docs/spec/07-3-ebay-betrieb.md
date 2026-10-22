← [Inhaltsverzeichnis](README.md) · [7.3 eBay](07-3-ebay.md)

### 7.3 Umfang, Takt und Betrieb der Gebrauchtpreise

**Der Schritt läuft als GitHub Action** (`.github/workflows/markt.yml`, Stufe 20i), täglich um
**02:17 UTC** (Entscheidung des Nutzers vom 19.10.2026) und als **Rückfall um 08:17 UTC** (Nachtrag
20i-b, Entscheidung vom 20.10.2026), dazu von Hand über `workflow_dispatch`; der Knopf in den
Einstellungen ist entfallen. **GitHub verschiebt den Start regelmäßig um rund fünf Stunden, und
Haupt- und Rückfalllauf um denselben Betrag:** 02:17 kam am 20.10.2026 um 07:31 (5 h 14 min), am
21.10. um 07:37 (5 h 20 min), am 22.10. um 07:33 (5 h 16 min), der Rückfall 08:17 am 21.10. und am
22.10. jeweils um 13:47 (5 h 30 min). Der Rückfall
fängt also keine Verspätung auf, nur einen ausgefallenen Lauf; wer einen Zeitplan setzt, rechnet mit
dem verspäteten Start. Der Rückfall prüft dank der Frist nur, was der erste nicht geschafft hat;
zwei Läufe zugleich stellt die `concurrency`-Gruppe hintereinander. Der Markt rückt deshalb auf den
Vorabend, 20:17 / 22:17, eine Nacht nach 20j (Entscheidung vom 22.10.2026, [16.2](16-2-cpu-und-betrieb.md)).
Bis 20i lief er im Wartungsfenster des Cron, zwanzig Releases je Aufruf; dort blieb **kein einzelnes
Release unter 10 ms CPU**, und 431 Aufrufe passten in keinen Takt (Gesamtrechnung in
[16.2](16-2-cpu-und-betrieb.md)).

Die Action fragt eBay und gleicht ab, in Node ohne CPU-Grenze (`marktLauf`,
`src/sync/markt-lauf.ts`). **Die Datenbank sieht sie nie:** Sie liest die Lage über
`GET /api/sync/markt/lage` (alle fälligen Releases, die Sammlung, die ganze Sperrliste – ein
D1-Aufruf) und schreibt je Portion über `POST /api/sync/markt/ergebnisse` (Weg A, Entscheidung des
Nutzers vom 19.10.2026). Die Route liest Titel, Plattform und **Disc-Fassung selbst** und bildet den
Anbieter aus dem Verkäufer nach; vom Körper nimmt sie nur die Angebote, streng geprüft
(`angebotWahlAus`). **`MARKT_JE_POST = 6`**: höchstens sieben Anweisungen je Release, also 43 mit der
Abfrage – unter den 50 je Aufruf, die D1 dokumentiert. Startwert, nach dem ersten Lauf an der
gemessenen CPU je POST angepasst. Beginn und Ausgang vermerkt `POST /api/sync/markt/ausgang` (Bereich
`markt` und `markt_begonnen` in `cron_stand`, [10-1-cron-verlauf.md](10-1-cron-verlauf.md)); die
Meldung ist ein Code, kein Fremdtext. Das Log der Action ist öffentlich und enthält nur Zahlen.

Gefragt werden **nicht alle** Releases, sondern dieselbe Menge, die 7.4 für die Store-Preise
festlegt: was in der Lückenansicht auftaucht oder auf einer offenen Absicht steht. Ein Release wird
nach **12 Stunden** erneut fällig (`MARKT_FRIST_STUNDEN`, seit 20i-b; in 20i 20 Stunden, davor ein
Tag). Zwölf, weil der Start wandert: Nach dem Lauf um 07:31 am 20.10. wäre mit 20 Stunden am
nächsten Morgen um 02:17 nichts fällig gewesen – ein Tag ohne Punkte, still. Mit zwölf ist nach
jedem Lauf des Vortags alles fällig, und der Rückfall sechs Stunden nach einem pünktlichen Lauf
findet nichts. Mit 24 Stunden (bis 20i) rutschte, was am Vortag spät geprüft war, hinter das Fenster
(`offen=16` am 17.10., `offen=19` am 19.10.2026). **Erster Lauf unter voller Last** (20.10.2026,
alle Aufrufe IAD): 411 Releases in 69 Portionen, 494 s, 231 mit Preis, 115 ohne Angebot, nichts
übersprungen; CPU je Portion Median 2, P90 4, höchstens 15 ms (64 von 69 erfasst), Lage 7 ms. **Die
Portion bleibt bei 6** – das Budget (16.2) ist eingehalten. **Erste Nacht mit zwölf Stunden Frist**
(21.10.2026, alle Aufrufe SEA): 431 Releases in 72 Portionen, 600 s, 248 mit Preis, 120 ohne Angebot,
eine Disc-Fassung belegt, 0 offen; der Rückfall fand 0, `markt_geprueft` gesetzt, keine Warnung. Je
Portion Median 3, P90 6, höchstens 12 ms (67 von 72 erfasst). **22.10.2026** (MSP, dann ORD): 431
in 72 Portionen, 475 s, 246 mit Preis, 121 ohne Angebot, 0 offen, Rückfall leer; je Portion Median 2,
P90 4, höchstens 13 ms (71 von 72 erfasst). **Die Lage brauchte 19 ms (SEA) und 18 ms (MSP)** gegen
7 ms (IAD) am 20.10. – untersucht in [16.2](16-2-cpu-und-betrieb.md).

**Takt: täglich** (Entscheidung des Nutzers vom 02.10.2026). Nicht, weil Gebrauchtpreise sich täglich bewegen — sie tun es nicht —, sondern weil der Verlauf (20f) und der Preisalarm (20g) Punkte brauchen: Ein gleitender Median ist nur über genügend Werte robust gegen den einzelnen Verkäufer, der eine Disc für drei Euro einstellt, und melden kann ein Alarm nur, was er gesehen hat.

**Beide Kanäle kommen in den Verlauf** (`price_snapshot.kanal`, Migration 0030), jeder als eigene Reihe. Ein Händlerpreis bei rebuy oder medimops ist ein Katalogpreis und ändert sich bewusst; der Marktpreis ist das Minimum über die gerade eingestellten Angebote und springt mit jedem neuen. In einer Reihe vermischt wären beide unbrauchbar. `source` sagt weiterhin, **wer** das Angebot stellt — der kann innerhalb eines Kanals wechseln und taugt deshalb nicht als Schlüssel der Reihe. Die **Händlerreihe deckt knapp die Hälfte ab**: 116 von 250 Reihen (46 %, gemessen am 09.10.2026; am 02.10.2026 waren es 84 von 239). Die Glättung muss also die Hauptarbeit tragen, die Händlerbevorzugung ist der Bonus.

**Wie sich die beiden Reihen bewegen** – neue Tiefs, ihre Tiefe und warum ein tiefes
Markttief das Muster eines untauglichen Angebots ist – steht in
[07-3-ebay-reihen.md](07-3-ebay-reihen.md). Die Zahlen tragen den Preisalarm aus 20g.

**Was ein Lauf liest** (gemessen gegen 430 Listen, `test/lesekosten.spec.ts`): die Lage **1 721
Zeilen einmal je Lauf**, jede Portion von sechs Releases **90 gelesen und 78 geschrieben** in zwei
D1-Aufrufen. Bis 20i las der Cron je Aufruf rund 1 000 Zeilen, 24-mal je Nacht, und der
Wartungsleerlauf trug die Marktauswahl in jedem seiner Aufrufe mit (seit 20i 1 788 statt 2 218 je
Aufruf). Der Rest nach dem Lauf kommt aus **einem** Zähler, den die Ausgangsroute selbst stellt: Die
erste Fassung von 2026 las 2 059 Zeilen je Aufruf, davon 1 549 für vier Zähler, die nur in der
Verlaufszeile standen.

Der Stand steht je Zeile in `release.markt_geprueft_am`, nicht als Marke in `app_setting`: Ein abgebrochener Lauf lässt die ungeprüften Releases ungestempelt, und der nächste nimmt sie wieder. Eine gescheiterte Portion nimmt ihr Batch ganz zurück. Ob der Lauf **lief**, sagen dagegen Beginn und Ausgang unter getrennten Bereichen – ein Lauf, der nach dem Beginn stirbt, lässt `markt` auf dem letzten Ausgang stehen, und die Betriebswarnungen melden ihn (13.2, 18m).

**Keine Rohablage** (Regel in CLAUDE.md): Die Antworten sind klein, die Normalisierung ist Feldkopieren plus Titelabgleich, und jeder Abruf ist jederzeit wiederholbar.

**Drei Wege sind geprüft und verworfen** – ein Händlerfeed über AWIN, eBays strukturierter
Aspekt `Spielname` als Ersatz für den Titelabgleich und drei Quellen für „nur digital".
Die Messungen dazu stehen in [07-3-ebay-verworfen.md](07-3-ebay-verworfen.md), damit sie
nicht noch einmal gemacht werden.
