-- Migration 0016: Aenderungserkennung (Stufe 13, Abschnitt 8.1)
--
-- Der Sync vergleicht ab jetzt den aktuellen Trophaeenstand mit dem Stempel
-- der letzten Durchsicht (reviewed_*) und legt Aenderungen in der Pruefliste
-- vor: 'neue_trophaeen' und 'dlc_erweitert'. Der Eintrag soll den
-- Vorher-Nachher-Vergleich in Prozent nennen ("100 % -> 78 %"). Aus den
-- gestempelten Zaehlern laesst sich der alte Prozentwert nicht
-- rekonstruieren: Sony gewichtet nach Trophaeenwert, bei 243 von 431 Listen
-- der Sammlung weicht progress_pct vom Verhaeltnis erspielt/definiert ab.
-- Deshalb haelt der Stempel den Prozentwert von nun an selbst fest.
--
-- Backfill: Jede bereits gestempelte Liste bekommt den aktuellen Prozentwert
-- als Referenz (erwartet 431 = Zahl der gestempelten Listen). Fuer die zwei
-- Listen, die seit ihrem Stempel weitergespielt wurden, ist der Wert leicht
-- zu hoch - folgenlos, beide sind am_spielen, und jeder Statuswechsel
-- stempelt neu. Ungestempelte Listen bleiben NULL. Der Deploy-Job
-- protokolliert gestempelte gegen befuellte Zeilen (erwartet gleich).
--
-- Nur eine neue Spalte, keine View liest sie: v_review_offen bleibt stehen.

ALTER TABLE trophy_progress ADD COLUMN reviewed_progress_pct INTEGER;

UPDATE trophy_progress
SET reviewed_progress_pct = progress_pct
WHERE reviewed_at IS NOT NULL AND reviewed_progress_pct IS NULL;
