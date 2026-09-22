/**
 * Spielzeit lesbar machen (Abschnitt 7.7, Stufe 18c).
 *
 * Dieselbe Regel wie im Worker (`src/domain/psn-besitz.ts`): `null` heißt
 * „unbekannt", niemals „0 h". PS3 und Vita liefern grundsätzlich keine
 * Spielzeit, deshalb ist der Fall der Normalfall und kein Sonderfall.
 */
export function spielzeitText(sekunden: number | null): string {
  if (sekunden === null) return 'unbekannt'
  if (sekunden < 60) return 'unter 1 min'
  if (sekunden < 3600) return `${Math.round(sekunden / 60)} min`
  const stunden = sekunden / 3600
  if (stunden < 10) return `${stunden.toFixed(1).replace('.', ',')} h`
  return `${Math.round(stunden)} h`
}
