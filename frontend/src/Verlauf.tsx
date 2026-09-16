import { Link } from 'react-router-dom'
import { QUELLETEXT, type Ereignis, zeitpunkt } from './api'

/**
 * Eine Liste von Ereignissen (Abschnitt 8.5): Zeit, Quelle als Pille,
 * der Satz vom Server. `mitTitel` zeigt das Spiel je Zeile – in der
 * Ansicht „Änderungen"; im Spieldetail steht es schon darüber.
 */
export function Verlauf({ ereignisse, mitTitel }: { ereignisse: Ereignis[]; mitTitel: boolean }) {
  return (
    <ul className="verlauf">
      {ereignisse.map((e) => (
        <li key={e.id}>
          <span className="zeile">{zeitpunkt(e.zeitpunkt)}</span>{' '}
          <span className={`pille quelle-${e.quelle}`}>{QUELLETEXT[e.quelle]}</span>{' '}
          {mitTitel && (e.spielId !== null ? <Link to={`/spiel/${e.spielId}`} className="titel">{e.titel}</Link> : <span className="titel">{e.titel}</span>)}
          {mitTitel && ' – '}
          {e.text}
        </li>
      ))}
    </ul>
  )
}
