← [Inhaltsverzeichnis](README.md) · [16.2 CPU-Grenze](16-2-cpu-und-betrieb.md)

## 16. Vorlagen für die Budget-Bewertung am 02.11.2026

Punkte, die bei der Neubewertung des Budgets arbeitender Aufrufe ([16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md))
mit entschieden werden (Vorgabe des Nutzers vom 25.10.2026). **Gebaut wird erst nach der Bewertung.**

#### Die Sicherung über `GET /api/export/backup.json`

**Gemessen am 25.10.2026:** 212 ms CPU (SEA) in einem Aufruf, ohne Abbruch – das Zwanzigfache der
Grenze, die bisher einzige Messung.

**Wann sie läuft:** nur in der wöchentlichen Sicherung (`backup.yml`, sonntags 03:17 UTC, am 25.10.
um 08:30 gestartet) und wenn sie von Hand gestartet wird. **Der Deploy ruft die Route nicht:** Er sichert
per `wrangler d1 export` über die D1-API ([15.2](15-repository-deployment.md)), dort zählt keine Worker-CPU,
und sein Abbruch hängt nicht an ihr (geprüft am 25.10.2026 in `deploy.yml`).

**Wenn die Laufzeit sie abbricht:** `curl -fsS --retry 3` scheitert, der Lauf endet vor dem Schreiben
ins private Repository – **auch `backup.sql` desselben Laufs wird dann nicht abgelegt**, obwohl der
Dump davor gelungen war. Nach acht Tagen warnt das Dashboard rot ([14.2](14-backup-export.md)).

**Vorzuschlagen bis zum 02.11.:** wie die Route unter die Grenze kommt oder welcher Weg sie ersetzt.
Denkbar und **noch nicht geprüft**:

- **Portioniert:** je Tabelle oder je Seite einer Tabelle ein Aufruf, die Action setzt die Teile zusammen –
  `trophy` ist die größte Tabelle und bräuchte selbst Seiten.
- **Ohne Worker:** `backup.json` in der Action aus dem schon erzeugten `backup.sql` bauen (in ein
  lokales SQLite einspielen und als JSON ausgeben) – die Route fiele für die Sicherung weg; dann wäre
  zu klären, ob sie für etwas anderes noch gebraucht wird.
- **Reihenfolge entkoppeln:** `backup.sql` ablegen, auch wenn der JSON-Teil scheitert – das beseitigt
  den Abbruch nicht, aber den Verlust des Dumps.

#### Die Kaufliste: lohnt eine kleinere Portion?

**Gemessen in der Nacht zum 25.10.2026:** 15 Aufrufe zu je einer Seite von 50 Käufen
(`KAEUFE_JE_SEITE`, `src/sync/besitz.ts`), 734 Einträge, 11–26 ms, Median 19 – über dem Budget
(Median ≤ 8, P90 ≤ 10, keiner über 15).

**Was gegen eine kleinere Portion spricht, gemessen statt geschätzt:**

- **Das PSN-Fenster hat 36 Aufrufe.** In dieser Nacht belegten Sync 11, Spielzeit 2, Kaufliste 15 und
  Level 1 zusammen 29. Mit 25 je Seite bräuchte die Kaufliste 30 Aufrufe, zusammen 44 – sie liefe in die
  nächste Nacht. Mit 40 wären es 19, zusammen 33.
- **Die CPU wächst kaum mit der Portion:** Die letzte Seite mit 34 Käufen kostete in DFW 23 ms, volle
  Seiten am selben Standort 18–23. Das ist ein einzelner Wert (n = 1) – er deutet auf feste Kosten je
  Aufruf, nicht auf Kosten je Kauf.

**Offen:** ob die Kaufliste wie Markt und Store in eine Action gehört, statt kleiner zu werden.
