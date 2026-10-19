← [Inhaltsverzeichnis](README.md)

## 16. Umsetzungsreihenfolge – CPU-Grenze und Betrieb

Teil von Abschnitt 16.2 (die übrigen offenen Teile: [16-2-offene-stufen.md](16-2-offene-stufen.md)),
aufgeteilt am 17.10.2026, weil die Datei die Grenze von rund 15 KB überschritt.

#### Offen: die CPU-Grenze

Seit dem 10.10.2026 bricht die Laufzeit Cron-Aufrufe an der 10-ms-Grenze ab; kein Schritt bleibt
darunter, auch der Leerlauf nicht. **Gemessen ist seit Stufe 18h, wohin die CPU geht: in die
D1-Aufrufe** (rund 0,7 ms je Abfrage des echten Codes, ein Batch kostet je Anweisung ein
Zwanzigstel), nicht ins Rechnen ([10.1](10-1-cron.md), „Was ein Aufruf wirklich an CPU kostet").
Der Bezahlplan ist ausgeschlossen (Entscheidung des Nutzers vom 16.10.2026).

**Und wo der Aufruf läuft:** Die Nacht zum 17.10.2026 zeigte, dass das CPU-Niveau mit dem Standort
des Crons wandert – vom 10. bis 16.10. lief jeder Aufruf in Singapur, davor in Newark, am 17.10.
verstreut über die USA ([10.1](10-1-cron.md)). **Nächte werden deshalb nur je Standort verglichen.**
Ob sich der Standort festlegen lässt, wird erst **nach 18j bis 18l** recherchiert (Entscheidung des
Nutzers vom 17.10.2026).

**Was daraus je Schritt folgt** – gerechnet mit den gemessenen Einzelkosten:

- **Leerlauf – gebaut in 18j:** zwei D1-Aufrufe statt zehn (Wartung) bzw. 16 (PSN, gemessen in 18h vor 18i), ein
  Lese- und ein Schreib-Batch ([10.1](10-1-cron.md), „Ein Lese- und ein Schreib-Batch"). Vorher 7–11 ms
  mit echter D1 in der Messung von 18h. **Gemessen in der Nacht zum 18.10.2026** (alle 72 Aufrufe
  `success`, keiner ohne Ausgang): Wartungs-Leerlauf 4,1–7,5 ms, Median 4,8 (n = 12; SJC 4,5 gegen
  10,9–12,9 am 17.10., EWR 4,1–5,5, DFW 4,4–7,5) – die Vermutung von 3–6 ms trifft im Median, drei
  von zwölf lagen darüber, alle unter 10. **Nacht zum 19.10.2026:** PSN-Leerlauf erstmals gemessen,
  4,5–8,7 ms, Median 5,7 (n = 15; EWR 4,5/4,7, IAD 5,1–8,6, ATL 5,4–8,7; am 17.10. EWR 11,5, IAD ~16,
  ATL ~17); Wartungs-Leerlauf 4,5–13,8, Median 7,3 (n = 14), **zwei über 10** (ORD 13,8, SJC 12,3).
  Über beide Nächte und Fenster: Median 5,8 ms (n = 41) – der Leerlauf allein füllt das Budget von
  ~5 ms. Am 18.10. **gab es den PSN-Leerlauf nicht:** In einer Kaufliste-Nacht
  belegt die Arbeit alle 36 Aufrufe (Sync 11, Spielzeit 2, Besitz 15, Level 1, Store 7, der Store
  fertig im letzten); Vergleichswerte vom 17.10.: EWR 11,5 ms, IAD ~16, ATL ~17, ORD ~13,5. Sync,
  Store und Markt blieben je Standort unverändert – 18j spart den Rahmen, nicht die Arbeit. **Die
  zwei D1-Aufrufe sind in der Produktion nicht zählbar** (die D1-Analytics zählen Anweisungen, als
  Stichprobe; D1 zählt nicht als `subrequests`): In den Leerlauf-Minuten kamen nur die zwölf
  Anweisungsarten der beiden Batches vor. Die Zahl selbst hält `test/cron-lage.spec.ts`.
- **Spielzeit – gebaut in 18k (18.10.2026):** Kandidaten der ganzen Seite in `IN`-Listen zu je
  100 Schlüsseln (`releasesNachSchluesseln`) in **einem** Lese-Batch, die Seite als mehrzeilige
  Upserts zu je zwölf Titeln in **einem** Schreib-Batch. **2 D1-Aufrufe je Seite statt 217**,
  gemessen in `test/lesekosten.spec.ts` (200 Titel, die Hälfte zugeordnet), die Ausgangszahl im
  unberührten Stand: gelesene Zeilen 1 100 / 1 300 (erste / jede weitere Nacht) statt 900 / 1 100,
  geschrieben unverändert 600 / 400. **Erwartung, nicht gemessen:** aus den Einzelkosten von 18h
  rund 3 ms D1 plus 6 ms Rechnen – also weiter grenzwertig; die Seitengröße bleibt bei 200
  (`GESPIELTE_JE_SEITE`). **Gemessen in der Nacht zum 19.10.2026:** EWR 18,6 ms (200 Titel), IAD
  29,3 ms (179) gegen EWR 115–150 und ORD 119–148 vorher – **rund 85 % weniger**, aber doppelt so
  viel wie erwartet und weiter über 10.
- **Sync** (5–6 Abfragen, ein Batch mit 104 Anweisungen): rund 4 ms D1, 3 ms Rechnen, dazu die
  echte Seite aus dem Netz – grenzwertig.
- **Store** (je Release ein Batch, die Seite als Strom): rund 1 ms D1 plus 3 ms Lesen je Release;
  **ein Release je Aufruf** trägt, zehn nicht. Am Stück zu lesen wäre billiger, aber dann wird die
  ganze Seite geholt (380 KB bis 1,4 MB, 7.4). **Leser gebaut in 18l (18.10.2026):** weiter ein
  Strom, aber gesucht wird nur im neuen Teil, behalten nur der Rest (`BlockStrom`, 7.4). **Ob das die
  3 ms trifft, ist offen:** In Node (nachgebaute Seite, 1 MB, Block bei 67 KB) liegen alter und neuer
  Leser ab 4-KB-Stücken kalt wie warm unter 1,1 ms, nur bei 1-KB-Stücken warm 0,70 gegen 0,21 ms – die
  3 ms sitzen vermutlich in den Stücken selbst, nicht in der Suche (Vermutung). **Die Portion bleibt
  bei zehn** (Entscheidung des Nutzers vom 18.10.2026): Für 79 Ziele (18.10.: 53 PS4, 22 PS5, 4 PS3)
  bräuchte ein Release je Aufruf rund 75 Aufrufe, frei sind ohne Kaufliste 22 – kein PSN-Leerlauf
  mehr, nur ~22 frische Preise je Nacht. **Gemessen in der Nacht zum 19.10.2026** (Aufruf minus
  Leerlauf desselben Standorts, geteilt durch Releases): **2,2–6,1 ms je Release** (EWR 2,2, MIA und
  ATL 2,2–2,9, ORD 3,1–4,3, IAD 6,1); am 18.10., vor 18l, 3,0–6,5. **Eine Wirkung von 18l ist im
  Produktionsmaß nicht zu sehen.** Ins Budget von ~5 ms passt kein Release, denn der Leerlauf allein
  braucht es; ein Release je Aufruf läge bei rund 7 (EWR) bis 12 ms (IAD). **Die Portion fällt mit
  „Cron je Minute"** – offen.
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
Wochen dazwischen ([10.1](10-1-cron.md)).

**Die Wege je Schritt** (Entscheidungen des Nutzers vom 19.10.2026), gerechnet mit der kleinsten
sinnvollen Portion gegen dieses Budget:

- **Markt → GitHub Action**, als Stufe 20i: kein einzelnes Release bleibt unter 10 ms, und 431
  Aufrufe passen in keinen Takt. Wie die Action schreibt – Worker-Route in Portionen oder direkt
  über die D1-Schnittstelle –, ist **offen** (Plan vom 19.10.2026).
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
  und 0,6 s, Preis gelesen. Wie Sony auf 80 bis 240 Anfragen am Stück antwortet, sagt er nicht.
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

**Für 20i vorgemerkt: die Fristen von Markt und Store** (Vorgabe des Nutzers vom 17.10.2026, für den
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

**Für 20i vorgemerkt, spätestens dort: der Bestand der Lesekosten-Messung** (Vorgabe des Nutzers vom
18.10.2026). Der Test liest im Wartungsleerlauf 2 218 Zeilen, die Produktion rund 2 590 – die drei
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

#### Stufe 18m: Betriebswarnungen in der App (gebaut am 18.10.2026)

Anforderung des Nutzers vom 17.10.2026: im Alltag mitbekommen, wenn die Automatik Probleme hat; vor
20g. Entscheidungen vom 18.10.2026. **Keine Migration, kein Eingriff in den Cron.** **Die Fakten
schreibt der Cron, das Urteil entsteht beim Lesen:** `GET /api/betrieb/warnungen` liest `cron_stand`
([10-1-cron-verlauf.md](10-1-cron-verlauf.md)), die zwei jüngsten Nacht-Syncs, Status und
Ablaufzeiten des Zugangs (nie das Geheimnis), die kürzeste gemessene Lebensdauer aus `psn_zugang`,
den Sicherungsstand und `fehlerAm` der Kaufliste in **einem** Batch aus Bausteinen
(`src/db/betrieb.ts`); `urteile` in `src/domain/betrieb.ts` fällt das Urteil, rein und ohne Uhr.
Gespeichert wird nichts: Eine Warnung verschwindet, sobald ihre Fakten sie nicht mehr tragen, und ein
ganz ausgefallener Cron fällt gerade deshalb auf. Die drei Warnungen, die bis 18m das Frontend aus
drei Antworten zusammensetzte, kommen von hier. **Kosten, gemessen als Route im Stand nach einer
Nacht** (`test/lesekosten.spec.ts`): ein D1-Aufruf, **10** gelesene Zeilen je Öffnen des Dashboards.
Die CPU der Route wird nach dem Deploy an `workersInvocationsAdaptive` gemessen.

| Regel | Stufe |
|---|---|
| Ein Bereich seit über **26 h** ohne vermerkten Ausgang; fehlt der Stand ganz, eine Warnung | rot |
| Zugang abgelaufen – **sofort**, unabhängig von der Zahl der Nächte; ein Sync, der daran scheitert, wird nicht zusätzlich gemeldet | rot |
| Zugang endet in ≤ **3** / ≤ **14** Kalendertagen (Ortszeit) – das frühere von Sonys Ankündigung und „eingetragen + kürzeste gemessene Lebensdauer" (7.1) | rot / zur Kenntnis |
| Nacht-Sync gescheitert, jünger als 24 h: **zwei aufeinanderfolgende UTC-Nächte** / eine | rot / zur Kenntnis |
| Sicherung älter als acht Tage oder keine (14.2) | rot |
| Kette ohne Ausgang, gemeldet in den letzten 24 h | zur Kenntnis |
| Letzter Ausgang eines Bereichs mit Meldung, jünger als 24 h (außer dem schon gemeldeten Sync) | zur Kenntnis |
| Kaufliste mit `fehlerAm` von heute oder gestern | zur Kenntnis |
| Schritt nach Fensterschluss nicht fertig (`offen > 0`) | zur Kenntnis, **ruht bis 20i** (`FENSTERREGEL_SCHARF`) – sonst jede Nacht (`offen=18` am 18.10.) |

**Das Zugangsende ist nicht Sonys Datum** (Entscheidung des Nutzers vom 18.10.2026, nachdem der Plan
7.1 übersehen hatte): Sony kündigte rund 60 Tage an, der erste Zugang hielt 25. Für den Zugang vom
29.09.2026 heißt das „hält vermutlich bis um den 24.10.", Sony nennt den 28.11. Die Einstellungen
lesen dieselbe Rechnung. Zeiten und Daten im Satz stehen in Ortszeit (Europe/Berlin). **Kurze Fehler,
die sich im nächsten Aufruf selbst beheben, zeigt 18m nicht:** `cron_stand` hält je Bereich nur den
letzten Ausgang (Nachtrag 18m-b, unten).

**Darstellung, am Prototyp entschieden:** Rot steht als Block auf der Seite – er ersetzt den gelben
Block – und oben in der Tafel; „zur Kenntnis" still, ohne eigenen Farbton, nur hinter der Glocke; die
Glocke zählt die höchste Stufe. Einzelheiten in 13.2; der Preisalarm aus 20g bekommt eine eigene
Gruppe, **nicht in Gold** ([20g](16-2-offene-stufen.md)).

#### Nach 18m vorgemerkt: Nachtrag 18m-b, Fehler je Nacht

Vorgabe des Nutzers vom 18.10.2026, als eigener Nachtrag statt in 18k, damit 18k allein die
Spielzeit misst. Der Ausgangs-Batch zählt je Bereich unter `cron_stand` die **Fehler in dieser
Nacht** mit; eine spätere Regel kann dann Häufungen zeigen. Zurückgesetzt wird beim ersten Aufruf
eines neuen UTC-Tags, im selben `json_set` und ohne den Stand vorher zu lesen – kein zusätzlicher
D1-Aufruf. Ein Abbruch durch die Laufzeit erreicht den Zähler nicht; den zeigt weiter die Kette
ohne Ausgang.

#### Offen nach 20i: Nachtläufe bis 05:00 UTC

Vorgabe des Nutzers vom 17.10.2026: Die Nachtläufe sollen spätestens um **05:00 UTC** fertig sein,
damit sie in Sommer- wie Winterzeit vor 7 Uhr abgeschlossen sind (7 Uhr Sommerzeit ist 05:00 UTC).
**Eigener Nachtrag nach 20i**, damit die Messungen von 18j bis 20i nicht mit einem Zeitwechsel
zusammenfallen. Zwei Prüffragen:

1. **Welche Schritte hängen am UTC-Datum („heute")?** Bekannt: `syncFaellig` (ein Versuch je Nacht),
   der Spielzeit-Stand, Level- und Jahre-Stand, die Tagesfristen. Ginge ein Fenster über Mitternacht
   UTC, oder bleibt nur 00:00–05:00 UTC? Über Mitternacht verteilte sich die PSN-Kette auf zwei
   „heute".
2. **Reicht die Kapazität – 60 statt 72 Aufrufe, Kaufliste-Nächte eingerechnet –, sobald 18j bis 20i
   gebaut sind?** Heute braucht eine Kaufliste-Nacht 64 bis 73. Kleinere Portionen (18l: ein Release
   je Aufruf) heißen mehr Aufrufe, nicht weniger; die Frage hängt mit „Cron je Minute" zusammen.
   **Gemessen am 18.10.2026:** Eine Kaufliste-Nacht belegt das PSN-Fenster **voll** (36 von 36, der
   Store fertig im letzten Aufruf), und der Lage-Batch liest je Wartungsaufruf rund 2 590 Zeilen –
   mit Cron je Minute rund 466 000 je Nacht (oben).
