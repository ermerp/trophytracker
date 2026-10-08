← [Inhaltsverzeichnis](README.md)

### 10.1 Der Cron – Verlauf und Nachvollziehbarkeit

**Sichtbarkeit.** Der Cron ist der erste Schreiber ohne Zuschauer. Jeder Aufruf schreibt eine
Log-Zeile mit Zahlen und festen Texten (`cronLogzeile`; die Meldungen sind schon bereinigt,
`test/keine-lecks.spec.ts` prüft sie) **und hinterlässt dieselbe Zeile mit Zeitstempel in
`app_setting` unter `cron_verlauf`, wo die letzten zwanzig stehen** (Migration 0022, verdichtet seit
Stufe 18d). Das ist kein Gespeichertes, das sich berechnen ließe: **Worker-Logs sind nur live
einsehbar**, ein schweigender Nachtschritt wäre am Morgen sonst nicht zu klären. Auch ein Absturz
wird vermerkt („cron: abgebrochen").

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
Einträge. Das allein reichte nicht: Eine Nacht sind 31 Aufrufe (siehe oben), und zwanzig Einträge
fassen eine Kaufliste-Nacht nicht – aufgehoben würden die jüngsten zwanzig, also fielen die ältesten
elf weg, und das sind die Sync-Zeilen.

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
`×24`. **Offener Befund:** `test/cron.spec.ts` und `test/lesekosten.spec.ts` rechnen beide weiter
mit **24** Wartungsaufrufen, obwohl Stufe 20e das Fenster auf `*/5 6-8` und damit auf 36 erweitert
hat (`wrangler.jsonc`). Die Tests prüfen damit zwölf Aufrufe zu wenig; die Grenzwerte halten
trotzdem. Zu beheben in der finalen Stufe „Refactoring" ([16.2](16-2-offene-stufen.md)).

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
Hand" oder „automatisch". Der Hinweisblock meldet einen abgelaufenen Zugang („der nächtliche
Abruf steht still") und einen fehlgeschlagenen Nachtlauf jünger als 24 Stunden (13).

Lokal: `npx wrangler dev --test-scheduled`, dann `curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/5+3-5+*+*+*"`
für das PSN-Fenster, `?cron=*/5+6-8+*+*+*` für die Wartung, ohne Parameter für beides
– der Pfad `/cdn-cgi/` läuft am Asset-Fallback vorbei, `/__scheduled` nicht.
