← [Inhaltsverzeichnis](README.md) · [10.1 Cron](10-1-cron.md)

### 10.1 Was ein Aufruf wirklich an CPU kostet

Gemessen am 16.10.2026 über Cloudflares Analytics (`workersInvocationsScheduled`, eine Zeile je
Cron-Aufruf, Aufbewahrung 90 Tage), für 863 Aufrufe vom 05. bis 16.10.2026 – nicht geschätzt:

| Arbeit | CPU je Aufruf |
|---|---|
| Leerlauf | 12–20 ms |
| Sync, eine Seite holen oder auswerten | 13–30 ms |
| Store-Preise, zehn Releases | 90–110 ms |
| Spielzeit, eine Seite | 200–250 ms |
| Gebrauchtpreise, zwanzig Releases | 62–72 ms bis 08.10., 86 am 09.10., rund 140 ab 10.10. 07:00 |

**Kein einziger Schritt bleibt unter 10 ms, auch der Leerlauf nicht.** Dass es trotzdem lief,
liegt an einer Duldung: Cloudflare gesteht Workern, die die Grenze *selten* überschreiten, eine
nicht bezifferte Flexibilität zu; bei dauerhafter Überschreitung wird abgebrochen. Beobachtet:
Vom 05. bis 09.10. wurde jeder Aufruf geduldet – am **04.10.**, vor dem Messzeitraum, brachen
schon 22 Wartungsaufrufe ab (nachgemessen am 17.10.2026). Ab dem 10.10. bricht die Laufzeit nach einer Folge
schwerer Aufrufe für ein bis vier Stunden **jeden** Aufruf bei genau 10,0 ms ab (`exceededResources`),
auch den Leerlauf – 12 von 36 Wartungsaufrufen am 10.10., 35 am 11.10. (dort schon ab 05:25 im
PSN-Fenster), 15 bis 33 an jedem Tag danach. Am 16.10. lief es von 08:05 an wieder. Ausgelöst
wurde jeder Aufruf; es fehlte keiner. **Woran die Duldung hängt, ist offen** (nachgezählt am 19.10.2026,
`workersInvocationsAdaptive`, Nächte 28.09.–19.10.): Abbrüche gab es in **8 von 22 Nächten** – am
04.10. in Newark (21), vom 10. bis 16.10. in Singapur (12–42 je Nacht). In den Nächten 17. bis 19.10.
lagen je 43 bis 69 Aufrufe über 10 ms, abgebrochen wurde keiner, und am 20.10. (USA verstreut, die
Markt-Action erstmals außerhalb des Crons) 35 von 69 erfassten über 10 und 21 über 15 – ebenfalls
alle `success`; Ende September liefen Nächte in
Mumbai und Taipeh ohne Abbruch. Der Standort allein erklärt es also nicht.

**Wohin die CPU geht** – gemessen am 16.10.2026 in einem eigenen Messworker ohne Produktionsdaten
(Stufe 18h): der echte Code der Anwendung, einmal mit abgespielten D1-Antworten, einmal gegen
eine Wegwerf-D1 mit dem Produktionsschema und nachgebautem Bestand in Produktionsgröße.
**Nicht das Rechnen ist teuer, sondern der D1-Aufruf:**

| | ohne D1 | mit echter D1 | Produktion | D1-Aufrufe |
|---|---|---|---|---|
| Leerlauf Wartung | 1,0 ms | 6,8 ms | 12–18 ms | 10 |
| Leerlauf PSN | 1,2 ms | 7,5 ms | 15–20 ms | 16 |
| Spielzeit, 200 Titel | 6,3 ms | 170 ms | 200–250 ms | 217 |
| Gebrauchtpreise, 20 Releases | 34 ms | 94 ms | 125–170 ms | 24 |

Eine einfache Abfrage kostet **0,35–0,45 ms**, eine des echten Codes rund **0,7 ms**; je
zurückgegebener Zeile ≈ 0,001 ms (1 000 Zeilen in einer Abfrage: 2,3 ms). **Ein Batch mit 100
Anweisungen kostet 1,9–2,5 ms**, 100 einzelne Abfragen 35–45 – je Anweisung ein Zwanzigstel. Start
der Instanz, Scheduled-Einstieg und Observability fallen nicht ins Gewicht: Ein kalter Cron-Aufruf
mit dem vollen Bündel und einem `INSERT` kostet 1,6 ms (P50), das Laden des Bündels 0,57 ms, und mit
eingeschalteter Observability kosten 100 Abfragen 46 statt 45 ms. Netz: Eine Antwort von 73 KB
am Stück (`.text()`) kostet ≈ 0,4 ms, **als Strom gelesen ≈ 3 ms** – so liest der Store seine
Seiten. **Der Marktschritt ist der einzige, bei dem auch das Rechnen zählt** (34 von 94 ms): Ein lokales Profil (Node, echte Titel, nachgebaute eBay-Antworten von 30 KiB) legt es in die Titelzerlegung (`worteAus`, 30–40 % Eigenzeit), den Sammlungsabgleich (rund 20 %) und das JSON-Parsen (rund 15 %). Die verbleibende Lücke zur Produktion (rund ein Drittel) ist nicht zugeordnet; echte
Fremdantworten (eBay, Sony) fehlten in der Messung.

**Keine warme Instanz:** Von 28 Cron-Aufrufen im Minutentakt traf **keiner** eine Instanz, die
schon einen Aufruf hinter sich hatte. Etwas auf Modulebene zwischen Cron-Aufrufen zu halten –
etwa die vorbereitete Sammlung des Marktschritts – bringt deshalb nichts; im Fünf-Minuten-Takt
der Produktion erst recht nicht.

**Der Standort zählt mit** (nachgemessen am 17.10.2026 über `workersInvocationsAdaptive`, das je
Aufruf das Rechenzentrum nennt, `coloCode`). Der „Sprung am 10.10." war kein Sprung des Marktschritts
um 07:00: Er lag schon vor dem Sync um 03:00 und traf **jeden** Schritt, und er fällt mit einem
Umzug des Crons zusammen:

| Nächte | Standort des Crons | Sync | Spielzeit | Gebrauchtpreise |
|---|---|---|---|---|
| 04.–08.10. | Newark (EWR), jede Nacht | ~10 ms | 115–150 ms | ~68 ms |
| 10.–16.10. | **Singapur (SIN), jeder Aufruf** | 16–17 ms | 200–250 ms | ~140 ms |
| 17.10. | verstreut über die USA (ATL, EWR, IAD, ORD, LAX, SJC …) | 15 ms | 100–124 ms | 97 ms |

Die D1 liegt in Osteuropa (EEUR). Das ist eine **Korrelation, keine belegte Ursache**, und sie
erklärt nicht alles: Am 13.10. lief jeder Aufruf in Singapur, und trotzdem kosteten die frühen
Gebrauchtpreis-Aufrufe 68 ms, die späten 138. Innerhalb der einen Nacht zum 17.10. streute der
PSN-Leerlauf je Standort um rund 5 ms (EWR 11,4–12,5, ATL und IAD 15–18) – **mehr, als ein
einzelner Nachtrag bewirkt**. Für die Messungen heißt das: **Nächte nur je Standort vergleichen**
([lehren.md](../lehren.md)). Gemessen wird dafür `workersInvocationsAdaptive` je Minute (im
Fünf-Minuten-Takt ist ein Wert ein Aufruf); `workersInvocationsScheduled` war am 17.10.2026 seit dem
Vortag 09:00 leer und am 19.10.2026 wieder, und Adaptive ist eine Stichprobe – in den Nächten zum
17. und 19.10. fehlte dort je einer von 72 Aufrufen. **Welcher Schritt lief und `cpuTimeMs` je
Aufruf** liefert seit dem 19.10.2026 die Telemetry-API der Observability-Logs
(`/accounts/{id}/workers/observability/telemetry/query`, Token wie Wrangler): je Aufruf ein Ereignis
mit `cpuTimeMs` (ganze ms), `wallTimeMs` und `outcome`, dazu die Logzeile `cron: …` über dieselbe
`requestId`. Aufbewahrt werden **rund sieben Tage** (am 29.10.2026 um 20:36 UTC reichte die Abfrage
bis in die Nacht zum 23.10., 68 von 72 Aufrufen; vorher hieß es hier drei Tage), und auch dort fehlen
Ereignisse (zwei von vier Portionen im ersten Lauf von 20i). Ab dem 01.12.2026 rechnet Cloudflare
Observability nach Volumen: im Free-Plan 0,5 GB am Tag und sieben Tage Aufbewahrung; ist die
Tagesgrenze erreicht, kommen bis zum Zurücksetzen keine Ereignisse mehr an – eine Lücke, die nicht
vom Worker kommt. Gemessen am 28.10.2026: 162 Ereignisse, 177 KB. Verbunden über die Minute ergibt beides Schritt, Menge, Standort
und CPU je Aufruf; was fehlt, deckt `cron_verlauf`. Ob sich der Standort festlegen lässt, wird nach 18j bis 18l recherchiert. Was daraus
für jeden Schritt folgt und was zu entscheiden ist: [16.2](16-2-cpu-und-betrieb.md).
Der Bezahlplan ist ausgeschlossen (Entscheidung des Nutzers vom 16.10.2026).

Seit Stufe 18g hinterlässt ein so abgebrochener Aufruf eine Spur – die Marke „begonnen",
[10-1-cron-verlauf.md](10-1-cron-verlauf.md).

**Wie eine Nacht nachträglich lesbar ist** – `cron_verlauf`, die Verdichtung und der
örtliche Aufruf: [10-1-cron-verlauf.md](10-1-cron-verlauf.md).
