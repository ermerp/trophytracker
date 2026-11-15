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
 *   aufgerufener Link mit Suchparameter –, wird der Begriff per `replace`
 *   entfernt: Zurück führte sonst aus der Seite hinaus.
 * - **Filter und Sortierung während der Suche** ersetzen den Eintrag und
 *   behalten die Markierung (`stateNachFilter`). Bis f2b-c ließen sie sie
 *   fallen, weil das Zurück auf den Eintrag davor die Änderung verloren
 *   hätte; seitdem nimmt das Zurück sie mit (`nachSuche`): Zurück aus der
 *   Suche entfernt **nur den Begriff**, nie Filter oder Sortierung – ob über
 *   die Geste oder das Kreuz, beides ist derselbe Weg.
 */

import { gleicheParameter } from './filterverlauf'

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

/** Die Parameter eines Eintrags ohne Suchbegriff und Seitenzahl – was ein Zurück aus der Suche mitnimmt. */
export function ohneSuche(search: string, sucheParam: string): string {
  const p = new URLSearchParams(search)
  p.delete(sucheParam)
  // Eine Seite der Suchergebnisse ist auf der Liste ohne Suche eine andere.
  p.delete('offset')
  return p.toString()
}

/**
 * Nach einem Wechsel des Eintrags: Was ist nach dem Zurück aus der Suche auf
 * den jetzigen Eintrag zu übernehmen? Dasselbe Muster wie `nachTafel`.
 *
 * @param warSuche ob der Eintrag davor unser Such-Eintrag war (in derselben Ansicht)
 * @param state `location.state` des jetzigen Eintrags
 * @param zurueck ob der Wechsel ein Zurück war (`POP`)
 * @param mitnehmen `ohneSuche` des Such-Eintrags, wie er zuletzt galt
 * @param jetzt die Parameter des jetzigen Eintrags
 * @returns die zu schreibenden Parameter, oder `null`, wenn nichts zu tun ist
 */
export function nachSuche(
  warSuche: boolean,
  state: unknown,
  zurueck: boolean,
  mitnehmen: string | null,
  jetzt: string,
  sucheParam: string,
): string | null {
  if (!warSuche || vonDerSuche(state) || !zurueck || mitnehmen === null) return null
  if (gleicheParameter(mitnehmen, ohneSuche(jetzt, sucheParam))) return null
  // Ein Begriff, den der Eintrag davor selbst trägt, bleibt seiner.
  const neu = new URLSearchParams(mitnehmen)
  const begriff = new URLSearchParams(jetzt).get(sucheParam)
  if (begriff) neu.set(sucheParam, begriff)
  return neu.toString()
}
