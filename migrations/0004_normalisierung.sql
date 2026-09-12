-- Migration 0004: Normalisierung als eigene Sync-Phase
--
-- Der Sync bekommt einen zweiten Abschnitt. Abruf und Normalisierung bleiben
-- getrennt (Abschnitt 7.1), damit die Normalisierung ohne PSN-Zugriff
-- beliebig wiederholbar ist.
--
-- Beide Spalten dienen demselben Zweck wie next_offset beim Abruf: Die Arbeit
-- muss ueber mehrere Aufrufe verteilbar sein, weil der Free Tier 10 ms CPU je
-- Aufruf erlaubt - auch fuer Cron Trigger.
--
-- Rein additiv, der alte Worker laeuft waehrend des Deployments weiter.
-- Keine View greift auf psn_sync_run oder psn_raw_response zu.

-- 'abruf' | 'normalisierung'
ALTER TABLE psn_sync_run ADD COLUMN phase TEXT NOT NULL DEFAULT 'abruf';

-- Merkt, welche Rohantwort bereits verarbeitet wurde. Zuruecksetzen auf NULL
-- laesst die Normalisierung erneut laufen.
ALTER TABLE psn_raw_response ADD COLUMN normalized_at TEXT;
