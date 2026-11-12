← [Inhaltsverzeichnis](README.md) · [16.2 CPU-Grenze](16-2-cpu-und-betrieb.md) · [Nächte bis 03.11.](16-2-naechte.md) · [ab 09.11.](16-2-naechte-3.md)

## 16. Nachtmessungen ab dem 04.11.2026

Fortsetzung von [16-2-naechte.md](16-2-naechte.md), die sonst über 15 KB läge. Die Kennzahlen rechnet
`node scripts/nacht.mjs <datum>`.

#### Nacht zum 04.11.2026 – erster Abendlauf mit 20g

Messtermin für 20g ([16-2-preisalarm.md](16-2-preisalarm.md)). **Alle 72 Cron-Aufrufe `ok`**,
`workersInvocationsAdaptive` 70 `success` (03:50 und 07:35 ohne Standort), kein `exceededResources`,
Warnungen: nur `zugang_endet` (rot, erwartet). Sync `erfolg` um 03:50, Zugang lebt. Keine Kaufliste,
29 Standorte.

| Schritt | n | Median | min–max | über 10 / 15 ms |
|---|---|---|---|---|
| Sync | 11 | 11 | 10–35 | 7 / 3 |
| Spielzeit | 2 | 22 | 20–24 | 2 / 2 |
| Einzeltrophäen, Level, Jahre | je 1 | 12, 15, 13 | | 3 / 0 |
| Auffrischen (LAX, 28 Spiele) | 1 | **22** | | 1 / 1 |
| PSN- / Wartungs-Leerlauf | 21 / 34 | 6 / 6 | 4–13 / 4–10 | 2 / 0 |

Arbeitende Aufrufe zusammen: 17, davon 13 über 10 ms und 6 über 15 ms. Leerlauf über 10 ms: LAX 13,
SJC 13 (03.11.: 11). Der Sync-Spitzenwert 35 ms ist der erste Aufruf der Nacht (03:00, LAX).

**Auffrischen: 22 ms, damit über der Marke von 15 ms**, ab der es wieder angesehen wird
([16-2-bewertung-02-11.md](16-2-bewertung-02-11.md)). Nach 18n-c lag es bei 8–10 ms (n = 3, LHR, SEA, EWR);
dieser Aufruf ist einer, mit 28 statt 50 Spielen, am langsamen Standort LAX (dort am selben Morgen
Leerlauf 6–13, Jahre 13, Sync 35). Gegen den Leerlauf desselben Standorts sind es 9–16 ms mehr statt
3–6. **Ob das der Standort ist, belegt ein Wert nicht** – offen bis zum nächsten Stau (rechnerisch ab
dem 08.11.).

**20g, erster Abendlauf:** Alle vier Läufe grün. Die Action trägt die 87 Portionen; `preis_alarm` hält
**1 Meldung** (gebraucht, Art `grenze`, offen).

| Lauf | Start (UTC) | Verspätung | Ergebnis |
|---|---|---|---|
| Markt | 00:36 | 4 h 19 | 431 geprüft, 87 Portionen, 529 s, 0 offen |
| Store | 00:53 | 4 h 06 | 78 geprüft, 8 Portionen, 74 s, 1 offen |
| Markt, zweiter | 02:25 | 4 h 08 | leer |
| Store, zweiter | 02:43 | 3 h 56 | holt den einen nach |

Die zweiten Läufe enden diesmal vor dem PSN-Fenster.

**CPU der Portionsrouten** (Telemetry, alle Aufrufe erfasst):

| Route | n | Median | P90 | höchstens | über 10 / 15 ms |
|---|---|---|---|---|---|
| `POST /api/sync/markt/ergebnisse` | 87 | 3 | 4 | 18 | 2 / 2 |
| `POST /api/sync/store/ergebnisse` | 9 | 4 | 13 | 13 | 2 / 0 |
| `POST /api/sync/markt/ausgang` | 4 | 7 | 14 | 14 | 1 / 0 |
| `POST /api/sync/store/ausgang` | 4 | 4 | 8 | 8 | 0 / 0 |
| `GET /api/sync/markt/lage` | 2 | 11,5 | | 16 | 1 / 1 |
| `GET /api/sync/store/lage` | 2 | 4,5 | | 7 | 0 / 0 |

Alle `ok`.

**Gelesene Zeilen:** PSN 15 738, Wartung 94 899, Abendläufe 14 198 (am 01.11.: 9 761). `rows_read_24h` am
04.11. gegen 15:50 UTC **262 793**, `rows_written_24h` 3 801. Davon entfallen 124 540 auf die Stunde
16 UTC des 03.11., die Stunde des 20g-Deploys; dass es dessen Sicherung ist, ist eine Vermutung.

**Die Frage aus der Nacht zum 03.11. ist beantwortet: Die Mehrzeilen der Stunde 06 sind vor allem Jahre,
nicht Auffrischen.** Die Nacht zum 31.10. hatte kein Auffrischen und liest trotzdem 22 348 Zeilen mehr
als die Stunde 07 (46 276 gegen 23 928). Stunde 06 minus Stunde 07:

| | 31.10. | 01.11. | 02.11. | 03.11. | 04.11. |
|---|---|---|---|---|---|
| Auffrisch-Aufrufe | 0 | 3 | 3 | 3 | 1 |
| Zeilen mehr | 22 348 | 24 682 | 24 685 | 25 287 | 23 079 |
| über den Sockel, je Aufruf | – | 778 | 779 | 980 | 731 |

Ein Auffrisch-Aufruf liest also rund **700–1 000** Zeilen über dem Leerlauf, nicht 7 000–8 000; die alte
Zahl hatte Jahre mitgerechnet. Das ist aus Stundensummen hergeleitet, nicht je Aufruf gemessen, und liegt
noch über den 450 für den Schreibschritt in `test/lesekosten.spec.ts`. Die Stunde 07 lag am 01.–03.11.
mit 27 864 / 26 064 / 24 264 über dem Leerlauf von 23 940; warum, ist nicht geklärt.

#### Nächte zum 05. und 06.11.2026 – Messtermin 18o

Erste Nächte mit 18o ([7.7](07-7-psn-weitere-daten.md)). **Beide: alle 72 Cron-Aufrufe `ok`**, kein
Abbruch (`workersInvocationsAdaptive` 71 und 72 `success`, 05.11. 08:25 ohne Standort), Warnungen nur
`zugang_endet` (rot, erwartet). Sync `erfolg` um 03:50 (431 Titel), Zugang lebt, keine Kaufliste, kein
Auffrischen. 24 und 21 Standorte.

| Schritt | 05.11.: n, Median, min–max | 06.11.: n, Median, min–max |
|---|---|---|
| Sync | 11, 14, 10–34 (9 über 10, 5 über 15) | 11, 14, 8–28 (9 über 10, 5 über 15) |
| Spielzeit | 2, 22,5, 22–23 (`frist`) | **1, 14** (`spitze`) |
| Einzeltrophäen | – | 1, 19 (IAD, 78 Trophäen) |
| Level | 1, 16 (LAX) | 1, 9 (AMS) |
| Jahre | 1, 5 (CDG) | 1, 5 (MIA) |
| PSN- / Wartungs-Leerlauf | 22 / 35, 5 / 5, 4–12 / 4–13 | 22 / 35, 6,5 / 6, 4–13 / 4–15 |

**Spielzeit: 14 ms statt 22, aus zwei Aufrufen wird einer** – 25 Titel geholt, 21 geschrieben, FRA. Der
Leerlauf in FRA lag in derselben Nacht bei 4, die Spitze kostet also rund 10 ms darüber; der Volllauf
22 und 23 ms bei einem Leerlauf von 4–7 in LHR. Damit unter der Marke von 15 ms, aber über 10 und über
der Schätzung von 11–12 ms: **n = 1, an einem günstigen Standort** – ob sie an einem langsamen unter 15
bleibt, ist offen. Der Volllauf schrieb 303 von 379 Titeln und `psn_spielzeit_runde` wie gebaut
(`vollAm` 05.11., `spitzeAm` 06.11.). Kein `sortierung=abweichend`, geprüft wird das nur auf der Spitze,
also erst eine Nacht lang. Kein Weiterblättern.

**Gelesene Zeilen:** PSN 15 691 und 14 424, Wartung je 94 240, Abendläufe 14 146 und 14 250.
`rows_read_24h` am 06.11. gegen 14:20 UTC **122 914**, `rows_written_24h` 3 101. Das PSN-Fenster fällt
um 1 267, gerechnet waren für die Spitze gegen zwei volle Seiten rund 2 300 weniger; dass die
Einzeltrophäen vom 06.11. den Rest erklären, ist eine Vermutung. Stunde 06 minus Stunde 07 ist in beiden
Nächten **22 348**, auf die Zeile der Wert vom 31.10., ebenfalls ohne Auffrischen – das stützt, dass
dieser Sockel Jahre ist. Die Stunde 07 steht bei 23 964, die Abweichung der Nächte 01.–03.11. ist nicht
wiedergekommen.

**Abendläufe des 04. und 05.11.:** Alle acht grün, je 431 und 79 geprüft, 0 offen, die beiden zweiten
Läufe jeweils ohne Arbeit. Die Verspätung bleibt bei 4 bis 4 h 41; das Ende des letzten Laufs liegt mit
02:49 und 02:50 UTC nur noch rund zehn Minuten vor dem PSN-Fenster. `preis_alarm` hält **2 Meldungen**,
beide offen (04.11.: 1).

| Lauf | Start 04.11. → Verspätung | Start 05.11. → Verspätung | Ergebnis |
|---|---|---|---|
| Markt | 00:52 → 4 h 35 | 00:58 → 4 h 41 | 87 Portionen, 502 und 473 s |
| Store | 01:04 → 4 h 17 | 01:08 → 4 h 21 | 8 Portionen, 76 Anfragen, 62 und 69 s |
| Markt, zweiter | 02:33 → 4 h 16 | 02:33 → 4 h 16 | leer |
| Store, zweiter | 02:48 → 4 h 01 | 02:50 → 4 h 03 | leer |

**CPU der Portionsrouten** (Telemetry, alle 108 Aufrufe je Abend erfasst, alle `ok`):

| Route | n | Median 04. / 05.11. | höchstens | über 10 / 15 ms |
|---|---|---|---|---|
| `POST /api/sync/markt/ergebnisse` | 87 | 4 / 2 | 27 / 20 | 9 und 5 / 5 und 2 |
| `POST /api/sync/store/ergebnisse` | 8 | 3,5 / 9,5 | 14 / 21 | 2 und 3 / 0 und 2 |
| `POST /api/sync/markt/ausgang` | 4 | 6,5 / 7,5 | 14 / 13 | je 1 / 0 |
| `POST /api/sync/store/ausgang` | 4 | 6 / 5,5 | 17 / 7 | 1 und 0 / 1 und 0 |
| `GET /api/sync/markt/lage` | 2 | 10 / 4,5 | 10 / 6 | 0 / 0 |
| `GET /api/sync/store/lage` | 2 | 9 / 12,5 | 11 / 13 | 1 und 2 / 0 |

#### Nacht zum 07.11.2026 – zweite Spitze, erster Abendlauf mit „Preisalarm folgt dem Preis"

**Alle 72 Cron-Aufrufe `ok`**, kein Abbruch (`workersInvocationsAdaptive` 83 `success`: 72 Cron, 11 der
Startseite um 07:38; 05:15 ohne Standort), Warnungen nur `zugang_endet` (rot, erwartet). Sync `erfolg`
um 03:50 (431 Titel), Zugang lebt, keine Kaufliste, kein Auffrischen. 27 Standorte.

| Schritt | n | Median | min–max | über 10 / 15 ms |
|---|---|---|---|---|
| Sync | 11 | 13 | 8–22 | 9 / 2 |
| Spielzeit (`spitze`, LAX) | 1 | **38** | | 1 / 1 |
| Level, Jahre | je 1 | 9, 5 | | 0 / 0 |
| PSN- / Wartungs-Leerlauf | 23 / 35 | 6 / 5 | 4–13 / 4–17 | 2 / 1 |

**Spielzeit: die zweite Spitze kostet 38 ms, an einem langsamen Standort.** 25 Titel geholt, 21
geschrieben, wie am 06.11. Damit weit über der Marke von 15 ms und über dem Volllauf (22 und 23 ms in
LHR). LAX lag in derselben Nacht im Wartungs-Leerlauf bei 17 ms (08:05), dem höchsten der Nacht, und
LAX trug am 04.11. Sync 35 und Auffrischen 22. **Zwei Werte, zwei Standorte: 14 (FRA) und 38 (LAX)** –
ob die Spitze im Mittel unter 15 bleibt, ist offen; dass sie es an jedem Standort tut, ist widerlegt.
Kein `sortierung=abweichend` in der zweiten Spitzennacht.

**Preisalarm folgt dem Preis, erster Abendlauf (06.11.):** Die Logzeile der Actions nennt
„Preisalarme/entfallen" (Markt: 1 und 0, Store: 0 und 0). **Meldung #1 ist auf den aktuellen Preis
gegangen** (`aktualisiert_am` 07.11. 00:08, Grenz-Meldung, Marktreihe): Ihr bisheriger Preis war
seit dem 05.11. weg, der neue liegt weiter unter der Grenze – die Ausnahme Grenze, wie gebaut. Der
Marktpreis selbst ist der vom 05.11.: `price_snapshot` schreibt nur bei Änderung. `preis_alarm` hält
**2 Meldungen**, beide offen, keine entfallen.

**Abendläufe:** Alle vier grün, 431 und 79 geprüft, 0 offen, die zweiten Läufe leer. Verspätung kleiner
als in den Nächten davor (4 bis 4 h 41), das letzte Ende liegt 36 Minuten vor dem PSN-Fenster.

| Lauf | Start (UTC) | Verspätung | Ergebnis |
|---|---|---|---|
| Markt | 00:06 | 3 h 49 | 87 Portionen, 498 s |
| Store | 00:20 | 3 h 33 | 8 Portionen, 76 Anfragen, 74 s |
| Markt, zweiter | 01:59 | 3 h 42 | leer |
| Store, zweiter | 02:23 | 3 h 36 | leer |

**CPU der Portionsrouten** (Telemetry, alle 108 Aufrufe erfasst, alle `ok`):

| Route | n | Median | P90 | höchstens | über 10 / 15 ms |
|---|---|---|---|---|---|
| `POST /api/sync/markt/ergebnisse` | 87 | 3 | 6 | 28 | 7 / 3 |
| `POST /api/sync/store/ergebnisse` | 8 | 5 | 11 | 11 | 1 / 0 |
| `POST /api/sync/markt/ausgang` | 4 | 6,5 | 8 | 8 | 0 / 0 |
| `POST /api/sync/store/ausgang` | 4 | 8 | 12 | 12 | 1 / 0 |
| `GET /api/sync/markt/lage` | 2 | 9 | | 14 | 1 / 0 |
| `GET /api/sync/store/lage` | 2 | 12 | | 19 | 1 / 1 |

**Gelesene Zeilen:** PSN 14 291, Wartung 107 664, Abend 27 958. **Das Öffnen der Startseite liest
13 424 Zeilen** – je einmal um 22:07 und 07:38, beide Male genau diese Zahl, und um 07 UTC erklärt sie
den Überschuss über den Leerlauf auf die Zeile (37 388 gegen 23 964). Ohne sie: Wartung 94 240 wie am
05. und 06.11., Abendläufe 14 534. Gemessen aus Stundensummen, nicht je Route. Ob das für die Startseite
zu viel ist, ist nicht bewertet. `rows_read_24h` am 07.11. gegen 09:25 UTC **449 936**,
`rows_written_24h` 3 025; davon 244 029 in der Stunde 15 UTC des 06.11. mit drei Deploys, deren Job je
eine Sicherung zieht – dass es diese Sicherungen sind, ist eine Vermutung (03.11.: 124 540 für einen).

#### Nacht zum 08.11.2026 – Kaufliste, Auffrischen, dritte Spitze

**Alle 72 Cron-Aufrufe `ok`**, kein Abbruch (`workersInvocationsAdaptive` 72 `success`), Warnungen nur
`zugang_endet` (rot, erwartet). Sync `erfolg` um 03:50 (431 Titel), Zugang lebt. Kaufliste-Nacht und
Auffrischen fällig. 25 Standorte. PSN-Fenster belegt: Sync 11, Spielzeit 1, Kaufliste 15, Level 1 – 28 von 36.

| Schritt | n | Median | min–max | über 10 / 15 ms |
|---|---|---|---|---|
| Sync | 11 | 12 | 9–26 | 9 / 2 |
| Spielzeit (`spitze`, SIN) | 1 | **22** | | 1 / 1 |
| Kaufliste (14 × 50, 1 × 34) | 15 | 15 | 11–30 | 15 / 7 |
| Auffrischen (3 × 50) | 3 | 13 | 10–16 | 2 / 1 |
| Level, Jahre | je 1 | 10, 16 | | 0 / 1 |
| PSN- / Wartungs-Leerlauf | 8 / 32 | 6 / 5 | 4–10 / 3–12 | 0 / 1 |

**Spielzeit: dritte Spitze 22 ms in SIN** (25 geholt, 21 geschrieben, 18 zugeordnet). Damit drei Werte
an drei Standorten: 14 (FRA), 38 (LAX), 22 (SIN) – zweimal über 15. Kein `sortierung=abweichend`.

**Kaufliste: Median 15 statt 13 (01.11.) und 19 (25.10.)**, höchstens 30 (ORD, 04:05; derselbe
Standort 14 um 04:25). SIN 15–19 (n = 4), SJC 24, Europa 11–17. Keine Änderung (`kauf=0 plus=0
entfallen=0`), 734 Einträge wie am 01.11.

**Auffrischen:** Drei Aufrufe zu 50 (ORD 10, DFW 13 und 16; 150 angefragt, 150 aktualisiert, keiner ohne
Antwort), danach keine Zeile `auffrischen=grenze` – in dieser Nacht war nichts mehr fällig. Ein Stau war es
nicht: Die Stempel vom 01. bis 04.11. werden reihum wieder fällig ([16-2-naechte-3.md](16-2-naechte-3.md),
korrigiert am 12.11.). LAX kam im Auffrischen nicht vor; ein Vergleich am selben Standort mit den 22 ms
vom 04.11. fehlt.

**Abendläufe:** Alle vier grün, Verspätung 3 h 04 bis 3 h 21, das letzte Ende 01:51 – 1 h 08 vor dem
PSN-Fenster.

| Lauf | Start (UTC) | Verspätung | Ergebnis |
|---|---|---|---|
| Markt | 23:38 | 3 h 21 | 431 in 87 Portionen, 492 s, 1 Preisalarm, 0 entfallen |
| Store | 23:57 | 3 h 10 | 79 in 8 Portionen, 76 Anfragen, 59 s, 0 Preisalarme |
| Markt, zweiter | 01:29 | 3 h 12 | leer |
| Store, zweiter | 01:51 | 3 h 04 | leer |

**Gelesene Zeilen:** PSN 17 856 (Kaufliste-Nacht; 01.11.: 18 624), Wartung 96 880 (06 UTC mit Jahren und
Auffrischen 48 952, danach je Stunde 23 964 wie in den Nächten davor), Abend 14 359. `rows_read_24h` am
08.11. gegen 09:27 UTC **685 536**, `rows_written_24h` 3 234. Davon 473 575 in der Stunde 11 UTC des
07.11. mit zwei Deploys. **Nach der Stichprobe (`d1QueriesAdaptiveGroups`) sind das ganz überwiegend die
Abfragen der Startseite** (Statistik, je 26 bis 34 Mal) – rund 34 Aufrufe zu je etwa 13 900 Zeilen,
also Produktionsprüfung und Nutzung nach dem Deploy, nicht die Sicherungen des Deploy-Jobs.

**Wöchentliche Sicherung** (Sonntag 03:17 UTC): Bis 09:30 UTC noch nicht gestartet. Das war bisher normal,
die letzten zwei Sonntage starteten erst um 08:30 und 10:34.
