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

/*
 * Das Sortiermenü (Nachtrag f2b-c) folgt demselben Muster mit eigener
 * Markierung `state.sortiermenue`:
 *
 * - **Öffnen** legt einen Eintrag mit derselben URL an. Eine offene Tafel
 *   bleibt darin markiert (Tafel → Menü → Zurück: Menü zu, Tafel offen),
 *   die Such-Markierung fällt aus demselben Grund wie bei der Tafel.
 * - **Kriterium wählen** ersetzt den Menü-Eintrag mit der neuen Sortierung
 *   (die Markierung bleibt über `stateNachFilter`), danach geht das Menü
 *   zurück und übernimmt die Sortierung auf den Eintrag davor – wie die
 *   Tafel ihre Filter. So bleibt kein Eintrag verwaist, und ein Zurück
 *   danach geht dahin, wohin es vor dem Öffnen gegangen wäre.
 * - **Schließen** über die Pille oder einen Klick daneben geht immer zurück:
 *   Offen ist das Menü nur in einem Eintrag, den es selbst angelegt hat.
 *
 * Beim Übernehmen bleibt eine Such-Markierung wie bei jeder Sortierung
 * (`stateNachFilter`): Ein späteres Leeren der Suche geht zurück und nimmt
 * die Sortierung über `nachSuche` (`suchverlauf.ts`) mit.
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

/** Die Markierung im `location.state` eines Eintrags, den das Sortiermenü angelegt hat. */
export const MENUE_STATE = { sortiermenue: true } as const

/** Ob ein Eintrag das offene Sortiermenü trägt. */
export function menueOffen(state: unknown): boolean {
  return istObjekt(state) && state.sortiermenue === true
}

/** Der `state` des neuen Eintrags beim Öffnen des Menüs: wie bei der Tafel, die Tafel-Markierung bleibt. */
export function stateZumMenue(state: unknown): Objekt {
  const rest: Objekt = istObjekt(state) ? { ...state } : {}
  delete rest.suche
  return { ...rest, ...MENUE_STATE }
}

type Markierungen = { suche?: true; filtertafel?: true; sortiermenue?: true }

/**
 * Der `state` beim Ersetzen durch einen Filter-Chip oder die Sortierung: Die
 * Markierungen von Suche, Tafel und Menü bleiben, sonst nichts. Fiele die
 * Markierung von Tafel oder Menü, schlösse der Chip sie per `replace`, und
 * ihr Eintrag bliebe verwaist im Verlauf. Die Such-Markierung bleibt seit
 * f2b-c ebenfalls: Das Zurück aus der Suche nimmt Filter und Sortierung auf
 * den Eintrag davor mit (`nachSuche` in `suchverlauf.ts`), und so tun
 * Zurück und das Kreuz im Suchfeld wieder dasselbe.
 */
export function stateNachFilter(state: unknown): Markierungen | null {
  const m: Markierungen = {}
  if (istObjekt(state) && state.suche === true) m.suche = true
  if (tafelOffen(state)) m.filtertafel = true
  if (menueOffen(state)) m.sortiermenue = true
  return m.suche || m.filtertafel || m.sortiermenue ? m : null
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
  return nachSchliessen(tafelOffen, warOffen, state, zurueck, mitnehmen, jetzt)
}

/** Dasselbe für das Sortiermenü: was nach seinem Zurück auf den Eintrag davor gehört. */
export function nachMenue(warOffen: boolean, state: unknown, zurueck: boolean, mitnehmen: string | null, jetzt: string): string | null {
  return nachSchliessen(menueOffen, warOffen, state, zurueck, mitnehmen, jetzt)
}

function nachSchliessen(
  offen: (state: unknown) => boolean,
  warOffen: boolean,
  state: unknown,
  zurueck: boolean,
  mitnehmen: string | null,
  jetzt: string,
): string | null {
  if (!warOffen || offen(state) || !zurueck || mitnehmen === null) return null
  return gleicheParameter(mitnehmen, jetzt) ? null : mitnehmen
}

/** Zwei Suchstrings, unabhängig von der Reihenfolge der Schlüssel. */
export function gleicheParameter(a: string, b: string): boolean {
  const ordnen = (s: string) => {
    const p = new URLSearchParams(s)
    p.sort()
    return p.toString()
  }
  return ordnen(a) === ordnen(b)
}
