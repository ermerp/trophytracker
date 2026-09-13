import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { anfrage, type ReviewFortschritt } from './api'

/**
 * Offene Posten – übernimmt die Rolle des Dashboards (Abschnitt 13), bis es
 * das Dashboard gibt; dann wandert die Komponente dorthin.
 *
 * Die Unentschieden-Zeile steht bewusst auch dann, wenn die Prüfliste leer
 * ist: Sonst verschwindet die zweite Runde aus dem Blick.
 */
export function Hinweise() {
  const [params] = useSearchParams()
  const [review, setReview] = useState<ReviewFortschritt | null>(null)
  const [listenOffen, setListenOffen] = useState(0)

  useEffect(() => {
    anfrage<ReviewFortschritt>('/api/review/progress').then(setReview).catch(() => {})
    anfrage<{ listenOffen: number }>('/api/zuordnung/offen?limit=1')
      .then((a) => setListenOffen(a.listenOffen))
      .catch(() => {})
  }, [])

  const zeilen: React.ReactNode[] = []
  if (review && review.offen > 0) {
    zeilen.push(
      <li key="pruefen">
        <strong>{review.offen}</strong> Spiele warten auf deine erste Durchsicht.{' '}
        <Link to="/pruefliste">Prüfliste</Link>
      </li>,
    )
  }
  if (review && review.unentschieden > 0 && params.get('playStatus') !== 'unentschieden') {
    zeilen.push(
      <li key="unentschieden">
        <strong>{review.unentschieden}</strong> Spiele stehen auf „unentschieden".{' '}
        <Link to="/sammlung?playStatus=unentschieden">Ansehen</Link>
      </li>,
    )
  }
  if (listenOffen > 0) {
    zeilen.push(
      <li key="zuordnung">
        <strong>{listenOffen}</strong> Trophäenlisten sind noch nicht zugeordnet.{' '}
        <Link to="/zuordnung">Zuordnung</Link>
      </li>,
    )
  }

  if (zeilen.length === 0) return null
  return <ul className="hinweise">{zeilen}</ul>
}
