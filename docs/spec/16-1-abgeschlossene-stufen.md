← [Inhaltsverzeichnis](README.md)

## 16. Umsetzungsreihenfolge – abgeschlossene Stufen

Jede Stufe ist einzeln lauffähig und deploybar und hatte ihren eigenen Branch.
Eine Zeile je Stufe: Inhalt, Migration, Abnahme. Was in einer Stufe *entschieden*
wurde, steht in [`entscheidungen.md`](../entscheidungen.md); was dabei
*schiefgegangen* ist, in [`lehren.md`](../lehren.md); die Fassungsgeschichte im
[Changelog](../changelog.md).

**Alle Funktionsstufen sind durch.** Offen sind nur 20f, 20g und die fünf
finalen Stufen – [16.2](16-2-offene-stufen.md).

| Stufe | Inhalt | Migration | Abgenommen |
|---|---|---|---|
| 0 | Repos, Worker mit Hono, Frontend-Gerüst als Static Assets, leere D1, Deploy-Action, Cloudflare Access | – | – |
| 1 | Vollständiges Schema, Repository-Schicht in `src/db/` | 0001 | – |
| 2 | PSN-Auth, NPSSO-Eingabe, Rohabruf | 0002 | – |
| 3 | Vita als vierte Plattform, Normalisierung als zweite Sync-Phase, Trophäenliste | 0003, 0004 | – |
| 4 | `game`/`release`, Titelnormalisierung, Gruppenvorschläge, Zuordnungsoberfläche | 0005 | – |
| 5 | Besitz erfassen (physisch und digital), Sammlungsansicht mit Filtern – **Use Case 1** | – | – |
| 6 | `play_status`, Statuswechsel im Spieldetail, Abweichungsansicht – **Use Case 2** | 0006 | – |
| 7 | Prüfliste, zunächst nur `erstimport` – **Use Case 8**, der Datenbestand steht | 0007, 0009 | – |
| 8 | Backup-Action ins private Repo, CSV-Export – **Use Case 13** | – | – |
| 9 | IGDB-Anbindung: Cover, Suche, Kritikerwertung, Erscheinungsdaten | 0010 | – |
| 10 | `plan_entry`, Wunschliste, Favoriten – **Use Case 4** | 0011 | – |
| 11 | Wunschlisten-Import mit Suche, Ansicht „Ohne Zuordnung" – **Use Cases 9 und 12** | 0012, 0013 | – |
| 12 | To-Do und Backlog mit Sortierung und Kandidaten, Kopplung an die Bewertung (5.5) – **Use Case 5** | 0014, 0015 | 16.09.2026 |
| 13 | Änderungserkennung im Sync: `neue_trophaeen`, `dlc_erweitert` – **Use Case 8** vollständig | 0016 | 16.09.2026 |
| 14 | `physical_release_status` aus IGDB und von Hand, Lückenansicht mit Block B, Lücken verwerfen – **Use Case 3** | 0017 | 16.09.2026 |
| 15 | Kaufliste aus Lücken und Wünschen, „Erscheint bald", Erfassen erledigt Kauf und Wunsch – **Use Cases 6, 10, 11** | 0018 | 16.09.2026 |
| 16 | Änderungsprotokoll je Spiel: `game_event` mit Quelle je Eintrag, Block „Verlauf", Ansicht „Änderungen" (8.5) | 0019 | 16.09.2026 |
| 17 | Barcode-Scan: `/scannen` mit Kamera, Polyfill `barcode-detector`, Auflösungskette, „Spiel anlegen" (9) | – | 19.09.2026 |
| 17b | Offene Scans zuordnen: Titel über einen nächtlichen GitHub-Job, Abgleich zur Lesezeit, Ansicht `/scans` | 0020 | 19.09.2026 |
| 17c | eBay als EAN-Quelle, **live beim Scannen**; Mehrheitsregel und Ballast-vor-Ziffern im Abgleich (9.2) | – | 21.09.2026 |
| 17d | Offene Scans abgeschafft; upcitemdb wird Live-Rückfall im Worker (9.3) | – | 21.09.2026 |
| 18 | Cron Trigger `*/5 3-5` mit einem Schritt je Aufruf (10.1), PWA mit Offline-Lesezugriff (13) | 0021 | 22.09.2026 |
| 18b | Der Cron wird nachprüfbar, nachdem das IGDB-Auffrischen zwei Nächte nichts tat (418 von 477 Spielen überfällig): Stempel auch ohne IGDB-Antwort, `try/catch` um die IGDB-Schritte, Ausgang in `app_setting` (10.1) | – | 22.09.2026 |
| 18c | Spielzeit und digitaler Besitz aus PSN: `gamelist/v2` und Kaufliste, Abgleich über `titelSchluessel`, nur ergänzend (7.7) | 0023, 0025 | 22.09.2026 |
| 18d | Der Cron wird les- und aufräumbar: Verlauf verdichtet, zwanzig Einträge, alte `psn_raw_response` gelöscht (10.1) | – | – |
| 18e | Das Cron-Fenster: **zwei** Einträge, Wiederholung nach Abrufsfehler, Verdichtung mit Spanne, `{fehlerAm}` (10.1) | 0024 | 29.09.2026 |
| 18f | Wiederholung auch für den Spielzeit-Schritt: der Offset bleibt stehen, drei Anläufe (10.1) | – | – |
| 19 | Oberfläche: Gestaltungslinie „Vitrine" mit Tokens, vier Symbole in der Leiste, Reiter, Chips, Startseite `/start` (13) | – | – |
| 19a | Dashboard an der Stelle der Startseite: `GET /api/stats`, Warnung und Information getrennt, Glocke (13) | – | 27.09.2026 |
| 19b | Einzeltrophäen je Spiel: Definition, Stand, Seltenheit mit Stufe, Fortschrittszähler, Gruppen, Trophäen-Level; Erstbefüllung nachts plus Portionsknopf (7.7) | 0027 | 02.10.2026 |
| 19c | Spieldetail neu gebaut: Besitz als zwei Knöpfe je Release, neun nie gefüllte Felder raus, Trophäenstufen absteigend (13) | – | 27.09.2026 |
| 19d | Wunsch mit Plattform: „ohne Plattform" entfällt in allen vier Listen, „Freitext" als Kennzeichen (5) | – | 28.09.2026 |
| 19e | Zugang erneuern: Knopf, Zwischenablage, `npssoAusText`; Frühwarnung ab 18 Tagen; `psn_zugang` zeichnet die Lebensdauer auf (7.1). Der erneuerte Zugang trägt `expires_in` bis 28.11.2026 – der zweite Eintrag der Zeitreihe, der erste steht mit 25 Tagen als `gestorben` darin | 0026 | 29.09.2026 |
| 20 | **Marktdaten aus eBay statt AWIN**: Gebrauchtpreis je Release, `unbekannt → ja` bei geprüftem Treffer, Ausbleiben als Hinweis für Block B (7.3) – **Use Case 7**, Teil 1 | 0028 | 02.10.2026 |
| 20b | Abgleich geschärft nach Durchsicht der 79 Statuswechsel: vier Bedingungen, fünf Fehlgriffe beseitigt (7.3) | – | 02.10.2026 |
| 20c | Der Marktstand zählt Releases statt Angebotszeilen (323 gemeldet, 239 richtig) | – | 02.10.2026 |
| 20d | Block B der Lückenansicht bekommt einen eigenen Schalter – zugeklappt war er praktisch unauffindbar (5.3) | – | 02.10.2026 |
| 20e | **Preise in den Listen**: Gebrauchtpreis an Kaufliste und Wunsch als Link, `sort=preis` in fünf Listen über ein verankertes Menü; Takt täglich, Wartungsfenster `*/5 6-8`, Portion 20 Releases; beide Kanäle im Verlauf (7.3) | 0029, 0030 | 02.10.2026 |
| 21 | **PSN Store-Preise**: Neupreis der digitalen Fassung, „im PS-Plus-Katalog", Angebote mit Grundpreis; Produkt-Id über IGDBs Concept-Id aufgelöst (7.4) – **Use Case 7** vollständig. Stand bei der Abnahme: 65 Releases mit Preis, Nachpflegeliste leer, `rows_read_24h` 191 324 | 0031 | 08.10.2026 |
| 21b | Der Leerlauf der Auswahl: CTE aus zwei Index-Lookups plus Teilindex, 4 statt 430 gelesene Zeilen (7.4) | 0032 | 08.10.2026 |
| 21c | Innerhalb der Treffergruppe gewinnt der kürzeste Produktname (*Outcast*, 49,99 statt 14,99 €) (7.4) | – | 08.10.2026 |
| 21d | PS3 und Vita ohne jeden Abruf; Nachpflegeliste an der Glocke, Store-Adresse einfügen (7.4) | – | 08.10.2026 |
| 21e | `302` gegen „nicht lesbar" getrennt und gestempelt; „im PS-Plus-Katalog" überlebt einen fehlenden Kaufknopf (7.4) | – | 08.10.2026 |
| 21f | Ein `302` kann regional sein: einmal `en-gb` nachfragen, Befund `regional` statt `ohne_id` (7.4) | – | 08.10.2026 |
| 21g | Keine Quelle für „geschnitten oder ungeschnitten"; es bleibt das Store-Signal mit genau einem Fall (7.4) | – | 08.10.2026 |

Drei Migrationen hängen an keiner Funktionsstufe: **0008** und **0011** sind die
Indizes aus dem Ausfall vom 13.09.2026, **0022** ist der `cron_verlauf` aus der
Nachbesserung vom 22.09.2026. Bei den Stufen 0 bis 11 ist kein Abnahmedatum
festgehalten worden; ab Stufe 12 ist es durchgängig vermerkt.

### Warum diese Reihenfolge

Fünf Stellen weichen von den Use-Case-Nummern ab, jede aus einem Grund, der
weiter gilt:

- **Stufe 0 steht vor allem anderen.** Deployment-Pipeline und Zugriffsschutz
  nachträglich einzuziehen heißt, jede bis dahin gebaute Route erneut
  anzufassen.
- **Die Triage (7) kommt früh**, direkt nachdem `play_status` existiert. Sie
  macht aus rohen Trophäendaten einen brauchbaren Bestand; alles danach – To-Do,
  Backlog, Lücken – arbeitet auf ihrem Ergebnis.
- **Das Backup (8) kommt früh**, direkt nach der Ersteinrichtung. Ab da steckt
  Arbeit in der Datenbank, die nicht zurückkommt: Die Trophäen holt PSN wieder,
  die eigenen Bewertungen nicht.
- **Die Änderungserkennung (13) kommt später als die Prüfliste selbst.** Sie
  braucht erst zu existieren, wenn ein zweiter Sync stattgefunden hat.
- **Die Lücken (14) kommen spät**, obwohl Use Case 3 niedrig nummeriert ist. Sie
  hängen an `physical_release_status`, und der ist erst sinnvoll, wenn die
  Sammlung steht.

**Das Änderungsprotokoll (16) rückt vor den Scanner**, weil es fast jeden
Schreibpfad anfasst: Alles, was danach entsteht – Scanner, Cron-Sync, Feed –,
protokolliert von Anfang an, statt nachgerüstet zu werden. Jeder neue Schreiber
hängt sein Ereignis über `EventRepository.statement` in seinen eigenen Batch
(8.5).

**Die Oberfläche (19) steht vor den Preisstufen.** 20 und 21 hängen an
inoffiziellen Quellen und können lange offen bleiben – so lange soll die
Oberfläche nicht provisorisch bleiben.

### Stand der Use Cases

Alle vierzehn sind erfüllt. Use Case 7 (Preise) war mit Stufe 20 zur Hälfte und
mit Stufe 21 vollständig abgedeckt; Use Case 11 (unveröffentlichte Titel) hat
seit Stufe 18 den täglichen Statuswechsel im Cron.

Zwei Dinge, die lange als Sperre dastanden, haben sich beim Messen aufgelöst:
Stufe 20 hängt seit dem 02.10.2026 an keiner externen Freigabe mehr – der
eBay-Zugang läuft seit 17c –, und die Vorbedingung „`release.psn_product_id` ist
bei 0 von 490 Releases gefüllt" war keine, weil die Id aus IGDBs Concept-Id und
der Concept-Seite des Store entsteht (7.4). Inoffiziell bleibt die Quelle, aber
es ist eine gerenderte Webseite ohne Anmeldung, und die `robots.txt` des Store
sperrt sie nicht.

Die aus Stufe 14 offen gebliebenen **249 Releases** mit unbekannter Disc-Fassung
füllt Stufe 20 aus eBay nach. IGDB belegt Disc-Fassungen nur positiv, über Amazon-Artikelnummern;
die 249 teilen sich in 208 mit Händlereinträgen ohne Medium, 13 mit Disc auf einer anderen
PS-Plattform, 13 nur auf fremden Plattformen, 11 nur digital und 3 ohne Eintrag. Die damals vorgemerkte Option „14b" (MobyGames)
ist erledigt: Sie ist seit 2024 kostenpflichtig, und für „nur digital" gibt es
ohnehin keine verlässliche Quelle, weil die Eigenschaft nicht stabil ist
([lehren.md](../lehren.md)).
