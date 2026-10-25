# Trophytracker – Technische Spezifikation

*Version 94 – Stufe 18j, 16.2 geteilt. Die
Abschnittsnummern sind unverändert; die Versionsgeschichte steht in
[`../changelog.md`](../changelog.md).*

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
| 7.3 | [07-3-ebay-betrieb.md](07-3-ebay-betrieb.md) | Umfang, Takt und Betrieb: die GitHub Action seit 20i, Lesekosten, verworfene Wege |
| 7.3 | [07-3-ebay-reihen.md](07-3-ebay-reihen.md) | wie sich Händler-, Markt- und Store-Reihe bewegen (Messung für 20g) |
| 7.3 | [07-3-ebay-verworfen.md](07-3-ebay-verworfen.md) | geprüft und verworfen: AWIN, eBays Aspekt `Spielname`, Quellen für „nur digital" |
| 7.4 | [07-4-store-preise.md](07-4-store-preise.md) | PSN Store-Preise: Endpunkt, Produkt-Id, Zuschnitt |
| 7.4 | [07-4-store-befunde.md](07-4-store-befunde.md) | was ohne Preis dasteht, Nachpflegeliste, Anzeige |
| 7.5 | [07-5-kritikerwertungen.md](07-5-kritikerwertungen.md) | Kritiker- und Spielerwertungen |
| 7.6 | [07-6-igdb.md](07-6-igdb.md) | IGDB-Abgleich |
| 7.7 | [07-7-psn-weitere-daten.md](07-7-psn-weitere-daten.md) | Spielzeit und Kaufliste: Messung, Grenzen, Umfang |
| 7.7 | [07-7-ps-plus-gegen-kauf.md](07-7-ps-plus-gegen-kauf.md) | gekauft oder PS+: zwei Zustände, Momentaufnahme, Handlauf |
| 7.7 | [07-7-einzeltrophaeen.md](07-7-einzeltrophaeen.md) | Einzeltrophäen: Messung, Statistiken, Dashboard-Block |
| 7.7 | [07-7-einzeltrophaeen-bau.md](07-7-einzeltrophaeen-bau.md) | Einzeltrophäen: wie es gebaut ist, Feed, Anzeige |
| 8 | [08-pruefliste-und-import.md](08-pruefliste-und-import.md) | Übersicht Prüfliste und Import |
| 8.1 | [08-1-pruefliste.md](08-1-pruefliste.md) | die Prüfliste |
| 8.2 | [08-2-wunschlisten-import.md](08-2-wunschlisten-import.md) | Wunschlisten-Import aus Textdateien |
| 8.3 | [08-3-metadaten.md](08-3-metadaten.md) | Nachpflege fehlender Metadaten |
| 8.4 | [08-4-unveroeffentlicht.md](08-4-unveroeffentlicht.md) | unveröffentlichte Titel |
| 8.5 | [08-5-aenderungsprotokoll.md](08-5-aenderungsprotokoll.md) | Änderungsprotokoll je Spiel |
| 9 | [09-barcode.md](09-barcode.md) | Barcode-Erfassung, Auflösungskette |
| 9.2, 9.3 | [09-3-ean-quellen.md](09-3-ean-quellen.md) | geprüfte und verworfene EAN-Quellen; warum es keine offenen Scans gibt |
| 10 | [10-sync-protokoll.md](10-sync-protokoll.md) | `psn_sync_run`, Rohablage, zwei Phasen |
| 10.1 | [10-1-cron.md](10-1-cron.md) | die Automatik: zwei Cron-Fenster, Auslastung, Lesekosten |
| 10.1 | [10-1-cron-schritte.md](10-1-cron-schritte.md) | die 15 Schritte in ihrer Reihenfolge |
| 10.1 | [10-1-cron-cpu.md](10-1-cron-cpu.md) | was ein Aufruf an CPU kostet, Standort, Messweg |
| 10.1 | [10-1-cron-verlauf.md](10-1-cron-verlauf.md) | `cron_verlauf`, Verdichtung, örtlicher Aufruf |
| 11 | [11-sichten.md](11-sichten.md) | die sieben Views |
| 12 | [12-api-routen.md](12-api-routen.md) | Routen für Sammlung, Besitz, Bewertung, Absichten, Prüfliste; Filter |
| 12 | [12-api-routen-extern-und-sync.md](12-api-routen-extern-und-sync.md) | Routen für IGDB, Import, Export, Scan, Preise, Sync, Kennzahlen |
| 13 | [13-frontend.md](13-frontend.md) | Übersicht Frontend |
| 13 | [13-1-ansichten.md](13-1-ansichten.md) | die Ansichten: Dashboard bis Wunschliste |
| 13 | [13-1-ansichten-listen-und-werkzeuge.md](13-1-ansichten-listen-und-werkzeuge.md) | die Ansichten: To-Do bis Einstellungen |
| 13 | [13-2-darstellungsregeln.md](13-2-darstellungsregeln.md) | Navigation, Routing, Darstellungsregeln |
| 13 | [13-3-gestaltung-und-pwa.md](13-3-gestaltung-und-pwa.md) | Gestaltung, Tokens, PWA, App-Symbol |
| 14 | [14-backup-export.md](14-backup-export.md) | Sicherung, Wiederherstellung, CSV-Export |
| 15 | [15-repository-deployment.md](15-repository-deployment.md) | zwei Repositories, Deployment, Zugriffsschutz |
| 15 | [15-4-kosten-und-teilen.md](15-4-kosten-und-teilen.md) | Kostenmodell, Schutz vor ungewollten Kosten, was das Teilen wert ist |
| 16 | [16-umsetzung.md](16-umsetzung.md) | Übersicht Umsetzungsreihenfolge |
| 16 | [16-1-abgeschlossene-stufen.md](16-1-abgeschlossene-stufen.md) | eine Zeile je abgeschlossener Stufe |
| 16 | [16-2-offene-stufen.md](16-2-offene-stufen.md) | die offenen Teile von Stufe 20: 20h, 20f, 20g |
| 16 | [16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md) | CPU-Grenze: Budget, Wege je Schritt, Cron je Minute, Fristen, Index-Nachtrag |
| 16 | [16-2-cpu-je-schritt.md](16-2-cpu-je-schritt.md) | CPU-Grenze: was je Schritt folgt, mit den Nachtmessungen |
| 16 | [16-2-bewertung-02-11.md](16-2-bewertung-02-11.md) | Vorlagen für die Budget-Bewertung am 02.11.: Sicherung (`backup.json`), Kaufliste-Portion |
| 16 | [16-2-betriebswarnungen.md](16-2-betriebswarnungen.md) | Betriebswarnungen (18m, 18m-b), Nachtläufe bis 05:00 UTC |
| 16 | [16-2-endlos-scrollen.md](16-2-endlos-scrollen.md) | Endlos-Scrollen in der Sammlung und im Änderungsprotokoll (Stufe 22) |
| 16 | [16-4-finale-stufen.md](16-4-finale-stufen.md) | die fünf finalen Stufen |
| 17 | [17-risiken.md](17-risiken.md) | bekannte Risiken und wie damit umgegangen wird |

Im Code stehen Verweise der Form „Abschnitt 5.3". Die Nummern gelten weiter;
diese Tabelle sagt, in welcher Datei sie stehen. **Abschnitte werden nicht
umnumeriert.**
