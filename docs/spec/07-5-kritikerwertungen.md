← [Inhaltsverzeichnis](README.md)

## 7.5 Kritikerwertungen (Use Case 10)

**IGDB** ist die erste Wahl: bereits im Stack für Cover und Metadaten, kostenlos, und liefert mit `aggregated_rating` einen Kritikerschnitt samt Anzahl eingeflossener Reviews.

**Metacritic scheidet aus** – keine offene API, und Scraping verstösst gegen deren Nutzungsbedingungen.

**OpenCritic** betreibt eine öffentliche API und rechnet mit einem einfachen arithmetischen Mittel statt Metacritics undurchsichtiger Gewichtung. Als optionale Zweitquelle sinnvoll, als Pflichtabhängigkeit nicht nötig.

Abruf zusammen mit den übrigen IGDB-Metadaten, nicht als eigener Job. `critic_source` hält fest, woher der Wert stammt, damit ein späterer Quellenwechsel nachvollziehbar bleibt. Der Abgleich schreibt `critic_*` nur, wenn `critic_source` leer ist oder `'igdb'` lautet – ein von Hand gesetzter Wert überlebt jede Auffrischung.
