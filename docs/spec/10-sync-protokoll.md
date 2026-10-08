← [Inhaltsverzeichnis](README.md)

## 10. Sync-Protokoll

```sql
CREATE TABLE psn_sync_run (
  id            INTEGER PRIMARY KEY,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  status        TEXT NOT NULL CHECK (status IN ('laufend','erfolg','fehler')),
  error_message TEXT,
  titles_seen   INTEGER
);

CREATE TABLE psn_raw_response (
  id            INTEGER PRIMARY KEY,
  sync_run_id   INTEGER NOT NULL REFERENCES psn_sync_run(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  payload       TEXT NOT NULL,
  fetched_at    TEXT NOT NULL
);

CREATE TABLE psn_credentials (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_expires_at TEXT,
  last_success_at    TEXT,
  status             TEXT NOT NULL CHECK (status IN ('ok','abgelaufen','fehler'))
);
```

Ab Migration 0002 kommen `npsso_ciphertext`, `npsso_iv`, `npsso_stored_at`, `refresh_ciphertext`
und `refresh_iv` hinzu; `psn_sync_run` bekommt `next_offset` für die seitenweise Blätterung.
Migration 0004 ergänzt `psn_sync_run.phase` (`abruf` | `normalisierung`) und
`psn_raw_response.normalized_at`. Migration 0021 (Stufe 18) ergänzt
`psn_sync_run.started_by` (`nutzer` | `cron`, Standard `nutzer`) – wer den Lauf angestoßen hat.

Migration 0026 (Stufe 19e) ergänzt `psn_credentials.npsso_expires_at` – Sonys `expires_in` beim
Eintragen – und legt die Zeitreihe der Zugänge an:

```sql
CREATE TABLE psn_zugang (
  id                INTEGER PRIMARY KEY,
  eingetragen_am    TEXT NOT NULL DEFAULT (datetime('now')),
  angekuendigt_bis  TEXT,     -- aus expires_in; NULL, wenn nur der Wert eingefügt wurde
  letzter_erfolg_am TEXT,     -- letzter geglückter PSN-Abruf mit diesem Zugang
  gestorben_am      TEXT,     -- von PSN abgelehnt
  ersetzt_am        TEXT      -- vom Nutzer früher erneuert
);
```

Geschrieben wird ausschließlich in `CredentialsRepository`, jeweils im selben Batch wie die
Änderung an `psn_credentials`: `npssoSpeichern` schließt den Vorgänger als `ersetzt` und legt die
neue Zeile an, `statusSetzen('abgelaufen')` stempelt `gestorben_am`, `erfolgVermerken` setzt
`letzter_erfolg_am`. Warum nur `gestorben_am` eine Messung der Lebensdauer ist, steht in 7.1.

**Der Sync hat zwei Phasen.** Erst werden alle Seiten roh abgelegt, danach normalisiert – beides
mit begrenzter Arbeit je Aufruf. Ein Zurücksetzen von `normalized_at` lässt die Normalisierung
erneut laufen, ohne PSN anzusprechen (`POST /api/sync/normalize`). Das ist der praktische Nutzen
der Trennung aus 7.1: Eine fehlerhafte Abbildung wird korrigiert und erneut ausgeführt, statt die
Daten neu holen zu müssen.
Die Verschlüsselung ist in 7.1 begründet.

**Vor dem ersten NPSSO existiert keine Zeile.** Der CHECK kennt bewusst keinen Wert für
"noch nie eingerichtet"; die Abwesenheit der Zeile sagt genau das aus. Stufe 2 legt sie beim
ersten hinterlegten NPSSO an. Dashboard und Einstellungen unterscheiden damit drei Zustände:
keine Zeile ("nicht eingerichtet"), `status = 'abgelaufen'` und `status = 'ok'`.
