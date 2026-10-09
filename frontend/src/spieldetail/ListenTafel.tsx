import { PLAN_ARTEN, PLAN_ARTTEXT, type PlanArt } from '../api'
import { PlattformChip } from '../SpielTeile'
import type { Spiel } from './typen'
import { useEscape } from './useEscape'

/**
 * Auf eine der vier Listen setzen.
 *
 * **Immer an einem Release**, nie am Spiel: Ein Eintrag ohne Plattform ist
 * keine brauchbare Absicht (Entscheidung des Nutzers vom 27.09.2026) – erst
 * die Plattform entscheidet über Lücke, Kauf und Preis. Seit Stufe 19d gilt
 * das überall: in Wunschliste, Import, Filter und API, für alle vier Listen.
 * Gemessen am 28.09.2026 hingen ohnehin alle 94 Einträge an einem Release.
 */
export function ListenTafel({
  spiel,
  laeuft,
  schliessen,
  onSetzen,
}: {
  spiel: Spiel
  laeuft: boolean
  schliessen: () => void
  onSetzen: (art: PlanArt, releaseId: number) => void
}) {
  useEscape(schliessen)
  return (
    <div className="wahltafel breit" role="group" aria-label="Auf eine Liste setzen">
      {spiel.releases.map((r) => (
        <div key={r.id} className="listenzeile">
          <PlattformChip plattform={r.plattform} />
          {PLAN_ARTEN.map((art) => {
            const schon = spiel.plaene.some((p) => p.releaseId === r.id && p.art === art)
            return (
              <button
                key={art}
                type="button"
                className="knopf"
                disabled={laeuft || schon}
                title={schon ? `Steht schon auf ${PLAN_ARTTEXT[art]}` : undefined}
                onClick={() => {
                  schliessen()
                  onSetzen(art, r.id)
                }}
              >
                {PLAN_ARTTEXT[art]}
              </button>
            )
          })}
        </div>
      ))}
      <p className="still">To-Do und Backlog setzen zugleich den Zustand: „am Spielen" beziehungsweise „pausiert".</p>
    </div>
  )
}
