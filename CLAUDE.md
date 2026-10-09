# Trophytracker

Single-User-Webanwendung zur Verwaltung einer PlayStation-Spielesammlung (PS3, PS4, PS5, PS Vita).

**Die Spezifikation steht in [`docs/spec/`](docs/spec/README.md) und ist die maßgebliche Quelle.** Lies den Abschnitt, der zu deinem Feature gehört – der Index sagt, welche Datei welche Nummer trägt. Diese Datei enthält nur, was in jeder Sitzung gilt; die Zahlen und Vorfälle hinter den Regeln stehen dort, nicht hier.

Drei Dateien werden **nicht routinemäßig gelesen**, nur wenn eine Frage dorthin zeigt: [`docs/changelog.md`](docs/changelog.md) (eine Zeile je Fassung), [`docs/lehren.md`](docs/lehren.md) (Vorfälle mit Datum und Zahlen, aus denen die Regeln entstanden sind), [`docs/entscheidungen.md`](docs/entscheidungen.md) (Entscheidungen des Nutzers mit Datum).

## Stack

Cloudflare Worker mit Hono (TypeScript) · Cloudflare D1 (SQLite), Migrations über Wrangler · React + Vite + TypeScript als PWA, Static Assets im selben Worker · Cron Triggers für geplante Jobs · GitHub Actions für schwere Importe · Cloudflare Access als Zugriffsschutz.

## Befehle

```bash
npm run dev                                       # Frontend (Vite), proxyt /api auf :8787
npx wrangler dev                                  # Worker + gebaute Assets, mit lokaler D1
npx wrangler dev --test-scheduled                 # dazu: curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/5+3-5+*+*+*"
npx wrangler d1 migrations create <db> <name>     # neue Migration
npx wrangler d1 migrations apply <db> --local     # lokal anwenden
npx wrangler d1 export <db> --remote --output=backup.sql
npm run build                                     # Frontend nach frontend/dist
npm test                                          # Vitest
MESSWERTE=1 npm test                              # dazu die Lesekosten-Messwerte (sonst still)
```

Migrationen **niemals** von Hand gegen `--remote` anwenden. Das macht ausschließlich der Deploy-Job.

---

## Regeln, die nicht verhandelbar sind

Wenn eine Änderung sie verletzen würde, weise darauf hin, statt sie zu umgehen. Jede ist in der Spezifikation begründet; was es gekostet hat, sie zu lernen, steht in [`docs/lehren.md`](docs/lehren.md).

### Fremddaten und eigene Bewertung nie vermischen

- `trophy_progress` kommt von Sony und wird bei jedem Sync überschrieben, `play_status` ist die Bewertung des Nutzers.
- Der Sync ändert `play_status` **nur** beim allerersten Import eines Titels (100 % → `komplettiert`, >0 % → `am_spielen`). Steht dort schon etwas anderes als `nicht_gespielt`, wandert jede Änderung in `review_queue`.
- Ein gesetztes `trophy_progress.release_id` überschreibt kein automatischer Prozess.
- **Eine Änderung an einer Auswahlregel erreicht nur, was danach frisch aufgelöst wird.** Wer eine korrigiert, sagt dazu, dass Altbestand sie nicht sieht, und baut einen Weg, sie zurückzunehmen.
- **To-Do und Backlog sind mit `play_status` gekoppelt** (5.5) – jeder Schreibpfad läuft über `src/db/kopplung.ts`, der Sync nie. Wer einen neuen Weg auf eine der Listen oder zum Status baut, koppelt dort mit.
- **Besitz erfassen erledigt Kauf und Wunsch** ohne Rückfrage (`absichtenErledigen`, `src/api/ownership.ts`, Abschnitt 5). Jeder neue Weg zu `physical_copy` oder `digital_entitlement` läuft dort durch.
- **Je Release genau eine Disc:** Beide Wege fragen `hatExemplar` und antworten sonst `409`; der Scanner setzt das EAN-Mapping trotzdem. Das Schema erzwingt es nicht – ein Test hält die Regel.
- Ein Wunsch auf der Kaufliste ist eine **Kopie** (`origin='wunsch'`, der Wunsch bleibt offen) – die eine Stelle, an der ein Übergang kein Feld-Update ist.

### Jeder Schreibpfad protokolliert

- Geschrieben wird **ausschließlich in `src/db/`**: Jede Repository-Methode, die Bewertung, Listen, Besitz, Zuordnung, IGDB-Entscheidung oder Release ändert, hängt `EventRepository.statement(…)` in **denselben Batch** – nie eine Route, nie ein zweiter Aufruf danach (8.5).
- Set-basierte Schreiber protokollieren per `events.insertSelect` mit **derselben Bedingung wie das UPDATE, davor im Batch**; ein Ereignis zu einem Löschen läuft **vor** dem DELETE. Für „alt → neu" den alten Wert per Primärschlüssel lesen und bei Gleichheit **kein** Ereignis schreiben. `meta.changes` kommt nur von der eigentlichen Änderung, nie als Summe über den Batch – sonst zählen die Protokollzeilen mit.
- **Die Nebenwirkung gehört an den Schritt, nicht an seinen Auslöser** – ein zweiter Weg zum Schritt erbt sie sonst nicht.
- Die Quelle (`nutzer` / `sync` / `igdb` / `import` / `feed`, `migration` reserviert) wird aus vorhandenen Feldern abgeleitet (`quelleAusHerkunft`, `quelleAusMatch`), nicht durch die Routen gereicht; `feed` heißt **eBay-Marktdaten** mit `detail='ebay'`, nicht Händlerfeed. Der Satz für die Oberfläche entsteht zur Lesezeit in `src/domain/ereignis.ts` und wird nie gespeichert – eine neue Ereignisart kommt in `EREIGNIS_ARTEN` und bekommt einen Satz (Test hält das fest).
- Der Sync protokolliert nur Erkanntes, IGDB nur Entscheidungen und Statuswechsel, nichts bei unverändertem Stand. Der Store-Preis protokolliert nur seine **Zuordnung** (`release_geaendert`, Quelle `sync`, `detail='store'`), nie den Preis. **Kein Ereignis je Preis und keines je Trophäe:** Preise haben mit `price_snapshot` ihre eigene Historie, und bei einer erspielten Trophäe hat niemand etwas geschrieben.
- **Nicht jede Zeile im Dashboard-Feed ist ein Ereignis.** Der Feed liest aus zwei Quellen; das Änderungsprotokoll behält seine **eine** Quelle und sein Keyset über `id`. Wer den Feed erweitert, erweitert nicht das Protokoll.

### Keine PlayStation-Marken in der Gestaltung

- Keine PlayStation-Logos, -Symbole (Dreieck/Kreis/Kreuz/Quadrat, PS-Monogramm) oder -Schriftzüge in Icons, Grafiken oder Gestaltungselementen – auch nicht angedeutet (Abschnitt 13). Geschützte Marken, das Repository ist öffentlich.
- Plattform- und Dienstnamen als **Text** sind Daten („PS4", „PS Plus", in enger Zeile „PS+" neben dem Wolkenzeichen); ein *gezeichnetes* „PS+" wäre ein Monogramm. Dasselbe gilt für Schrift: **keine an PlayStation angelehnte Hausschrift** – Sonys SST ist lizenziert, Saira steht stattdessen da.
- Das App-Symbol ist ein eigener Pokal in einem Fortschrittsring (`frontend/public/icon.svg`).

### Gestaltung kommt aus Tokens

- Farben, Abstände, Radien und Schriften stehen in `frontend/src/tokens.css` und werden nur als `var(--…)` benutzt. Kein Literalwert in `frontend/src/css/`, keine Systemfarbe wie `Canvas`.
- Die Anwendung ist **nur dunkel**; ein zweiter Tokensatz ist eine Entscheidung des Nutzers, keine Ergänzung nebenbei.
- **Ein Klassenname ist eine Zusage über seinen Kontext.** Die Regeln liegen in `frontend/src/css/`, eine Datei je Ansicht; `App.css` ist nur die `@import`-Liste, und **ihre Reihenfolge ist die Kaskade** (13.3). Vor jedem neuen Namen über **alle** Dateien greppen – zehn Selektoren kommen in mehreren vor; wer eine bestehende Klasse mitbenutzt, prüft ihre Regeln ganz, nicht nur die Farbe. Ein neuer Abschnitt kommt in die Datei seiner Ansicht, nicht in `basis.css` oder `textbausteine.css`: Die beiden sind global.
- **Ein neues Bedienelement ist fast immer schon da:** verankertes Menü (`.menueanker` + `.menuetafel`), Chip mit Tafel (`Chips`), Auswahltafel (`ZustandTafel`, `QuellenTafel`), Sortierung (`Sortierung.tsx`). Native Felder bleiben richtig, wo sie ein **Formular** bedienen.

### Nur PS3, PS4, PS5 und PS Vita

- Spiele anderer Plattformen dürfen nirgends auftauchen – nicht in Suche, Kandidaten, Listen oder Zuordnung.
- Ein IGDB-Eintrag ist nur ein Treffer, wenn er eine der vier Plattformen **nennt**; fehlende Angabe ist kein „vielleicht" (7.6). Jede neue Datenquelle bekommt dieselbe Prüfung und wird gegen die echten Verknüpfungen gemessen, bevor sie live geht.

### Dreiwertige Felder nicht zu Booleans vereinfachen

- `release.physical_release_status` ist `ja` / `nein` / `unbekannt`. Fehlende Daten sind `unbekannt`, niemals `nein`.
- Ein `nein` setzt ausschließlich der Nutzer von Hand; automatische Quellen setzen **nur** `unbekannt → ja` und fassen weder ein `nein` noch ein bestehendes `ja` an. `physical_source` sagt, wer es war (Abschnitt 3).
- **Für `nein` gibt es keine Quelle, und das ist kein Mangel an Recherche:** „nur digital" ist keine stabile Tatsache, drei Quellen sind gemessen und verworfen (7.3). Was geht, ist eine begründete Abwesenheit als Hinweis, nicht als Wert in der Spalte.
- In der Oberfläche heißen fehlende Werte **„unbekannt"**, nie „0", „–" oder „nicht verfügbar"; im CSV-Export ist das **leere Feld** die Entsprechung (14.4). Was eine Quelle für eine Plattform gar nicht erhebt (Spielzeit bei PS3 und Vita), steht **gar nicht** da.
- **Beim Sortieren in beide Richtungen:** Ein umgekehrter Vergleicher stellt „unbekannt" nach vorn – die Richtung gehört **in** den Vergleicher hinein, nicht um ihn herum (5.2).
- Ein freiwilliges Eingabefeld bleibt **leer**, statt vorbelegt zu werden. Die eine Ausnahme ist die Plattform eines Wunsches (`neuestePlattform`, Abschnitt 5) – als **konkreter Wert** im Feld („PS4"), nie als Platzhalter, und änderbar. **„Ohne Plattform" ist dabei keine Wahl:** Ein Wunsch hängt immer an einem Release, weil erst die Plattform über Lücke, Kauf und Preis entscheidet.
- **Fehlenden Schlüssel und ausdrückliches `null` auseinanderhalten:** Im JSON sind das `undefined` und `null`, und ein `?? "standard"` behandelt beide gleich – es schreibt still einen Wert, wo der Aufrufer „keiner" gesagt hat. Je ein Test für beide Fälle.

### Kein vollautomatisches Matching

- PSN-Trophäentitel und IGDB-Treffer werden **vorgeschlagen**. Nur ein eindeutiger Treffer mit hoher Ähnlichkeit darf automatisch zugeordnet werden; alles andere landet in einer Zuordnungsansicht.
- Beim Wunschlisten-Import gibt es keinen Freitext-Fallback – Zeilen ohne Treffer gehen in die IGDB-Suche, und ein Eintrag ohne Zuordnung entsteht nur auf ausdrückliche Anweisung.
- Vorschlagslisten sind **geordnet**, nicht in der Lieferreihenfolge der Quelle: Schlüsseltreffer, dann Hauptspiel-artige Typen vor DLC, dann die Plattform des Spiels (`ordneKandidaten`, 7.6).

### Zuordnungen müssen korrigierbar sein

- Was halb- oder vollautomatisch entsteht, muss sich in der Oberfläche zurücknehmen lassen: umbenennen, auftrennen, einzeln statt als Gruppe übernehmen.
- Das gilt auch für Zwischenentscheidungen: Ein „überspringen" ist eine Entscheidung und darf ein Neuladen überstehen. Und ein „Rückgängig" stellt den Stand **vor** der Aktion vollständig her, auch das, was der Schreibpfad nebenbei entfernt hat.

### Berechnetes nicht speichern

- Sortierungen (Favorit, Kritikerwertung, Erscheinungsdatum) werden bei der Abfrage aus gespeicherten Bestandteilen gebildet, nie als Rang abgelegt – die frühere Rangformel ist seit Migration 0013 weg (5.2).
- „Nur digital gespielt" und „Lücke" sind Views, keine Spalten.
- **Eine bewusste Ausnahme:** „Trophäen je Jahr" wird nachts gerechnet und abgelegt (7.7) – gespeichert ist dort eine Summe über unveränderliche Geschichte, kein Rang, und der Zwischenspeicher ist eine Beschleunigung, keine Quelle.

### CPU-Grenze respektieren

Der Free Tier erlaubt **10 ms CPU** pro Aufruf. D1-Abfragen und Netzwerk-Wartezeit zählen nicht mit, eigenes Rechnen schon.

- **Cron Trigger helfen nicht** – dieselbe 10-ms-Grenze, die 30 Sekunden gibt es erst im Bezahlplan. Der Schutz kommt aus dem Entwurf: Arbeit pro Aufruf begrenzen, Fortschritt in der Datenbank halten (`cronSchritt`, `src/sync/cron.ts`, 10.1) – genau **eine** schwere Arbeit je Aufruf.
- **Zwei Cron-Einträge:** PSN `*/5 3-5` (36 Aufrufe) und Wartung `*/5 6-8` (36), weil ein Fenster die Arbeit nicht mehr trug. Wer etwas hinzufügt, hängt es in das Fenster, in das es gehört, und rechnet gegen **dessen** Aufrufe – nie zwei Arbeiten in einen Aufruf.
- **Ein Schritt, der ruht, sagt warum.** Erfolg und Fehler dürfen nie dieselbe Marke hinterlassen (`{fertigAm}` gegen `{fehlerAm}`), sonst legt ein gescheiterter Lauf sich selbst still. Und der Ausgang wird **aufgeschrieben**, nicht nur zurückgegeben – eine Meldung, die nur im Browser stand, ist nach dem Neuladen fort.
- Schwere Importe laufen in einer GitHub Action. Maßstab ist die **Blockierdauer der Quelle, nicht das Wort „extern"**: Deshalb läuft die eBay Browse API live im Worker (0,3 s, 5 000/Tag, `src/ebay/client.ts`) und upcitemdb als Rückfall (`src/ean/upcitemdb.ts`), das hart drosselt, aber nie wirft – ein Fehler heißt „kein Titel".
- Abgleiche bereiten den Bestand **einmal** vor, nicht je Eingabe: 430 Spieltitel × 56 offene Scans wären 24 000 Zerlegungen in einem Aufruf (`vorbereiten` in `src/domain/scan-titel.ts`). Rohantworten seitenweise speichern, nicht am Stück parsen.
- **Ein Aufruf darf höchstens 50 Fremdanfragen machen** (Free Tier; Paid: 10 000). Eine Wall-Clock-Grenze gibt es nicht, solange der Client verbunden bleibt – portioniert wird wegen dieser Zahl.
- **Nicht immer die Obergrenze entscheidet, sondern die Dauer:** Eine Portion, die 50 Anfragen gerade einhält, kann zehn Sekunden in **einer** Anfrage sein. Jeder lange Abruf trägt `AbortSignal.timeout(…)` – `fetch` wartet von sich aus unbegrenzt, und ein Hänger wird sonst nie zu einem Fehler.
- **D1 erlaubt höchstens fünf Terme in einem zusammengesetzten SELECT** – sechs `UNION ALL`-Teile antworten mit `too many terms in compound SELECT` (SQLITE_ERROR 7500), auch lokal. Stattdessen `SUM(bedingung)` und `GROUP BY` in einem Batch (`src/db/stats.ts`).
- **D1 erlaubt 100 gebundene Werte je Statement.** Ein `INSERT … VALUES (…), …` über eine ganze Seite passt nicht; in Stücke teilen. Dasselbe gilt für `IN (?,…)` – `/api/games` kappt `limit` deshalb auf 100.

### Zeilenlese- und Schreibgrenze respektieren

D1 zählt **gelesene Zeilen** (Scans, nicht Ergebniszeilen); der Free Tier erlaubt 5 Millionen am Tag, danach antwortet jede Abfrage bis Mitternacht UTC mit `D1_ERROR`. **Die Schreibgrenze von 100 000 Zeilen am Tag ist die engere**, sobald eine Stufe den Bestand einmal durchschreibt – Index-Schreibungen zählen mit.

- **Jeder Fremdschlüssel hat einen Index – und jede Spalte, über die in einer Schleife gesucht wird**, auch wenn sie keiner ist. Wer eine Tabelle mit `REFERENCES` anlegt, legt den Index in derselben Migration an.
- **Korrelierte Unterabfragen nur über indizierte Spalten.** Als Tabellenscan multipliziert sich der Unterselect mit der Zeilenzahl.
- **Kein `OR` über zwei Spalten in einer Unterabfrage**, auch wenn beide indiziert sind – SQLite weicht aus und liest alle Einträge der Art je Zeile. Stattdessen zwei Unterabfragen (`NOT EXISTS … AND NOT EXISTS …`, `COALESCE((…), (…))`), eine `UNION` zweier Index-Lookups mit den Filtern **innerhalb** der Teilabfragen, oder eine CTE aus zwei Lookups plus Teilindex (7.4).
- **Keyset statt `(? IS NULL OR id < ?)`:** Eine optionale Bedingung gehört als eigener Text ins Statement.
- **Kein Bind in `datetime('now', ?)`** – der Modifier gehört als Text ins Statement, die Zahl aus einer Konstanten. Das ist **Stil, keine Erklärung eines Ausfalls**: Die Begründung dafür war eine Vermutung, die sich als falsch erwies.
- `test/lesekosten.spec.ts` misst gegen einen Bestand in Produktionsgröße über `meta.rows_read`. Neue Listenabfragen kommen dort dazu, bevor sie deployt werden – **Schreibschritte genauso**, und bei Cron-Abfragen auch der **Leerlauf**: Ein Schritt, der nur feststellt, dass nichts zu tun ist, läuft 36-mal je Nacht mit.
- **Gemessen wird die Route, nicht die Abfrage.** Wer eine Route misst, zählt **alles**, was sie tut; eine Frage nach „ist etwas offen?" beantwortet die kleine Tabelle, nicht die große.
- `npx wrangler d1 info trophytracker` zeigt `rows_read_24h` – ein **rollierendes 24-Stunden-Fenster, kein Tageszähler**; über einer Million ohne Import stimmt etwas nicht.

### Geheimnisse sind im Typ gekapselt

- NPSSO, Refresh- und Access Token wandern ausschließlich als `Geheimnis` (`src/domain/secret.ts`) durch den Code: `toString()` und `toJSON()` redigieren, der Klartext ist nur über `.offenlegen()` erreichbar.
- Sie dürfen **nie** in einer API-Antwort, einer Fehlermeldung oder im Log erscheinen, auch nicht gekürzt – `observability.logs` ist eingeschaltet, was einmal drin steht, bleibt liegen. Daraus folgt: Die Antwort des PSN-Token-Endpunkts wird nie in `psn_raw_response` geschrieben, dort landen ausschließlich Trophäen-Seiten. `test/keine-lecks.spec.ts` prüft das über alle Routen, auch in den Fehlerpfaden.
- IGDB-Client-Secret, Twitch-Token, eBay-Cert-ID und Application-Token nehmen denselben Weg und leben nur im Speicher der Worker-Instanz, nie in D1 (7.6). Fehlende IGDB-Secrets oder ein Ratenlimit betreffen ausschließlich die IGDB-Routen (503), nie die übrige Anwendung.
- **Maschinen-Endpunkte tragen keine eigene Token-Prüfung:** `/api/export/*` und `/api/backup/*` laufen über ein Access Service Token, und Access steht vor dem ganzen Worker. Kein Bearer-Token im Code (15.3).

### Rohablage nur, wo der Abruf die einzige Aufzeichnung ist

- `psn_raw_response` gilt für **einen** Abruf, die Trophäenseiten des Syncs. Dort treffen drei Merkmale zusammen: Der Abruf ist teuer, die Normalisierung komplex, und die Antwort ist die **einzige** Aufzeichnung dessen, was Sony an diesem Tag gesagt hat.
- Deshalb hat der Sync zwei Phasen (`psn_sync_run.phase`): erst `abruf`, dann `normalisierung`, beide mit begrenzter Arbeit je Aufruf; `POST /api/sync/normalize` wiederholt die zweite ohne PSN.
- **Fehlt eines der drei Merkmale, wird nicht roh abgelegt** – die Daten wären kein Beweisstück, sondern Ballast in jeder wöchentlichen Sicherung. Ohne Rohablage liegen IGDB, eBay-Marktdaten, Spielzeit, Kaufliste, Einzeltrophäen und Store-Preise. **Wer eine neue Quelle anbindet, prüft die drei Merkmale, statt der Liste einen Namen hinzuzufügen.**

### Titelnormalisierung ist geteilte Logik

- `src/domain/titel.ts` hält `titelSchluessel` (aggressiv, nur zum Vergleichen) und `anzeigeTitel` (zurückhaltend, für `game.title`). Beide werden für Sync, IGDB, Import, Barcode und Store gebraucht – Änderungen wirken auf alle Abgleiche.
- `trophy_progress.title_name` bleibt immer der Rohwert von Sony. `game.title` eines Spiels **mit** Trophäenliste bleibt der daraus normalisierte Titel; ohne Trophäenliste übernimmt es beim Verknüpfen den IGDB-Namen, nur dann, nie beim Auffrischen – was der Nutzer umbenennt, bleibt (7.6).
- **`game.sort_title` ist abgeleitet und veraltet still.** Nach jeder Änderung an der Normalisierung `POST /api/games/schluessel-neu-berechnen` aufrufen, sonst findet die automatische Zuordnung falsche oder gar keine Kandidaten. Wo der Titel ohnehin vorliegt, den Schlüssel frisch berechnen statt `sort_title` zu lesen – die Spalte ist nur für SQL-Lookups da.

### Keine echten PSN-Daten als Testdaten

- Die Rohantworten in der Produktionsdatenbank enthalten die vollständige Spielhistorie des Nutzers, und dieses Repository ist öffentlich. Testdaten werden nachgebaut (`test/trophy-fixtures.ts`, `scripts/testdaten.mjs`), nie kopiert.
- Dasselbe gilt für die Wunschlisten in `wunschlisten/` (per `.gitignore` ausgeschlossen) und für Messskripte gegen echte Daten: Sie bleiben im Scratchpad, ins Repository kommen nur Zahlen.

### Datenbankzugriff kapseln

Kein `env.DB.prepare()` direkt in Route-Handlern – alle Zugriffe laufen über die Repository-Schicht in `src/db/`. Das hält einen späteren Wechsel zu Turso, Postgres oder lokalem SQLite auf wenige Dateien begrenzt.

---

## Sicherheit

- Niemals committen: NPSSO, PSN-Refresh-Token, IGDB/Twitch-Zugangsdaten, eBay-Cert-ID, API-Bearer-Token, Cloudflare-API-Token.
- Lokale Geheimnisse gehören in `.dev.vars`, produktive in Cloudflare Secrets. In der `.gitignore` müssen stehen: `.dev.vars`, `.wrangler/`, `*.sql`.
- Das Repository ist öffentlich, das Backup-Repository privat – ein Datenbank-Dump darf unter keinen Umständen hier landen. `account_id` und `database_id` sind dagegen Bezeichner, keine Zugangsdaten, und dürfen in der Konfiguration stehen.

---

## Arbeitsweise

- **Eine Stufe aus Abschnitt 16 pro Branch**, Name `stufe-<n>-<kurzbeschreibung>`, Merge nach `main` immer mit `--no-ff` – dann nimmt `git revert -m 1 <merge>` eine ganze Stufe zurück. **Nach dem Merge steht man auf `main`**: Der nächste Branch wird angelegt, *bevor* die erste Datei angefasst wird. Nachträge beginnen bei `b` und gehören in die Spezifikation, nicht nur in den Branch-Namen.
- **Dokumentation gehört zur Aufgabe.** Fünf Orte, jeder mit genau einer Aufgabe:
  - [`docs/spec/`](docs/spec/README.md) – der **aktuelle Stand**. Der betroffene Abschnitt wird **ersetzt, nicht ergänzt**: Was heute gilt, steht da, nicht wie es dazu kam. Messwerte und Begründungen, die eine Entscheidung tragen, bleiben – **beim Kürzen wird gegen die alte Fassung geprüft, welche Zahlen und Datumsangaben dabei verschwinden**, und was verschwindet, steht im Bericht. Offene Entscheidungen bleiben ausdrücklich als offen markiert. Keine Datei über rund 15 KB.
  - [`docs/changelog.md`](docs/changelog.md) – **eine Zeile je Stufe oder Nachtrag**, kein Fließtext in einem Dateikopf.
  - [`docs/lehren.md`](docs/lehren.md) – Vorfälle mit Datum und Zahlen, aus denen eine Regel entstanden ist. Die Regel steht hier und verweist dorthin.
  - [`docs/entscheidungen.md`](docs/entscheidungen.md) – Entscheidungen des Nutzers: Datum, Entscheidung, Abschnitt.
  - `README.md` – nur ändern, wenn sich **Einrichtung, Betrieb oder Funktionsumfang** ändern.

  **Jede Tatsache steht an genau einer Stelle**, andere Stellen verweisen. Abschnittsnummern sind im Code verankert (322 Verweise): aufteilen ja, umnumerieren nein.
- **Nutzerdaten ändert nur der Nutzer, in der Anwendung.** Ergebnisse einer Messung oder eines Skripts werden nie über die API oder `d1 execute --remote` eingetragen – auch nicht nach Freigabe im Chat. Fehlt der Weg in der Oberfläche, wird er gebaut. **Auch ein GET kann schreiben:** vor dem Prüfen in den Code sehen und mit Wegwerf-Daten arbeiten, nie mit echten. Erlaubt bleibt der Prüfaufruf nach dem Deploy, der seine Testzeile selbst wieder löscht.
- **Vor größeren Aufgaben einen Plan vorlegen**, insbesondere bei allem, was Migrationen oder externe Schnittstellen berührt.
- **Migrationen abwärtskompatibel halten** – sie laufen vor dem Deployment, der alte Worker läuft noch. Spalten hinzufügen ist unkritisch, Umbenennen braucht zwei Deployments. Eine neue Tabelle gehört zugleich in `EXPORT_TABELLEN` oder `NICHT_EXPORTIERT` (`src/db/export.ts`) und braucht einen Blick auf `EXPORT_ORDNUNG` – eine `WITHOUT ROWID`-Tabelle hat kein `rowid`.
- **Datenmigrationen weisen ihre Wirkung nach.** Schreibt oder löscht eine Migration Zeilen, prüft der Deploy-Job vorher die Sicherung (INSERT-Zeilen im Dump gegen `COUNT(*)`, Abbruch bei Abweichung) und protokolliert danach die betroffene Zeilenzahl neben der Erwartung. Nur Zahlen ins Log, nie Inhalt – und die Zahlen gehören in den Bericht an den Nutzer.
- **Views mit ihren Basistabellen zusammen ändern.** Fasst eine Migration eine Tabelle an, auf der eine View steht, wird die View in **derselben** Migration gedroppt und neu angelegt: Ein Tabellen-Neuaufbau und `DROP COLUMN` scheitern sonst mit `error in view …`, und in der Pipeline wäre das ein roter Deploy mit halb angewendeter Migration.
- **Views listen ihre Spalten explizit auf, nie `SELECT *`** – der eine Fall, in dem SQLite still danebengreift: Die Ergebnismenge wächst nach einem `ADD COLUMN` lautlos mit, während die Definition in `sqlite_master` unverändert bleibt (`test/migration.spec.ts` hält die Regel). Und **Seeds immer als `INSERT OR IGNORE`**, nicht wegen Idempotenz, sondern damit ein erneuter Lauf einen vom Nutzer angepassten Wert nie zurücksetzt; kein `CREATE TABLE IF NOT EXISTS`, das verdeckt ein abweichendes Schema.
- **Nach jedem Deploy die Produktion selbst prüfen.** Ein grüner Action-Lauf beweist nur, dass die Schritte durchliefen, und **der Asset-Hash nur, dass die Fassung ankommt, nicht dass sie wirkt** – bei einer Gestaltungsänderung gehört das **Bild** zur Prüfung. Die betroffenen Routen und den Asset-Hash über den Access Service Token abrufen (`CF-Access-Client-Id` / `-Secret`, Werte in `.dev.vars`) und das Ergebnis berichten, statt den Nutzer nachsehen zu lassen.
- **Den Workflow-Lauf über den Commit suchen, nie über „der neueste".** Direkt nach dem Push hat GitHub den neuen Lauf oft noch nicht angelegt, und `gh run list --limit 1` liefert den vorherigen. Richtig: `gh run list --json databaseId,headSha` und die Zeile nehmen, deren `headSha` zu `git rev-parse HEAD` passt. Logs über `gh api repos/ermerp/trophytracker/actions/jobs/<job-id>/logs` – `gh run view --log` liefert in Version 2.46 stillschweigend nichts.
- **Was berichtet oder zur Entscheidung vorgelegt wird, kommt aus der Sache selbst, nicht aus einem Ersatz.** Testausgabe nicht filtern (`npm test | tail -3` schneidet die Fehlschläge weg – auf `Test Files`/`Tests` greppen oder ungefiltert lesen), wer berichtet, was ein Schritt tun wird, führt **dessen** Abfrage aus, statt sie nachzubauen, und eine Zahl, auf der eine Entscheidung des Nutzers ruhen soll, wird **vor** der Frage gemessen statt geschätzt.
- **Testen, was Logik ist, nicht was Glue ist.** Lohnend und ohne Datenbank testbar: Titel-Normalisierung und Matching, Trophäen-Normalisierung aus Roh-JSON, Wunschlisten-Parser. Set-basierte Regeln über den ganzen Bestand sind dagegen bewusst SQL (CPU-Grenze) und werden im Repository-Test gegen die lokale D1 geprüft, mit nachgebauten Zeilen.
- **Abgleichlogik gegen die echten Daten prüfen, bevor sie gebaut wird.** Die Produktivdatenbank ist lesend verfügbar (`wrangler d1 execute --remote --json`), und ein Domain-Modul lässt sich mit `npx esbuild <datei> --format=esm` transpilieren und in Node gegen den echten Bestand laufen lassen – ohne echte Daten ins Repository zu holen.
- **Ein automatischer Schreibpfad wird vor dem ersten Lauf Zeile für Zeile angesehen, nicht nur gezählt.** Wer einen Schritt baut, der Nutzerdaten ohne Rückfrage ändert, legt die **vollständige Liste des ersten Laufs** vor – dem Nutzer, und sich selbst. **Im Aggregat sieht man die Wirkung, nicht die Ursache**, und eine Stichprobe trifft die Fehlgriffe nur zufällig.
- **Was als Vermutung gebaut wurde, wird auch als Vermutung aufgeschrieben.** Werden mehrere Maßnahmen gegen einen Fehler zugleich ausgeliefert, ist hinterher keine davon belegt.
- **Oberfläche wird angesehen, nicht nur gebaut.** Vor dem Deploy die geänderten Ansichten rendern: headless Chrome (`~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome --headless=new --window-size=390,844 --screenshot=…`) gegen `wrangler dev`, die lokale D1 mit **erfundenen** Zeilen gefüllt. **Immer drei Breiten: 360×800, 390×844 und 1280×900** – 360 ist das Gerät des Nutzers, und was bei 390 *gerade eben* passt, schneidet dort ab. Dass etwas genau passt, ist kein Bestand. Ab 48 rem ist das Layout ein anderes; die Desktop-Fassung wird mitgeprüft.
- **Eine neue Ansicht bekommt vorher einen Prototyp:** statische HTML mit `frontend/src/tokens.css` und echten Summen, dem Nutzer geöffnet, entschieden, bevor Code entsteht – die tragenden Entscheidungen entstehen im Bild.
- **Ein gemeldeter Darstellungsfehler wird erst belegt, dann behoben**, und **`env(safe-area-inset-*)` ist headless null, auf dem Handy nicht** – was daran hängt, ist auf dem Entwicklungsrechner nicht nachstellbar. Die echten Werte zeigt der Block „Anzeige" in den Einstellungen; nachstellen lässt sich die Geometrie, indem die `env()`-Regeln im Browser durch feste Pixelwerte ersetzt werden.
- **Deutsche Bezeichner in Daten und Oberfläche** (Statuswerte, Anzeigetexte), englische im Code. **Bei Unklarheiten in der Spezifikation nachfragen**, statt eine Annahme zu treffen und weiterzubauen.

## Kontext

Die PSN-Anbindung ist inoffiziell und kann jederzeit brechen. Fehler beim Sync dürfen die Anwendung nie unbenutzbar machen: vorhandene Daten bleiben stehen, der Zustand wird angezeigt, der Nutzer kann ein neues NPSSO eintragen.
