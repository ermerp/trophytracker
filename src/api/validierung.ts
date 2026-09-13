/** Gemeinsame Pruefmuster der Routen. */
export const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Liest den JSON-Koerper; null bei ungueltigem JSON oder Nicht-Objekt. */
export async function liesJson(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown> | null> {
	try {
		const k = await c.req.json();
		return k !== null && typeof k === "object" ? (k as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/**
 * Optionales Datumsfeld: fehlt/null/"" → null, gueltig → Wert, sonst Fehler.
 * Rueckgabe undefined bedeutet "Feld nicht im Koerper".
 */
export function pruefeDatum(
	k: Record<string, unknown>,
	feld: string,
): { wert: string | null } | { fehler: string } {
	const v = k[feld];
	if (v === undefined || v === null || v === "") return { wert: null };
	if (typeof v === "string" && ISO_DATUM.test(v)) return { wert: v };
	return { fehler: `Feld '${feld}' muss die Form JJJJ-MM-TT haben.` };
}
