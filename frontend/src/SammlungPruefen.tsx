import { useCallback, useEffect, useState } from 'react'

/**
 * Sammlung prüfen: alle Zuordnungen als Tabelle, eine Zeile je Release.
 *
 * Zugleich Arbeitsliste und Gesamtdurchsicht. Voreingestellt ist
 * „nur Auffälligkeiten", weil das die Arbeit ist; „alle" ist die Kontrolle.
 */

const SEITE = 100

type Filter = 'auffaellig' | 'mehrfach' | 'alle'

type Zeile = {
  spielId: number
  titel: string
  releaseId: number
  plattform: string
  rohTitel: string | null
  fortschritt: number | null
  struktur: string | null
  hatPlatin: boolean
  releasesImSpiel: number
  strukturWeichtAb: boolean
  ohneListe: boolean
  titelWirktAbgekuerzt: boolean
}

type Antwort = { gesamt: number; filter: Filter; zeilen: Zeile[] }

const FILTERTEXT: Record<Filter, string> = {
  auffaellig: 'nur Auffälligkeiten',
  mehrfach: 'nur Mehrfach-Releases',
  alle: 'alle',
}

export function SammlungPruefen() {
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [filter, setFilter] = useState<Filter>('auffaellig')
  const [suche, setSuche] = useState('')
  const [offset, setOffset] = useState(0)
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  /** releaseId der Zeile, deren Abtrenn-Formular offen ist. */
  const [trenntGerade, setTrenntGerade] = useState<number | null>(null)
  const [neuerTitel, setNeuerTitel] = useState('')

  const laden = useCallback(async () => {
    const abfrage = new URLSearchParams({
      filter,
      suche,
      limit: String(SEITE),
      offset: String(offset),
    })
    const antwort = await fetch(`/api/games/uebersicht?${abfrage}`)
    if (antwort.ok) setDaten((await antwort.json()) as Antwort)
  }, [filter, suche, offset])

  useEffect(() => {
    void laden()
  }, [laden])

  async function umbenennen(spielId: number, titel: string) {
    setLaeuft(true)
    try {
      const antwort = await fetch(`/api/games/${spielId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ titel }),
      })
      setMeldung(antwort.ok ? `Umbenannt: ${titel}` : 'Umbenennen fehlgeschlagen.')
      await laden()
    } finally {
      setLaeuft(false)
    }
  }

  async function abtrennen(releaseId: number) {
    if (neuerTitel.trim() === '') return
    setLaeuft(true)
    try {
      const antwort = await fetch(`/api/games/release/${releaseId}/abtrennen`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ titel: neuerTitel }),
      })
      setMeldung(antwort.ok ? `Abgetrennt: ${neuerTitel}` : 'Abtrennen fehlgeschlagen.')
      setTrenntGerade(null)
      setNeuerTitel('')
      await laden()
    } finally {
      setLaeuft(false)
    }
  }

  function wechsle(neu: Partial<{ filter: Filter; suche: string }>) {
    if (neu.filter !== undefined) setFilter(neu.filter)
    if (neu.suche !== undefined) setSuche(neu.suche)
    setOffset(0)
  }

  if (!daten) return <section><h2>Sammlung prüfen</h2><p>wird geladen …</p></section>

  const bis = Math.min(offset + SEITE, daten.gesamt)

  return (
    <section>
      <h2>Sammlung prüfen</h2>

      <p className="steuerung">
        <label>
          Ansicht{' '}
          <select value={filter} onChange={(e) => wechsle({ filter: e.target.value as Filter })}>
            {Object.entries(FILTERTEXT).map(([wert, text]) => (
              <option key={wert} value={wert}>{text}</option>
            ))}
          </select>
        </label>{' '}
        <input
          type="search"
          value={suche}
          onChange={(e) => wechsle({ suche: e.target.value })}
          placeholder="Titel suchen"
          aria-label="Titel suchen"
        />
      </p>

      <p>
        {daten.gesamt === 0
          ? filter === 'auffaellig'
            ? 'Keine Auffälligkeiten.'
            : 'Nichts gefunden.'
          : `${offset + 1}–${bis} von ${daten.gesamt} Releases`}
      </p>
      {meldung && <p role="status">{meldung}</p>}

      {daten.gesamt > 0 && (
        <div className="tabelle">
          <table>
            <thead>
              <tr>
                <th>Spiel</th>
                <th>Plattform</th>
                <th>Trophäen</th>
                <th>Fortschritt</th>
                <th>Rohtitel von Sony</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {daten.zeilen.map((z) => (
                <tr key={z.releaseId}>
                  <td>
                    <input
                      type="text"
                      defaultValue={z.titel}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== z.titel) {
                          void umbenennen(z.spielId, e.target.value.trim())
                        }
                      }}
                      aria-label={`Titel von ${z.titel}`}
                      className={z.titelWirktAbgekuerzt ? 'auffaellig' : undefined}
                    />
                    {z.releasesImSpiel > 1 && (
                      <span className="zeile"> {z.releasesImSpiel} Releases</span>
                    )}
                  </td>
                  <td>{z.plattform}</td>
                  <td className={z.strukturWeichtAb ? 'auffaellig' : undefined}>
                    {z.struktur ?? '—'}
                  </td>
                  <td>
                    {z.ohneListe ? (
                      <span className="auffaellig">keine Liste</span>
                    ) : (
                      <>
                        {z.fortschritt} %{z.hatPlatin && ' · Platin'}
                      </>
                    )}
                  </td>
                  <td className="zeile">{z.rohTitel ?? '—'}</td>
                  <td>
                    {trenntGerade === z.releaseId ? (
                      <>
                        <input
                          type="text"
                          value={neuerTitel}
                          onChange={(e) => setNeuerTitel(e.target.value)}
                          placeholder="Neuer Spieltitel"
                          aria-label="Neuer Spieltitel"
                        />
                        <button
                          type="button"
                          onClick={() => abtrennen(z.releaseId)}
                          disabled={laeuft || neuerTitel.trim() === ''}
                        >
                          Anlegen
                        </button>{' '}
                        <button type="button" onClick={() => setTrenntGerade(null)}>
                          Abbrechen
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setTrenntGerade(z.releaseId)
                          setNeuerTitel(z.titel)
                        }}
                        disabled={laeuft}
                      >
                        Abtrennen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {daten.gesamt > SEITE && (
        <p>
          <button
            type="button"
            onClick={() => setOffset(Math.max(0, offset - SEITE))}
            disabled={offset === 0 || laeuft}
          >
            Zurück
          </button>{' '}
          <button
            type="button"
            onClick={() => setOffset(offset + SEITE)}
            disabled={bis >= daten.gesamt || laeuft}
          >
            Weiter
          </button>
        </p>
      )}
    </section>
  )
}
