← [Inhaltsverzeichnis](README.md) · [16.2 CPU-Grenze](16-2-cpu-und-betrieb.md)

## 16. Vorlagen für die Budget-Bewertung am 02.11.2026

Punkte, die bei der Neubewertung des Budgets arbeitender Aufrufe ([16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md))
mit entschieden werden (Vorgabe des Nutzers vom 25.10.2026). **Gebaut wird erst nach der Bewertung.**

#### Welche Nächte zählen

Nachtläufe werden nicht mehr täglich ausgewertet, sondern bei einer Betriebswarnung und zu
Messterminen (Entscheidung des Nutzers vom 25.10.2026). **Der nächste ist die Nacht zum 01.11.:** Im
Wartungsfenster werden erstmals alle verknüpften Spiele zum Auffrischen fällig (von Hand aufgefrischt
am 24.10., Frist sieben Tage), höchstens drei Aufrufe (18n, Logzeile `auffrischen=grenze`); im
PSN-Fenster läuft die Kaufliste, am selben Sonntag die erste geplante Sicherung mit dem neuen Ablauf
([14.2](14-backup-export.md)). Für die Bewertung am 02.11. zählen die Nächte 31.10. bis 02.11. – die
Telemetry hält rund sieben Tage (gemessen am 29.10.2026, [10.1](10-1-cron-cpu.md)). Abbrüche zählt `workersInvocationsAdaptive` (`status`) auch rückwirkend:
11.–16.10. 14 bis 42 je Nacht, 17.–25.10. keiner.

**Am Cron bis nach der Auswertung der Nacht zum 01.11. nichts ändern** – sonst ist die Wirkung von 18n
nicht zuzuordnen (eine Änderung je Nacht). Was den Cron nicht anfasst, läuft parallel, etwa
„veraltete Ansichten aufräumen“ ([16-2-offene-stufen.md](16-2-offene-stufen.md)).

#### Die Sicherung über `GET /api/export/backup.json`

**Gemessen am 25.10.2026:** 212 ms CPU (SEA, Sonntagslauf) und 266 ms (MSP, erster Lauf von Hand mit
dem neuen Ablauf, `backup.json` 11,65 MB) – je ein Aufruf, beide ohne Abbruch, das Zwanzig- bis
Siebenundzwanzigfache der Grenze.

**Wann sie läuft:** nur in der wöchentlichen Sicherung (`backup.yml`, sonntags 03:17 UTC, am 25.10.
um 08:30 gestartet) und wenn sie von Hand gestartet wird. **Der Deploy ruft die Route nicht:** Er sichert
per `wrangler d1 export` über die D1-API ([15.2](15-repository-deployment.md)), dort zählt keine Worker-CPU,
und sein Abbruch hängt nicht an ihr (geprüft am 25.10.2026 in `deploy.yml`).

**Wenn die Laufzeit sie abbricht:** Seit dem 25.10.2026 wird der Dump trotzdem geprüft und abgelegt,
und der Lauf endet rot ([14.2](14-backup-export.md)); bis dahin ging der Dump derselben Woche mit
verloren. `backup.json` ist dann die einer früheren Woche.

**Entschieden am 02.11.2026: ohne Worker.** `backup.json` entsteht in der Action aus dem schon
erzeugten `backup.sql` (`scripts/json-aus-dump.mjs`, [14.2](14-backup-export.md)); die Route bleibt
nur für den Download von Hand. Geprüft vorher: dieselbe Datei wie die Route, mit erfundenen Daten und
mit dem Bestand der Produktion. **Verworfen:** die portionierte Route – sie hätte `trophy` in Seiten
teilen und die Teile in der Action zusammensetzen müssen, für eine Datei, die der Dump schon enthält.
Die Entkopplung vom 25.10.2026 bleibt: Scheitert der JSON-Teil, wird der Dump trotzdem abgelegt.

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

**Zweite Messung in der Nacht zum 01.11.2026:** 10–19 ms, Median 13, an anderen Standorten ([16-2-naechte.md](16-2-naechte.md)).

**Entschieden am 02.11.2026: Die Portion bleibt bei 50.** Ein Aufruf macht eine feste Zahl von
D1-Aufrufen (Seite holen, Kandidaten in einer Abfrage, Berechtigungen erkennen; eine Schleife nur über
neue Käufe), eine kleinere Portion senkte die Kosten kaum und bräuchte mehr Aufrufe. **Weiter offen:** ob
die Kaufliste wie Markt und Store in eine Action gehört.

#### Das Budget arbeitender Aufrufe

**Bewertet am 03.11.2026** mit den Nächten 31.10. bis 03.11. ([16-2-naechte.md](16-2-naechte.md)):
**Die Hypothese bleibt Ziel, und es wird gezielt daran gearbeitet** – nach 20g (Entscheidung des Nutzers
vom 03.11.2026). Gelockert wird sie nicht: Dass seit dem 17.10. kein Aufruf abbrach, ist Duldung, keine
Einhaltung (CLAUDE.md); eine andere Begründung für eine höhere Obergrenze gibt es nicht.

| | 31.10. | 01.11. | 02.11. | 03.11. |
|---|---|---|---|---|
| arbeitende Aufrufe | 15 | 33 | 18 | 18 |
| davon über 10 / über 15 ms | 13 / 8 | 28 / 14 | 13 / 9 | 15 / 8 |
| Leerlauf über 10 ms | 1 | 1 | 2 | 11 |

Der Median arbeitender Aufrufe liegt bei rund 13–15 ms; kein arbeitender Schritt hält das Budget außer
Jahre und Level an guten Standorten. Abbrüche (`exceededResources`, alle Aufrufe je Tag): 10.–16.10. 12
bis 42 je Tag, seit dem 17.10. keiner – auch nicht bei Spielzeit mit 64 ms und der Sicherung über den
Worker mit 321 ms.

**Wie gearbeitet wird:** nach dem Muster von 18n-c – erst je Schritt die D1-Aufrufe zählen, dann
bündeln. Reihenfolge von oben nach unten, nach dem teuersten Aufruf (Entscheidung des Nutzers vom 04.11.2026; 29.10.–04.11.
gemessen): **Spielzeit** (Median 22, 14 von 14 über 15 ms, gebaut als 18o, Spitzen 14 ms in FRA und 38 ms in LAX, [7.7](07-7-psn-weitere-daten.md)), dann
Sync (Median 13, 27 von 77), dann Kaufliste (15 einmal je Woche, Median 13). **Das Auffrischen bleibt, wie
es ist** (Entscheidung vom 03.11.2026): 8–10 ms nach 18n-c; erst bei einem Abbruch oder einem Wert über
15 ms wird es wieder angesehen. **Am 04.11. stand ein Aufruf bei 22 ms** (LAX, 28 Spiele, n = 1, [16-2-naechte-2.md](16-2-naechte-2.md)); in den Nächten 08. bis 11.11. lagen sieben Aufrufe bei 8–16 ms, zweimal 16 ([16-2-naechte-3.md](16-2-naechte-3.md)). **Es bleibt, wie es ist** (Entscheidung des Nutzers vom 08.11.2026).

#### Der Sync-Plan: 18q und 18p (geplant am 08.11., Reihenfolge vom 12.11.2026)

**Gezählt am 08.11.2026** über den echten Einstieg mit nachgebauten Antworten (D1-Aufrufe je
arbeitendem Aufruf, Leerlauf 2): Sync-Abruf 7 (der erste des Laufs 9), Normalisierung 7 mit einem Batch
von **104 Anweisungen** (D1 dokumentiert 50), Abschluss 12, Spitze 6, Kaufliste 7, Auffrischen 4. Jeder
PSN-Aufruf las die Zugangszeile zweimal und erneuerte das Token; der Sync liest den laufenden Lauf
doppelt. Ein D1-Aufruf kostet in der Produktion rund 1,4–1,9 ms (0,7 im Messworker von 18h, Faktor
2–2,7) – **eine Schätzung**; das Budget erreicht damit kein PSN-Schritt an den langsamen Standorten,
deren Leerlauf allein bis 17 ms liegt.

- **18q – Token-Pfad** (gemeinsamer Code, eigene Nacht; gebaut am 12.11.2026): die Zugangszeile aus
  der Lage, das Access Token wiederverwendet ([7.1](07-1-psn-trophaeen.md)). Gezählt mit gespeichertem
  Token: **Spitze 6 → 4, Kaufliste 7 → 5, Sync-Abruf 7 → 5, Level 3**, Fremdanfragen je Aufruf 2 → 1
  (`test/token-wiederverwenden.spec.ts`). Erneuert wird rund alle 50 Minuten.
- **18p – Schritte bündeln** (nur einzelne Schritte, ein Deploy; gebaut am 12.11.2026, ausgeliefert
  nach der Nacht zum 15.11.): Sync-Abruf 5 → **3** (laufender Lauf aus der Lage, Rohantwort und
  Fortschritt in einem Batch), Normalisierung 7 → **4** (Rohantwort und offene Listen in einem
  Lese-Batch; Protokoll, Upsert, Markieren und Zählen in einem Schreib-Batch; mehrzeilige Upserts zu
  sechs Titeln, 104 → 21 Anweisungen je Seite), Abschluss 12 → **4** (mit offenen Listen 5: ein
  Schreib-Batch für Vorbelegen, Einreihen, Abschließen und Erfolg), Kaufliste 5 → **4** (Stand und
  Fehlerstatus in einem Batch); die automatische Zuordnung fragt Kandidaten und belegte Releases je in
  einer Abfrage statt zwei bis drei je Liste. Gelesene und geschriebene Zeilen bleiben gleich
  (gemessen gegen den unberührten Stand, ein Aufruf liest 1–3 weniger). Kein Aufruf schickt mehr als
  50 Anweisungen (`test/sync-buendel.spec.ts`). **Nebenwirkung, gewollt:** Die Batches machen drei
  Halbzustände unmöglich – eine Seite abgelegt, aber nicht weitergezählt (beim nächsten Mal doppelt
  abgelegt), eine Seite geschrieben, aber nicht markiert (zweimal normalisiert), ein Lauf vorbelegt,
  aber nicht abgeschlossen.

**Reihenfolge** (Entscheidung des Nutzers vom 12.11.2026): 18q zuerst – die Spitze, der teuerste Aufruf,
fragt in sich nur zweimal und gewinnt allein durch 18q. 18p wird **nach der Kaufliste-Nacht zum
15.11.** ausgeliefert, damit die Kaufliste 18q allein zeigt. **Verworfen:** den Ausgang in den
Schreib-Batch des Schritts zu legen – er muss auch bei einem Fehler im Schritt stehen und bräuchte
einen Rückfallweg, mehr Risiko als ein D1-Aufruf wert ist.
