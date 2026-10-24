← [Inhaltsverzeichnis](README.md)

## 7.5 Kritiker- und Spielerwertungen (Use Case 10)

**IGDB** ist die erste Wahl: bereits im Stack für Cover und Metadaten, kostenlos, und liefert mit `aggregated_rating` einen Kritikerschnitt samt Anzahl eingeflossener Reviews.

**Metacritic scheidet aus** – keine offene API, und Scraping verstösst gegen deren Nutzungsbedingungen.

**OpenCritic** betreibt eine öffentliche API und rechnet mit einem einfachen arithmetischen Mittel statt Metacritics undurchsichtiger Gewichtung. Als optionale Zweitquelle sinnvoll, als Pflichtabhängigkeit nicht nötig.

**Spielerwertung (Stufe 20k).** IGDB liefert mit `rating` und `rating_count` dazu die Wertung seiner Nutzer; sie steht gerundet in `game.user_score` / `user_score_count` (Migration 0035) und sortiert die Listen (5.2). Sie hat **keine Quellenspalte**: Sie kommt nur von IGDB, lässt sich nicht von Hand setzen und wird beim Verknüpfen und Auffrischen immer übernommen – nennt IGDB keine mehr, wird sie leer –, beim Lösen der Verknüpfung geleert. Die Kandidaten einer Suche (`igdb_candidate`, `wishlist_import_candidate`) tragen sie ebenfalls. In der Oberfläche heißt sie neben der Kritikerwertung „Spieler", allein auf einer Karte „Wertung" (13.1). Der Altbestand wird über das nächtliche Auffrischen (Frist sieben Tage) oder den Knopf „Auffrischen" gefüllt, bis dahin steht „unbekannt".

Abruf zusammen mit den übrigen IGDB-Metadaten, nicht als eigener Job. `critic_source` hält fest, woher der Wert stammt, damit ein späterer Quellenwechsel nachvollziehbar bleibt. Der Abgleich schreibt `critic_*` nur, wenn `critic_source` leer ist oder `'igdb'` lautet – ein von Hand gesetzter Wert überlebt jede Auffrischung.
