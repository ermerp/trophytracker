import type { Bewertung, DiscFassung, Platin, PlanArt, Plattform, Quelle, ReleaseStatus } from '../api'

/**
 * Die Typen der Spieldetail-Antwort (`GET /api/games/:id`), geteilt von der
 * Ansicht und ihren Teilen. Sie beschreiben, was der Worker liefert – nicht,
 * was die Datenbank hält: `markt`, `store`, `trophaeen` und `spielzeit` sind
 * null, solange keine Quelle gefragt wurde.
 */
export type Stufen = { bronze: number; silber: number; gold: number; platin: number }

export type Trophaeen = {
  npCommunicationId: string
  rohTitel: string
  fortschritt: number
  platin: Platin
  erspielt: Stufen
  definiert: Stufen
  zuletztGespielt: string | null
}

export type Exemplar = {
  id: number
  ean: string | null
  zustand: string | null
  anleitung: boolean
  kaufdatum: string | null
  kaufpreisCents: number | null
  notiz: string | null
  angelegtAm: string
}

export type Digital = { id: number; quelle: Quelle; erworbenAm: string | null; herkunft: 'nutzer' | 'psn' }

/** Spielzeit aus PSN (7.7); alle Felder können fehlen – PS3 und Vita liefern keine. */
export type Spielzeit = {
  sekunden: number | null
  anzahl: number | null
  erstesSpielAm: string | null
  letztesSpielAm: string | null
}

export type Release = {
  id: number
  plattform: Plattform
  edition: string | null
  region: string | null
  discFassung: DiscFassung
  discQuelle: string | null
  psnProductId: string | null
  /** Gebrauchtangebot aus eBay (Stufe 20); null heißt: noch nie gefragt. */
  markt: {
    geprueftAm: string
    rohangebote: number | null
    preisCents: number | null
    anbieter: string | null
    zustand: string | null
    url: string | null
  } | null
  /**
   * Store-Preis (Stufe 21); null heißt: noch nie gefragt. `befund` sagt,
   * warum kein Preis da ist, statt ihn als 0 auszugeben (Abschnitt 3).
   */
  store: {
    geprueftAm: string
    befund: string | null
    preisCents: number | null
    grundpreisCents: number | null
    imAngebot: boolean
    imPlusKatalog: boolean
    produktName: string | null
    produktId: string | null
    conceptId: string | null
  } | null
  trophaeen: Trophaeen | null
  bewertung: Bewertung | null
  exemplare: Exemplar[]
  digital: Digital[]
  spielzeit: Spielzeit | null
}

export type IgdbZustand = {
  id: number | null
  slug: string | null
  quelle: 'automatisch' | 'manuell' | null
  verknuepftAm: string | null
  aktualisiertAm: string | null
  gesuchtAm: string | null
  abgelehntAm: string | null
}

export type Kritik = { wert: number; anzahl: number | null; quelle: string | null; standVom: string | null }

/** Offene Absicht am Spiel (releaseId null) oder an einem seiner Releases (Stufe 10). */
export type Plan = {
  id: number
  art: PlanArt
  releaseId: number | null
  plattform: Plattform | null
  favorit: boolean
  notiz: string | null
}

export type Spiel = {
  id: number
  titel: string
  bild: string | null
  igdbId: number | null
  igdb: IgdbZustand
  kritik: Kritik | null
  erscheinungsdatum: string | null
  releaseStatus: ReleaseStatus
  plaene: Plan[]
  releases: Release[]
}
