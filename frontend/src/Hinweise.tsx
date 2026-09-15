import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { anfrage, type IgdbStatus, type ImportLauf, type ReviewFortschritt } from './api'
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
  const [importOffen, setImportOffen] = useState<{ id: number; offen: number } | null>(null)
  const [freitext, setFreitext] = useState(0)
  const [kandidaten, setKandidaten] = useState(0)

  useEffect(() => {
    anfrage<ReviewFortschritt>('/api/review/progress').then(setReview).catch(() => {})
    anfrage<{ listenOffen: number }>('/api/zuordnung/offen?limit=1')
      .then((a) => setListenOffen(a.listenOffen))
      .catch(() => {})
    anfrage<Sicherungsstand>('/api/backup/status').then(setSicherung).catch(() => {})
    anfrage<IgdbStatus>('/api/igdb/status').then(setIgdb).catch(() => {})
    // Stufe 11: ein Import mit offenen Zeilen und Freitext-Einträge ohne Spiel.
    anfrage<{ laeufe: ImportLauf[] }>('/api/imports/wishlist')
      .then((a) => {
        const offen = a.laeufe
          .map((l) => ({ id: l.id, offen: l.zaehler.ungeprueft + l.zaehler.klar + l.zaehler.mehrdeutig + l.zaehler.ohneTreffer }))
          .find((l) => l.offen > 0)
        setImportOffen(offen ?? null)
      })
      .catch(() => {})
    anfrage<{ eintraege: Array<{ zustand: string }> }>('/api/unmatched')
      .then((a) => setFreitext(a.eintraege.filter((e) => e.zustand === 'freitext').length))
      .catch(() => {})
    // Stufe 12: im Besitz, nie angefasst, auf keiner Liste.
    anfrage<{ anzahl: number }>('/api/backlog-candidates')
      .then((a) => setKandidaten(a.anzahl))
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

  // Abschnitt 13: Der Import ist keine Dauernavigation - er erscheint hier,
  // solange ein Lauf offene Zeilen hat. Freitext-Eintraege ohne Spiel haben
  // weder Cover noch Rang (8.3) und wandern ueber "Ohne Zuordnung" nach.
  if (importOffen) {
    zeilen.push(
      <li key="import">
        Ein Wunschlisten-Import hat <strong>{importOffen.offen}</strong> offene Zeilen.{' '}
        <Link to={`/import/${importOffen.id}`}>Weiter</Link>
      </li>,
    )
  }
  if (freitext > 0) {
    zeilen.push(
      <li key="freitext">
        <strong>{freitext}</strong> Einträge haben keinen IGDB-Eintrag.{' '}
        <Link to="/ohne-zuordnung">Ohne Zuordnung</Link>
      </li>,
    )
  }
  if (kandidaten > 0) {
    zeilen.push(
      <li key="kandidaten">
        <strong>{kandidaten}</strong> Spiele im Besitz stehen auf keiner Liste.{' '}
        <Link to="/backlog">Backlog-Kandidaten</Link>
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
