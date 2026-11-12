-- Migration 0038: Das Access Token wird wiederverwendet (Nachtrag 18q, Abschnitt 7.1)
--
-- Bis hierher erneuerte JEDER arbeitende PSN-Aufruf des Crons das Token bei
-- Sony und schrieb das neue Refresh-Token zurueck - rund 28-mal je Nacht, fuer
-- ein Access Token, das eine Stunde gilt. Das kostete je Aufruf eine Anfrage
-- an Sony, Ver- und Entschluesselung und einen eigenen D1-Schreibaufruf
-- (gezaehlt am 08.11.2026, 16.2).
--
-- Jetzt liegt auch das Access Token in psn_credentials, verschluesselt wie
-- das Refresh-Token (AES-GCM, Schluessel als Cloudflare Secret) - ein Dump
-- enthaelt damit nichts Verwertbares (Entscheidung des Nutzers vom
-- 08.11.2026). Die Tabelle steht in NICHT_EXPORTIERT, der JSON-Export
-- enthaelt sie also gar nicht.
--
-- Abwaertskompatibel: drei neue Spalten mit NULL als Vorgabe. Der alte Worker
-- laeuft waehrend der Migration weiter, kennt sie nicht und erneuert wie
-- bisher. Keine View steht auf psn_credentials. Es werden keine Zeilen
-- geschrieben.

ALTER TABLE psn_credentials ADD COLUMN access_ciphertext TEXT;
ALTER TABLE psn_credentials ADD COLUMN access_iv         TEXT;
ALTER TABLE psn_credentials ADD COLUMN access_expires_at TEXT;
