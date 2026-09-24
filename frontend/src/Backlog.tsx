import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { anfrage, type BacklogKandidat } from './api'
import { Meldungen, PLAN_CHIPS, PlanKarte, Reiter, SORTIERTEXT, usePlanListe } from './Absichten'
import { useAnsicht } from './Ansicht'
import { Chips } from './Chips'
import { Kopfzeile } from './Kopfzeile'
import { Zeichen } from './Symbole'
import { TODO_REITER } from './Todo'

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
  const { daten, laeuft, nurFavoriten, plattformen, suche, aendern, alle, setzeParam, sortierung } = liste
  const ansicht = useAnsicht('backlog')
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
      <Kopfzeile titel="Backlog" sucheParam="suche" ansicht={ansicht} />
      <Reiter eintraege={TODO_REITER} />
      <Chips gruppen={PLAN_CHIPS} />

      <div className="seite">
      <p className="ruhig klein">Pausiert oder nie gestartet. „auf To-Do" zieht einen Eintrag ans Ende der To-Do-Liste und setzt „am Spielen".</p>

      <Meldungen liste={{ ...liste, rueckgaengig }} />

      {!daten ? (
        <p className="ruhig">wird geladen …</p>
      ) : daten.eintraege.length === 0 ? (
        <p className="ruhig">{nurFavoriten || plattformen.size > 0 || suche ? 'Nichts passt zum Filter.' : 'Das Backlog ist leer.'}</p>
      ) : (
        <>
          <div className="listenkopf">
            <span>{daten.eintraege.length} Einträge</span>
            <label>
              <span className="nur-vorlesen">Sortierung</span>
              <select value={sortierung} onChange={(e) => setzeParam('sort', e.target.value === 'favorit' ? '' : e.target.value)}>
                {Object.entries(SORTIERTEXT)
                  .filter(([wert]) => wert !== 'position')
                  .map(([wert, text]) => (
                    <option key={wert} value={wert}>{text}</option>
                  ))}
              </select>
            </label>
          </div>
          <ul className={ansicht.art === 'kacheln' ? 'kacheln' : 'zeilen'}>
            {daten.eintraege.map((e) => (
              <PlanKarte
                key={e.id}
                e={e}
                liste={liste}
                art={ansicht.art}
                knoepfe={
                  <button type="button" className="ikone" aria-label="Auf To-Do" title="Auf To-Do" onClick={() => aendern(e.id, { art: 'todo' })}>
                    <Zeichen name="haken" groesse={19} />
                  </button>
                }
              />
            ))}
          </ul>
        </>
      )}

      <section className="kandidaten">
        <h2>Kandidaten</h2>
        <p className="ruhig klein">
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
                  <div className="ruhig klein">{k.plattform} · Kritik {k.kritik ?? 'unbekannt'}</div>
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
      </div>
    </>
  )
}
