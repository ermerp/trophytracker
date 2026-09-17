import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { anfrage, datum } from './api'

/**
 * Offene Scans (Abschnitt 9, unresolved_scan): Codes, die beim Scannen mit
 * „Später" liegen blieben oder nie zugeordnet wurden. „zuordnen" öffnet den
 * Scanner mit dem Code, ohne Kamera; „verwerfen" für Codes, die kein Spiel
 * sind. Nur sichtbar, wenn es welche gibt.
 */

type Scan = { ean: string; scans: number; zuerstAm: string; zuletztAm: string }

export function OffeneScans() {
  const [scans, setScans] = useState<Scan[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    anfrage<{ scans: Scan[] }>('/api/scan/unresolved')
      .then((a) => setScans(a.scans))
      .catch((f: unknown) => setFehler(f instanceof Error ? f.message : 'Laden fehlgeschlagen.'))
  }, [])

  async function verwerfen(ean: string) {
    setFehler(null)
    try {
      await anfrage(`/api/scan/unresolved/${ean}`, { methode: 'DELETE' })
      setScans((s) => s && s.filter((x) => x.ean !== ean))
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Verwerfen fehlgeschlagen.')
    }
  }

  if (!fehler && (!scans || scans.length === 0)) return null

  return (
    <section>
      <h2>Offene Scans{scans && ` (${scans.length})`}</h2>
      <p className="zeile">Gescannte Codes ohne Zuordnung – beim Scannen mit „Später" liegen gelassen.</p>
      {fehler && <p role="alert">{fehler}</p>}
      {scans && scans.length > 0 && (
        <div className="tabelle">
          <table>
            <thead>
              <tr>
                <th>EAN</th>
                <th>gescannt</th>
                <th>zuletzt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => (
                <tr key={s.ean}>
                  <td>{s.ean}</td>
                  <td>{s.scans}×</td>
                  <td>{datum(s.zuletztAm)}</td>
                  <td>
                    <Link to={`/scannen?ean=${s.ean}`}>zuordnen</Link>{' '}
                    <button type="button" className="klein" onClick={() => verwerfen(s.ean)}>verwerfen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
