-- Migration 0008: Indizes auf den Fremdschluesseln
--
-- D1 zaehlt gelesene Zeilen; der Free Tier erlaubt 5 Millionen am Tag. Am
-- 13.09.2026 hat die Anwendung 11,7 Millionen an einem Vormittag gelesen und
-- war fuer den Rest des Tages tot (D1_ERROR "daily row read limit").
--
-- Ursache: Kein Fremdschluessel hatte einen Index. Jeder Join auf
-- trophy_progress.release_id und jede korrelierte Unterabfrage ueber
-- release.game_id war ein voller Tabellenscan - gemessen bei 430 Listen:
-- eine Sammlungsseite 160.000 Zeilen, nach "zuletzt gespielt" sortiert
-- 741.000, ein Prueflisten-Aufruf 187.000. Mit Indizes liegen dieselben
-- Abfragen im Bereich weniger tausend. test/lesekosten.spec.ts haelt das
-- fest.
--
-- Rein additiv, keine View betroffen. idx_trophy_unmatched (partiell, nur
-- release_id IS NULL) bleibt fuer die Zuordnungsansicht bestehen.

CREATE INDEX idx_trophy_release         ON trophy_progress(release_id);
CREATE INDEX idx_release_game           ON release(game_id);
CREATE INDEX idx_physical_copy_release  ON physical_copy(release_id);
CREATE INDEX idx_digital_release        ON digital_entitlement(release_id);
CREATE INDEX idx_plan_release           ON plan_entry(release_id);
CREATE INDEX idx_market_offer_release   ON market_offer(release_id);
