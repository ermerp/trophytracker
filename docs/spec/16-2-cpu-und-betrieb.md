← [Inhaltsverzeichnis](README.md)

## 16. Umsetzungsreihenfolge – CPU-Grenze und Betrieb

Teil von Abschnitt 16.2 (die übrigen offenen Teile: [16-2-offene-stufen.md](16-2-offene-stufen.md)),
aufgeteilt am 17.10.2026, weil die Datei die Grenze von rund 15 KB überschritt.

#### Offen: die CPU-Grenze

Seit dem 10.10.2026 bricht die Laufzeit Cron-Aufrufe an der 10-ms-Grenze ab; kein Schritt bleibt
darunter, auch der Leerlauf nicht. **Gemessen ist seit Stufe 18h, wohin die CPU geht: in die
D1-Aufrufe** (rund 0,7 ms je Abfrage des echten Codes, ein Batch kostet je Anweisung ein
Zwanzigstel), nicht ins Rechnen ([10-1-cron-cpu.md](10-1-cron-cpu.md)).
Der Bezahlplan ist ausgeschlossen (Entscheidung des Nutzers vom 16.10.2026).

**Und wo der Aufruf läuft:** Die Nacht zum 17.10.2026 zeigte, dass das CPU-Niveau mit dem Standort
des Crons wandert – vom 10. bis 16.10. lief jeder Aufruf in Singapur, davor in Newark, am 17.10.
verstreut über die USA ([10-1-cron-cpu.md](10-1-cron-cpu.md)). **Nächte werden deshalb nur je Standort verglichen.**
Ob sich der Standort festlegen lässt, wird erst **nach 18j bis 18l** recherchiert (Entscheidung des
Nutzers vom 17.10.2026).

**Was daraus je Schritt folgt** – Leerlauf, Spielzeit, Sync, Store und Gebrauchtpreise mit den
gemessenen Einzelkosten und den Nachtmessungen bis 19.10.2026 – steht in
[16-2-cpu-je-schritt.md](16-2-cpu-je-schritt.md).

**Cron je Minute** (`* * * * *` ist erlaubt): 180 statt 36 Aufrufe je Fenster, je Konto sind fünf
Einträge erlaubt, zwei sind belegt. Selbst wenn jeder Aufruf als Anfrage zählt, sind es rund 540
am Tag gegen 100 000. Eine Änderung am Cron braucht bis zu 15 Minuten, bis sie wirkt. Der
Leerlauf der Wartung läse dann fünfmal so viele Zeilen je Nacht: Der Lage-Batch liest in der
Produktion rund **2 590** Zeilen je Wartungsaufruf, **in jedem**, nicht nur im Leerlauf (gemessen am
18.10.2026, unten) – bei 180 Aufrufen rund **466 000** je Nacht statt 93 000. **Es hilft nur
Schritten, die je Aufruf unter 10 ms bleiben** – also erst nach den Änderungen oben.

**Budget arbeitender Aufrufe** (Entscheidung des Nutzers vom 19.10.2026, **Arbeitshypothese**):
Median ≤ 8 ms, P90 ≤ 10 ms über die Standorte einer Nacht, kein Aufruf über 15 ms; für den Leerlauf
gilt weiter Median um 5, P99 unter 10. Grundlage, gemessen in den Nächten 18. und 19.10.2026: Der
Leerlauf allein liegt im Median bei 5,8 ms (n = 41), dieselbe Arbeit kostet je Standort das Doppelte
bis 2,5-Fache – P99 unter 10 ließe praktisch keine Arbeit zu. Bewusst eine Wette auf die Duldung
„gelegentlicher" Überschreitungen; **neu bewertet am 02.11.2026** mit den Abbruchdaten der zwei
Wochen dazwischen ([10-1-cron-cpu.md](10-1-cron-cpu.md)).

**Die Wege je Schritt** (Entscheidungen des Nutzers vom 19.10.2026), gerechnet mit der kleinsten
sinnvollen Portion gegen dieses Budget:

- **Markt → GitHub Action – gebaut in 20i (19.10.2026):** kein einzelnes Release blieb unter 10 ms,
  und 431 Aufrufe passten in keinen Takt. **Weg A** (Entscheidung des Nutzers vom 19.10.2026): Die
  Action schreibt über Routen des Workers in Portionen, nicht direkt über die D1-Schnittstelle – die
  Regeln zu `src/db/` und zum Protokoll bleiben, kein kontoweites Token mit Schreibrecht in GitHub.
  Lauf um 02:17 UTC, Portion `MARKT_JE_POST = 6` (43 Anweisungen), Einzelheiten in
  [7.3](07-3-ebay-betrieb.md). **Erster Lauf am 19.10.2026, 11:41 UTC** per `workflow_dispatch`, alle
  Aufrufe in IAD: 20 Releases in 4 Portionen, 15 mit Preis, nichts übersprungen; CPU je Aufruf Beginn
  5 ms, Lage 6 ms, Portionen **16 / 4 / ~4 / ~4 ms** (zwei aus der Minutensumme der Analytics
  zurückgerechnet, die Logs fehlten), Ausgang 4 ms. Erwartet waren 6–10 und 5–8 ms. Woran die eine
  Portion mit 16 ms lag, ist offen (Vermutung: frische Instanz oder die meisten neuen Angebotszeilen).
  **Die Portion bleibt bei 6** – mehr verbieten die 50 Anweisungen – und wird nach der ersten Nacht
  mit voller Last (20.10.2026, rund 430 Releases, rund 72 Portionen) nur gesenkt, falls P90 über
  10 ms liegt. Der Neuabruf eines einzelnen Releases (20h) bleibt im Worker.
- **Kaufliste → gebündelt wie 18k – gebaut in 18k-b (19.10.2026):** bis dahin je Eintrag zwei bis
  drei D1-Aufrufe nacheinander, bis zu 150 Abfragen je Aufruf gegen die dokumentierten 50. Jetzt ein
  Lese-Batch (`releasesNachSchluesseln` mit `mitKauf`) und ein Schreib-Batch (`berechtigungenErkennen`,
  je Quelle Protokoll und mehrzeiliger INSERT). Gemessen in `test/lesekosten.spec.ts` an einer Seite
  mit 50 Käufen, die Ausgangszahl im unberührten Stand: **4 / 3 D1-Aufrufe** (erste / jede weitere
  Woche, mit „nur digital?" und dem Aufräumen) statt 103 / 85, **8 / 7 Anweisungen** statt 130 / 112,
  gelesen 614 / 468 statt 494 / 372 Zeilen, geschrieben unverändert 182 / 0. Die CPU zeigt die
  nächste Kaufliste-Nacht (um den 25.10.2026) – vorher 35–108 ms je Aufruf; ob die Portion von 50
  dann ins Budget passt, ist offen.
- **Store → offen bis nach dem Probelauf, jetzt zu entscheiden:** Ein Release je Aufruf ist die
  Untergrenze, rund die Hälfte läge über 10 ms. Ein Probelauf aus GitHub Actions am 19.10.2026
  (echter Store-Client, ein öffentliches Concept, zwei Anfragen) wurde **angenommen**: 200 in 0,4
  und 0,6 s, Preis gelesen. **Die Probe in voller Größe** am selben Tag, nur lesend, die Ziele mit
  der Auswahl aus dem Code: **79 Ziele, 75 Anfragen am Stück in 48 s, 200 × 74 und 302 × 1, kein
  403, kein 429**, P50 603 ms je Anfrage; vier Ziele ohne Id (bräuchten IGDB) nicht gefragt. Die
  Entscheidung über den Store fällt nach 20i (Entscheidung des Nutzers vom 19.10.2026).
- Sync, Spielzeit, Level, Jahre und IGDB bleiben im Worker. Mit 25 Titeln je Seite blieben Sync und
  Spielzeit im Budget; der Sync-Abschluss (11–14 ms) und das Level (9–21 ms) sind ungeteilt
  darüber – Ursache nicht untersucht.

**Die Reihenfolge der Nachträge** (Entscheidung des Nutzers vom 16.10.2026), jeder einzeln
zurücknehmbar und einzeln gemessen: **18i** Token-Erneuerung im PSN-Leerlauf (gebaut, 10.1
Schritt 7) → **18j** Ablauf: ein Lese- und ein Schreib-Batch je Cron-Aufruf, gemessen am Leerlauf
(gebaut am 17.10.2026) → **18k** Spielzeit mit `IN`-Listen (gebaut am 18.10.2026) und **18l** Store-Leser (gebaut am
18.10.2026: Strom behalten, nur im neuen Teil suchen; ganz am Stück wäre bei 380 KB bis 1,4 MB je
Seite teurer; die Portion bleibt bis „Cron je Minute" bei zehn) – beide in derselben Nacht, aber
eine Nacht nach 18j, damit ihre Wirkung nicht mit der Grundlast vermischt → nachmessen → **20i** Markt. Erst mit den
Zahlen aus 20i entscheidet der Nutzer zwischen Wortindex-Zeile, Cron je Minute und GitHub Actions –
und erst nach dem Index-Nachtrag für die Auswahlen des Lage-Batches (unten).

**In 20i umgesetzt: die Fristen von Markt und Store, je 20 Stunden** (`MARKT_FRIST_STUNDEN`,
`STORE_FRIST_STUNDEN`). (Vorgabe des Nutzers vom 17.10.2026, für den
Store vom 19.10.2026). Die Frist von 24 Stunden setzt jedes Release auf die Uhrzeit seiner letzten
Prüfung; was am Vortag spät im Fenster lag, wird erst nach Fensterschluss wieder fällig – in der
Nacht zum 17.10.2026 schloss das Fenster mit `offen=16`, am 19.10. mit `offen=19`. **Der Store
wandert genauso:** In der Nacht zum 19.10. prüfte er um 04:10 neun Releases, ruhte 15 Aufrufe lang
und lief ab 05:30 sechsmal – am Vortag hatte er von 05:25 bis 05:55 geprüft (Logs; die Stempel im
Bestand nicht nachgesehen). **Die kürzere Frist gilt für beide.** Jede Frist **≤ 21 Stunden** (24 minus 3 Stunden Fenster) macht alles zu Fensterbeginn
fällig; vorgeschlagen sind 20. Die Rechnung hängt an der Fensterlage und gehört mit dem Punkt
„Nachtläufe bis 05:00 UTC" unten neu geprüft.

**Für die Action übernommen, nicht mehr als eigener Nachtrag: der Marktschritt** – an der Regel „Abgleiche bereiten den Bestand
einmal vor" ausgerichtet: Titel einmal zerlegen statt je Prüfung, ein Wortindex je Aufruf statt
jedes Angebot gegen alle Spiele (Vorgabe des Nutzers vom 16.10.2026). Dazu gehört die **Auswahl,
die im Leerlauf 596 Zeilen liest** (10.1, Schritt 14; Tabelle unten). Derselbe Fehler wie bei `offen` steckt in
der Store-Zeile: `offen` zählt dort Releases ohne Stempel mit Produkt-Id im ganzen Bestand, nicht
das Fällige – nicht angefasst, notiert. Dazu gehört auch, dass diese Zählung (`offeneAnzahl`) in der
Produktion 412 Zeilen je Aufruf liest, obwohl ihr Kommentar `idx_release_store` nennt (D1-Analytics,
17.10.2026).

**Offen, aus 20i herausgenommen – Vorschlag: in den Index-Nachtrag: der Bestand der
Lesekosten-Messung** (Vorgabe des Nutzers vom 18.10.2026, „spätestens mit 20i"; nicht umgesetzt, weil
der Testbestand an rund 15 Stellen Release-Id = Spiel-Id und genau 430 Releases voraussetzt, und weil
die Marktauswahl mit ihren 59 nie geprüften Releases seit 20i nicht mehr im Lage-Batch steht – der
Wartungsleerlauf liest im Test jetzt 1 788 statt 2 218 Zeilen; **die Verschiebung entscheidet der
Nutzer**). Der Test liest im Wartungsleerlauf 2 218 Zeilen, die Produktion rund 2 590 – die drei
Auswahlen des Lage-Batches, exakt gemessen am 18.10.2026 über `meta.rows_read`, dieselben Anweisungen
aus dem Code (die Marktauswahl mit verschobener Frist, damit nichts fällig ist wie im Leerlauf):

| Auswahl | Test | Produktion | Plan | Woran der Abstand liegt |
|---|---|---|---|---|
| IGDB-Auffrischen | 431 | 480 | `SCAN game`, Sortierung über temporären Baum | **Menge** (430 gegen 479 Spiele) |
| Disc-Prüfung | 1 289 | 1 445 | `SCAN g`, je Spiel `idx_release_game` | **Menge** (430 gegen 490 Releases) |
| Gebrauchtpreise | 430 | 596 | ganzer `idx_release_markt` | **Verteilung**: 59 nie geprüfte Releases außerhalb der Auswahl (im Test 0) |

Die Schätzung „~2 870" aus der Stichprobe der D1-Analytics lag rund 10 % zu hoch; die Lücke zum Test
sind **17 %, nicht 30 %**. Der Test braucht also 479 Spiele, 490 Releases (manche Spiele mit zwei)
und 59 ungeprüfte Releases, die nie in die Auswahl kommen. **Die Ursache der Kosten selbst ist eine
andere:** Alle drei lesen im Leerlauf den ganzen Bestand, in Test und Produktion. Die IGDB-Auswahl
kann keinen Index nutzen (keiner auf `igdb_synced_at`, und `ORDER BY igdb_synced_at IS NOT NULL`
verhinderte ihn auch), die Disc-Auswahl geht von `game` statt vom kleinen Teil der Releases aus (171
`unbekannt`, davon 170 in der 30-Tage-Frist) – das ist Arbeit für einen Index-Nachtrag, nicht für
den Testbestand. **Dieser Index-Nachtrag für die drei Auswahlen kommt vor die Entscheidung „Cron je
Minute", spätestens mit 20i** (Vorgabe des Nutzers vom 18.10.2026): Bei 180 Aufrufen je Fenster
multipliziert sich gerade der Lage-Batch, und die Entscheidung soll mit den Zahlen danach fallen.

#### Betriebswarnungen (18m, 18m-b) und Nachtläufe bis 05:00 UTC

Stehen in [16-2-betriebswarnungen.md](16-2-betriebswarnungen.md).
