/**
 * Eigene Bewertung eines Releases (Abschnitt 4.2).
 *
 * Die sieben Werte sind Nutzerentscheidungen. 'unentschieden' setzt nur die
 * Pruefliste, wenn ein Fall bewusst uebersprungen wird.
 */
export const PLAY_STATUS = [
	"nicht_gespielt",
	"am_spielen",
	"pausiert",
	"durchgespielt",
	"komplettiert",
	"abgebrochen",
	"unentschieden",
] as const;

export type PlayStatus = (typeof PLAY_STATUS)[number];

export function istPlayStatus(wert: unknown): wert is PlayStatus {
	return typeof wert === "string" && (PLAY_STATUS as readonly string[]).includes(wert);
}

/**
 * Die einzige Automatik, die einen Status ableitet - und sie greift nur beim
 * ersten Auftreten einer Trophaeenliste an einem Release (keine Zeile oder
 * 'nicht_gespielt'). Danach entscheidet ausschliesslich der Nutzer; jede
 * spaetere Trophaeenaenderung wandert in die Pruefliste.
 *
 * 100 % statt Platin: Platin gilt meist nur fuers Grundspiel, DLC-Trophaeen
 * zaehlen nicht hinein. 100 % ist ein Beleg fuer "fertig", Platin nicht.
 *
 * Die Vorbelegung selbst laeuft set-basiert in SQL
 * (PlayStatusRepository.vorbelegen, Migration 0006); diese Funktion haelt die
 * Regel lesbar und testbar fest.
 */
export function abgeleiteterStatus(progressPct: number): "komplettiert" | "am_spielen" | null {
	if (progressPct >= 100) return "komplettiert";
	if (progressPct > 0) return "am_spielen";
	return null;
}
