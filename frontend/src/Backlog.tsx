import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { anfrage, STATUSTEXT, type BacklogKandidat, type PlayStatus } from './api'
import { Meldungen, PLAN_CHIPS, PlanKarte, Reiter, SORTIERBAR, SORTIER_NATUERLICH, type ListenSortierung, usePlanListe } from './Absichten'
import { useAnsicht } from './Ansicht'
import { Chips } from './Chips'
import { Sortierleiste } from './Sortierung'
import { Kopfzeile } from './Kopfzeile'
import { Zeichen } from './Symbole'
import { ZustandTafel } from './spieldetail/ZustandTafel'
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
 *
 * „Zustand …" (Nachtrag f1e, Wunsch des Nutzers vom 27.11.2026: „den Status
 * bei den Backlog-Kandidaten ändern können, damit sie verschwinden") öffnet
 * dieselbe Tafel wie das Spieldetail und schreibt über PATCH play-status:
 * nur der Status, Datum, Bewertung und Notiz bleiben – PUT löschte sie. Die
 * Kopplung zieht die Liste nach (5.5); jeder Zustand außer „nicht gespielt"
 * nimmt den Titel aus den Kandidaten. Ein Rückgängig gibt es dafür nicht
 * (offen, 5.4: der Schreibweg stempelt die Durchsicht und legt eine Zeile an, die
 * kein bestehender Weg wieder entfernt).
 */
export function Backlog() {
  const liste = usePlanListe('backlog')
  const { daten, laeuft, nurFavoriten, plattformen, suche, aendern, alle, setzeParam, sortierung, richtung, setzeSortierung } = liste
  const ansicht = useAnsicht('backlog')
  const [kandidaten, setKandidaten] = useState<{ kandidaten: BacklogKandidat[]; abgelehnt: number } | null>(null)
  /** Der Kandidat, dessen Zustandstafel offen ist. */
  const [zustandFuer, setZustandFuer] = useState<number | null>(null)
  const [gesetzt, setGesetzt] = useState<string | null>(null)
  const tafelSchliessen = useCallback(() => setZustandFuer(null), [])

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
    setGesetzt(null)
    if (await liste.anlegen({ releaseId: k.releaseId, ...koerper })) await kandidatenLaden()
  }

  /** Zustand eines Kandidaten setzen; „nicht gespielt" ist sein Stand schon und schreibt nichts. */
  async function zustandSetzen(k: BacklogKandidat, status: PlayStatus) {
    setZustandFuer(null)
    if (status === 'nicht_gespielt') return
    liste.setMeldung(null)
    liste.setLaeuft(true)
    try {
      await anfrage(`/api/releases/${k.releaseId}/play-status`, { methode: 'PATCH', koerper: { status } })
      setGesetzt(`„${k.titel}" (${k.plattform}): ${STATUSTEXT[status]}.`)
      await Promise.all([liste.laden(), kandidatenLaden()])
    } catch (f) {
      liste.setMeldung(f instanceof Error ? f.message : 'Zustand setzen fehlgeschlagen.')
    } finally {
      liste.setLaeuft(false)
    }
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
      <Chips
        gruppen={PLAN_CHIPS}
        rechts={
          <Sortierleiste
            texte={SORTIERBAR}
            natuerlich={SORTIER_NATUERLICH}
            wert={sortierung as ListenSortierung}
            richtung={richtung}
            waehlen={(w, r) => setzeSortierung(w, r)}
          />
        }
      />

      <div className="seite">
      <p className="ruhig klein">Pausiert oder nie gestartet. „auf To-Do" zieht einen Eintrag ans Ende der To-Do-Liste und setzt „am Spielen".</p>

      <Meldungen liste={{ ...liste, rueckgaengig }} />
      {gesetzt && <p role="status" className="hinweis">{gesetzt}</p>}

      {!daten ? (
        <p className="ruhig">wird geladen …</p>
      ) : daten.eintraege.length === 0 ? (
        <p className="ruhig">{nurFavoriten || plattformen.size > 0 || suche ? 'Nichts passt zum Filter.' : 'Das Backlog ist leer.'}</p>
      ) : (
        <>
          <div className="listenkopf">
            <span>{daten.eintraege.length} Einträge</span>
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
                  <div className="ruhig klein">{k.plattform} · Wertung {k.spieler ?? 'unbekannt'}</div>
                </div>
                <div className="knopfzeile">
                  <button type="button" className="klein" disabled={laeuft} onClick={() => uebernehmen(k, { art: 'backlog' })}>ins Backlog</button>
                  <button type="button" className="klein" disabled={laeuft} onClick={() => uebernehmen(k, { art: 'todo' })}>auf To-Do</button>
                  <button type="button" className="klein" disabled={laeuft} onClick={() => uebernehmen(k, { art: 'backlog', status: 'verworfen' })}>nicht vorgesehen</button>
                  <button
                    type="button"
                    className="klein"
                    disabled={laeuft}
                    aria-expanded={zustandFuer === k.releaseId}
                    onClick={() => setZustandFuer(zustandFuer === k.releaseId ? null : k.releaseId)}
                  >
                    Zustand …
                  </button>
                </div>
                {zustandFuer === k.releaseId && (
                  <ZustandTafel aktuell="nicht_gespielt" laeuft={laeuft} schliessen={tafelSchliessen} onWaehlen={(s) => void zustandSetzen(k, s)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </>
  )
}
