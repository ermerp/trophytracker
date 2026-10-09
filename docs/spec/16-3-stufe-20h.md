← [Inhaltsverzeichnis](README.md)

## 16. Stufe 20h – Angebotskorrektur (Bauplan)

Die nächste Teilstufe. Branch `stufe-20h-angebot-verwerfen`, von `main`, **angelegt bevor die
erste Datei angefasst wird**; Merge mit `--no-ff`. Warum sie vorgezogen ist und was sie löst:
[16.2](16-2-offene-stufen.md).

Diese Datei ist der Bauplan, nicht der Stand – sie wird beim Abschluss der Stufe durch den
Stand ersetzt, der dann in [6](06-marktdaten.md), [7.3](07-3-ebay.md),
[12](12-api-routen-extern-und-sync.md) und [8.5](08-5-aenderungsprotokoll.md) gehört.

### Der tragende Entwurfsschritt: nichts löschen, nichts markieren

Die Idee vom 02.10.2026 sagt „sein Punkt aus dem Verlauf **gestrichen**". Wörtlich wäre das
ein `DELETE` in `price_snapshot` – und damit wäre das „Rückgängig" unmöglich, das CLAUDE.md
für jede halbautomatische Entscheidung verlangt: Es stellt den Stand **vor** der Aktion
vollständig her, auch das, was der Schreibpfad nebenbei entfernt hat.

**Ein Punkt ist stattdessen gestrichen, *weil* seine Angebotskennung auf der Sperrliste des
Releases steht.** Das ist eine Bedingung beim Lesen, kein zweiter gespeicherter Zustand
(„Berechnetes nicht speichern"). Drei Folgen:

- „Rückgängig" ist eine **gelöschte Zeile in der Sperrliste**; alle Punkte sind augenblicklich
  zurück. Keine Kopie, keine Sonderbehandlung.
- `price_snapshot` bleibt reine anhängende Historie – dieselbe Eigenschaft, auf der die
  Entscheidung „Verdichtung nur beim Lesen" ruht (16.2).
- **Das Diagramm aus 20f und der Alarm aus 20g müssen den Filter beide anwenden.** Das ist die
  eine Stelle, an der dieser Entwurf teurer ist als ein `DELETE`; dafür ist es ein Lookup über
  `release_id` auf eine Tabelle mit wenigen Zeilen.

### Migration 0033

Vier Teile in einer Migration, **abwärtskompatibel** – der alte Worker läuft weiter und liest
die neuen Spalten nur nicht.

1. `ALTER TABLE market_offer ADD COLUMN ebay_item_id TEXT;`
2. `ALTER TABLE price_snapshot ADD COLUMN ebay_item_id TEXT;`
3. Die Sperrliste:

```sql
CREATE TABLE market_offer_verworfen (
  release_id    INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  ebay_item_id  TEXT NOT NULL,
  verworfen_am  TEXT NOT NULL,
  PRIMARY KEY (release_id, ebay_item_id)
);
```

Der Primärschlüssel ist zugleich der Index, über den der Filter liest – ein zusätzlicher
Index auf `release_id` wäre dieselbe führende Spalte und damit nur Schreibaufwand. **Kein
`WITHOUT ROWID`**, damit der Export `ORDER BY rowid` behält und `EXPORT_ORDNUNG` unberührt
bleibt (`src/db/export.ts`).

4. **Backfill** von `market_offer.ebay_item_id` aus der URL – das Präfix
   `https://www.ebay.de/itm/` ist 24 Zeichen lang:

```sql
UPDATE market_offer
   SET ebay_item_id = substr(substr(url, 25), 1, instr(substr(url, 25), '?') - 1)
 WHERE source = 'ebay' AND url LIKE 'https://www.ebay.de/itm/%?%';
```

**Der Ausdruck ist am 09.10.2026 lesend gegen die Produktion geprüft** (als `SELECT`): 370
Zeilen, **370 davon zwölfstellig und reine Ziffern** – kein Sonderfall. Dabei ein Befund, der
die Schlüsselwahl trägt: Es sind nur **350 verschiedene Kennungen**. **20 Angebote sind
gleichzeitig das günstigste für zwei verschiedene Releases** – ein Bündel oder dieselbe
Fassung, die auf zwei Plattform-Releases passt. Daraus folgt:

- Die Sperrliste ist **je Release**, nicht global. Ein Verwerfen für das PS4-Release darf
  dasselbe Angebot beim PS5-Release nicht stillschweigend mitnehmen – der Nutzer hat über
  *einen* Preis entschieden.
- `market_offer.ebay_item_id` bekommt **keinen** UNIQUE-Index: Dieselbe Kennung steht
  rechtmäßig in zwei Zeilen.

**Das ist eine Datenmigration und weist ihre Wirkung nach** (CLAUDE.md): Der Deploy-Job prüft
vorher die Sicherung (`scripts/sicherung-pruefen.sh`, INSERT-Zeilen gegen `COUNT(*)`) und
protokolliert danach die betroffene Zeilenzahl neben der Erwartung. **Erwartung: 370.** Die
Zahl gehört in den Bericht an den Nutzer, nicht nur ins Log.

**Für `price_snapshot` gibt es keinen Backfill** – dort steht keine URL. Die **1 282
Altzeilen bleiben ohne Kennung** und sind nur über den Preis zu treffen; das steht als
Kommentar in der Migration, damit es später niemand für einen Fehler hält.

**Die Views müssen mit.** `v_luecken` zählt ihre Spalten auf, und die Kennung muss in der
Oberfläche ankommen: `DROP VIEW v_kaufkandidaten; DROP VIEW v_luecken;` und beide neu –
**v_kaufkandidaten zuerst weg, weil sie auf v_luecken steht**, genau das Muster aus Migration
0029. Neue Spalte in beiden: `COALESCE(mh.ebay_item_id, mm.ebay_item_id) AS
gebrauchtpreis_item_id`, aus **demselben** Lookup wie Preis, Anbieter und Link. Die beiden
`ALTER TABLE` allein hätten die Views nicht angefasst (Präzedenz: Migration 0010 und 0030);
die neue Spalte tut es.

### Die Kennung durch den Code

| Datei | Änderung |
|---|---|
| `src/ebay/client.ts` | `legacyItemId` aus `itemSummaries` lesen, Rückfall auf die Zahl aus `itemWebUrl`. Ein Angebot ohne Kennung bleibt **gültig**, ist aber nicht verwerfbar – ein Fall für `null`, nicht für ein Verwerfen des Angebots |
| `src/domain/markt.ts` | `MarktAngebot` bekommt `itemId: string \| null` |
| `src/db/markt.ts` | `angebotSetzen` und `verlaufSchreiben` schreiben die Kennung mit. `source_product_id` bleibt `kanal:releaseId` – **nicht** auf die Item-Id umstellen, sonst entstehen genau die Wegwerfzeilen, die Abschnitt 6 verbietet |
| `src/db/plan.ts`, `src/db/games.ts` | je ein `COALESCE(mh.ebay_item_id, mm.ebay_item_id)` in den vorhandenen Preis-Blöcken – dieselbe Form wie Preis und Link, **kein neuer Join** |

### Der Filter

`guenstigstesGeprueft` (`src/domain/markt.ts`) bekommt `verworfen: ReadonlySet<string>` und
überspringt jedes Angebot, dessen `itemId` darin steht – als **erste** Prüfung vor den sechs
Bedingungen aus [7.3](07-3-ebay.md), weil sie die billigste ist. Das nächste gültige Angebot
wird damit von selbst das günstigste; es braucht keine Sonderlogik.

`marktSchritt` (`src/sync/markt.ts`) lädt die Sperrliste **einmal je Portion**, nicht je
Release: ein `SELECT release_id, ebay_item_id FROM market_offer_verworfen WHERE release_id IN
(?,…)` mit höchstens 20 Binds – innerhalb der 100-Bind-Grenze – und baut daraus eine Map.
Dieselbe Begründung wie bei `vorbereiten`: Der Bestand wird einmal vorbereitet, nicht je
Eingabe.

### Die zwei Routen

In `src/api/markt.ts` – die Datei gibt es, und 503 bei fehlenden Zugangsdaten ist dort schon
die Regel (15.3). Sie kommen in den Routenkatalog [12](12-api-routen-extern-und-sync.md).

**`POST /api/markt/verwerfen`**, Rumpf `{ releaseId, itemId }`. Die Kennung **wird
mitgeschickt**, nicht aus der Datenbank gelesen: Hat der Nachtlauf das Angebot inzwischen
ersetzt, antwortet die Route **409** statt stillschweigend das falsche zu verwerfen.

1. Ein Batch über `src/db/markt.ts` – geschrieben wird **ausschließlich in `src/db/`**:
   `INSERT OR IGNORE` in die Sperrliste **plus** `EventRepository.statement(…)` im
   **denselben** Batch. Kein zweiter Aufruf danach (8.5).
2. Danach der Neuabruf: zwei eBay-Suchen für dieses eine Release und `ergebnisSchreiben` –
   **derselbe Pfad wie im Cron**, nicht ein zweiter. `leerSetzen` setzt `in_stock = 0`, falls
   das verworfene Angebot das einzige war; der Preis bleibt stehen, `v_luecken` liest ihn dann
   nicht mehr. Jeder Abruf trägt `AbortSignal.timeout(…)`.
3. Die Antwort nennt den neuen Preis, damit die Liste ihn sofort zeigt.

**`POST /api/markt/verwerfen/ruecknahme`** nimmt es zurück: eine Zeile aus der Sperrliste
löschen, **Ereignis vor dem DELETE** im selben Batch (Regel für set-basierte Schreiber), und
derselbe Neuabruf – sonst stünde die Liste bis zur nächsten Nacht auf dem Ersatzangebot.

**Neue Ereignisart** `angebot_verworfen` in `EREIGNIS_ARTEN` (`src/domain/ereignis.ts`), mit
Satz für die Oberfläche; ein Test hält fest, dass jede Art einen hat. Quelle **`nutzer`** – es
ist eine Entscheidung des Nutzers, nicht ein Befund des Feeds –, `detail = 'ebay'`.

### Die Oberfläche

**Ein Bedienelement, nicht vier.** `frontend/src/Preis.tsx` ist schon die eine Stelle für alle
vier Vorkommen (Lücken, Kaufliste, Absichten, Spieldetail-`ReleaseKarte`). Der Preis bleibt
ein Link; daneben das **verankerte Menü**, das es schon gibt (`.menueanker` + `.menuetafel`)
mit „Angebot verwerfen" – „ein neues Bedienelement ist fast immer schon da" (CLAUDE.md). Kein
neuer Klassenname, ohne vorher über **alle** Dateien in `frontend/src/css/` zu greppen.

**Offen, im Bild zu entscheiden:** wo die Rücknahme steht. Vorschlag ist eine Zeile unter dem
Preis im Spieldetail („1 Angebot verworfen · zurücknehmen"), weil nur dort Platz für eine
Zusatzzeile ist – in den Listen wäre es eine fünfte Angabe in einer Zeile, die auf 360 px
schon voll ist.

### Tests

- `test/ebay-fake.ts`: liefert `legacyItemId` mit – alle anderen Tests hängen daran, und ohne
  sie wäre jede Testzeile kennungslos und der Filter nie wirklich geprüft.
- `test/markt.spec.ts`: `guenstigstesGeprueft` überspringt eine verworfene Kennung und nimmt
  das nächstgünstigste; ein Angebot mit `itemId: null` bleibt wählbar.
- `test/markt-sync.spec.ts`: Verwerfen und Neuabruf schreiben das Ersatzangebot, der Verlauf
  bekommt einen neuen Punkt, **die alten Punkte bleiben stehen**; die Rücknahme stellt den
  Stand her. Und: **ein Verwerfen setzt niemals ein `ja` zurück** – ein bestehendes `ja` wird
  nicht angefasst (Abschnitt 3).
- `test/lesekosten.spec.ts`: die neuen Routen **und** der Sperrlisten-Lookup im Cron-Schritt,
  gegen 430 Listen. Gemessen wird die **Route**, nicht die Abfrage. Der heutige Wert des
  Schritts ist 940 Zeilen je Aufruf (7.3); der Lookup darf ihn nicht wesentlich heben, und er
  läuft 24-mal je Nacht mit.
- `test/keine-lecks.spec.ts`: die neuen Routen, auch in ihren Fehlerpfaden.
- `test/migration.spec.ts`: `market_offer_verworfen` steht in `EXPORT_TABELLEN` – es ist eine
  **Entscheidung des Nutzers**, die kein Sync zurückbringt, genau das Kriterium, mit dem
  `game_event` exportiert wird (14.2). Die Views zählen ihre Spalten auf, nie `SELECT *`.
- **Nachweis, dass die Tests prüfen:** für den Filter und für die Lesekosten-Probe je ein
  absichtlich eingebauter Defekt, der Fehlschlag gezeigt, dann zurückgebaut. Testausgabe
  ungefiltert lesen, nie `| tail`.

### Abnahme

1. `npm run typecheck`, `npm test` ungefiltert, `MESSWERTE=1 npm test` für die Lesekosten.
2. `npx wrangler d1 migrations apply trophytracker --local`, dann `npx wrangler dev` gegen
   eine lokale D1 mit **erfundenen** Zeilen (`scripts/testdaten.mjs`) – echte Angebote kommen
   nicht in den Test (15.1).
3. Headless Chrome auf **360×800, 390×844 und 1280×900**: Preis mit Menü in allen vier
   Ansichten, dazu der Zustand „alle Angebote verworfen" (Preis `unbekannt`, Rücknahme
   sichtbar). Die Bilder werden **angesehen**, nicht nur erzeugt.
4. Migration **niemals** von Hand gegen `--remote` – das macht der Deploy-Job. Den Lauf über
   `gh run list --json databaseId,headSha` und `git rev-parse HEAD` finden, nie über „der
   neueste".
5. Nach dem Deploy die Produktion selbst prüfen (Access Service Token aus `.dev.vars`): die
   betroffenen Routen, der Asset-Hash und **die Backfill-Zahl aus dem Job-Log gegen die
   Erwartung 370**. Ein Prüfaufruf, der schreibt, räumt seine eigene Zeile wieder weg;
   verworfen wird nichts an echten Daten.
6. In der Nacht danach `npx wrangler d1 info trophytracker` für `rows_read_24h` und
   `cron_verlauf` für die Auslastung des Wartungsfensters ([10.1](10-1-cron.md)).
