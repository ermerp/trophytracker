-- Migration 0022: alter Einzeleintrag des Cron-Ausgangs (Stufe 18b)
--
-- Der Cron hielt zunaechst nur seinen LETZTEN Ausgang fest. In der Nacht zum
-- 22.09.2026 zeigte sich, warum das zu wenig ist: Er hatte 368 Spiele
-- aufgefrischt, und die einzige gespeicherte Zeile lautete "nichts" - der
-- letzte von 36 Aufrufen, als die Arbeit laengst getan war. Seitdem stehen
-- die letzten fuenf Ausgaenge unter 'cron_verlauf'.
--
-- Datenmigration: Genau eine Zeile faellt weg (der alte Schluessel), und nur
-- wenn der Cron seit Stufe 18b ueberhaupt gelaufen ist. Erwartet: 0 oder 1.
-- Kein Verlust - der Inhalt war der Ausgang eines einzelnen Aufrufs.

DELETE FROM app_setting WHERE key = 'cron_letzter_ausgang';
