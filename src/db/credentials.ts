import { entschluesseln, verschluesseln } from "../domain/crypto";
import { Geheimnis } from "../domain/secret";
import { eins, einzeln, ersteZeile, type Baustein } from "./baustein";

export type CredentialStatus = "ok" | "abgelaufen" | "fehler";

/**
 * Zustand der PSN-Zugangsdaten fuer die Anzeige.
 * Enthaelt bewusst keine Geheimnisse - dieses Objekt geht an die Oberflaeche.
 */
export type CredentialAnzeige = {
	eingerichtet: boolean;
	status: CredentialStatus | null;
	npssoHinterlegtAm: string | null;
	/**
	 * Was Sony beim Eintragen angekuendigt hat (`expires_in`, Stufe 19e).
	 * ANKUENDIGUNG, keine Zusage: Am 29.09.2026 hielt ein Zugang 25 Tage bei
	 * rund 60 angekuendigten. Wird angezeigt, traegt aber keine Warnung.
	 */
	npssoLaeuftAbUm: string | null;
	refreshLaeuftAbUm: string | null;
	letzterErfolgAm: string | null;
};

type Zeile = {
	status: CredentialStatus;
	npsso_ciphertext: string | null;
	npsso_iv: string | null;
	npsso_stored_at: string | null;
	npsso_expires_at: string | null;
	refresh_ciphertext: string | null;
	refresh_iv: string | null;
	refresh_expires_at: string | null;
	/** Seit Nachtrag 18q (Migration 0038): das Access Token, wiederverwendet. */
	access_ciphertext: string | null;
	access_iv: string | null;
	access_expires_at: string | null;
	last_success_at: string | null;
};

/**
 * Die Zeile mit den Chiffraten, wie der Lage-Batch des Crons sie schon liest
 * (Nachtrag 18q) - KEIN Klartext; entschluesselt wird nur hier im Repository.
 */
export type ZugangsZeile = Zeile;

/**
 * So viel Gueltigkeit muss ein gespeichertes Access Token noch haben, damit es
 * wiederverwendet wird (Nachtrag 18q). Ein Aufruf dauert Sekunden; die zehn
 * Minuten decken eine abweichende Uhr bei Sony und den Rest des Aufrufs. Mit
 * einer Stunde Gueltigkeit erneuert eine Nacht damit rund alle 50 Minuten
 * statt in jedem der rund 28 arbeitenden PSN-Aufrufe.
 */
export const ACCESS_RESTZEIT_MS = 10 * 60_000;

/**
 * NPSSO und Refresh-Token, AES-GCM-verschluesselt in psn_credentials.
 *
 * Klartext verlaesst dieses Repository ausschliesslich als Geheimnis, nie als
 * string - damit kann kein Aufrufer ihn versehentlich serialisieren.
 *
 * Vor dem ersten NPSSO existiert keine Zeile; die Abwesenheit bedeutet
 * "noch nicht eingerichtet" (Abschnitt 10).
 */
export class CredentialsRepository {
	constructor(
		private readonly db: D1Database,
		private readonly key: string,
	) {}

	private zeile(): Promise<Zeile | null> {
		return this.db.prepare("SELECT * FROM psn_credentials WHERE id = 1").first<Zeile>();
	}

	/** Die Zeile selbst, fuer einen Aufrufer ohne Lage (Knopf, Routen). */
	zeileLesen(): Promise<ZugangsZeile | null> {
		return this.zeile();
	}

	async anzeige(): Promise<CredentialAnzeige> {
		return einzeln(this.db, this.anzeigeBaustein());
	}

	/** Dieselbe Anzeige als Baustein - fuer den Lage-Batch des Cron (Stufe 18j). Ohne Klartext. */
	anzeigeBaustein(): Baustein<CredentialAnzeige> {
		return eins(this.db.prepare("SELECT * FROM psn_credentials WHERE id = 1"), (e) =>
			CredentialsRepository.anzeigeAus(ersteZeile<Zeile>(e)),
		);
	}

	/**
	 * Anzeige UND Zeile aus derselben Anweisung - fuer den Lage-Batch des Crons
	 * (Nachtrag 18q). Bis dahin las jeder arbeitende PSN-Aufruf die Zeile ein
	 * zweites Mal, weil die Lage nur die Anzeige weiterreichte.
	 */
	zugangBaustein(): Baustein<{ anzeige: CredentialAnzeige; zeile: ZugangsZeile | null }> {
		return eins(this.db.prepare("SELECT * FROM psn_credentials WHERE id = 1"), (e) => {
			const zeile = ersteZeile<Zeile>(e);
			return { anzeige: CredentialsRepository.anzeigeAus(zeile), zeile };
		});
	}

	private static anzeigeAus(z: Zeile | null): CredentialAnzeige {
		if (!z) {
			return {
				eingerichtet: false,
				status: null,
				npssoHinterlegtAm: null,
				npssoLaeuftAbUm: null,
				refreshLaeuftAbUm: null,
				letzterErfolgAm: null,
			};
		}
		return {
			eingerichtet: z.npsso_ciphertext !== null,
			status: z.status,
			npssoHinterlegtAm: z.npsso_stored_at,
			npssoLaeuftAbUm: z.npsso_expires_at,
			refreshLaeuftAbUm: z.refresh_expires_at,
			letzterErfolgAm: z.last_success_at,
		};
	}

	async npsso(gelesen?: ZugangsZeile | null): Promise<Geheimnis | null> {
		const z = gelesen === undefined ? await this.zeile() : gelesen;
		if (!z?.npsso_ciphertext || !z.npsso_iv) return null;
		return entschluesseln({ chiffre: z.npsso_ciphertext, iv: z.npsso_iv }, this.key);
	}

	/** Liefert den Refresh-Token nur, solange er laut Ablaufzeitpunkt gilt. */
	async gueltigerRefreshToken(jetzt = new Date(), gelesen?: ZugangsZeile | null): Promise<Geheimnis | null> {
		const z = gelesen === undefined ? await this.zeile() : gelesen;
		if (!z?.refresh_ciphertext || !z.refresh_iv) return null;
		if (z.refresh_expires_at && new Date(z.refresh_expires_at) <= jetzt) return null;
		return entschluesseln({ chiffre: z.refresh_ciphertext, iv: z.refresh_iv }, this.key);
	}

	/**
	 * Ein neues NPSSO ablegen - und den Zugang in die Zeitreihe aufnehmen
	 * (Stufe 19e, Migration 0026).
	 *
	 * Drei Anweisungen in EINEM Batch, damit Zugangsdaten und Aufzeichnung
	 * nicht auseinanderlaufen koennen:
	 *
	 *  1. Den bisher offenen Eintrag schliessen. `ersetzt_am` statt
	 *     `gestorben_am`: Wer frueh erneuert, dessen alter Zugang ist nicht
	 *     gestorben - wie lange er gehalten haette, erfaehrt niemand. Nur
	 *     abgelehnte Zugaenge sind eine Messung der Lebensdauer. Ein bereits
	 *     gestorbener Eintrag bleibt unberuehrt (die Bedingung greift nur bei
	 *     beiden NULL).
	 *  2. Den neuen Eintrag anlegen, mit Sonys Ankuendigung, falls der Nutzer
	 *     das ganze JSON eingefuegt hat.
	 *  3. Die Zugangsdaten selbst schreiben.
	 */
	async npssoSpeichern(npsso: Geheimnis, laeuftAbUm: string | null = null): Promise<void> {
		const { chiffre, iv } = await verschluesseln(npsso, this.key);
		await this.db.batch([
			this.db.prepare(
				"UPDATE psn_zugang SET ersetzt_am = datetime('now') " +
					"WHERE gestorben_am IS NULL AND ersetzt_am IS NULL",
			),
			this.db
				.prepare("INSERT INTO psn_zugang (angekuendigt_bis) VALUES (?)")
				.bind(laeuftAbUm),
			this.db
				.prepare(
					"INSERT INTO psn_credentials (id, status, npsso_ciphertext, npsso_iv, npsso_stored_at, npsso_expires_at) " +
						"VALUES (1, 'ok', ?, ?, datetime('now'), ?) " +
						"ON CONFLICT(id) DO UPDATE SET status = 'ok', npsso_ciphertext = excluded.npsso_ciphertext, " +
						"npsso_iv = excluded.npsso_iv, npsso_stored_at = excluded.npsso_stored_at, " +
						"npsso_expires_at = excluded.npsso_expires_at",
				)
				.bind(chiffre, iv, laeuftAbUm),
		]);
	}

	/**
	 * Das Access Token, wenn es noch mindestens ACCESS_RESTZEIT_MS gilt
	 * (Nachtrag 18q). Ohne Zeile, ohne Token oder zu knapp: null - dann wird
	 * erneuert. Liest selbst nichts: Die Zeile kommt vom Aufrufer.
	 */
	async gueltigerAccessToken(z: ZugangsZeile | null, jetzt = new Date()): Promise<Geheimnis | null> {
		if (!z?.access_ciphertext || !z.access_iv || !z.access_expires_at) return null;
		const bis = Date.parse(z.access_expires_at);
		if (!Number.isFinite(bis) || bis - jetzt.getTime() < ACCESS_RESTZEIT_MS) return null;
		return entschluesseln({ chiffre: z.access_ciphertext, iv: z.access_iv }, this.key);
	}

	/**
	 * Refresh- und Access Token einer frischen Sitzung in EINER Anweisung
	 * (Nachtrag 18q). Das Refresh-Token rotiert - deshalb bleibt das ein
	 * eigener Schreibvorgang VOR der Arbeit: Bricht die Laufzeit danach ab, ist
	 * das neue Token trotzdem gesichert.
	 */
	async sitzungSpeichern(s: {
		refreshToken: Geheimnis;
		refreshLaeuftAbUm: string;
		accessToken: Geheimnis;
		accessLaeuftAbUm: string;
	}): Promise<void> {
		const refresh = await verschluesseln(s.refreshToken, this.key);
		const access = await verschluesseln(s.accessToken, this.key);
		await this.db
			.prepare(
				"UPDATE psn_credentials SET refresh_ciphertext = ?, refresh_iv = ?, refresh_expires_at = ?, " +
					"access_ciphertext = ?, access_iv = ?, access_expires_at = ? WHERE id = 1",
			)
			.bind(refresh.chiffre, refresh.iv, s.refreshLaeuftAbUm, access.chiffre, access.iv, s.accessLaeuftAbUm)
			.run();
	}

	/**
	 * Nur das Refresh-Token - ein gespeichertes Access Token gehoert dann nicht
	 * mehr zur Kette und wird verworfen.
	 */
	async refreshTokenSpeichern(token: Geheimnis, laeuftAbUm: string): Promise<void> {
		const { chiffre, iv } = await verschluesseln(token, this.key);
		await this.db
			.prepare(
				"UPDATE psn_credentials SET refresh_ciphertext = ?, refresh_iv = ?, " +
					"refresh_expires_at = ?, access_ciphertext = NULL, access_iv = NULL, access_expires_at = NULL WHERE id = 1",
			)
			.bind(chiffre, iv, laeuftAbUm)
			.run();
	}

	/**
	 * Ein altes 'fehler' wegraeumen, wenn ein PSN-Abruf wieder geglueckt ist
	 * (Stufe 18e). 'abgelaufen' bleibt unberuehrt - das raeumt nur ein neues
	 * NPSSO weg -, und `last_success_at` bleibt dem Sync vorbehalten: Es
	 * bedeutet "der Trophaeenstand ist von da".
	 */
	async fehlerStatusLoeschen(): Promise<void> {
		await this.fehlerStatusLoeschenAnweisung().run();
	}

	/** Dasselbe als Anweisung fuer den Batch eines Schritts (Stufe 18o). */
	/** Dasselbe als Baustein - zum Buendeln mit dem Stand eines Schritts (Stufe 18p). */
	fehlerStatusLoeschenBaustein(): Baustein<void> {
		return { anweisungen: [this.fehlerStatusLoeschenAnweisung()], lesen: () => undefined };
	}

	fehlerStatusLoeschenAnweisung(): D1PreparedStatement {
		return this.db.prepare("UPDATE psn_credentials SET status = 'ok' WHERE id = 1 AND status = 'fehler'");
	}

	/**
	 * Zustand setzen - und bei 'abgelaufen' den Zugang als gestorben stempeln
	 * (Stufe 19e).
	 *
	 * Das ist der Punkt, an dem eine Lebensdauer entsteht: PSN hat den Zugang
	 * abgelehnt, also ist er zu Ende, und die Spanne zwischen
	 * `eingetragen_am` und jetzt ist die gesuchte Zahl. Im selben Batch wie
	 * die Statusaenderung, damit nicht das eine ohne das andere passiert.
	 */
	async statusSetzen(status: CredentialStatus): Promise<void> {
		const anweisungen = [
			this.db.prepare("UPDATE psn_credentials SET status = ? WHERE id = 1").bind(status),
		];
		if (status === "abgelaufen") {
			anweisungen.push(
				this.db.prepare(
					"UPDATE psn_zugang SET gestorben_am = datetime('now') " +
						"WHERE gestorben_am IS NULL AND ersetzt_am IS NULL",
				),
			);
		}
		await this.db.batch(anweisungen);
	}

	async erfolgVermerken(): Promise<void> {
		await this.db.batch(this.erfolgVermerkenBaustein().anweisungen);
	}

	/** Dasselbe als Baustein - fuer den Abschluss-Batch des Syncs (Stufe 18p). */
	erfolgVermerkenBaustein(): Baustein<void> {
		return {
			lesen: () => undefined,
			anweisungen: [
			this.db.prepare(
				"UPDATE psn_credentials SET status = 'ok', last_success_at = datetime('now') WHERE id = 1",
			),
			// Derselbe Stempel am offenen Zugang: Er sagt spaeter, bis wann
			// dieser Zugang nachweislich funktioniert hat - die untere
			// Schranke seiner Lebensdauer, auch wenn er nie abgelehnt wird.
			this.db.prepare(
				"UPDATE psn_zugang SET letzter_erfolg_am = datetime('now') " +
					"WHERE gestorben_am IS NULL AND ersetzt_am IS NULL",
			),
			],
		};
	}

	/**
	 * Die kuerzeste gemessene Lebensdauer eines Zugangs in Kalendertagen, oder
	 * null, solange keiner gestorben ist (Stufe 18m). Nur `gestorben_am` ist
	 * eine Messung - ein ersetzter Zugang haette vielleicht laenger gehalten
	 * (7.1). Kalendertage wie in 7.1: eingetragen am 04.09., abgelehnt am
	 * 29.09. sind 25 Tage. Die Tabelle hat eine Zeile je Zugang - wenige.
	 */
	async kuerzesteLebensdauer(): Promise<number | null> {
		return einzeln(this.db, this.lebensdauerBaustein());
	}

	lebensdauerBaustein(): Baustein<number | null> {
		return eins(
			this.db.prepare(
				"SELECT CAST(MIN(julianday(date(gestorben_am)) - julianday(date(eingetragen_am))) AS INTEGER) AS tage " +
					"FROM psn_zugang WHERE gestorben_am IS NOT NULL",
			),
			(e) => ersteZeile<{ tage: number | null }>(e)?.tage ?? null,
		);
	}

	/**
	 * Die aufgezeichneten Zugaenge, neueste zuerst (Stufe 19e).
	 *
	 * Fuer die Anzeige in den Einstellungen und als Grundlage der Frage, wie
	 * lange ein Zugang wirklich haelt. Enthaelt nur Zeitpunkte.
	 */
	async zugaenge(limit = 6): Promise<ZugangZeile[]> {
		const { results } = await this.db
			.prepare(
				"SELECT id, eingetragen_am, angekuendigt_bis, letzter_erfolg_am, gestorben_am, ersetzt_am " +
					"FROM psn_zugang ORDER BY id DESC LIMIT ?",
			)
			.bind(limit)
			.all<ZugangZeile>();
		return results;
	}
}

/** Eine Zeile aus psn_zugang - ausschliesslich Zeitpunkte, nie ein Token. */
export type ZugangZeile = {
	id: number;
	eingetragen_am: string;
	angekuendigt_bis: string | null;
	letzter_erfolg_am: string | null;
	gestorben_am: string | null;
	ersetzt_am: string | null;
};
