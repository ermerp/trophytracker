← [Inhaltsverzeichnis](README.md) · [16.2 CPU-Grenze](16-2-cpu-und-betrieb.md) · [Messungen je Schritt](16-2-cpu-je-schritt.md)

## 16. Nachtmessungen ab dem 26.10.2026

Fortsetzung der Nachtmessungen aus [16-2-cpu-je-schritt.md](16-2-cpu-je-schritt.md), die sonst über
15 KB läge. Seit dem 25.10.2026 wird nur bei Betriebswarnung und zu Messterminen ausgewertet
([16-2-bewertung-02-11.md](16-2-bewertung-02-11.md)); die Nächte 26.–29.10. sind auf Wunsch des
Nutzers nachträglich ausgewertet (am 29.10.2026), ohne Anlass, ebenso die Nächte zum 30.10. und 31.10. (jeweils am selben Tag).
Am Code hat sich vom Deploy des 25.10. bis zu dem von Stufe 23 (29.10., 21:00 UTC) nichts geändert;
Stufe 23 fasst keinen Cron-Schritt an.

#### Nächte zum 26., 27., 28. und 29.10.2026

**Alle 288 Cron-Aufrufe `ok`**, je Nacht 72 in der Telemetry, kein `exceededResources` in
`workersInvocationsAdaptive` (03–09 UTC), keine Marke `cron_begonnen` liegengeblieben. Sync jede Nacht
`erfolg` (431 Titel, 03:00–03:50), Zugang lebt (`letzter_erfolg_am` 29.10. 03:50, Sony nennt 28.11.).
Keine Kaufliste-Nacht, kein IGDB-Auffrischen fällig (erst ab dem 31.10.), einmal Disc-Prüfung (29.10.,
16 ms). Die Standorte weiter weltweit verteilt, 16 bis 20 je Fenster und Nacht.

| | 26.10. | 27.10. | 28.10. | 29.10. |
|---|---|---|---|---|
| Wartungs-Leerlauf, Median (n) | 5 (35) | 5 (35) | 6 (35) | 5 (34) |
| PSN-Leerlauf, Median (n) | 4 (22) | 6 (22) | 5 (22) | 6 (22) |
| Leerlauf über 10 ms | 1 | 1 | 6 | 2 |
| Sync, ms (n = 11) | 9–18 | 10–28 | 8–25 | 10–32 |
| Spielzeit, ms (200 / 179 Titel) | 27 / 21 | 21 / 26 | 25 / 17 | **64** / 22 |
| Level, Jahre | 19, 10 | 14, 8 | 8, 15 | 10, 6 |

**Der Leerlauf verfehlt das Budget weiter** (P99 unter 10): 10 von 227 Aufrufen darüber, höchstens
16 ms – NRT dreimal (12–14), HKG und ORD je zweimal (11/12, 15/16), SJC, MEL und DFW je einmal. Je Standort über alle vier Nächte (Median, n ≥ 4): EWR und MXP 4; DFW, LHR, IAD,
FRA, DEN, CDG, ATL, SIN, ICN, KIX 5; ORD, SJC, MIA, MAD 6; SEA, AMS, WAW 7; LAX, MRS 8; MEL 9; HKG 11;
NRT 12 – der langsamste Standort braucht das Dreifache des schnellsten (bis 22.10. knapp das Doppelte,
damals nur US-Standorte).

**Spielzeit 64 ms am 29.10. (03:55, SJC)** bei derselben Arbeit wie in den Nächten davor (200 geholt,
137 geschrieben) und ohne Abbruch; die Nacht zum 25.10. lag bei 24 ms. Der eine Wert ist **nur notiert,
nicht erklärt** – dass es der Standort war, ist eine Vermutung.

**Gelesene Zeilen** (`d1AnalyticsAdaptiveGroups` je Stunde): PSN-Fenster 14 564 bis 14 861 je Nacht,
Wartung 94 132 bis 96 067 (am 26.10. 147 264 – App-Nutzung am Morgen, 28 Aufrufe ohne Cron in
03–09 UTC); die Abendläufe 8 000 bis 13 000. `rows_read_24h` am 29.10. 20:36 UTC **121 456**,
`rows_written_24h` 3 524.

**Abendläufe:** Alle 16 Läufe von Markt und Store grün, je Abend der erste mit 431 / 79 geprüft und
0 offen, der zweite ohne Arbeit. **GitHub startet sie später als bisher:** 2 h 10 bis 3 h 42 nach
dem Plan (20:17 / 22:17 / 20:47 / 22:47 UTC), am 24.10. 2 h 20 bis 2 h 51; der späteste begann
am 29.10. um 01:56. Folgen hat das bisher keine, die Schwelle für `markt_geprueft` liegt bei 30 h.

#### Nacht zum 30.10.2026

Erste Nacht mit dem Code von Stufe 23. **Alle 72 Cron-Aufrufe `success`**, kein `exceededResources`
(03–09 UTC), keine Marke `cron_begonnen` liegengeblieben; in der Telemetry 72 Logzeilen, aber nur 71
Ereignisse mit CPU-Zeit (06:30 fehlt). Sync `erfolg` (431 Titel, 03:00–03:50, 9–24 ms, n = 11), Zugang
lebt (`letzter_erfolg_am` 30.10. 03:50, Sony nennt 28.11.). Spielzeit 16 / 26 ms (200 / 179 Titel), Level 9,
Jahre 9 ms (16 Jahre, 5 gelöscht); keine Kaufliste, kein Auffrischen, keine Disc-Prüfung. 26 Standorte.

| | 30.10. |
|---|---|
| Wartungs-Leerlauf, Median (n) | **7** (34) |
| PSN-Leerlauf, Median (n) | 5 (22) |
| Leerlauf über 10 ms | 5 – LAX 12, 12; SJC 11 (PSN); AMS 13, 11 (Wartung) |

**Der Wartungs-Leerlauf liegt einen Punkt über den vier Nächten davor** (5–6). AMS lief sieben Mal
(Median 8, zuvor 7), SJC zweimal mit 8 und 10 (zuvor 6). Wieder ist das **nur notiert**: Eine Nacht
reicht nicht, um es dem Standort oder dem Deploy zuzuschreiben.

**Gelesene Zeilen:** PSN-Fenster 14 960, Wartung 94 132 (06–09 UTC); die Abendläufe 9 853 (23, 00 und 02 UTC).
`rows_read_24h` am 30.10. **268 462**, `rows_written_24h` 3 481. Mehr als die Hälfte davon fällt in
die Stunde 21 UTC am 29.10. (136 092 Zeilen, nichts geschrieben): Deploy von Stufe 23 und Prüfung der
Produktion. In der Stichprobe von `d1QueriesAdaptiveGroups` sind es Statistik-Abfragen (Plattformübersicht
12-mal, 40 140 Zeilen). Ohne diese Stunde bleiben 132 370, etwas mehr als am 29.10. (121 456).

**Abendläufe des 29.10.:** Alle vier grün. Markt 23:56 UTC (431 geprüft in 72 Portionen, 503 s, 0 offen),
Store 00:22 (79 geprüft, 76 Anfragen, 0 offen), die beiden zweiten Läufe um 02:00 und 02:09 ohne Arbeit.
Verspätung gegen den Plan 3 h 22 bis 3 h 43; das ist dieselbe Größenordnung wie die 3 h 42 vom 29.10.

#### Nacht zum 31.10.2026

Zweite Nacht mit dem Code von Stufe 23. **Alle 72 Cron-Aufrufe `ok`** in der Telemetry, jeder mit CPU-Zeit
und Logzeile; `workersInvocationsAdaptive` (03–09 UTC) kennt nur 70, alle `success` – 06:00 und 06:15 fehlen
dort, ihr Standort ist deshalb unbekannt. Kein `exceededResources`. Sync `erfolg` (431 Titel, 03:00–03:50,
9–27 ms, Median 14, n = 11), Zugang lebt (`letzter_erfolg_am` 31.10. 03:50, Sony nennt 28.11.). Spielzeit
27 / 17 ms (200 / 179 Titel), Level 17, Jahre 8 ms (16 Jahre, 5 gelöscht); keine Kaufliste, keine
Disc-Prüfung. **Kein Auffrischen, wie erwartet:** Alle 478 verknüpften Spiele sind am 24.10. um 10:45 UTC
aufgefrischt, fällig werden sie erst nach dem Wartungsfenster des 31.10. – die erste Nacht mit der
Obergrenze aus 18n bleibt die zum 01.11. 25 Standorte.

| | 31.10. |
|---|---|
| Wartungs-Leerlauf, Median (n) | 5 (35), höchstens 10 |
| PSN-Leerlauf, Median (n) | 5 (22) |
| Leerlauf über 10 ms | 1 – IAD 11 (PSN) |

**Der Wartungs-Leerlauf ist zurück bei 5** – der Wert 7 der Nacht davor wiederholt sich nicht. AMS lief nur
einmal (6). Ob es der Standortmix war, bleibt offen; einer Erklärung bedarf es nicht mehr.

**Gelesene Zeilen:** PSN-Fenster 15 059, Wartung 94 132 (06–09 UTC, auf die Zeile wie am 30.10.); die
Abendläufe 9 953 (23, 00 und 01 UTC). `rows_read_24h` am 31.10. gegen 12:30 UTC **173 541**,
`rows_written_24h` 3 536.

**Abendläufe des 30.10.:** Alle vier grün. Markt 23:45 UTC (431 geprüft in 72 Portionen, 485 s, 0 offen),
Store 00:04 (79 geprüft, 76 Anfragen, 0 offen), die beiden zweiten Läufe um 01:38 und 01:50 ohne Arbeit.
Verspätung gegen den Plan 3 h 03 bis 3 h 28 – etwas weniger als am 29.10.
