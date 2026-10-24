/**
 * Endlos-Scrollen (Stufe 22, 16-2-endlos-scrollen.md) – die Logik ohne React,
 * damit ein Test sie erreicht (CLAUDE.md, „Testen, was Logik ist").
 *
 * Der Zwischenspeicher hält je Filterkombination, was geladen war, wie viele
 * es insgesamt gibt und wo die Liste stand. Er lebt so lange wie die Seite:
 * ein Neuladen beginnt von vorn, ein „Zurück" aus dem Spieldetail nicht.
 * Beim Zurückkommen zeigt die Ansicht sofort den Stand aus dem Speicher und
 * holt den geladenen Bereich still neu (Entscheidung des Nutzers vom
 * 24.10.2026) – sonst stünde nach einer Änderung im Spieldetail der alte da.
 */

/** So viele je Nachladen; die Route kappt bei 100 (D1: 100 gebundene Werte je Anweisung). */
export const BLOCK = 50
/**
 * So viele je Anfrage beim stillen Neuholen. Jede Anfrage zahlt einen
 * Grundpreis von rund 2 100 (Titel) bis 4 600 (Wertung) gelesenen Zeilen,
 * gemessen am 24.10.2026 – große Blöcke halbieren die Zahl der Grundpreise.
 */
export const NEUHOLEN_BLOCK = 100

export type Stand<T> = { eintraege: T[]; gesamt: number; scrollY: number }

/** Höchstens so viele Filterkombinationen bleiben im Speicher – die ältesten fallen heraus. */
const HOECHSTENS = 5

const speicher = new Map<string, Stand<unknown>>()

/**
 * Der Schlüssel einer Filterkombination: alle Parameter außer `offset`,
 * sortiert – `?a=1&b=2` und `?b=2&a=1` sind dieselbe Liste.
 */
export function schluessel(params: URLSearchParams): string {
  const kopie = new URLSearchParams(params)
  kopie.delete('offset')
  kopie.sort()
  return kopie.toString()
}

export function merken<T>(name: string, stand: Stand<T>): void {
  speicher.delete(name)
  speicher.set(name, stand)
  while (speicher.size > HOECHSTENS) speicher.delete(speicher.keys().next().value as string)
}

export function holen<T>(name: string): Stand<T> | null {
  return (speicher.get(name) as Stand<T> | undefined) ?? null
}

export function vergessen(name?: string): void {
  if (name === undefined) speicher.clear()
  else speicher.delete(name)
}

/**
 * Einen Block anhängen, ohne Doppelte: Ändert sich der Bestand zwischen zwei
 * Blöcken (ein Spiel kommt dazu), rutscht ein schon geladenes Spiel in den
 * nächsten Block. Es bleibt an seinem ersten Platz.
 */
export function anhaengen<T extends { id: number }>(alt: readonly T[], neu: readonly T[]): T[] {
  const gesehen = new Set(alt.map((e) => e.id))
  return [...alt, ...neu.filter((e) => !gesehen.has(e.id))]
}

/** Ob noch etwas nachzuladen ist. */
export function mehrDa(geladen: number, gesamt: number): boolean {
  return geladen < gesamt
}

/**
 * Die Anfragen, die den geladenen Bereich neu holen – mindestens einen
 * ganzen Block wie beim ersten Laden, auch wenn vorher weniger da war.
 */
export function neuholenBloecke(geladen: number, block = NEUHOLEN_BLOCK): Array<{ offset: number; limit: number }> {
  const raus: Array<{ offset: number; limit: number }> = []
  const bis = Math.max(geladen, BLOCK)
  for (let offset = 0; offset < bis; offset += block) raus.push({ offset, limit: Math.min(block, bis - offset) })
  return raus
}
