← [Inhaltsverzeichnis](README.md) · [16.2 CPU-Grenze](16-2-cpu-und-betrieb.md) · [Nächte bis 08.11.](16-2-naechte-2.md) · [ab 26.11.](16-2-naechte-4.md)

## 16. Nachtmessungen ab dem 09.11.2026

Fortsetzung von [16-2-naechte-2.md](16-2-naechte-2.md), die sonst über 15 KB läge. Die Kennzahlen rechnet
`node scripts/nacht.mjs <datum>`.

#### Nächte zum 09. bis 12.11.2026 – vor dem Sync-Plan

**Alle 288 Cron-Aufrufe `ok`**, kein Abbruch, Warnungen nur `zugang_endet` (rot, erwartet). Sync jede
Nacht `erfolg` um 03:50 (431 Titel), Zugang lebt. Keine Kaufliste. 22 bis 25 Standorte je Nacht.
Ausgewertet am 12.11.2026, vor dem ersten Nachtrag des Sync-Plans (18q, [16-2-bewertung-02-11.md](16-2-bewertung-02-11.md)) – das ist der Vergleichsstand.

| Nacht | Sync Median (min–max) | Spitze | Level | Auffrischen | Leerlauf PSN / Wartung, Median |
|---|---|---|---|---|---|
| 09.11. | 12 (10–34) | 22 (KIX) | 12 | 8 / 10 / 15 | 7 / 7 |
| 10.11. | 15 (10–25) | **35 (ORD)** | 10 | 16 / 9 / 11 | 6 / 6 |
| 11.11. | 15 (9–25) | 17 (SIN) | 9 | 8 (28 Spiele) | 6 / 6 |
| 12.11. | 14 (9–24) | 15 (SEA) | 12 | – | 6 / 5 |

**Spielzeit-Spitze, sieben Werte seit dem 06.11.:** 14 (FRA), 38 (LAX), 22 (SIN), 22 (KIX), 35 (ORD), 17
(SIN), 15 (SEA) – Median 22, viermal über 15. Jede Nacht 25 geholt, 21 geschrieben, 18 zugeordnet; kein
`sortierung=abweichend`. Weiter der teuerste Aufruf.

**Auffrischen ist ein Wochenrhythmus, kein Stau.** Die Stempel vom 01. bis 04.11. (150, 150, 150, 28)
werden sieben Tage später reihum fällig: drei Aufrufe am 08., 09. und 10.11., einer am 11.11., keiner am
12.11. 8–16 ms, zweimal 16 (DFW 08.11., ORD 10.11.). Es bleibt, wie es ist (Entscheidung des Nutzers vom
08.11.2026).

**Abendläufe:** alle 16 grün, die zweiten Läufe leer; Markt 431 in 87 Portionen (464–563 s, 1–2
Preisalarme), Store 79 in 8 Portionen. **Die Verspätung wächst:** am 09.11. Markt 02:43 statt 20:17
(6 h 26), der zweite Store-Lauf endete 04:20 – im PSN-Fenster; am 11./12.11. lagen die zweiten Läufe
erneut darin (03:08, 03:22). Folgen hatte es keine; es gehört zu „Nachtläufe bis 05:00 UTC"
([16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md)).

| Abend | Markt | Store | Markt, zweiter | Store, zweiter |
|---|---|---|---|---|
| 08.11. | 23:42 | 00:01 | 01:45 | 01:59 |
| 09.11. | 02:43 | 02:55 | 04:10 | 04:19 |
| 10.11. | 00:40 | 00:53 | 01:58 | 02:16 |
| 11.11. | 01:53 | 01:59 | 03:08 | 03:22 |

**Gelesene Zeilen:** PSN 14 489–16 616, Wartung 94 240–96 880, Abend rund 12 700–14 500 – außer am
09.11. mit **70 974** in der Stunde 21 UTC, App-Nutzung nach Form und Uhrzeit (nicht zerlegt).
`rows_read_24h` am 12.11. gegen 16:30 UTC **123 564**, `rows_written_24h` 2 965. Die wöchentliche
Sicherung vom 08.11. startete um 10:29 UTC und lief grün.

#### Nächte zum 13. bis 15.11.2026 – die ersten mit 18q

**Alle 216 Cron-Aufrufe `ok`**, kein Abbruch, Warnungen nur `zugang_endet` (rot, erwartet). Sync jede
Nacht `erfolg` um 03:50 (431 Titel), Zugang lebt; kein Lauf scheiterte an einem abgelehnten Access Token
(eine stille einmalige Erneuerung hinterlässt keine Logzeile und ist so nicht ausgeschlossen). 21 bis 26
Standorte je Nacht – je Standort bleibt fast immer **ein** Wert, verglichen wird deshalb je Schritt.
Ausgewertet am 15.11.2026 gegen 09:15 UTC, vor dem Merge von 18p.

| Nacht | Sync Median (min–max), über 15 | Spitze | Level | Kaufliste | Auffrischen | Leerlauf PSN / Wartung, Median |
|---|---|---|---|---|---|---|
| 13.11. | 16 (8–21), 6 | 11 (ARN) | 9 | – | – | 6 / 6 |
| 14.11. | 11 (8–31), 3 | 23 (AMS) | 8 | – | – | 5 / 6 |
| 15.11. | 11 (8–14), 0 | 12 (HKG) | 7 | 13 (9–25), 15 Aufrufe | 8 / 8 / 14 | 5 / 5 |

**Was 18q zeigt – und was nicht.** Die vier Abruf-Aufrufe des Syncs (Offset 100 bis 400) liegen über
drei Nächte bei Median 10 (8–18, n = 12), Level bei 7–9 statt 9–12. Die Spitze hat zwei Werte unter
allen sieben davor (11, 12 gegen mindestens 14) und einen darüber (23) – drei Werte tragen kein Urteil.
Der Sync im Ganzen ist nicht besser als zuvor (16 / 11 / 11 gegen 12–15); teuer bleibt die
Normalisierung (bis 31 ms, SJC 14.11.), die 18q nicht anfasst und 18p bündelt.

**Kaufliste mit 18q allein:** Median **13** (9–25), 13 von 15 Aufrufen über 10 ms, 4 über 15 (DEN 21,
MAD 16, NRT 25, IAD 16); 735 Einträge geholt (14 × 50, 1 × 35), keine Änderung. Vorher 19 (25.10.),
13 (01.11.), 15 (08.11., 11–30) – am unteren Rand der Spanne, nicht darunter.

**Budget arbeitender Aufrufe nicht erreicht:** über 15 ms lagen 6, 4 und 4 Aufrufe je Nacht. Leerlauf
über 10 ms: 5, 5, 0 Aufrufe, höchstens 14 (SEA).

**Abendläufe:** alle 12 grün. Markt begann um 01:04, 00:53 und 23:54 statt 20:17 (bis 4 h 47 zu spät),
die zweiten Läufe endeten 02:55, 02:41 und 02:09 – **keiner im PSN-Fenster**, der knappste fünf Minuten davor.

**Gelesene Zeilen:** PSN 14 873 / 14 972 / 18 510 (Kaufliste), Wartung 94 240 und 96 880 – außer am
13.11. mit **129 764**: die Stunde 07 UTC las 59 488 statt 23 964, und `workersInvocationsAdaptive`
zählte 96 statt 72 Aufrufe, also 24 außerhalb des Crons (App-Nutzung, nicht zerlegt). Abend rund
14 600–14 900. `rows_read_24h` am 15.11. gegen 09:16 UTC **130 251**, `rows_written_24h` 3 297. Die
wöchentliche Sicherung vom 15.11. war zu dem Zeitpunkt noch nicht gestartet (08.11.: 10:29 UTC).

#### Nächte zum 16. bis 21.11.2026 – die ersten mit 18p

**Alle 431 Cron-Aufrufe `ok`**, kein Abbruch, Warnungen nur `zugang_endet` (rot, erwartet). Sync jede
Nacht `erfolg` um 03:50, 431 Titel, ab dem 20.11. 432 (der Schritt „Trophäen" holte am 20. und 21.11. je
eine Liste nach); Zugang lebt, zuletzt am 21.11. 03:50 UTC. 23 bis 27 Standorte je Nacht. Keine
Kaufliste-Nacht – die erste mit 18p ist die zum 22.11. Ausgewertet am 21.11.2026 gegen 09:00 UTC.

| Nacht | Sync Median (min–max), über 15 | Spitze | Level | Auffrischen | Leerlauf PSN / Wartung, Median |
|---|---|---|---|---|---|
| 16.11. | 9 (7–25), 1 | 25 (KIX) | 6 | 8 / 8 / 8 | 6 / 5 |
| 17.11. | 11 (6–20), 3 | 17 (IAD) | 6 | 9 / 9 / 10 | 5 / 6 |
| 18.11. | 10 (7–18), 1 | 11 (LIS) | 6 | 7 | 5 / 5 |
| 19.11. | 9 (7–14), 0 | 12 / 13 (zwei Aufrufe) | 8 | – | 4 / 5 |
| 20.11. | 8 (5–16), 1 | 14 (WAW) | 7 | – | 4,5 / 4 |
| 21.11. | 8 (6–17), 1 | 9 (MAD) | 5 | – | 4,5 / 4 |

**Urteil über 18p für den Sync** (nach sechs Nächten; die Kaufliste läuft wöchentlich und wird
eigens nachgetragen): Die Normalisierung ist der Gewinn – Median **9** (5–18, n = 36) statt Spitzen
bis 31 ms. Der Abruf bleibt bei Median **10** (6–25, n = 24), wie mit 18q allein (10, 8–18). Der
Abschluss liegt bei Median 9 (7–17, n = 6). Der Sync im Ganzen sinkt von 16 / 11 / 11 auf 8–11 je
Nacht. Ob es je Phase die erwarteten 3 / 4 / 4 D1-Aufrufe sind, belegen die Logzeilen nicht – sie
tragen keine Aufrufzahl.

**Budget arbeitender Aufrufe nicht erreicht:** über 15 ms lagen 5, 5, 1, 0, 1, 1 Aufrufe je Nacht
(vorher 6, 4, 4). Leerlauf über 10 ms: 3, 1, 0, 2, 0, 0 Aufrufe, höchstens 16 (SJC 17.11.).

**Die Disc-Prüfung ist der teuerste Aufruf:** fällig nach 30 Tagen am 16.11., 159 Spiele in vier
Aufrufen (50 / 50 / 50 / 9), **35, 38, 33 und 10 ms**, nichts gesetzt. Vorher nur ein Wert (29.10.,
16 ms). Ursache im Code: je Spiel ein eigener Batch (`discFassungAusIgdb`) plus eine Zählabfrage –
gut 50 D1-Aufrufe in einem Cron-Aufruf, bei rund 0,7 ms je Aufruf genau die gemessene Höhe. Erfasste
Discs verkürzen die Liste (ein Exemplar setzt `ja`), nicht den einzelnen Aufruf. Nächste Fälligkeit
um den 16.12.

**Abendläufe:** alle 24 grün. Markt begann um 23:57, 02:55, 02:25, 01:52, 01:46 und 01:29 statt
20:17 (**bis 6 h 38 zu spät**, vorher bis 4 h 47). **Die zweiten Läufe liegen wieder im PSN-Fenster**,
fünf Nächte in Folge: Store endete 04:48 (17.11.), 03:52, 03:51, 03:44 und 03:29 – während des Syncs;
am 17.11. reichte schon der erste Markt-Lauf bis 03:03. Folgen hatte es keine (Sync jede Nacht
`erfolg`); es gehört zu „Nachtläufe bis 05:00 UTC" ([16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md)).

**Gelesene Zeilen:** PSN 15 099–22 643, Wartung 94 240–110 945, Abend 7 258–14 603 – außer am 19.11.
mit **60 478** (Stunde 22 UTC am 18.11.: 47 501, App-Nutzung nach Uhrzeit, nicht zerlegt). Am 16.11.
las die Stunde 06 UTC 52 601 (Disc-Prüfung), am 21.11. die Stunde 08 UTC 40 665 statt 23 964 (nicht
zerlegt). `rows_read_24h` am 21.11. gegen 09:00 UTC **159 431**, `rows_written_24h` 3 075. Die
wöchentliche Sicherung vom 15.11. lief um 11:04 UTC grün – die erste mit der Dump-Prüfung aus 18q-b.

#### Nacht zum 22.11.2026 – die erste Kaufliste mit 18p

**Alle 72 Cron-Aufrufe `ok`**, 23 Standorte, Leerlauf über 10 ms keiner. Sync `erfolg` um 03:50
(432 Titel), Zugang lebt. Ausgewertet am 22.11.2026 gegen 14:30 UTC.

| Nacht | Sync Median (min–max), über 15 | Spitze | Level | Kaufliste | Auffrischen | Leerlauf PSN / Wartung, Median |
|---|---|---|---|---|---|---|
| 22.11. | 7 (5–14), 0 | 12 (EWR) | 5 | 11 (8–20), 15 Aufrufe | 8 / 8 / 11 | 4 / 4 |

**Kaufliste mit 18p** (5 → 4 D1-Aufrufe je Seite): Median **11** (8–20) statt 13 (9–25), 9 von 15
Aufrufen über 10 ms statt 13, **einer** über 15 (LAX 20) statt vier; 735 Einträge geholt (14 × 50,
1 × 35), keine Änderung. Eine Nacht – die Richtung stimmt zur Erwartung, ein Urteil trägt sie nicht.
**Budget arbeitender Aufrufe weiter nicht erreicht:** Median 11 liegt über 8, P90 über 10. Die Kaufliste
belegt 15 Aufrufe (04:00–05:10), das PSN-Fenster endet in der Kaufliste-Nacht nach
29 Arbeitsaufrufen (03:00–05:20) – dieselbe Zahl, die 16.2 für die Aufteilung der 05:00-Grenze nennt.

**Abendläufe:** alle vier grün. Markt 00:19 (8 min 36 s) und Rückfall 02:19 (25 s), Store 00:40
(1 min 38 s) und Rückfall 02:39 (19 s) – gut vier Stunden zu spät, die Rückfälle vor dem PSN-Fenster.

**Gelesene Zeilen:** PSN 19 310, Wartung 96 886, Abend 14 881. `rows_read_24h` am 22.11. gegen
14:30 UTC **282 539**, `rows_written_24h` 3 352 – das Fenster enthält die wöchentliche Sicherung
(11:34 UTC, grün).

#### Nacht zum 23.11.2026 – die erste mit 18r

**Alle 60 Cron-Aufrufe `ok`** (36 PSN 00:00–02:55, 24 Wartung 03:00–04:55), 24 Standorte, Leerlauf über
10 ms keiner. Sync `erfolg` um 00:50 (432 Titel), PSN-Arbeit nach 14 Aufrufen fertig (01:05), Wartung nach
einem (03:00). Warnungen nur `zugang_endet`. Keine Kaufliste-Nacht; das Auffrischen fand nichts Fälliges.
Ausgewertet am 23.11.2026 gegen 15:45 UTC.

| Nacht | Sync Median (min–max), über 15 | Spitze | Level | Auffrischen | Leerlauf PSN / Wartung, Median |
|---|---|---|---|---|---|
| 23.11. | 7 (5–13), 0 | 28 (LAX oder SJC) | 7 | – | 4 / 4 |

**Budget:** Der Sync hält Median und P90 sinngemäß ein, die Spielzeit-Spitze lag mit 28 ms über 15 – im
bisherigen Streubereich (bis 38, LAX). Ihr Standort ist nicht eindeutig: In derselben Minute lief die
Markt-Action gegen den Worker.

**Abendläufe im PSN-Fenster, wie erwartet:** Markt 00:51 (431 geprüft in 87 Portionen, 452 s, 0 offen,
2 Preisalarme), Store 01:07 (79 geprüft, 66 s, 0 offen), Rückfälle 02:53 und 03:08 leer. Alle grün, der
Sync lief daneben fehlerfrei. Verspätung 4 h 20 bis 4 h 37.

**Gelesene Zeilen:** PSN 30 212 (mit den Abendläufen vermischt), Wartung 70 866 (24 statt 36 Aufrufe).
`rows_read_24h` gegen 15:45 UTC **101 078**, `rows_written_24h` 2 937 (Vortag 282 539 und 3 352, mit Sicherung).

#### Nacht zum 24.11.2026 – die erste ohne Preisprüfung im PSN-Fenster

**Alle 60 Cron-Aufrufe `ok`**, 24 Standorte. Sync `erfolg` um 00:50 (432 Titel), PSN-Arbeit nach 13
Aufrufen fertig (01:00), Wartung nach vier (03:15). Warnungen nur `zugang_endet`. Ausgewertet am
24.11.2026 gegen 16:10 UTC.

| Nacht | Sync Median (min–max), über 15 | Spitze | Level | Auffrischen | Leerlauf PSN / Wartung, Median |
|---|---|---|---|---|---|
| 24.11. | 9 (7–14), 0 | 14 (MAD) | 6 | 13 / 11 / 12 | 6 / 4 |

**Budget:** Kein arbeitender Aufruf lag über 15 ms, Median **9** und P90 **13** (16 Aufrufe) verfehlen 8
und 10. **Leerlauf über 10 ms: drei** von 43 – ORD 17 (02:55), SEA 12 (02:25), LAX 13 (04:00);
in diesen Minuten lief keine Action.

**Preisläufe:** Vom alten Zeitplan blieb höchstens ein Lauf: Store um 02:36 (Zeitplan), leer, 1 s. Ob er der alte
von 22:47 oder der neue von 15:47 war, zeigt die API nicht; ein Markt-Lauf startete nach dem Handlauf
nicht mehr. **Die ersten planmäßigen Nachmittagsläufe am 24.11. (13:17 / 13:47) waren um 16:09 UTC noch nicht
gestartet**, also mindestens 2 h 52 und 2 h 22 verspätet; auch die Rückfälle (15:17 / 15:47) standen aus.

**Gelesene Zeilen:** PSN 16 480, Wartung 73 223. `rows_read_24h` um 16:10 UTC **89 703** – genau die Summe
der Stunden 00–04, also eine Nacht ohne Deploy, Sicherung und Preisprüfung (Vortag 101 078);
`rows_written_24h` 1 113 (Vortag 2 937).

**Der Refresh-Token sprang** vom 30.11. 03:00:40 auf den 04.12. 00:00:47 ([7.1](07-1-psn-trophaeen.md)).

#### Nacht zum 25.11.2026 – die erste mit 18s und 18q-c

**Alle 60 Cron-Aufrufe `ok`**, 22 Standorte. Sync `erfolg` um 00:50 (432 Titel), PSN-Arbeit nach 13
Aufrufen fertig (01:00), Wartung nach vier (03:15). Warnungen nur `zugang_endet`. Ausgewertet am
25.11.2026 um 15:49 UTC.

| Nacht | Sync Median (min–max), über 15 | Spitze | Level | Auffrischen | Leerlauf PSN / Wartung, Median |
|---|---|---|---|---|---|
| 25.11. | 9 (6–25), 1 | 20 (NRT) | 6 | 7 / 6 / 8 | 5 / 5 |

**Budget:** Median **8** (17 arbeitende Aufrufe), P90 **20** (nächster Rang); zwei über 15 – Sync 25 (SJC, 00:00)
und Spielzeit 20 (NRT). Beide trugen eine Anmeldung. Leerlauf über 10 ms: einer von 43, SJC 12 (02:10).

**18s:** Wartung **27 157** gelesene Zeilen statt 73 223 (24.11., ebenfalls drei Auffrisch-Aufrufe); in der
Stunde 04 sind es 960 für zwölf Leerlauf-Aufrufe, also 80 je Aufruf (Test 74). **Die CPU des Leerlaufs sank nicht:**
Median 5 (3–9, n = 20) gegen 4 (3–8 und 3–13) am 23. und 24.11. Auffrischen 6–8 statt 11–13 ms – eine
Nacht, andere Standorte.

**18q-c:** `anmeldung=refresh` um 00:00 und 00:55, kein Rückfall auf das NPSSO ([7.1](07-1-psn-trophaeen.md)).

**Preisläufe:** Markt 23:01 (431 geprüft in 87 Portionen, 508 s, 0 offen, 1 Preisalarm), Store 23:15 (79 geprüft,
77 s, 0 offen), Rückfälle 23:55 und 00:07 leer; Verspätung **9 h 44 / 9 h 28 / 8 h 38 / 8 h 20**
([16-2-betriebswarnungen.md](16-2-betriebswarnungen.md)).

**Gelesene Zeilen:** PSN 16 578. `rows_read_24h` um 15:49 UTC **316 801**, davon 184 628 in der Stunde 16 des 24.11.
(zwei Deploys); `rows_written_24h` 3 381.
