/**
 * Gewichte der Rangformel (Abschnitt 5.2 der Spezifikation).
 *
 * Der Rang wird bei der Abfrage berechnet und nie gespeichert. Gespeichert
 * werden nur die Bestandteile; die Gewichte liegen in app_setting und sind
 * in den Einstellungen verstellbar. Eine geaenderte Gewichtung ist damit ein
 * Zahlenwechsel statt einer Datenmigration.
 *
 * Reine Logik, ohne Datenbank testbar.
 */

export const WEIGHT_KEYS = ["w_critic", "w_priority", "w_favorite", "w_price"] as const;

export type WeightKey = (typeof WEIGHT_KEYS)[number];

export type Weights = Record<WeightKey, number>;

/**
 * Vorbelegung, identisch mit dem Seed aus Migration 0001. Sie dient als
 * Rueckfallebene, falls ein Schluessel in app_setting fehlt - etwa weil eine
 * kuenftige Migration einen neuen Faktor einfuehrt, den ein aelterer
 * Datenbestand noch nicht kennt.
 *
 * w_price bleibt 0, bis Preise existieren.
 */
export const DEFAULT_WEIGHTS: Weights = {
	w_critic: 0.5,
	w_priority: 0.3,
	w_favorite: 0.2,
	w_price: 0,
};

export class WeightsError extends Error {}

/**
 * Prueft eine Eingabe aus dem Netz und gibt sie als Weights zurueck.
 * Wirft WeightsError mit einer Meldung in der Sprache der Oberflaeche.
 */
export function parseWeights(input: unknown): Weights {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		throw new WeightsError("Erwartet wird ein Objekt mit den vier Gewichten.");
	}

	const roh = input as Record<string, unknown>;

	const unbekannt = Object.keys(roh).filter(
		(k) => !(WEIGHT_KEYS as readonly string[]).includes(k),
	);
	if (unbekannt.length > 0) {
		throw new WeightsError(`Unbekannte Gewichte: ${unbekannt.join(", ")}`);
	}

	const ergebnis = {} as Weights;
	for (const key of WEIGHT_KEYS) {
		const wert = roh[key];
		if (typeof wert !== "number" || !Number.isFinite(wert)) {
			throw new WeightsError(`${key} fehlt oder ist keine Zahl.`);
		}
		if (wert < 0 || wert > 1) {
			throw new WeightsError(`${key} muss zwischen 0 und 1 liegen, war ${wert}.`);
		}
		ergebnis[key] = wert;
	}
	return ergebnis;
}
