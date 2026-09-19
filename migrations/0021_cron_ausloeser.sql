-- Migration 0021: Wer hat den Sync-Lauf gestartet (Stufe 18, Abschnitt 10.1)
--
-- Ab Stufe 18 startet ein Cron Trigger den Trophaeen-Sync nachts von allein.
-- Die Sync-Historie soll sagen, ob ein Lauf von Hand oder automatisch
-- angestossen wurde: Der Hinweisblock meldet einen fehlgeschlagenen
-- Nachtlauf, den niemand am Bildschirm gesehen hat, und die Regel "ein
-- Cron-Versuch je Nacht" braucht die Unterscheidung.
--
-- Nur eine Spalte mit Standardwert; alle vorhandenen Laeufe waren von Hand.
-- Keine View liest psn_sync_run. Kein eigenes Cron-Protokoll: laufender Lauf,
-- Lauf des Tages, Zugangsstatus und IGDB-Stempel stehen schon in ihren
-- Tabellen, ein Zaehler daneben waere Berechnetes gespeichert.

ALTER TABLE psn_sync_run ADD COLUMN started_by TEXT NOT NULL DEFAULT 'nutzer'
  CHECK (started_by IN ('nutzer','cron'));
