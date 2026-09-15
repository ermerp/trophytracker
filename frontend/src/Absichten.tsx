import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, NavLink, useSearchParams } from 'react-router-dom'
import { PLAN_STATUSTEXT, PLATTFORMEN, STATUSTEXT, anfrage, datum, type PlanArt, type PlanEintrag } from './api'

/**
 * Geteilte Bausteine der Listen (Abschnitt 5): Wunschliste (Stufe 10), To-Do
 * und Backlog (Stufe 12) zeigen dieselbe Kachel und dieselben Filter. Was
 * sich unterscheidet – die IGDB-Suche der Wunschliste, das Sortieren der
 * To-Do-Liste, die Kandidaten des Backlogs –, bleibt in den Ansichten.
 *
 * Sortierung und Filter liegen in der URL, wie in der Sammlung.
 */

export const SORTIERTEXT = {
  favorit: 'Favoriten zuerst, dann Wertung',
  wertung: 'Kritikerwertung',
  titel: 'Titel',
  release: 'Erscheinungsdatum',
  angelegt: 'zuletzt angelegt',
  position: 'eigene Reihenfolge',
} as const
export type Sortierung = keyof typeof SORTIERTEXT

const PLATTFORM_FILTER = [...PLATTFORMEN, 'ohne'] as const

/** Dieselbe Ordnung wie im Worker, damit eine Änderung die Kachel sofort an ihren Platz rückt. */
const nachTitel = (a: PlanEintrag, b: PlanEintrag) => a.titel.localeCompare(b.titel, 'de') || a.id - b.id
const nachWertung = (a: PlanEintrag, b: PlanEintrag) => (b.kritik ?? -1) - (a.kritik ?? -1) || nachTitel(a, b)
export const VERGLEICH: Record<Sortierung, (a: PlanEintrag, b: PlanEintrag) => number> = {
  favorit: (a, b) => Number(b.favorit) - Number(a.favorit) || nachWertung(a, b),
  wertung: nachWertung,
  titel: nachTitel,
  release: (a, b) => (a.erscheinungsdatum ?? '9999').localeCompare(b.erscheinungsdatum ?? '9999') || nachTitel(a, b),
  angelegt: (a, b) => b.angelegtAm.localeCompare(a.angelegtAm) || b.id - a.id,
  position: (a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.id - b.id,
}

/** Die Liste im Dativ, für Meldungen und Rückfragen. */
export const LISTE_DATIV: Record<PlanArt, string> = {
  wunsch: 'der Wunschliste',
  todo: 'der To-Do-Liste',
  backlog: 'dem Backlog',
  kauf: 'der Kaufliste',
}

/** „auf die Wunschliste gesetzt", „auf To-Do gesetzt", „ins Backlog gesetzt". */
function gesetztText(e: PlanEintrag): string {
  if (e.status === 'verworfen') return 'als nicht vorgesehen abgelehnt'
  return { wunsch: 'auf die Wunschliste gesetzt', todo: 'auf To-Do gesetzt', backlog: 'ins Backlog gesetzt', kauf: 'auf die Kaufliste gesetzt' }[e.art]
}

type Antwort = { sortierung: Sortierung; eintraege: PlanEintrag[] }

/**
 * Zustand und Schreibzugriffe einer Liste. `laden` fragt den Worker mit den
 * Filtern aus der URL; `ersetze` sortiert eine geänderte Kachel lokal ein,
 * ohne neu zu laden; `anlegen` merkt sich den neuen Eintrag für „Rückgängig".
 */
export function usePlanListe(art: PlanArt) {
  const [params, setParams] = useSearchParams()
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [eben, setEben] = useState<PlanEintrag | null>(null)

  const standard: Sortierung = art === 'todo' ? 'position' : 'favorit'
  const sortierung: Sortierung = (params.get('sort') as Sortierung) in SORTIERTEXT ? (params.get('sort') as Sortierung) : standard
  const nurFavoriten = params.get('favorit') === '1'
  const alle = params.get('status') === 'alle'
  const plattformParam = params.get('plattform') ?? ''
  const plattformen = new Set(plattformParam.split(',').filter((p) => (PLATTFORM_FILTER as readonly string[]).includes(p)))

  const laden = useCallback(async () => {
    try {
      const abfrage = new URLSearchParams({ kind: art, sort: sortierung })
      if (nurFavoriten) abfrage.set('favorit', '1')
      if (alle) abfrage.set('status', 'alle')
      if (plattformParam) abfrage.set('plattform', plattformParam)
      setDaten(await anfrage<Antwort>(`/api/plans?${abfrage}`))
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
    }
  }, [art, sortierung, nurFavoriten, alle, plattformParam])

  useEffect(() => {
    void laden()
  }, [laden])

  function setzeParam(name: string, wert: string) {
    const neu = new URLSearchParams(params)
    if (wert) neu.set(name, wert)
    else neu.delete(name)
    setParams(neu, { replace: true })
  }

  function plattformFilterUmschalten(p: string) {
    const neu = new Set(plattformen)
    if (neu.has(p)) neu.delete(p)
    else neu.add(p)
    setzeParam('plattform', [...neu].join(','))
  }

  /** Eine Kachel im lokalen Stand ersetzen und neu einsortieren – kein Neuladen. */
  function ersetze(e: PlanEintrag) {
    setDaten((d) => {
      if (!d) return d
      const rest = d.eintraege.filter((x) => x.id !== e.id)
      const bleibt =
        e.art === art &&
        (alle || e.status === 'offen') &&
        (!nurFavoriten || e.favorit) &&
        (plattformen.size === 0 || plattformen.has(e.plattform ?? 'ohne'))
      return { ...d, eintraege: (bleibt ? [...rest, e] : rest).sort(VERGLEICH[sortierung]) }
    })
  }

  async function aendern(id: number, koerper: Record<string, unknown>) {
    setMeldung(null)
    try {
      ersetze(await anfrage<PlanEintrag>(`/api/plans/${id}`, { methode: 'PATCH', koerper }))
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Ändern fehlgeschlagen.')
    }
  }

  async function entfernen(e: PlanEintrag) {
    if (!confirm(`„${e.titel}" von ${LISTE_DATIV[art]} entfernen?`)) return
    setMeldung(null)
    try {
      await anfrage(`/api/plans/${e.id}`, { methode: 'DELETE' })
      setDaten((d) => d && { ...d, eintraege: d.eintraege.filter((x) => x.id !== e.id) })
      if (eben?.id === e.id) setEben(null)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Entfernen fehlgeschlagen.')
    }
  }

  /** Anlegen (Standard: diese Liste); der neue Eintrag steht für „Rückgängig" bereit. */
  async function anlegen(koerper: Record<string, unknown>): Promise<PlanEintrag | null> {
    setLaeuft(true)
    setMeldung(null)
    try {
      const e = await anfrage<PlanEintrag & { spielAngelegt: boolean }>('/api/plans', {
        methode: 'POST',
        koerper: { art, ...koerper },
      })
      setEben(e)
      await laden()
      return e
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Anlegen fehlgeschlagen.')
      return null
    } finally {
      setLaeuft(false)
    }
  }

  /** Löscht den eben angelegten Eintrag – samt Spiel und Release, falls sie nur dafür entstanden. */
  async function rueckgaengig() {
    if (!eben) return
    const e = eben
    setEben(null)
    try {
      await anfrage(`/api/plans/${e.id}`, { methode: 'DELETE' })
      setDaten((d) => d && { ...d, eintraege: d.eintraege.filter((x) => x.id !== e.id) })
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Rückgängig fehlgeschlagen.')
    }
  }

  return {
    art, daten, setDaten, meldung, setMeldung, laeuft, setLaeuft, eben, setEben,
    sortierung, nurFavoriten, alle, plattformen,
    laden, setzeParam, plattformFilterUmschalten, ersetze, aendern, entfernen, anlegen, rueckgaengig,
  }
}

export type PlanListe = ReturnType<typeof usePlanListe>

/** Sortierung, Favoriten, erledigte, Plattformen. Ohne `sortierbar` fehlt das Sortier-Dropdown (To-Do). */
export function Filterleiste({ liste, sortierbar = true }: { liste: PlanListe; sortierbar?: boolean }) {
  const { sortierung, nurFavoriten, alle, plattformen, setzeParam, plattformFilterUmschalten } = liste
  const standard = liste.art === 'todo' ? 'position' : 'favorit'
  return (
    <div className="filterleiste">
      {sortierbar && (
        <label>
          Sortierung{' '}
          <select value={sortierung} onChange={(e) => setzeParam('sort', e.target.value === standard ? '' : e.target.value)}>
            {Object.entries(SORTIERTEXT)
              .filter(([wert]) => wert !== 'position' || liste.art === 'todo')
              .map(([wert, text]) => (
                <option key={wert} value={wert}>{text}</option>
              ))}
          </select>
        </label>
      )}
      <label>
        <input type="checkbox" checked={nurFavoriten} onChange={(e) => setzeParam('favorit', e.target.checked ? '1' : '')} /> nur Favoriten
      </label>
      <label>
        <input type="checkbox" checked={alle} onChange={(e) => setzeParam('status', e.target.checked ? 'alle' : '')} /> auch erledigte und verworfene
      </label>
      <span className="plattformfilter" role="group" aria-label="Plattformen">
        {PLATTFORM_FILTER.map((p) => (
          <label key={p}>
            <input type="checkbox" checked={plattformen.has(p)} onChange={() => plattformFilterUmschalten(p)} /> {p === 'ohne' ? 'ohne Plattform' : p}
          </label>
        ))}
      </span>
    </div>
  )
}

/** Fehlermeldung und die Rückgängig-Zeile nach dem Anlegen. */
export function Meldungen({ liste }: { liste: PlanListe }) {
  const { meldung, eben, rueckgaengig } = liste
  return (
    <>
      {meldung && <p role="alert" className="auffaellig">{meldung}</p>}
      {eben && (
        <p role="status" className="hinweis">
          „{eben.titel}" {gesetztText(eben)}.{' '}
          <button type="button" onClick={rueckgaengig}>Rückgängig</button>
        </p>
      )}
    </>
  )
}

/** To-Do und Backlog sind eine Seite mit zwei Reitern (Abschnitt 13). */
export function Reiter() {
  return (
    <nav className="reiter" aria-label="Listen">
      <NavLink to="/todo">To-Do</NavLink>
      <NavLink to="/backlog">Backlog</NavLink>
    </nav>
  )
}

type KarteProps = {
  e: PlanEintrag
  liste: PlanListe
  /** Drag-Griff vor dem Kopf (To-Do). */
  griff?: ReactNode
  /** Artspezifische Knöpfe in der Knopfzeile, etwa „auf To-Do". */
  knoepfe?: ReactNode
  liRef?: (el: HTMLLIElement | null) => void
  style?: CSSProperties
  className?: string
}

/**
 * Eine Kachel: Cover, Titel, Kritik und Jahr, Stern, Plattform-Dropdown
 * (hängt den Eintrag um), erledigt/verworfen/wieder öffnen, entfernen,
 * Notiz. Bei To-Do und Backlog dazu der Vorschlag „erledigt", wenn die
 * eigene Bewertung durchgespielt/komplettiert/abgebrochen sagt (Abschnitt
 * 5) – ein Knopf, nie ein Automatismus.
 */
export function PlanKarte({ e, liste, griff, knoepfe, liRef, style, className }: KarteProps) {
  const { aendern, entfernen } = liste
  const [notizOffen, setNotizOffen] = useState(false)
  const klassen = ['kachel', e.status === 'offen' ? '' : 'erledigt', className ?? ''].filter(Boolean).join(' ')

  return (
    <li ref={liRef} style={style} className={klassen}>
      <div className="wunsch-kopf">
        {griff}
        {e.spielId !== null ? (
          <Link to={`/spiel/${e.spielId}`} className={e.bild ? 'bild cover' : 'bild'}>
            {e.bild ? <img src={e.bild} alt="" loading="lazy" /> : <span aria-hidden="true">{e.titel.slice(0, 1)}</span>}
          </Link>
        ) : (
          <span className="bild" aria-hidden="true">?</span>
        )}
        <div>
          {e.spielId !== null ? (
            <Link to={`/spiel/${e.spielId}`} className="titel">{e.titel}</Link>
          ) : (
            <span className="titel">{e.titel}</span>
          )}
          <div className="zeile">
            {e.spielId === null ? 'ohne IGDB-Eintrag' : `Kritik ${e.kritik ?? 'unbekannt'}`}
            {e.releaseStatus === 'angekuendigt' && ` · erscheint ${e.erscheinungsdatum ? datum(e.erscheinungsdatum) : 'unbekannt'}`}
            {e.releaseStatus !== 'angekuendigt' && e.erscheinungsdatum && ` · ${e.erscheinungsdatum.slice(0, 4)}`}
            {e.art !== 'wunsch' && e.eigenerStatus && ` · ${STATUSTEXT[e.eigenerStatus]}`}
            {e.status !== 'offen' && ` · ${PLAN_STATUSTEXT[e.status]}`}
          </div>
        </div>
      </div>

      {e.art !== 'wunsch' && e.erledigtVorgeschlagen && (
        <p className="hinweis vorschlag">
          Bewertung sagt „{STATUSTEXT[e.eigenerStatus!]}".{' '}
          <button type="button" className="klein" onClick={() => aendern(e.id, { status: 'erledigt' })}>erledigt setzen</button>
        </p>
      )}

      <div className="besitz">
        <button
          type="button"
          className={e.favorit ? 'stern aktiv' : 'stern'}
          aria-pressed={e.favorit}
          title={e.favorit ? 'Favorit – klicken zum Entfernen' : 'Als Favorit markieren'}
          onClick={() => aendern(e.id, { favorit: !e.favorit })}
        >
          {e.favorit ? '★' : '☆'}
        </button>
        {e.spielId !== null ? (
          <select
            value={e.plattform ?? ''}
            aria-label="Plattform"
            title="Plattform des Eintrags – ein Release entsteht bei Bedarf"
            onChange={(ev) => aendern(e.id, { plattform: ev.target.value })}
          >
            <option value="">ohne Plattform</option>
            {PLATTFORMEN.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        ) : (
          <span className="zeile">ohne Plattform</span>
        )}
        {e.status === 'offen' ? (
          <>
            {knoepfe}
            <button type="button" className="klein" onClick={() => aendern(e.id, { status: 'erledigt' })}>erledigt</button>
            <button type="button" className="klein" onClick={() => aendern(e.id, { status: 'verworfen' })}>verworfen</button>
          </>
        ) : (
          <button type="button" className="klein" onClick={() => aendern(e.id, { status: 'offen' })}>wieder öffnen</button>
        )}
        <button type="button" className="klein gefaehrlich" onClick={() => entfernen(e)}>entfernen</button>
      </div>

      {notizOffen ? (
        <form
          className="notizfeld"
          onSubmit={(ev) => {
            ev.preventDefault()
            const notiz = new FormData(ev.currentTarget).get('notiz')
            setNotizOffen(false)
            void aendern(e.id, { notiz: typeof notiz === 'string' ? notiz : '' })
          }}
        >
          <input name="notiz" defaultValue={e.notiz ?? ''} aria-label="Notiz" autoFocus />
          <button type="submit" className="klein">Speichern</button>
          <button type="button" className="klein" onClick={() => setNotizOffen(false)}>Abbrechen</button>
        </form>
      ) : (
        <button type="button" className="notiz" onClick={() => setNotizOffen(true)} title="Notiz bearbeiten">
          {e.notiz ?? 'Notiz …'}
        </button>
      )}
    </li>
  )
}
