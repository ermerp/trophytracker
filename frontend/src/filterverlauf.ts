/**
 * Die Filtertafel im Browserverlauf (Stufe f2b) – die Logik ohne React, damit
 * ein Test sie erreicht. Dasselbe Muster wie `suchverlauf.ts`.
 *
 * Wunsch des Nutzers: Die Zurück-Geste am Handy (und Browser-Zurück) schließt
 * die offene Tafel, statt die Ansicht zu verlassen.
 *
 * - **Öffnen** legt einen Eintrag mit derselben URL an, markiert mit
 *   `state.filtertafel`. Ob die Tafel offen ist, steht damit im Eintrag
 *   selbst, nicht in einem React-Zustand: Zurück schließt sie von allein.
 * - **Filter in der Tafel** ersetzen den Eintrag (`replace`) und behalten die
 *   Markierung – die Tafel bleibt offen, ein Zurück schließt sie weiterhin.
 *   Die Such-Markierung fällt dabei, wie bisher bei jedem Chip
 *   (`suchverlauf.ts`): Ihr Eintrag davor trüge sonst die alten Filter.
 * - **Schließen** über „Filter" oder „zurücksetzen" geht zurück, wenn der
 *   Eintrag unserer ist – ein zweiter Eintrag läge doppelt im Verlauf.
 * - **Nach dem Zurück** trägt der Eintrag davor noch die Filter von vor dem
 *   Öffnen. Was in der Tafel gesetzt wurde, wird deshalb auf ihn
 *   übernommen (`replace`) – sonst nähme das Zurück die Filter mit.
 *
 * Die Such-Markierung wird beim Öffnen NICHT mitgenommen: Steht der Eintrag
 * davor auf einer Suche und trüge der Tafel-Eintrag `suche` mit, ginge ein
 * Leeren des Suchfelds bei offener Tafel per Zurück auf die Suche zurück –
 * die Suche stünde wieder da und die Tafel wäre zu.
 */

/** Die Markierung im `location.state` eines Eintrags, den die Tafel angelegt hat. */
export const TAFEL_STATE = { filtertafel: true } as const

type Objekt = Record<string, unknown>
const istObjekt = (state: unknown): state is Objekt => typeof state === 'object' && state !== null

/** Ob ein Eintrag die offene Tafel trägt. */
export function tafelOffen(state: unknown): boolean {
  return istObjekt(state) && state.filtertafel === true
}

/** Der `state` des neuen Eintrags beim Öffnen: fremde Schlüssel bleiben, die Such-Markierung nicht. */
export function stateZumOeffnen(state: unknown): Objekt {
  const rest: Objekt = istObjekt(state) ? { ...state } : {}
  delete rest.suche
  return { ...rest, ...TAFEL_STATE }
}

/** Der `state` beim Ersetzen durch einen Filter-Chip: nur die Tafel-Markierung bleibt. */
export function stateNachFilter(state: unknown): typeof TAFEL_STATE | null {
  return tafelOffen(state) ? TAFEL_STATE : null
}

/** Schließen über „Filter" oder „zurücksetzen": zurück, wenn der Eintrag unserer ist. */
export function schliessSchritt(state: unknown): 'zurueck' | 'keiner' {
  return tafelOffen(state) ? 'zurueck' : 'keiner'
}

/**
 * Nach einem Wechsel des Eintrags: Was ist auf den jetzigen zu übernehmen?
 *
 * @param warOffen ob der Eintrag davor die Tafel trug
 * @param state `location.state` des jetzigen Eintrags
 * @param zurueck ob der Wechsel ein Zurück war (`POP`), kein neuer Eintrag
 * @param mitnehmen die Parameter, die in der Tafel zuletzt galten (oder die „zurücksetzen" will)
 * @param jetzt die Parameter des jetzigen Eintrags
 * @returns die zu schreibenden Parameter, oder `null`, wenn nichts zu tun ist
 */
export function nachTafel(warOffen: boolean, state: unknown, zurueck: boolean, mitnehmen: string | null, jetzt: string): string | null {
  if (!warOffen || tafelOffen(state) || !zurueck || mitnehmen === null) return null
  return gleicheParameter(mitnehmen, jetzt) ? null : mitnehmen
}

/** Zwei Suchstrings, unabhängig von der Reihenfolge der Schlüssel. */
function gleicheParameter(a: string, b: string): boolean {
  const ordnen = (s: string) => {
    const p = new URLSearchParams(s)
    p.sort()
    return p.toString()
  }
  return ordnen(a) === ordnen(b)
}
