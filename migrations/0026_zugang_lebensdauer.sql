-- Migration 0026: Wie lange ein Zugang haelt (Stufe 19e, Abschnitt 7.1)
--
-- In der Nacht zum 29.09.2026 starben NPSSO und Refresh-Token gemeinsam:
-- Der Lauf scheiterte im NPSSO-Rueckfall, erreichbar nur, wenn Sony vorher
-- den Refresh-Token abgelehnt hat - obwohl dessen Frist noch acht Tage lief.
-- Das NPSSO war 25 Tage alt. Sony hatte beim Ausstellen aber rund 60 Tage
-- angekuendigt (`expires_in`, gemessen am 29.09.2026: 5 182 926 Sekunden).
--
-- Angekuendigt und tatsaechlich fallen also auseinander, und EIN Messpunkt
-- sagt nicht, ob 25 Tage die Regel oder ein Ausreisser waren (Frage des
-- Nutzers vom 29.09.2026). Deshalb wird ab jetzt je Zugang aufgezeichnet,
-- was angekuendigt war und was daraus wurde. Nach ein paar Runden steht die
-- Warnschwelle auf einer gemessenen Zahl statt auf einer Faustregel.
--
-- ZWEI AUSGAENGE, und sie sind auseinanderzuhalten:
--
--   gestorben_am - von PSN abgelehnt. NUR DIESE ZEILEN sind eine Messung
--                  der Lebensdauer.
--   ersetzt_am   - der Nutzer hat frueher erneuert, etwa weil die Warnung
--                  kam. Der Zugang haette laenger gehalten; wie lange,
--                  erfaehrt niemand. Solche Zeilen verfaelschen den
--                  Mittelwert und zaehlen deshalb nicht mit.
--
-- Die Tabelle haelt AUSSCHLIESSLICH Zeitpunkte - kein Token, kein Chiffrat,
-- nichts, was ein Dump nicht enthalten duerfte (14.5). Sie kommt deshalb in
-- EXPORT_TABELLEN: Die Zeitreihe ist der ganze Zweck, und sie waere nach
-- einem Verlust nicht wiederherstellbar.
--
-- Abwaertskompatibel: eine neue Tabelle und eine neue Spalte mit NULL als
-- Vorgabe. Der alte Worker laeuft waehrend der Migration weiter und kennt
-- beides einfach nicht. Keine View steht auf psn_credentials.

ALTER TABLE psn_credentials ADD COLUMN npsso_expires_at TEXT;

CREATE TABLE psn_zugang (
  id               INTEGER PRIMARY KEY,
  eingetragen_am   TEXT NOT NULL DEFAULT (datetime('now')),
  -- Sonys Ankuendigung aus `expires_in`; NULL, wenn nur der blanke Wert
  -- eingefuegt wurde.
  angekuendigt_bis TEXT,
  -- Letzter geglueckter PSN-Abruf mit diesem Zugang.
  letzter_erfolg_am TEXT,
  gestorben_am     TEXT,
  ersetzt_am       TEXT
);

-- Der offene Zugang ist der eine ohne Ausgang. Ein Teilindex darauf, weil
-- jeder Schreibpfad ihn sucht und die Tabelle mit den Jahren waechst.
CREATE INDEX idx_zugang_offen ON psn_zugang(id)
  WHERE gestorben_am IS NULL AND ersetzt_am IS NULL;

-- Den bestehenden Zugang aufnehmen, damit die Zeitreihe nicht bei null
-- beginnt: Er ist seit dem 04.09.2026 eingetragen und in der Nacht zum
-- 29.09.2026 gestorben - die 25 Tage, die den Anlass gaben. INSERT OR
-- IGNORE nach der Regel aus CLAUDE.md; angekuendigt_bis bleibt NULL, weil
-- die Zahl damals nicht erhoben wurde.
INSERT OR IGNORE INTO psn_zugang (id, eingetragen_am, letzter_erfolg_am, gestorben_am)
SELECT 1, npsso_stored_at, last_success_at, '2026-09-29 03:00:38'
FROM psn_credentials
WHERE id = 1 AND npsso_stored_at IS NOT NULL;
