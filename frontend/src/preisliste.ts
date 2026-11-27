/**
 * Die Logik der Preisliste (Nachtrag f2e) – ohne React und ohne `api.ts`,
 * damit ein Test sie erreicht. Dasselbe Muster wie `vergleich.ts`.
 *
 * Wunschliste, Kaufliste und Lücken zeigen seit dem 27.11.2026 nur noch
 * Zeilen (Entscheidung des Nutzers, am Prototyp abgenommen): Cover, Titel,
 * eine Meta-Zeile, rechts die Preise, dahinter ein Menü „⋯". Was in der
 * Zeile steht und was das Menü anbietet, entscheidet sich hier:
 *
 * - **Sortierwert:** Die Meta-Zeile nennt den Wert, nach dem gerade sortiert
 *   wird – sonst sieht man der Reihenfolge nicht an, warum sie so ist.
 * - **Menü je Art und Status:** „erledigt" gibt es für Wunsch und Kauf nicht
 *   mehr als Handgriff (Entscheidung des Nutzers vom 27.11.2026) – ein Wunsch
 *   oder Kauf erledigt sich durch das Erfassen einer Disc oder Berechtigung.
 * - **Rückgängig nach dem Erfassen:** stellt den Stand davor vollständig her,
 *   auch was der Worker nebenbei geändert hat (Regel in CLAUDE.md).
 */

import type { LueckenSortierung, Sortierung } from './vergleich'

// --- Sortierwert -------------------------------------------------------------

/** „Wertung 94", „erscheint 12.3.2027", „2019" – `vor` ist die leise Beschriftung, `wert` der betonte Teil. */
export type Sortierwert = { vor: string | null; wert: string }

export type SortierwertFelder = {
  spieler: number | null
  kritik: number | null
  erscheinungsdatum: string | null
  /** Angekündigt: Dann zählt der Tag, nicht das Jahr. */
  angekuendigt: boolean
}

/** „2027-03-12" → „12.3.2027", ohne Gebietsschema – das Datum ist ein Tag, keine Uhrzeit. */
export function tagDatum(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split('-')
  return `${Number(t)}.${Number(m)}.${j}`
}

function releaseWert(f: SortierwertFelder): Sortierwert {
  if (f.angekuendigt) return { vor: 'erscheint', wert: f.erscheinungsdatum ? tagDatum(f.erscheinungsdatum) : 'unbekannt' }
  // Ohne Datum steht „unbekannt" ausgeschrieben, nie ein Strich (Abschnitt 3) –
  // und mit Beschriftung, sonst wüsste niemand, WAS unbekannt ist.
  return f.erscheinungsdatum ? { vor: null, wert: f.erscheinungsdatum.slice(0, 4) } : { vor: 'Release', wert: 'unbekannt' }
}

const wertung = (f: SortierwertFelder): Sortierwert => ({ vor: 'Wertung', wert: f.spieler === null ? 'unbekannt' : String(f.spieler) })

/**
 * Was die Meta-Zeile einer Wunsch- oder Kaufzeile nennt. Bei Titel, Favorit,
 * „zuletzt angelegt" und Gebrauchtpreis ist das die Spielerwertung – den
 * Preis zeigt die Zeile ohnehin rechts, und ein Titel ist kein Wert.
 */
export function sortierwert(sortierung: Sortierung, f: SortierwertFelder): Sortierwert {
  if (sortierung === 'kritik') return { vor: 'Kritik', wert: f.kritik === null ? 'unbekannt' : String(f.kritik) }
  if (sortierung === 'release') return releaseWert(f)
  return wertung(f)
}

/**
 * Dasselbe für eine Lücke. Bei Titel, Preis und Fortschritt steht **nichts**
 * zusätzlich da: Fortschritt und Preis stehen schon in der Zeile, und so
 * bleibt sie wie im abgenommenen Prototyp (Plattform · Prozent · Zustand).
 */
export function lueckenSortierwert(sortierung: LueckenSortierung, f: SortierwertFelder): Sortierwert | null {
  if (sortierung === 'wertung') return wertung(f)
  if (sortierung === 'kritik') return { vor: 'Kritik', wert: f.kritik === null ? 'unbekannt' : String(f.kritik) }
  if (sortierung === 'release') return releaseWert(f)
  return null
}

// --- Preise ------------------------------------------------------------------

/**
 * Ob die Zeile einen Digitalpreis trägt. Für PS3 und Vita fragt der Store
 * gar nicht (`OHNE_WEBSTORE` im Worker, 7.4) – dort ist der Preis nicht
 * unbekannt, sondern nicht vorgesehen, und es steht **nichts** da (Regel
 * „was eine Quelle nicht erhebt, steht gar nicht da", Abschnitt 3). Ein
 * Freitext ohne Plattform hat kein Release und damit auch keinen.
 */
export function digitalVorgesehen(plattform: string | null): boolean {
  return plattform === 'PS4' || plattform === 'PS5'
}

/** Der Rabatt in ganzen Prozent („−65 %"), nur im Angebot und nur gegen einen höheren Grundpreis. */
export function rabattProzent(preisCents: number, grundpreisCents: number | null, imAngebot: boolean): number | null {
  if (!imAngebot || grundpreisCents === null || grundpreisCents <= preisCents) return null
  return Math.round((100 * (grundpreisCents - preisCents)) / grundpreisCents)
}

// --- Menü ----------------------------------------------------------------------

export type MenueAktion =
  | 'aufKaufliste'
  | 'kauflisteAnsehen'
  | 'disc'
  | 'digital'
  | 'favorit'
  | 'plattform'
  | 'angebot'
  | 'verworfen'
  | 'oeffnen'
  | 'entfernen'
  | 'nichtGewuenscht'
  | 'wiederZeigen'

/** Die Zeichen des Menüs – eine Teilmenge von `ZEICHEN` in `Symbole.tsx`. */
export type MenueZeichen = 'wagen' | 'disc' | 'wolke' | 'stern' | 'stift' | 'kreuz' | 'oeffnen' | 'muell' | 'luecke'

export type MenueEintrag = {
  aktion: MenueAktion
  /** Der Text im Menü. */
  text: string
  zeichen: MenueZeichen
  /**
   * Die Hauptaktion: am Desktop zusätzlich als Pillen-Knopf in der Zeile
   * (`knopf` ist dann ihr Text), am Handy nur der oberste Menüeintrag.
   */
  haupt?: { knopf: string; ruhend?: boolean }
  /** Rot und unten – das, was nicht zurückkommt. */
  gefahr?: boolean
  /** Eine Trennlinie davor. */
  trenner?: boolean
}

/** Aus Gruppen eine Liste: Die erste Zeile jeder weiteren Gruppe trägt die Trennlinie. */
function gruppiert(gruppen: ReadonlyArray<ReadonlyArray<MenueEintrag | null | false>>): MenueEintrag[] {
  const voll = gruppen.map((g) => g.filter((e): e is MenueEintrag => Boolean(e))).filter((g) => g.length > 0)
  return voll.flatMap((g, i) => g.map((e, j) => (i > 0 && j === 0 ? { ...e, trenner: true } : e)))
}

/**
 * Das Gebrauchtangebot: verwerfen, wenn es eines mit Kennung gibt – sonst,
 * wenn hier schon etwas verworfen ist, der Weg zurück (Stufe 20h: ohne ihn
 * stünde „unbekannt" da, WEIL du entschieden hast, und keine Rücknahme).
 */
export function angebotEintrag(itemId: string | null, verworfen: number): MenueEintrag | null {
  if (itemId !== null) return { aktion: 'angebot', text: 'Gebrauchtangebot verwerfen', zeichen: 'disc' }
  if (verworfen > 0) return { aktion: 'angebot', text: `Verworfene Angebote (${verworfen})`, zeichen: 'disc' }
  return null
}

export type PlanMenueFelder = {
  art: 'wunsch' | 'kauf'
  status: 'offen' | 'erledigt' | 'verworfen'
  favorit: boolean
  releaseId: number | null
  spielId: number | null
  plattform: string | null
  /** Offener Kaufeintrag am selben Ziel (nur Wunsch). */
  aufKaufliste: number | null
  angebotItemId: string | null
  angebotVerworfen: number
}

/**
 * Das Menü einer Wunsch- oder Kaufzeile.
 *
 * - Wunsch offen: auf die Kaufliste (oder der Verweis, dass er dort steht),
 *   Disc und digital erfassen, Favorit, Plattform, Angebot, verworfen, entfernen.
 * - Kauf offen: Disc erfassen als Hauptaktion, sonst dasselbe.
 * - Erledigt oder verworfen: wieder öffnen, entfernen.
 *
 * Erfassen braucht ein Release; ein alter Freitext-Eintrag hat keines und
 * bekommt die Einträge nicht. Die Plattform braucht ein Spiel.
 */
export function planMenue(e: PlanMenueFelder): MenueEintrag[] {
  const entfernen: MenueEintrag = { aktion: 'entfernen', text: 'Entfernen', zeichen: 'muell', gefahr: true }
  if (e.status !== 'offen') {
    return gruppiert([[{ aktion: 'oeffnen', text: 'Wieder öffnen', zeichen: 'oeffnen', haupt: { knopf: 'wieder öffnen' } }], [entfernen]])
  }
  const mitRelease = e.releaseId !== null
  const disc: MenueEintrag = { aktion: 'disc', text: 'Disc erfassen', zeichen: 'disc' }
  const digital: MenueEintrag = { aktion: 'digital', text: 'Digital erfassen …', zeichen: 'wolke' }
  const haupt: MenueEintrag | null =
    e.art === 'wunsch'
      ? e.aufKaufliste !== null
        ? { aktion: 'kauflisteAnsehen', text: 'Steht auf der Kaufliste', zeichen: 'wagen', haupt: { knopf: 'auf der Kaufliste', ruhend: true } }
        : { aktion: 'aufKaufliste', text: 'Auf die Kaufliste', zeichen: 'wagen', haupt: { knopf: 'auf die Kaufliste' } }
      : mitRelease
        ? { ...disc, haupt: { knopf: 'Disc erfassen' } }
        : null
  return gruppiert([
    [
      haupt,
      e.art === 'wunsch' && mitRelease && disc,
      mitRelease && digital,
      { aktion: 'favorit', text: e.favorit ? 'Favorit entfernen' : 'Als Favorit markieren', zeichen: 'stern' },
      e.spielId !== null && {
        aktion: 'plattform',
        text: e.plattform ? `Plattform ändern (${e.plattform === 'PSVITA' ? 'Vita' : e.plattform})` : 'Plattform wählen',
        zeichen: 'stift',
      },
    ],
    [mitRelease && angebotEintrag(e.angebotItemId, e.angebotVerworfen), { aktion: 'verworfen', text: 'Verworfen', zeichen: 'kreuz' }],
    [entfernen],
  ])
}

export type LueckeMenueFelder = { verworfen: boolean; angebotItemId: string | null; angebotVerworfen: number }

/**
 * Das Menü einer belegten Lücke: auf die Kaufliste, Disc erfassen, physisch
 * nicht gewünscht, Gebrauchtangebot. Eine verworfene Lücke kennt nur den
 * Weg zurück. Entfernen gibt es nicht – eine Lücke ist eine Tatsache, keine
 * Absicht (5.3).
 */
export function lueckeMenue(l: LueckeMenueFelder): MenueEintrag[] {
  if (l.verworfen) {
    return [{ aktion: 'wiederZeigen', text: 'Wieder als Lücke zeigen', zeichen: 'luecke', haupt: { knopf: 'wieder als Lücke zeigen' } }]
  }
  return gruppiert([
    [
      { aktion: 'aufKaufliste', text: 'Auf die Kaufliste', zeichen: 'wagen', haupt: { knopf: 'auf die Kaufliste' } },
      { aktion: 'disc', text: 'Disc erfassen', zeichen: 'disc' },
    ],
    [{ aktion: 'nichtGewuenscht', text: 'Physisch nicht gewünscht', zeichen: 'kreuz' }, angebotEintrag(l.angebotItemId, l.angebotVerworfen)],
  ])
}

// --- Erfassen und Rückgängig ------------------------------------------------------

/** Ein Schreibzugriff des Rückwegs, in der Reihenfolge der Liste auszuführen. */
export type Schritt = { methode: 'PATCH' | 'DELETE'; pfad: string; koerper?: Record<string, unknown> }

export type Erfasst = {
  besitz: 'disc' | 'digital'
  /** Id des Exemplars bzw. der Berechtigung. */
  id: number
  releaseId: number
  /** Was der Worker beim Erfassen erledigt hat (`absichtenErledigen`). */
  absichtenErledigt: ReadonlyArray<{ id: number }>
  /** Nur bei der Disc: Der Worker hat die Disc-Fassung von „unbekannt" auf „ja" gesetzt. */
  physischStatusGesetzt?: boolean
}

/**
 * Der Rückweg nach dem Erfassen – der Stand vor der Aktion, auch das, was der
 * Worker nebenbei geändert hat:
 *
 * 1. **Die erledigten Absichten wieder öffnen.** Zuerst, wie im Scanner: Geht
 *    danach etwas schief, steht der Eintrag offen und die Disc noch da – die
 *    Liste zeigt das als „im Besitz". Andersherum wäre der Eintrag still
 *    erledigt, ohne dass etwas im Regal steht.
 * 2. **Disc bzw. Berechtigung löschen.**
 * 3. **Die Disc-Fassung zurück auf „unbekannt"**, wenn das Erfassen sie
 *    gesetzt hat. Das Löschen der Disc fasst sie absichtlich nicht an
 *    (`deletePhysicalCopy`), also muss es hier geschehen – zuletzt, weil ein
 *    gescheiterter Schritt dann nur eine belegte Disc-Fassung zurücklässt.
 *
 * Die Disc-Fassung kommt damit auf „unbekannt" und `physical_source` auf
 * NULL zurück; `physical_checked_at` steht danach aber auf jetzt statt auf
 * dem alten Stempel (`releaseAendern`) – der IGDB-Schritt kommt dadurch erst
 * nach seiner Frist wieder vorbei.
 */
export function erfassenZurueck(e: Erfasst): Schritt[] {
  const schritte: Schritt[] = e.absichtenErledigt.map((a) => ({ methode: 'PATCH', pfad: `/api/plans/${a.id}`, koerper: { status: 'offen' } }))
  schritte.push({ methode: 'DELETE', pfad: e.besitz === 'disc' ? `/api/physical-copies/${e.id}` : `/api/digital-entitlements/${e.id}` })
  if (e.besitz === 'disc' && e.physischStatusGesetzt === true) {
    schritte.push({ methode: 'PATCH', pfad: `/api/releases/${e.releaseId}`, koerper: { discFassung: 'unbekannt' } })
  }
  return schritte
}

/** Welche Liste der Worker erledigt hat – „Wunsch- und Kaufliste", „Kaufliste" oder „Wunschliste". */
export function erledigteListe(arten: Iterable<string>): string {
  const a = new Set(arten)
  return a.has('wunsch') && a.has('kauf') ? 'Wunsch- und Kaufliste' : a.has('kauf') ? 'Kaufliste' : 'Wunschliste'
}

/** „„Titel": Disc erfasst, von der Kaufliste erledigt." – die Meldung neben „Rückgängig". */
export function erfasstText(titel: string, was: string, erledigt: ReadonlyArray<{ art: string }>): string {
  const rest = erledigt.length > 0 ? `, von der ${erledigteListe(erledigt.map((x) => x.art))} erledigt` : ''
  return `„${titel}": ${was} erfasst${rest}.`
}

// --- Kopfzeilen ------------------------------------------------------------------

export type WunschKopfFelder = { status: string; aufKaufliste: number | null; store: { imAngebot: boolean } | null }

/**
 * „57 Wünsche · 14 im Angebot · 4 auf der Kaufliste" – gezählt über die
 * geladenen Einträge; „im Angebot" und „auf der Kaufliste" nur über die
 * offenen. Teile mit 0 fallen weg.
 */
export function wunschKopf(eintraege: readonly WunschKopfFelder[]): { anzahl: string; teile: string[] } {
  const offen = eintraege.filter((e) => e.status === 'offen')
  const angebot = offen.filter((e) => e.store?.imAngebot === true).length
  const kauf = offen.filter((e) => e.aufKaufliste !== null).length
  const teile: string[] = []
  if (angebot > 0) teile.push(`${angebot} im Angebot`)
  if (kauf > 0) teile.push(`${kauf} auf der Kaufliste`)
  return { anzahl: `${eintraege.length} ${eintraege.length === 1 ? 'Wunsch' : 'Wünsche'}`, teile }
}

/** „7 Einträge" – „1 Eintrag". */
export const eintraegeText = (n: number) => `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}`

// --- Lücken: Disc unklar ---------------------------------------------------------

export type BefundFelder = { titel: string; marktRohangebote: number | null }

/**
 * Die eindeutigen Fälle zuerst: erst „eBay kennt nichts" (0 Rohangebote),
 * dann das Ungeprüfte, dann das mit Angeboten ohne klare Zuordnung. So steht
 * oben, was sich in einem Klick entscheiden lässt.
 */
export function nachBefund<L extends BefundFelder>(zeilen: readonly L[]): L[] {
  const rang = (l: L) => (l.marktRohangebote === 0 ? 0 : l.marktRohangebote === null ? 1 : 2)
  return [...zeilen].sort((a, b) => rang(a) - rang(b) || a.titel.localeCompare(b.titel, 'de'))
}
