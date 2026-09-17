import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiFehler, PLATTFORMEN, anfrage, type Plattform } from './api'

/**
 * Spiel von Hand anlegen – für Discs, die nie gestartet wurden und deshalb
 * keine Trophäenliste haben. Bei gleichem Titelschlüssel warnt der Server
 * und nennt Kandidaten; dann ist meist ein weiteres Release gemeint.
 *
 * Seit Stufe 17 auch Stufe 4 der Auflösungskette im Scanner (Abschnitt 9.2,
 * Entscheidung des Nutzers vom 16.09.2026): dieselbe Form, der Suchtext
 * als Titelvorgabe, und `onAngelegt` bekommt das Release, damit der Scanner
 * den Code gleich zuordnen kann. Hat ein Kandidat die Plattform schon, bietet
 * der Scanner „vorhandenes Release verwenden" an, statt zurück in die Suche
 * zu schicken.
 */

type Kandidat = { spielId: number; titel: string; plattformen: string[] }

export function SpielAnlegen({
  onAngelegt,
  titelVorgabe = '',
  plattformVorgabe = 'PS4',
  vorhandenesVerwenden = false,
}: {
  onAngelegt: (releaseId: number) => Promise<void> | void
  titelVorgabe?: string
  plattformVorgabe?: Plattform
  /** Bei einem Kandidaten mit der gewählten Plattform dessen Release anbieten (Scanner). */
  vorhandenesVerwenden?: boolean
}) {
  const [offen, setOffen] = useState(false)
  const [titel, setTitel] = useState(titelVorgabe)
  const [plattform, setPlattform] = useState<Plattform>(plattformVorgabe)
  const [kandidaten, setKandidaten] = useState<Kandidat[]>([])
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  function oeffnen() {
    setTitel(titelVorgabe)
    setPlattform(plattformVorgabe)
    setOffen(true)
  }

  function zuruecksetzen() {
    setTitel('')
    setKandidaten([])
    setMeldung(null)
    setOffen(false)
  }

  async function fertig(releaseId: number, text: string) {
    setMeldung(text)
    setTitel('')
    setKandidaten([])
    await onAngelegt(releaseId)
  }

  async function anlegen(trotzdem: boolean) {
    setLaeuft(true)
    setMeldung(null)
    try {
      const a = await anfrage<{ releaseId: number }>('/api/games', {
        methode: 'POST',
        koerper: { titel: titel.trim(), plattform, trotzdem },
      })
      await fertig(a.releaseId, `„${titel.trim()}" (${plattform}) angelegt.`)
    } catch (f) {
      if (f instanceof ApiFehler && f.status === 409 && Array.isArray(f.antwort.kandidaten)) {
        setKandidaten(f.antwort.kandidaten as Kandidat[])
      } else {
        setMeldung(f instanceof Error ? f.message : 'Anlegen fehlgeschlagen.')
      }
    } finally {
      setLaeuft(false)
    }
  }

  async function releaseAnhaengen(k: Kandidat) {
    setLaeuft(true)
    try {
      const a = await anfrage<{ releaseId: number }>('/api/releases', {
        methode: 'POST',
        koerper: { spielId: k.spielId, plattform },
      })
      await fertig(a.releaseId, `${plattform}-Release an „${k.titel}" angehängt.`)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Anhängen fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  /** Das vorhandene Release des Kandidaten auf der gewählten Plattform (Scanner). */
  async function vorhandenes(k: Kandidat) {
    setLaeuft(true)
    try {
      const detail = await anfrage<{ releases: Array<{ id: number; plattform: string }> }>(`/api/games/${k.spielId}`)
      const r = detail.releases.find((x) => x.plattform === plattform)
      if (!r) throw new Error('Release nicht gefunden.')
      await fertig(r.id, `„${k.titel}" (${plattform}) gewählt.`)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Auswahl fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  if (!offen) {
    return (
      <p>
        <button type="button" onClick={oeffnen}>Spiel anlegen</button>
        {meldung && <span role="status"> {meldung}</span>}
      </p>
    )
  }

  return (
    <form
      className="anlegen"
      onSubmit={(e) => {
        e.preventDefault()
        void anlegen(false)
      }}
    >
      <p className="steuerung">
        <input
          type="text"
          value={titel}
          onChange={(e) => { setTitel(e.target.value); setKandidaten([]) }}
          placeholder="Titel"
          aria-label="Titel"
          autoFocus
        />{' '}
        <select value={plattform} onChange={(e) => setPlattform(e.target.value as Plattform)} aria-label="Plattform">
          {PLATTFORMEN.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>{' '}
        <button type="submit" disabled={laeuft || titel.trim() === ''}>Anlegen</button>{' '}
        <button type="button" onClick={zuruecksetzen}>Abbrechen</button>
      </p>
      {kandidaten.length > 0 && (
        <div className="hinweis">
          <p>Ein Spiel mit diesem Titel gibt es schon:</p>
          <ul>
            {kandidaten.map((k) => (
              <li key={k.spielId}>
                <Link to={`/spiel/${k.spielId}`}>{k.titel}</Link> ({k.plattformen.join(', ') || 'ohne Release'}){' '}
                {vorhandenesVerwenden && k.plattformen.includes(plattform) ? (
                  <button type="button" disabled={laeuft} onClick={() => vorhandenes(k)}>
                    vorhandenes {plattform}-Release verwenden
                  </button>
                ) : (
                  <button type="button" disabled={laeuft || k.plattformen.includes(plattform)} onClick={() => releaseAnhaengen(k)}>
                    {plattform}-Release anhängen
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button type="button" disabled={laeuft} onClick={() => anlegen(true)}>Trotzdem als neues Spiel anlegen</button>
        </div>
      )}
      {meldung && <p role="status">{meldung}</p>}
    </form>
  )
}
