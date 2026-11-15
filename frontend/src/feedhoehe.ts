/**
 * Wie viele Einträge des Feeds „Neu" ganz in die rechte Spalte passen
 * (Stufe f2d) – die Rechnung ohne React, damit ein Test sie erreicht
 * (CLAUDE.md, „Testen, was Logik ist").
 *
 * Am Desktop ab 64 rem endet der Feed auf der Unterkante der linken Spalte.
 * Die Einträge sind verschieden hoch (ein- oder mehrzeiliger Text), deshalb
 * schwankt ihre Zahl; abgeschnitten wird auf ganze Einträge, nie mitten in
 * einer Zeile. Was nicht passt, steht unter „alle" (`/aenderungen`).
 */

/** So viele Zeilen holt das Handy – die Zahl von vor Stufe f2d. */
export const FEED_HANDY = 8

/**
 * So viele holt der Desktop, und mehr liefert der Worker nicht
 * (`FEED_HOECHSTENS` in `src/api/feed.ts` – dieselbe Zahl).
 *
 * Gemessen am 15.11.2026 mit erfundenen Daten: Die linke Spalte ist bei
 * 1280×900 und 2030×1100 rund 740 px hoch, der Platz für Einträge also rund
 * 720 px; der niedrigste Eintrag (eine Zeile Titel, eine Zeile Text) ist
 * rund 52 px hoch. Das sind 13 bis 14 Einträge; 20 lässt Luft für eine
 * höhere linke Spalte (mehr Jahre, ein größeres Fenster).
 */
export const FEED_DESKTOP = 20

/**
 * Bruchteile eines Pixels, die eine Summe über `getBoundingClientRect`
 * überstehen darf. Höhen wie 52,3 px addieren sich mit Rundungsfehlern; ohne
 * Spielraum fiele der letzte Eintrag weg, obwohl er sichtbar ganz passt.
 */
const SPIELRAUM = 0.5

/**
 * Die Zahl der Einträge von vorn, deren Höhen zusammen in `platz` passen.
 *
 * Nur von vorn: Der Feed ist nach Zeit geordnet, ein kurzer älterer Eintrag
 * rückt nicht an die Stelle eines langen neueren. Ein ungültiger Platz
 * (`NaN`, negativ) zeigt nichts statt alles.
 */
export function passendeEintraege(hoehen: readonly number[], platz: number): number {
	if (!(platz > 0)) return 0
	let summe = 0
	for (let i = 0; i < hoehen.length; i++) {
		summe += hoehen[i]
		if (summe > platz + SPIELRAUM) return i
	}
	return hoehen.length
}
