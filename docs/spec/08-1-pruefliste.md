← [Inhaltsverzeichnis](README.md)

### 8.1 Die Prüfliste (Use Case 8)

Ersteinrichtung und laufende Pflege sind derselbe Vorgang: Spiele, bei denen die Trophäendaten und deine Bewertung auseinanderlaufen, werden dir einzeln vorgelegt. Deshalb gibt es **eine** Warteschlange und **eine** Oberfläche, nicht zwei.

```sql
CREATE TABLE review_queue (
  release_id    INTEGER PRIMARY KEY REFERENCES release(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL CHECK (reason IN (
                  'erstimport',        -- erstmals gesehen, nie bewertet
                  'neue_trophaeen',    -- du hast weitergespielt
                  'dlc_erweitert'      -- das Spiel hat neue Trophäen bekommen
                )),
  detail        TEXT,                  -- z.B. "100 % → 78 %, 12 neue Trophäen"
  enqueued_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Befüllung durch den Sync.** Nach der Normalisierung wird je Release der aktuelle Stand gegen `reviewed_*` verglichen:

| Bedingung | Reason |
|---|---|
| `reviewed_at IS NULL` und `progress_pct < 100` – noch nie durchgesehen, nicht komplett | `erstimport` |
| `earned_total` gestiegen, Status ist gesetzt und nicht `am_spielen` | `neue_trophaeen` |
| `defined_total` gestiegen – ohne Statusfilter | `dlc_erweitert` |

Der Sync **schreibt nur in die Warteschlange**, er ändert nie einen Status. Steht ein Release schon in der Warteschlange, werden Grund und `detail` aktualisiert statt ein zweiter Eintrag angelegt; `enqueued_at` bleibt.

**Warum `dlc_erweitert` keinen Statusfilter hat** (Entscheidung des Nutzers vom 16.09.2026): Der Filter bei `neue_trophaeen` existiert, weil eigener Fortschritt bei einem laufenden Spiel erwartbar ist. Eine DLC-Erweiterung ist dagegen eine Änderung am Spiel selbst und gerade bei einem aktiv gespielten Titel relevant.

**Regeln der Änderungserkennung (Stufe 13).** Verglichen wird ausschließlich bei gestempelten Listen (`reviewed_at IS NOT NULL`), und zwar gegen den letzten *geprüften* Stand, nicht den letzten Sync (4.1) – Änderungen sammeln sich über mehrere Syncs an, bis jemand hinsieht. Treffen beide Bedingungen zu, ist der Grund `dlc_erweitert` (die Neuigkeit; die View sortiert ihn ohnehin nach vorn), und `detail` nennt beides. Ein `erstimport`-Eintrag kann nie mit einem Änderungseintrag kollidieren, weil er `reviewed_at IS NULL` voraussetzt und jeder Stempel die Zeile löscht. Sinkende Zähler (Sony zieht Trophäen zurück) erzeugen nichts; der Stempel bleibt stehen. Nach einer Zuordnung läuft dieselbe Einreihung, die frisch zugeordnete Liste ist dort aber `erstimport`.

`detail` wird set-basiert in SQL gebildet, mit `reviewed_progress_pct` als Vorher-Wert:

| Grund | `detail` |
|---|---|
| `neue_trophaeen` | „40 % → 55 %, 3 neue Trophäen erspielt" |
| `dlc_erweitert` | „100 % → 78 %, Liste um 12 Trophäen gewachsen" – bei zugleich gestiegenem `earned_total` mit „, 3 davon erspielt" |

`erstimport` hängt an `reviewed_at`, nicht an der Existenz einer `play_status`-Zeile: Seit Stufe 6 belegt der Sync den Status vor (4.2), fast jedes Release hat also eine Zeile. Die Ersteinrichtung zeigt die Vorbelegung und lässt sie bestätigen oder ändern. Ein im Spieldetail von Hand gesetzter Status zählt bereits als Durchsicht und erscheint nicht mehr als `erstimport`.

**100 % wird nicht vorgelegt.** Ein Titel mit 100 % hat alle Trophäen des Hauptspiels *und* aller DLC – er ist komplettiert, und die Vorbelegung (4.2) hat den Status bereits gesetzt. Da gibt es nichts zu entscheiden, und eine Prüfliste, die Unstrittiges vorlegt, verbraucht die Geduld, die für die strittigen Fälle gebraucht wird. Solche Titel werden deshalb **still als durchgesehen gestempelt** statt eingereiht: `reviewed_*` bekommt den aktuellen Stand, `play_status` bleibt unberührt. Der Stempel ist kein Urteil, sondern der Referenzpunkt – erhöht später ein DLC die Trophäenzahl, fällt der Titel unter 100 % und die Änderungserkennung (Stufe 13) legt ihn vor. Ohne Stempel gäbe es dafür keinen Vergleichswert. Beim Bestand betraf das rund ein Viertel aller Einträge.

**Auslöser der Einreihung.** `ReviewRepository.einreihen` (stempeln und einreihen in einem Batch) läuft am Ende jeder Normalisierung – direkt nach der Vorbelegung – und nach jeder Zuordnung, manuell wie automatisch. Den Bestand hat Migration 0007 einmalig eingereiht, Migration 0009 die 100-%-Titel wieder herausgenommen; der Deploy-Job protokolliert beide Zahlen und seit Stufe 13 daneben die Einträge aus der Änderungserkennung. Der Batch stempelt zuerst (100 %), reiht dann `erstimport` ein und vergleicht zuletzt die gestempelten Listen. Das Sync-Ergebnis meldet die neu eingereihten Zeilen je Grund (`eingereihtNachGrund`), aktualisierte Details zählen nicht mit. Stand beim Deploy von Stufe 13: 431 gestempelte Listen, 2 mit mehr Trophäen seit dem Stempel (beide `am_spielen`), 0 gewachsene Listen – die Erkennung legte am ersten Tag nichts vor.

Der Filter "nicht `am_spielen`" ist wichtig: bei einem Spiel, das du gerade aktiv zockst, kommen bei jedem Sync neue Trophäen dazu. Das ist keine Nachricht, sondern der Normalfall – es würde die Liste sonst zumüllen.

**Die Oberfläche.** Ein Spiel pro Bildschirm mit Cover, Plattform, Trophäenverteilung, Platin-Kennzeichen und – bei Änderungen – dem Vorher-Nachher-Vergleich aus `detail`. Der Grund steht als Überschrift: "Du hast weitergespielt" oder "Neue DLC-Trophäen erschienen".

| Aktion | Wirkung |
|---|---|
| Durchgespielt | `play_status = 'durchgespielt'` |
| Abgebrochen | `play_status = 'abgebrochen'` |
| Auf To-Do (spiele gerade) | `play_status = 'am_spielen'` + `plan_entry(kind='todo', origin='triage')` – bis zur Kopplung (5.5) zwei Aktionen („Spiele gerade" ohne Eintrag, „Auf To-Do" mit `pausiert`) |
| Ins Backlog (pausiert) | `play_status = 'pausiert'` + `plan_entry(kind='backlog', origin='triage')`; ein nie gestartetes bleibt `nicht_gespielt` |
| Unverändert lassen | Status bleibt, Eintrag verschwindet trotzdem; bei `am_spielen`/`pausiert` zieht die Kopplung den Listeneintrag nach |
| Überspringen | `play_status = 'unentschieden'`; Eintrag verschwindet, das Spiel bleibt über den Status-Filter der Sammlung auffindbar – die zweite Runde |

Die Aktionen setzen **nur den Status**; Bewertung, Notiz und Daten bleiben stehen. „Auf To-Do" und „Ins Backlog" legen den `plan_entry` an oder hängen einen vorhandenen der anderen Art um (5.5); To-Do hängt ans Ende der Liste (5.4). Tastenkürzel 1–6 lösen die Aktionen aus.

**Jede Entscheidung** löscht die Zeile aus `review_queue` und stempelt `reviewed_earned_total`, `reviewed_defined_total`, `reviewed_progress_pct` und `reviewed_at` auf den aktuellen Stand. Damit ist der Referenzpunkt gesetzt, und dasselbe Spiel taucht erst bei der nächsten echten Änderung wieder auf.

"Unverändert lassen" ist deshalb keine leere Aktion: sie sagt "ich habe es gesehen und es bleibt abgebrochen". Ohne diese Möglichkeit bekämst du bei jedem Sync denselben Hinweis erneut.

Fortschrittsanzeige "noch 47 von 210" und jederzeitiges Abbrechen sind Pflicht, nicht Komfort – niemand arbeitet die Ersteinrichtung in einer Sitzung durch. Bei laufendem Betrieb sind es dann meist ein bis zwei Einträge pro Woche.
