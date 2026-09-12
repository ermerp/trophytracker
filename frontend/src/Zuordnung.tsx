import { useCallback, useEffect, useState } from 'react'

/**
 * Zuordnung: aus Trophäenlisten werden Spiele und Releases.
 *
 * Nichts wird ohne Bestätigung geschrieben (Abschnitt 7.2). Die Vorschläge
 * gruppieren nach normalisiertem Titel – GTA V erscheint als *ein* Spiel mit
 * drei Releases, nicht als drei Spiele.
 */

const SEITE = 20

type ReleaseVorschlag = {
  npCommunicationId: string
  rohTitel: string
  plattformRoh: string
  vorschlag: string | null
  alternativen: string[]
  geteilt: boolean
  fortschritt: number
  hatPlatin: boolean
  symbol: string | null
}

type Gruppe = {
  schluessel: string
  titel: string
  releases: ReleaseVorschlag[]
  hinweis?: string
}

type Antwort = { gesamt: number; listenOffen: number; gruppen: Gruppe[] }

/** Lokale Änderungen an einer Gruppe, bis sie bestätigt wird. */
type Entwurf = { titel: string; plattformen: Record<string, string> }

/**
 * Übersprungene Gruppen überdauern das Neuladen.
 *
 * Ohne das würde eine bewusst übersprungene Gruppe nach dem nächsten
 * „Alle übernehmen" unmarkiert wieder auftauchen und beim übernächsten Klick
 * doch übernommen – die Entscheidung wäre still überfahren. Bei 415 Gruppen
 * über mehrere Sitzungen ist das kein Randfall.
 */
const SPEICHER = 'trophytracker.zuordnung.uebersprungen'

function ladeUebersprungen(): Set<string> {
  try {
    const roh = localStorage.getItem(SPEICHER)
    return new Set(roh ? (JSON.parse(roh) as string[]) : [])
  } catch {
    return new Set()
  }
}

function merkeUebersprungen(werte: Set<string>) {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify([...werte]))
  } catch {
    // Privater Modus oder gesperrter Speicher: dann eben nur für diese Sitzung.
  }
}

export function Zuordnung() {
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [entwuerfe, setEntwuerfe] = useState<Record<string, Entwurf>>({})
  const [uebersprungen, setUebersprungenRoh] = useState<Set<string>>(ladeUebersprungen)
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)

  const setUebersprungen = useCallback((werte: Set<string>) => {
    setUebersprungenRoh(werte)
    merkeUebersprungen(werte)
  }, [])

  const laden = useCallback(async () => {
    const antwort = await fetch(`/api/zuordnung/offen?limit=${SEITE}`)
    if (!antwort.ok) return
    const a = (await antwort.json()) as Antwort
    setDaten(a)
    setEntwuerfe(
      Object.fromEntries(
        a.gruppen.map((g) => [
          g.schluessel,
          {
            titel: g.titel,
            plattformen: Object.fromEntries(
              g.releases.map((r) => [r.npCommunicationId, r.vorschlag ?? '']),
            ),
          },
        ]),
      ),
    )
  }, [])

  useEffect(() => {
    void laden()
  }, [laden])

  async function uebernehmen(gruppe: Gruppe): Promise<boolean> {
    const entwurf = entwuerfe[gruppe.schluessel]
    const releases = gruppe.releases
      .map((r) => ({
        npCommunicationId: r.npCommunicationId,
        plattform: entwurf.plattformen[r.npCommunicationId],
      }))
      .filter((r) => r.plattform !== '')

    if (releases.length === 0) return false

    const antwort = await fetch('/api/zuordnung/gruppe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titel: entwurf.titel, releases }),
    })
    if (!antwort.ok) {
      const fehler = (await antwort.json()) as { fehler?: string }
      setMeldung(`${entwurf.titel}: ${fehler.fehler ?? 'Übernahme fehlgeschlagen.'}`)
      return false
    }
    return true
  }

  async function einzeln(gruppe: Gruppe) {
    setLaeuft(true)
    setMeldung(null)
    try {
      if (await uebernehmen(gruppe)) await laden()
    } finally {
      setLaeuft(false)
    }
  }

  async function alleUebernehmen() {
    if (!daten) return
    setLaeuft(true)
    setMeldung(null)
    let n = 0
    try {
      for (const g of daten.gruppen) {
        if (uebersprungen.has(g.schluessel)) continue
        if (await uebernehmen(g)) n++
      }
      setMeldung(
        n === 0
          ? 'Nichts übernommen – alle Gruppen auf dieser Seite sind übersprungen.'
          : `${n} Gruppen übernommen.`,
      )
      // Markierungen bleiben bewusst stehen: Sie sind eine Entscheidung,
      // keine Ansicht.
      await laden()
    } finally {
      setLaeuft(false)
    }
  }

  function setzeTitel(schluessel: string, titel: string) {
    setEntwuerfe((v) => ({ ...v, [schluessel]: { ...v[schluessel], titel } }))
  }

  function setzePlattform(schluessel: string, np: string, plattform: string) {
    setEntwuerfe((v) => ({
      ...v,
      [schluessel]: {
        ...v[schluessel],
        plattformen: { ...v[schluessel].plattformen, [np]: plattform },
      },
    }))
  }

  if (!daten) return <section><h2>Zuordnung</h2><p>wird geladen …</p></section>

  if (daten.gesamt === 0) {
    return (
      <section>
        <h2>Zuordnung</h2>
        <p>Alle Trophäenlisten sind zugeordnet.</p>
      </section>
    )
  }

  return (
    <section>
      <h2>Zuordnung</h2>
      <p>
        Noch <strong>{daten.gesamt}</strong> Gruppen aus {daten.listenOffen} Trophäenlisten.
        Eine Gruppe wird ein Spiel mit je einem Release pro Liste.
      </p>
      <p>
        <button type="button" onClick={alleUebernehmen} disabled={laeuft}>
          Alle auf dieser Seite übernehmen
        </button>{' '}
        {uebersprungen.size > 0 && (
          <>
            <button type="button" onClick={() => setUebersprungen(new Set())} disabled={laeuft}>
              {uebersprungen.size} Markierungen zurücksetzen
            </button>
          </>
        )}
      </p>
      <p className="zeile">
        Übersprungene Gruppen bleiben unzugeordnet und werden von „Alle übernehmen"
        ausgelassen – auch nach dem Neuladen.
      </p>
      {meldung && <p role="status">{meldung}</p>}

      <ul className="gruppen">
        {daten.gruppen.map((g) => {
          const entwurf = entwuerfe[g.schluessel]
          if (!entwurf) return null
          const weg = uebersprungen.has(g.schluessel)

          return (
            <li key={g.schluessel} className={weg ? 'uebersprungen' : undefined}>
              <input
                type="text"
                value={entwurf.titel}
                onChange={(e) => setzeTitel(g.schluessel, e.target.value)}
                aria-label="Spieltitel"
              />
              {g.hinweis && <p className="hinweis">{g.hinweis}</p>}

              <table>
                <tbody>
                  {g.releases.map((r) => (
                    <tr key={r.npCommunicationId}>
                      <td>{r.rohTitel}</td>
                      <td>{r.fortschritt} %{r.hatPlatin && ' · Platin'}</td>
                      <td>
                        {r.alternativen.length > 1 ? (
                          <select
                            value={entwurf.plattformen[r.npCommunicationId]}
                            onChange={(e) =>
                              setzePlattform(g.schluessel, r.npCommunicationId, e.target.value)
                            }
                            aria-label={`Plattform für ${r.rohTitel}`}
                          >
                            {r.alternativen.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                        ) : (
                          (r.vorschlag ?? '—')
                        )}
                        {r.geteilt && (
                          <span className="zeile"> geteilte Liste: {r.plattformRoh}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button type="button" onClick={() => einzeln(g)} disabled={laeuft || weg}>
                Übernehmen
              </button>{' '}
              <button
                type="button"
                onClick={() => {
                  const neu = new Set(uebersprungen)
                  if (weg) neu.delete(g.schluessel)
                  else neu.add(g.schluessel)
                  setUebersprungen(neu)
                }}
                disabled={laeuft}
              >
                {weg ? 'Doch übernehmen' : 'Überspringen'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
