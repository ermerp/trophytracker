← [Inhaltsverzeichnis](README.md) · [9 Barcode-Erfassung](09-barcode.md)

## 9.1 Der Scanner am Handy (Nachtrag f1g, 28.11.2026)

Gestaltet wird der Scanner **nur für das Handy** (360 × 800, installierte PWA, sichere Bereiche 37 / 17 px). Der Weg am PC – Laptop-Webcam, ZXing-Fallback – bleibt funktionsfähig, wird aber nicht weiterentwickelt (Entscheidung des Nutzers vom 28.11.2026); geprüft wird dort nur, dass nichts bricht. Anlass ist der zweite vollständige Scan-Durchgang durch die Sammlung (16.4).

**Ruhig statt erklärend.** Die Kopfzeile trägt Zurück und den Zähler „n erfasst". Das Kamerabild hat einen Zielrahmen und **eine** Statuszeile („Barcode in den Rahmen halten", „liest …", „pausiert"); das EAN-Feld (Notnagel, 9) liegt hinter „Code eintippen" im Bild. Auf 360 × 800 mit den sicheren Bereichen passt alles ohne Scrollen: Unterkante des Hauptknopfs 538 px in jedem Entscheidungsfall, erste Zeile „Letzte Scans" 656, Oberkante der Navigation 701 (gemessen am 28.11.2026 mit nachgestellten 37 / 17 px). Braucht eine Karte Platz für Treffer (Suche, Fall 3), wird die pausierte Kamera flacher und die Karte um dasselbe höher; der Hauptknopf bleibt stehen (am Bild abgenommen am 28.11.2026). Bei 360 px wird nichts mit „…" gekürzt außer Titeln in „Letzte Scans".

**Eine Karte je Fall, ein Hauptknopf an derselben Stelle, „×" oben rechts bricht ab** (Überspringen, nichts gespeichert, 9.3):

| Fall | Erkennung | Hauptknopf | leise daneben |
|---|---|---|---|
| 1 | Code bekannt, Disc im Regal (bei einer Hülle alle Spiele) | Weiter | Ist ein anderes Spiel, Zum Spiel |
| 2 | Code unbekannt, Spiel in der Sammlung (eBay-Vorschlag) | Disc erfassen · Plattform, bei mehreren „Disc für n Spiele erfassen" | Andere Plattform, Anderes Spiel, + weiteres Spiel dieser Hülle |
| 3 | Code unbekannt, Spiel fehlt | Anlegen + Disc erfassen | Ohne IGDB, In Sammlung suchen |
| 4 | erfasst | – (kompakter Block mit Rückgängig, ggf. „ins Backlog") | Kamera läuft sofort weiter |
| 5 | Fehler (Netz) | Nochmal versuchen (bei 4xx: Weiter) | – |

Fall 2 ist der häufigste: Am 28.11.2026 hatten 374 Spiele eine Trophäenliste, aber keine Disc (53 Discs erfasst). Bei mehreren Kandidaten und in Fall 3 ist der gewählte Eintrag sichtbar markiert. **Collections (f1h):** In Fall 2 und in der Suche in der Sammlung lassen sich mehrere Spiele ankreuzen; sie bekommen je ein Exemplar mit demselben Code (Abschnitt 3), in einem Schreib-Batch mit allen Ereignissen und erledigten Absichten. Auch bei eindeutigem Vorschlag – ein Titel, der im anderen aufgeht, wie „God of War" in „God of War II" – führt „+ weiteres Spiel dieser Hülle" zur Mehrfachwahl, ebenso vom Erfasst-Block aus (dann zeigt das Mapping auf das neue Spiel, Rückgängig stellt es wieder her). Die Suche hat seit f1h einen Hauptknopf: ein Tipp auf das Plattform-Kennzeichen wählt, der Knopf erfasst. Höchstens 6 Spiele je Hülle (Anweisungen je Aufruf).

**Fall 3 in einem Zug** (Entscheidung vom 28.11.2026): `POST /api/games` mit `igdbId`, dann `POST /api/scan/:ean/assign`. Kennt die Sammlung den IGDB-Eintrag schon (`vorhanden: true`), sagt `releaseNeu`, ob dabei ein Release entstand (`releaseFuerPlattformMitAngabe`); ein fehlender Schlüssel gilt als `false`.

**Rückgängig stellt den Stand vor dem Tipp her** (`scanZurueck`, `frontend/src/scanner.ts`): Absichten wieder öffnen, eine dabei gesetzte Disc-Fassung zurück, Disc löschen, Mapping lösen bzw. ein überschriebenes Mapping wiederherstellen, ein neu angelegtes Release (`DELETE /api/releases/:id`) und ein neu angelegtes Spiel (`DELETE /api/games/:id`) löschen – jeweils mit dem Ereignis im selben Batch (8.5). **Grenzen:** Zeigte ein überschriebenes Mapping auf ein Release ohne Disc, lässt es sich ohne Backend nicht wiederherstellen und wird gelöst. `releaseLoeschen` entfernt danach ein Spiel ohne Release und ohne Listeneintrag mit (`leeresSpielLoeschen`) – auch eines, das schon vorher so dastand. Bis f1g nahm das Rückgängig des Scanners weder die Disc-Fassung noch ein neues Release noch ein überschriebenes Mapping zurück.

**Signale: Farbe, Ton, Vibration** (Entscheidung vom 28.11.2026: vier Muster, eigene Tokens). Der Rahmen des Kamerabilds **bleibt in der Farbe des Falls, solange eine Karte auf eine Entscheidung wartet** (Wunsch des Nutzers vom 28.11.2026), und geht erst neutral, wenn wieder gescannt werden kann; nur „erfasst" leuchtet kurz, weil die Kamera sofort weiterläuft: neuer Code `--text`, schon im Regal `--scan-regal`, erfasst `--scan-erfasst`, Fehler `--gefahr`. `--scan-regal` liegt mit ΔE 14,7 recht nah an `--ps4`; so am Bild abgenommen.

| Fall | Ton | Vibration |
|---|---|---|
| neuer Code (2, 3) | 1320 Hz | 40 ms |
| schon im Regal (1) | 2 × 880 Hz | 30 · 70 · 30 |
| erfasst (4) | 990 → 1480 Hz | 90 ms |
| Fehler (5) | 220 Hz, 0,3 s | 5 × 50 |

Bis f1g erklang nur der Fehlerton; die Töne für erkannte Codes waren mit „Nur sammeln" in 17d verloren gegangen, Vibration gab es nicht. Der AudioContext wird beim ersten Tippen auf der Seite geweckt (`tonBereit`). **Auf dem Gerät des Nutzers geprüft (28.11.2026):** Über den Lautsprecher kommen Ton und Vibration fast gleichzeitig. Über Bluetooth kommt der Ton bei jedem Scan spürbar nach der Vibration – Bluetooth puffert die Ausgabe (typisch 150–300 ms), und früher auslösen geht nicht, weil der Ton erst mit der Antwort des Servers feststeht. **Bewusst nicht ausgeglichen** (Entscheidung des Nutzers vom 28.11.2026): Ein Ausgleich hieße, die Vibration um `outputLatency` zu verzögern, deren Wert bei Bluetooth je Gerät unzuverlässig ist – erst messen (Block „Anzeige"), sonst ein Regler.

**Collection in Fall 3 (f1i, Entscheidung vom 28.11.2026):** Ist der gewählte IGDB-Treffer ein Bundle (`game_type` 3), heißt der Hauptknopf „Spiele der Hülle wählen". `GET /api/igdb/bundle/:id/inhalt` holt den Inhalt (`where bundles = (id)`, Plattformfilter, Timeout 8 s) und sucht ihn über `game.igdb_id` in der Sammlung (23 Zeilen, ein D1-Aufruf); die getroffenen Spiele sind auf der Plattform des Treffers vorab angekreuzt, „Als eigenes Spiel anlegen" steht am Treffer. Trifft nichts oder scheitert die Route (503/502), erscheint die Suche mit dem Reihennamen (`reihenName`). **Gemessen vor dem Bau** an den vier echten Collections des Nutzers: alle vier sind bei IGDB „Bundle", und ihr Inhalt traf 8 von 8 Einzelspielen der Sammlung, keines falsch. Anlass: Zwei Collections waren am 28.11. als eigenes Spiel angelegt worden, weil ihr eBay-Titel die Nummern der Einzelspiele nicht nennt.

**Derselbe Code noch einmal** (f1h): Ein Code löst erst wieder aus, nachdem er 1 s ununterbrochen aus dem Bild war (`frontend/src/wiederholsperre.ts`). Bis dahin blieb der letzte Code gesperrt, bis ein anderer kam – nach „×" ließ sich dieselbe Hülle nicht neu lesen (gemeldet am 28.11.2026); eine reine Zeitsperre von 2 s hätte nach „erfasst" die eigene Karte durch „im Regal" ersetzt.

**Letzte Scans** (Entscheidung vom 28.11.2026): unter der Karte zwei bis drei Zeilen, „alle (n)" öffnet die Liste in derselben Ansicht (Zurück schließt sie). Ergebnis je Code: erfasst, im Regal, abgebrochen, zurückgenommen. Gespeichert **nur auf dem Gerät** (`localStorage`, `frontend/src/scanverlauf.ts`), die letzten 50 – nie in der Datenbank; 9.3 gilt weiter.
