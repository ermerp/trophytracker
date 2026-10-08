← [Inhaltsverzeichnis](README.md)

### 5.4 To-Do-Reihenfolge und Backlog-Kandidaten (Stufe 12)

**Reihenfolge.** Nur To-Do ist manuell geordnet; `position` ist dort gesetzt und bei allen anderen Arten `NULL`. Wer auf To-Do kommt – Anlegen, Triage (8.1), `PATCH { art: 'todo' }` aus dem Backlog, wieder öffnen –, hängt **ans Ende** (`POSITION_ANS_ENDE`, `src/db/plan.ts`: `MAX(position) + 1` der offenen To-Do-Einträge); wer To-Do verlässt, verliert die Position; erledigen behält sie. `PUT /api/plans/reorder { art, orderedIds }` schreibt die ganze Liste in neuer Ordnung (Positionen 1..n); eine Id, die kein offener Eintrag der Art ist, ist ein Fehler (`400`), nicht genannte behalten ihre Position. Migration 0014 gibt den Triage-Einträgen aus Stufe 7 (ohne Position) eine, sonst stünde der nächste neue Eintrag mit `1` vor ihnen. Die Oberfläche zieht mit Maus, Finger oder Tastatur (`@dnd-kit`); seit Stufe 19 ist die **ganze Karte** der Anfasser – kein Griff, keine Pfeilknöpfe (Rückmeldung des Nutzers vom 22.09.2026). Der Tastaturweg bleibt: Der Eintrag ist fokussierbar, Leertaste und Pfeile ordnen um. Jede Umsortierung schreibt sofort, ein Fehler lädt den gespeicherten Stand zurück.

**Kandidaten.** `v_backlog_kandidaten` (Abschnitt 11) nennt, was im Besitz ist, keinen Trophäenfortschritt und keine Bewertung über `nicht_gespielt` hinaus hat und auf keiner Liste steht – `GET /api/backlog-candidates`. Das Backlog zeigt sie mit „ins Backlog", „auf To-Do" und **„nicht vorgesehen"**. Letzteres ist kein neues Feld, sondern ein `backlog`-Eintrag mit `status = 'verworfen'` (`POST /api/plans` mit `status`), genau wie eine verworfene Lücke (5.3); die View blendet ihn aus, sonst tauchte der abgelehnte Titel bei jeder Abfrage wieder auf – derselbe Fehler, der einst in `v_kaufkandidaten` steckte. Abgelehnte stehen unter „auch erledigte und verworfene", „entfernen" macht sie wieder zum Kandidaten. Die Route nennt die Anzahl der Abgelehnten mit (`abgelehnt`). Der Hinweisblock der Sammlung zeigt die Kandidatenzahl, solange sie größer als null ist. Gemessen am 15.09.2026: In der Produktion gibt es noch keine Kandidaten, weil erst vier Besitzzeilen erfasst sind – der Block füllt sich mit der Regal-Erfassung.

`app_setting` (`key`, `value`) bleibt für die Backup-Vermerke (14.2) und künftige Einstellungen bestehen.

### 5.5 Kopplung von To-Do/Backlog und Bewertung (Entscheidung des Nutzers vom 16.09.2026)

To-Do und Backlog sind keine von der Bewertung unabhängige Absicht, sondern dieselbe Aussage in zwei Darstellungen: **Was auf To-Do steht, ist `am_spielen`; was im Backlog steht, ist `pausiert`** – und umgekehrt. Der Eintrag bleibt trotzdem (Reihenfolge, Favorit, Notiz, „nicht vorgesehen", Historie), aber jeder Schreibpfad hält beides zusammen (`src/domain/kopplung.ts` für die Regeln, `src/db/kopplung.ts` für die Anwendung):

| Auslöser | Wirkung |
|---|---|
| Eintrag auf To-Do (anlegen, umhängen, wieder öffnen; Triage, Spieldetail, Backlog, Kandidaten) | `play_status = 'am_spielen'` – auch für ein nie gestartetes Release |
| Eintrag ins Backlog (dito) | `play_status = 'pausiert'`; **Ausnahme:** kein Status oder `nicht_gespielt` bleibt – ein nie gestartetes Spiel wird nicht „pausiert", das Backlog ist „pausiert oder nie gestartet" |
| Bewertung `am_spielen` (Spieldetail, Triage, auch „Unverändert lassen" bei vorbelegtem `am_spielen`) | genau ein offener To-Do-Eintrag am Release: vorhandener Backlog-Eintrag wird umgehängt (ans Ende), sonst entsteht einer (`origin` `manuell` bzw. `triage`) |
| Bewertung `pausiert` | genau ein offener Backlog-Eintrag, analog |
| Bewertung `durchgespielt`, `komplettiert`, `abgebrochen` | offene To-Do-/Backlog-Einträge am Release werden `erledigt` – automatisch, kein Vorschlag mehr |
| `nicht_gespielt`, `unentschieden`; Favorit, Notiz, „nicht vorgesehen" (`verworfen`), erledigen, entfernen | nichts |

Was **nicht** koppelt: der Sync. Die Vorbelegung aus Trophäen (4.2) setzt `am_spielen`, legt aber keinen Eintrag an – Fremddaten erzeugen keine Absicht; die Prüfliste legt den Fall vor, und erst die Entscheidung dort koppelt. Jede Listenaktion, die den Status schreibt, gilt als Durchsicht wie eine Bewertung von Hand (Stempel, Prüfeintrag weg).

Folgen: In der Triage fielen „Spiele gerade" und „Auf To-Do" zusammen – es bleibt „Auf To-Do (spiele gerade)", sechs Aktionen statt sieben (8.1). Auf den Kacheln von To-Do und Backlog stehen statt „erledigt" die Bewertungen „durchgespielt" und „abgebrochen" (`PATCH /api/releases/:id/play-status`, nur der Status); nie gestartete im Backlog kennen nur „nicht vorgesehen". Migration 0015 gleicht den Bestand einmalig an (To-Do-Einträge → `am_spielen`, `am_spielen` ohne Eintrag → To-Do, `pausiert` ohne Eintrag → Backlog, offene Einträge mit erledigter Bewertung → `erledigt`; in der Produktion 4 + 2 + 1 + 0), der Deploy-Job protokolliert die verbleibenden Abweichungen (erwartet 0).
