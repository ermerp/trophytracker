← [Inhaltsverzeichnis](README.md) · [16.2 CPU-Grenze](16-2-cpu-und-betrieb.md) · [Nächte bis 08.11.](16-2-naechte-2.md)

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
