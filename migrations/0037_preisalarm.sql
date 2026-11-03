-- Migration 0037: Preisalarm (Stufe 20g)
--
-- Zwei Teile:
--
-- 1. Die Grenze "Preisalarm unter ... EUR" sitzt am RELEASE, nicht an der
--    Absicht (Entscheidung des Nutzers vom 30.10.2026): Ein Wunsch auf der
--    Kaufliste ist eine Kopie, der Wunsch bleibt offen - zwei Grenzen fuer
--    ein Release haetten keine Regel. Wirksam ist sie nur, solange eine
--    Absicht offen ist. `preis_grenze_am` sagt, seit wann sie gilt: Daran
--    haengt, ob die Grenze wieder "scharf" ist (src/domain/preisalarm.ts).
--    Leer heisst keine Grenze - nie vorbelegt (Abschnitt 3).
--
-- 2. `preis_alarm` haelt die Meldungen hinter der Glocke. Hoechstens EINE
--    offene je Release und Kanal (Entscheidung vom 30.10.2026: eine Meldung
--    mit dem tiefsten Preis statt einer je Reihe); ein tieferer Preis
--    aktualisiert sie. Der eindeutige Teilindex haelt das fest. Quittiert
--    wird ueber den Haken (`quittiert_am`), ein verworfenes Angebot laesst
--    die Meldung entfallen (`entfallen_am`) - beides bleibt als Zeile stehen,
--    damit die Ruecknahme des Verwerfens sie wiederherstellen kann.
--
-- Rein additiv, keine Daten; der alte Worker merkt nichts davon.
ALTER TABLE release ADD COLUMN preis_grenze_cents INTEGER;
ALTER TABLE release ADD COLUMN preis_grenze_am TEXT;

CREATE TABLE preis_alarm (
  id              INTEGER PRIMARY KEY,
  release_id      INTEGER NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  kanal           TEXT NOT NULL CHECK (kanal IN ('gebraucht','store')),
  art             TEXT NOT NULL CHECK (art IN ('tief','grenze')),
  reihe           TEXT NOT NULL CHECK (reihe IN ('haendler','markt','store')),
  preis_cents     INTEGER NOT NULL,
  -- Das bisherige Tief (art 'tief') oder die Grenze (art 'grenze').
  vorher_cents    INTEGER NOT NULL,
  ebay_item_id    TEXT,
  erstellt_am     TEXT NOT NULL,
  aktualisiert_am TEXT NOT NULL,
  quittiert_am    TEXT,
  entfallen_am    TEXT
);

-- Fremdschluessel bekommt seinen Index (CLAUDE.md).
CREATE INDEX idx_preis_alarm_release ON preis_alarm(release_id);

-- Hoechstens eine offene Meldung je Release und Kanal; zugleich der Weg,
-- auf dem die Glocke nur die offenen liest.
CREATE UNIQUE INDEX idx_preis_alarm_offen ON preis_alarm(release_id, kanal)
  WHERE quittiert_am IS NULL AND entfallen_am IS NULL;
