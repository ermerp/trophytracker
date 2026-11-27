/**
 * Der Plattform-Vorschlag beim Wunschlisten-Import (Nachtrag f1a, 8.2): die
 * neueste Plattform, die es zum Datum der Liste schon gab; ohne Datum – oder
 * gab es damals noch keine der Plattformen – die neueste. Eine Liste von 2018
 * bekommt PS4, auch wenn das Spiel später für PS5 erschien.
 *
 * Dieselbe Regel wie `plattformZurListe` im Worker (`src/domain/titel.ts`);
 * `test/import-pruefung.spec.ts` hält beide gleich. Eine eigene Datei ohne
 * Abhängigkeiten, damit der Test sie erreicht.
 */

const RANG: Record<string, number> = { PS5: 4, PS4: 3, PS3: 2, PSVITA: 1 }
/** Erscheinen in Europa, `JJJJ-MM`. */
const START: Record<string, string> = { PS3: '2007-03', PSVITA: '2012-02', PS4: '2013-11', PS5: '2020-11' }

function neueste(liste: readonly string[]): string {
  const erlaubt = liste.filter((p) => p in RANG)
  return erlaubt.length === 0 ? '' : erlaubt.reduce((a, b) => (RANG[b] > RANG[a] ? b : a))
}

/** '' wenn keine der vier Plattformen dabei ist. */
export function plattformZurListe(liste: readonly string[], listenDatum: string | null): string {
  if (!listenDatum || !/^\d{4}/.test(listenDatum)) return neueste(liste)
  const stand = /^\d{4}-\d{2}/.test(listenDatum) ? listenDatum.slice(0, 7) : `${listenDatum.slice(0, 4)}-01`
  return neueste(liste.filter((p) => p in START && START[p] <= stand)) || neueste(liste)
}
