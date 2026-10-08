← [Inhaltsverzeichnis](README.md)

## 5. Datenmodell – Absichten (Use Cases 4, 5, 6)

Wunschliste, To-Do, Backlog und Kaufliste sind strukturell identisch: eine geordnete Liste von Spielen mit einer Absicht. Sie liegen deshalb in **einer** Tabelle mit Typ-Feld.

**To-Do und Backlog sind bewusst getrennt.** To-Do ist die kurze, manuell sortierte Liste "das spiele ich als nächstes"; Backlog ist der ungeordnete Haufen "irgendwann mal". Zusammengelegt verliert die To-Do-Liste genau die Eigenschaft, die sie nützlich macht – ihre Kürze.

**Es sind zwei Achsen, nicht vier Listen** (geklärt mit dem Nutzer am 27.09.2026, nachdem die Abgrenzung von Wunsch, Kauf und Lücke unklar geworden war):

| | **haben wollen** | **spielen wollen** |
|---|---|---|
| der lange Vorrat | **Wunsch** (56 offen) | **Backlog** (25) |
| die kurze Merkliste | **Kauf** (7) | **To-Do** (3) |

**Wunsch verhält sich zu Kauf wie Backlog zu To-Do**: Der Wunsch sagt *ob* ich es will, der Kauf sagt *jetzt*. Das ist dieselbe Begründung wie oben – die kurze Liste verliert ihren Wert, wenn der Haufen hineinläuft –, und genau deshalb ist Wunsch → Kauf eine **Kopie**: Der Wunsch bleibt offen, bis das Spiel wirklich da ist.

**Die Lücke ist keine der vier Listen, sondern eine Tatsache** (Abschnitt 11, `v_luecken`): gespielt, Disc-Fassung belegt oder unbekannt, nichts im Regal. Sie wird berechnet, nie gespeichert, und erzeugt einen Kaufkandidaten – aber sie ist selbst keine Absicht. Der Wunsch nach einer Zweiteilung der Wunschliste in „gespielt, aber noch Lücke" und „weder gespielt noch besessen" ist damit bereits erfüllt: Das sind genau Lücke und Wunsch.

**Wann ein Wunsch erfüllt ist:** sobald das Release physisch im Regal steht, auch ungespielt – das erledigt `absichtenErledigen` beim Erfassen (Abschnitt 5, „Besitz erfassen erledigt Kauf und Wunsch"). Bei einem Titel, den es nur digital gibt, erfüllt ihn ein **erkannter Kauf**, nie PS Plus: Ein Abo ist kein Besitz, und der Katalog wechselt monatlich (7.7). Gemessen am 27.09.2026 sind von 10 Wünschen mit digitaler Verfügbarkeit **9 über PS Plus** und **1 ein Kauf** – die Regel trennt also genau die Fälle, um die es geht.

**Ein Eintrag hängt immer an einem Release, nie am Spiel** (Entscheidung des Nutzers vom 27.09.2026, umgesetzt im Spieldetail mit Stufe 19c, überall sonst mit 19d – und dort für alle vier Listen, nicht nur für Wünsche). „GTA V" ohne Plattform ist keine brauchbare Absicht: Ob die PS4- oder die PS5-Fassung gemeint ist, entscheidet über Lücke, Kauf und Preis. Das ersetzt die Vorbelegungsregel vom 15.09.2026, nach der „ohne Plattform" wählbar blieb – **alle 56 offenen Wünsche tragen ohnehin eine Plattform**, der Weg wurde nie benutzt. Die Vorbelegung mit der neuesten Plattform bleibt; nur das leere Feld entfällt, und mit ihm der Filter „ohne Plattform".

Der Grund ist nicht Sparsamkeit, sondern der Lebenszyklus. Ein Spiel wandert typischerweise Wunsch → Kauf → Backlog → erledigt. Bei drei Tabellen ist jeder Übergang ein Löschen-und-Neuanlegen mit eigener Logik, und die Historie geht verloren. Hier ist es ein Feld-Update – mit einer Ausnahme: **Wunsch → Kauf ist seit Stufe 15 eine Kopie** (Entscheidung des Nutzers vom 16.09.2026). Der Wunsch bleibt offen, bis der Kauf erledigt ist; das ist eine Aussage in zwei Listen, keine verlorene Historie, und die Verbindung hält die Tabelle über dasselbe Ziel (`release_id` bzw. `game_id`).

```sql
CREATE TABLE plan_entry (
  id            INTEGER PRIMARY KEY,

  kind          TEXT NOT NULL CHECK (kind IN ('wunsch','todo','backlog','kauf')),

  -- Absteigende Konkretheit. Mindestens eines muss gesetzt sein.
  release_id    INTEGER REFERENCES release(id) ON DELETE CASCADE,
  game_id       INTEGER REFERENCES game(id) ON DELETE CASCADE,
  title_raw     TEXT,                    -- freie Eingabe, Spiel noch nicht angelegt

  position      INTEGER,                 -- manuelle Reihenfolge, nur To-Do (5.4); sonst NULL
  -- priority (1-5) gab es bis Migration 0013; Favorit oder nicht reicht (5.1).
  is_favorite   INTEGER NOT NULL DEFAULT 0,   -- der persönliche Anker, s.u.
  note          TEXT,

  origin        TEXT CHECK (origin IN ('luecke','wunsch','manuell','import','triage')),

  status        TEXT NOT NULL DEFAULT 'offen'
                CHECK (status IN ('offen','erledigt','verworfen')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at   TEXT,

  CHECK (release_id IS NOT NULL OR game_id IS NOT NULL OR title_raw IS NOT NULL)
);

CREATE INDEX idx_plan_offen ON plan_entry(kind, status, position);
```

**Übergänge**

| Von | Auslöser | Nach |
|---|---|---|
| `wunsch` | auf Kaufliste gesetzt (Kandidatenblock der Kaufliste oder Knopf auf der Wunsch-Kachel) | **neuer** `kauf`-Eintrag am selben Ziel mit `origin='wunsch'`, Favorit übernommen; der Wunsch bleibt offen (Kopie, Entscheidung des Nutzers vom 16.09.2026) und ist kein Kandidat mehr |
| Lücke (abgeleitet) | auf Kaufliste gesetzt | `kauf`, `origin='luecke'` |
| `kauf` | von Hand `erledigt` (`PATCH`) | offener `wunsch` am selben Ziel – am Release und am Spiel – wird mit `erledigt`: gekauft heißt erfüllt (Stufe 15); `verworfen` lässt den Wunsch stehen |
| `kauf`, `wunsch` | `physical_copy` oder `digital_entitlement` angelegt | `status='erledigt'` **automatisch**, am Release und am Spiel des Releases (Stufe 15, Entscheidung des Nutzers vom 16.09.2026, Anlass: Anno 117 als Disc erfasst, Wunsch blieb offen); die Antwort nennt die Einträge, die Oberfläche bietet „ins Backlog übernehmen" an, solange das Release auf keiner Liste steht, und „Rückgängig" öffnet sie wieder. Migration 0018 gleicht den Bestand an (1 Zeile) |
| `backlog` | hochgezogen | `todo`, mit `position` |
| `todo` / `backlog` | `play_status` wird `durchgespielt`/`komplettiert`/`abgebrochen` | `status='erledigt'` – seit 5.5 automatisch |

Diese Übergänge werden vorgeschlagen, nicht erzwungen – mit zwei Ausnahmen: die Kopplung in 5.5 und, seit Stufe 15, das Erfassen von Besitz. Bis Version 33 stand hier ein Hinweis „Stand auf deiner Kaufliste – erledigt setzen und ins Backlog übernehmen?"; **Entscheidung des Nutzers vom 16.09.2026:** Wer eine Disc oder Berechtigung erfasst, hat gekauft – Kauf- und Wunscheintrag verschwinden von beiden Listen, ohne Rückfrage. Nur „ins Backlog übernehmen" bleibt ein Angebot (koppelt über den bestehenden Weg, 5.5; nie gestartet bleibt `nicht_gespielt`). Der Import hängt Wünsche an vorhandene Releases (`vorhanden`), deshalb lagen Wünsche auf Spielen der Sammlung – mit der Regal-Erfassung schließen sie sich nun von selbst.

**Der Übergang `todo`/`backlog` → `erledigt`** war in Version 28 ein Vorschlag mit Knopf; seit der Kopplung (5.5, 16.09.2026) geschieht er von selbst, sobald die Bewertung `durchgespielt`, `komplettiert` oder `abgebrochen` wird. `GET /api/plans` liefert je Eintrag `eigenerStatus` (die Bewertung am Release, 4.2).

**Auf die Listen kommt ein Release** über die Triage (8.1), über die Backlog-Kandidaten (5.4), über „auf To-Do" im Backlog (`PATCH { art: 'todo' }`, hängt ans Ende), über die Knöpfe „Auf To-Do" / „Ins Backlog" je Release im Spieldetail – gesperrt, solange dort ein offener `todo`- oder `backlog`-Eintrag hängt, dieselbe Regel wie in der Triage – und seit der Kopplung auch über die Bewertung selbst: `am_spielen` legt den To-Do-Eintrag an, `pausiert` den Backlog-Eintrag (5.5).

**Anlegen und Duplikate (Stufe 10, Entscheidungen des Nutzers vom 14.09.2026).** Ein Eintrag von Hand
hat `origin = 'manuell'` und genau eine Quelle: ein Spiel (`game_id`), ein Release (`release_id`),
ein IGDB-Treffer (legt bei Bedarf das Spiel an, Abschnitt 3) oder Freitext (`title_raw`). Freitext
entsteht nur über den ausdrücklichen Knopf nach einer IGDB-Suche (8.2) – kein Fallback, eine
Entscheidung; er hat weder Cover noch Kritikerwertung (8.3).

- **Die Plattform wird vorgeschlagen und bleibt änderbar (Entscheidung des Nutzers vom
  15.09.2026, kehrt die vom 14.09. um).** Ohne ausdrückliche Wahl (`plattform` **fehlt** im Körper
  oder ist `"auto"`) nimmt der Worker die **neueste** Plattform, die die Releases des Spiels
  beziehungsweise der IGDB-Eintrag nennen – PS5 vor PS4 vor PS3 vor Vita, dieselbe Rangfolge wie bei
  geteilten Trophäenlisten (`neuestePlattform`, `src/domain/titel.ts`). Das gilt beim Anlegen von
  Hand (Wunschliste, Spieldetail), beim Import (8.2) und in der Nachpflege (8.3). Überall steht ein
  Dropdown mit den vier Plattformen, das den Vorschlag vor dem Speichern ändert – **je Treffer**, wo
  eine Suche mehrere Treffer zeigt (`KandidatenListe` mit `mitPlattform`): Die Treffer nennen
  verschiedene Plattformen, deshalb steht am Treffer die konkrete neueste, nicht ein Platzhalter
  „neueste des Treffers" (Nachbesserung vom 15.09.2026). `PATCH /api/plans/:id { plattform }` hängt
  einen Eintrag später um; das Release entsteht dabei, falls es fehlt (Abschnitt 3).

  **Ein Eintrag hängt immer an einem Release (Stufe 19d, Entscheidung des Nutzers vom
  27.09.2026).** Erst die Plattform entscheidet über Lücke, Kauf und Preis. „Ohne Plattform" ist
  deshalb **keine Wahl mehr** – nicht in der Wunschliste, nicht im Import, nicht in der API und
  nicht als Filter, und zwar für **alle vier Listen**: Im Spieldetail war es seit 19c weg, seit 19d
  überall. Gemessen am 28.09.2026 hingen ohnehin **alle 94 Einträge** der Produktion an einem
  Release – kein einziger am Spiel, keiner als Freitext, in keiner Art; der Weg war unbenutzt, und
  keine Migration war nötig.

  Drei Dinge folgen daraus, und sie sind auseinanderzuhalten:

  1. **Fehlender Schlüssel ist nicht dasselbe wie `null`.** Fehlt `plattform` im Körper, gilt
     `"auto"`. Ein ausdrückliches `null` oder `""` bekommt **`400`** („Ein Eintrag braucht eine
     Plattform."). Im JSON sind das `undefined` und `null`; ein `?? "auto"` würde beide gleich
     behandeln und damit still einen Wert schreiben, wo der Aufrufer „ohne" gesagt hat. Je ein Test
     hält die drei Fälle fest (Wunsch des Nutzers vom 28.09.2026).
  2. **Auch ein `"auto"` ohne Ergebnis ist `400`.** Hat ein Spiel weder Releases noch einen
     IGDB-Kandidaten mit Plattform, gab `automatischePlattform` bis 19d `null` zurück, und daraus
     entstand stillschweigend ein Eintrag am Spiel – die Regel wäre durch genau die Tür ausgehebelt
     worden, die als Ausnahme gedacht ist. Jetzt antwortet die Route „Zu diesem Spiel ist keine
     Plattform bekannt." Der Fall ist selten (0 von 478 Spielen haben kein Release, gemessen am
     28.09.2026), aber der Pfad existierte.
  3. **Freitext ist die eine Stelle ohne Plattform**, und sie bleibt: Ein Freitext-Eintrag hat kein
     Spiel und deshalb keine Plattform. Sein Kennzeichen in der Liste heißt seit 19d **„Freitext"**
     statt „ohne Plattform" – das ist der Grund, nicht eine fehlende Angabe. Ein `PATCH` mit
     Plattform auf einen Freitext antwortet weiter mit `400`.

  Das Schema erlaubt einen Eintrag am Spiel weiterhin (`CHECK`, Abschnitt 5 unten), und die Regeln
  dazu gelten für Einträge, die es schon gibt – „am Spiel und am Release sind zwei Aussagen", das
  Mit-Erledigen beim Kauf, das Waisen-Aufräumen. 19d nimmt nur **jeden Weg, einen neuen anzulegen**;
  in den Tests entstehen solche Einträge deshalb über die Repository-Schicht.

  **Wo ein Eintrag doch ohne Plattform dasteht** – ein alter, den es nicht mehr geben kann –, sagt
  die Oberfläche es unterschiedlich, je nachdem ob man es dort beheben kann: **„Plattform wählen"**,
  wo ein Tippen sie setzt (Kachel der Absichten, Import-Durchsicht), und **„Plattform fehlt"** in
  reinen Anzeigen (Kaufliste, „Erscheint bald"). Ein Zustand und eine Einladung sind zwei
  verschiedene Sätze.
- **Ein offener Eintrag am Spiel und einer an einem seiner Releases sind kein Duplikat**, sondern
  zwei verschiedene Aussagen; sie blockieren sich nicht. Ein zweiter offener Eintrag **derselben Art
  an genau demselben Ziel** ist eines und wird mit `409` abgewiesen. Erledigte und verworfene
  Einträge blockieren nichts – ein Sinneswandel ist ein Feld-Update auf `offen`, kein Neuanlegen.
- **Waisen (entschieden in Stufe 12, Entscheidung des Nutzers vom 15.09.2026; offen seit Stufe 11).**
  `DELETE /api/plans/:id` – „entfernen" und „Rückgängig" – räumt auf, was nur für diesen Eintrag
  entstand (`GamesRepository.waiseAufraeumen`): erst das Release, wenn es weder Trophäenliste noch
  Exemplar, digitale Berechtigung, Bewertung, gepflegten `physical_release_status` noch einen anderen
  Eintrag trägt; dann das Spiel, wenn es kein Release und **keinen** Eintrag mehr hat. Erledigte und
  verworfene Einträge halten das Spiel – sie sind Historie; dieselbe Regel gilt seither auch beim
  Löschen eines Releases (Abschnitt 3, bis dahin zählten nur offene). Ein von Hand angelegtes Spiel
  ohne Exemplar fällt damit ebenfalls, sobald sein einziger Listeneintrag geht – ein Titel ohne
  Besitz, Fortschritt, Bewertung und Absicht ist nichts, was die Sammlung verliert; die Antwort nennt
  `releaseGeloescht` und `spielGeloescht`, das Spieldetail kehrt dann zur Sammlung zurück. Erledigen
  oder verwerfen löscht nichts.
