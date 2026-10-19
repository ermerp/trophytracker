← [Inhaltsverzeichnis](README.md)

### 10.1 Automatik: der Cron Trigger (Stufe 18)

`wrangler.jsonc` trägt **zwei** Cron-Einträge (Stufe 18e, Entscheidung des Nutzers vom 27.09.2026;
bis dahin einen). Der Free Tier erlaubt fünf je Konto – gegen Cloudflares Dokumentation geprüft am
27.09.2026, dort steht auch die 10-ms-CPU-Grenze für Cron-Aufrufe:

| Eintrag | Ausdruck | Aufrufe | Arbeit |
|---|---|---|---|
| PSN | `*/5 3-5 * * *` | 36 (05–08 Uhr MESZ) | Hänger abbrechen, Sync-Schritt, Spielzeit, Kaufliste, Einzeltrophäen, Store-Preise |
| Wartung | `*/5 6-8 * * *` | 36 (08–11 Uhr MESZ) | erschienene Titel freigeben, IGDB-Auffrischen, Disc-Fassungen, Trophäen je Jahr, alte Rohantworten – die **Gebrauchtpreise** laufen seit Stufe 20i als GitHub Action um 02:17 UTC (7.3) |

**Warum aufgeteilt.** Ein Fenster trug die Arbeit nicht mehr: elf Aufrufe Sync, zwei Spielzeit,
fünfzehn Kaufliste und – nach einem IGDB-Rückstand – acht Auffrischen sind **37 von 36**
(nachgerechnet am 24.09.2026, siehe „Die Auffrisch-Last kommt in Schüben"). Der Schnitt liegt bei
„fasst PSN an oder nicht": Die PSN-Kette braucht viele Aufrufe und hängt an einer inoffiziellen
Schnittstelle, die Wartung ist billig und beliebig verschiebbar. Die Lastspitzen liegen damit
nicht mehr in derselben Stunde – **bequem ist aber keine der beiden Hälften mehr**, seit der
Preisabruf täglich läuft (siehe „Was eine Nacht wirklich belegt").
Der Ansatz ist der des Nutzers vom 24.09.2026; das eine Nachtfenster
war seine Entscheidung vom 19.09.2026 und bleibt es für alles, was PSN anfasst.

Welcher Eintrag gefeuert hat, steht in `event.cron`; `bereichFuerAusdruck` bildet es auf
`psn` / `wartung` ab. Die Ausdrücke stehen als Konstanten `CRON_PSN` und `CRON_WARTUNG` in
`src/sync/cron.ts` – ein **unbekannter** Ausdruck bekommt `alles` und tut beides, damit eine
Änderung an `wrangler.jsonc` nicht die halbe Automatik still abschaltet. Lokal (`--test-scheduled`)
und im Test ist `alles` der Normalfall.

Der Einstieg ist `scheduled` in `src/index.ts`, die Logik `cronSchritt` in `src/sync/cron.ts` –
eine reine Funktion über Repositories und Clients, gegen die lokale D1 getestet (`test/cron.spec.ts`).

**Ein Aufruf, eine schwere Arbeit** – die 10-ms-CPU-Grenze gilt auch für Cron-Aufrufe
(Abschnitt 2). Jeder Aufruf tut deshalb genau **eines** und hört dann auf. Dass er damit
**unter** der Grenze bleibt, war eine Annahme – bis hier stand, ein Aufruf schaffe „eine Seite
holen (≈ 3 ms) **oder** eine Seite auswerten (5–7 ms)". Gemessen ist eine Größenordnung mehr,
siehe „Was ein Aufruf wirklich an CPU kostet" ([10-1-cron-cpu.md](10-1-cron-cpu.md)). **Die
fünfzehn Schritte in ihrer Reihenfolge, jeder mit seiner Begründung, stehen in
[10-1-cron-schritte.md](10-1-cron-schritte.md)** – 1 bis 8 gehören dem PSN-Fenster, 9 bis 15
der Wartung.

**Ein Lese- und ein Schreib-Batch (Stufe 18j).** Gezählt wird nicht die Arbeit, sondern die
D1-Aufrufe: In 18h kostete ein Aufruf rund 0,7 ms CPU, eine Anweisung in einem Batch ein Zwanzigstel
davon (unten). Bis 18j fragte jeder Aufruf seine Lage Schritt für Schritt ab – zehn D1-Aufrufe im
Leerlauf der Wartung, 16 im PSN-Fenster. Seither:

1. **Der Lage-Batch** (`CronLageRepository`, `src/db/cron-lage.ts`) liest in **einer** Transaktion
   alles, was die Entscheidung braucht, und erledigt dabei, was vor jeder Arbeit stehen muss: die
   Marke „begonnen" ([10-1-cron-verlauf.md](10-1-cron-verlauf.md)), die Hänger, und in der Wartung
   die beiden Daueraufgaben Freigabe und Aufräumen. Die Reihenfolge der Anweisungen ist im Code
   begründet – Marke zuerst, Hänger vor „läuft ein Lauf?".
2. `entscheide(lage)` wählt rein und ohne D1 die fälligen Schritte in der Reihenfolge von
   [10-1-cron-schritte.md](10-1-cron-schritte.md); der Schritt bekommt seine Auswahl übergeben.
3. **Der Ausgangs-Batch** schreibt Verlaufszeile, Fakten (`cron_stand`) und das Wegräumen der Marken.

Ein Leerlauf sind damit **zwei** D1-Aufrufe; `test/cron-lage.spec.ts` zählt sie über eine D1, die
ihre Aufrufe zählt (`test/d1-zaehler.ts`). Die Spielzeit fragt seit 18k gebündelt – zwei D1-Aufrufe
je Seite statt 217 ([16.2](16-2-cpu-und-betrieb.md)); was die übrigen arbeitenden Schritte in sich
abfragen, bleibt bis 20i, wie es ist (18l änderte den Store-Leser, nicht seine D1-Aufrufe).

**Scheitert eine Anweisung des Lage-Batchs, scheitert er ganz** – auch die Marke wird nicht gesetzt,
gearbeitet wird nichts, und der Aufruf schreibt „cron: abgebrochen". Halb geschehen ist dann nichts.
Der Preis: Scheitert eine Anweisung dauerhaft (etwa ein Schema, das nach einem Deploy nicht passt),
steht die ganze Automatik, nicht nur ihr Schritt, und D1 sagt nicht verlässlich, welche Anweisung es
war. Bewusst so gelassen – für diese Anweisungen gibt es keinen Fehler, der eine allein trifft, und
der Verlauf zeigt den Stillstand ab dem ersten Aufruf.

**Knopf und Cron sehen dieselbe Auswahl** (Vorgabe des Nutzers vom 17.10.2026, die Lehre aus 18e):
Jede Auswahl ist ein *Baustein* (`src/db/baustein.ts`) – Anweisung plus Auswertung – im Repository.
Die Repository-Methode, die die Portionsknöpfe in den Einstellungen rufen, führt ihn allein aus;
der Lage-Batch fügt denselben Baustein ein. Eine zweite Fassung der Abfrage gibt es nicht.

Die elf Sync-Aufrufe bei 431 Titeln sind fünf Seiten holen, fünf auswerten und der Abschluss.

**Die Auffrisch-Last kommt in Schüben, nicht gleichmäßig.** „Ein bis zwei Aufrufe für IGDB" gilt
im Beharrungszustand, nicht nach einem Rückstand: Am 24.09.2026 trugen **368 der 477 verknüpften
Spiele denselben Stempel** – eine Nacht hatte den Rückstand aus 18b in einem Zug abgearbeitet, und
sie werden deshalb alle in derselben Nacht wieder fällig und brauchen bei fünfzig je Aufruf
**acht** Aufrufe.

**Was eine Nacht wirklich belegt** – gemessen am 09.10.2026 aus `cron_verlauf`, nicht gerechnet:

| Fenster | mit Arbeit | Leerlauf | wovon |
|---|---|---|---|
| PSN | 24 von 36 | 12 | 11 Sync, 2 Spielzeit, 1 Level, 10 Store |
| Wartung | 26 von 36 | 10 | 1 Jahre, 1 Aufräumen, **24 Gebrauchtpreise** |

**Der Engpass ist nicht die Summe, sondern die Spanne.** Der Gebrauchtpreis-Schritt belegt seine
24 Aufrufe von **06:51 bis 08:46** – neun Minuten vor Fensterschluss; die 431 Stempel in
`markt_geprueft_am` liegen in genau diesem Fenster. Von den zehn freien Aufrufen liegen **acht
vor** dem Schritt, wo seine 24-Stunden-Frist noch läuft. Genau sie nehmen den IGDB-Schub auf, der
bis zu **neun** kostet – **an einer Schub-Nacht steht die Wartung bei 35 von 36.**

Im PSN-Fenster ist es die **Kaufliste**: elf Sync, zwei Spielzeit und fünfzehn Kaufliste sind 28,
dann bleiben acht für die Store-Preise, die zehn brauchen. Der Store-Schritt steht als letzter in
der Kette und verliert an einer solchen Nacht rund zwei Aufrufe, also etwa zwanzig Releases ohne
frischen Preis. In **einem** Fenster wären es 39 von 36 – dieselbe Rechnung wie 37 von 36 in 18e.

**Die Decke des täglichen Preistakts**: 20 Releases je Aufruf × 26 bis 33 nutzbare Aufrufe =
**520 bis 660 Releases**, im Zuschnitt sind **431**. Was das für den Wunschlisten-Import bedeutet,
ist offen ([16.2](16-2-offene-stufen.md)).

**Wer dem Cron einen Schritt hinzufügt, rechnet gegen die *freien* Aufrufe der Hälfte, in die er
gehört** – nicht gegen 36 für alles zusammen und nicht gegen deren Summe. Beide Fenster sind voll;
ein neuer täglicher Schritt gehört in ein **drittes** Cron-Fenster, drei der fünf erlaubten
Einträge sind frei.

Die Lesekosten sinken mit der Aufteilung, weil jedes Fenster nur noch seine eigenen Abfragen
liest: Die drei teuren (erschienene Titel, IGDB-Auswahl, Disc-Auswahl) laufen nicht mehr im
PSN-Fenster mit. **Gemessen wird seit Stufe 18j der ganze Aufruf durch den echten Einstieg**, mit
eingerichtetem PSN-Zugang und einer D1, die `meta.rows_read` aller Anweisungen summiert
(`test/lesekosten.spec.ts`, 430 Listen, Stand 17.10.2026): ein Leerlauf im PSN-Fenster liest **42**
Zeilen, einer in der Wartung **2 218** – weit unter dem Tagesbudget von fünf Millionen. In der
Produktion sind es rund 2 590; woran der Abstand liegt: [16.2](16-2-cpu-und-betrieb.md).

Bis dahin war die Summe aus nachgebauten Einzelabfragen zusammengesetzt und lag zweimal daneben;
als Aufruf gemessen, stand die Wartung vor Migration 0034 bei **3 075** statt der geführten 2 659
([lehren.md](../lehren.md), 17.10.2026).

**Der Leerlauf einer Nacht summiert sich auf rund 81 400 Zeilen** (42 × 36 + 2 218 × 36; bis 18j
gerechnet 96 444, bis 18g 80 784) – aus den gemessenen Einzelkosten, nicht frisch über 24 Stunden
gemessen. Geschrieben werden je Aufruf fünf Zeilen (Marke setzen und wegräumen, Verlauf, Stand),
**360** je Nacht. Gemessen über 24 Stunden ohne Import: **216 950** gelesene und **2 977**
geschriebene Zeilen am 16.10.2026, in einer Woche mit abgebrochenen Wartungsaufrufen (unten);
**325 631** und **3 537** am 17.10.2026 um 12:17 UTC, davon die Nacht 03–09 UTC – die erste
vollständige Wartung seit dem 10.10. – **229 836** gelesene (PSN 31 799, Wartung 198 037); am
18.10.2026 um 09:38 UTC **406 778** und **3 325**, davon die Nacht **223 047** (PSN 27 660, Wartung
196 387 samt der Sonntagssicherung um 08:07 mit rund 51 000). Summen stammen aus
`d1AnalyticsAdaptiveGroups` je Stunde, das sich mit `rows_read_24h` deckt; `d1QueriesAdaptiveGroups`
ist eine Stichprobe, lag rund 25 % darunter und taugt nur für Anteile je Abfrage. Die vorige
Messung, 116 040 am 01.10.2026 (15.4), liegt vor der Erweiterung des Wartungsfensters.

**Der Leerlauf ist aber nicht die Nacht.** Die *arbeitenden* Aufrufe kosten mehr: Der
Spielzeit-Schritt allein las über einen Titelabgleich ohne Index rund **145 000** Zeilen je Nacht,
die wöchentliche Kaufliste rund **350 000** (Abschnitt 2, Migration 0025); eine Nacht lag damit bei
gut **200 000**, und zusammen mit einer Arbeitssitzung ergab das am 28.09.2026 **1 335 628**
gelesene Zeilen in 24 Stunden. Seit dem Index sind es je Abgleich vier statt 480. **Eine Messung,
die nur den Leerlauf zählt, beschreibt nicht die Nacht** ([lehren.md](../lehren.md)).

**Was ein Aufruf wirklich an CPU kostet** – Messungen, Standort und Messweg – steht in
[10-1-cron-cpu.md](10-1-cron-cpu.md).
