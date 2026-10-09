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
(Abschnitt 2); ein Aufruf schafft eine Seite holen (≈ 3 ms) **oder** eine Seite auswerten
(5–7 ms), nicht beides. Jeder Aufruf tut deshalb genau **eines** und hört dann auf. **Die
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
PSN-Fenster mit. Gemessen in `test/lesekosten.spec.ts` bei 430 Listen: ein Leerlauf im PSN-Fenster
liest **15** Zeilen (`psn_sync_run`) plus vier für die Store-Auswahl seit 21b, einer in der Wartung
**2 226** – weit unter dem Tagesbudget von fünf Millionen.

**Der Leerlauf einer Nacht summiert sich auf rund 80 800 Zeilen** (19 × 36 + 2 226 × 36) –
gerechnet aus den gemessenen Einzelkosten, nicht frisch über 24 Stunden gemessen; die letzte
24-Stunden-Messung (116 040 Zeilen am 01.10.2026, 15.4) liegt vor der Erweiterung des
Wartungsfensters.

**Der Leerlauf ist aber nicht die Nacht.** Die *arbeitenden* Aufrufe kosten mehr: Der
Spielzeit-Schritt allein las über einen Titelabgleich ohne Index rund **145 000** Zeilen je Nacht,
die wöchentliche Kaufliste rund **350 000** (Abschnitt 2, Migration 0025); eine Nacht lag damit bei
gut **200 000**, und zusammen mit einer Arbeitssitzung ergab das am 28.09.2026 **1 335 628**
gelesene Zeilen in 24 Stunden. Seit dem Index sind es je Abgleich vier statt 480. **Eine Messung,
die nur den Leerlauf zählt, beschreibt nicht die Nacht** ([lehren.md](../lehren.md)).

**Wie eine Nacht nachträglich lesbar ist** – `cron_verlauf`, die Verdichtung und der
örtliche Aufruf: [10-1-cron-verlauf.md](10-1-cron-verlauf.md).
