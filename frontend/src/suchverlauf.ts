/**
 * Wie ein neuer Suchbegriff in den Browserverlauf kommt – die Logik ohne
 * React, damit ein Test sie erreicht (CLAUDE.md, „Testen, was Logik ist").
 *
 * Vorher ersetzte jede Eingabe den aktuellen Eintrag, und die Zurück-Geste
 * am Handy verliess mit der Suche gleich die ganze Liste. Jetzt:
 *
 * - **kein Begriff → Begriff** legt einen Eintrag an (`push`) und markiert
 *   ihn als unseren (`state.suche`). Zurück landet auf derselben Liste ohne
 *   Suche.
 * - **Begriff → anderer Begriff** ersetzt ihn (`replace`) und behält die
 *   Markierung – Tippen soll keine Kette von Einträgen hinterlassen.
 * - **Begriff → leer** geht zurück (`zurueck`), wenn der Eintrag unserer
 *   ist: Der Eintrag davor ist genau die Liste ohne Suche, ein weiterer
 *   Eintrag läge doppelt im Verlauf. Ist er **nicht** unserer – ein
 *   aufgerufener Link mit Suchparameter, oder ein Chip oder die Sortierung
 *   haben ihn seitdem ersetzt und die Markierung dabei fallen lassen –, wird
 *   der Begriff wie bisher per `replace` entfernt: Zurück führte sonst aus
 *   der Seite hinaus oder nähme den Filter mit.
 */

export type SuchSchritt = 'keiner' | 'push' | 'replace' | 'zurueck'

/** Die Markierung im `location.state` eines Eintrags, den die Suche angelegt hat. */
export const SUCH_STATE = { suche: true } as const

/** Ob ein `location.state` von der Suche stammt. Alles andere – `null`, fremde Objekte – nicht. */
export function vonDerSuche(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { suche?: unknown }).suche === true
}

/**
 * @param vorher der Begriff, der jetzt in der URL steht
 * @param nachher der Begriff, der hinein soll
 * @param state `location.state` des aktuellen Eintrags
 */
export function suchSchritt(vorher: string, nachher: string, state: unknown): SuchSchritt {
  if (vorher === nachher) return 'keiner'
  if (vorher === '') return 'push'
  if (nachher !== '') return 'replace'
  return vonDerSuche(state) ? 'zurueck' : 'replace'
}
