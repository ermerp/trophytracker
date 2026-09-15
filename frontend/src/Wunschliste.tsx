import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PLAN_STATUSTEXT, PLATTFORMEN, anfrage, datum, type IgdbKandidat, type PlanEintrag } from './api'
import { IgdbSuche } from './IgdbSuche'

/**
 * Wunschliste (Use Case 4, ab Stufe 10; Use Case 11 für das Datum).
 *
 * Favoriten zuerst, dann nach Kritikerwertung (5.2); alternativ Wertung,
 * Titel, Erscheinungsdatum, zuletzt angelegt. Filter: nur Favoriten,
 * Plattformen, „ohne Plattform" – der Filter, mit dem sich Wünsche ohne
 * Plattform nachpflegen lassen (Entscheidung des Nutzers vom 15.09.2026).
 * Neue Wünsche kommen aus der IGDB-Suche mit der neuesten Plattform des
 * Treffers als Vorgabe; „ohne Plattform" bleibt wählbar. Ein Eintrag ohne
 * IGDB-Zuordnung entsteht nur über den ausdrücklichen Knopf (8.2). Bei
 * angekündigten Titeln steht das Erscheinungsdatum dort, wo später der
 * Preis steht (8.4). Ein Release nur aus Wunsch zählt nicht zur Sammlung
 * (Abschnitt 3).
 *
 * Sortierung und Filter liegen in der URL, wie in der Sammlung.
 */

type Antwort = { sortierung: Sortierung; eintraege: PlanEintrag[] }

const SORTIERTEXT = {
  favorit: 'Favoriten zuerst, dann Wertung',
  wertung: 'Kritikerwertung',
  titel: 'Titel',
  release: 'Erscheinungsdatum',
  angelegt: 'zuletzt angelegt',
} as const
type Sortierung = keyof typeof SORTIERTEXT

const PLATTFORM_FILTER = [...PLATTFORMEN, 'ohne'] as const

/** Dieselbe Ordnung wie im Worker, damit eine Änderung die Kachel sofort an ihren Platz rückt. */
const nachTitel = (a: PlanEintrag, b: PlanEintrag) => a.titel.localeCompare(b.titel, 'de') || a.id - b.id
const nachWertung = (a: PlanEintrag, b: PlanEintrag) => (b.kritik ?? -1) - (a.kritik ?? -1) || nachTitel(a, b)
const VERGLEICH: Record<Sortierung, (a: PlanEintrag, b: PlanEintrag) => number> = {
  favorit: (a, b) => Number(b.favorit) - Number(a.favorit) || nachWertung(a, b),
  wertung: nachWertung,
  titel: nachTitel,
  release: (a, b) => (a.erscheinungsdatum ?? '9999').localeCompare(b.erscheinungsdatum ?? '9999') || nachTitel(a, b),
  angelegt: (a, b) => b.angelegtAm.localeCompare(a.angelegtAm) || b.id - a.id,
}

export function Wunschliste() {
  const [params, setParams] = useSearchParams()
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [hinzufuegen, setHinzufuegen] = useState(false)
  const [eben, setEben] = useState<PlanEintrag | null>(null)
  const [notizOffen, setNotizOffen] = useState<number | null>(null)
  // 'auto' = die neueste Plattform des Treffers; '' = ausdruecklich ohne.
  const [plattform, setPlattform] = useState('auto')

  const sortierung: Sortierung = (params.get('sort') as Sortierung) in SORTIERTEXT ? (params.get('sort') as Sortierung) : 'favorit'
  const nurFavoriten = params.get('favorit') === '1'
  const alle = params.get('status') === 'alle'
  const plattformParam = params.get('plattform') ?? ''
  const plattformen = new Set(plattformParam.split(',').filter((p) => (PLATTFORM_FILTER as readonly string[]).includes(p)))

  const laden = useCallback(async () => {
    try {
      const abfrage = new URLSearchParams({ kind: 'wunsch', sort: sortierung })
      if (nurFavoriten) abfrage.set('favorit', '1')
      if (alle) abfrage.set('status', 'alle')
      if (plattformParam) abfrage.set('plattform', plattformParam)
      setDaten(await anfrage<Antwort>(`/api/plans?${abfrage}`))
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
    }
  }, [sortierung, nurFavoriten, alle, plattformParam])

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
    if (!confirm(`„${e.titel}" von der Wunschliste entfernen?`)) return
    setMeldung(null)
    try {
      await anfrage(`/api/plans/${e.id}`, { methode: 'DELETE' })
      setDaten((d) => d && { ...d, eintraege: d.eintraege.filter((x) => x.id !== e.id) })
      if (eben?.id === e.id) setEben(null)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Entfernen fehlgeschlagen.')
    }
  }

  async function anlegen(koerper: Record<string, unknown>) {
    setLaeuft(true)
    setMeldung(null)
    try {
      const e = await anfrage<PlanEintrag & { spielAngelegt: boolean }>('/api/plans', {
        methode: 'POST',
        koerper: { art: 'wunsch', ...koerper },
      })
      setEben(e)
      setHinzufuegen(false)
      await laden()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Anlegen fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

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

  const igdbWaehlen = (k: IgdbKandidat) => anlegen({ igdbId: k.igdbId, plattform })
  // Freitext hat kein Spiel und damit kein Release - die Plattform bleibt weg.
  const ohneTreffer = (begriff: string) => anlegen({ titel: begriff })

  return (
    <>
      <h1>Wunschliste</h1>

      <section className="anlegen">
        <button type="button" onClick={() => setHinzufuegen(!hinzufuegen)} disabled={laeuft}>
          {hinzufuegen ? 'Schließen' : 'Wunsch hinzufügen'}
        </button>{' '}
        <Link to="/import" className="zeile">Liste importieren</Link>
        {hinzufuegen && (
          <>
            <p className="zeile">
              Bei IGDB suchen und übernehmen. Ohne Wahl bekommt der Wunsch die neueste Plattform des Treffers; Freitext bleibt immer ohne Plattform.
            </p>
            <label className="zeile">
              Plattform{' '}
              <select value={plattform} onChange={(e) => setPlattform(e.target.value)} disabled={laeuft}>
                <option value="auto">neueste des Treffers</option>
                {PLATTFORMEN.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
                <option value="">ohne Plattform</option>
              </select>
            </label>
            <IgdbSuche
              vorgabe=""
              plattformen={plattform && plattform !== 'auto' ? [plattform] : []}
              onWahl={igdbWaehlen}
              onOhneTreffer={ohneTreffer}
              laeuft={laeuft}
            />
          </>
        )}
      </section>

      <div className="filterleiste">
        <label>
          Sortierung{' '}
          <select value={sortierung} onChange={(e) => setzeParam('sort', e.target.value === 'favorit' ? '' : e.target.value)}>
            {Object.entries(SORTIERTEXT).map(([wert, text]) => (
              <option key={wert} value={wert}>{text}</option>
            ))}
          </select>
        </label>
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

      {meldung && <p role="alert" className="auffaellig">{meldung}</p>}
      {eben && (
        <p role="status" className="hinweis">
          „{eben.titel}" auf die Wunschliste gesetzt.{' '}
          <button type="button" onClick={rueckgaengig}>Rückgängig</button>
        </p>
      )}

      {!daten ? (
        <p>wird geladen …</p>
      ) : daten.eintraege.length === 0 ? (
        <p>{nurFavoriten || plattformen.size > 0 ? 'Nichts passt zum Filter.' : 'Die Wunschliste ist leer.'}</p>
      ) : (
        <>
          <p>{daten.eintraege.length} Einträge</p>
          <ul className="kacheln">
            {daten.eintraege.map((e) => (
              <li key={e.id} className={e.status === 'offen' ? 'kachel' : 'kachel erledigt'}>
                <div className="wunsch-kopf">
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
                      {e.status !== 'offen' && ` · ${PLAN_STATUSTEXT[e.status]}`}
                    </div>
                  </div>
                </div>

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
                      title="Plattform des Wunsches – ein Release entsteht bei Bedarf"
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
                      <button type="button" className="klein" onClick={() => aendern(e.id, { status: 'erledigt' })}>erledigt</button>
                      <button type="button" className="klein" onClick={() => aendern(e.id, { status: 'verworfen' })}>verworfen</button>
                    </>
                  ) : (
                    <button type="button" className="klein" onClick={() => aendern(e.id, { status: 'offen' })}>wieder öffnen</button>
                  )}
                  <button type="button" className="klein gefaehrlich" onClick={() => entfernen(e)}>entfernen</button>
                </div>

                {notizOffen === e.id ? (
                  <form
                    className="notizfeld"
                    onSubmit={(ev) => {
                      ev.preventDefault()
                      const notiz = new FormData(ev.currentTarget).get('notiz')
                      setNotizOffen(null)
                      void aendern(e.id, { notiz: typeof notiz === 'string' ? notiz : '' })
                    }}
                  >
                    <input name="notiz" defaultValue={e.notiz ?? ''} aria-label="Notiz" autoFocus />
                    <button type="submit" className="klein">Speichern</button>
                    <button type="button" className="klein" onClick={() => setNotizOffen(null)}>Abbrechen</button>
                  </form>
                ) : (
                  <button type="button" className="notiz" onClick={() => setNotizOffen(e.id)} title="Notiz bearbeiten">
                    {e.notiz ?? 'Notiz …'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
