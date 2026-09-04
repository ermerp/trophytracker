import { entschluesseln, verschluesseln } from "../domain/crypto";
import { Geheimnis } from "../domain/secret";

export type CredentialStatus = "ok" | "abgelaufen" | "fehler";

/**
 * Zustand der PSN-Zugangsdaten fuer die Anzeige.
 * Enthaelt bewusst keine Geheimnisse - dieses Objekt geht an die Oberflaeche.
 */
export type CredentialAnzeige = {
	eingerichtet: boolean;
	status: CredentialStatus | null;
	npssoHinterlegtAm: string | null;
	refreshLaeuftAbUm: string | null;
	letzterErfolgAm: string | null;
};

type Zeile = {
	status: CredentialStatus;
	npsso_ciphertext: string | null;
	npsso_iv: string | null;
	npsso_stored_at: string | null;
	refresh_ciphertext: string | null;
	refresh_iv: string | null;
	refresh_expires_at: string | null;
	last_success_at: string | null;
};

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

	async anzeige(): Promise<CredentialAnzeige> {
		const z = await this.zeile();
		if (!z) {
			return {
				eingerichtet: false,
				status: null,
				npssoHinterlegtAm: null,
				refreshLaeuftAbUm: null,
				letzterErfolgAm: null,
			};
		}
		return {
			eingerichtet: z.npsso_ciphertext !== null,
			status: z.status,
			npssoHinterlegtAm: z.npsso_stored_at,
			refreshLaeuftAbUm: z.refresh_expires_at,
			letzterErfolgAm: z.last_success_at,
		};
	}

	async npsso(): Promise<Geheimnis | null> {
		const z = await this.zeile();
		if (!z?.npsso_ciphertext || !z.npsso_iv) return null;
		return entschluesseln({ chiffre: z.npsso_ciphertext, iv: z.npsso_iv }, this.key);
	}

	/** Liefert den Refresh-Token nur, solange er laut Ablaufzeitpunkt gilt. */
	async gueltigerRefreshToken(jetzt = new Date()): Promise<Geheimnis | null> {
		const z = await this.zeile();
		if (!z?.refresh_ciphertext || !z.refresh_iv) return null;
		if (z.refresh_expires_at && new Date(z.refresh_expires_at) <= jetzt) return null;
		return entschluesseln({ chiffre: z.refresh_ciphertext, iv: z.refresh_iv }, this.key);
	}

	async npssoSpeichern(npsso: Geheimnis): Promise<void> {
		const { chiffre, iv } = await verschluesseln(npsso, this.key);
		await this.db
			.prepare(
				"INSERT INTO psn_credentials (id, status, npsso_ciphertext, npsso_iv, npsso_stored_at) " +
					"VALUES (1, 'ok', ?, ?, datetime('now')) " +
					"ON CONFLICT(id) DO UPDATE SET status = 'ok', npsso_ciphertext = excluded.npsso_ciphertext, " +
					"npsso_iv = excluded.npsso_iv, npsso_stored_at = excluded.npsso_stored_at",
			)
			.bind(chiffre, iv)
			.run();
	}

	async refreshTokenSpeichern(token: Geheimnis, laeuftAbUm: string): Promise<void> {
		const { chiffre, iv } = await verschluesseln(token, this.key);
		await this.db
			.prepare(
				"UPDATE psn_credentials SET refresh_ciphertext = ?, refresh_iv = ?, " +
					"refresh_expires_at = ? WHERE id = 1",
			)
			.bind(chiffre, iv, laeuftAbUm)
			.run();
	}

	async statusSetzen(status: CredentialStatus): Promise<void> {
		await this.db
			.prepare("UPDATE psn_credentials SET status = ? WHERE id = 1")
			.bind(status)
			.run();
	}

	async erfolgVermerken(): Promise<void> {
		await this.db
			.prepare(
				"UPDATE psn_credentials SET status = 'ok', last_success_at = datetime('now') WHERE id = 1",
			)
			.run();
	}
}
