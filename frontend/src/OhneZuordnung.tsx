import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PLAN_ARTTEXT, anfrage, type IgdbKandidat, type PlanArt } from './api'
import { IgdbSuche } from './IgdbSuche'

/**
 * Ohne Zuordnung (Use Case 12, Abschnitt 8.3): alles ohne IGDB-Eintrag,
 * listenübergreifend – Spiele der Sammlung und Freitext-Einträge aus
 * Wunschliste, To-Do, Backlog und Kaufliste – mit demselben Suchfeld zum
 * Nachziehen. Abgelehnte Spiele („gibt es bei IGDB nicht") stehen hinter
 * einem Umschalter: Die Ablehnung ist eine gespeicherte Entscheidung
 * (Entscheidung des Nutzers vom 15.09.2026).
 */

type Zustand = 'nicht_gesucht' | 'zur_pruefung' | 'abgelehnt' | 'freitext'

type Eintrag = {
  quelle: 'spiel' | 'plan_wunsch' | 'plan_todo' | 'plan_backlog' | 'plan_kauf'
  id: number
  titel: string
  zustand: Zustand
  art: PlanArt | null
}

const ZUSTANDTEXT: Record<Zustand, string> = {
  freitext: 'Freitext ohne Spiel',
  zur_pruefung: 'Spiele in der IGDB-Zuordnung',
  nicht_gesucht: 'Spiele, die noch nicht gesucht wurden',
  abgelehnt: 'Abgelehnt – gibt es bei IGDB nicht',
}

const REIHENFOLGE: Zustand[] = ['freitext', 'zur_pruefung', 'nicht_gesucht', 'abgelehnt']

export function OhneZuordnung() {
  const [eintraege, setEintraege] = useState<Eintrag[] | null>(null)
  const [abgelehnte, setAbgelehnte] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [suche, setSuche] = useState<string | null>(null)

  const laden = useCallback(async () => {
    try {
      setEintraege((await anfrage<{ eintraege: Eintrag[] }>(`/api/unmatched${abgelehnte ? '?abgelehnte=1' : ''}`)).eintraege)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
    }
  }, [abgelehnte])

  useEffect(() => {
    void laden()
  }, [laden])

  const schluessel = (e: Eintrag) => `${e.quelle}/${e.id}`

  async function tue(e: Eintrag, aktion: () => Promise<unknown>, erfolg: string) {
    setLaeuft(schluessel(e))
    setMeldung(null)
    try {
      await aktion()
      setMeldung(erfolg)
      setSuche(null)
      await laden()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Fehlgeschlagen.')
    } finally {
      setLaeuft(null)
    }
  }

  // Freitext-Eintraege bekommen die Plattform am Treffer gewaehlt; Spiele der
  // Sammlung werden nur verknuepft, ihre Releases stehen schon fest.
  const verknuepfen = (e: Eintrag, k: IgdbKandidat, plattform: string) =>
    tue(
      e,
      () =>
        anfrage(`/api/unmatched/${e.quelle}/${e.id}/link`, {
          methode: 'POST',
          koerper: e.quelle === 'spiel' ? { igdbId: k.igdbId } : { igdbId: k.igdbId, plattform },
        }),
      `„${e.titel}" → ${k.name}`,
    )
  const ablehnen = (e: Eintrag) => tue(e, () => anfrage(`/api/unmatched/spiel/${e.id}/ablehnen`, { methode: 'POST' }), `„${e.titel}": kein IGDB-Eintrag.`)
  const dochSuchen = (e: Eintrag) => tue(e, () => anfrage(`/api/unmatched/spiel/${e.id}/suchen`, { methode: 'POST' }), `„${e.titel}" wird beim nächsten Abgleich gesucht.`)

  const gruppen = REIHENFOLGE.map((z) => ({ zustand: z, eintraege: (eintraege ?? []).filter((e) => e.zustand === z) })).filter((g) => g.eintraege.length > 0)

  return (
    <>
      <h1>Ohne Zuordnung</h1>
      <p className="zeile">
        Einträge ohne IGDB-Eintrag haben kein Cover, keine Kritikerwertung und keinen Rang. Hier lassen sie sich listenübergreifend
        nachziehen. Spiele in der <Link to="/igdb">IGDB-Zuordnung</Link> haben dort ihre Kandidaten; der Abgleich für noch nicht gesuchte
        Spiele läuft in den <Link to="/einstellungen">Einstellungen</Link>.
      </p>
      <label className="zeile">
        <input type="checkbox" checked={abgelehnte} onChange={(e) => setAbgelehnte(e.target.checked)} /> auch abgelehnte zeigen
      </label>

      {meldung && <p role="status">{meldung}</p>}

      {!eintraege ? (
        <p>wird geladen …</p>
      ) : eintraege.length === 0 ? (
        <p>Alles zugeordnet.</p>
      ) : (
        gruppen.map((g) => (
          <section key={g.zustand}>
            <h2>
              {ZUSTANDTEXT[g.zustand]} ({g.eintraege.length})
            </h2>
            <ul className="offene-liste">
              {g.eintraege.map((e) => {
                const k = schluessel(e)
                return (
                  <li key={k} className="offen-block">
                    <header className="offen-kopf">
                      <div>
                        {e.quelle === 'spiel' ? <Link to={`/spiel/${e.id}`}><strong>{e.titel}</strong></Link> : <strong>{e.titel}</strong>}
                        <div className="zeile">
                          {e.art ? PLAN_ARTTEXT[e.art] : 'Sammlung'}
                          {e.zustand === 'zur_pruefung' && (
                            <>
                              {' '}· <Link to="/igdb">Kandidaten ansehen</Link>
                            </>
                          )}
                        </div>
                      </div>
                    </header>
                    <div className="knopfzeile">
                      {e.zustand !== 'abgelehnt' && (
                        <button type="button" className="klein" onClick={() => setSuche(suche === k ? null : k)} disabled={laeuft === k}>
                          {suche === k ? 'Suche schließen' : 'Bei IGDB suchen'}
                        </button>
                      )}
                      {e.quelle === 'spiel' && e.zustand !== 'abgelehnt' && (
                        <button type="button" className="klein" onClick={() => ablehnen(e)} disabled={laeuft === k}>Gibt es bei IGDB nicht</button>
                      )}
                      {e.zustand === 'abgelehnt' && (
                        <button type="button" className="klein" onClick={() => dochSuchen(e)} disabled={laeuft === k}>Doch suchen</button>
                      )}
                    </div>
                    {suche === k && <IgdbSuche vorgabe={e.titel} onWahl={(kand, p) => verknuepfen(e, kand, p)} laeuft={laeuft === k} mitPlattform={e.quelle !== 'spiel'} />}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
