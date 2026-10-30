import { euro, type Preisalarm } from './api'

/**
 * Der Satz unter einer Meldung des Preisalarms (Stufe 20g): Reihe, Preis und
 * Grund. Eine eigene Datei ohne React, damit ein Test sie erreicht.
 */

const REIHE: Record<Preisalarm['reihe'], string> = { haendler: 'Händler', markt: 'Markt', store: 'Store' }

export function preisalarmText(a: Pick<Preisalarm, 'art' | 'reihe' | 'preisCents' | 'vorherCents'>): string {
  const grund =
    a.art === 'tief'
      ? `Allzeittief, ${Math.round((1 - a.preisCents / a.vorherCents) * 100)} % unter ${euro(a.vorherCents)}`
      : `unter deiner Grenze von ${euro(a.vorherCents)}`
  return `${REIHE[a.reihe]} ${euro(a.preisCents)} · ${grund}`
}

/**
 * Eine Eingabe in Euro als Cent: „10", „10,5", „10,50" und „10.50" gehen,
 * ein leeres Feld heißt **keine Grenze** (null) – nie 0 (Abschnitt 3).
 * `undefined` heißt: keine gültige Zahl, das Feld bleibt stehen.
 */
export function euroInCents(text: string): number | null | undefined {
  const t = text.trim().replace(/\s*€$/, '')
  if (t === '') return null
  const m = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(t)
  if (!m) return undefined
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return cents > 0 ? cents : undefined
}

/** Cent als Eingabetext („10,50"), ohne Währungszeichen – das steht neben dem Feld. */
export function centsAlsEingabe(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2).replace('.', ',')
}
