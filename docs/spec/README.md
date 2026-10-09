# Trophytracker – Technische Spezifikation

*Version 76 – Dokumentation aufgeteilt. Die Abschnittsnummern sind unverändert;
die Versionsgeschichte steht in [`../changelog.md`](../changelog.md).*

Die Spezifikation ist die maßgebliche Quelle. Jeder Abschnitt beschreibt den
**aktuellen Stand**. Wie er dazu kam, steht im
[Changelog](../changelog.md); Vorfälle, aus denen eine Regel entstanden ist,
in [`lehren.md`](../lehren.md); Entscheidungen des Nutzers mit Datum in
[`entscheidungen.md`](../entscheidungen.md).

## Abschnitte

| Abschnitt | Datei | Inhalt |
|---|---|---|
| 1 | [01-use-cases.md](01-use-cases.md) | die 14 Use Cases und die zwei Designprinzipien |
| 2 | [02-stack.md](02-stack.md) | Technologie und die Grenzen des Free Tier (CPU, Zeilen, Binds) |
| 3 | [03-sammlung.md](03-sammlung.md) | `game`, `release`, `physical_copy`, `digital_entitlement`, Disc-Fassung |
| 4 | [04-fortschritt.md](04-fortschritt.md) | 4.1 Trophäen als Fremddaten, 4.1b Einzeltrophäen, 4.2 eigene Bewertung |
| 5 | [05-absichten.md](05-absichten.md) | `plan_entry`: zwei Achsen, Übergänge, Plattformpflicht, Waisen |
| 5.1, 5.2 | [05-1-favorit-und-sortierung.md](05-1-favorit-und-sortierung.md) | Favorit statt Priorität; Sortierung der Listen |
| 5.3 | [05-3-luecke-verwerfen.md](05-3-luecke-verwerfen.md) | eine Lücke bewusst verwerfen, Block A und B |
| 5.4, 5.5 | [05-4-todo-und-kopplung.md](05-4-todo-und-kopplung.md) | To-Do-Reihenfolge, Backlog-Kandidaten, Kopplung mit `play_status` |
| 6 | [06-marktdaten.md](06-marktdaten.md) | `market_offer`, `price_snapshot`, die zwei Kanäle |
| 7 | [07-externe-anbindungen.md](07-externe-anbindungen.md) | Übersicht der sieben externen Anbindungen |
| 7.1 | [07-1-psn-trophaeen.md](07-1-psn-trophaeen.md) | NPSSO, Token, Zugang erneuern |
| 7.2 | [07-2-matching.md](07-2-matching.md) | das Matching-Problem |
| 7.3 | [07-3-ebay.md](07-3-ebay.md) | Gebrauchtpreise und Disc-Nachweis aus eBay |
| 7.3 | [07-3-ebay-verworfen.md](07-3-ebay-verworfen.md) | geprüft und verworfen: AWIN, eBays Aspekt `Spielname`, Quellen für „nur digital" |
| 7.4 | [07-4-store-preise.md](07-4-store-preise.md) | PSN Store-Preise: Endpunkt, Produkt-Id, Zuschnitt |
| 7.4 | [07-4-store-befunde.md](07-4-store-befunde.md) | was ohne Preis dasteht, Nachpflegeliste, Anzeige |
| 7.5 | [07-5-kritikerwertungen.md](07-5-kritikerwertungen.md) | Kritikerwertungen |
| 7.6 | [07-6-igdb.md](07-6-igdb.md) | IGDB-Abgleich |
| 7.7 | [07-7-psn-weitere-daten.md](07-7-psn-weitere-daten.md) | Spielzeit, Kaufliste, PS+ gegen Kauf |
| 7.7 | [07-7-einzeltrophaeen.md](07-7-einzeltrophaeen.md) | Einzeltrophäen: Messung, Tabellen, Anzeige |
| 8 | [08-pruefliste-und-import.md](08-pruefliste-und-import.md) | Übersicht Prüfliste und Import |
| 8.1 | [08-1-pruefliste.md](08-1-pruefliste.md) | die Prüfliste |
| 8.2 | [08-2-wunschlisten-import.md](08-2-wunschlisten-import.md) | Wunschlisten-Import aus Textdateien |
| 8.3 | [08-3-metadaten.md](08-3-metadaten.md) | Nachpflege fehlender Metadaten |
| 8.4 | [08-4-unveroeffentlicht.md](08-4-unveroeffentlicht.md) | unveröffentlichte Titel |
| 8.5 | [08-5-aenderungsprotokoll.md](08-5-aenderungsprotokoll.md) | Änderungsprotokoll je Spiel |
| 9 | [09-barcode.md](09-barcode.md) | Barcode-Erfassung, Auflösungskette |
| 9.2, 9.3 | [09-3-ean-quellen.md](09-3-ean-quellen.md) | geprüfte und verworfene EAN-Quellen; warum es keine offenen Scans gibt |
| 10 | [10-sync-protokoll.md](10-sync-protokoll.md) | `psn_sync_run`, Rohablage, zwei Phasen |
| 10.1 | [10-1-cron.md](10-1-cron.md) | die Automatik: zwei Cron-Fenster, 15 Schritte |
| 10.1 | [10-1-cron-verlauf.md](10-1-cron-verlauf.md) | `cron_verlauf`, Verdichtung, örtlicher Aufruf |
| 11 | [11-sichten.md](11-sichten.md) | die sieben Views |
| 12 | [12-api-routen.md](12-api-routen.md) | Routen für Sammlung, Besitz, Bewertung, Absichten, Prüfliste; Filter |
| 12 | [12-api-routen-extern-und-sync.md](12-api-routen-extern-und-sync.md) | Routen für IGDB, Import, Export, Scan, Preise, Sync, Kennzahlen |
| 13 | [13-frontend.md](13-frontend.md) | Übersicht Frontend |
| 13 | [13-1-ansichten.md](13-1-ansichten.md) | die 19 Ansichten |
| 13 | [13-2-darstellungsregeln.md](13-2-darstellungsregeln.md) | Navigation, Routing, Darstellungsregeln |
| 13 | [13-3-gestaltung-und-pwa.md](13-3-gestaltung-und-pwa.md) | Gestaltung, Tokens, PWA, App-Symbol |
| 14 | [14-backup-export.md](14-backup-export.md) | Sicherung, Wiederherstellung, CSV-Export |
| 15 | [15-repository-deployment.md](15-repository-deployment.md) | zwei Repositories, Deployment, Zugriffsschutz, Kosten |
| 16 | [16-umsetzung.md](16-umsetzung.md) | Übersicht Umsetzungsreihenfolge |
| 16 | [16-1-abgeschlossene-stufen.md](16-1-abgeschlossene-stufen.md) | eine Zeile je abgeschlossener Stufe |
| 16 | [16-2-offene-stufen.md](16-2-offene-stufen.md) | 20f, 20g und die fünf finalen Stufen |
| 17 | [17-risiken.md](17-risiken.md) | bekannte Risiken und wie damit umgegangen wird |

Im Code stehen Verweise der Form „Abschnitt 5.3". Die Nummern gelten weiter;
diese Tabelle sagt, in welcher Datei sie stehen. **Abschnitte werden nicht
umnumeriert.**
