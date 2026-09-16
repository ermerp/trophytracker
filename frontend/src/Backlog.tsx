import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { anfrage, type BacklogKandidat } from './api'
import { Filterleiste, Meldungen, PlanKarte, Reiter, usePlanListe } from './Absichten'

/**
 * Backlog (Use Case 5b, Stufe 12): der große Haufen, sortiert wie die
 * Wunschliste (5.2). „auf To-Do" zieht einen Eintrag hoch – ans Ende der
 * To-Do-Liste, mit Status „am Spielen"; Backlog heißt „pausiert", nur nie
 * gestartete bleiben „nicht gespielt" (Kopplung, 5.5). Darunter die
 * Kandidaten aus v_backlog_kandidaten: im Besitz,
 * nie angefasst, auf keiner Liste. „nicht vorgesehen" ist ein verworfener
 * Backlog-Eintrag (Migration 0014) – die Ablehnung bleibt gespeichert, die
 * View blendet den Kandidaten aus; „entfernen" unter „auch erledigte und
 * verworfene" macht ihn wieder zum Kandidaten.
 */
export function Backlog() {
  const liste = usePlanListe('backlog')
  const { daten, laeuft, nurFavoriten, plattformen, aendern, alle, setzeParam } = liste
  const [kandidaten, setKandidaten] = useState<{ kandidaten: BacklogKandidat[]; abgelehnt: number } | null>(null)

  const kandidatenLaden = useCallback(async () => {
    try {
      setKandidaten(await anfrage<{ kandidaten: BacklogKandidat[]; abgelehnt: number }>('/api/backlog-candidates'))
    } catch {
      setKandidaten({ kandidaten: [], abgelehnt: 0 })
    }
  }, [])

  useEffect(() => {
    void kandidatenLaden()
  }, [kandidatenLaden])

  async function uebernehmen(k: BacklogKandidat, koerper: Record<string, unknown>) {
    if (await liste.anlegen({ releaseId: k.releaseId, ...koerper })) await kandidatenLaden()
  }

  /** Rückgängig bringt den Kandidaten zurück – auch nach der Ablehnung. */
  async function rueckgaengig() {
    await liste.rueckgaengig()
    await kandidatenLaden()
  }


  return (
    <>
      <h1>Backlog</h1>
      <Reiter />
      <p className="zeile">Pausiert oder nie gestartet. „auf To-Do" zieht einen Eintrag ans Ende der To-Do-Liste und setzt „am Spielen".</p>

      <Filterleiste liste={liste} />
      <Meldungen liste={{ ...liste, rueckgaengig }} />

      {!daten ? (
        <p>wird geladen …</p>
      ) : daten.eintraege.length === 0 ? (
        <p>{nurFavoriten || plattformen.size > 0 ? 'Nichts passt zum Filter.' : 'Das Backlog ist leer.'}</p>
      ) : (
        <>
          <p>{daten.eintraege.length} Einträge</p>
          <ul className="kacheln">
            {daten.eintraege.map((e) => (
              <PlanKarte
                key={e.id}
                e={e}
                liste={liste}
                knoepfe={<button type="button" className="klein" onClick={() => aendern(e.id, { art: 'todo' })}>auf To-Do</button>}
              />
            ))}
          </ul>
        </>
      )}

      <section className="kandidaten">
        <h2>Kandidaten</h2>
        <p className="zeile">
          Im Besitz, nie angefasst, auf keiner Liste. „nicht vorgesehen" merkt sich die Ablehnung als verworfenen Eintrag; „entfernen" dort macht den Titel wieder zum Kandidaten.
          {kandidaten && kandidaten.abgelehnt > 0 && (
            <>
              {' '}{kandidaten.abgelehnt} abgelehnt
              {!alle && (
                <>
                  {' – '}
                  <button type="button" className="klein" onClick={() => setzeParam('status', 'alle')}>anzeigen</button>
                </>
              )}
              .
            </>
          )}
        </p>
        {!kandidaten ? (
          <p>wird geladen …</p>
        ) : kandidaten.kandidaten.length === 0 ? (
          <p>
            Keine Kandidaten. Kandidat ist ein Release mit Disc oder digitaler Berechtigung ohne Trophäenfortschritt – Besitz erfasst du in der{' '}
            <Link to="/sammlung">Sammlung</Link>.
          </p>
        ) : (
          <ul className="kandidatenliste">
            {kandidaten.kandidaten.map((k) => (
              <li key={k.releaseId}>
                <Link to={`/spiel/${k.spielId}`} className={k.bild ? 'bild cover' : 'bild'}>
                  {k.bild ? <img src={k.bild} alt="" loading="lazy" /> : <span aria-hidden="true">{k.titel.slice(0, 1)}</span>}
                </Link>
                <div>
                  <Link to={`/spiel/${k.spielId}`} className="titel">{k.titel}</Link>
                  <div className="zeile">{k.plattform} · Kritik {k.kritik ?? 'unbekannt'}</div>
                </div>
                <div className="knopfzeile">
                  <button type="button" className="klein" disabled={laeuft} onClick={() => uebernehmen(k, { art: 'backlog' })}>ins Backlog</button>
                  <button type="button" className="klein" disabled={laeuft} onClick={() => uebernehmen(k, { art: 'todo' })}>auf To-Do</button>
                  <button type="button" className="klein" disabled={laeuft} onClick={() => uebernehmen(k, { art: 'backlog', status: 'verworfen' })}>nicht vorgesehen</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
