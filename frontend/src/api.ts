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

/** Die neueste der genannten Plattformen – der Vorschlag für einen Wunsch (Abschnitt 5); '' wenn keine. */
export function neuestePlattform(liste: readonly string[]): Plattform | '' {
  const rang: Record<string, number> = { PS5: 4, PS4: 3, PS3: 2, PSVITA: 1 }
  const erlaubt = liste.filter((p): p is Plattform => (PLATTFORMEN as readonly string[]).includes(p))
  return erlaubt.length === 0 ? '' : erlaubt.reduce((a, b) => (rang[b] > rang[a] ? b : a))
}

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
  'auf_todo',
  'ins_backlog',
  'unveraendert',
  'ueberspringen',
] as const
export type ReviewAktion = (typeof REVIEW_AKTIONEN)[number]

export const AKTIONSTEXT: Record<ReviewAktion, string> = {
  durchgespielt: 'Durchgespielt',
  abgebrochen: 'Abgebrochen',
  auf_todo: 'Auf To-Do (spiele gerade)',
  ins_backlog: 'Ins Backlog (pausiert)',
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

/** Absichten (Abschnitt 5, ab Stufe 10): eine Tabelle, vier Listen. */
export const PLAN_ARTEN = ['wunsch', 'todo', 'backlog', 'kauf'] as const
export type PlanArt = (typeof PLAN_ARTEN)[number]

export const PLAN_ARTTEXT: Record<PlanArt, string> = {
  wunsch: 'Wunschliste',
  todo: 'To-Do',
  backlog: 'Backlog',
  kauf: 'Kaufliste',
}

export type PlanStatus = 'offen' | 'erledigt' | 'verworfen'

export const PLAN_STATUSTEXT: Record<PlanStatus, string> = {
  offen: 'offen',
  erledigt: 'erledigt',
  verworfen: 'verworfen',
}

export type PlanEintrag = {
  id: number
  art: PlanArt
  status: PlanStatus
  titel: string
  /** null nur bei Freitext ohne Zuordnung. */
  spielId: number | null
  releaseId: number | null
  plattform: Plattform | null
  bild: string | null
  kritik: number | null
  erscheinungsdatum: string | null
  releaseStatus: ReleaseStatus | null
  favorit: boolean
  notiz: string | null
  herkunft: string | null
  /** Manuelle Reihenfolge, nur To-Do (Stufe 12); null sortiert ans Ende. */
  position: number | null
  angelegtAm: string
  erledigtAm: string | null
  /** Eigene Bewertung am Release (4.2); bei To-Do und Backlog gekoppelt (5.5). */
  eigenerStatus: PlayStatus | null
}

/** Kandidat für den Backlog aus v_backlog_kandidaten: im Besitz, nie angefasst (Stufe 12). */
export type BacklogKandidat = {
  releaseId: number
  spielId: number
  titel: string
  plattform: Plattform
  bild: string | null
  kritik: number | null
}

/** Wunschlisten-Import (Abschnitt 8.2, Stufe 11). */
export type ImportZaehler = {
  gesamt: number
  ungeprueft: number
  klar: number
  mehrdeutig: number
  ohneTreffer: number
  uebernommen: number
  uebersprungen: number
  schonVorhanden: number
}

export type ImportLauf = {
  id: number
  quelle: string | null
  jahr: number | null
  form: 'jahresliste' | 'plattformliste' | 'tabelle' | 'einfach'
  angelegtAm: string
  zaehler: ImportZaehler
}

export type ImportTreffer = 'sammlung' | 'vorhanden' | 'eindeutig' | 'mehrdeutig' | 'ohne_treffer'
export type ImportEntscheidung = 'offen' | 'uebernommen' | 'uebersprungen' | 'schon_vorhanden' | 'aufgeteilt'
export type ImportGruppe = 'klar' | 'unklar' | 'uebersprungen' | 'uebernommen'

export type ImportZeile = {
  id: number
  position: number
  titel: string
  originals: string[]
  plattform: Plattform | null
  listenDatum: string | null
  geprueft: boolean
  suchweg: string | null
  treffer: ImportTreffer | null
  spielId: number | null
  spielTitel: string | null
  spielBild: string | null
  releaseId: number | null
  releasePlattform: string | null
  igdbId: number | null
  entscheidung: ImportEntscheidung
  planId: number | null
  entschiedenAm: string | null
  kandidaten: IgdbKandidat[]
}

export type ImportSeite = ImportLauf & { gruppe: ImportGruppe; gesamt: number; limit: number; offset: number; zeilen: ImportZeile[] }

export const FORMTEXT: Record<ImportLauf['form'], string> = {
  jahresliste: 'Jahresliste mit Monaten',
  plattformliste: 'Liste mit Plattform-Abschnitten',
  tabelle: 'bereinigte Tabelle',
  einfach: 'einfache Liste',
}

/**
 * Textdatei lesen: UTF-8, sonst Windows-1252 – vier der echten Dateien
 * tragen ein BOM, eine ist in Windows-1252 (8.2). Der Parser im Worker
 * bekommt immer sauberen Text.
 */
export async function textAusDatei(datei: File): Promise<string> {
  const bytes = await datei.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}
