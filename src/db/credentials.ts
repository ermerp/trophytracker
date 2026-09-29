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

	/**
	 * Ein altes 'fehler' wegraeumen, wenn ein PSN-Abruf wieder geglueckt ist
	 * (Stufe 18e). 'abgelaufen' bleibt unberuehrt - das raeumt nur ein neues
	 * NPSSO weg -, und `last_success_at` bleibt dem Sync vorbehalten: Es
	 * bedeutet "der Trophaeenstand ist von da".
	 */
	async fehlerStatusLoeschen(): Promise<void> {
		await this.db
			.prepare("UPDATE psn_credentials SET status = 'ok' WHERE id = 1 AND status = 'fehler'")
			.run();
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
		await this.db.batch([
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
		]);
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
