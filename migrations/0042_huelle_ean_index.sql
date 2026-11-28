-- Migration 0042: Index auf physical_copy(ean) - eine Huelle, mehrere Spiele
--
-- Nachtrag f1h (Entscheidung des Nutzers vom 28.11.2026): Eine Collection-Disc
-- ("God of War 1 & 2 HD Collection") enthaelt mehrere Spiele, die in der
-- Sammlung einzeln stehen. Jedes bekommt sein eigenes physical_copy am
-- jeweiligen Release mit DEMSELBEN ean - gleicher Code heisst eine Huelle.
-- ean_mapping zeigt weiter auf ein Release.
--
-- Der Scanner sucht beim erneuten Scan alle Spiele der Huelle ueber diese
-- Spalte, das Spieldetail die anderen Spiele derselben Huelle. Ohne Index
-- waere jede dieser Fragen ein Scan ueber alle Discs (CLAUDE.md: jede
-- Suchspalte hat einen Index). Rein additiv, keine Datenaenderung, keine
-- View betroffen.

CREATE INDEX idx_physical_copy_ean ON physical_copy(ean);
