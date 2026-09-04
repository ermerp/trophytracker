import {
	DEFAULT_WEIGHTS,
	WEIGHT_KEYS,
	type Weights,
	type WeightKey,
} from "../domain/weights";

/**
 * Zugriff auf app_setting. Einziger Ort, an dem die Gewichte gelesen und
 * geschrieben werden.
 */
export class SettingsRepository {
	constructor(private readonly db: D1Database) {}

	/**
	 * Liest die Gewichte. Fehlende Schluessel werden aus DEFAULT_WEIGHTS
	 * ergaenzt, statt einen Fehler zu werfen: ein neuer Faktor aus einer
	 * kuenftigen Migration soll die Rangberechnung nicht lahmlegen.
	 */
	async getWeights(): Promise<Weights> {
		const { results } = await this.db
			.prepare("SELECT key, value FROM app_setting WHERE key IN (?, ?, ?, ?)")
			.bind(...WEIGHT_KEYS)
			.all<{ key: string; value: string }>();

		const gewichte: Weights = { ...DEFAULT_WEIGHTS };
		for (const zeile of results) {
			const zahl = Number(zeile.value);
			if (Number.isFinite(zahl)) {
				gewichte[zeile.key as WeightKey] = zahl;
			}
		}
		return gewichte;
	}

	/**
	 * Schreibt alle vier Gewichte als Batch, damit nie eine halbe
	 * Gewichtung entsteht.
	 */
	async setWeights(gewichte: Weights): Promise<void> {
		const anweisung = this.db.prepare(
			"INSERT INTO app_setting (key, value) VALUES (?, ?) " +
				"ON CONFLICT(key) DO UPDATE SET value = excluded.value",
		);
		await this.db.batch(
			WEIGHT_KEYS.map((key) => anweisung.bind(key, String(gewichte[key]))),
		);
	}
}
