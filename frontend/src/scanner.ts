/**
 * Die Logik des Scanners ohne React (Nachtrag f1g, Abschnitt 9) – damit ein
 * Test sie erreicht: welches Signal ein Ergebnis gibt, welches Release der
 * Hauptknopf vorschlägt und wie ein Rückgängig den Stand vor der Aktion
 * wiederherstellt.
 *
 * Bewusst ohne Import aus `api.ts`: Die Tests laufen in der Worker-Umgebung,
 * und `api.ts` gehört zur Oberfläche. Die Plattformen stehen deshalb hier
 * noch einmal als Typ – derselbe Wertebereich wie `PLATTFORMEN`.
 */

export type ScanPlattform = 'PS5' | 'PS4' | 'PS3' | 'PSVITA'

/** Reihenfolge „neueste zuerst" – wie `neuestePlattform` in `api.ts`. */
export const PLATTFORM_FOLGE: readonly ScanPlattform[] = ['PS5', 'PS4', 'PS3', 'PSVITA']

// --- Signale: Farbe, Ton und Vibration -------------------------------------------

/**
 * Vier Signale, je eines für eine Aussage, die man beim Abscannen eines Regals
 * ohne Hinsehen verstehen soll (Entscheidung des Nutzers vom 28.11.2026):
 *
 * - `neu` – ein Code, den die Sammlung nicht kennt (Fall 2 und 3): Hinsehen.
 * - `regal` – der Code ist bekannt, die Disc steht schon (Fall 1): weiter.
 * - `erfasst` – die Disc ist gespeichert (Fall 4).
 * - `fehler` – etwas ging schief (Fall 5).
 */
export type Signal = 'neu' | 'regal' | 'erfasst' | 'fehler'

export type Ton = { hz: number; dauer: number; ab: number; form: 'sine' | 'triangle' }
export type Muster = { toene: readonly Ton[]; vibration: number | readonly number[] }

/** Ton und Vibration je Signal – die Werte des abgenommenen Prototyps. */
export const MUSTER: Readonly<Record<Signal, Muster>> = {
  neu: { toene: [{ hz: 1320, dauer: 0.08, ab: 0, form: 'sine' }], vibration: 40 },
  regal: {
    toene: [
      { hz: 880, dauer: 0.08, ab: 0, form: 'sine' },
      { hz: 880, dauer: 0.08, ab: 0.12, form: 'sine' },
    ],
    vibration: [30, 70, 30],
  },
  erfasst: {
    toene: [
      { hz: 990, dauer: 0.08, ab: 0, form: 'sine' },
      { hz: 1480, dauer: 0.12, ab: 0.09, form: 'sine' },
    ],
    vibration: 90,
  },
  fehler: { toene: [{ hz: 220, dauer: 0.3, ab: 0, form: 'triangle' }], vibration: [50, 50, 50, 50, 50] },
}

/**
 * Was beim Scannen herauskam – die Eingabe für `signalFuer`.
 *
 * - `aufgeloest`: `POST /api/scan` hat geantwortet; `exemplare` nur bei einem
 *   Mapping-Treffer.
 * - `schon_da`: Zuordnen antwortete 409 – für das Release steht schon eine
 *   Disc (je Release genau eine, Abschnitt 5).
 */
export type Ergebnis =
  | { art: 'aufgeloest'; treffer: 'mapping' | 'angebot' | 'keiner'; exemplare: number | null }
  | { art: 'erfasst' }
  | { art: 'schon_da' }
  | { art: 'fehler' }

/**
 * Ein Mapping-Treffer ist nur dann „im Regal", wenn dort wirklich eine Disc
 * steht: Ein Code, dessen Disc gelöscht wurde, zeigt noch auf sein Release,
 * verlangt aber wieder eine Entscheidung – also das Signal eines neuen Codes.
 */
export function signalFuer(e: Ergebnis): Signal {
  switch (e.art) {
    case 'aufgeloest':
      return e.treffer === 'mapping' && (e.exemplare ?? 0) > 0 ? 'regal' : 'neu'
    case 'erfasst':
      return 'erfasst'
    case 'schon_da':
      return 'regal'
    case 'fehler':
      return 'fehler'
  }
}

// --- Vorschlag für den Hauptknopf -------------------------------------------------

export type KandidatRelease = { releaseId: number; plattform: ScanPlattform; exemplare: number }

const rang = (p: ScanPlattform) => PLATTFORM_FOLGE.indexOf(p)

/**
 * Das Release, auf das „Disc erfassen" zielt: eines ohne Disc, unter mehreren
 * das der neuesten Plattform. `null`, wenn auf jedem schon eine steht – dann
 * gibt es nichts zu erfassen, sondern nur die Aussage „steht schon im Regal".
 */
export function hauptRelease(releases: readonly KandidatRelease[]): KandidatRelease | null {
  const frei = releases.filter((r) => r.exemplare === 0)
  if (frei.length === 0) return null
  return [...frei].sort((a, b) => rang(a.plattform) - rang(b.plattform))[0]
}

/**
 * Was „andere Plattform" anbietet: die übrigen Releases ohne Disc und jede
 * Plattform, die das Spiel noch nicht hat (das Release entsteht beim
 * Zuordnen, `releaseFuerPlattform`). Ein Release mit Disc steht nicht darin –
 * je Release genau eine Disc.
 */
export type PlattformWahl = { art: 'release'; releaseId: number; plattform: ScanPlattform } | { art: 'neu'; plattform: ScanPlattform }

export function anderePlattformen(releases: readonly KandidatRelease[], haupt: KandidatRelease | null): PlattformWahl[] {
  const vorhanden: PlattformWahl[] = releases
    .filter((r) => r.exemplare === 0 && r.releaseId !== haupt?.releaseId)
    .sort((a, b) => rang(a.plattform) - rang(b.plattform))
    .map((r) => ({ art: 'release', releaseId: r.releaseId, plattform: r.plattform }))
  const neu: PlattformWahl[] = PLATTFORM_FOLGE.filter((p) => !releases.some((r) => r.plattform === p)).map((p) => ({ art: 'neu', plattform: p }))
  return [...vorhanden, ...neu]
}

/** Das eine Ziel der Mehrheitsregel (9.2) steht vorn, sonst bleibt die Reihenfolge der Antwort. */
export function kandidatenOrdnen<K extends { spielId: number }>(kandidaten: readonly K[], zielSpielId: number | null): K[] {
  const ziel = kandidaten.filter((k) => k.spielId === zielSpielId)
  return [...ziel, ...kandidaten.filter((k) => k.spielId !== zielSpielId)]
}

// --- Rückgängig ---------------------------------------------------------------------

/** Ein Schreibzugriff des Rückwegs. `erwartet`: ein Status, der hier Erfolg heißt. */
export type Schritt = {
  methode: 'PATCH' | 'DELETE' | 'POST'
  pfad: string
  koerper?: Record<string, unknown>
  erwartet?: number
}

/** Was eine Erfassung im Scanner alles geschrieben hat – das Gedächtnis für Rückgängig. */
export type Erfassung = {
  exemplarId: number
  ean: string
  releaseId: number
  spielId: number | null
  absichtenErledigt: ReadonlyArray<{ id: number }>
  /** Das Erfassen hat die Disc-Fassung von „unbekannt" auf „ja" gesetzt. */
  physischStatusGesetzt?: boolean
  /** Das Spiel ist in diesem Zug entstanden (Fall 3: „Anlegen + Disc erfassen"). */
  spielNeu: boolean
  /** Das Release ist in diesem Zug entstanden („andere Plattform", „Release anhängen"). */
  releaseNeu: boolean
  /**
   * Worauf der Code vorher zeigte (Fall 1 → „Ist ein anderes Spiel"):
   * Zuordnen überschreibt das Mapping, Rückgängig muss es zurückbringen.
   */
  vorherMapping: { releaseId: number; mitDisc: boolean } | null
}

/**
 * Der Rückweg nach einer Erfassung – der Stand vor der Aktion, auch was der
 * Worker nebenbei geschrieben hat. Reihenfolge wie `erfassenZurueck`
 * (`preisliste.ts`):
 *
 * 1. **Erledigte Absichten wieder öffnen** – zuerst, damit ein Abbruch danach
 *    nie einen still erledigten Eintrag ohne Disc hinterlässt.
 * 2. **Disc löschen** (protokolliert `exemplar_geloescht`).
 * 3. **Mapping**: Zeigte der Code vorher auf ein anderes Release mit Disc,
 *    zeigt er wieder dorthin – über dieselbe Route, die dafür 409 antwortet
 *    und das Mapping trotzdem setzt (9.2). Zeigte er schon vorher auf dieses
 *    Release, bleibt es. Sonst wird es gelöst.
 * 4. **Was neu entstand, wieder weg**: ein neues Spiel samt Release
 *    (`DELETE /api/games`, `spiel_geloescht`), sonst ein neues Release
 *    (`DELETE /api/releases`, `release_geloescht`), sonst die Disc-Fassung
 *    zurück auf „unbekannt", wenn das Erfassen sie gesetzt hat.
 *
 * Grenze: Zeigte der Code vorher auf ein anderes Release **ohne** Disc, lässt
 * sich das Mapping nicht wiederherstellen, ohne dort eine Disc anzulegen – es
 * wird gelöst, und ein erneuter Scan fragt neu.
 */
export function scanZurueck(e: Erfassung): Schritt[] {
  const schritte: Schritt[] = e.absichtenErledigt.map((a) => ({
    methode: 'PATCH',
    pfad: `/api/plans/${a.id}`,
    koerper: { status: 'offen' },
  }))
  schritte.push({ methode: 'DELETE', pfad: `/api/physical-copies/${e.exemplarId}` })

  const vorher = e.vorherMapping
  if (vorher && vorher.releaseId !== e.releaseId && vorher.mitDisc) {
    schritte.push({ methode: 'POST', pfad: `/api/scan/${e.ean}/assign`, koerper: { releaseId: vorher.releaseId }, erwartet: 409 })
  } else if (!vorher || vorher.releaseId !== e.releaseId) {
    schritte.push({ methode: 'DELETE', pfad: `/api/scan/${e.ean}` })
  }

  if (e.spielNeu && e.spielId !== null) {
    schritte.push({ methode: 'DELETE', pfad: `/api/games/${e.spielId}` })
  } else if (e.releaseNeu) {
    schritte.push({ methode: 'DELETE', pfad: `/api/releases/${e.releaseId}` })
  } else if (e.physischStatusGesetzt === true) {
    schritte.push({ methode: 'PATCH', pfad: `/api/releases/${e.releaseId}`, koerper: { discFassung: 'unbekannt' } })
  }
  return schritte
}
