← [Inhaltsverzeichnis](README.md)

### 9.2 Geprüfte und verworfene EAN-Quellen

**Keine externe EAN-Quelle (Entscheidung des Nutzers vom 16.09.2026, gemessen mit drei Codes seiner Discs – Darksiders PS3, Fallout 4 PS4, Hogwarts Legacy PS5):** `upcitemdb` (frei) kannte 1 von 3, mit Händlertitel („Ps3 / Sony Playstation 3 Game - Darksiders [standard] En/ger Boxed"); ean-suche.de blockt automatische Abfragen und bietet die API nur gegen Account; Websuchen liefern Bot-Challenges (DuckDuckGo) oder brauchen bezahlte Schlüssel (Google), Bing ist eingestellt, Brave wäre ein Freikontingent mit Rateheuristik über Seitenüberschriften; IGDB kennt keine Barcodes. Für das **Regal erfassen** bringt eine Vorbelegung ohnehin wenig – die Disc liegt vor, die Auswahl aus der eigenen Sammlung ist ein Tipp. Gelohnt hat eine Quelle erst für **„im Laden prüfen"** (fremder Code → habe ich das schon, steht es auf der Kaufliste?), und sie kam mit Stufe 17c in Form von eBay.
**Gemessen und erledigt (Frage des Nutzers vom 16.09.2026, wie sich die Trefferquote erhöhen lässt).** Erster Messpunkt vom 17.09.2026 mit drei Codes: eine einfache Websuche findet Hogwarts Legacy (eBay-Angebot) und Fallout 4 (Händlerseite), Darksiders nicht – 2 von 3. Gegen die echten Codes des Regals gemessen hat die **eBay Browse API** (`item_summary/search?gtin=`, freier Developer-Account, Application-Token per Client-Credentials) so gut getroffen, dass sie mit Stufe 17c zur zweiten Stufe der Kette wurde – die Zahlen stehen oben. **Geprüft und verworfen:** mehrere UPC-Datenbanken kombiniert (Lebensmittel-lastig, wenig Gewinn), Redump.org und PriceCharting (spielespezifisch, aber ohne API bzw. bezahlt), GS1-Präfix (nennt nur den Verlag). **Ohne EAN** bleibt ein Foto des Covers an ein Bildmodell als Option für „im Laden prüfen" vermerkt (rund 0,5 Cent je Foto) – eine zweite externe Abhängigkeit mit Kosten, deshalb nicht gebaut. Klassische OCR auf dem Rücken und Rückwärts-Bildsuche scheiden aus (Logos, kein freies API).


### 9.3 Es gibt keine offenen Scans (Stufe 17d)

Ein Barcode, der sich nicht sofort zuordnen lässt, wird **nicht gespeichert**. `POST /api/scan`
antwortet mit `scans: 0`, und wer gerade nicht zuordnen kann, überspringt und scannt die Disc später
erneut. Der Grund ist die Erfahrung aus Stufe 17b, in der offene Scans nachts bei `upcitemdb` einen
Titel bekamen und in der Ansicht `/scans` zur Entscheidung lagen: Ein Code ohne seine Hülle ist
fast wertlos, die Disc steht längst wieder im Regal, und eine Zahl allein sagt nichts. Gemessen an
56 Codes des PS3-Regals kannte die Quelle 35, davon führten 22 zu genau einem Spiel – zu wenig für
eine Liste, die Arbeit erzeugt statt sie abzunehmen (Entscheidung des Nutzers vom 21.09.2026,
Begründung in [lehren.md](../lehren.md)).

**Entfallen sind damit** „Später" und der Sammelmodus „Nur sammeln" im Scanner, die Ansicht `/scans`
samt Einstellungen-Kachel, der Job `scripts/scans-aufloesen.mjs` mit
`.github/workflows/scans.yml` und fünf Routen (`GET /api/scan/unresolved`,
`GET /api/scan/ungeprueft`, `POST`/`DELETE /api/scan/:ean/vorschlag`,
`DELETE /api/scan/unresolved/:ean`).

**Geblieben ist** `upcitemdb` als Rückfall hinter eBay, jetzt live im Worker (9.2) – die Quelle war
nie das Problem, nur ihr Platz. Und die Tabelle `unresolved_scan`: Sie trägt noch die **12 Zeilen**
aus der Zeit davor und wird von keinem Schreibpfad mehr gefüllt; `src/db/scan.ts` löscht nur noch
daraus. Ein `DROP TABLE` bräuchte zwei Deployments (Abschnitt 15.2), sie bleibt deshalb in
`EXPORT_TABELLEN`, bis sie fällt – die Zeilen sind Material für die finale Stufe 1 und die
Tabelle geht danach, vor Stufe 4 ([16.4](16-4-finale-stufen.md)).

**Der Preis, bewusst bezahlt:** Es gibt keinen Notausgang für eine Disc, die man gerade weder
zuordnen noch anlegen will. Weil sie in der Hand liegt und ein erneuter Scan nichts kostet, ist das
kein Verlust.
