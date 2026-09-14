import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { anfrage, type IgdbKandidat } from './api'
import { IgdbSuche, KandidatenListe } from './IgdbSuche'

/**
 * IGDB-Zuordnung (Abschnitt 7.6): Spiele, für die der Abgleich keinen
 * eindeutigen Treffer hatte, mit den gespeicherten Kandidaten.
 *
 * Eine Liste wie die Zuordnung der Trophäenlisten, kein Ein-Spiel-pro-
 * Bildschirm: Nichts erzwingt eine Reihenfolge, und was man auslässt,
 * bleibt einfach stehen. Jede Entscheidung – Kandidat übernehmen, „gibt es
 * nicht" – ist sofort gespeichert.
 */

const SEITE = 20

type Offen = {
  id: number
  titel: string
  plattformen: string[]
  bild: string | null
  gesuchtAm: string
  kandidaten: IgdbKandidat[]
}

type Antwort = { gesamt: number; limit: number; offset: number; spiele: Offen[] }

export function IgdbZuordnung() {
  const [params, setParams] = useSearchParams()
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState<number | null>(null)
  const [suche, setSuche] = useState<number | null>(null)

  const offset = Math.max(0, Number(params.get('offset')) || 0)

  const laden = useCallback(async () => {
    try {
      setDaten(await anfrage<Antwort>(`/api/igdb/offen?limit=${SEITE}&offset=${offset}`))
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
    }
  }, [offset])

  useEffect(() => {
    void laden()
  }, [laden])

  /** Zeile lokal entfernen – kein Neuladen der ganzen Seite. */
  function erledigt(id: number) {
    setDaten((d) => d && { ...d, gesamt: d.gesamt - 1, spiele: d.spiele.filter((s) => s.id !== id) })
    setSuche((s) => (s === id ? null : s))
  }

  async function tue(id: number, aktion: () => Promise<unknown>, erfolg: string) {
    setLaeuft(id)
    setMeldung(null)
    try {
      await aktion()
      setMeldung(erfolg)
      erledigt(id)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Fehlgeschlagen.')
    } finally {
      setLaeuft(null)
    }
  }

  const verknuepfen = (s: Offen, k: IgdbKandidat) =>
    tue(s.id, () => anfrage(`/api/unmatched/spiel/${s.id}/link`, { methode: 'POST', koerper: { igdbId: k.igdbId } }), `„${s.titel}" → ${k.name}`)

  const ablehnen = (s: Offen) =>
    tue(s.id, () => anfrage(`/api/unmatched/spiel/${s.id}/ablehnen`, { methode: 'POST' }), `„${s.titel}": kein IGDB-Eintrag.`)

  const bis = daten ? Math.min(daten.gesamt, offset + daten.spiele.length) : 0

  return (
    <>
      <h1>IGDB-Zuordnung</h1>
      <p className="zeile">
        Spiele ohne eindeutigen Treffer. Kandidat übernehmen, anders suchen oder als „gibt es
        bei IGDB nicht" ablegen – jede Entscheidung ist sofort gespeichert. Der Abgleich selbst
        läuft in den <Link to="/einstellungen">Einstellungen</Link>.
      </p>

      {meldung && <p role="status">{meldung}</p>}

      {!daten ? (
        <p>wird geladen …</p>
      ) : daten.gesamt === 0 ? (
        <p>Nichts offen – alle Spiele sind verknüpft, abgelehnt oder noch nicht gesucht.</p>
      ) : (
        <>
          <p>
            {offset + 1}–{bis} von {daten.gesamt} Spielen
          </p>
          <ul className="offene-liste">
            {daten.spiele.map((s) => (
              <li key={s.id} className="offen-block">
                <header className="offen-kopf">
                  {s.bild && <img src={s.bild} alt="" width={48} height={48} />}
                  <div>
                    <Link to={`/spiel/${s.id}`}><strong>{s.titel}</strong></Link>
                    <div className="zeile">{s.plattformen.join(', ') || 'ohne Release'}</div>
                  </div>
                </header>

                {s.kandidaten.length === 0 ? (
                  <p className="zeile">Die Suche nach dem Titel fand nichts.</p>
                ) : (
                  <KandidatenListe kandidaten={s.kandidaten} onWahl={(k) => verknuepfen(s, k)} laeuft={laeuft === s.id} />
                )}

                <div className="knopfzeile">
                  <button type="button" className="klein" onClick={() => setSuche(suche === s.id ? null : s.id)} disabled={laeuft === s.id}>
                    {suche === s.id ? 'Suche schließen' : 'Anders suchen'}
                  </button>
                  <button type="button" className="klein" onClick={() => ablehnen(s)} disabled={laeuft === s.id}>
                    Gibt es bei IGDB nicht
                  </button>
                </div>
                {suche === s.id && <IgdbSuche vorgabe={s.titel} onWahl={(k) => verknuepfen(s, k)} laeuft={laeuft === s.id} />}
              </li>
            ))}
          </ul>

          <p className="blaettern">
            <button type="button" disabled={offset === 0} onClick={() => setParams({ offset: String(Math.max(0, offset - SEITE)) })}>
              ← Zurück
            </button>{' '}
            <button type="button" disabled={bis >= daten.gesamt} onClick={() => setParams({ offset: String(offset + SEITE) })}>
              Weiter →
            </button>
          </p>
        </>
      )}
    </>
  )
}
