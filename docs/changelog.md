# Changelog

Eine Zeile je Fassung der Spezifikation, neueste zuerst. Die Zahlen und
Begründungen stehen im jeweiligen Abschnitt in [`spec/`](spec/README.md);
hier steht nur, **wann was dazukam**. Vorfälle, aus denen eine Regel entstanden
ist, stehen in [`lehren.md`](lehren.md), Entscheidungen des Nutzers in
[`entscheidungen.md`](entscheidungen.md).

Diese Datei wird **nicht routinemäßig gelesen**.

| Version | Datum | Änderung |
|---|---|---|
| 79 | 09.10.2026 | **Refactoring, Nachtrag c: Typprüfung in der Action.** `npm run typecheck` (src/ und test/) im Job `pruefen` vor `npm test`; Env-Geheimnisse eingecheckt und optional in `src/env.d.ts`, Bindings erzeugt als `CfBindings` – mit und ohne `.dev.vars` je 0 Fehler. 102 Fehler in `test/` aus acht Ursachen geräumt, ohne `any`. Befund: `keine-lecks.spec.ts` prüfte seinen 18e-Fall seit dem 27.09.2026 nicht (16.2, lehren.md) |
| 78 | 09.10.2026 | **Refactoring (finale Stufe 3), Teil 1: Struktur ohne Verhaltensänderung.** `Spieldetail.tsx` als eine Datei je Komponente, `App.css` als 16 Ausschnitte unter `frontend/src/css/` (gebautes CSS byte-identisch), 21 tote Regeln entfernt, Wartungsfenster aus dem Cron-Ausdruck statt als Literal (10.1), Testausgabe 71 → 13 Zeilen, `worker-configuration.d.ts` aus Git (13.3, 15.1, 16.2). **Auf dem Gerät des Nutzers abgenommen** |
| 77 | 09.10.2026 | Nachtrag zur Diät: die Testlücke beim Wartungsfenster als bekannte Altlast bei „Refactoring" vermerkt (16.2), die Entscheidungen zur Diät selbst nachgetragen, und die Regel zu `docs/spec/` um die Prüfung beim Kürzen geschärft |
| 76 | 09.10.2026 | **Beim Wunschlisten-Import blockieren nur offene Wünsche** – die Frage vom 15.09.2026 ist entschieden, am Code ändert sich nichts (8.2). Dabei als **offen** vermerkt: Der Import prüft keinen Besitz, ein erledigter Wunsch blockiert also auch nicht |
| 75 | 09.10.2026 | **Die Fixpunkt-Vermutung zum Refresh-Token ist widerlegt** (gemessen gegen die Produktion): Die Frist rollt mit jeder Erneuerung zehn Tage weiter, der Lauf am 09.10. fiel nicht auf das NPSSO zurück (7.1) |
| 74 | 08.10.2026 | Dokumentation aufgeteilt: Spezifikation nach `docs/spec/`, Versionsgeschichte hierher, Vorfälle nach `lehren.md`, Entscheidungen nach `entscheidungen.md`; CLAUDE.md auf die Regeln gekürzt |
| 73 | 08.10.2026 | **Stufe 21 abgenommen** nach sechs Nachträgen b–g; alle Funktionsstufen durch, offen nur 20f, 20g und die fünf finalen Stufen. Schnittfassungen in 16 bei „Die Sammlung finalisieren" vorgemerkt |
| 72f | 08.10.2026 | Nachtrag 21g: Quelle für „geschnitten oder ungeschnitten" geprüft und verworfen; es bleibt das Store-Signal mit genau einem Fall (7.4) |
| 72e | 08.10.2026 | Nachtrag 21f: ein `302` kann regional sein – der Schritt fragt einmal in `en-gb` nach, Befund `regional` statt `ohne_id` (7.4) |
| 72d | 08.10.2026 | Nachtrag 21e: eine Weiterleitung ist eine Antwort und wird gestempelt; „im PS-Plus-Katalog" überlebt einen fehlenden Kaufknopf; Produkt-Id-Feld leeren löst neu auf (7.4) |
| 72c | 03.10.2026 | Nachtrag 21d: PS3 und Vita werden gar nicht erst gefragt; Nachpflegeliste an der Glocke, Store-Adresse aus dem Browser einfügen (7.4) |
| 72b | 03.10.2026 | Nachtrag 21c: innerhalb der Treffergruppe gewinnt der kürzeste Name (Outcast); AC III Remastered fehlt bei IGDB, nicht im Store (7.4) |
| 72a | 02.10.2026 | Nachtrag 21b, Migration 0032: Auswahl des Store-Schritts als CTE aus zwei Index-Lookups plus Teilindex – 4 statt 430 Zeilen im Leerlauf (7.4) |
| 72 | 02.10.2026 | **Stufe 21: PSN Store-Preise.** Use Case 7 vollständig. Produktseite als Strom gelesen, Produkt-Id löst sich über IGDBs Concept-Id selbst auf, Zuschnitt 79 Releases (7.4) |
| 71 | 02.10.2026 | Die **fünf finalen Stufen** in Abschnitt 16, bewusst ohne Nummer; Reihenfolge gegen den ersten Entwurf gedreht (16.2) |
| 70 | 02.10.2026 | **Stufe 20e abgenommen**: Preise in den Listen, sortierbar, täglicher Takt, beide Kanäle getrennt im Verlauf. Offen bleiben 20f und 20g |
| 69b | 02.10.2026 | Zweiter Nachtrag zu 20e: Sortierung in allen fünf Listen als verankertes Menü mit Richtungspfeil; die Richtung geht in den Vergleicher hinein (5.2) |
| 69a | 02.10.2026 | Nachtrag zu 20e: Sortierung in der Lückenansicht nachgebaut; „physisch nicht gewünscht" entfällt in Block B (5.3) |
| 69 | 02.10.2026 | **Stufe 20e**, Migrationen 0029 und 0030: Gebrauchtpreis an Kaufliste und Wunsch, als Link, sortierbar; Takt täglich, Wartungsfenster auf `*/5 6-8` (36 Aufrufe), Portion 20 Releases; beide Kanäle getrennt im Verlauf |
| 68b | 02.10.2026 | Stufe 20b: vier neue Bedingungen im Titelabgleich nach der Durchsicht der 79 Statuswechsel (7.3) |
| 68a | 02.10.2026 | eBays Aspekt `Spielname` als Ersatz für den Titelabgleich geprüft und verworfen; keine Verhaltensänderung (7.3) |
| 68 | 02.10.2026 | **Stufe 20: Marktdaten aus eBay statt AWIN**, Migration 0028. Händlerfeed verworfen; Preis für 293 statt 0 Releases, 95 % der belegten Discs gefunden; Wikidata als Quelle für „nur digital" verworfen (7.3) |
| 67a | 02.10.2026 | Schema von `trophy`/`trophy_group` und die beiden Stempel nach 4.1b, drei Leserouten in die Routenliste (12). Keine Verhaltensänderung |
| 67 | 02.10.2026 | **Stufe 19b abgenommen**: 18 355 Trophäen in 431 Listen, Anzeige im Spieldetail und Dashboard, Feed aus zwei Quellen |
| 66b | 02.10.2026 | `main` hatte zwei `max-width`-Regeln; die ältere trägt keinen Deckel mehr, die 80 rem wirken jetzt (13) |
| 66a | 01.10.2026 | Breite am Desktop auf **80 rem** (13) |
| 66 | 01.10.2026 | `fuellstand()` zählte mit `COUNT(*)` den ganzen Bestand in der Feed-Route; `offeneListen()` ersetzt ihn, die Route liest 607 statt 18 500 Zeilen (7.7) |
| 65c | 01.10.2026 | Drei Darstellungsfehler aus der zweiten Abnahmerunde: `.stufe` doppelt vergeben (jetzt `.stufenzeichen`), `.balken` als `display: block`, Kopfzeile auf breiten Bildschirmen (13) |
| 65b | 01.10.2026 | „Trophäen je Jahr" steht wieder offen (nächtlicher Zwischenspeicher), jede Säule ist ein Knopf; `.chips` aus der Trophäenliste entfernt (13) |
| 65a | 01.10.2026 | Fünf Nachbesserungen: erspielte versteckte Trophäe bleibt offen, Überschrift nennt „11 von 49", Knopf holt Level sofort, „Trophäen je Jahr" nachts gerechnet, „Letztes Platin" mit echtem Zeitpunkt (7.7, 13) |
| 65 | 01.10.2026 | **Stufe 19b, Teil 2: die Anzeige.** Trophäenliste hängt am Release, wird beim Aufklappen geholt; Feed über `GET /api/feed`; „Trophäen je Jahr" hinter einem Klick (7.7) |
| 64d | 01.10.2026 | Erstbefüllung durchgelaufen: 18 355 Trophäen in 431 Listen, 0 offen. Der Fortschritt zählt den Bestand statt der Listen des Durchlaufs (7.7) |
| 64c | 01.10.2026 | Dritter Abbruch erklärt, Ratenlimit-Vermutung widerlegt: `fetch` ohne Timeout und Portion nach der falschen Grenze. Jetzt `AbortSignal.timeout(30 s)` und vier Listen je Portion (7.7) |
| 64b | 01.10.2026 | Fortschritt und Meldung stehen unter ihrem Knopf; der Ausgang von `POST /api/sync/trophaeen` wird in `app_setting` aufgeschrieben und überlebt ein Neuladen (7.7) |
| 64a | 01.10.2026 | Portionsknopf hielt bei 126 von 431 Listen an: `try` um jede Portion, ein Wiederholungsversuch, Stand wird nach Abbruch neu geladen, `wakeLock` hält den Bildschirm wach (7.7) |
| 64 | 01.10.2026 | **Stufe 19b, Teil 1: die Daten.** Migration 0027 legt `trophy` und `trophy_group` an, beide `WITHOUT ROWID`; zwei Stempel an `trophy_progress` halten den Versuch, nicht den Erfolg (4.1b, 7.7) |
| 63b | 01.10.2026 | Vierte Prototyp-Rückmeldung: die vier Stufen auf Augenhöhe mit der Level-Zahl (2,4 rem). Dabei gefunden: das Tausendertrennzeichen ist eine Umbruchstelle – Zahlen tragen `white-space: nowrap` (13) |
| 63a | 01.10.2026 | Dritte Prototyp-Rückmeldung: die vier Stufen nehmen die Fläche ein (1,6 rem Desktop, 1,1 rem Handy), Umbruch über `min-width` erzwungen (7.7) |
| 63 | 01.10.2026 | Prototyp-Rückmeldung: der Trophäen-Block wird kompakt – Symbol und absolute Zahl neben der Level-Zahl, vier Zeilen statt neun (7.7) |
| 62 | 01.10.2026 | Trophäenliste und Dashboard-Block am Prototyp entschieden: versteckte Trophäen zugedeckt, Sonys Reihenfolge, Level ersetzt den Trophäen-Block, seltenste Trophäe verworfen (7.7, 13) |
| 61 | 01.10.2026 | Inhalt des Prototyps für 19b entschieden; Dauer bis Platin und Zahl der offenen versteckten Trophäen bleiben ausdrücklich offen (7.7) |
| 60 | 01.10.2026 | Seltenheitsstufe und Fortschritt je Trophäe im Umfang; Symbol ist die teuerste Spalte (2,32 von 3,55 MB) und lässt sich nicht verkürzen (7.7) |
| 59 | 01.10.2026 | `trophyEarnedRate` und `trophyRare` nachgemessen (Schwellen 5/15/50 %); Fortschrittszähler gefunden (vier neue Spalten); **50 Fremdanfragen je Worker-Aufruf** in Abschnitt 2 (7.7) |
| 58 | 01.10.2026 | Einzeltrophäen vor dem Bauen gemessen: `npServiceName` ist Pflicht, versteckte Trophäen tragen Namen, 18 % der Listen haben DLC-Gruppen, 940 statt 1 293 Anfragen, kein 429 bei 45 Abrufen (7.7) |
| 57 | 01.10.2026 | Sicherung und Feed der Stufe 19b entschieden: `trophy` in `EXPORT_TABELLEN`, eine erspielte Trophäe wird **kein** `game_event`, der Feed liest aus zwei Quellen (8.5, 14.2) |
| 56 | 01.10.2026 | Zuschnitt der Stufe 19b: keine Rohablage, Erstbefüllung nachts plus Portionsknopf, Gruppen und Level in dieselbe Stufe. Die engere Grenze ist die **Schreibgrenze** von 100 000 Zeilen am Tag (7.7, 15.4) |
| 55 | 01.10.2026 | **Stufe 18f**: Wiederholung für den Spielzeit-Schritt – der Offset bleibt stehen, drei Anläufe wie beim Sync (10.1). `scripts/sicherung-pruefen.sh` kannte `psn_zugang` nicht |
| 54a | 29.09.2026 | **Stufe 19e abgenommen**, am Handy erprobt; `psn_zugang` hat seinen zweiten Eintrag (7.1) |
| 54 | 29.09.2026 | **Stufe 19e: den Zugang erneuern.** Der Kopierschritt lässt sich nicht abschaffen, nur kürzen; das Feld nimmt Wert, JSON oder ganze Seite. `psn_zugang` (Migration 0026) zeichnet auf, wie lange ein Zugang hält; gewarnt wird ab 18 Tagen (7.1) |
| 53b | 29.09.2026 | **Stufe 18e abgenommen.** NPSSO und Refresh-Token sind gemeinsam gestorben, nach 25 Tagen; warum der Refresh-Token vor seiner Frist fiel, ist unbelegt (17) |
| 53a | 28.09.2026 | **Stufe 19d abgenommen** an einem von Hand angelegten Wunsch; kein Eintrag hängt mehr am Spiel (0 von 95) |
| 53 | 28.09.2026 | **Stufe 19d: Wunsch mit Plattform.** „ohne Plattform" entfällt in allen vier Listen; fehlender Schlüssel, `null` und leerer Text sind drei Fälle mit je einem Test; „Freitext" als Kennzeichen (5) |
| 52b | 28.09.2026 | Migration 0025: `game.sort_title` bekommt einen Index – 480 gelesene Zeilen je Abgleich, `rows_read_24h = 1 335 628`. Die Indexregel gilt für **jede** Spalte, über die in einer Schleife gesucht wird (2) |
| 52a | 27.09.2026 | **Stufe 19c abgenommen** nach sechs Runden am Gerät des Nutzers; neu der Block „Anzeige" in den Einstellungen (13) |
| 52 | 27.09.2026 | **Stufe 19c: das Spieldetail.** Neun nie gefüllte Felder verlassen die Oberfläche; Besitz als zwei große Knöpfe je Release; Trophäenstufen immer absteigend; Spielzeit fehlt bei PS3 und Vita ganz; PS-Plus-Zeichen als Wolke mit Kreuz (13) |
| 51b | 27.09.2026 | Zwei offene Entscheidungen für 19b festgehalten (Befüllungsstrategie, Rohablage); Stufen 20 und 21 ausdrücklich nicht vorgezogen (7.3, 7.4, 7.7) |
| 51a | 27.09.2026 | **Stufe 18e deployt**, der Besitz nachgeholt: 54 Kauf- und 156 PS+-Einträge. Die Egress-Vermutung ist widerlegt (7.7) |
| 51 | 27.09.2026 | **Stufe 18e: das Cron-Fenster**, Migration 0024. Zwei Cron-Einträge statt einem; ein Abrufsfehler beendet den Sync nicht mehr (drei Fehlversuche); der Verlauf verdichtet jede gleichartige Arbeit; `{fehlerAm}` statt `{fertigAm}` bei Fehler (10.1) |
| 50b | 27.09.2026 | „Kartei" als zweite Gestaltungslinie verworfen – ein Entwurf, kein Designwechsler (16) |
| 50a | 27.09.2026 | **Stufe 19a abgenommen** |
| 50 | 27.09.2026 | **Stufe 19a: das Dashboard.** `GET /api/stats` (fünf Abfragen in einem Batch, kein PSN-Abruf); Warnung und Information getrennt, Glocke in der Kopfzeile; **höchstens fünf Terme in einem zusammengesetzten SELECT** in Abschnitt 2 |
| 49d | 24.09.2026 | Zwei nachgerechnete Cron-Zahlen ohne Codeänderung: eine Nacht braucht **31** statt siebzehn Aufrufe; zwanzig Verlaufseinträge fassen eine Kaufliste-Nacht nicht; 37 von 36 Aufrufen bei zusammentreffenden Schritten (10.1) |
| 49c | 24.09.2026 | Zwei Zahlen im Cron-Verlauf berichtigt: Sync-Zeile nennt die offenen Rohantworten, Spielzeit-Zeile zusätzlich `geschrieben` (10.1). Nur `cronLogzeile` |
| 49b | 24.09.2026 | Nachträge aus Stufe 19, die der Spezifikation widersprachen: keine Pfeilknöpfe, Notiz nicht auf der Karte, Plattform als Kennzeichen, `theme_color` und `background_color` getrennt (5.4, 13). Neu unter den Risiken: Androids Navigationsleiste ist nicht färbbar (17) |
| 49a | 24.09.2026 | Nachbesserung am Tag des Baus: Filter in zwei Ebenen, Plattform als Box, „Liste importieren" hinter dem Pluszeichen, `viewport-fit=cover` (13) |
| 49 | 24.09.2026 | **Stufe 19: die Oberfläche.** Gestaltungslinie „Vitrine" mit Tokens in `frontend/src/tokens.css`, nur dunkel; untere Leiste mit vier Symbolen ohne Text; Schnellerfassung entfällt; `/api/games` nimmt `platform` kommagetrennt. Dashboard als 19a herausgelöst (13) |
| 48 | 24.09.2026 | Neues App-Symbol: Pokal in einem zu 87 % geschlossenen Fortschrittsring, aus zehn Entwürfen gewählt (13) |
| 47 | 23.09.2026 | **Stufe 18d: der Cron wird les- und aufräumbar.** Verlauf verdichtet Leerlauf und fasst zwanzig statt fünf Einträge; neunter Schritt löscht alte `psn_raw_response` (2,31 von 3,26 MB); Datums-Modifier als Text im Statement (10.1) |
| 46 | 22.09.2026 | **Stufen 17c bis 18c abgenommen**; die beiden offenen Fragen zur Spielzeit-Sortierung sind geschlossen |
| 45 | 22.09.2026 | **Stufe 18c: Spielzeit und digitaler Besitz aus PSN**, Migration 0023. Neue Tabelle `psn_played_title`, `digital_entitlement.herkunft`; zwei Cron-Schritte (Spielzeit täglich, Kaufliste wöchentlich); keine Rohablage (7.7) |
| 44 | 22.09.2026 | Entscheidungen zu 18c: Titel ohne Spielzeit ans Ende, `kauf` schlägt `plus`, PS+ als Momentaufnahme. Der Cron hält die letzten fünf Ausgänge (Migration 0022, 7.7, 10.1) |
| 43 | 22.09.2026 | **Stufe 18 abgeschlossen**: erster vollständiger Nachtlauf, 431 Titel und 368 aufgefrischte Spiele. Einzeltrophäen rücken hinter die Oberflächenstufe und heißen 19b |
| 42 | 21.09.2026 | Zwei neue Stufen geplant, 18c und 19b, nach einer Messung gegen das echte Konto. Beide importieren nichts. Drei gemessene Grenzen im neuen Abschnitt 7.7 |
| 41 | 21.09.2026 | **Stufe 18b: der Cron wird nachprüfbar.** IGDB-Auffrischen tat zwei Nächte nichts; Spiele ohne IGDB-Antwort werden trotzdem gestempelt, Frist als Text im Statement, `try/catch` um die IGDB-Schritte, Ausgang in `app_setting` (10.1) |
| 40 | 21.09.2026 | **Stufe 17d: offene Scans abgeschafft.** „Später", Sammelmodus, `/scans` und der nächtliche Job sind weg; upcitemdb bleibt als Rückfall, live im Worker; `unresolved_scan` bleibt leer stehen (9.2, 9.3) |
| 39c | 21.09.2026 | Sichtbarkeit beim Scannen: ein Treffer aus der Sammlung wird als dieselbe Karte gezeigt wie ein bekannter Code (9.2) |
| 39b | 21.09.2026 | Nachbesserung 17c nach dem ersten Regal-Durchgang: römische Zahlen II–IX in der Wortzerlegung, Rückhalt ab drei Angeboten. 37 von 42 richtig, kein Fehlgriff (9.2) |
| 39a | 21.09.2026 | Nachbesserung 17c: „Verwerfen" neben „Später" im Scanner (9.1) |
| 39 | 21.09.2026 | **Stufe 17c: eBay als EAN-Quelle.** Auflösung beim Scannen statt nachts; Mehrheitsregel über bis zu zehn Angebote, Ballast vor Ziffern. 30 von 30 bekannten Codes richtig (9.2) |
| 38 | 19.09.2026 | **Stufe 18: Cron Trigger und PWA**, Migration 0021. `*/5 3-5 * * *`, je Aufruf genau eine schwere Arbeit (neuer Abschnitt 10.1); PWA mit `vite-plugin-pwa`, `index.html` bewusst nicht im Precache. **Keine PlayStation-Logos oder -Schriftzüge** (13) |
| 37 | 18.09.2026 | **Stufe 17b: offene Scans zuordnen**, Migration 0020. Täglicher GitHub-Job bei upcitemdb, Ansicht `/scans`, Abgleich zur Lesezeit; 22 von 56 Codes eindeutig. eBay als zweite Quelle vertagt |
| 36 | 16.09.2026 | **Stufe 17: Barcode-Scan.** Ansicht `/scannen` über `BarcodeDetector`, Polyfill als Fallback; Auflösungskette ohne externe Quelle; Zuordnen legt Disc und Mapping an und erledigt Kauf/Wunsch (9) |
| 35 | 16.09.2026 | **Stufe 16: Änderungsprotokoll**, Migration 0019. `game_event` mit Quelle je Zeile, geschrieben ausschließlich in `src/db/` im Batch der Änderung; Block „Verlauf" im Spieldetail, Ansicht `/aenderungen` (neuer Abschnitt 8.5) |
| 34 | 16.09.2026 | **Stufe 15: Kaufliste und „Erscheint bald"**, Migration 0018. Ein Wunsch kommt als **Kopie** auf die Kaufliste; Besitz erfassen erledigt Kauf und Wunsch; neue Reihenfolge ab Stufe 16 (5, 16) |
| 33 | 16.09.2026 | **Stufe 14: Lücken**, Migration 0017. `physical_release_status` aus IGDBs `external_games` (nur `unbekannt` → `ja`, 199 von 481); Lückenansicht mit Block B (5.3, 7.6) |
| 32 | 16.09.2026 | **Stufe 13: Änderungserkennung**, Migration 0016. Der Sync vergleicht mit dem Stempel der letzten Durchsicht und legt `neue_trophaeen` und `dlc_erweitert` vor; neue Spalte `reviewed_progress_pct` (4.1, 8.1) |
| 31 | 16.09.2026 | **Nur PlayStation**: IGDB-Einträge ohne nachgewiesene PS3/PS4/PS5/Vita-Plattform sind nirgends ein Treffer, auch nicht ohne Plattformangabe (7.6). Suchfeld in Wunschliste, To-Do und Backlog (5.2) |
| 30 | 16.09.2026 | **Titel aus IGDB**: Ein Spiel ohne Trophäenliste übernimmt beim Verknüpfen den IGDB-Namen, änderbar im Spieldetail (7.6) |
| 29 | 16.09.2026 | Nachbesserung Stufe 12, Migration 0015: To-Do und Backlog sind mit der Bewertung **gekoppelt** (neuer Abschnitt 5.5); die Triage-Aktion „Spiele gerade" geht in „Auf To-Do" auf (sechs Aktionen) |
| 28 | 15.09.2026 | **Stufe 12: To-Do und Backlog**, Migration 0014. To-Do mit manueller Reihenfolge, Backlog mit Kandidaten und „nicht vorgesehen"; Listen-Knöpfe im Spieldetail; Waisen beim Löschen eines Eintrags |

Ältere Fassungen (Stufen 0 bis 11, bis 15.09.2026) sind in der
Spezifikation nie als Versionsnotiz geführt worden. Was sie gebracht haben,
steht in [Abschnitt 16](spec/16-1-abgeschlossene-stufen.md).
