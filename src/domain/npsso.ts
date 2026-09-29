/**
 * Das NPSSO aus dem heraussuchen, was der Nutzer einfuegt (Stufe 19e).
 *
 * Sonys Seite `ca.account.sony.com/api/v1/ssocookie` antwortet mit
 * `{"npsso":"<64 Zeichen>","expires_in":5182926}`. Bis hierher musste der
 * Nutzer genau den Teil zwischen den Anfuehrungszeichen markieren - auf einem
 * Handydisplay der unangenehmste Schritt des ganzen Vorgangs.
 *
 * Diese Funktion nimmt deshalb ALLES an: den blanken Wert, das ganze JSON,
 * die ganze Seite mit Umbruechen und Leerzeichen. Sie sucht nicht nach einer
 * Form, sondern nach dem Wert selbst - 64 Zeichen aus Buchstaben und Ziffern,
 * freistehend. Genau einer muss es sein: Bei keinem oder mehreren gibt sie
 * `null` zurueck, statt zu raten (dieselbe Haltung wie beim Matching).
 *
 * Die 64 Zeichen sind keine Annahme, sondern anderswo im Projekt schon
 * festgeschrieben: `scripts/dump-pruefen.sh` erkennt ein durchgesickertes
 * NPSSO an genau dieser Laenge (14.5).
 *
 * KEIN LOGGING hier, in keinem Zweig: Der Rueckgabewert ist ein Geheimnis
 * (Abschnitt 7.1). Die Funktion ist rein und ohne Datenbank testbar.
 */

export type NpssoEingabe = {
	/** Der Wert selbst - ab hier gehoert er in ein `Geheimnis`. */
	wert: string;
	/**
	 * Was Sony als Haltbarkeit angibt, als ISO-Zeitpunkt - oder null, wenn
	 * nur der blanke Wert eingefuegt wurde.
	 *
	 * ACHTUNG, das ist eine Ankuendigung, keine Zusage: Gemessen am
	 * 29.09.2026 hielt ein Zugang 25 Tage, obwohl 60 angekuendigt waren
	 * (Abschnitt 7.1). Der Wert wird deshalb angezeigt und aufgezeichnet,
	 * aber die Warnung haengt nicht an ihm.
	 */
	laeuftAbUm: string | null;
};

/** Freistehende 64 Zeichen aus Buchstaben und Ziffern. */
const WERT = /(?<![A-Za-z0-9])[A-Za-z0-9]{64}(?![A-Za-z0-9])/g;

/** `"expires_in": 5182926` - Sekunden, wie Sony sie mitliefert. */
const FRIST = /"expires_in"\s*:\s*(\d{1,12})/;

export function npssoAusText(text: string, jetzt: () => number = Date.now): NpssoEingabe | null {
	if (typeof text !== "string" || text.length === 0) return null;

	const treffer = text.match(WERT);
	// Genau einer. Keiner heisst "nichts Brauchbares eingefuegt", mehrere
	// heissen "ich weiss nicht, welcher" - beides ist kein Ergebnis.
	if (!treffer || treffer.length !== 1) return null;

	const frist = FRIST.exec(text);
	const sekunden = frist ? Number(frist[1]) : null;
	const laeuftAbUm =
		sekunden !== null && Number.isFinite(sekunden) && sekunden > 0
			? new Date(jetzt() + sekunden * 1000).toISOString()
			: null;

	return { wert: treffer[0], laeuftAbUm };
}
