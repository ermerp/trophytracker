/**
 * Ein Baustein: eine Anweisung und die Auswertung ihres Ergebnisses
 * (Stufe 18j, Abschnitt 10.1).
 *
 * Warum es das gibt: Ein D1-Aufruf kostet rund 0,7 ms CPU, eine Anweisung in
 * einem Batch ein Zwanzigstel davon (18h). Der Cron liest deshalb seine ganze
 * Lage in EINEM Batch - aber die Portionsknoepfe in den Einstellungen
 * brauchen dieselben Auswahlen einzeln. Stuende die Abfrage zweimal da,
 * liefen beide Wege still auseinander (die Lehre aus 18e: der Knopf erbte
 * nicht, was der Cron konnte). Der Baustein ist die eine Definition; das
 * Repository fuehrt ihn allein aus, `cronLage` fuegt ihn in den Batch.
 */
export type Baustein<T> = {
	/** Mehr als eine nur, wenn sie zusammengehoeren - etwa Protokoll und UPDATE (8.5). */
	anweisungen: D1PreparedStatement[];
	lesen: (ergebnisse: D1Result[]) => T;
};

/** Ein Baustein aus einer Anweisung. */
export function eins<T>(anweisung: D1PreparedStatement, lesen: (ergebnis: D1Result) => T): Baustein<T> {
	return { anweisungen: [anweisung], lesen: ([e]) => lesen(e) };
}

/** Einen Baustein allein ausfuehren - ein D1-Aufruf. */
export async function einzeln<T>(db: D1Database, b: Baustein<T>): Promise<T> {
	if (b.anweisungen.length === 1) return b.lesen([await b.anweisungen[0].all()]);
	return b.lesen(await db.batch(b.anweisungen));
}

/** Die Zeilen eines Ergebnisses, typisiert. */
export const zeilen = <T>(e: D1Result) => (e.results ?? []) as T[];

/** Die erste Zeile eines Ergebnisses oder null. */
export const ersteZeile = <T>(e: D1Result) => ((e.results ?? [])[0] as T | undefined) ?? null;

/** Wie viele Zeilen eine schreibende Anweisung geaendert hat. */
export const geaendert = (e: D1Result) => e.meta.changes ?? 0;
