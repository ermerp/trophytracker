← [Inhaltsverzeichnis](README.md) · [16.2 offene Stufen](16-2-offene-stufen.md)

## 16. Offen – Endlos-Scrollen in der Sammlung

Wunsch des Nutzers vom 24.10.2026, die Entscheidungen vom selben Tag. **Nicht gebaut; wann es kommt,
ist offen.** Es braucht keinen Nachtplatz (unten) und kann wie „veraltete Ansichten aufräumen" an
jedem Tag parallel laufen, auf eigenem Branch.

**Stand heute:** Die Sammlung lädt 50 Spiele je Seite und blättert mit „Zurück"/„Weiter"
(`SEITE`, `frontend/src/Sammlung.tsx`); `offset`, Filter und Sortierung stehen in der URL, und ein
geänderter Filter löscht `offset` schon heute.

**Anforderungen des Nutzers:**

- Nachladen kurz vor dem Ende, nicht erst ganz unten.
- Filter und Sortierung bleiben beim Nachladen erhalten; ändert sich einer, beginnt die Liste von vorn.
- Scrollposition und geladene Titel bleiben erhalten, wenn ein Spiel geöffnet und zurückgegangen wird.
- Die Spaltenzahl ist dynamisch.

**Entschieden (24.10.2026):**

1. **Zwischenspeicher je Filterkombination für die Sitzung:** geladene Spiele, Rest und
   Scrollposition. Beim Zurückkommen sofort aus dem Speicher anzeigen und den geladenen Bereich still
   neu holen – sonst zeigt die Liste nach einer Änderung im Spieldetail den alten Stand. Die Logik
   steht in einer eigenen `.ts`-Datei ohne React, damit ein Test sie erreicht.
2. **Das Änderungsprotokoll wird mit umgestellt** – es hängt per Keyset schon an, nur auf Knopfdruck
   („Weiter"). **Die Arbeitslisten bleiben beim Blättern** (Sammlung prüfen, IGDB-Zuordnung,
   Wunschlisten-Import, Zuordnung): Aus ihnen verschwinden Einträge nach jeder Entscheidung, und
   Anhängen per `offset` übersprünge welche. Wunschliste, Backlog, To-Do, Kaufliste, Lücken und
   Erscheint bald laden alles in einer Anfrage, `/trophaeen` entfällt mit dem Aufräumen.
3. **`g.id` als letzter Sortierschlüssel, mit Test.** Heute entscheidet bei gleichem Wert zuletzt
   `g.sort_title` (`spieleListe`, `src/db/games.ts`), das das Schema nicht eindeutig macht; an einer
   Blockgrenze darf SQLite gleiche Werte zwischen zwei Abfragen anders ordnen – ein Spiel käme
   doppelt, ein anderes gar nicht. Am 24.10.2026 gab es in der Produktion keine doppelten.

**Geprüft am 24.10.2026:**

- **Kein Cron-Code betroffen:** `GET /api/games` liest `games.spieleListe`, die sonst niemand ruft.
- **Die Blockgröße ist für das Layout gleich,** solange alle Karten in **einem** Grid-Container
  stehen – der nächste Block füllt die angefangene Reihe auf. Sie entscheidet nur die Zahl der
  Anfragen (neun für 431 Spiele) und bleibt bei 50; die Route kappt bei 100 (100 gebundene Werte je
  Anweisung). `OFFSET` liest die übersprungenen Zeilen mit; ein ganzer Durchlauf kostet geschätzt
  rund 2 500 gelesene Zeilen – **Schätzung**, vor dem Bau in `test/lesekosten.spec.ts` zu messen.
- **Nachladen** über einen `IntersectionObserver` auf einem Marker am Listenende mit `rootMargin` von
  etwa einer Bildschirmhöhe – Browser-Standard, keine Bibliothek.
- **Verworfen:** `ScrollRestoration` von React Router. Es stellt nur die Scrollposition her, nicht die
  geladenen Titel, und verlangt `createBrowserRouter` statt des heutigen `BrowserRouter`.
- Kein Prototyp – keine neue Ansicht. Die Bilder in drei Breiten gehören dazu, auch nach der Rückkehr
  aus dem Spieldetail (`scripts/bilder.mjs`).
