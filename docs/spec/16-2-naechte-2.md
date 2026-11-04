← [Inhaltsverzeichnis](README.md) · [16.2 CPU-Grenze](16-2-cpu-und-betrieb.md) · [Nächte bis 03.11.](16-2-naechte.md)

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
