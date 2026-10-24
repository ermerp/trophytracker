/**
 * Die Vergleicher der Listen, ohne React – damit ein Test sie erreicht
 * (Stufe 20e-b).
 *
 * Bis dahin standen sie in `Absichten.tsx` und `Luecken.tsx`, und keiner hat
 * sie je ausgeführt: Seit dem 02.10.2026 standen in Wunschliste, Backlog und
 * Kaufliste Kritikerwertung und „zuletzt angelegt" in ihrer natürlichen
 * Richtung verkehrt herum, und „Favoriten zuerst" stellte die Unbewerteten vor
 * die Bewerteten. Der Worker sortiert richtig; die Oberfläche sortiert mit der
 * Richtung nach und hat es wieder umgedreht.
 *
 * **Die Richtung meint die Reihenfolge, die man sieht:** `ab` heißt höchster
 * Wert, neuestes Datum oder Favorit zuerst – in jedem Vergleicher gleich.
 *
 * **„Wertung" ist seit Stufe 20k die Spielerwertung** (IGDB-Nutzer), auch
 * unter „Favoriten zuerst"; die Kritikerwertung heißt seitdem `kritik`
 * (Entscheidung des Nutzers vom 22.10.2026).
 */

export type Richtung = 'auf' | 'ab'

/** Kehrt einen Vergleicher um – für Kriterien ohne „unbekannt", etwa den Titel. */
export function umgekehrt<E>(vergleich: (a: E, b: E) => number) {
  return (a: E, b: E) => vergleich(b, a)
}

/**
 * Nach einer Zahl sortieren – **„unbekannt" bleibt in beiden Richtungen am
 * Ende**.
 *
 * Das ist der Grund, warum es diese Hilfe gibt und die Listen ihre
 * Vergleicher nicht einfach umkehren: Beim ersten Versuch (02.10.2026)
 * standen absteigend sortiert die Releases *ohne* Preis vorn. „Unbekannt" ist
 * aber kein hoher Wert, sondern gar keiner – Abschnitt 5.2 stellt Unbewertete
 * hinten an, und das gilt unabhängig von der Richtung.
 *
 * `dann` ist der Stichentscheid und dreht sich nie mit: Zwei gleich teure
 * Spiele sollen nicht die Plätze tauschen, nur weil die Richtung wechselt.
 */
export function nachZahl<E>(wert: (e: E) => number | null, richtung: Richtung, dann: (a: E, b: E) => number) {
  return (a: E, b: E) => {
    const x = wert(a)
    const y = wert(b)
    if (x === null && y === null) return dann(a, b)
    if (x === null) return 1
    if (y === null) return -1
    return (richtung === 'auf' ? x - y : y - x) || dann(a, b)
  }
}

/** Ein ISO-Datum (`2023-10-20`) als Zahl, damit `nachZahl` es ordnen kann; ohne Datum `null`. */
export function datumZahl(iso: string | null): number | null {
  return iso ? Number(iso.slice(0, 10).replaceAll('-', '')) : null
}

/** Was jede Liste anbietet. To-Do hat zusätzlich die eigene Reihenfolge. */
export const SORTIERBAR = {
  favorit: 'Favoriten zuerst, dann Wertung',
  wertung: 'Spielerwertung',
  kritik: 'Kritikerwertung',
  preis: 'Gebrauchtpreis',
  titel: 'Titel',
  release: 'Erscheinungsdatum',
  angelegt: 'zuletzt angelegt',
} as const
export const SORTIERTEXT = { ...SORTIERBAR, position: 'eigene Reihenfolge' } as const
/** Was alle Listen ausser To-Do anbieten – „eigene Reihenfolge" gibt es nur dort. */
export type ListenSortierung = keyof typeof SORTIERBAR
export type Sortierung = keyof typeof SORTIERTEXT

/**
 * Was die Listen zum Sortieren brauchen – ein Ausschnitt von `PlanEintrag`.
 * Eigener Typ statt eines Imports aus `api.ts`: Der zieht DOM-Typen in die
 * Typprüfung der Tests, die gegen die Worker-Typen läuft.
 */
export type PlanSortierfelder = {
  id: number
  titel: string
  kritik: number | null
  spieler: number | null
  erscheinungsdatum: string | null
  angelegtAm: string
  favorit: boolean
  preisCents: number | null
  position: number | null
}

/** Dieselbe Ordnung wie im Worker, damit eine Änderung die Kachel sofort an ihren Platz rückt. */
const nachTitel = (a: PlanSortierfelder, b: PlanSortierfelder) => a.titel.localeCompare(b.titel, 'de') || a.id - b.id
/**
 * Was bei welchem Kriterium die natürliche Reihenfolge ist (Stufe 20e). Das
 * Erscheinungsdatum steht seit 20e-b auf „neueste zuerst" (Entscheidung des
 * Nutzers vom 21.10.2026), wie in der Sammlung.
 */
export const SORTIER_NATUERLICH: Record<Sortierung, Richtung> = {
  favorit: 'ab',
  wertung: 'ab',
  kritik: 'ab',
  preis: 'auf',
  titel: 'auf',
  release: 'ab',
  angelegt: 'ab',
  position: 'auf',
}

/**
 * Der Vergleicher zur Wahl. Die Richtung geht hinein, statt das Ergebnis
 * umzukehren – sonst stünden absteigend die Einträge **ohne** Wert vorn, und
 * „unbekannt" ist kein hoher Wert, sondern gar keiner (5.2).
 */
export function VERGLEICH<E extends PlanSortierfelder>(sortierung: Sortierung, richtung: Richtung): (a: E, b: E) => number {
  switch (sortierung) {
    case 'titel':
      return richtung === 'auf' ? nachTitel : umgekehrt(nachTitel)
    case 'wertung':
      return nachZahl((e: E) => e.spieler, richtung, nachTitel)
    case 'kritik':
      return nachZahl((e: E) => e.kritik, richtung, nachTitel)
    case 'preis':
      return nachZahl((e: E) => e.preisCents, richtung, nachTitel)
    case 'position':
      return nachZahl((e: E) => e.position, richtung, (a, b) => a.id - b.id)
    case 'angelegt': {
      const auf = (a: E, b: E) => a.angelegtAm.localeCompare(b.angelegtAm) || a.id - b.id
      return richtung === 'auf' ? auf : umgekehrt(auf)
    }
    case 'release':
      // Ohne Datum ans Ende, in beiden Richtungen.
      return nachZahl((e: E) => datumZahl(e.erscheinungsdatum), richtung, nachTitel)
    default: {
      // Die Favoriten drehen sich mit, die Wertung darunter auch – die
      // Unbewerteten bleiben in beiden Richtungen am Ende ihrer Gruppe.
      const favorit = (a: E, b: E) => Number(b.favorit) - Number(a.favorit)
      const wertung = nachZahl((e: E) => e.spieler, richtung, nachTitel)
      return (a, b) => (richtung === 'ab' ? favorit(a, b) : favorit(b, a)) || wertung(a, b)
    }
  }
}

/** Was die Lückenliste zum Sortieren braucht – ein Ausschnitt ihrer Zeile. */
export type LueckeSortierfelder = {
  titel: string
  plattform: string
  besterGebrauchtpreisCents: number | null
  fortschritt: number
  kritik: number | null
  spieler: number | null
  erscheinungsdatum: string | null
}

/**
 * Sortierung der Lückenliste (Stufe 20e, nachgereicht am 02.10.2026;
 * Kritikerwertung und Erscheinungsdatum seit 20e-b, Spielerwertung seit 20k).
 *
 * Die Ansicht hatte als einzige Liste gar keine – sie kam aus der Datenbank
 * nach Titel und blieb so. Für den Gebrauchtpreis ist das zu wenig: „Was
 * fülle ich als Nächstes auf" ist genau die Frage, die ein Preis beantwortet.
 *
 * Gilt nur für die obere Liste. Der zweite Block bleibt nach seinem Befund
 * geordnet – dort ist „eBay kennt kein Angebot" die Reihenfolge, die ihn
 * abarbeitbar macht, und ein Preis steht dort ohnehin selten.
 */
export const LUECKEN_SORTIERUNG = {
  titel: 'Titel',
  preis: 'Gebrauchtpreis',
  fortschritt: 'Fortschritt',
  wertung: 'Spielerwertung',
  kritik: 'Kritikerwertung',
  release: 'Erscheinungsdatum',
} as const
export type LueckenSortierung = keyof typeof LUECKEN_SORTIERUNG

/** Was bei welchem Kriterium die natürliche Reihenfolge ist. */
export const LUECKEN_NATUERLICH: Record<LueckenSortierung, Richtung> = {
  titel: 'auf',
  preis: 'auf',
  fortschritt: 'ab',
  wertung: 'ab',
  kritik: 'ab',
  release: 'ab',
}

const nachLueckenTitel = (a: LueckeSortierfelder, b: LueckeSortierfelder) =>
  a.titel.localeCompare(b.titel, 'de') || a.plattform.localeCompare(b.plattform)

/**
 * Der Vergleicher zur Wahl – die Richtung geht hinein, statt das Ergebnis
 * umzukehren: Ohne Preis, Wertung oder Datum bleibt in beiden Richtungen hinten (5.2).
 */
export function lueckenVergleich<L extends LueckeSortierfelder>(sortierung: LueckenSortierung, richtung: Richtung): (a: L, b: L) => number {
  if (sortierung === 'titel') return richtung === 'auf' ? nachLueckenTitel : umgekehrt(nachLueckenTitel)
  const wert: (l: L) => number | null =
    sortierung === 'preis'
      ? (l) => l.besterGebrauchtpreisCents
      : sortierung === 'wertung'
        ? (l) => l.spieler
        : sortierung === 'kritik'
          ? (l) => l.kritik
          : sortierung === 'release'
            ? (l) => datumZahl(l.erscheinungsdatum)
            : (l) => l.fortschritt
  return nachZahl(wert, richtung, nachLueckenTitel)
}
