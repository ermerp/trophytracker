← [Inhaltsverzeichnis](README.md)

## 1. Use Cases

| # | Use Case | Abgedeckt durch |
|---|---|---|
| 1 | Sammlung verwalten | `game`, `release`, `physical_copy`, `digital_entitlement` |
| 2 | Fortschritt verfolgen – über Trophäen und eigene Bewertung | `trophy_progress` + `play_status` |
| 3 | Lücken erkennen: bisher nur digital, Disc existiert | `release.physical_release_status`, `v_luecken`; verworfene Lücken siehe 5.3 |
| 4 | Wunschliste | `plan_entry` mit `kind = 'wunsch'` |
| 5a | To-Do: was spiele ich als nächstes (kurz, geordnet) | `plan_entry` mit `kind = 'todo'` |
| 5b | Backlog / Pile of Shame: irgendwann mal | `plan_entry` mit `kind = 'backlog'` |
| 6 | Kaufliste aus Lücken und Wunschliste | `plan_entry` mit `kind = 'kauf'`, gespeist aus `v_kaufkandidaten` |
| 7 | Preise: PSN Store für digital, Gebrauchtmarkt für physisch | `price_snapshot.channel`, `market_offer` |
| 8 | Prüfliste: Trophäen-Bestand durchgehen, erstmalig und bei Änderungen | `review_queue` |
| 9 | Wunschlisten aus Textdateien importieren | Import-Ansicht, `plan_entry.origin = 'import'` |
| 10 | Nach Kritikerwertung sortieren, Favoriten zuerst | `game.critic_score`, `plan_entry.is_favorite` (keine Rangformel mehr, 5.2) |
| 11 | Noch nicht erschienene Titel vormerken | `game.release_status`, `v_erscheint_bald` |
| 12 | Lückenhafte Metadaten nachpflegen | `v_ohne_igdb` |
| 13 | Datenbestand sichern und exportieren | Abschnitt 14 |
| 14 | Projekt öffentlich teilen, Daten privat halten | Abschnitt 15 |

**Zwei Designprinzipien, die sich durch das ganze Modell ziehen**

*Besitz, Fortschritt und Absicht sind unabhängige Achsen.* Keines ist ein Zustand des anderen. Ein Spiel kann physisch vorliegen, digital gespielt worden sein und trotzdem auf der Kaufliste stehen (andere Plattform). Wer das als ein Statusfeld modelliert, baut spätestens beim dritten Sonderfall um. **Eine bewusste Ausnahme seit dem 16.09.2026:** To-Do und Backlog sind mit der eigenen Bewertung gekoppelt – wer auf To-Do steht, ist „am Spielen", wer im Backlog steht, „pausiert" (5.5). Das sind nicht zwei Achsen, sondern eine Aussage in zwei Darstellungen; die Kopplung hält sie zusammen, statt sie auseinanderlaufen zu lassen.

*Fremddaten und eigene Bewertung werden nie vermischt.* Trophäen kommen von Sony und werden bei jedem Sync überschrieben. `play_status` ist deine Einschätzung und wird von keinem automatischen Prozess angefasst. Die Oberfläche zeigt beides nebeneinander.
