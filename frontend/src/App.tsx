import { useEffect, useState } from 'react'
import './App.css'

type Health = { status: string; zeit: string }

type Zustand =
  | { art: 'laedt' }
  | { art: 'ok'; health: Health }
  | { art: 'fehler'; meldung: string }

function App() {
  const [zustand, setZustand] = useState<Zustand>({ art: 'laedt' })

  useEffect(() => {
    fetch('/api/health')
      .then(async (antwort) => {
        if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
        return (await antwort.json()) as Health
      })
      .then((health) => setZustand({ art: 'ok', health }))
      .catch((fehler: unknown) =>
        setZustand({
          art: 'fehler',
          meldung: fehler instanceof Error ? fehler.message : 'Unbekannter Fehler',
        }),
      )
  }, [])

  return (
    <main>
      <h1>Trophytracker</h1>
      <p>Stufe 0: Deployment-Pipeline und Zugriffsschutz stehen.</p>

      <section>
        <h2>Verbindung zur API</h2>
        {zustand.art === 'laedt' && <p>wird geprüft …</p>}
        {zustand.art === 'ok' && (
          <p>
            <strong>{zustand.health.status}</strong> – Antwort des Workers um{' '}
            {new Date(zustand.health.zeit).toLocaleString('de-DE')}
          </p>
        )}
        {zustand.art === 'fehler' && <p>Keine Antwort: {zustand.meldung}</p>}
      </section>
    </main>
  )
}

export default App
