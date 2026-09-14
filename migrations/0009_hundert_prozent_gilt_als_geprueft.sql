-- Migration 0009: 100 % wird nicht mehr vorgelegt (Abschnitt 8.1)
--
-- Aus dem ersten produktiven Durchgang: Ein Titel mit 100 % Trophaeen -
-- Hauptspiel und alle DLC - ist komplettiert. Da gibt es nichts zu
-- entscheiden, und die Pruefliste soll nur zeigen, was eine Entscheidung
-- braucht. Beim Bestand betrifft das rund ein Viertel aller Eintraege.
--
-- Statt sie nur zu verstecken, werden sie als durchgesehen gestempelt:
-- reviewed_* haelt den Referenzpunkt fest, damit die Aenderungserkennung
-- in Stufe 13 spaeter erkennt, wenn ein DLC die Trophaeenzahl erhoeht und
-- der Titel damit wieder unter 100 % faellt. Ohne Stempel gaebe es keinen
-- Vergleichswert.
--
-- play_status wird NICHT angefasst: Dort steht aus der Vorbelegung (4.2)
-- bereits 'komplettiert'. Dieselbe Regel laeuft danach im Code
-- (ReviewRepository.einreihen); diese Migration holt den Bestand nach.

UPDATE trophy_progress
SET reviewed_earned_total  = earned_bronze + earned_silver + earned_gold + earned_platinum,
    reviewed_defined_total = defined_bronze + defined_silver + defined_gold + defined_platinum,
    reviewed_at            = datetime('now')
WHERE release_id IS NOT NULL AND reviewed_at IS NULL AND progress_pct >= 100;

DELETE FROM review_queue
WHERE reason = 'erstimport'
  AND release_id IN (
    SELECT release_id FROM trophy_progress
    WHERE release_id IS NOT NULL AND progress_pct >= 100
  );
