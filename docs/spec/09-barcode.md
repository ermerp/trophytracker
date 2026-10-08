← [Inhaltsverzeichnis](README.md)

## 9. Barcode-Erfassung

### 9.1 Erfassung

Primär die Standard-API `BarcodeDetector`, gefragt wird nach **EAN-13, UPC-A und EAN-8** (`FORMATE` in `frontend/src/kamera.ts`; die native Erkennung bekommt nur, was `getSupportedFormats` nennt). UPC-A gehört dazu, seit Horizon Forbidden West (PS5) beim Abscannen nicht ging: Sony-Titel tragen zwölfstellige UPC-A (`711719…`), und die Abfrage nur nach `ean_13` verwarf sie. Ein UPC-A wird im Worker mit führender Null zur GTIN-13 normalisiert (`normalisiereEan`), damit derselbe Code nicht je nach Erkennung zwei Einträge ergibt; die Prüfziffer bleibt dabei gültig (Rückmeldung des Nutzers vom 18.09.2026); Fallback ist seit Stufe 17 der **Polyfill `barcode-detector`** (ZXing als WebAssembly, aktiv gepflegt) statt des bis dahin vorgesehenen `html5-qrcode` (Entscheidung des Nutzers vom 16.09.2026): ein Codepfad für beide Geräte, die WASM-Datei wird mitgebaut und vom eigenen Worker ausgeliefert, nicht zur Laufzeit von einem CDN – Voraussetzung für die PWA in Stufe 18. Der Polyfill wird erst geladen (dynamischer Import), wenn der Browser keinen nativen Detektor mit EAN-13 hat; die Oberfläche zeigt dann die Pille „Fallback". Kamerazugriff braucht HTTPS – über die `workers.dev`-Adresse ohnehin gegeben; lokal ist `localhost` ein sicherer Kontext (`frontend/src/kamera.ts`).

**Eingabegeräte (Entscheidung des Nutzers vom 16.09.2026, nach Abnahme von Stufe 16):** Gescannt wird mit der **Handy-Kamera** im Browser; zusätzlich muss es mit der **Webcam des Laptops** funktionieren, damit sich der Scanner am Rechner testen lässt. Andere Wege – USB-Handscanner, die als Tastatur tippen, Eingabe über Datei – werden **nicht** berücksichtigt. Folge für Stufe 17: Die Kamera-Erkennung braucht beide Pfade, denn `BarcodeDetector` gibt es in Chrome auf Android, aber nicht in Firefox und nicht auf dem Desktop ohne Flag; der Fallback ist damit kein Randfall, sondern der Testpfad am Laptop. Ein Textfeld für die EAN bleibt als Notnagel, wenn die Kamera den Code nicht liest.

Serienerfassung: nach jedem erkannten Code wird die Auflösung eingeblendet, ohne den Scanner zu schliessen. Für das Ersterfassen eines Regals ist das der Unterschied zwischen zehn Minuten und einem Abend. Konkret (Stufe 17): Die Erkennung läuft alle 150 ms auf dem laufenden Kamerabild. **Ein Code gilt erst, wenn ihn zwei Lesungen übereinstimmend liefern** (`frontend/src/bestaetigung.ts`; Bilder ohne Code zählen nicht mit, ein anderer Code beginnt neu), **ein UPC-A erst nach drei**: Die Prüfziffer fängt Tippfehler, aber nicht jeden Fehlgriff der Erkennung – bei der Abnahme am 17.09.2026 las der Scanner eine Darksiders-Disc als `8005809114554` statt `4005209114554`, zwei Ziffern daneben, beide mit Gewicht 1 und die Summe um genau 10 verschoben, die Prüfziffer also unverändert gültig. Solche Fehlgriffe hängen am einzelnen Bild und wiederholen sich fast nie; die zweite Lesung kostet rund 150 ms. Die zusätzliche Lesung für UPC-A kam am 18.09.2026 dazu, als der Scanner den EAN-13 `5026555400404` als UPC-A `089555400404` las – die letzten zehn Ziffern stimmen, der linke Teil ist verstümmelt, und die kürzere Zahl trägt zufällig eine gültige Prüfziffer. Solche Lesungen entstehen erst, seit UPC-A überhaupt gefragt wird, und sind von einem echten UPC-A nicht zu unterscheiden; deshalb schlägt im selben Bild ein EAN-13 den UPC-A (`besterTreffer`), und ein UPC-A allein muss sich dreimal zeigen. Solange ein Code auf seine Bestätigung wartet, steht „liest … " in der Zeile unter dem Bild.

**Eine Betriebsart.** Der Scanner zeigt zu jedem Code seine Karte; „Überspringen" geht weiter, ohne etwas zu speichern. Einen zweiten Modus „Nur sammeln" gab es bis Stufe 17d, er ist mit den offenen Scans entfallen (9.3).

### 9.2 Auflösungskette

| Stufe | Quelle | Ergebnis |
|---|---|---|
| 1 | `ean_mapping` | Direkter Treffer, Erfassung mit einem Klick – rein lokal, ohne jede Online-Abfrage |
| 2 | `market_offer` per EAN | Titel und Plattform bekannt → Release vorschlagen, `ean_mapping` automatisch schreiben |
| 3 | **eBay Browse API, live** (seit Stufe 17c) | Angebotstitel → Abgleich mit der Sammlung → Spiel vorschlagen |
| 3b | **upcitemdb, live** (seit Stufe 17d) | nur wenn eBay den Code nicht kennt: ein Titel oder nichts |
| 4 | `game` per Titelsuche | Nutzer wählt aus, `ean_mapping` wird geschrieben |
| 5 | kein Treffer | Spiel anlegen wie in der Sammlung, Zuordnung wird gespeichert |

Stufen 1, 4 und 5 laufen ohne Fremddaten. Der Barcode-Scan hängt damit **nicht** an eBay; Stufen 2 und 3 sind Verbesserungen, kein Fundament.

**Ein einmal zugeordneter Code wird nie wieder online nachgeschlagen.** Stufe 1 ist ein Index-Zugriff auf die eigene D1; ein zweiter Scan derselben Disc zeigt sofort Titel, Plattform, Cover und „im Regal ×n". `ean_mapping` steht in `EXPORT_TABELLEN` und wandert damit in die wöchentliche Sicherung.

**So gebaut (Stufe 17, Entscheidungen des Nutzers vom 16.09.2026):**

- `POST /api/scan` prüft Form (8–14 Ziffern) und Prüfziffer (EAN-8, UPC-A, EAN-13 – `src/domain/ean.ts`, fängt Tippfehler im Textfeld), löst Stufe 1 und 2 in einem Batch aus zwei Index-Lookups auf. **Ein Code ohne Mapping wird seit Stufe 17d nicht mehr gespeichert** (9.3): Die Antwort trägt `scans: 0`, und in `unresolved_scan` landet nichts. Ein Mapping-Treffer bringt Titel, Cover und die Zahl der Exemplare („im Regal ×n") – Karte mit „Weiteres Exemplar", „Anderes Spiel", „Weiter".
- **Stufe 3 ist die Suche in der eigenen Sammlung** über dieselbe Abfrage wie die Sammlungsansicht (`GET /api/games?search=&limit=10`, gemessen in `test/lesekosten.spec.ts`): je Spiel ein Knopf je vorhandenem Release (mit „Disc ×n", wenn schon im Regal) und ein Dropdown „andere Plattform" für Releases, die es noch nicht gibt. Ein Händlerangebot (Stufe 2) belegt das Suchfeld vor. „Später" lässt den Code als offenen Scan stehen.
- **Stufe 4 läuft wie „Spiel anlegen" in der Sammlung** (dieselbe Komponente, `frontend/src/SpielAnlegen.tsx`): Plattform, darunter die IGDB-Suche mit dem Suchtext vorbelegt. Ein Treffer legt das Spiel **in einem Schritt** an, verknüpft und mit Cover (`POST /api/games` mit `igdbId`); die Plattform steht als Dropdown **am Treffer**, vorbelegt mit dessen neuester (eine Disc gehört an ein Release; seit Stufe 19d gilt das überall, die frühere Sonderregel dieser Ansicht ist damit die Regel). Bis Stufe 17 legte man erst an, ging ins Spieldetail und suchte dort – drei Schritte über zwei Bildschirme (Rückmeldung des Nutzers vom 18.09.2026). Bei gleichem Titelschlüssel die Kandidaten mit „Release anhängen", „vorhandenes Release verwenden" oder „Trotzdem als neues Spiel anlegen".
- **Kennt IGDB das Spiel nicht** – die PlayStation Move Starter Disc etwa –, legt „Ohne IGDB-Eintrag anlegen" es als Freitext an; im Spieldetail gehört dann „Gibt es bei IGDB nicht" dazu (7.6), damit der Abgleich es nicht wieder vorschlägt. Das ist derselbe Weg wie beim Wake-up Club, kein Sonderfall (Frage des Nutzers vom 18.09.2026).
- **Zuordnen (`POST /api/scan/:ean/assign`) legt die Disc und das Mapping an.** Wer einen Code zuordnet, hat die Disc in der Hand: `physical_copy` mit der EAN über `addPhysicalCopy(…, 'scan')` – Disc-Fassung `unbekannt → ja` wie beim Erfassen von Hand, Protokoll `exemplar_angelegt` mit `detail = 'scan'` („per Barcode", 8.5) –, dann `ean_mapping` (`source = 'manuell'`) und das Löschen des offenen Scans; offene Kauf- und Wunscheinträge werden wie bei jedem Erfassen erledigt (Abschnitt 5, `absichtenErledigen`), mit „ins Backlog übernehmen" und **Rückgängig** (Absichten wieder öffnen, Disc löschen, Mapping lösen). Ein Release, das dem Spiel auf der Plattform der Disc fehlt, entsteht dabei (`releaseFuerPlattform`, `release_angelegt` mit Detail `scan`). Ein erneutes Zuordnen derselben EAN **überschreibt** das Mapping – Korrektur einer Nutzerentscheidung durch den Nutzer, kein automatischer Prozess.
- **Eine Fehllesung ist mit „Überspringen" erledigt**, weil ein nicht zugeordneter Code gar nicht gespeichert wird (9.3). Fehllesungen gibt es: zweimal zwei vertauschte Ziffern mit trotzdem gültiger Prüfziffer – deshalb die zweite Lesung zur Bestätigung, bei UPC-A die dritte.

**Offene Scans gibt es seit Stufe 17d nicht mehr** (9.3). Ein Code, der gerade nicht zugeordnet wird, hinterlässt keine Spur; die Disc steht im Regal, ein erneuter Scan holt ihn zurück.
- Ein falsch gelesener Code ist trotzdem korrigierbar: Die EAN steht auf jeder Karte und im Spieldetail am Exemplar, ein erneutes Zuordnen überschreibt das Mapping, und „verwerfen" räumt einen offenen Scan weg.
- Keine Migration: `ean_mapping` und `unresolved_scan` bestehen seit 0001 und sind exportiert. `ean_mapping` bekommt kein eigenes Ereignis: Es ist dieselbe Nutzerentscheidung wie das Exemplar, das im selben Zug entsteht.

**Titel beim Scannen, nicht erst nachts** (Stufe 17c, Entscheidung des Nutzers vom 21.09.2026). Der Worker fragt eBay **im Moment des Scannens** (`GET /api/scan/:ean/online`); ein unbekannter Code fällt damit auf, solange die Hülle in der Hand liegt. Warum ein nächtlicher Job das nicht leisten konnte: 9.3.

*Warum das in den Worker darf:* Die 10-ms-Grenze gilt für **Rechenzeit**, nicht für das Warten auf eine Antwort (Abschnitt 2). eBay antwortet in rund 0,3 Sekunden und erlaubt 5 000 Abfragen am Tag (`GET /developer/analytics/v1_beta/rate_limit/`, geprüft am 21.09.2026). upcitemdb blockt nach je sechs Abfragen 90 Sekunden und lag deshalb bis Stufe 17c in einem nächtlichen Job; seit 17d steht es als **Rückfall** ebenfalls im Worker – gefragt wird nur, wenn eBay den Code nicht kennt, also selten, und eine Drosselung bedeutet schlicht „kein Titel" statt eines Fehlers (`src/ean/upcitemdb.ts`). Damit braucht die Kette keinen geplanten Job mehr.

*Bauweise:* `src/ebay/client.ts` folgt `src/igdb/client.ts` – Application-Token per Client-Credentials, nur im Speicher der Worker-Instanz, Secret und Token als `Geheimnis`; bei `401` wird es genau einmal erneuert. Fehlende Zugangsdaten oder ein erschöpftes Kontingent ergeben `503` **nur** auf dieser Route; der Scanner arbeitet dann wie vor Stufe 17c weiter. Die Route ist bewusst **getrennt von `POST /api/scan`**: Der lokale Treffer bleibt sofort da, und ein langsames eBay hält das Scannen nicht auf. Geantwortet wird mit einem Vorschlag – Titel, passende Spiele der Sammlung mit Cover und Exemplarzahl, dazu das eine Ziel, wenn es eines gibt; die Oberfläche zeigt ihn als dieselbe Karte wie einen bekannten Code, damit „das hast du schon" auf einen Blick erkennbar ist (13). Zugeordnet wird ausschließlich über `POST /api/scan/:ean/assign`, also vom Nutzer (Abschnitt 7). Der gefundene Titel wird am offenen Scan vermerkt (`title_source = 'ebay'`), damit derselbe Code nicht zweimal abgefragt wird.

**Der Abgleich hat zwei gemessene Korrekturen bekommen (21.09.2026, gegen 22 offene und 34 bekannte Codes des Nutzers):**

- **Mehrheitsregel** (`mehrheitstreffer`, `src/domain/scan-titel.ts`): eBay liefert bis zu zehn Angebote je Code. Einzeln genügt eines, um danebenzugreifen – ein Bündel („Red Dead Redemption + GTA IV") oder ein Cross-Sell nennt ein fremdes Spiel. Ein Spiel gilt deshalb nur, wenn es in **mehr als der Hälfte** der eindeutigen Angebotstreffer steckt und öfter als jedes andere.
- **Ballast vor Ziffern:** Erst Ballastworte entfernen, dann Buchstaben-Ziffern-Grenzen trennen. Die Reihenfolge ist nicht kosmetisch – umgekehrt zerfiele auch `ps3` zu `ps` + `3`, und ein Angebot „Killzone PS3" würde zu „Killzone 3". Zusätzlich fällt eine blanke Zahl direkt hinter einem Plattformwort weg (`Sony PlayStation 3`), sonst passt jedes PS3-Angebot auf den dritten Teil einer Reihe. Damit findet „LittleBigPlanet 2" endlich `LittleBigPlanet2` statt des Grundspiels – der einzige Fehlgriff der ersten Messung.
- **Römische Zahlen II–IX werden auf Ziffern gebracht.** Ohne die Tabelle passt `Kingdom Come: Deliverance II` auf keines seiner eigenen Angebote, weil Verkäufer „2" schreiben, und das Grundspiel gewinnt. `v` und `x` bleiben draußen: Sie sind auch gewöhnliche Buchstaben („Mega Man X"), und die Messung zeigte keinen Gewinn.
- **Rückhalt für den Sieger:** Ab drei Angeboten muss ihn mindestens zwei nennen. Sonst setzt sich ein Alleinkandidat aus einem Bündel durch – „GTA 4 + 5 Red Dead Redemption" ergab einen Vorschlag für GTA, während das eigentliche Spiel als `Red Dead Redemption (2010)` **und** `(2023)` in der Sammlung stand und auf keines seiner eigenen Angebote passte (die Jahreszahl ist der Unterscheider des Nutzers, kein Verkäufer schreibt sie). Lieber kein Vorschlag als ein falscher; ohne Ziel zeigt die Oberfläche die Suche.


*Ergebnis der Messung (Stand 21.09.2026, nach allen vier Korrekturen):* eBay kennt 33 der 34 bereits zugeordneten Codes und 18 der 22 offenen. Über alle 42 gegengeprüften Codes – 34 aus der Messung und 8 aus dem ersten echten Regal-Durchgang – werden **37 richtig zugeordnet, kein einziger falsch**; **16 der 22** bisher unlösbaren Codes bekommen einen Vorschlag; zwei weitere liefern einen brauchbaren Titel zu einem Spiel, das die Sammlung noch nicht kennt (dort ist der Titel die Vorlage zum Anlegen). Die Messung lief im Scratchpad gegen die echten Codes; ins Repository kamen nur Zahlen.

```sql
CREATE TABLE ean_mapping (
  ean           TEXT PRIMARY KEY,
  release_id    INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  source        TEXT NOT NULL DEFAULT 'manuell',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Damit unbekannte Codes nicht verloren gehen, wenn beim Scannen
-- nicht sofort zugeordnet werden soll.
CREATE TABLE unresolved_scan (
  ean           TEXT PRIMARY KEY,
  scan_count    INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

**Welche EAN-Quellen geprüft und verworfen sind** und **warum es keine offenen Scans gibt** (9.3):
[09-3-ean-quellen.md](09-3-ean-quellen.md).
