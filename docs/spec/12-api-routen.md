← [Inhaltsverzeichnis](README.md)

## 12. API-Routen

```
GET    /api/games                     Liste mit Filtern; sort=titel|zuletzt|spielzeit&richtung=auf|ab –
                                      die einzige Liste, die in SQL sortiert (Stufe 20e)
GET    /api/games/:id                 Detail: Releases, Copies, Trophäen, Status, Preise; seit Stufe 10 `plaene` (offene Absichten am Spiel und seinen Releases)
POST   /api/games                     Body: { titel | igdbId, plattform, trotzdem? } – 409 mit Kandidaten bei gleichem Titelschlüssel;
                                      igdbId legt das Spiel aus dem Treffer an und verknüpft es in einem Zug (Titel, Cover, Wertung aus IGDB, 201 mit igdbVerknuepft);
                                      kennt die Sammlung die IGDB-Id schon, kommt dieses Spiel zurück (200, vorhanden: true), das Release der Plattform entsteht bei Bedarf;
                                      404 bei unbekannter oder nicht-PlayStation IGDB-Id, 503 ohne IGDB-Zugangsdaten (Stufe 17)
PATCH  /api/games/:id
DELETE /api/games/:id                 Trophäenlisten zurück in die Zuordnung

POST   /api/releases                  Body: { spielId, plattform } – 409, wenn die Plattform belegt ist
PATCH  /api/releases/:id              Body: Teilmenge von { discFassung: ja|nein|unbekannt, psnProductId } – ja/nein mit Quelle 'manuell', unbekannt nimmt die Quelle zurück (Stufe 14)
DELETE /api/releases/:id              Trophäenliste zurück in die Zuordnung; leeres Spiel wird mit gelöscht

GET    /api/physical-copies
POST   /api/physical-copies            seit Stufe 15 mit absichtenErledigt[] (offene kauf/wunsch am Release und am Spiel, automatisch erledigt, Abschnitt 5) und aufListe (offener todo/backlog am Release)
PATCH  /api/physical-copies/:id
DELETE /api/physical-copies/:id
POST   /api/digital-entitlements       dito absichtenErledigt, aufListe
DELETE /api/digital-entitlements/:id

PUT    /api/releases/:id/play-status  Use Case 2: Body { status, begonnenAm?, beendetAm?, bewertung?, notiz? }; gilt als Durchsicht (8.1); koppelt To-Do/Backlog (5.5), Antwort mit eintragAngelegt, eintraegeErledigt
PATCH  /api/releases/:id/play-status  Body { status } – nur der Status, Datum/Bewertung/Notiz bleiben; koppelt und stempelt wie PUT
GET    /api/deviations                v_abweichungen, mit spielId/releaseId für den Link ins Spieldetail

GET    /api/trophies
GET    /api/trophies/unmatched
GET    /api/games/uebersicht           Alle Zuordnungen als Tabelle, filter- und durchsuchbar
POST   /api/games/release/:id/abtrennen  Release in ein neues Spiel herauslösen
POST   /api/games/schluessel-neu-berechnen  sort_title aller Spiele aus dem Titel neu ableiten
GET    /api/zuordnung/offen            Gruppenvorschläge, seitenweise
POST   /api/zuordnung/gruppe           Gruppe bestätigen: ein Spiel, mehrere Releases
POST   /api/zuordnung/liste/:npCommId  Einzelne Liste einem Release zuordnen

GET    /api/plans?kind=wunsch|todo|backlog|kauf&status=offen|alle&sort=favorit|wertung|preis|titel|release|angelegt|position&favorit=1&plattform=PS4,PS5&suche=
                                      `richtung=auf|ab` nur, wenn sie von der natürlichen des Kriteriums
                                      abweicht (5.2); je Eintrag preisCents, preisAnbieter, preisUrl (Stufe 20e)
                                      { sortierung, plattformen, eintraege[] } (5.2); Standard position bei todo, sonst favorit;
                                      je Eintrag position, eigenerStatus (5.5), seit Stufe 15 aufKaufliste (Id des offenen Kaufeintrags am selben Ziel) und imBesitz
POST   /api/plans                     Body: { art, spielId | releaseId | igdbId | titel, plattform?, favorit?, notiz?, status?, herkunft? } – genau eine Quelle;
                                      status nur offen (Standard) oder verworfen („nicht vorgesehen", 5.4); herkunft luecke|wunsch nur bei art=kauf (Kandidaten, Stufe 15), sonst manuell;
                                      todo hängt ans Ende; todo/backlog am Release koppeln den Status (5.5);
                                      igdbId legt bei Bedarf ein Spiel an; plattform (nur zu spielId/igdbId): fehlt oder 'auto' → die neueste
                                      der Releases bzw. des IGDB-Eintrags, '' → ohne, sonst eine der vier – der Wunsch hängt am Release
                                      dieser Plattform, das bei Bedarf entsteht; 409 mit eintragId bei offenem Duplikat (Abschnitt 5)
PATCH  /api/plans/:id                 Teilmenge von { favorit, notiz, status, art, plattform }; Statuswechsel setzt resolved_at; art, status offen und plattform koppeln (5.5);
                                      plattform hängt den Eintrag um (Release entsteht bei Bedarf, '' zurück ans Spiel), 409 bei Duplikat;
                                      status erledigt auf einem kauf erledigt den offenen wunsch am selben Ziel mit – Antwort wuenscheErledigt (Stufe 15)
PUT    /api/plans/reorder             Body: { art, orderedIds } – Reihenfolge (5.4); { art, geordnet }; 400 bei fremder Id
DELETE /api/plans/:id                 { id, geloescht, releaseGeloescht, spielGeloescht } – räumt Waisen ab (Abschnitt 5)

GET    /api/review/queue              v_review_offen, paginiert (limit, offset); ein Eintrag je Bildschirm
POST   /api/review/:releaseId/decide  Body: { aktion } – sechs Aktionen aus 8.1; Antwort mit status, planAngelegt, nochOffen
GET    /api/review/progress           { offen, erledigt, gesamt, unentschieden } – unentschieden ist die zweite Runde
```

**Filter auf `/api/games`:** `platform` (seit Stufe 19 **kommagetrennt mehrfach**, `platform=PS4,PS5` – eine ODER-Auswahl; unbekannte Werte fallen einzeln heraus, bleibt nichts übrig, gilt der Filter als nicht gesetzt), `owned` (physisch/digital/beide/keins), `played` (ja/nein), `platinum` (ja/nein/nichtverfuegbar), `playStatus` (die sieben Werte; ein Release ohne Zeile zählt als `nicht_gespielt`), `physicalAvailable` (ja/nein/unbekannt), `search`, dazu `sort` (titel/zuletzt), `limit` (höchstens 100 – die Release-Abfrage bindet eine Id je Spiel, und D1 erlaubt 100 gebundene Werte je Statement; ein größerer Wert wird gekappt, statt mit `D1_ERROR` zu antworten, gemessen am 18.09.2026), `offset`.

Die Filter gelten auf Release-Ebene: Ein Spiel erscheint, wenn **mindestens ein Release alle Filter zugleich** erfüllt. Releases, die nur einen Wunsch tragen (Abschnitt 3), zählen dabei nicht mit und fehlen auch in der Release-Liste des Spiels. `platform=PS4&owned=physisch` heisst also "hat eine PS4-Disc", nicht "hat irgendeine Disc und irgendein PS4-Release". Das gilt auch bei mehreren Plattformen: `platform=PS4,PS5&owned=physisch` heisst "hat eine PS4- **oder** eine PS5-Disc", nicht "hat irgendeine Disc und irgendein PS4/PS5-Release". Unbekannte Filterwerte werden ignoriert, nicht mit `400` beantwortet – ein alter Link soll die Liste zeigen, keine Fehlermeldung. Die Suche ist eine einfache Teilstringsuche im Titel, keine Suche über den Titelschlüssel – mit einer Nachsicht: **Apostrophe werden übergangen**, gerade wie typografische, auf beiden Seiten („assassins" findet „Assassin's Creed", Wunsch des Nutzers vom 19.09.2026). Dieselbe Regel (`suchbar`, `SUCHE_SQL` in `src/domain/titel.ts`) gilt für `/api/games`, die Listen (`suche=`) und „Sammlung prüfen", damit sich die Suchen nicht unterscheiden.

**Zugriffsschutz:** siehe Abschnitt 15.3. Kurz: eine Access-Richtlinie am Worker – da Frontend und API derselbe Worker sind, deckt sie beides in einem ab. Die Maschinen-Endpunkte (`/api/export/backup.json`, `/api/backup/vermerk`) laufen seit Stufe 8 über ein **Access Service Token** und tragen deshalb **keine eigene Token-Prüfung im Worker** (Entscheidung in 15.3).
