import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PLAN_ARTTEXT, anfrage, datum, type ErscheintBaldEintrag } from './api'

/**
 * Erscheint bald (Use Case 11, Stufe 15): vorgemerkte Titel aus Wunsch- und
 * Kaufliste, die noch nicht erschienen sind (v_erscheint_bald, 8.4). Das
 * Datum steht dort, wo sonst der Preis stünde; ohne Datum „unbekannt". Nur
 * lesen – geändert wird auf den Listen selbst. Ein verstrichenes Datum
 * nimmt den Titel hier heraus und macht ihn zum Kaufkandidaten; den
 * gespeicherten Status hebt „Metadaten auffrischen" nach, täglich erst der
 * Cron ab Stufe 18.
 */
export function ErscheintBald() {
  const [daten, setDaten] = useState<{ anzahl: number; eintraege: ErscheintBaldEintrag[] } | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)

  useEffect(() => {
    anfrage<{ anzahl: number; eintraege: ErscheintBaldEintrag[] }>('/api/upcoming')
      .then(setDaten)
      .catch((f) => setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.'))
  }, [])

  return (
    <>
      <h1>Erscheint bald</h1>
      <p className="zeile">
        Vorgemerkt auf <Link to="/wunschliste">Wunschliste</Link> oder <Link to="/kaufliste">Kaufliste</Link>, noch nicht erschienen. Nach dem Erscheinen wird der Titel Kaufkandidat.
      </p>
      {meldung && <p role="alert" className="auffaellig">{meldung}</p>}
      {!daten ? (
        <p>wird geladen …</p>
      ) : daten.anzahl === 0 ? (
        <p>Nichts vorgemerkt, was erst noch erscheint.</p>
      ) : (
        <ul className="kandidatenliste">
          {daten.eintraege.map((e) => (
            <li key={e.planId}>
              <Link to={`/spiel/${e.spielId}`} className={e.bild ? 'bild cover' : 'bild'}>
                {e.bild ? <img src={e.bild} alt="" loading="lazy" /> : <span aria-hidden="true">{e.titel.slice(0, 1)}</span>}
              </Link>
              <div>
                <Link to={`/spiel/${e.spielId}`} className="titel">{e.favorit ? '★ ' : ''}{e.titel}</Link>
                <div className="zeile">
                  erscheint {e.erscheinungsdatum ? datum(e.erscheinungsdatum) : 'unbekannt'} · {e.plattform ?? 'ohne Plattform'} · {PLAN_ARTTEXT[e.art]}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
