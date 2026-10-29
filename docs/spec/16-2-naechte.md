← [Inhaltsverzeichnis](README.md) · [16.2 CPU-Grenze](16-2-cpu-und-betrieb.md) · [Messungen je Schritt](16-2-cpu-je-schritt.md)

## 16. Nachtmessungen ab dem 26.10.2026

Fortsetzung der Nachtmessungen aus [16-2-cpu-je-schritt.md](16-2-cpu-je-schritt.md), die sonst über
15 KB läge. Seit dem 25.10.2026 wird nur bei Betriebswarnung und zu Messterminen ausgewertet
([16-2-bewertung-02-11.md](16-2-bewertung-02-11.md)); die Nächte 26.–29.10. sind auf Wunsch des
Nutzers nachträglich ausgewertet (am 29.10.2026), ohne Anlass. Am Code hat sich seit dem Deploy vom
25.10. nichts geändert (nur `docs/`).

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
