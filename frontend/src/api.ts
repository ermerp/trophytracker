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
  // Keine JSON-Antwort heisst seit der PWA (Stufe 18): Die Access-Sitzung ist
  // abgelaufen, und statt der API kam die Anmeldeseite. Ein stilles `{}`
  // liesse die Ansicht leer aussehen; ein Neuladen geht durch die Anmeldung.
  if (antwort.ok && !(antwort.headers.get('content-type') ?? '').includes('json')) {
    throw new ApiFehler(antwort.status, { fehler: 'Anmeldung abgelaufen – bitte die Seite neu laden.' })
  }
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

export const DISC_FASSUNGEN = ['ja', 'nein', 'unbekannt'] as const
export type DiscFassung = (typeof DISC_FASSUNGEN)[number]

/** Herkunft der Disc-Fassung (Abschnitt 3): IGDB-Haendlereintrag, von Hand, spaeter Feed. */
export const DISCQUELLE: Record<string, string> = { igdb: 'aus IGDB', manuell: 'von Hand', feed: 'aus dem Feed' }

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
  /** Disc-Fassung aus IGDB (Stufe 14): belegte Releases und Spiele, die der Schritt noch anfragt. */
  discBelegt: number
  discOffen: number
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
  /** Offener Kaufeintrag am selben Ziel (Stufe 15); null, wenn keiner. */
  aufKaufliste: number | null
  /** Disc oder digitale Berechtigung am Release – der Eintrag ist damit eigentlich erfüllt. */
  imBesitz: boolean
}

/** Herkunft eines Eintrags (plan_entry.origin), für die Kaufliste (Stufe 15). */
export const HERKUNFTTEXT: Record<string, string> = {
  luecke: 'aus Lücke',
  wunsch: 'aus Wunsch',
  manuell: 'von Hand',
  import: 'aus Import',
  triage: 'aus Prüfliste',
}

/** Kandidat für die Kaufliste aus v_kaufkandidaten: belegte Lücke oder offener Wunsch (Stufe 15). */
export type KaufKandidat = {
  quelle: 'luecke' | 'wunsch'
  /** Der Wunsch, bei Lücken null. */
  planId: number | null
  releaseId: number | null
  spielId: number | null
  titel: string
  plattform: Plattform | null
  bild: string | null
  kritik: number | null
  favorit: boolean
  /** null heißt unbekannt – nie 0. */
  besterGebrauchtpreisCents: number | null
}

/** Vorgemerkter, noch nicht erschienener Titel aus v_erscheint_bald (Use Case 11). */
export type ErscheintBaldEintrag = {
  planId: number
  art: PlanArt
  spielId: number
  releaseId: number | null
  titel: string
  bild: string | null
  plattform: Plattform | null
  erscheinungsdatum: string | null
  favorit: boolean
}

/** Antwort von POST /api/physical-copies und /api/digital-entitlements (Stufe 15): erledigte Absichten. */
export type ErfasstAntwort = {
  id: number
  absichtenErledigt: Array<{ id: number; art: PlanArt; titel: string }>
  /** Offener To-Do-/Backlog-Eintrag am Release – dann kein „ins Backlog"-Angebot. */
  aufListe: boolean
}


/** „Von der Wunsch- und Kaufliste erledigt." – je nachdem, was der Worker erledigt hat (Stufe 15). */
export function erledigtText(absichten: ErfasstAntwort['absichtenErledigt']): string {
  const arten = new Set(absichten.map((a) => a.art))
  const liste = arten.has('wunsch') && arten.has('kauf') ? 'Wunsch- und Kaufliste' : arten.has('kauf') ? 'Kaufliste' : 'Wunschliste'
  return `Von der ${liste} erledigt.`
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

/** Änderungsprotokoll (Abschnitt 8.5, Stufe 16): eine Zeile aus game_event, der Satz kommt vom Server. */
export const EREIGNIS_QUELLEN = ['nutzer', 'sync', 'igdb', 'import', 'feed', 'migration'] as const
export type EreignisQuelle = (typeof EREIGNIS_QUELLEN)[number]

export const QUELLETEXT: Record<EreignisQuelle, string> = {
  nutzer: 'du',
  sync: 'PSN-Sync',
  igdb: 'IGDB',
  import: 'Import',
  feed: 'Händlerfeed',
  migration: 'Migration',
}

export type Ereignis = {
  id: number
  zeitpunkt: string
  quelle: EreignisQuelle
  /** null, wenn das Spiel inzwischen gelöscht ist oder die Liste noch keinem gehört. */
  spielId: number | null
  releaseId: number | null
  /** Titel (und Plattform) zum Zeitpunkt des Ereignisses. */
  titel: string
  art: string
  feld: string | null
  alt: string | null
  neu: string | null
  detail: string | null
  text: string
}

export type EreignisSeite = { weiter: boolean; ereignisse: Ereignis[] }
