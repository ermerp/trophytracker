-- Migration 0040: Kaeufe ohne Spiel in der Sammlung (Stufe 18t, Abschnitt 7.7)
--
-- Bis hierher verwarf der Kaufliste-Abgleich jeden PSN-Kauf, fuer den es
-- kein eindeutiges Release in der Sammlung gibt, ohne Spur (Befund vom
-- 15.11.2026, 16.4). Ein neu gekauftes digitales Spiel erschien dadurch nie.
-- Diese Tabelle merkt sich solche Kaeufe, damit sie sichtbar sind und ein
-- spaeterer Schritt aus ihnen Spiel und Release anlegen kann. Sie legt
-- selbst nichts an.
--
-- Nur Kaeufe (`subscriptionService = 'NONE'`), nie PS Plus: PS+ ist eine
-- Momentaufnahme, kein Besitz, und der Katalog wechselt monatlich (7.7).
--
-- Kennung ist die Berechtigung von Sony (`entitlementId`) zusammen mit der
-- Plattform: Eine Berechtigung ist genau ein Eintrag der Kaufliste, und ob
-- Sony einen Cross-Gen-Titel unter derselben Kennung fuer zwei Plattformen
-- fuehrt, ist nicht gemessen - mit der Plattform im Schluessel ueberschreibt
-- dann keiner den anderen.
--
-- Ein Rohwert von Sony (`title_name`, nie normalisiert) und die Kennungen,
-- die der spaetere Schritt braucht. Keine Rohablage: nur diese Felder (7.1).
-- Abgeleitet und mit dem naechsten Lauf wieder da - deshalb nicht in
-- backup.json (NICHT_EXPORTIERT, 14.2).
--
-- Rein additiv: neue Tabelle, keine Daten, keine View; der alte Worker
-- merkt nichts davon.

CREATE TABLE psn_purchase_open (
  entitlement_id TEXT NOT NULL,
  platform       TEXT NOT NULL CHECK (platform IN ('PS3','PS4','PS5','PSVITA')),
  title_name     TEXT NOT NULL,   -- Rohwert von Sony
  product_id     TEXT,
  concept_id     TEXT,
  title_id       TEXT,
  first_seen_at  TEXT NOT NULL,   -- bleibt beim erneuten Sehen stehen
  last_seen_at   TEXT NOT NULL,   -- jeder Lauf, der den Kauf nennt
  PRIMARY KEY (entitlement_id, platform)
);

-- Das Aufraeumen am Ende eines vollstaendigen Laufs sucht ueber
-- last_seen_at (Regel: jede Spalte, ueber die gesucht wird, hat einen Index).
-- Upsert und Loeschen bei einem Treffer laufen ueber den Primaerschluessel.
CREATE INDEX idx_purchase_open_seen ON psn_purchase_open(last_seen_at);
