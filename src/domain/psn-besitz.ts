/**
 * Spielzeit und digitaler Besitz aus PSN (Abschnitt 7.7, Stufe 18c).
 *
 * Zwei reine Funktionen - alles, was an den beiden neuen Endpunkten
 * gerechnet werden muss. Ohne Datenbank testbar; die Faelle stammen aus der
 * Messung gegen das echte Konto am 21.09.2026.
 */

/**
 * Die einzigen Plattformen, fuer die es Spielzeit gibt. PS3 und Vita fehlen
 * hier mit Absicht: Sony erfasst sie erst seit der PS4 (7.7).
 */
export type SpielzeitPlattform = "PS4" | "PS5";

/**
 * ISO-8601-Dauer in Sekunden. Sony schreibt "PT12H59S", "PT1H30M2S",
 * gelegentlich auch "P1DT2H".
 *
 * Nicht Lesbares ergibt null, nicht 0: Eine fehlende Spielzeit ist
 * "unbekannt" und darf nie als "nie gespielt" gelesen werden (Abschnitt 3).
 */
export function dauerInSekunden(iso: string | null | undefined): number | null {
	if (typeof iso !== "string") return null;
	const treffer = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso.trim());
	if (!treffer) return null;
	const [, tage, stunden, minuten, sekunden] = treffer;
	if (!tage && !stunden && !minuten && !sekunden) return null;
	return (
		Number(tage ?? 0) * 86400 +
		Number(stunden ?? 0) * 3600 +
		Number(minuten ?? 0) * 60 +
		Math.round(Number(sekunden ?? 0))
	);
}

/**
 * Die Plattform aus Sonys `category`, oder null fuer alles, was kein Spiel
 * ist.
 *
 * Gemessen kamen vor: ps5_native_game, ps4_game, ps4_nongame_mini_app,
 * ps4_videoservice_web_app, ps5_web_based_media_app, ps5_native_media_app,
 * unknown, not_found. Nur die beiden Spiel-Kategorien zaehlen - Streaming-
 * Apps und Unbestimmtes fallen heraus, bevor irgendetwas gespeichert wird.
 *
 * PS3 und Vita tauchen hier grundsaetzlich nicht auf: Sony erfasst
 * Spielzeit erst seit der PS4 (7.7).
 */
export function plattformAusKategorie(kategorie: string | null | undefined): SpielzeitPlattform | null {
	if (kategorie === "ps4_game") return "PS4";
	if (kategorie === "ps5_native_game") return "PS5";
	return null;
}

/**
 * Sekunden als lesbare Spielzeit - nie "0 h", nie eine Nachkommastelle zu
 * viel.
 *
 * Unter zehn Stunden mit einer Nachkommastelle, sonst gerundet: Bei kurzen
 * Zeiten ist der Unterschied zwischen 1,5 und 2 Stunden spuerbar, bei 87
 * Stunden nicht. `null` bleibt "unbekannt" - PS3 und Vita liefern nie eine
 * Spielzeit (Abschnitt 3).
 */
export function spielzeitText(sekunden: number | null): string {
	if (sekunden === null) return "unbekannt";
	if (sekunden < 60) return "unter 1 min";
	if (sekunden < 3600) return `${Math.round(sekunden / 60)} min`;
	const stunden = sekunden / 3600;
	if (stunden < 10) return `${stunden.toFixed(1).replace(".", ",")} h`;
	return `${Math.round(stunden)} h`;
}

/**
 * Stimmt Sonys Reihenfolge noch? (Stufe 18o, 7.7)
 *
 * Die naechtliche Spitze verlaesst sich darauf, dass die Liste absteigend nach
 * "zuletzt gespielt" kommt - das ist gemessen, nicht zugesagt, und die
 * Anbindung ist inoffiziell. Titel ohne Datum zaehlen nicht mit: Es gibt sie
 * (einen von 303 am 04.11.2026), und sie sagen nichts ueber die Reihenfolge.
 */
export function absteigendNachLetztemSpiel(titel: ReadonlyArray<{ lastPlayedDateTime?: string }>): boolean {
	let vorher = Number.POSITIVE_INFINITY;
	for (const t of titel) {
		const zeit = t.lastPlayedDateTime ? Date.parse(t.lastPlayedDateTime) : Number.NaN;
		if (Number.isNaN(zeit)) continue;
		if (zeit > vorher) return false;
		vorher = zeit;
	}
	return true;
}

/**
 * Reicht die Spitze ueber diese Seite hinaus? (Stufe 18o)
 *
 * Ja, solange auch der aelteste Titel der Seite noch auf oder nach `bis`
 * gespielt wurde - dann kann dahinter Neues liegen. Eine Seite ohne Datum
 * reicht nicht weiter: Dort gibt es nichts, woran man das festmachen koennte.
 */
export function spitzeReichtWeiter(titel: ReadonlyArray<{ lastPlayedDateTime?: string }>, bis: string): boolean {
	const zeiten = titel.flatMap((t) => {
		const zeit = t.lastPlayedDateTime ? Date.parse(t.lastPlayedDateTime) : Number.NaN;
		return Number.isNaN(zeit) ? [] : [zeit];
	});
	return zeiten.length > 0 && Math.min(...zeiten) >= Date.parse(bis);
}
