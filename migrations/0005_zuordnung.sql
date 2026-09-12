-- Migration 0005: Herkunft einer Zuordnung
--
-- Damit spaeter nachvollziehbar ist, was automatisch entstand und was der
-- Nutzer entschieden hat. Abschnitt 7.2 verlangt, dass einmal gesetzte
-- Zuordnungen dauerhaft sind - diese Spalten machen sichtbar, worauf sich
-- eine Zuordnung stuetzt.
--
-- Rein additiv. Keine View greift auf diese Spalten zu.

ALTER TABLE trophy_progress ADD COLUMN matched_at     TEXT;
ALTER TABLE trophy_progress ADD COLUMN matched_source TEXT
  CHECK (matched_source IN ('automatisch','manuell'));
