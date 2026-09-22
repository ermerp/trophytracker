-- Migration 0023: Spielzeit und digitaler Besitz aus PSN (Stufe 18c, Abschnitt 7.7)
--
-- Die PSN-Anbindung nutzte bisher nur die Trophaeenliste. Zwei weitere
-- Endpunkte liefern, was der Sammlung fehlte: die tatsaechliche Spielzeit
-- (gamelist/v2) und den digitalen Besitz samt der Unterscheidung gekauft /
-- ueber PS+ (GraphQL-Kaufliste). Gemessen am 21.09.2026 gegen das echte
-- Konto: 284 von 379 gespielten Titeln und 247 von 730 Kaeufen passen
-- eindeutig auf die Sammlung.
--
-- psn_played_title ist gebaut wie trophy_progress: Sonys Rohwerte stehen
-- fuer sich, release_id ist die ZUORDNUNG und damit spaeter korrigierbar.
-- Geht der Abgleich daneben, bleibt das Fremddatum unversehrt - und ein
-- Titel ohne Treffer in der Sammlung bleibt einfach liegen, ohne etwas zu
-- importieren (Entscheidung des Nutzers vom 21.09.2026).
--
-- Spielzeit gibt es nur fuer PS4 und PS5; Sony erfasst sie erst seit der
-- PS4. Fuer PS3 und Vita bleiben die Felder dauerhaft leer - das ist ein
-- "unbekannt" im Sinne von Abschnitt 3, niemals eine 0.

CREATE TABLE psn_played_title (
  title_id        TEXT PRIMARY KEY,   -- CUSA…/PPSA… von Sony
  name            TEXT NOT NULL,      -- Rohwert, nie normalisiert
  platform        TEXT NOT NULL CHECK (platform IN ('PS4','PS5')),
  play_duration_s INTEGER,            -- aus ISO-8601 "PT12H59S"
  play_count      INTEGER,
  first_played_at TEXT,
  last_played_at  TEXT,
  release_id      INTEGER REFERENCES release(id) ON DELETE SET NULL,
  synced_at       TEXT NOT NULL
);

-- Fremdschluessel bekommt seinen Index in derselben Migration (Regel aus 0008).
CREATE INDEX idx_played_release ON psn_played_title(release_id);

-- Woher eine digitale Berechtigung stammt - wie physical_source bei der
-- Disc-Fassung (Abschnitt 3). Was der Nutzer selbst erfasst hat, fasst kein
-- automatischer Lauf an; umgekehrt korrigiert man von PSN Erkanntes bei
-- Sony, nicht hier. Bestandszeilen sind samt und sonders Handarbeit.
--
-- ADD COLUMN ist hier unkritisch: Die Views auf digital_entitlement listen
-- ihre Spalten explizit auf (Projektregel), die Ergebnismenge waechst also
-- nicht stillschweigend mit.
ALTER TABLE digital_entitlement ADD COLUMN herkunft TEXT NOT NULL DEFAULT 'nutzer'
  CHECK (herkunft IN ('nutzer','psn'));
