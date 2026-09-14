/**
 * Kleiner Helfer für JSON-Aufrufe der eigenen API.
 *
 * Die API antwortet bei Fehlern mit `{ fehler }`. Der Helfer macht daraus
 * einen `ApiFehler` mit Status und Antwortkörper – der 409 beim Anlegen eines
 * Spiels trägt zum Beispiel Kandidaten, die die Oberfläche zeigen will.
 */

export class ApiFehler extends Error {
  readonly status: number
  readonly antwort: Record<string, unknown>

  constructor(status: number, antwort: Record<string, unknown>) {
    super(typeof antwort.fehler === 'string' ? antwort.fehler : `HTTP ${status}`)
    this.status = status
    this.antwort = antwort
  }
}

export async function anfrage<T>(
  pfad: string,
  init?: { methode?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; koerper?: unknown },
): Promise<T> {
  const antwort = await fetch(pfad, {
    method: init?.methode ?? 'GET',
    headers: init?.koerper === undefined ? undefined : { 'content-type': 'application/json' },
    body: init?.koerper === undefined ? undefined : JSON.stringify(init.koerper),
  })
  const daten = (await antwort.json().catch(() => ({}))) as Record<string, unknown>
  if (!antwort.ok) throw new ApiFehler(antwort.status, daten)
  return daten as T
}

export const PLATTFORMEN = ['PS3', 'PS4', 'PS5', 'PSVITA'] as const
export type Plattform = (typeof PLATTFORMEN)[number]

export const ZUSTAENDE = ['neu', 'sehr gut', 'gut', 'akzeptabel'] as const
export type Zustand = (typeof ZUSTAENDE)[number]

export const QUELLEN = ['kauf', 'plus', 'trial', 'sonstiges'] as const
export type Quelle = (typeof QUELLEN)[number]

export const QUELLENTEXT: Record<Quelle, string> = {
  kauf: 'Kauf',
  plus: 'PS Plus',
  trial: 'Testversion',
  sonstiges: 'Sonstiges',
}

export type Platin = 'erspielt' | 'offen' | 'nicht_verfuegbar'

// Dreiwertig, nicht Boolean: 93 von 431 Titeln haben gar keine Platin-Trophäe.
export const PLATINTEXT: Record<Platin, string> = {
  erspielt: 'Platin',
  offen: 'Platin offen',
  nicht_verfuegbar: 'kein Platin vorgesehen',
}

export type DiscFassung = 'ja' | 'nein' | 'unbekannt'

// 'unbekannt' bleibt "unbekannt" – nie "–" und nie "nicht verfügbar" (Abschnitt 13).
export const DISCTEXT: Record<DiscFassung, string> = {
  ja: 'Disc-Fassung: ja',
  nein: 'Disc-Fassung: nein',
  unbekannt: 'Disc-Fassung: unbekannt',
}

export const datum = (wert: string | null) =>
  wert ? new Date(wert.includes('T') ? wert : `${wert}T00:00:00`).toLocaleDateString('de-DE') : 'unbekannt'

export const euro = (cents: number | null) =>
  cents === null ? 'unbekannt' : (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

export const PLAY_STATUS = [
  'nicht_gespielt',
  'am_spielen',
  'pausiert',
  'durchgespielt',
  'komplettiert',
  'abgebrochen',
  'unentschieden',
] as const
export type PlayStatus = (typeof PLAY_STATUS)[number]

export const STATUSTEXT: Record<PlayStatus, string> = {
  nicht_gespielt: 'nicht gespielt',
  am_spielen: 'am Spielen',
  pausiert: 'pausiert',
  durchgespielt: 'durchgespielt',
  komplettiert: 'komplettiert',
  abgebrochen: 'abgebrochen',
  unentschieden: 'unentschieden',
}

export type Bewertung = {
  releaseId: number
  status: PlayStatus
  begonnenAm: string | null
  beendetAm: string | null
  bewertung: number | null
  notiz: string | null
  geaendertAm: string
}

export const REVIEW_AKTIONEN = [
  'durchgespielt',
  'abgebrochen',
  'spiele_gerade',
  'auf_todo',
  'ins_backlog',
  'unveraendert',
  'ueberspringen',
] as const
export type ReviewAktion = (typeof REVIEW_AKTIONEN)[number]

export const AKTIONSTEXT: Record<ReviewAktion, string> = {
  durchgespielt: 'Durchgespielt',
  abgebrochen: 'Abgebrochen',
  spiele_gerade: 'Spiele gerade',
  auf_todo: 'Auf To-Do',
  ins_backlog: 'Ins Backlog',
  unveraendert: 'Unverändert lassen',
  ueberspringen: 'Überspringen',
}

export type ReviewFortschritt = { offen: number; erledigt: number; gesamt: number; unentschieden: number }

/** Ein IGDB-Treffer, wie /api/igdb/search und die Prüfansicht ihn liefern (Stufe 9). */
export type IgdbKandidat = {
  igdbId: number
  name: string
  slug: string | null
  cover: string | null
  erscheinungsdatum: string | null
  plattformen: string[]
  typ: string | null
  kritik: { wert: number; anzahl: number | null } | null
}

export type IgdbStatus = {
  zugangsdaten: boolean
  gesamt: number
  verknuepft: number
  zurPruefung: number
  ungeprueft: number
  abgelehnt: number
  letzteAktualisierung: string | null
}

export type ReleaseStatus = 'erschienen' | 'angekuendigt' | 'unbekannt'

export const RELEASE_STATUS_TEXT: Record<ReleaseStatus, string> = {
  erschienen: 'erschienen',
  angekuendigt: 'angekündigt',
  unbekannt: 'unbekannt',
}

export const igdbLink = (slug: string | null) => (slug ? `https://www.igdb.com/games/${slug}` : null)

/** Zeitstempel aus D1 (`datetime('now')`, UTC ohne Zone) oder ISO – als Datum und Uhrzeit. */
export const zeitpunkt = (wert: string | null) =>
  wert ? new Date(wert.replace(' ', 'T') + (/Z|[+-]\d\d:\d\d$/.test(wert) ? '' : 'Z')).toLocaleString('de-DE') : 'unbekannt'

export const KRITIKQUELLE: Record<string, string> = { igdb: 'IGDB', opencritic: 'OpenCritic', manuell: 'von Hand' }
