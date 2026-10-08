← [Inhaltsverzeichnis](README.md)

## 14. Backup und Export (Use Case 13)

### 14.1 Was Cloudflare selbst bietet

- **Time Travel** (`wrangler d1 time-travel`) stellt die Datenbank auf einen Zeitpunkt zurück. Gut gegen fehlerhafte Migrationen und versehentliche Massenlöschungen.
- **`wrangler d1 export`** erzeugt jederzeit einen vollständigen SQL-Dump.

Beides liegt beim selben Anbieter wie die Datenbank. Gegen einen Bedienfehler hilft es, gegen ein gelöschtes Konto oder eine versehentlich gelöschte Datenbank nicht. Auf "wie kann ich sicher sein" ist das deshalb keine vollständige Antwort.

### 14.2 Wöchentliche Sicherung ausserhalb von Cloudflare

`.github/workflows/backup.yml` läuft sonntags um 03:17 UTC – bewusst nicht zur vollen Stunde, dort staut GitHub die Cron-Jobs – und ist zusätzlich über `workflow_dispatch` von Hand auslösbar. Die Kopie landet im **privaten** Repository `trophytracker-backup`:

1. `wrangler d1 export --remote --output=backup.sql`
2. `GET /api/export/backup.json` mit dem Service Token `github-backup` holen; enthält die Antwort keine Spiele, bricht der Lauf hier ab – vor jedem Schreiben
3. Dump prüfen: `scripts/sicherung-pruefen.sh` hält die `INSERT`-Zeilen je Tabelle gegen `COUNT(*)` der Datenbank, `scripts/dump-pruefen.sh` prüft ihn auf Klartext-Zugangsdaten. Beide Skripte benutzt auch der Deploy-Job (15.2), damit es nur eine Prüfung gibt
4. Beide Dateien und eine kurze `README.md` ins private Repo kopieren und **nur bei Änderung** committen
5. `POST /api/backup/vermerk` mit Zeitpunkt und Commit – auch bei einem Lauf ohne Änderung

Kostenlos, versioniert, unabhängig vom Cloudflare-Konto. Git liefert die Historie mit, du kannst also auf jeden beliebigen Wochenstand zurück.

Zwei Formate mit Absicht: Der SQL-Dump ist die technisch exakte Sicherung zum Wiedereinspielen (`wrangler d1 execute --file=backup.sql`). Die JSON-Fassung bleibt lesbar und auswertbar, auch wenn es das Projekt eines Tages nicht mehr gibt – bei einer privaten Sammlung mit jahrelanger Historie ist das der eigentliche Wert.

**Umfang von `backup.json`:** `{ exportiertAm, schemaVersion, tabellen }` mit den **19 Fachtabellen** `game`, `release`, `physical_copy`, `digital_entitlement`, `trophy_progress`, `play_status`, `plan_entry`, `review_queue`, `ean_mapping`, `unresolved_scan`, `market_offer`, `price_snapshot`, `app_setting`, `psn_sync_run`, `game_event` (8.5 – Entscheidungen des Nutzers, die kein Sync zurückbringt), `psn_played_title`, `psn_zugang` (nur Zeitpunkte, kein Token – die Zeitreihe ist nach einem Verlust nicht wiederherstellbar) sowie `trophy` und `trophy_group` (seit Stufe 19b: Fremddaten, aber nicht billig wiederzubeschaffen – eine Wiederherstellung kostete 862 PSN-Anfragen, eine Erstbefüllung 940; der Dump wächst dadurch um rund 3–4 MB je Woche). **Sieben Tabellen stehen ausdrücklich in `NICHT_EXPORTIERT`:** `psn_credentials` (Chiffrate und IVs), `psn_raw_response` (Rohdaten, gross, im SQL-Dump ohnehin enthalten), `d1_migrations` (Wranglers Buchführung), `igdb_candidate` und die drei `wishlist_import*` (jederzeit neu erzeugbar). `schemaVersion` ist der Name der höchsten angewendeten Migration. Die Liste steht als `EXPORT_TABELLEN` in `src/db/export.ts`; ein Test hält fest, dass **jede** Tabelle der Datenbank entweder exportiert oder ausdrücklich ausgenommen ist – eine Tabelle aus einer künftigen Migration kann so nicht stillschweigend ungesichert mitfahren.

**Der Vermerk steht in `app_setting`**, unter `backup_letzter_erfolg_am` und `backup_letzter_commit`. Kein eigenes Feld und keine eigene Tabelle: Es sind zwei Werte, die beim Wiedereinspielen mitkommen sollen. Ein Lauf ohne Commit gilt als Erfolg – „geprüft, nichts Neues" heisst, dass die Sicherung lief, nicht dass sie ausfiel.

Das Datum der letzten erfolgreichen Sicherung steht in den Einstellungen; bis es das Dashboard gibt, warnt der Hinweisblock der Sammlungsansicht (Abschnitt 13) bei **mehr als acht Tagen** oder wenn noch nie gesichert wurde. Acht statt sieben, weil der Lauf wöchentlich ist: Ein Tag Luft verhindert eine Warnung, die sonst jede Woche von allein erscheint. Ein Backup, von dem man nicht weiss, ob es läuft, ist kein Backup.

**Eine Ausfallursache, die kein rotes Log hinterlässt:** GitHub deaktiviert geplante Workflows in Repositories, die 60 Tage lang keine Aktivität hatten, und schickt dem Besitzer eine E-Mail. Das trifft zu, sobald das Projekt fertig ist und niemand mehr committet – also genau dann, wenn die Sicherung am wichtigsten wird. Dagegen hilft kein Workflow, sondern nur die Altersanzeige. Sie ist der Grund, warum es sie gibt.

### 14.3 Wiederherstellung

**Der Dump lässt sich nicht unverändert einspielen.** Das ist das Ergebnis der Probe vom 14.09.2026 und der Grund, warum dieser Abschnitt länger ist als der eine Befehl, der hier früher stand.

**Der Befund.** `wrangler d1 execute --file=backup.sql` gegen eine frische Datenbank scheitert mit

```
no such table: main.release
```

`d1 export` schreibt die Tabellen in der Reihenfolge von `sqlite_master`. Migration 0003 hat `release` neu aufgebaut – `release_neu` anlegen, alte Tabelle droppen, umbenennen –, wodurch ihr Eintrag dort ans Ende rutschte. Im Dump entsteht `release` deshalb erst in Zeile 1515, während schon in Zeile 467 `INSERT INTO "physical_copy"` läuft und die Tabelle für die Fremdschlüsselprüfung braucht. **Neun Tabellen verweisen auf `release`.**

Der Fehler steckte seit Stufe 3 im Backup und wäre ohne die Probe erst im Ernstfall aufgefallen. Jeder künftige Tabellen-Neuaufbau erzeugt ihn erneut – der Neuaufbau ist SQLites Standardweg für Constraint-Änderungen (siehe die Regel zu Views in `CLAUDE.md`).

**Die Lösung** steht als `scripts/dump-ordnen.mjs` im Repository, nicht als Anleitung: Der Ernstfall ist der schlechteste Moment, sich eine Reihenfolge zusammenzusuchen. Zwei Teile:

1. **Schema vor Daten.** Alle `CREATE TABLE` zuerst. Ein Fremdschlüssel auf eine noch nicht existierende Tabelle ist beim Anlegen erlaubt; SQLite löst ihn erst beim Zugriff auf.
2. **Fremdschlüsselprüfung während des Imports aus**, danach `PRAGMA foreign_key_check` über den fertigen Bestand. Die `INSERT`-Anweisungen bleiben in Dump-Reihenfolge, also Kinder vor Eltern. Sie topologisch zu sortieren wäre die Alternative – sie müsste aber bei jedem Schemawandel nachgezogen werden, und geprüft würde am Ende dasselbe. Der Nachlauf prüft es in einem Schritt und über *alle* Beziehungen.

Indizes und Views kommen zum Schluss: Sie stehen auf Tabellen, die dann existieren, und ein Index über leere Tabellen aufzubauen und anschliessend zu füllen ist der langsamere Weg.

Der vollständige Ablauf mit Befehlen steht in der README. Er endet nicht beim Einspielen, sondern beim Vergleich: Zeilenzahlen aller Tabellen gegen die Produktion, `foreign_key_check` ohne Treffer, Views und Indizes vollzählig.

**Probe durchgeführt am 14.09.2026.** Dump 910.717 Byte, 1.762 `INSERT`-Anweisungen, 17 Tabellen, 3.632 geschriebene Zeilen. Alle 17 Tabellen, 7 Views und 18 Indizes stimmen mit der Produktion überein; `PRAGMA foreign_key_check` meldet null Verletzungen. Einzige Abweichung: `app_setting` 6 gegen 4 – der Dump entstand um 09:24:57, der Backup-Vermerk schrieb `backup_letzter_erfolg_am` und `backup_letzter_commit` acht Sekunden später. Die Tabelle steht in der README.

`scripts/dump-ordnen.mjs` ist durch `test/dump-ordnen.spec.ts` abgedeckt – einschliesslich der Fälle, an denen eine naive Zerlegung scheitert: Semikolon im Spieltitel, maskiertes Hochkomma (`'Assassin''s Creed'`), Semikolon im Kommentar.

### 14.4 CSV-Export

`GET /api/export/:liste.csv` für Sammlung, Wunschliste, To-Do, Backlog, Kaufliste, Lücken und Trophäen. Jeweils die Ansicht, die auch die Oberfläche zeigt, mit Kopfzeile und Semikolon als Trennzeichen für Excel im deutschen Gebietsschema. Eine unbekannte Liste beantwortet die Route mit `404`.

**Drei Festlegungen, alle wegen Excel** (`src/domain/csv.ts`, geprüft in `test/csv.spec.ts`):

- **Semikolon** als Trennzeichen. Im deutschen Gebietsschema ist das Komma das Dezimaltrennzeichen; mit Komma als Feldtrenner zerfällt „12,99" in zwei Spalten.
- **BOM** (`\ufeff`) am Anfang. Ohne sie liest Excel die Datei als Windows-1252, und aus „Ragnarök" wird „RagnarÃ¶k".
- **CRLF** als Zeilenende, wie RFC 4180 es vorsieht. Felder werden nur dann in `"` gesetzt, wenn sie `;`, `"` oder einen Zeilenumbruch enthalten; ein `"` im Feld wird verdoppelt.

**Ein leeres Feld bedeutet „unbekannt"** – nie „0", nie „–". Das ist die CSV-Entsprechung der Darstellungsregel aus Abschnitt 13. Werte, die tatsächlich *den Wert* „unbekannt" tragen (`physical_release_status`), stehen dagegen als Wort in der Spalte. Geldbeträge gehen ohne Währungszeichen und ohne Tausenderpunkt heraus (`12,99`), damit Excel die Spalte als Zahl liest.

**Spalten**

| Liste | Kopfzeile |
|---|---|
| `sammlung` (eine Zeile je Release) | Titel; Plattform; Disc-Fassung; Exemplare; Digital; Fortschritt %; Platin; Status; Bewertung; Zuletzt gespielt |
| `trophaeen` | Rohtitel; Plattform(en); Titel (zugeordnet); Fortschritt %; Bronze erspielt; Bronze definiert; Silber erspielt; Silber definiert; Gold erspielt; Gold definiert; Platin erspielt; Platin definiert; Zuletzt gespielt; Zugeordnet |
| `wunsch`, `todo`, `backlog`, `kauf` | Titel; Plattform; Favorit; Position; Notiz; Herkunft; Status; Angelegt am |
| `luecken` | Titel; Plattform; Fortschritt %; Platin erspielt; Status; Bester Gebrauchtpreis; Verworfen |

„Platin" in `sammlung` ist dreiwertig als Text (`erspielt` / `offen` / `nicht vorgesehen`) – 93 der 431 Listen haben gar keine Platin-Trophäe, dort wäre „offen" falsch. In `trophaeen` und `luecken` stehen stattdessen die Zahlen beziehungsweise das binäre `hat_platin` der View; die Spalte heisst dort deshalb „Platin erspielt" und behauptet nichts über Verfügbarkeit.

`Status` bleibt leer, wenn es **keine** `play_status`-Zeile gibt. Die Sammlungsansicht behandelt sie beim Filtern als `nicht_gespielt`; im Export wäre das eine Behauptung statt einer Angabe.

Die Trophäen-Zahlen stehen als **getrennte Spalten** je Metall („Bronze erspielt", „Bronze definiert"), nicht als „12/20" in einem Feld: CSV ist zum Auswerten gedacht, und „12/20" lässt sich nicht summieren.

Die Spalte `Verworfen` in `luecken` kommt seit Stufe 14 aus der View (`v_luecken.verworfen`, Migration 0017); die Liste enthält nur belegte Disc-Fassungen (`disc_fassung = 'ja'`) – ein `unbekannt` ist keine Lücke, die sich behaupten ließe.

CSV ist für Auswertung und Weitergabe gedacht, nicht als Sicherung: Beziehungen zwischen den Tabellen gehen dabei verloren. Dafür ist der Dump aus 14.2 zuständig.

### 14.5 Nachweis, dass keine Zugangsdaten im Dump stehen

Der Dump wandert wöchentlich in ein Git-Repository, und was einmal in einem Git-Verlauf steht, bleibt dort. NPSSO und Refresh-Token liegen deshalb AES-GCM-verschlüsselt in D1 (Abschnitt 7.1) – aber „liegt verschlüsselt vor" ist eine Behauptung, bis sie geprüft ist. Drei Schichten, weil der Klartext demjenigen, der die Prüfung baut, weder bekannt ist noch sein darf:

1. **Test mit Markierung.** `test/keine-lecks.spec.ts` speichert ein markiertes NPSSO, fährt einen Sync und liest danach **jede** Tabelle aus `sqlite_master` vollständig aus. Inhaltlich dasselbe wie ein `d1 export`, nur ohne Wrangler. Eine Tabelle aus einer künftigen Migration ist damit automatisch mitgeprüft. Dazu ein Fall für `GET /api/export/backup.json`.
2. **Skript gegen den echten Dump.** `scripts/dump-pruefen.sh` läuft in der Backup-Action **und** im Deploy-Job. Es schlägt fehl, wenn `access_token`, `refresh_token`, `"npsso"` oder `npsso=` in einer `INSERT`-Zeile vorkommt, wenn die `psn_credentials`-Zeile einen Wert trägt, der weder Zeitstempel noch gültiges Base64 ist, oder wenn einer dieser Werte **64 Zeichen** lang ist – die Länge eines NPSSO. Die Längenprüfung ist die eigentliche: Ein NPSSO besteht aus Buchstaben und Ziffern, ist also selbst gültiges Base64 und dekodiert zu 48 Byte, die wie Zufall aussehen; eine Prüfung auf druckbare Zeichen im Dekodat läuft daran vorbei. Chiffrat sind 108 Zeichen, ein IV 16. Ins Log kommen nur Zahlen.
3. **Menschliche Gegenprobe.** Der Nutzer sucht im privaten Repo einmal selbst nach seinem NPSSO. Null Treffer ist der einzige Beweis, den niemand anders führen kann.

**Durchgeführt am 14.09.2026**, alle drei Schichten: Der Test läuft über jede Tabelle, `scripts/dump-pruefen.sh` bestand im Backup-Lauf (vier Base64-Werte mit 108/16/72/16 Zeichen, keiner 64), und die Suche im privaten Repo nach den ersten Zeichen des NPSSO ergab `backup.sql:0` und `backup.json:0`.

Als Zugabe eine Prüfung, die *ohne* Kenntnis des Wertes auskommt und deshalb wiederholbar ist: Ein NPSSO ist 64 alphanumerische Zeichen. Im gesamten Dump gibt es **keine** solche Zeichenkette – und die eine 64-Zeichen-Kette, die es gibt, steht in `psn_raw_response`, enthält Leerzeichen und Satzzeichen und ist ein Spieltitel aus einer Sony-Antwort.
