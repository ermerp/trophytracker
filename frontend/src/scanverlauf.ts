/**
 * „Letzte Scans" (Nachtrag f1g) – die Logik ohne React, damit ein Test sie
 * erreicht.
 *
 * Gespeichert **nur auf dem Gerät** (`localStorage`), die letzten 50, und es
 * überlebt ein Neuladen (Entscheidung des Nutzers vom 28.11.2026). Auch
 * abgebrochene Codes stehen darin – aber **nie in der Datenbank**: Seit
 * Stufe 17d hinterlässt ein nicht zugeordneter Code dort keine Spur (9.3),
 * und daran ändert diese Liste nichts. Sie ist ein Gedächtnis des Geräts,
 * keine Quelle.
 *
 * `localStorage` kann werfen oder Unsinn enthalten (privates Fenster, eine
 * ältere Fassung, ein Handgriff in den Entwicklerwerkzeugen). `lesen` nimmt
 * deshalb nur, was die Form eines Eintrags hat, und liefert sonst eine leere
 * Liste – ein kaputter Speicher darf den Scanner nie lahmlegen.
 */

export type ScanErgebnis = 'erfasst' | 'regal' | 'abgebrochen' | 'zurueckgenommen'

export type ScanEintrag = {
  /** Eindeutig je Eintrag – derselbe Code kann mehrmals in der Liste stehen. */
  id: string
  ean: string
  /** ISO-Zeitpunkt in UTC; die Oberfläche zeigt Ortszeit. */
  zeit: string
  ergebnis: ScanErgebnis
  spielId: number | null
  titel: string | null
  plattform: string | null
  bild: string | null
}

export const SCHLUESSEL = 'scanverlauf'
export const GRENZE = 50

export const ERGEBNIS_TEXT: Readonly<Record<ScanErgebnis, string>> = {
  erfasst: 'erfasst',
  regal: 'im Regal',
  abgebrochen: 'abgebrochen',
  zurueckgenommen: 'zurückgenommen',
}

const ERGEBNISSE = Object.keys(ERGEBNIS_TEXT) as ScanErgebnis[]

const textOderNull = (w: unknown): string | null => (typeof w === 'string' ? w : null)

function alsEintrag(w: unknown): ScanEintrag | null {
  if (typeof w !== 'object' || w === null) return null
  const o = w as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.ean !== 'string' || typeof o.zeit !== 'string') return null
  if (!ERGEBNISSE.includes(o.ergebnis as ScanErgebnis)) return null
  return {
    id: o.id,
    ean: o.ean,
    zeit: o.zeit,
    ergebnis: o.ergebnis as ScanErgebnis,
    spielId: typeof o.spielId === 'number' && Number.isInteger(o.spielId) ? o.spielId : null,
    titel: textOderNull(o.titel),
    plattform: textOderNull(o.plattform),
    bild: textOderNull(o.bild),
  }
}

/** Den gespeicherten Text lesen – was nicht passt, fällt weg, nie ein Fehler. */
export function lesen(roh: string | null): ScanEintrag[] {
  if (!roh) return []
  let daten: unknown
  try {
    daten = JSON.parse(roh)
  } catch {
    return []
  }
  if (!Array.isArray(daten)) return []
  return daten
    .map(alsEintrag)
    .filter((e): e is ScanEintrag => e !== null)
    .slice(0, GRENZE)
}

/** Neuester Eintrag vorn, gekappt auf die letzten 50. */
export function vorne(liste: readonly ScanEintrag[], e: ScanEintrag): ScanEintrag[] {
  return [e, ...liste.filter((x) => x.id !== e.id)].slice(0, GRENZE)
}

/** Einen Eintrag ändern (Ergebnis, Spiel) – unbekannte Id lässt die Liste, wie sie ist. */
export function aendern(
  liste: readonly ScanEintrag[],
  id: string,
  felder: Partial<Omit<ScanEintrag, 'id'>>,
): ScanEintrag[] {
  return liste.map((x) => (x.id === id ? { ...x, ...felder } : x))
}

/**
 * Rückgängig macht aus „erfasst" ein „zurückgenommen". War das Spiel in
 * diesem Zug erst entstanden, ist es danach weg – der Eintrag verliert dann
 * seinen Link, sonst öffnete ein Tipp ein gelöschtes Spiel.
 */
export function zuruecknehmen(liste: readonly ScanEintrag[], id: string, spielGeloescht: boolean): ScanEintrag[] {
  return aendern(liste, id, spielGeloescht ? { ergebnis: 'zurueckgenommen', spielId: null } : { ergebnis: 'zurueckgenommen' })
}

/** Eine neue Id – Zeit und Code reichen, ein Zufallsteil fängt zwei Einträge in derselben Millisekunde. */
export function neueId(ean: string, jetzt: number, zufall: number): string {
  return `${jetzt.toString(36)}-${ean}-${Math.floor(zufall * 1e6).toString(36)}`
}

/** Speichern: Ein Fehler beim Schreiben ist kein Fehler des Scanners. */
export function alsText(liste: readonly ScanEintrag[]): string {
  return JSON.stringify(liste.slice(0, GRENZE))
}

// --- Die vollständige Liste im Browserverlauf ---------------------------------------

/*
 * „alle (n)" öffnet die Liste wie eine Tafel (Muster aus `filterverlauf.ts`):
 * Öffnen legt einen Eintrag mit derselben URL an, markiert mit
 * `state.scanliste`; Zurück – Geste oder Knopf – schließt sie, statt den
 * Scanner zu verlassen. Schließen über das Kreuz geht zurück, wenn der
 * Eintrag unserer ist.
 */

type Objekt = Record<string, unknown>
const istObjekt = (state: unknown): state is Objekt => typeof state === 'object' && state !== null

export function listeOffen(state: unknown): boolean {
  return istObjekt(state) && state.scanliste === true
}

export function stateZurListe(state: unknown): Objekt {
  return { ...(istObjekt(state) ? state : {}), scanliste: true }
}
