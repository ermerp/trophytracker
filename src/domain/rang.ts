import type { Weights } from "./weights";

/**
 * Rangformel (Abschnitt 5.2 der Spezifikation).
 *
 * Der Rang wird bei der Abfrage berechnet und nie gespeichert. Gespeichert
 * sind nur die Bestandteile - Kritikerwertung am Spiel, Prioritaet und
 * Favorit am Eintrag -, die Gewichte liegen in app_setting.
 *
 *   rang = (COALESCE(kritik, 70) / 100) * w_critic
 *        + (prioritaet / 5)             * w_priority
 *        + favorit                      * w_favorite
 *
 * Ab Stufe 10 sortiert die Wunschliste danach, Stufe 15 nutzt dieselbe
 * Funktion fuer die Kaufliste. w_price bleibt ohne Wirkung, bis Preise
 * existieren (Stufe 18).
 *
 * Reine Logik, ohne Datenbank testbar.
 */

/**
 * Ersatzwert fuer eine fehlende Kritikerwertung. Bewusst 70 und nicht 0:
 * ein Spiel ohne Wertung soll weder bevorzugt noch bestraft werden; mit 0
 * saessen unbewertete Titel dauerhaft am Listenende.
 */
export const KRITIK_ERSATZ = 70;

export type RangBestandteile = {
	kritik: number | null;
	/** 1 bis 5 */
	prioritaet: number;
	favorit: boolean;
};

export function rang(b: RangBestandteile, g: Weights): number {
	const kritik = b.kritik ?? KRITIK_ERSATZ;
	return (kritik / 100) * g.w_critic + (b.prioritaet / 5) * g.w_priority + (b.favorit ? 1 : 0) * g.w_favorite;
}
