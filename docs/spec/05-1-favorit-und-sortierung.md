← [Inhaltsverzeichnis](README.md)

### 5.1 Favorit

`is_favorite` ist der binäre Anker für **„das will ich wirklich"**: Er sortiert nach vorn und filtert. Eine feinere Priorität (1–5) gab es bis Migration 0013; **Entscheidung des Nutzers vom 15.09.2026: sie ist unnötig, Favorit oder nicht reicht.** Damit entfällt auch die Rangformel (5.2) – zwei Regler für dieselbe Frage waren einer zu viel.

### 5.2 Sortierung (Use Case 10)

**Sortierung nach Spielzeit (Stufe 18c, Entscheidung des Nutzers vom 22.09.2026):** Die Spielzeit aus PSN (7.7) kommt als weiteres Kriterium hinzu. Titel **ohne** Spielzeit – PS3 und Vita liefern grundsätzlich keine – rutschen ans **Ende der Liste**, nicht an den Anfang und nicht zwischen die Null-Stunden-Titel. Das ist dieselbe Regel wie bei der Kritikerwertung: Unbekanntes ist keine Null und wird hinten angestellt (Abschnitt 3).

**Bis Version 26** stand hier eine Rangformel: Kritikerwertung, Priorität und Favorit mit Gewichten aus `app_setting` zu einem Rang verrechnet, bei der Abfrage berechnet und nie gespeichert. Mit der Priorität ist sie gefallen (Entscheidung des Nutzers vom 15.09.2026, Migration 0013 löscht die vier Gewichte `w_*`); `src/domain/rang.ts`, `GET/PUT /api/settings/weights` und die Gewichte in den Einstellungen gibt es nicht mehr.

**Richtung (Stufe 20e).** Jede Sortierung hat zusätzlich eine Richtung, und „aufsteigend" ist nicht für jedes Kriterium das Erwartete – beim Preis ja (günstigstes zuerst), bei der Kritikerwertung nein (beste zuerst). Jede Liste nennt deshalb je Kriterium seine **natürliche** Richtung; nur eine Abweichung steht als `?richtung=` in der URL, und ein Wechsel des Kriteriums setzt sie zurück. **„Unbekannt" bleibt in beiden Richtungen am Ende** – ein fehlender Wert ist kein hoher Wert, sondern gar keiner. Deshalb wird ein Vergleicher **nicht umgekehrt**, sondern bekommt die Richtung hinein (`nachZahl` in `frontend/src/Sortierung.tsx`); in der Sammlung, die als einzige in SQL sortiert, dreht sich nur `DESC`/`ASC`, während das `IS NULL` vorn stehen bleibt. Der erste Entwurf kehrte um und stellte prompt die Einträge ohne Wert nach vorn. Das Bedienelement ist in allen fünf sortierbaren Listen dasselbe (7.3, „Die Sortierung in der Oberfläche").

Stattdessen **sortieren die Listen nach gespeicherten Bestandteilen**, in der Route, nicht in SQL (`src/api/plans.ts`, `sort=`):

| `sort` | Ordnung |
|---|---|
| `favorit` (Standard) | Favoriten zuerst, dann Kritikerwertung absteigend, ohne Wertung ans Ende, dann Titel |
| `wertung` | Kritikerwertung absteigend, ohne Wertung ans Ende, dann Titel |
| `titel` | alphabetisch |
| `release` | Erscheinungsdatum aufsteigend, ohne Datum ans Ende |
| `angelegt` | zuletzt angelegt zuerst |
| `position` | eigene Reihenfolge (5.4); ohne Position ans Ende, dort nach Id – Standard für `kind=todo` |

Dazu die Filter `favorit=1`, `plattform=PS4,PS5` (Mehrfachauswahl, seit Stufe 19 als Chips wie in der Sammlung, die den Plattformfilter seitdem ebenfalls mehrfach nimmt; **der Wert `ohne` ist mit Stufe 19d entfallen** und wird wie jeder unbekannte Wert ignoriert) und `suche=` (Teilstring im Titel, ohne Groß-/Kleinschreibung – zum Wiederfinden in 300 Wünschen; Suchfeld in der Filterleiste aller drei Listen, seit 16.09.2026). Das Backlog und seit Stufe 15 die Kaufliste nutzen dieselbe Ordnung wie die Wunschliste, To-Do steht in eigener Reihenfolge ohne Sortierwahl. Ob der Preis auf der Kaufliste als weiteres Sortierkriterium („viel Spiel pro Euro") dazukommt, entscheidet Stufe 20. Jeder Eintrag nennt seit Stufe 15 `aufKaufliste` (offener Kaufeintrag am selben Ziel) und `imBesitz` (Disc oder Berechtigung am Release – nach der automatischen Erledigung nur noch bei Altfällen sichtbar).
