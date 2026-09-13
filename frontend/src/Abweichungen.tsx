import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { STATUSTEXT, anfrage, type PlayStatus } from './api'

/**
 * Abweichungen (Abschnitt 11, v_abweichungen): Trophäen und eigene Bewertung
 * passen nicht zusammen. Kein Fehler, nur zur Durchsicht – „durchgespielt"
 * bei 20 % ist ein gültiger Zustand (Story beendet, Sammelaufgaben liegen
 * gelassen).
 */

type Abweichung = {
  spielId: number
  releaseId: number
  titel: string
  plattform: string
  fortschritt: number | null
  status: PlayStatus
}

type Antwort = { gesamt: number; abweichungen: Abweichung[] }

export function Abweichungen() {
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    anfrage<Antwort>('/api/deviations')
      .then(setDaten)
      .catch((f: unknown) => setFehler(f instanceof Error ? f.message : 'Laden fehlgeschlagen.'))
  }, [])

  return (
    <section>
      <h2>Abweichungen</h2>
      <p className="zeile">
        Trophäenstand und eigene Bewertung passen nicht zusammen – kein Fehler, nur zur
        Durchsicht. Gezeigt werden „durchgespielt" oder „komplettiert" unter 20 % und
        „nicht gespielt" mit Fortschritt.
      </p>
      {fehler && <p role="alert">{fehler}</p>}
      {daten && daten.gesamt === 0 && <p>Keine Abweichungen.</p>}
      {daten && daten.gesamt > 0 && (
        <div className="tabelle">
          <table>
            <thead>
              <tr>
                <th>Spiel</th>
                <th>Plattform</th>
                <th>Trophäen</th>
                <th>Bewertung</th>
              </tr>
            </thead>
            <tbody>
              {daten.abweichungen.map((a) => (
                <tr key={a.releaseId}>
                  <td><Link to={`/spiel/${a.spielId}`}>{a.titel}</Link></td>
                  <td>{a.plattform}</td>
                  <td>{a.fortschritt === null ? 'keine Liste' : `${a.fortschritt} %`}</td>
                  <td>{STATUSTEXT[a.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
