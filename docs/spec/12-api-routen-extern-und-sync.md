← [Inhaltsverzeichnis](README.md)

## 12. API-Routen – externe Quellen, Sync und Kennzahlen

```
GET    /api/igdb/search?q=&plattformen=  Eingebaute Suche mit Rückfällen und Ordnung (7.6), für Spieldetail, Prüfansicht, Import und Nachpflege
GET    /api/igdb/status               { zugangsdaten, gesamt, verknuepft, zurPruefung, ungeprueft, abgelehnt, letzteAktualisierung, discBelegt, discOffen }
GET    /api/igdb/offen                Prüfansicht: Spiele ohne eindeutigen Treffer mit Kandidaten (limit, offset)
POST   /api/igdb/abgleich             ein Schritt: acht Spiele; { geprueft, verknuepft, vorgeschlagen, ohneTreffer, nochOffen, weiter }
POST   /api/igdb/auffrischen          ein Schritt: 50 verknüpfte Spiele in einer IGDB-Anfrage; vorweg angekuendigt → erschienen bei verstrichenem Datum, Antwort erschienen (8.4, Stufe 15)
POST   /api/igdb/physisch             ein Schritt: Disc-Fassung aus external_games für 50 Spiele; { angefragt, gesetzt, nochOffen, weiter } (7.6, Stufe 14)
POST   /api/igdb/erneut-suchen        alle Spiele zur Prüfung zurück in den Abgleich; { zurueckgesetzt }
GET    /api/unmatched?abgelehnte=1    v_ohne_igdb mit zustand; abgelehnte nur mit Parameter (Stufe 11)
POST   /api/unmatched/:quelle/:id/link  Body: { igdbId, plattform? } – Quelle 'spiel' seit Stufe 9, 'plan_wunsch|todo|backlog|kauf' seit Stufe 11 (Freitext → Spiel; plattform wie bei POST /api/plans)
DELETE /api/unmatched/spiel/:id/link  Verknüpfung lösen; nimmt alles zurück, was von IGDB kam
POST   /api/unmatched/spiel/:id/ablehnen  "Gibt es bei IGDB nicht" – gespeicherte Entscheidung
POST   /api/unmatched/spiel/:id/suchen    Ablehnung zurücknehmen; der nächste Abgleich sucht erneut

GET    /api/imports/wishlist          Läufe mit Zählern (gesamt, ungeprueft, klar, mehrdeutig, ohneTreffer, uebernommen, uebersprungen, schonVorhanden)
POST   /api/imports/wishlist          Body: { text, dateiname?, jahr? } → parst, legt Lauf und Zeilen an; { id, form, zeilen, ueberschriften, zusammengefuehrt }
GET    /api/imports/wishlist/:id      Lauf mit Zählern; ?gruppe=klar|unklar|uebersprungen|uebernommen&limit&offset → Zeilen mit Kandidaten
DELETE /api/imports/wishlist/:id      Lauf verwerfen; übernommene plan_entry bleiben
POST   /api/imports/wishlist/:id/abgleich     ein Schritt: acht Zeilen; { status, geprueft, sammlung, eindeutig, mehrdeutig, ohneTreffer, nochOffen, weiter }
POST   /api/imports/wishlist/:id/uebernehmen  ein Schritt: 25 klare Zeilen, eine IGDB-Anfrage; { uebernommen, spieleAngelegt, nochOffen, weiter }
POST   /api/imports/wishlist/:id/zeilen/:zeileId/entscheiden
                                      Body: { aktion: 'igdb', igdbId, plattform? } | { aktion: 'freitext' } | { aktion: 'ueberspringen' } | { aktion: 'zuruecknehmen' }
                                      igdb/freitext schreiben plan_entry sofort (201), 409 bei offenem Duplikat; zuruecknehmen löscht ihn wieder
PATCH  /api/imports/wishlist/:id/zeilen/:zeileId            Body: { titel } – umbenennen, Abgleich der Zeile zurücksetzen
POST   /api/imports/wishlist/:id/zeilen/:zeileId/aufteilen  Body: { titel: string[] } – Sammelzeile trennen

GET    /api/export/:liste.csv         sammlung|wunsch|todo|backlog|kauf|luecken|trophaeen; Semikolon und BOM (14.4)
GET    /api/export/backup.json        Vollsicherung: die 15 Fachtabellen, ohne Rohantworten und Zugangsdaten (14.2)
GET    /api/backup/status             { letzterErfolgAm, letzterCommit, tageSeit }
POST   /api/backup/vermerk            Body: { zeitpunkt (ISO), commit? } – die Backup-Action meldet ihren Lauf

GET    /api/upcoming                  { anzahl, eintraege[] } aus v_erscheint_bald: planId, art, spielId, releaseId, titel, bild, plattform, erscheinungsdatum, favorit (Stufe 15)

GET    /api/events?quelle=&limit=50&vor=<id>   { quelle, limit, weiter, ereignisse[] } aus game_event, neueste zuerst (8.5, Stufe 16): id, zeitpunkt, quelle, spielId, releaseId, titel, art, feld, alt, neu, detail, text (zur Lesezeit gebildet); vor = id der letzten gezeigten Zeile (Keyset)
GET    /api/games/:id/events?limit=20&vor=<id> dasselbe für ein Spiel (idx_event_game); 404 ohne Spiel

GET    /api/gaps?verworfene=1&unbekannte=1  { anzahl, verworfen, unbekannt, luecken[], moeglich[] } aus v_luecken; verworfene und unbekannte nur mit Parameter
                                      je Zeile seit Stufe 20 gebrauchtpreisAnbieter, marktGeprueftAm und
                                      marktRohangebote (0 = eBay kennt nichts, null = ungeprueft) und
                                      gebrauchtpreisUrl (Stufe 20e), je Zeile planId des verworfenen Kaufeintrags
POST   /api/gaps/:releaseId/verwerfen „physisch nicht gewünscht": plan_entry kauf/luecke/verworfen (5.3); 409 bei vorhandenem Kaufeintrag; Rückgängig über DELETE /api/plans/:id
GET    /api/purchase-candidates       { anzahl, luecken, wuensche, kandidaten[] } aus v_kaufkandidaten: quelle, planId, releaseId, spielId, titel, plattform, bild, kritik, favorit, besterGebrauchtpreisCents (Stufe 15)
GET    /api/backlog-candidates        { anzahl, abgelehnt, kandidaten[] } aus v_backlog_kandidaten (5.4)

POST   /api/scan                      Body: { ean } – 400 bei Form oder Prüfziffer; speichert seit Stufe 17d nichts (scans: 0); { ean, treffer: mapping|angebot|keiner, release? { releaseId, spielId, titel, plattform, bild, exemplare },
                                      angebot? { titel, plattform }, scans } – ohne Mapping wird der Code in unresolved_scan festgehalten (Stufe 17, 9.2)
DELETE /api/scan/:ean/vorschlag        „Titel ist falsch": Vorschlag weg, Code bleibt offen und geprüft (die Quelle lieferte zu einem Sony-Code Zahnpasta); 404 ohne Vorschlag
GET    /api/scan/:ean/online          eBay live (Stufe 17c): { ean, quelle, angebote, titel, eindeutig, zielSpielId, kandidaten[] };
                                      vermerkt den Titel am offenen Scan, ordnet nichts zu; 503 ohne Zugangsdaten oder bei erschöpftem Kontingent
POST   /api/scan/:ean/assign          Body: { releaseId } oder { spielId, plattform } (Release entsteht bei Bedarf) – legt Disc mit EAN und Mapping an, erledigt Kauf/Wunsch;
                                      201 wie POST /api/physical-copies plus ean, spiel { spielId, titel, plattform }; ein vorhandenes Mapping wird überschrieben
DELETE /api/scan/:ean                 Mapping lösen (Rückgängig: erst DELETE /api/physical-copies/:id); die Disc bleibt; 404 ohne Mapping

GET    /api/releases/:id/prices?channel=
                                      (`POST /api/imports/feed` ist mit dem AWIN-Feed entfallen, 7.3)
POST   /api/sync/markt                eine Portion Gebrauchtpreise (10 Releases, Stufe 20); 503 ohne
                                      eBay-Zugangsdaten, 502 bei Ratenlimit; { status, geprueft, mitPreis,
                                      discBelegt, ohneAngebot, nochOffen, weiter }
GET    /api/sync/markt                { zugangsdaten, mitPreis, geprueft, ohneAngebot, offen }
POST   /api/sync/store                eine Portion Store-Preise (10 Releases, Stufe 21); KEIN 503-Pfad -
                                      der Store braucht keine Zugangsdaten; { status, geprueft, mitPreis,
                                      imAngebot, imPlusKatalog, zugeordnet, ohneTreffer, nochOffen,
                                      anfragen, weiter }
GET    /api/sync/store                { mitPreis, imAngebot, imPlusKatalog, geprueft, ohneId, ohneWebstore }
POST   /api/sync/store/:releaseId     EIN Release jetzt pruefen, ohne Frist (Stufe 21d); Koerper optional
                                      { adresse } – kopierte Store-Adresse (Produkt oder Concept) oder blosse
                                      Id, 400 wenn unlesbar. Speichert und holt den Preis im selben Aufruf
GET    /api/sync/store/offen          { eintraege } – die Faelle, bei denen Nachpflege etwas bringt
                                      (`ohne_id`, ohne PS3 und Vita); fuer Glocke und Nachpflegeliste
POST   /api/sync                      ein Schritt; ein neuer Lauf trägt started_by = 'nutzer'
POST   /api/sync/besitz               eine Seite der Kaufliste, von Hand (Stufe 18e); überspringt die Sieben-Tage-Frist, nicht die Blätterung;
                                      Antwort wie der Cron-Schritt ({ status, geholt, kauf, plus, entfallen, erledigt, weiter, meldung }), 502 bei Fehler
POST   /api/sync/trophaeen            eine Portion Einzeltrophäen (14 Listen, Stufe 19b); höchstens ein
                                      vollständiger Durchlauf je Tag – wegen der Schreibgrenze, nicht wegen PSN
GET    /api/sync/trophaeen            wie weit die Erstbefüllung ist, dazu das Trophäen-Level
GET    /api/feed                      Dashboard-Feed aus ZWEI Quellen (Stufe 19b): game_event und die
                                      erspielten Trophäen, zur Lesezeit nach Zeit gemischt; acht Zeilen,
                                      kein Blättern. Trophäenzeilen erst, wenn die Erstbefüllung durch ist
GET    /api/releases/:id/trophaeen    die Trophäen EINES Release mit ihren Gruppen (Stufe 19b);
                                      je Release, nicht je Spiel – zwei Fassungen haben zwei Listen
GET    /api/stats/jahre               Trophäen je Jahr (Stufe 19b). Eigene Route, weil die Auswertung
                                      18 060 Zeilen liest: vergangene Jahre aus app_setting, das
                                      laufende live
GET    /api/sync/status               zugang, trophaeen, letzterLauf und letzterAutomatischerLauf (je mit ausloeser; seit Stufe 18),
                                      cronVerlauf und besitz { fertigAm, fehlerAm, laeuft } (Stufe 18e);
                                      zugaenge[] mit eingetragenAm, angekuendigtBis, letzterErfolgAm, ausgang und endeAm (Stufe 19e)
POST   /api/settings/npsso            nimmt den GANZEN eingefuegten Text (Wert, JSON oder ganze Seite, Stufe 19e);
                                      400, wenn darin nicht genau ein 64-Zeichen-Wert steht

GET    /api/stats                     Kennzahlen fuers Dashboard (Stufe 19a): { spiele, releases, plattformen[], status, trophaeen, listen, letztesPlatin }
                                      plattformen je PS3/PS4/PS5/PSVITA mit releases, spiele, mitListe, platin, platinMoeglich, disc, digital – immer alle vier, fehlende als 0;
                                      status als Record ueber die sieben play_status-Werte (ein Release ohne Zeile zaehlt als nicht_gespielt);
                                      trophaeen mit listen, ohneZuordnung, erspielt, definiert, platinErspielt, platinMoeglich und stufen[] (Platin, Gold, Silber, Bronze – in dieser Reihenfolge);
                                      letztesPlatin ist das zuletzt **gespielte** Spiel mit Platin, nicht das zuletzt erspielte (7.7), oder null.
                                      Gezaehlt wird dieselbe Sammlung wie bei /api/games: Releases, die nur einen Wunsch tragen, bleiben aussen vor
```
