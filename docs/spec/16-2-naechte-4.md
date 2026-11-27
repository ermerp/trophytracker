← [Inhaltsverzeichnis](README.md) · [16.2 CPU-Grenze](16-2-cpu-und-betrieb.md) · [Nächte bis 25.11.](16-2-naechte-3.md)

## 16. Nachtmessungen ab dem 26.11.2026

Fortsetzung von [16-2-naechte-3.md](16-2-naechte-3.md), die sonst über 15 KB läge. Die Kennzahlen rechnet
`node scripts/nacht.mjs <datum>`.

#### Nächte zum 26. und 27.11.2026 – die letzten vor dem NPSSO-Ende

**Alle 60 Cron-Aufrufe `ok`, in beiden Nächten**, je zehn Standorte. Sync `erfolg` (27.11. 00:00–00:50),
Warnungen nur `zugang_endet`. Ausgewertet am 27.11.2026 um 13:13 UTC.

| Nacht | Sync Median (min–max), über 15 | Spitze | Level | Auffrischen | Leerlauf PSN / Wartung, Median |
|---|---|---|---|---|---|
| 26.11. | 7 (4–12), 0 | 15 (ORD) | 9 | 13 | 3 / 2 |
| 27.11. | 7 (4–15), 0 | 11 (OTP) | 3 | – | 3 / 2 |

**Budget:** In keiner der beiden Nächte lag ein Aufruf über 15 ms, **kein Leerlauf über 10 ms** (Höchstwerte
9 und 9) – die ersten Nächte seit 18r ohne beides. Über 10 ms nur arbeitende Aufrufe: am 26.11. zwei
Sync-Aufrufe, die Spitze und das Auffrischen, am 27.11. zwei Sync-Aufrufe und die Spitze. Eine Nacht mit
anderen Standorten als am 25.11. (dort zweimal über 15 ms, beide mit Anmeldung); hier trugen die
Anmeldungen 11 und 15 (26.11.) und 15 und 11 ms (27.11.).

**18s hält:** Wartung **25 063** und **24 276** gelesene Zeilen (25.11.: 27 157, vor 18s 73 223); Stunde 04
weiter 960 für zwölf Leerlauf-Aufrufe.

**Anmeldung:** in beiden Nächten zweimal `anmeldung=refresh` (00:00 und 00:55), kein Rückfall auf das NPSSO.
Der Refresh-Token sprang trotzdem, auf **07.12. 00:55:45** ([7.1](07-1-psn-trophaeen.md)).

**Preisläufe:** alle `success`, keiner im Cron-Fenster außer dem Store-Rückfall vom 26.11. (00:01, 21 s).

| Tag | Markt 13:17 | Markt 15:17 | Store 13:47 | Store 15:47 |
|---|---|---|---|---|
| 25.11. | 22:32 (9 h 15), 8 min 50 | 23:39 (8 h 22) | 22:46 (8 h 59), 1 min 29 | 23:47 (8 h 00) |
| 26.11. | 22:21 (9 h 04), 8 min 27 | 23:52 (8 h 35) | 22:35 (8 h 48), 1 min 35 | 00:01 (8 h 14) |

Mit dem 24.11. drei Tage zwischen 8 h 00 und 9 h 44, gestartet in allen drei zwischen 22:21 und 00:07 UTC –
dieselbe Uhrzeit wie vor 18r-b mit dem Termin 20:17. Eine Beobachtung, keine Erklärung. Zwischen zwei
prüfenden Markt-Läufen lagen höchstens rund 23 h 30, die Schwellen bleiben
([16-2-betriebswarnungen.md](16-2-betriebswarnungen.md)).

**Gelesene Zeilen:** PSN 16 094 und 16 774, Preisläufe am 26.11. 14 476. `rows_read_24h` um 13:13 UTC
**55 526** – genau Preisläufe plus Nacht, kein weiterer Betrieb; `rows_written_24h` 2 904. Im Fenster zum
26.11. stehen dazu 58 121 (Stunde 15) und 69 217 (Stunde 16, Deploy 18r-c um 16:08) vom 25.11.; die
Stunde 15 ist nicht zugeordnet, vermutlich die Auswertung jenes Tages.
