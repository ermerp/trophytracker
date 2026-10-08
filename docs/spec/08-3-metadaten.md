← [Inhaltsverzeichnis](README.md)

### 8.3 Nachpflege fehlender Metadaten (Use Case 12)

Einträge ohne IGDB-Zuordnung haben kein Cover, keine Kritikerwertung und kein Erscheinungsdatum. Sie funktionieren in allen Listen, stehen aber bei der Sortierung nach Wertung oder Datum am Ende (5.2).

Die Ansicht „Ohne Zuordnung" (`/ohne-zuordnung`, Werkzeug in den Einstellungen, seit Stufe 11) sammelt sie listenübergreifend aus `v_ohne_igdb` – Freitext aus Wunschliste, To-Do, Backlog und Kaufliste sowie Spiele der Sammlung ohne IGDB-Id – mit demselben IGDB-Suchfeld zum Nachziehen, gruppiert nach `zustand`: Freitext ohne Spiel, Spiele in der IGDB-Zuordnung (mit Link auf deren Kandidaten), noch nicht gesuchte Spiele (der Abgleich läuft in den Einstellungen) und **abgelehnte Spiele hinter einem Umschalter**, standardmäßig ausgeblendet – die Ablehnung ist eine gespeicherte Entscheidung, „Doch suchen" nimmt sie zurück (Entscheidung des Nutzers vom 15.09.2026, schließt den offenen Punkt aus 7.6).

Ein Freitext-Eintrag wird über `POST /api/unmatched/plan_<art>/:id/link` einem IGDB-Treffer zugeordnet: Das Spiel wird wiederverwendet oder ohne Release angelegt (Abschnitt 3), dann `game_id` gesetzt und `title_raw` geleert; ein offener Eintrag derselben Art am Spiel ist ein Duplikat (409, Abschnitt 5). Die Logik „Ziel aus IGDB-Treffer" ist eine Funktion (`src/sync/plan-ziel.ts`) und wird von `POST /api/plans`, dem Import und der Nachpflege gemeinsam benutzt.

Der Aufwand ist gering, weil die Suche aus 8.2 wiederverwendet wird – seit Stufe 9 existiert sie als Komponente `IgdbSuche` im Spieldetail und in der IGDB-Zuordnung (7.6). Falls der Fall in der Praxis nie auftritt, kostet die Ansicht nichts; falls doch, hast du keinen Weg, ihn sonst zu finden.
