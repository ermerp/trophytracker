import { useEffect, useState } from 'react'
import { anfrage } from './api'

/**
 * Sicherung und Export (Abschnitt 14, Use Case 13).
 *
 * Die eigentliche Arbeit macht die wöchentliche GitHub Action; diese Ansicht
 * beantwortet die Frage, ob sie läuft. „Ein Backup, von dem man nicht weiß,
 * ob es läuft, ist kein Backup" (14.2) – deshalb steht das Datum hier und
 * die Warnung im Hinweisblock der Sammlung.
 *
 * Die Downloadlinks sind gewöhnliche `<a href>`: Der Browser hat die
 * Access-Sitzung bereits, ein `fetch` mit anschließendem Blob-Download wäre
 * nur ein Umweg mit mehr Code.
 */

export type Sicherungsstand = {
  letzterErfolgAm: string | null
  letzterCommit: string | null
  tageSeit: number | null
}

/** Die sieben Listen aus Abschnitt 14.4, mit ihren Anzeigenamen. */
export const CSV_LISTEN: Array<[datei: string, name: string]> = [
  ['sammlung', 'Sammlung'],
  ['wunsch', 'Wunschliste'],
  ['todo', 'To-Do'],
  ['backlog', 'Backlog'],
  ['kauf', 'Kaufliste'],
  ['luecken', 'Lücken'],
  ['trophaeen', 'Trophäen'],
]

const zeitpunkt = (wert: string | null) =>
  wert ? new Date(wert).toLocaleString('de-DE') : null

export function Sicherung() {
  const [stand, setStand] = useState<Sicherungsstand | null>(null)

  useEffect(() => {
    anfrage<Sicherungsstand>('/api/backup/status').then(setStand).catch(() => {})
  }, [])

  const nie = stand !== null && stand.letzterErfolgAm === null
  const veraltet = stand?.tageSeit != null && stand.tageSeit > 8

  return (
    <section>
      <h2>Sicherung</h2>

      {stand && (
        <p>
          {nie ? (
            <strong>Noch keine Sicherung.</strong>
          ) : (
            <>
              Letzte Sicherung: <strong>{zeitpunkt(stand.letzterErfolgAm)}</strong>
              {stand.letzterCommit && ` (Commit ${stand.letzterCommit})`}
              {stand.tageSeit !== null && ` – vor ${stand.tageSeit} Tagen`}
            </>
          )}
        </p>
      )}

      {(nie || veraltet) && (
        <p className="hinweis">
          Die Sicherung läuft sonntags automatisch. Bleibt sie aus, lässt sie sich auf
          GitHub unter Actions → „Sicherung" → „Run workflow" von Hand starten.
        </p>
      )}

      <p className="zeile">
        Eine GitHub Action legt sonntags eine Kopie im privaten Repository
        <code> trophytracker-backup</code> ab: <code>backup.sql</code> zum
        Wiedereinspielen und <code>backup.json</code> als lesbare Zweitform.
      </p>

      <h3>Export</h3>
      <p className="zeile">
        CSV mit Semikolon für Excel im deutschen Gebietsschema. Ein leeres Feld heißt
        „unbekannt", nie „0". CSV ist zum Auswerten gedacht, nicht als Sicherung –
        die Beziehungen zwischen den Tabellen gehen dabei verloren.
      </p>
      <ul className="exportliste">
        {CSV_LISTEN.map(([datei, name]) => (
          <li key={datei}>
            <a href={`/api/export/${datei}.csv`}>{name} (CSV)</a>
          </li>
        ))}
        <li>
          <a href="/api/export/backup.json">Vollsicherung (JSON)</a> – alle Fachtabellen,
          ohne Rohantworten und Zugangsdaten
        </li>
      </ul>
    </section>
  )
}
