← [Inhaltsverzeichnis](README.md) · [16.2 offene Stufen](16-2-offene-stufen.md)

## 16. Endlos-Scrollen in der Sammlung und im Änderungsprotokoll (Stufe 22)

Wunsch des Nutzers vom 24.10.2026, die Entscheidungen vom selben Tag, **gebaut und vom Nutzer abgenommen am 24.10.2026**
(Stufe 22). Kein Cron-Code betroffen: `GET /api/games` liest `games.spieleListe`, die sonst niemand
ruft; deshalb kein Nachtplatz.

**Sammlung** (`frontend/src/Sammlung.tsx`, Logik in `frontend/src/endlos.ts` ohne React, Test
`test/endlos.spec.ts`):

- **Nachladen kurz vor dem Ende:** ein Marker unter der Liste, beobachtet von einem
  `IntersectionObserver` mit einer Bildschirmhöhe Vorlauf; je Block 50 Spiele (`BLOCK`), angehängt ohne
  Doppelte. Alle Karten stehen in **einem** Grid – der nächste Block füllt die angefangene Reihe auf,
  gleich wie viele Spalten passen (gemessen: bei 1280 px stehen die Karten 49 bis 51 in einer Reihe).
  Am Ende „Alle 431 geladen.", unterwegs „150 von 431 geladen"; das Blättern mit „Zurück"/„Weiter"
  entfällt, `offset` steht nicht mehr in der URL (ein altes Lesezeichen mit `offset` beginnt oben).
- **Filter und Sortierung** bleiben in der URL. Ändert sich einer, beginnt die Liste von vorn und oben
  (gemessen: nach Filter PS4 y = 0, 50 von 109).
- **Zurück aus dem Spieldetail** (Entscheidung des Nutzers vom 24.10.2026): Ein Zwischenspeicher je
  Filterkombination hält geladene Spiele, Gesamtzahl und Scrollhöhe, solange die Seite lebt, höchstens
  fünf Kombinationen. Nur bei „Zurück" (POP) zeigt die Liste sofort den gemerkten Stand an derselben
  Höhe und holt den geladenen Bereich **still neu**, in Blöcken zu 100 (`NEUHOLEN_BLOCK`) – nach einer
  Änderung im Spieldetail stünde sonst der alte Stand da. Gemessen: 150 geladen, y = 2 500 vorher wie
  nachher, danach zwei Anfragen (`limit=100&offset=0`, `limit=50&offset=100`). Wer die Sammlung über
  die Navigation öffnet, beginnt oben mit frischen Daten. **Verworfen:** `ScrollRestoration` von React
  Router – es stellt nur die Höhe her, nicht die Titel, und verlangt `createBrowserRouter`.
- **`g.id` ist der letzte Sortierschlüssel** (Entscheidung vom 24.10.2026): `g.sort_title` ist nicht
  eindeutig, und bei gleichen Werten an einer Blockgrenze darf SQLite zwischen zwei Abfragen anders
  ordnen – ein Spiel käme doppelt, ein anderes gar nicht. Vorher kamen gleiche Titel absteigend als
  5, 3, 1 (SQLite liest den Index rückwärts); der Test in `test/games-filter.spec.ts` war vor der
  Änderung rot. Kostet keine Zeile mehr.

**Kosten, gemessen am 24.10.2026** (`test/lesekosten.spec.ts`, 430 Spiele, als Route): Ein ganzer
Durchlauf in neun Blöcken liest **24 315** Zeilen nach Titel und **54 908** nach Wertung – teuer ist der
Grundpreis jedes Blocks (Zählung und Sortierung über den Bestand: 2 140 bis 2 995 nach Titel, 4 630
bis 6 627 nach Wertung), nicht das `OFFSET`. Die Schätzung vor dem Bau lag bei rund 2 500 und war um
das Zehn- bis Zwanzigfache zu niedrig. Bei 5 Millionen am Tag ist ein ganzer Durchlauf nach Wertung
rund 1 %; das stille Neuholen kostet höchstens noch einmal so viel und nimmt deshalb Blöcke zu 100.

**Änderungsprotokoll** (Entscheidung vom 24.10.2026): lädt per Keyset über `vor` kurz vor dem Ende
von selbst nach, derselbe Marker wie in der Sammlung; der Knopf „ältere laden" entfällt, am Ende
„Das sind alle.".

**Die Arbeitslisten blättern weiter** (Sammlung prüfen, IGDB-Zuordnung, Wunschlisten-Import,
Zuordnung): Aus ihnen verschwinden Einträge nach jeder Entscheidung, und Anhängen per `offset`
übersprünge welche. Wunschliste, Backlog, To-Do, Kaufliste, Lücken und Erscheint bald laden alles in
einer Anfrage, `/trophaeen` entfällt mit dem Aufräumen.
