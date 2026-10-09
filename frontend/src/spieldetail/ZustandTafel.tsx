import { PLAY_STATUS, STATUSTEXT, type PlayStatus } from '../api'
import { zustandsFarbe } from '../SpielTeile'
import { useEscape } from './useEscape'

/** Die sieben Zustände als Tafel. To-Do und Backlog ziehen mit (5.5). */
export function ZustandTafel({
  aktuell,
  laeuft,
  schliessen,
  onWaehlen,
}: {
  aktuell: PlayStatus | null
  laeuft: boolean
  schliessen: () => void
  onWaehlen: (s: PlayStatus) => void
}) {
  useEscape(schliessen)
  return (
    <div className="wahltafel" role="group" aria-label="Zustand wählen">
      {PLAY_STATUS.map((s) => (
        <button
          key={s}
          type="button"
          className={s === aktuell ? 'zustandwahl aktiv' : 'zustandwahl'}
          disabled={laeuft}
          onClick={() => onWaehlen(s)}
        >
          <span className="punkt" style={{ background: zustandsFarbe(s) }} />
          {STATUSTEXT[s]}
        </button>
      ))}
      <p className="still">„am Spielen" setzt auf To-Do, „pausiert" ins Backlog (5.5).</p>
    </div>
  )
}
