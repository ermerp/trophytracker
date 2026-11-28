/**
 * Wann derselbe Code wieder auslösen darf (Nachtrag f1h) – ohne React, damit
 * ein Test es erreicht.
 *
 * Bis f1h gab der Scanner den zuletzt aufgelösten Code als `ignoriere` an
 * die Kamera, und der blieb gesperrt, **bis ein anderer Code kam**. Nach „×"
 * oder Rückgängig ließ sich dieselbe Hülle deshalb nicht noch einmal scannen
 * – auch nicht, nachdem sie aus dem Bild genommen und wieder hingehalten
 * wurde (gemeldet am 28.11.2026 am Handy, im Browser mit einer nachgestellten
 * Erkennung belegt).
 *
 * Die zwei Sekunden, die es daneben gab (`SPERRE_MS`), genügen allein nicht:
 * Nach „erfasst" läuft die Kamera sofort weiter, und eine Hülle, die länger
 * als zwei Sekunden im Bild bleibt, ersetzte ihre eigene „erfasst"-Karte
 * samt Rückgängig durch „Steht schon im Regal". Die Bedingung ist deshalb
 * **„der Code war zwischendurch aus dem Bild"**: Er bleibt gesperrt, solange
 * er gelesen wird, und gibt frei, sobald er `ABWESEND_MS` lang in keinem Bild
 * stand. Ein einzelnes unscharfes Bild zählt dabei nicht als „weg" – dafür
 * die Dauer statt eines einzigen Bildes ohne Code.
 */

/** So lange muss ein Code ununterbrochen fehlen, bevor er wieder gilt – rund sieben Bilder bei 150 ms. */
export const ABWESEND_MS = 1000

/** `abwesendSeit`: seit wann der gesperrte Code in keinem Bild mehr stand; `null`, solange er gelesen wird. */
export type Sperre = { code: string; abwesendSeit: number | null } | null

/** Nach einem angenommenen Code: dieser ist gesperrt, bis er aus dem Bild war. */
export function sperren(code: string): Sperre {
  return { code, abwesendSeit: null }
}

/**
 * Ein Bild verbuchen. `gelesen` ist der Code dieses Bildes oder `null`; ein
 * anderer Code zählt wie keiner – der gesperrte ist dann ja nicht im Bild.
 * Zurück kommt die neue Sperre, `null` heißt frei.
 */
export function bildVerbuchen(sperre: Sperre, gelesen: string | null, jetzt: number): Sperre {
  if (sperre === null) return null
  if (gelesen === sperre.code) return sperre.abwesendSeit === null ? sperre : { code: sperre.code, abwesendSeit: null }
  const seit = sperre.abwesendSeit ?? jetzt
  if (jetzt - seit >= ABWESEND_MS) return null
  return sperre.abwesendSeit === null ? { code: sperre.code, abwesendSeit: seit } : sperre
}

/** Löst dieser Code gerade nicht aus? */
export function gesperrt(sperre: Sperre, code: string): boolean {
  return sperre !== null && sperre.code === code
}
