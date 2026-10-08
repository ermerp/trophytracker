← [Inhaltsverzeichnis](README.md)

### 8.4 Unveröffentlichte Titel (Use Case 11)

Ein Wunschlisteneintrag braucht weder Release noch Plattform noch Trophäendaten. Kommt der Titel aus IGDB, werden `release_date` und `release_status = 'angekuendigt'` mitgeführt.

**Folgen für die übrigen Ansichten:**

- Die Kaufkandidaten (`v_kaufkandidaten`) blenden `angekuendigt` aus. Eine Gebrauchtpreisabfrage für ein nicht erschienenes Spiel ist sinnlos. Die Bedingung ist **datumsbewusst** (Stufe 15): Ein Spiel, dessen Datum verstrichen ist, zählt als erschienen, auch wenn `release_status` noch nicht umgestellt wurde – so hält ein veralteter Status keinen Kandidaten zurück.
- Die Wunschliste zeigt das Erscheinungsdatum statt eines Preises.
- Eine eigene Ansicht „Erscheint bald" (`/erscheint-bald`, `GET /api/upcoming`, seit Stufe 15) listet vorgemerkte Titel aus Wunsch- und Kaufliste mit Datum, ohne Datum ans Ende; ebenfalls datumsbewusst. Nur lesend – verlinkt von beiden Listen, sobald sie etwas enthält, und aus den Einstellungen.
- `angekuendigt` wird auf `erschienen` gehoben, sobald das Datum überschritten ist (`GamesRepository.erschieneneFreigeben`). Seit Stufe 18 tut das **jeder Cron-Aufruf zuerst** (10.1) – ein einzelner Batch ohne Rechenarbeit, protokolliert mit Quelle `igdb`; zusätzlich weiterhin zu Beginn jedes Schritts von „Metadaten auffrischen" (`POST /api/igdb/auffrischen`, Antwort `erschienen`). Für die Listen ist das unerheblich, weil die Views selbst vergleichen.
