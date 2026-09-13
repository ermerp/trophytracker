-- Migration 0006: Eigene Bewertung (Stufe 6, Use Case 2)
--
-- Zwei Dinge, beide abwaertskompatibel fuer den alten Worker, der waehrend
-- des Deployments noch laeuft:
--
-- 1. v_abweichungen bekommt game_id und release_id, damit die Oberflaeche
--    von einer Abweichung ins Spieldetail verlinken kann. Eine View wird
--    nicht geaendert, sondern gedroppt und neu angelegt; Spalten explizit,
--    nie SELECT *.
--
-- 2. Vorbelegung des Bestands (Abschnitt 4.2): Fuer jede bereits
--    zugeordnete Trophaeenliste mit Fortschritt entsteht eine
--    play_status-Zeile - 100 % → 'komplettiert', sonst 'am_spielen'.
--    INSERT OR IGNORE, damit ein vom Nutzer gesetzter Status nie
--    ueberschrieben wird. Dieselbe Regel laeuft danach im Code
--    (PlayStatusRepository.vorbelegen) nach jeder Zuordnung und am Ende
--    jeder Normalisierung; diese Migration holt nur nach, was vor Stufe 6
--    zugeordnet wurde. Der Deploy-Job protokolliert die Zeilenzahl.

DROP VIEW v_abweichungen;

-- Trophaeen und eigene Bewertung weichen ab. Nicht als Fehler behandeln,
-- nur zur Durchsicht anzeigen.
CREATE VIEW v_abweichungen AS
SELECT g.id AS game_id, r.id AS release_id, g.title, r.platform, t.progress_pct, ps.status
FROM play_status ps
JOIN release r ON r.id = ps.release_id
JOIN game g ON g.id = r.game_id
LEFT JOIN trophy_progress t ON t.release_id = r.id
WHERE (ps.status IN ('durchgespielt','komplettiert') AND COALESCE(t.progress_pct,0) < 20)
   OR (ps.status = 'nicht_gespielt' AND COALESCE(t.progress_pct,0) > 0);

INSERT OR IGNORE INTO play_status (release_id, status)
SELECT t.release_id,
       CASE WHEN t.progress_pct >= 100 THEN 'komplettiert' ELSE 'am_spielen' END
FROM trophy_progress t
WHERE t.release_id IS NOT NULL AND t.progress_pct > 0;
