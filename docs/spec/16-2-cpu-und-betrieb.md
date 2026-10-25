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
  Lauf seit 20i-c um 20:17 UTC mit Rückfall um 22:17 (vorher 02:17 / 08:17), Portion `MARKT_JE_POST = 6` (43 Anweisungen),
  Einzelheiten in [7.3](07-3-ebay-betrieb.md). **Erster Lauf am 19.10.2026, 11:41 UTC** per `workflow_dispatch`, alle
  Aufrufe in IAD: 20 Releases in 4 Portionen, 15 mit Preis, nichts übersprungen; CPU je Aufruf Beginn
  5 ms, Lage 6 ms, Portionen **16 / 4 / ~4 / ~4 ms** (zwei aus der Minutensumme der Analytics
  zurückgerechnet, die Logs fehlten), Ausgang 4 ms. Erwartet waren 6–10 und 5–8 ms. Woran die eine
  Portion mit 16 ms lag, ist offen (Vermutung: frische Instanz oder die meisten neuen Angebotszeilen).
  **Erste Nacht mit voller Last (20.10.2026):** 411 Releases in 69 Portionen, CPU je Portion Median 2,
  P90 4, höchstens 15 ms – im Budget; **die Portion bleibt bei 6**, mehr verbieten die 50 Anweisungen.
  GitHub startete den Lauf 5 h 14 min zu spät (07:31 statt 02:17); daraus Nachtrag **20i-b**: Frist
  12 statt 20 Stunden, Rückfall um 08:17, Warnung bei leeren Läufen (7.3, [Betriebswarnungen](16-2-betriebswarnungen.md)). **Nacht zum 21.10.2026:**
  20i-b wirkt wie gebaut – 431 geprüft, Rückfall leer, je Portion Median 3, höchstens 12 ms; beide
  Läufe kamen wieder gut fünf Stunden zu spät (7.3), am 22.10. ebenso. Der Neuabruf eines einzelnen Releases (20h) bleibt im Worker.
- **Kaufliste → gebündelt wie 18k – gebaut in 18k-b (19.10.2026):** bis dahin je Eintrag zwei bis
  drei D1-Aufrufe nacheinander, bis zu 150 Abfragen je Aufruf gegen die dokumentierten 50. Jetzt ein
  Lese-Batch (`releasesNachSchluesseln` mit `mitKauf`) und ein Schreib-Batch (`berechtigungenErkennen`,
  je Quelle Protokoll und mehrzeiliger INSERT). Gemessen in `test/lesekosten.spec.ts` an einer Seite
  mit 50 Käufen, die Ausgangszahl im unberührten Stand: **4 / 3 D1-Aufrufe** (erste / jede weitere
  Woche, mit „nur digital?" und dem Aufräumen) statt 103 / 85, **8 / 7 Anweisungen** statt 130 / 112,
  gelesen 614 / 468 statt 494 / 372 Zeilen, geschrieben unverändert 182 / 0. **Kaufliste-Nacht zum
  25.10.2026:** 11–26 ms je Aufruf, Median 19 (n = 15) statt 35–108 – gut die Hälfte weniger, aber
  über dem Budget; ob die Portion von 50 kleiner wird, ist offen ([16-2-cpu-je-schritt.md](16-2-cpu-je-schritt.md)).
- **Store → GitHub Action nach dem Muster von 20i: Stufe 20j** (Entscheidungen des Nutzers vom
  20.10.2026; **gebaut und deployt am 22.10.2026**: Teil A 15:40 UTC, Probelauf 16:47 fehlerfrei,
  Teil B – Store aus dem Worker – gegen 16:55; [7.4](07-4-store-preise.md)). Die ersten
  Abendläufe (22. und 23.10., vollständig) stehen in [16-2-cpu-je-schritt.md](16-2-cpu-je-schritt.md). Wie beim Markt: **Frist 12 Stunden**, **eigene
  Workflow-Datei** und **eigenes Service Token `github-store`** (15.3). **Zeitplan** (Vorgabe des
  Nutzers vom 21.10.2026, ersetzt 01:47 / 07:47): **auch mit fünf Stunden Verspätung vor 05:00 UTC
  fertig, also der Hauptlauf am Vorabend** – GitHub verschiebt beide Läufe gleich weit (7.3). Bei der
  größten gemessenen Verspätung (5 h 30 min) muss der Rückfall spätestens gegen 23:15 UTC geplant sein.
  **Geprüft am 21.10.2026, was ein Lauf vor dem Sync bedeutet:** Der **Store** braucht nichts aus der
  Nacht – seine Ziele sind offene Absichten und `nein`-Releases ohne erkannten Kauf
  (`zuPruefenBaustein`); im PSN-Fenster stand er nur wegen der Kette. Der Kauf aus der Kaufliste
  (wöchentlich, nach dem Sync) schließt ein Release einen Lauf später aus, wie heute. Der **Markt**
  braucht den Sync: Ein Release wird erst Lücke, wenn `trophy_progress.progress_pct > 0` (`FAELLIG_IN_AUSWAHL`) –
  ein frisch begonnenes Spiel käme pünktlich am Vorabend rund 17 Stunden nach dem Sync dran; schon
  heute läuft 02:17 pünktlich *vor* dem Sync (23 Stunden), nur verspätet danach. Ein Lauf, der in
  den Sync fällt, liest einen älteren Stand, mehr nicht. Der **Preisverlauf** verträgt den Wechsel des
  UTC-Tags: geschrieben wird nur bei Änderung, der Tageseimer nimmt den letzten Punkt (6, 20f).
  **Entschieden am 22.10.2026:** Store um **20:47 mit Rückfall 22:47 UTC**, der Markt eine Nacht
  später auf **20:17 / 22:17** – gebaut als Nachtrag **20i-c** (23.10.2026), erste Abende 23.10.;
  Stillstand und `markt_leer` nach **30 h** wie beim Store (Entscheidung vom 23.10.2026: 24 h plus
  größte Verspätung 5 h 30; die kleinere am Abend ändert daran nichts). Die 26 h lagen unter dem größten
  Abstand zweier prüfender Läufe (pünktlich 02:17, am Folgetag 07:37: 29 h 20 min). Bis dahin endete
  der Markt um 07:38–07:48 und verfehlte die Vorgabe „bis 05:00" (unten) selbst. **Der
  Store-Schritt im Worker wird erst abgeschaltet**, wenn ein Lauf über `workflow_dispatch`
  vollständig und fehlerfrei durchgelaufen ist.
  Die Concept-Ids holt der
  Worker über eine eigene Route – die IGDB-Zugangsdaten bleiben im Worker (7.6); der Einzelabruf
  einer Adresse bleibt im Worker wie der Neuabruf in 20h. Ein Release je Aufruf ist im Cron die
  Untergrenze, rund die Hälfte läge über 10 ms; am 20.10. 29–41 ms je Aufruf zu zehn Releases. Ein Probelauf aus GitHub Actions am 19.10.2026
  (echter Store-Client, ein öffentliches Concept, zwei Anfragen) wurde **angenommen**: 200 in 0,4
  und 0,6 s, Preis gelesen. **Die Probe in voller Größe** am selben Tag, nur lesend, die Ziele mit
  der Auswahl aus dem Code: **79 Ziele, 75 Anfragen am Stück in 48 s, 200 × 74 und 302 × 1, kein
  403, kein 429**, P50 603 ms je Anfrage; vier Ziele ohne Id (bräuchten IGDB) nicht gefragt.
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

**Die Fristen von Markt und Store** (`MARKT_FRIST_STUNDEN`, `STORE_FRIST_STUNDEN`): in 20i je 20
Stunden (Vorgabe des Nutzers vom 17.10.2026, für den Store vom 19.10.2026); **der Markt seit 20i-b
zwölf**, weil GitHub den Start der Action verschiebt (7.3) – der Store bleibt bei 20, sein Cron ist
pünktlich (Entscheidung vom 20.10.2026). **In der Nacht zum 20.10. lief der Store am Stück**, 04:10
bis 04:45, ohne Lücke. Die Frist von 24 Stunden setzt jedes Release auf die Uhrzeit seiner letzten
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

**Der Bestand der Lesekosten-Messung kommt in den Index-Nachtrag** (Entscheidung des Nutzers vom
20.10.2026; Vorgabe vom 18.10.2026, „spätestens mit 20i"; dort nicht umgesetzt, weil
der Testbestand an rund 15 Stellen Release-Id = Spiel-Id und genau 430 Releases voraussetzt, und weil
die Marktauswahl mit ihren 59 nie geprüften Releases seit 20i nicht mehr im Lage-Batch steht). **Der Nachtrag soll auch den
Wartungs-Leerlauf senken** (rund 1 800 Zeilen je Aufruf); seine CPU blieb am 20.10. ohne die
Marktauswahl bei Median 7 ms ([16-2-cpu-je-schritt.md](16-2-cpu-je-schritt.md)). **Die Lage der
Markt-Action** brauchte am 21. und 22.10. 19 und 18 ms (SEA, MSP) gegen 7 ms (IAD) am 20.10.; untersucht
am 22.10. als Teil der Planung von 20j (Vorgabe des Nutzers), Ergebnis in
[16-2-cpu-je-schritt.md](16-2-cpu-je-schritt.md). Der Test liest im Wartungsleerlauf seit 20i
**1 788 Zeilen** – die 2 218 der Tabelle ohne die Zeile Gebrauchtpreise, die nicht mehr im Lage-Batch
steht. **Die Tabelle ist der Stand vom 18.10.2026, vor 20i:** Test 2 218, Produktion rund 2 590, die drei
Auswahlen des Lage-Batches, exakt gemessen über `meta.rows_read`, dieselben Anweisungen
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
