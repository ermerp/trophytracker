import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  DISCTEXT,
  PLATINTEXT,
  PLATTFORMEN,
  PLAY_STATUS,
  QUELLEN,
  QUELLENTEXT,
  STATUSTEXT,
  anfrage,
  erledigtText,
  type DiscFassung,
  type ErfasstAntwort,
  type Platin,
  type PlayStatus,
  type Plattform,
  type Quelle,
} from './api'
import { Hinweise } from './Hinweise'
import { SpielAnlegen } from './SpielAnlegen'

/**
 * Sammlung (Use Case 1): Kachelraster mit Filterleiste und Suche.
 *
 * Besitz lässt sich direkt in der Kachel erfassen – bei 431 Titeln entscheidet
 * die Klickzahl darüber, ob die Ersterfassung des Regals durchgezogen wird.
 * Weil man sich dabei vertippt, gibt es ein Rückgängig direkt nach dem
 * Anlegen und ein Löschen an jedem Kennzeichen, ohne Umweg über das
 * Spieldetail.
 *
 * Die Filter liegen in der URL, damit „Zurück" aus dem Spieldetail den
 * Stand wiederherstellt.
 */

const SEITE = 50

type Release = {
  id: number
  plattform: Plattform
  discFassung: DiscFassung
  fortschritt: number | null
  platin: Platin | null
  zuletztGespielt: string | null
  status: PlayStatus | null
  exemplare: number
  digital: Quelle[]
}

type Spiel = {
  id: number
  titel: string
  bild: string | null
  /** true: `bild` ist das IGDB-Cover (Hochformat), sonst das Trophäensymbol. */
  cover: boolean
  kritik: number | null
  zuletztGespielt: string | null
  releases: Release[]
}

type Antwort = { gesamt: number; limit: number; offset: number; spiele: Spiel[] }

/**
 * Zuletzt angelegter Besitz je Release – für das Rückgängig. Seit Stufe 15
 * mit den Absichten, die der Worker dabei erledigt hat (Kauf und Wunsch,
 * Abschnitt 5): Rückgängig öffnet sie wieder, und solange das Release auf
 * keiner Liste steht, wird „ins Backlog" angeboten.
 */
type Erledigt = Pick<ErfasstAntwort, 'absichtenErledigt' | 'aufListe'>
type Eben =
  | ({ art: 'exemplar'; id: number; releaseId: number } & Erledigt)
  | ({ art: 'digital'; id: number; releaseId: number; quelle: Quelle } & Erledigt)

const FILTER = {
  platform: { text: 'Plattform', werte: PLATTFORMEN.map((p) => [p, p] as const) },
  owned: {
    text: 'Besitz',
    werte: [
      ['physisch', 'physisch'],
      ['digital', 'digital'],
      ['beide', 'physisch und digital'],
      ['keins', 'nicht im Besitz'],
    ] as const,
  },
  played: { text: 'Gespielt', werte: [['ja', 'ja'], ['nein', 'nein']] as const },
  platinum: {
    text: 'Platin',
    werte: [['ja', 'erspielt'], ['nein', 'offen'], ['nichtverfuegbar', 'nicht vorgesehen']] as const,
  },
  // „nicht gespielt" deckt auch Releases ohne Zeile ab (COALESCE im Server).
  playStatus: { text: 'Status', werte: PLAY_STATUS.map((w) => [w, STATUSTEXT[w]] as const) },
  physicalAvailable: {
    text: 'Disc-Fassung',
    werte: [['ja', 'ja'], ['nein', 'nein'], ['unbekannt', 'unbekannt']] as const,
  },
} as const

type FilterName = keyof typeof FILTER

const SORTIERTEXT = { titel: 'Titel', zuletzt: 'zuletzt gespielt' } as const

export function Sammlung() {
  const [params, setParams] = useSearchParams()
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [suchtext, setSuchtext] = useState(params.get('search') ?? '')
  const [eben, setEben] = useState<Eben | null>(null)
  const [offen, setOffen] = useState<number | null>(null)

  const offset = Math.max(0, Number(params.get('offset')) || 0)

  const laden = useCallback(async () => {
    setLaedt(true)
    try {
      const abfrage = new URLSearchParams(params)
      abfrage.set('limit', String(SEITE))
      setDaten(await anfrage<Antwort>(`/api/games?${abfrage}`))
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
    } finally {
      setLaedt(false)
    }
  }, [params])

  useEffect(() => {
    void laden()
  }, [laden])

  const setzeParam = useCallback(
    (name: string, wert: string) => {
      const neu = new URLSearchParams(params)
      if (wert) neu.set(name, wert)
      else neu.delete(name)
      if (name !== 'offset') neu.delete('offset')
      setParams(neu, { replace: true })
    },
    [params, setParams],
  )

  // Suche entprellen: erst 300 ms nach dem letzten Tastendruck in die URL.
  useEffect(() => {
    if ((params.get('search') ?? '') === suchtext) return
    const t = setTimeout(() => setzeParam('search', suchtext), 300)
    return () => clearTimeout(t)
  }, [suchtext, params, setzeParam])

  /** Eine Kachel im lokalen Stand ersetzen – kein Neuladen der ganzen Seite. */
  function aktualisiereRelease(releaseId: number, aendere: (r: Release) => Release) {
    setDaten((d) =>
      d && {
        ...d,
        spiele: d.spiele.map((s) => ({
          ...s,
          releases: s.releases.map((r) => (r.id === releaseId ? aendere(r) : r)),
        })),
      },
    )
  }

  async function discAnlegen(r: Release) {
    setMeldung(null)
    try {
      const a = await anfrage<ErfasstAntwort>('/api/physical-copies', {
        methode: 'POST',
        koerper: { releaseId: r.id },
      })
      aktualisiereRelease(r.id, (x) => ({
        ...x,
        exemplare: x.exemplare + 1,
        discFassung: x.discFassung === 'unbekannt' ? 'ja' : x.discFassung,
      }))
      setEben({ art: 'exemplar', id: a.id, releaseId: r.id, absichtenErledigt: a.absichtenErledigt, aufListe: a.aufListe })
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Anlegen fehlgeschlagen.')
    }
  }

  async function digitalAnlegen(r: Release, quelle: Quelle) {
    setMeldung(null)
    setOffen(null)
    try {
      const a = await anfrage<ErfasstAntwort>('/api/digital-entitlements', {
        methode: 'POST',
        koerper: { releaseId: r.id, quelle },
      })
      aktualisiereRelease(r.id, (x) => ({ ...x, digital: [...x.digital, quelle] }))
      setEben({ art: 'digital', id: a.id, releaseId: r.id, quelle, absichtenErledigt: a.absichtenErledigt, aufListe: a.aufListe })
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Anlegen fehlgeschlagen.')
    }
  }

  /** „ins Backlog" nach dem Erfassen: koppelt über den bestehenden Weg (5.5); nie gestartet bleibt „nicht gespielt". */
  async function insBacklog() {
    if (!eben) return
    const e = eben
    setMeldung(null)
    try {
      await anfrage('/api/plans', { methode: 'POST', koerper: { art: 'backlog', releaseId: e.releaseId } })
      setEben({ ...e, aufListe: true })
      setMeldung('Ins Backlog gesetzt.')
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Anlegen fehlgeschlagen.')
    }
  }

  /**
   * Rückgängig für das eben Angelegte. Die Disc-Fassung bleibt auf 'ja' –
   * das entspricht dem Server, der beim Löschen nichts zurücksetzt. Die
   * dabei erledigten Absichten werden wieder geöffnet.
   */
  async function rueckgaengig() {
    if (!eben) return
    const e = eben
    setEben(null)
    try {
      for (const a of e.absichtenErledigt) {
        await anfrage(`/api/plans/${a.id}`, { methode: 'PATCH', koerper: { status: 'offen' } })
      }
      if (e.art === 'exemplar') {
        await anfrage(`/api/physical-copies/${e.id}`, { methode: 'DELETE' })
        aktualisiereRelease(e.releaseId, (x) => ({ ...x, exemplare: x.exemplare - 1 }))
      } else {
        await anfrage(`/api/digital-entitlements/${e.id}`, { methode: 'DELETE' })
        aktualisiereRelease(e.releaseId, (x) => ({
          ...x,
          digital: x.digital.filter((q) => q !== e.quelle),
        }))
      }
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Rückgängig fehlgeschlagen.')
    }
  }

  /**
   * Löschen aus der Kachel heraus. Die Kachel kennt nur Anzahlen, keine
   * Ids – deshalb holt sie sich das Spieldetail und löscht das jüngste
   * Exemplar. Mehrere Exemplare führen ins Detail, weil erst dort klar wird,
   * welches gemeint ist.
   */
  async function exemplarLoeschen(spiel: Spiel, r: Release) {
    if (!confirm(`Disc-Exemplar von „${spiel.titel}" (${r.plattform}) löschen?`)) return
    try {
      const detail = await anfrage<{ releases: Array<{ id: number; exemplare: Array<{ id: number }> }> }>(
        `/api/games/${spiel.id}`,
      )
      const ex = detail.releases.find((x) => x.id === r.id)?.exemplare ?? []
      const letztes = ex[ex.length - 1]
      if (!letztes) return
      await anfrage(`/api/physical-copies/${letztes.id}`, { methode: 'DELETE' })
      aktualisiereRelease(r.id, (x) => ({ ...x, exemplare: x.exemplare - 1 }))
      if (eben?.art === 'exemplar' && eben.id === letztes.id) setEben(null)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Löschen fehlgeschlagen.')
    }
  }

  async function digitalLoeschen(spiel: Spiel, r: Release, quelle: Quelle) {
    if (!confirm(`„${QUELLENTEXT[quelle]}" bei „${spiel.titel}" (${r.plattform}) entfernen?`)) return
    try {
      const detail = await anfrage<{ releases: Array<{ id: number; digital: Array<{ id: number; quelle: Quelle }> }> }>(
        `/api/games/${spiel.id}`,
      )
      const d = detail.releases.find((x) => x.id === r.id)?.digital.find((x) => x.quelle === quelle)
      if (!d) return
      await anfrage(`/api/digital-entitlements/${d.id}`, { methode: 'DELETE' })
      aktualisiereRelease(r.id, (x) => ({ ...x, digital: x.digital.filter((q) => q !== quelle) }))
      if (eben?.art === 'digital' && eben.id === d.id) setEben(null)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Löschen fehlgeschlagen.')
    }
  }

  const bis = daten ? Math.min(offset + SEITE, daten.gesamt) : 0
  const filterAktiv = [...params.keys()].some((k) => k !== 'offset' && k !== 'sort')

  return (
    <>
      <h1>Sammlung</h1>

      <Hinweise />

      <SpielAnlegen onAngelegt={laden} />

      <div className="filterleiste">
        <input
          type="search"
          value={suchtext}
          onChange={(e) => setSuchtext(e.target.value)}
          placeholder="Titel suchen"
          aria-label="Titel suchen"
        />
        {(Object.keys(FILTER) as FilterName[]).map((name) => (
          <label key={name}>
            {FILTER[name].text}{' '}
            <select value={params.get(name) ?? ''} onChange={(e) => setzeParam(name, e.target.value)}>
              <option value="">alle</option>
              {FILTER[name].werte.map(([wert, text]) => (
                <option key={wert} value={wert}>{text}</option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Sortierung{' '}
          <select value={params.get('sort') ?? 'titel'} onChange={(e) => setzeParam('sort', e.target.value)}>
            {Object.entries(SORTIERTEXT).map(([wert, text]) => (
              <option key={wert} value={wert}>{text}</option>
            ))}
          </select>
        </label>
        {filterAktiv && (
          <button type="button" onClick={() => { setSuchtext(''); setParams({}, { replace: true }) }}>
            Filter zurücksetzen
          </button>
        )}
      </div>

      {meldung && <p role="alert" className="auffaellig">{meldung}</p>}
      {eben && (
        <p role="status" className="hinweis">
          {eben.art === 'exemplar' ? 'Disc angelegt.' : `„${QUELLENTEXT[eben.quelle]}" angelegt.`}
          {eben.absichtenErledigt.length > 0 && ` ${erledigtText(eben.absichtenErledigt)}`}{' '}
          {eben.absichtenErledigt.length > 0 && !eben.aufListe && (
            <>
              <button type="button" onClick={insBacklog}>ins Backlog übernehmen</button>{' '}
            </>
          )}
          <button type="button" onClick={rueckgaengig}>Rückgängig</button>
        </p>
      )}

      {!daten ? (
        <p>wird geladen …</p>
      ) : daten.gesamt === 0 ? (
        <p>
          {filterAktiv
            ? 'Nichts gefunden.'
            : 'Noch keine Spiele. Sie entstehen aus der Zuordnung der Trophäenlisten oder über „Spiel anlegen".'}
        </p>
      ) : (
        <>
          <p>
            {offset + 1}–{bis} von {daten.gesamt} Spielen{laedt && ' – lädt …'}
          </p>

          <ul className="kacheln">
            {daten.spiele.map((s) => (
              <li key={s.id} className="kachel">
                <Link to={`/spiel/${s.id}`} className={s.cover ? 'bild cover' : 'bild'}>
                  {s.bild ? (
                    <img src={s.bild} alt="" loading="lazy" />
                  ) : (
                    <span aria-hidden="true">{s.titel.slice(0, 1)}</span>
                  )}
                </Link>
                <Link to={`/spiel/${s.id}`} className="titel">{s.titel}</Link>
                {s.releases.map((r) => (
                  <div key={r.id} className="release">
                    <div className="zeile">
                      <strong>{r.plattform}</strong>
                      {r.fortschritt === null
                        ? ' · keine Trophäenliste'
                        : ` · ${r.fortschritt} % · ${PLATINTEXT[r.platin ?? 'nicht_verfuegbar']}`}
                    </div>
                    <div className="zeile">{r.status ? STATUSTEXT[r.status] : 'kein Status'}</div>
                    <div className="zeile" title={DISCTEXT[r.discFassung]}>
                      {r.discFassung === 'unbekannt' ? 'Disc: unbekannt' : `Disc: ${r.discFassung}`}
                    </div>
                    <div className="besitz">
                      {r.exemplare > 0 && (
                        <span className="pille">
                          Disc ×{r.exemplare}
                          {r.exemplare === 1 ? (
                            <button type="button" aria-label="Disc-Exemplar löschen" onClick={() => exemplarLoeschen(s, r)}>×</button>
                          ) : (
                            <Link to={`/spiel/${s.id}`} aria-label="Exemplare im Spieldetail bearbeiten">…</Link>
                          )}
                        </span>
                      )}
                      {r.digital.map((q) => (
                        <span key={q} className="pille">
                          {QUELLENTEXT[q]}
                          <button type="button" aria-label={`${QUELLENTEXT[q]} entfernen`} onClick={() => digitalLoeschen(s, r, q)}>×</button>
                        </span>
                      ))}
                      <button type="button" className="klein" onClick={() => discAnlegen(r)}>+ Disc</button>
                      {offen === r.id ? (
                        <select
                          autoFocus
                          aria-label="Digitale Quelle"
                          defaultValue=""
                          onBlur={() => setOffen(null)}
                          onChange={(e) => e.target.value && digitalAnlegen(r, e.target.value as Quelle)}
                        >
                          <option value="">Quelle …</option>
                          {QUELLEN.filter((q) => !r.digital.includes(q)).map((q) => (
                            <option key={q} value={q}>{QUELLENTEXT[q]}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          className="klein"
                          disabled={r.digital.length === QUELLEN.length}
                          onClick={() => (r.digital.includes('kauf') ? setOffen(r.id) : digitalAnlegen(r, 'kauf'))}
                        >
                          + digital
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </li>
            ))}
          </ul>

          {daten.gesamt > SEITE && (
            <p>
              <button type="button" onClick={() => setzeParam('offset', String(Math.max(0, offset - SEITE)))} disabled={offset === 0 || laedt}>
                Zurück
              </button>{' '}
              <button type="button" onClick={() => setzeParam('offset', String(offset + SEITE))} disabled={bis >= daten.gesamt || laedt}>
                Weiter
              </button>
            </p>
          )}
        </>
      )}
    </>
  )
}
