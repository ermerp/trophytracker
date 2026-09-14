import { useEffect, useState } from 'react'
import { anfrage, type Gewichte as GewichteWerte } from './api'

/**
 * Gewichte der Rangformel (5.2). Der Rang selbst wird nie gespeichert;
 * eine Änderung hier sortiert Wunschliste und später Kaufliste sofort um.
 * w_price bleibt ohne Wirkung, bis Preise existieren (Stufe 18).
 */

const FELDER: Array<[keyof GewichteWerte, string]> = [
  ['w_critic', 'Kritikerwertung'],
  ['w_priority', 'Priorität'],
  ['w_favorite', 'Favorit'],
  ['w_price', 'Preis (ab Stufe 18)'],
]

export function Gewichte() {
  const [werte, setWerte] = useState<GewichteWerte | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)

  useEffect(() => {
    anfrage<GewichteWerte>('/api/settings/weights').then(setWerte).catch(() => {})
  }, [])

  async function speichern(ereignis: React.FormEvent) {
    ereignis.preventDefault()
    if (!werte) return
    setMeldung(null)
    try {
      setWerte(await anfrage<GewichteWerte>('/api/settings/weights', { methode: 'PUT', koerper: werte }))
      setMeldung('Gespeichert.')
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Speichern fehlgeschlagen.')
    }
  }

  return (
    <section>
      <h2>Rangformel</h2>
      <p className="zeile">
        Rang = Kritik/100 · Gewicht + Priorität/5 · Gewicht + Favorit · Gewicht. Ohne Kritikerwertung zählt 70. Werte zwischen 0 und 1.
      </p>
      {werte && (
        <form onSubmit={speichern} className="gewichte">
          {FELDER.map(([key, text]) => (
            <label key={key}>
              {text}{' '}
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={werte[key]}
                onChange={(e) => setWerte({ ...werte, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
          <button type="submit">Speichern</button>
          {meldung && <span role="status">{meldung}</span>}
        </form>
      )}
    </section>
  )
}
