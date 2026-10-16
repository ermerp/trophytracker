← [Inhaltsverzeichnis](README.md)

### 10.1 Automatik: der Cron Trigger (Stufe 18)

`wrangler.jsonc` trägt **zwei** Cron-Einträge (Stufe 18e, Entscheidung des Nutzers vom 27.09.2026;
bis dahin einen). Der Free Tier erlaubt fünf je Konto – gegen Cloudflares Dokumentation geprüft am
27.09.2026, dort steht auch die 10-ms-CPU-Grenze für Cron-Aufrufe:

| Eintrag | Ausdruck | Aufrufe | Arbeit |
|---|---|---|---|
| PSN | `*/5 3-5 * * *` | 36 (05–08 Uhr MESZ) | Hänger abbrechen, Sync-Schritt, Spielzeit, Kaufliste, Einzeltrophäen, Store-Preise |
| Wartung | `*/5 6-8 * * *` | 36 (08–11 Uhr MESZ) | erschienene Titel freigeben, IGDB-Auffrischen, Disc-Fassungen, **Gebrauchtpreise**, Trophäen je Jahr, alte Rohantworten |

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
siehe „Was ein Aufruf wirklich an CPU kostet" unten. **Die
fünfzehn Schritte in ihrer Reihenfolge, jeder mit seiner Begründung, stehen in
[10-1-cron-schritte.md](10-1-cron-schritte.md)** – 1 bis 8 gehören dem PSN-Fenster, 9 bis 15
der Wartung.

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
PSN-Fenster mit. Gemessen in `test/lesekosten.spec.ts` bei 430 Listen (Stand 16.10.2026, Stufe
18g): ein Leerlauf im PSN-Fenster liest **20** Zeilen (`psn_sync_run`, die Store-Auswahl, Marke und
Verlauf), einer in der Wartung **2 659** – weit unter dem Tagesbudget von fünf Millionen. Bis 18g
standen hier 15 + 4 und **2 226**: Die Summe zählte die Auswahl des Marktschritts nicht mit (430
Zeilen, obwohl nichts fällig ist), ebenso wenig Verlauf und Jahre-Stand – gemessen war die
Abfrage, nicht der Aufruf.

**Der Leerlauf einer Nacht summiert sich auf rund 96 400 Zeilen** (20 × 36 + 2 659 × 36; bis 18g
gerechnet 80 784) – aus den gemessenen Einzelkosten, nicht frisch über 24 Stunden gemessen. Die
letzte 24-Stunden-Messung ohne Import: **216 950** gelesene und **2 977** geschriebene Zeilen
am 16.10.2026, in einer Woche mit abgebrochenen Wartungsaufrufen (unten); die vorige, 116 040 am
01.10.2026 (15.4), liegt vor der Erweiterung des Wartungsfensters. Die Marke aus 18g schreibt zwei
Zeilen je Aufruf, **144** je Nacht.

**Der Leerlauf ist aber nicht die Nacht.** Die *arbeitenden* Aufrufe kosten mehr: Der
Spielzeit-Schritt allein las über einen Titelabgleich ohne Index rund **145 000** Zeilen je Nacht,
die wöchentliche Kaufliste rund **350 000** (Abschnitt 2, Migration 0025); eine Nacht lag damit bei
gut **200 000**, und zusammen mit einer Arbeitssitzung ergab das am 28.09.2026 **1 335 628**
gelesene Zeilen in 24 Stunden. Seit dem Index sind es je Abgleich vier statt 480. **Eine Messung,
die nur den Leerlauf zählt, beschreibt nicht die Nacht** ([lehren.md](../lehren.md)).

### Was ein Aufruf wirklich an CPU kostet

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
Bis zum 09.10. wurde jeder Aufruf geduldet. Ab dem 10.10. bricht die Laufzeit nach einer Folge
schwerer Aufrufe für ein bis vier Stunden **jeden** Aufruf bei genau 10,0 ms ab (`exceededResources`),
auch den Leerlauf – 12 von 36 Wartungsaufrufen am 10.10., 35 am 11.10. (dort schon ab 05:25 im
PSN-Fenster), 15 bis 33 an jedem Tag danach. Am 16.10. lief es von 08:05 an wieder. Ausgelöst
wurde jeder Aufruf; es fehlte keiner.

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

**Ungeklärt:** warum der Gebrauchtpreis-Aufruf am 10.10. um 07:00 von rund 70 auf rund 140 ms
sprang – an dem Tag gab es keinen Deploy; am 13.10. kosteten die frühen Aufrufe 68 ms, die späten
138. Was daraus für jeden Schritt folgt und was zu entscheiden ist: [16.2](16-2-offene-stufen.md).
Der Bezahlplan ist ausgeschlossen (Entscheidung des Nutzers vom 16.10.2026).

Seit Stufe 18g hinterlässt ein so abgebrochener Aufruf eine Spur – die Marke „begonnen",
[10-1-cron-verlauf.md](10-1-cron-verlauf.md).

**Wie eine Nacht nachträglich lesbar ist** – `cron_verlauf`, die Verdichtung und der
örtliche Aufruf: [10-1-cron-verlauf.md](10-1-cron-verlauf.md).
