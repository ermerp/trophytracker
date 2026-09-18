/**
 * EAN-Behandlung fuer den Barcode-Scan (Abschnitt 9, Stufe 17).
 *
 * Pur und ohne Datenbank: Die Kamera liefert gepruefte EAN-13-Codes, das
 * Textfeld als Notnagel liefert Tippfehler. Beide laufen durch dieselbe
 * Normalisierung; die Pruefziffer faengt den vertippten Code ab, bevor er
 * als offener Scan in der Datenbank landet.
 */

/** Dieselbe Regel wie fuer physical_copy.ean: 8 bis 14 Ziffern. */
export const EAN_MUSTER = /^\d{8,14}$/;

/**
 * Trimmt, entfernt Leerzeichen und Bindestriche; null, wenn keine 8 bis 14
 * Ziffern bleiben.
 *
 * Ein zwoelfstelliger UPC-A wird mit fuehrender Null zur GTIN-13 - so ist
 * derselbe Code immer derselbe Eintrag, egal ob ihn die native Erkennung als
 * `upc_a` oder der Polyfill als `ean_13` liefert (Rueckmeldung des Nutzers vom
 * 18.09.2026: Horizon Forbidden West traegt einen UPC-A, 711719577997).
 * Die Pruefziffer bleibt dabei gueltig: Die fuehrende Null verschiebt die
 * Gewichte nicht, weil sie selbst das Gewicht 1 traegt.
 */
export function normalisiereEan(roh: unknown): string | null {
	if (typeof roh !== "string" && typeof roh !== "number") return null;
	const ean = String(roh).replace(/[\s-]/g, "");
	if (!EAN_MUSTER.test(ean)) return null;
	return ean.length === 12 ? `0${ean}` : ean;
}

/**
 * Modulo-10-Pruefziffer nach GS1 fuer EAN-8, UPC-A (12) und EAN-13. Andere
 * Laengen (GTIN-14 traegt sie auch, kommt auf Spielen aber nicht vor) werden
 * nicht geprueft und gelten als stimmig.
 */
export function pruefzifferStimmt(ean: string): boolean {
	if (![8, 12, 13].includes(ean.length) || !/^\d+$/.test(ean)) return true;
	const ziffern = ean.split("").map(Number);
	const pruef = ziffern.pop() as number;
	// Von rechts gezaehlt wiegt die erste Ziffer 3, die zweite 1, im Wechsel.
	let summe = 0;
	for (let i = 0; i < ziffern.length; i++) {
		const vonRechts = ziffern.length - 1 - i;
		summe += ziffern[i] * (vonRechts % 2 === 0 ? 3 : 1);
	}
	return (10 - (summe % 10)) % 10 === pruef;
}
