-- Migration 0002: Ablage der PSN-Zugangsdaten
--
-- Abschnitt 7.1 verlangte urspruenglich "Tokens liegen als Cloudflare Secret,
-- nicht in D1" und gleichzeitig ein Eingabefeld fuer ein neues NPSSO. Das
-- schliesst sich aus: Ein Worker kann keine Cloudflare Secrets schreiben,
-- Secrets-Store-Bindings sind zur Laufzeit nur lesbar.
--
-- Aufloesung: NPSSO und Refresh-Token liegen AES-GCM-verschluesselt in D1,
-- der Schluessel als Cloudflare Secret NPSSO_KEY. Ein Datenbank-Dump enthaelt
-- damit keinen verwertbaren Zugang.
--
-- Rein additiv: Der alte Worker laeuft waehrend des Deployments weiter.
-- Keine View greift auf psn_credentials oder psn_sync_run zu.

ALTER TABLE psn_credentials ADD COLUMN npsso_ciphertext   TEXT;
ALTER TABLE psn_credentials ADD COLUMN npsso_iv           TEXT;
ALTER TABLE psn_credentials ADD COLUMN npsso_stored_at    TEXT;

-- Der Refresh-Token rotiert bei jeder Erneuerung und braucht deshalb eine zur
-- Laufzeit beschreibbare Ablage. Er nimmt denselben Weg wie das NPSSO.
-- refresh_expires_at existiert seit Migration 0001 und wird ab jetzt gefuellt.
ALTER TABLE psn_credentials ADD COLUMN refresh_ciphertext TEXT;
ALTER TABLE psn_credentials ADD COLUMN refresh_iv         TEXT;

-- Fortschritt der Blaetterung. Ein Aufruf holt nur wenige Seiten: Der Free
-- Tier erlaubt 10 ms CPU je Aufruf, und Cron Trigger haben dieselbe Grenze -
-- die Begrenzung muss also aus dem Entwurf kommen, nicht aus dem Ausloeser.
ALTER TABLE psn_sync_run ADD COLUMN next_offset INTEGER NOT NULL DEFAULT 0;
