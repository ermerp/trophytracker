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

/**
 * Was `POST /api/games` neu angelegt hat (Nachtrag f1g). Ein neues Spiel
 * bringt sein Release mit. Bei `vorhanden: true` sagt `releaseNeu`, ob das
 * Release der Plattform eben erst entstand. **Fehlt der Schlüssel** (ein
 * älterer Worker), heißt das „unbekannt" – und dann wird nichts gelöscht:
 * Ein Rückgängig, das ein schon vorhandenes Release entfernte, wäre schlimmer
 * als eines, das ein neues stehen lässt.
 */
export function angelegtAus(a: { vorhanden?: boolean; releaseNeu?: boolean }): { spielNeu: boolean; releaseNeu: boolean } {
  if (a.vorhanden !== true) return { spielNeu: true, releaseNeu: true }
  return { spielNeu: false, releaseNeu: a.releaseNeu === true }
}

// --- Eine Hülle, mehrere Spiele (Nachtrag f1h) --------------------------------------

/**
 * Ein Ziel des Zuordnens: ein vorhandenes Release oder Spiel + Plattform
 * (das Release entsteht beim Zuordnen). Derselbe Wertebereich wie `ziele` in
 * `POST /api/scan/:ean/assign`.
 */
export type Ziel = { releaseId: number } | { spielId: number; plattform: ScanPlattform }

/** Ein gewähltes Spiel der Hülle – mit dem Ziel, auf das seine Disc kommt. */
export type HuellenWahl = { spielId: number; titel: string; plattform: ScanPlattform; ziel: Ziel; releaseNeu: boolean }

/** Höchstens so viele Spiele je Hülle – dieselbe Grenze wie `HOECHSTENS_ZIELE` im Worker. */
export const HOECHSTENS_SPIELE = 6

/**
 * Wohin die Disc eines Spiels auf einer Plattform kommt: an sein Release
 * dort, wenn es eines ohne Disc gibt, sonst an ein neues. `null`, wenn dort
 * schon eine Disc steht – je Release genau eine.
 */
export function zielAufPlattform(
  spielId: number,
  releases: readonly KandidatRelease[],
  plattform: ScanPlattform,
): { ziel: Ziel; releaseNeu: boolean } | null {
  const r = releases.find((x) => x.plattform === plattform)
  if (!r) return { ziel: { spielId, plattform }, releaseNeu: true }
  return r.exemplare > 0 ? null : { ziel: { releaseId: r.releaseId }, releaseNeu: false }
}

/** Ein Spiel an- oder abwählen; dasselbe Spiel steht höchstens einmal darin, und die Grenze gilt. */
export function wahlUmschalten(wahl: readonly HuellenWahl[], neu: HuellenWahl): HuellenWahl[] {
  const da = wahl.find((w) => w.spielId === neu.spielId)
  if (da && gleichesZiel(da.ziel, neu.ziel)) return wahl.filter((w) => w.spielId !== neu.spielId)
  if (da) return wahl.map((w) => (w.spielId === neu.spielId ? neu : w))
  return wahl.length >= HOECHSTENS_SPIELE ? [...wahl] : [...wahl, neu]
}

export function gleichesZiel(a: Ziel, b: Ziel): boolean {
  if ('releaseId' in a) return 'releaseId' in b && a.releaseId === b.releaseId
  return 'spielId' in b && a.spielId === b.spielId && a.plattform === b.plattform
}

/**
 * Beschriftung des Hauptknopfs: „Disc erfassen · PS4" für ein Spiel,
 * „Disc für n Spiele erfassen" für eine Hülle – dort ohne Plattform: Mit ihr
 * bricht die Beschriftung bei 360 px um (gemessen am 28.11.2026), und die
 * Plattform steht an jedem gewählten Spiel darüber.
 */
export function hauptText(wahl: readonly HuellenWahl[]): { text: string; plattform: ScanPlattform | null } {
  if (wahl.length > 1) return { text: `Disc für ${wahl.length} Spiele erfassen`, plattform: null }
  return { text: 'Disc erfassen', plattform: wahl[0]?.plattform ?? null }
}

/** Die eine Plattform aller gewählten Spiele – `null`, wenn sie sich unterscheiden oder nichts gewählt ist. */
export function gemeinsamePlattform(wahl: readonly HuellenWahl[]): ScanPlattform | null {
  const p = [...new Set(wahl.map((w) => w.plattform))]
  return p.length === 1 ? p[0] : null
}

/**
 * Die Reihenfolge der Ziele: Das Mapping zeigt nach dem Zuordnen auf das
 * erste. Steht das Release, auf das der Code vorher zeigte, unter den Zielen,
 * kommt es nach vorn – dann bleibt das Mapping, wo es war, und Rückgängig muss
 * es nicht wiederherstellen.
 */
export function zieleOrdnen(wahl: readonly HuellenWahl[], vorherReleaseId: number | null): HuellenWahl[] {
  const vorn = wahl.filter((w) => 'releaseId' in w.ziel && w.ziel.releaseId === vorherReleaseId)
  return [...vorn, ...wahl.filter((w) => !vorn.includes(w))]
}

// --- Eine Collection aus IGDB (Nachtrag f1i) ----------------------------------------

/**
 * Ist der IGDB-Treffer ein Bundle? Dann führt der Scanner zu den Spielen der
 * Sammlung, die darin stecken, statt die Collection als eigenes Spiel
 * anzulegen (Entscheidung des Nutzers vom 28.11.2026). Der Typ kommt als
 * Anzeigetext aus `IGDB_TYPEN` (`src/domain/igdb.ts`).
 */
export const istBundle = (typ: string | null | undefined): boolean => typ === 'Bundle'

/** Ein Spiel der Sammlung, das im Bundle steckt – wie `GET /api/igdb/bundle/:id/inhalt` es nennt. */
export type BundleSpiel = { spielId: number; titel: string; bild: string | null; releases: readonly KandidatRelease[] }

/**
 * Vorab gewählt sind alle Spiele des Bundles auf der Plattform des Treffers:
 * an ihrem Release dort, sonst an einem neuen (die Disc ist ein Beleg für die
 * Plattform). Steht dort schon eine Disc, bleibt das Spiel ungewählt – je
 * Release genau eine. Höchstens `HOECHSTENS_SPIELE`.
 */
export function bundleVorwahl(spiele: readonly BundleSpiel[], plattform: ScanPlattform): HuellenWahl[] {
  let wahl: HuellenWahl[] = []
  for (const s of spiele) {
    const z = zielAufPlattform(s.spielId, s.releases, plattform)
    if (z) wahl = wahlUmschalten(wahl, { spielId: s.spielId, titel: s.titel, plattform, ...z })
  }
  return wahl
}

/** Wörter, die eine Hülle beschreiben, nicht die Reihe – sie fallen am Ende weg. */
const HUELLEN_WORT =
  /^(collection|trilogy|trilogie|anthology|compilation|bundle|pack|double|triple|saga|legacy|hd|remastered|remaster|remix|classics|edition|complete|limited|box|set|series|volume|vol\.?|duology|quadrilogy|[ivx]+|\d+(\.\d+)?)$/i

/**
 * Ein Suchbegriff für die Sammlung aus dem Namen einer Collection – wenn der
 * Inhalt nicht weiterhilft. Die Suche der Sammlung sucht Teilstrings
 * (`GET /api/games?search=`), also reicht der Anfang der Reihe:
 *
 * - vor einem Untertitel („Far Cry: Wild Expedition" → „Far Cry"),
 * - das erste Spiel einer Aufzählung („Ico & Shadow of the Colossus" → „Ico"),
 * - ohne Hüllenwörter und Nummern am Ende („God of War Collection",
 *   „Kingdom Hearts HD 1.5" → „Kingdom Hearts").
 *
 * Bleibt nichts übrig, steht der Name unverändert da.
 */
export function reihenName(name: string): string {
  const roh = name.trim().replace(/\s+/g, ' ')
  const vorUntertitel = roh.split(/\s*:\s*|\s+[-–—]\s+/)[0]
  const erstes = vorUntertitel.split(/\s*(?:&|\+|\/)\s*|\s+(?:and|und)\s+/i)[0]
  const woerter = erstes.split(' ').filter((w) => w !== '')
  while (woerter.length > 1 && HUELLEN_WORT.test(woerter[woerter.length - 1])) woerter.pop()
  const ergebnis = woerter.join(' ')
  return ergebnis === '' ? roh : ergebnis
}

/**
 * Der ruhige Satz über der Liste der Hülle – warum sie so aussieht. Auch im
 * Normalfall sagt er, wie viele Spiele der Collection die Sammlung hat, damit
 * ein fehlendes auffällt (es lässt sich per Suche dazunehmen).
 */
export type BundleLage =
  | { art: 'fehler' }
  | { art: 'inhalt'; imBundle: number; spiele: number; gewaehlt: number; plattform: ScanPlattform }

export function bundleHinweis(l: BundleLage): string {
  if (l.art === 'fehler') return 'IGDB nennt den Inhalt gerade nicht – such die Spiele in deiner Sammlung.'
  if (l.imBundle === 0) return 'IGDB kennt keine Spiele dieser Collection – such sie in deiner Sammlung.'
  if (l.spiele === 0) return `Keines der ${l.imBundle} Spiele steht in deiner Sammlung – such sie hier.`
  const anteil = `${l.spiele} von ${l.imBundle} Spielen in deiner Sammlung`
  if (l.gewaehlt === 0) return `${anteil}, auf ${l.plattform === 'PSVITA' ? 'Vita' : l.plattform} schon im Regal.`
  return `${anteil}.`
}

// --- Der Rahmen des Kamerabilds --------------------------------------------------

/**
 * Was gerade unter dem Bild steht – soweit es für den Rahmen zählt. `code`
 * trägt das Signal, mit dem die Karte aufging (`signalFuer`).
 */
export type KartenLage = { art: 'leer' } | { art: 'erfasst' } | { art: 'code'; signal: Signal } | { art: 'fehler' }

/**
 * Die Farbe des Rahmens (Wunsch des Nutzers vom 28.11.2026): **Solange ein
 * Vorgang offen ist** – eine Karte wartet auf eine Entscheidung, die
 * Erkennung ruht –, steht die Farbe seines Falls (neuer Code, schon im Regal,
 * Fehler). Ist wieder Scannen dran (leer, erfasst), ist der Rahmen neutral
 * (`null`); nur das kurze Aufleuchten (`blitz`) nach „erfasst" bleibt, weil die
 * Kamera dort sofort weiterläuft.
 */
export function rahmenFuer(lage: KartenLage, blitz: Signal | null): Signal | null {
  switch (lage.art) {
    case 'code':
      return lage.signal
    case 'fehler':
      return 'fehler'
    case 'leer':
    case 'erfasst':
      return blitz
  }
}

// --- Rückgängig ---------------------------------------------------------------------

/** Ein Schreibzugriff des Rückwegs. `erwartet`: ein Status, der hier Erfolg heißt. */
export type Schritt = {
  methode: 'PATCH' | 'DELETE' | 'POST'
  pfad: string
  koerper?: Record<string, unknown>
  erwartet?: number
}

/** Eine Disc, die ein Zug angelegt hat – mit allem, was der Worker nebenbei schrieb. */
export type ErfassteDisc = {
  exemplarId: number
  releaseId: number
  spielId: number | null
  absichtenErledigt: ReadonlyArray<{ id: number }>
  /** Das Erfassen hat die Disc-Fassung von „unbekannt" auf „ja" gesetzt. */
  physischStatusGesetzt?: boolean
  /** Das Spiel ist in diesem Zug entstanden (Fall 3: „Anlegen + Disc erfassen"). */
  spielNeu: boolean
  /** Das Release ist in diesem Zug entstanden („andere Plattform", „Release anhängen"). */
  releaseNeu: boolean
}

/**
 * Was ein Zug im Scanner alles geschrieben hat – das Gedächtnis für
 * Rückgängig. Seit Nachtrag f1h kann ein Zug mehrere Discs anlegen: eine
 * Hülle, mehrere Spiele, alle mit demselben Code. Das Mapping zeigt danach
 * auf die erste.
 */
export type Erfassung = {
  ean: string
  discs: readonly ErfassteDisc[]
  /**
   * Worauf der Code vorher zeigte (Fall 1 → „Ist ein anderes Spiel",
   * „+ weiteres Spiel dieser Hülle"): Zuordnen überschreibt das Mapping,
   * Rückgängig muss es zurückbringen.
   */
  vorherMapping: { releaseId: number; mitDisc: boolean } | null
}

/** Eine Disc aus der Antwort von `POST /api/scan/:ean/assign`. */
export type AntwortDisc = {
  id: number
  releaseId: number
  physischStatusGesetzt?: boolean
  releaseNeu?: boolean
  spiel: { spielId: number } | null
  absichtenErledigt: ReadonlyArray<{ id: number }>
}

/**
 * Die Erfassung aus der Antwort. `releaseNeu` kommt vom Worker (er hat das
 * Release angelegt) **oder** vom Anlegen davor (Fall 3: `POST /api/games`
 * legte Spiel und Release an, `angelegt`). Ein fehlender Schlüssel heißt
 * „nicht neu" – wie bei `angelegtAus`: lieber ein Release stehen lassen als
 * ein vorhandenes löschen.
 */
export function erfassungAus(
  ean: string,
  discs: readonly AntwortDisc[],
  angelegt: { releaseId: number; spielNeu: boolean; releaseNeu: boolean } | null,
  vorherMapping: Erfassung['vorherMapping'],
): Erfassung {
  return {
    ean,
    vorherMapping,
    discs: discs.map((d) => {
      const vorab = angelegt?.releaseId === d.releaseId ? angelegt : null
      return {
        exemplarId: d.id,
        releaseId: d.releaseId,
        spielId: d.spiel?.spielId ?? null,
        absichtenErledigt: d.absichtenErledigt,
        physischStatusGesetzt: d.physischStatusGesetzt,
        spielNeu: vorab?.spielNeu ?? false,
        releaseNeu: d.releaseNeu === true || (vorab?.releaseNeu ?? false),
      }
    }),
  }
}

/**
 * Der Rückweg nach einem Zug – der Stand vor der Aktion, auch was der Worker
 * nebenbei geschrieben hat, für **jede** Disc des Zugs. Reihenfolge wie
 * `erfassenZurueck` (`preisliste.ts`):
 *
 * 1. **Erledigte Absichten wieder öffnen** – zuerst, damit ein Abbruch danach
 *    nie einen still erledigten Eintrag ohne Disc hinterlässt.
 * 2. **Discs löschen** (protokolliert je `exemplar_geloescht`).
 * 3. **Mapping**: Zeigte der Code vorher auf ein Release außerhalb des Zugs
 *    mit Disc, zeigt er wieder dorthin – über dieselbe Route, die dafür 409
 *    antwortet und das Mapping trotzdem setzt (9.2). Zeigte er schon vorher
 *    auf das erste Release des Zugs, bleibt es. Sonst wird es gelöst.
 * 4. **Was neu entstand, wieder weg**, je Disc: ein neues Spiel samt Release
 *    (`DELETE /api/games`, `spiel_geloescht`), sonst ein neues Release
 *    (`DELETE /api/releases`, `release_geloescht`), sonst die Disc-Fassung
 *    zurück auf „unbekannt", wenn das Erfassen sie gesetzt hat.
 *
 * Grenze: Zeigte der Code vorher auf ein Release **ohne** Disc, das nicht das
 * erste des Zugs ist, lässt sich das Mapping nicht wiederherstellen, ohne dort
 * eine Disc anzulegen – es wird gelöst, und ein erneuter Scan fragt neu.
 * `zieleOrdnen` stellt ein solches Release deshalb nach vorn.
 */
export function scanZurueck(e: Erfassung): Schritt[] {
  const schritte: Schritt[] = e.discs.flatMap((d) =>
    d.absichtenErledigt.map((a): Schritt => ({ methode: 'PATCH', pfad: `/api/plans/${a.id}`, koerper: { status: 'offen' } })),
  )
  for (const d of e.discs) schritte.push({ methode: 'DELETE', pfad: `/api/physical-copies/${d.exemplarId}` })

  const vorher = e.vorherMapping
  const jetzt = e.discs[0]?.releaseId ?? null
  const imZug = (id: number) => e.discs.some((d) => d.releaseId === id)
  if (vorher && !imZug(vorher.releaseId) && vorher.mitDisc) {
    schritte.push({ methode: 'POST', pfad: `/api/scan/${e.ean}/assign`, koerper: { releaseId: vorher.releaseId }, erwartet: 409 })
  } else if (!vorher || vorher.releaseId !== jetzt) {
    schritte.push({ methode: 'DELETE', pfad: `/api/scan/${e.ean}` })
  }

  for (const d of e.discs) {
    if (d.spielNeu && d.spielId !== null) {
      schritte.push({ methode: 'DELETE', pfad: `/api/games/${d.spielId}` })
    } else if (d.releaseNeu) {
      schritte.push({ methode: 'DELETE', pfad: `/api/releases/${d.releaseId}` })
    } else if (d.physischStatusGesetzt === true) {
      schritte.push({ methode: 'PATCH', pfad: `/api/releases/${d.releaseId}`, koerper: { discFassung: 'unbekannt' } })
    }
  }
  return schritte
}
