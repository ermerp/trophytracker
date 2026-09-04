import { useEffect, useState } from 'react'
import './App.css'

/**
 * Platzhalterseite. Sie zeigt, dass die Kette Access → Worker → Repository →
 * D1 trägt, und wird in Stufe 3 durch die erste echte Ansicht ersetzt.
 */

type Health = { status: string; zeit: string }
type Weights = Record<string, number>

type Zustand<T> =
  | { art: 'laedt' }
  | { art: 'ok'; daten: T }
  | { art: 'fehler'; meldung: string }

function useApi<T>(pfad: string): Zustand<T> {
  const [zustand, setZustand] = useState<Zustand<T>>({ art: 'laedt' })

  useEffect(() => {
    let abgebrochen = false
    fetch(pfad)
      .then(async (antwort) => {
        if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
        return (await antwort.json()) as T
      })
      .then((daten) => !abgebrochen && setZustand({ art: 'ok', daten }))
      .catch(
        (fehler: unknown) =>
          !abgebrochen &&
          setZustand({
            art: 'fehler',
            meldung: fehler instanceof Error ? fehler.message : 'Unbekannter Fehler',
          }),
      )
    return () => {
      abgebrochen = true
    }
  }, [pfad])

  return zustand
}

function App() {
  const health = useApi<Health>('/api/health')
  const gewichte = useApi<Weights>('/api/settings/weights')

  return (
    <main>
      <h1>Trophytracker</h1>
      <p>
        Stufe 1: Das Datenmodell steht – 16 Tabellen und 7 Views. Inhalte kommen
        ab Stufe 2 mit der PSN-Anbindung.
      </p>

      <section>
        <h2>Worker</h2>
        {health.art === 'laedt' && <p>wird geprüft …</p>}
        {health.art === 'ok' && (
          <p>
            <strong>{health.daten.status}</strong> – Antwort um{' '}
            {new Date(health.daten.zeit).toLocaleString('de-DE')}
          </p>
        )}
        {health.art === 'fehler' && <p>Keine Antwort: {health.meldung}</p>}
      </section>

      <section>
        <h2>Datenbank</h2>
        <p>
          Gewichte der Rangformel, gelesen aus <code>app_setting</code> über die
          Repository-Schicht:
        </p>
        {gewichte.art === 'laedt' && <p>wird geladen …</p>}
        {gewichte.art === 'ok' && (
          <table>
            <tbody>
              {Object.entries(gewichte.daten).map(([schluessel, wert]) => (
                <tr key={schluessel}>
                  <td>
                    <code>{schluessel}</code>
                  </td>
                  <td>{wert}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {gewichte.art === 'fehler' && <p>Keine Antwort: {gewichte.meldung}</p>}
      </section>
    </main>
  )
}

export default App
