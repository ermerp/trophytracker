/**
 * Blaetterung ueber die PSN-Trophaeenliste.
 *
 * Die Rohantworten werden unveraendert gespeichert und bewusst NICHT geparst
 * (Abschnitt 7.1). Fuer die Blaetterung wird nur totalItemCount gebraucht -
 * die schmale Regex spart gegenueber einem vollen JSON.parse je Seite die
 * teuerste Einzelposition im 10-ms-CPU-Budget.
 *
 * Reine Funktionen, ohne Netz und ohne Datenbank testbar.
 */

/** Seitengroesse. PSN erlaubt mehr, aber groessere Seiten kosten CPU beim Kopieren. */
export const SEITENGROESSE = 100;

/** Wie viele Seiten ein einzelner Aufruf hoechstens holt. */
export const SEITEN_JE_AUFRUF = 2;

const TOTAL_REGEX = /"totalItemCount"\s*:\s*(\d+)/;

/**
 * Zieht totalItemCount aus einer Rohantwort. Erst per Regex, bei Misserfolg
 * per JSON.parse - die Regex koennte an einer geaenderten Formatierung
 * scheitern, und ein stiller Abbruch der Blaetterung waere schlimmer als der
 * teurere Pfad.
 */
export function extractTotalItemCount(raw: string): number | null {
	const treffer = TOTAL_REGEX.exec(raw);
	if (treffer) {
		const n = Number(treffer[1]);
		if (Number.isSafeInteger(n) && n >= 0) return n;
	}

	try {
		const wert = (JSON.parse(raw) as { totalItemCount?: unknown }).totalItemCount;
		if (typeof wert === "number" && Number.isSafeInteger(wert) && wert >= 0) return wert;
	} catch {
		// fällt unten auf null
	}
	return null;
}

/**
 * Naechster Offset, oder null wenn alles geholt ist.
 * Ist total unbekannt, wird abgebrochen statt endlos weiterzublaettern.
 */
export function naechsterOffset(
	offset: number,
	limit: number,
	total: number | null,
): number | null {
	if (total === null) return null;
	const naechster = offset + limit;
	return naechster < total ? naechster : null;
}
