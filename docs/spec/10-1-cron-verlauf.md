← [Inhaltsverzeichnis](README.md)

### 10.1 Der Cron – Verlauf und Nachvollziehbarkeit

**Sichtbarkeit.** Der Cron ist der erste Schreiber ohne Zuschauer. Jeder Aufruf schreibt eine
Log-Zeile mit Zahlen und festen Texten (`cronLogzeile`; die Meldungen sind schon bereinigt,
`test/keine-lecks.spec.ts` prüft sie) **und hinterlässt dieselbe Zeile mit Zeitstempel in
`app_setting` unter `cron_verlauf`, wo die letzten zwanzig stehen** (Migration 0022, verdichtet seit
Stufe 18d). Das ist kein Gespeichertes, das sich berechnen ließe: **Worker-Logs sind nur live
einsehbar**, ein schweigender Nachtschritt wäre am Morgen sonst nicht zu klären. Auch ein Absturz
mit Ausnahme wird vermerkt („cron: abgebrochen") – **ein Abbruch durch die Laufzeit nicht**: An
der CPU-Grenze endet der Aufruf, bevor das `catch` läuft.

**Die Marke „begonnen" (Stufe 18g)** schließt diese Lücke, ohne Verhalten zu ändern. Jeder Aufruf
setzt als Erstes eine Marke in `app_setting` (Zeit, Bereich), und erst der vermerkte Ausgang
nimmt sie im **selben Batch** wie die Verlaufszeile wieder weg – getrennt geschrieben, bliebe eine
Marke stehen, wenn der Aufruf dazwischen stirbt. **Seit Stufe 18j ist es eine Zeile je Aufruf**
unter `cron_begonnen:<Zeit>:<Bereich>` (Entscheidung des Nutzers vom 17.10.2026): Bis dahin war es
ein Schlüssel, den jeder Aufruf erst lesen musste, um die Kette der Toten in die neue Marke zu
tragen – zwei D1-Aufrufe vor jeder Arbeit. Jetzt sind die liegengebliebenen Zeilen selbst die Kette;
gelesen und gesetzt wird im Lage-Batch ([10-1-cron.md](10-1-cron.md)), gelesen über den
Schlüsselbereich `cron_begonnen` bis `cron_begonnen;`, damit der Primärschlüssel greift (kein
`LIKE`). Der Bereich schließt den alten Einzelschlüssel ein; eine Marke im alten Format wird samt
ihrer mitgetragenen Kette gemeldet. Findet ein Aufruf eine Marke, die **zwei Minuten
oder älter** ist, ist ihr Aufruf ohne Ausgang geblieben (Entscheidung des Nutzers vom 16.10.2026:
Der nächste reguläre Aufruf kommt nach fünf Minuten und muss sie sicher erkennen; die doppelte
Auslösung vom 16.10.2026 lag eine Minute auseinander und darf es nicht). Eine jüngere Marke wird
weder gemeldet noch angefasst, und jeder Aufruf löscht nur **seine eigene** Marke und die gemeldeten,
damit ein gleichzeitig laufender zweiter nicht die des ersten wegnimmt.

**Wachsen kann die Menge nur, solange kein Aufruf durchkommt** – jeder vermerkte Ausgang räumt die
gemeldete Kette weg, auch Marken, die älter als ein Tag sind: Sie werden gemeldet, nicht still
entfernt (Vorgabe des Nutzers vom 17.10.2026). Für den Fall, dass gar keiner durchkommt, liegen
höchstens **200** (knapp drei Nächte, `MARKEN_HOECHSTENS`); darüber entfernt der Lage-Batch die
ältesten. Damit das nicht unbemerkt bleibt, trägt die Marke des kappenden Aufrufs `gekappt`, und die
Zeile, die die Kette meldet, sagt `gekappt=ja` – ihr Anfang fehlt dann.

Gemeldet wird nicht sofort, sondern **mit dem nächsten vermerkten Ausgang**: Solange die
CPU-Grenze greift, stirbt auch der Aufruf, der melden würde. Die neue Marke trägt die Kette
deshalb weiter, und der erste Aufruf, der durchkommt, schreibt sie unter seine eigene Zeile:

```
2026-10-16 08:05 cron: markt bereich=wartung markt=erfolg geprueft=20 …
2026-10-16 06:30–08:00 cron: ohne_ausgang ×18 bereich=wartung
2026-10-16 06:05–06:25 cron: markt ×5 bereich=wartung …
```

So hätte der Morgen des 16.10.2026 ausgesehen; tatsächlich stand dort `markt ×16 06:06–08:56`, und
die 18 abgebrochenen Aufrufe dazwischen waren unsichtbar. Die Zeiten sind die **Anfänge der
verwaisten Aufrufe**, nicht die des meldenden. Eine Kette über die Fenstergrenze nennt beide
Bereiche (`bereich=psn→wartung`). Eine `ohne_ausgang`-Zeile wird nie verdichtet – wie eine
Zeile mit `meldung=` ist sie kein Leerlauf –, und die Zeile zwischen zwei Ketten trennt sie ohnehin.
Kosten seit 18j: fünf geschriebene Zeilen je Aufruf samt Verlauf und Stand, **360** je Nacht
(`test/lesekosten.spec.ts`).

**Die Fakten unter `cron_stand` (Stufe 18j).** Der Ausgangs-Batch legt neben der Textzeile Zahlen ab:
je Bereich den letzten Ausgang (`am`, `getan`, `meldung` als Wahrheitswert, `offen` beim Markt und
Store) und die zuletzt gemeldete Kette ohne Ausgang (`ohneAusgang`: Anzahl, von, bis, Bereich,
`gemeldetAm`). Das ist die Grundlage der Betriebswarnungen ([16.2](16-2-cpu-und-betrieb.md)): **Die
Fakten schreibt der Cron, das Urteil entsteht beim Lesen** – die Textzeile ist Anzeige, kein Datum,
und sie zu zerlegen bräche beim nächsten Umbau. Geschrieben wird mit `json_set` beim eigenen Bereich,
ohne den Stand vorher zu lesen; ein unlesbarer Stand wird ersetzt, statt den Batch und damit die
Verlaufszeile zu reißen.

**Was die Zeile nennt, muss sich bewegen.** Eine Fortschrittszahl, die in jedem Aufruf gleich
lautet, ist keine. Die Sync-Zeile nennt deshalb in der Abrufphase den `offset`, in der
Normalisierung die noch **offenen Rohantworten** (`offen=4 3 2 1 0`): Der Offset ist dort fest 0,
und fünf gleichlautende Zeilen „`sync=laufend/normalisierung offset=0`" sahen genauso aus wie eine
Seite, die immer wieder an derselben Stelle scheitert. Den Übergangsaufruf schreibt noch die
Abrufphase, er nennt weiter seinen Offset. Die Spielzeit-Zeile nennt alle drei Stufen ihres
Trichters (`geholt` von Sony, `geschrieben` nach dem Plattformfilter, `zugeordnet` mit Release):
Ohne die mittlere liest sich „`geholt=200 zugeordnet=117`" als 83 nicht zugeordnete Spiele, während
es die Streaming-Apps sind. Beides Befunde vom 24.09.2026, behoben ohne Migration.

**Warum zwanzig und warum verdichtet.** Der letzte Aufruf einer Nacht lautet fast immer „nichts",
weil die Arbeit dann getan ist: Das Fenster hat 36 Aufrufe, die Arbeit ist gegen 04:10 getan, danach
folgen gut zwanzig leere. Mit nur fünf gespeicherten Einträgen stand am Morgen deshalb fünfmal
„nichts" im Verlauf, während Sync, Spielzeit, Besitz und 49 aufgefrischte Spiele unsichtbar blieben.
Seit Stufe 18d werden **aufeinanderfolgende Aufrufe ohne jede Wirkung zu einer Zeile
zusammengezogen** („`2026-09-23 04:16–05:56 cron: nichts ×21`"), und der Verlauf fasst zwanzig
Einträge. Das allein reichte nicht: Eine Kaufliste-Nacht belegt im PSN-Fenster 28 Aufrufe mit
Arbeit ([10-1-cron.md](10-1-cron.md)), und zwanzig Einträge fassen sie nicht – aufgehoben würden
die jüngsten zwanzig, also fielen die ältesten weg, und das sind die Sync-Zeilen.

**Seit Stufe 18e wird deshalb jede gleichartige Arbeit verdichtet**, nicht nur der Leerlauf
(Entscheidung des Nutzers vom 27.09.2026 – die Wahl stand zwischen mehr Einträgen, Verdichtung
gleichartiger Aufrufe und einer Zeile je Schritt). Eine Nacht sind damit **sieben** Zeilen –
gemessen, nicht geschätzt: `test/cron.spec.ts` spielt sechzig Aufrufe durch (36 PSN, 24 Wartung)
und hält fest, dass die Sync-Zeilen darin stehen bleiben:

```
2026-09-28 06:00–07:55 cron: nichts ×24 bereich=wartung
2026-09-28 04:05–05:55 cron: nichts ×23 bereich=psn
2026-09-28 04:00 cron: besitz bereich=psn besitz=erfolg geholt=0 kauf=0 plus=0 entfallen=0
2026-09-28 03:55 cron: spielzeit bereich=psn spielzeit=erfolg geholt=0 geschrieben=0 zugeordnet=0
2026-09-28 03:50 cron: sync bereich=psn sync=erfolg/normalisierung offen=0 titel=431 eingereiht=0
2026-09-28 03:25–03:45 cron: sync ×5 bereich=psn sync=laufend/normalisierung offen=4→0
2026-09-28 03:00–03:20 cron: sync ×5 bereich=psn sync=laufend/abruf→laufend/normalisierung offset=100→400
```

Das Beispiel stammt aus der Nacht zum 28.09.2026, als die Wartung noch `*/5 6-7` lief – daher
`×24`. Heute sind es 36 Aufrufe je Fenster, und **die Zahl steht nur noch im Cron-Ausdruck
selbst**: `cronFenster(ausdruck)` in `src/sync/cron.ts` liest Startstunde, Takt und Anzahl heraus,
beide Tests leiten sie daraus ab. Der Anlass war ein Befund – als Stufe 20e das Fenster auf
`*/5 6-8` erweiterte, rechneten `test/cron.spec.ts` und `test/lesekosten.spec.ts` als Literal
weiter mit 24 und prüften zwölf Aufrufe zu wenig. Seit der Umstellung (09.10.2026) simuliert die
Nacht 72 statt 60 Aufrufe und verdichtet sie auf 8 Zeilen; die Nachtsumme der gelesenen Zeilen
stieg von 54 072 auf **80 784** und bleibt unter der Grenze von 100 000; den heutigen Stand, seit 18j
als ganzer Aufruf gemessen, nennt [10-1-cron.md](10-1-cron.md).

Drei Regeln halten die Zeile ehrlich: Verdichtet wird **nur bei gleicher Feldfolge** – wechselt der
Sync von `offset` auf `offen`, beginnt eine neue Zeile, genau dort, wo auch ein Mensch trennen
würde. Ein Wert, der sich bewegt, steht als **Spanne** `a→b`, ein gleichbleibender einfach so: Eine
Seite, die dreimal an derselben Stelle scheitert, zeigt `×3` bei unverändertem Offset – die Lehre
aus 18d, „was die Zeile nennt, muss sich bewegen". Und ein **Fehler ist kein Leerlauf**: Jede Zeile
mit `meldung=` wird nie verdichtet, und über die **Fenstergrenze** hinweg auch
nicht – sonst stünde da „`nichts ×36 bereich=psn→wartung`", und von keinem der
beiden Fenster wäre zu sehen, ob es gelaufen ist. Das Lebenszeichen bleibt trotzdem stehen, weil die verdichtete
Zeile die Zeit des jüngsten Aufrufs trägt. `erschienen=0` steht nicht mehr in jeder Zeile – die
Zahl gibt es im PSN-Fenster gar nicht, und der Zeitstempel ist das Lebenszeichen. `GET /api/sync/status` nennt `letzterAutomatischerLauf`; die
Einstellungen zeigen unter „Automatik" Fenster und letzten Nachtlauf, die Sync-Zeile nennt „von
Hand" oder „automatisch". Ob daraus eine Warnung wird – rot oder zur Kenntnis –, urteilen seit
Stufe 18m die Betriebswarnungen beim Lesen ([16.2](16-2-cpu-und-betrieb.md), Darstellung 13.2).

Lokal: `npx wrangler dev --test-scheduled`, dann `curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/5+3-5+*+*+*"`
für das PSN-Fenster, `?cron=*/5+6-8+*+*+*` für die Wartung, ohne Parameter für beides
– der Pfad `/cdn-cgi/` läuft am Asset-Fallback vorbei, `/__scheduled` nicht.
