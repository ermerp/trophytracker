/** Gemeinsame Antwortbausteine der Routen. */

export type Platin = "erspielt" | "offen" | "nicht_verfuegbar";

/** Platin dreiwertig: 93 der 431 Listen haben gar kein Platin, dort waere "offen" falsch. */
export function platinAus(definiert: number | null, erspielt: number | null): Platin {
	if ((definiert ?? 0) === 0) return "nicht_verfuegbar";
	return (erspielt ?? 0) > 0 ? "erspielt" : "offen";
}
