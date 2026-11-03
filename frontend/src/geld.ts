/**
 * Cent als Euro, wie überall in der Oberfläche („12,50 €"); fehlt der Wert,
 * steht „unbekannt", nie „0" oder „–" (Abschnitt 3). Eine eigene Datei, damit
 * `preisalarm.ts` sie ohne `api.ts` erreicht – `api.ts` reicht sie weiter.
 */
export const euro = (cents: number | null) =>
  cents === null ? 'unbekannt' : (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
