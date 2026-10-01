-- Migration 0027: Einzeltrophaeen je Spiel (Stufe 19b, Abschnitt 7.7)
--
-- Bis hierher wusste die Anwendung je Trophaeenliste nur Zaehler: vier
-- definierte und vier erspielte Summen. Damit laesst sich "11 von 49" sagen,
-- aber nicht "was fehlt mir noch zu Platin", kein Erspiel-Datum, keine
-- Seltenheit. Diese Tabelle haelt die einzelne Trophaee.
--
-- VOR DEM BAUEN GEMESSEN (01.10.2026, gegen das echte Konto, nur Zahlen ins
-- Repository):
--
--   - npServiceName ist bei JEDEM Abruf Pflicht, auch bei 'trophy'. Ohne den
--     Parameter antworten alle Endpunkte mit 404.
--   - Versteckte Trophaeen tragen Namen und Beschreibung (311 von 311).
--     Deshalb ist `name` NOT NULL - das Zudecken ist Sache der Anzeige, nicht
--     der Daten (13).
--   - Nur 18 % der Listen haben ueberhaupt DLC-Gruppen.
--   - Der Fortschrittszaehler ("15 von 20") ist PS5-eigen: 21 von 63
--     PS5-Listen haben ihn, in 45 PS3/PS4/Vita-Listen mit 2 125 Trophaeen
--     kein einziger. Die vier Spalten bleiben dort LEER - nach Abschnitt 3
--     ist das "nicht erhoben", niemals eine 0.
--
-- WITHOUT ROWID ist hier kein Feinschliff, sondern die Antwort auf die
-- Schreibgrenze (15.4): D1 erlaubt 100 000 geschriebene Zeilen am Tag, und
-- Index-Schreibungen zaehlen mit. Eine normale Tabelle mit diesem
-- Primaerschluessel schriebe zwei Zeilen je Trophaee - 37 000 fuer die
-- Erstbefuellung. WITHOUT ROWID legt die Zeile IM Primaerschluessel ab:
-- 18 400. Zugleich ist der Schluessel mit np_communication_id an fuehrender
-- Stelle genau der Index, den "die Trophaeen eines Spiels" braucht (rund 43
-- gelesene Zeilen statt 18 355) und deckt den Fremdschluessel ab - die Regel
-- aus CLAUDE.md ist damit ohne zweiten Index erfuellt.
--
-- Abwaertskompatibel: zwei neue Tabellen, keine Aenderung an bestehenden,
-- keine View betroffen. Der alte Worker kennt sie waehrend der Migration
-- einfach nicht.

-- ZWEI STEMPEL AN trophy_progress, und sie sind der Grund, warum sich der
-- Fuellschritt nicht im Kreis dreht.
--
-- "Die naechste Liste ohne Trophaeen" waere die naheliegende Auswahl und
-- waere falsch: Eine Liste, die PSN nicht liefert (404 bei einem delisteten
-- Titel) oder die gar keine Trophaeen hat, bliebe fuer immer die naechste.
-- Genau dieser Fall hat den IGDB-Schritt in Stufe 18b zwei Naechte lang
-- stillgelegt (Befund vom 21.09.2026: "Spiele, die IGDB nicht zurueckgibt,
-- werden trotzdem gestempelt"). Hier wird deshalb der VERSUCH gestempelt,
-- nicht der Erfolg.
--
-- trophies_synced_sum haelt die Summe aller acht Zaehler zum Zeitpunkt des
-- Abrufs. Weicht sie vom heutigen Stand ab, hat sich an der Liste etwas
-- geaendert - eine neue Trophaee erspielt oder ein DLC erschienen -, und nur
-- dann wird neu geholt (7.7, "danach nur bei Aenderung"). Das kommt ohne
-- Absprache mit der Aenderungserkennung aus Stufe 13 aus und ohne eine
-- zweite Abfrage: Beide Werte stehen in derselben Zeile.
ALTER TABLE trophy_progress ADD COLUMN trophies_synced_at TEXT;
ALTER TABLE trophy_progress ADD COLUMN trophies_synced_sum INTEGER;

CREATE TABLE trophy (
  np_communication_id TEXT    NOT NULL REFERENCES trophy_progress(np_communication_id) ON DELETE CASCADE,
  trophy_id           INTEGER NOT NULL,

  -- Definition. Fremddatum von Sony, wird bei jedem Abruf ueberschrieben.
  grade               TEXT    NOT NULL CHECK (grade IN ('platin','gold','silber','bronze')),
  name                TEXT    NOT NULL,
  detail              TEXT,
  icon_url            TEXT,
  -- Sonys trophyHidden. Die Texte sind trotzdem da; 'versteckt' sagt nur,
  -- dass die Anzeige sie zudeckt, bis der Nutzer sie aufdeckt (13).
  hidden              INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1)),
  -- 'default' ist das Hauptspiel, '001' und weiter sind DLC-Gruppen. Nur die
  -- Trophaeen der Gruppe 'default' zaehlen aufs Platin - ohne diese Spalte
  -- rechnet "was fehlt zu Platin" bei jedem Spiel mit DLC falsch.
  group_id            TEXT    NOT NULL DEFAULT 'default',

  -- Eigener Stand.
  earned              INTEGER NOT NULL DEFAULT 0 CHECK (earned IN (0,1)),
  -- NULL heisst "nicht erspielt". Sony liefert earnedDateTime ausschliesslich
  -- an erspielten Trophaeen (gemessen: 76 von 76).
  earned_at           TEXT,
  -- Anteil der Spieler DES SPIELS, die diese Trophaee haben; Sony liefert ihn
  -- als Text ("42.6"), hier als Zahl. NULL = unbekannt, nie 0 (Abschnitt 3).
  -- Die Stufe (ultra selten / sehr selten / selten / haeufig) wird daraus zur
  -- Lesezeit gebildet und NICHT gespeichert (5.2); die Schwellen 5/15/50 sind
  -- an 526 Trophaeen gegen Sonys eigenen Stufenwert gemessen.
  earned_rate         REAL,

  -- Fortschrittszaehler, nur PS5 und nur, wo das Spiel ihn fuehrt.
  -- Alle vier NULL heisst "diese Trophaee hat keinen Zaehler".
  progress_target     INTEGER,
  progress_value      INTEGER,
  progress_rate       REAL,
  progressed_at       TEXT,

  synced_at           TEXT    NOT NULL DEFAULT (datetime('now')),

  PRIMARY KEY (np_communication_id, trophy_id)
) WITHOUT ROWID;

-- Der Dashboard-Feed liest die erspielten Trophaeen eines Zeitfensters nach
-- Datum (8.5). Ohne diesen Teilindex waere das bei JEDEM Start der App ein
-- Scan ueber alle 18 355 Zeilen - und der Feed ist die erste Seite nach dem
-- Start (Abschnitt 2). Teilindex, weil nur erspielte Trophaeen ein Datum
-- haben: Er kostet 11 168 statt 18 355 Eintraege und damit auch nur fuer
-- diese Zeilen eine zweite Schreibung.
CREATE INDEX idx_trophy_erspielt ON trophy(earned_at) WHERE earned = 1;

-- Die Gruppen einer Liste: Hauptspiel und DLC mit Namen und Zaehlern.
-- Nur fuer die rund 18 % der Listen, die ueberhaupt welche haben - die
-- Zugehoerigkeit JEDER Trophaee steht dagegen schon in trophy.group_id und
-- kostet keinen eigenen Abruf.
CREATE TABLE trophy_group (
  np_communication_id TEXT NOT NULL REFERENCES trophy_progress(np_communication_id) ON DELETE CASCADE,
  group_id            TEXT NOT NULL,
  name                TEXT NOT NULL,
  detail              TEXT,
  icon_url            TEXT,
  defined_bronze      INTEGER NOT NULL DEFAULT 0,
  defined_silver      INTEGER NOT NULL DEFAULT 0,
  defined_gold        INTEGER NOT NULL DEFAULT 0,
  defined_platinum    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (np_communication_id, group_id)
) WITHOUT ROWID;
