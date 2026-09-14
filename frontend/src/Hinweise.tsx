import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { anfrage, type IgdbStatus, type ReviewFortschritt } from './api'
import type { Sicherungsstand } from './Sicherung'

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
  const [sicherung, setSicherung] = useState<Sicherungsstand | null>(null)
  const [igdb, setIgdb] = useState<IgdbStatus | null>(null)

  useEffect(() => {
    anfrage<ReviewFortschritt>('/api/review/progress').then(setReview).catch(() => {})
    anfrage<{ listenOffen: number }>('/api/zuordnung/offen?limit=1')
      .then((a) => setListenOffen(a.listenOffen))
      .catch(() => {})
    anfrage<Sicherungsstand>('/api/backup/status').then(setSicherung).catch(() => {})
    anfrage<IgdbStatus>('/api/igdb/status').then(setIgdb).catch(() => {})
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

  // Abschnitt 7.6: Der Abgleich ist ein Handgriff in den Einstellungen, die
  // Zuordnung eine eigene Ansicht - beides nur, solange etwas offen ist.
  if (igdb && igdb.zugangsdaten && igdb.ungeprueft > 0) {
    zeilen.push(
      <li key="igdb-abgleich">
        <strong>{igdb.ungeprueft}</strong> Spiele wurden noch nicht bei IGDB gesucht.{' '}
        <Link to="/einstellungen">Abgleich starten</Link>
      </li>,
    )
  }
  if (igdb && igdb.zurPruefung > 0) {
    zeilen.push(
      <li key="igdb-pruefung">
        <strong>{igdb.zurPruefung}</strong> Spiele warten auf die IGDB-Zuordnung.{' '}
        <Link to="/igdb">IGDB-Zuordnung</Link>
      </li>,
    )
  }

  // Abschnitt 14.2: „Ein Backup, von dem man nicht weiss, ob es laeuft, ist
  // kein Backup." Acht Tage, nicht sieben: Der Lauf ist woechentlich, ein Tag
  // Luft verhindert eine Warnung, die jeden Samstag von allein erscheint.
  if (sicherung && sicherung.letzterErfolgAm === null) {
    zeilen.push(
      <li key="sicherung">
        Noch <strong>keine Sicherung</strong> – die Daten liegen nur bei Cloudflare.{' '}
        <Link to="/einstellungen">Einstellungen</Link>
      </li>,
    )
  } else if (sicherung?.tageSeit != null && sicherung.tageSeit > 8) {
    zeilen.push(
      <li key="sicherung">
        Die letzte Sicherung ist <strong>{sicherung.tageSeit} Tage</strong> alt.{' '}
        <Link to="/einstellungen">Einstellungen</Link>
      </li>,
    )
  }

  if (zeilen.length === 0) return null
  return <ul className="hinweise">{zeilen}</ul>
}
