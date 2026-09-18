import { useEffect, useState } from 'react'
import { PLATTFORMEN, anfrage, type Plattform } from './api'
import { SpielAnlegen } from './SpielAnlegen'

/**
 * Einen Barcode einem Release zuordnen: aus der Sammlung wählen oder das Spiel
 * anlegen (Stufe 3 und 4 der Kette, Abschnitt 9.2).
 *
 * Zwei Nutzer: der Scanner (Disc in der Hand) und die Ansicht „Offene Scans"
 * (Stufe 17b, Code ohne Hülle). Beide brauchen dasselbe – deshalb hier und
 * nicht zweimal.
 */

export type Wahl = { releaseId: number } | { spielId: number; plattform: Plattform }

type SuchRelease = { id: number; plattform: Plattform; exemplare: number; digital: string[] }
type SuchSpiel = { id: number; titel: string; bild: string | null; releases: SuchRelease[] }

export const istPlattform = (w: string | null | undefined): w is Plattform =>
  (PLATTFORMEN as readonly string[]).includes(w ?? '')

export function ScanAuswahl({
  ean,
  scans = 1,
  angebot = null,
  vorgabe = '',
  laeuft,
  onWahl,
  onSpaeter,
  spaeterText = 'Später',
}: {
  ean: string
  /** Wie oft der Code schon gescannt wurde – „zum 2. Mal" ist ein Hinweis. */
  scans?: number
  /** Titel und Plattform aus einer Fremdquelle, falls vorhanden. */
  angebot?: { titel: string; plattform: string | null } | null
  /** Vorbelegung des Suchfelds, wenn kein Angebot vorliegt. */
  vorgabe?: string
  laeuft: boolean
  onWahl: (wahl: Wahl) => void
  onSpaeter?: () => void
  spaeterText?: string
}) {
  const [suchtext, setSuchtext] = useState(angebot?.titel ?? vorgabe)
  const [spiele, setSpiele] = useState<SuchSpiel[] | null>(null)
  const [sucht, setSucht] = useState(false)

  // Suche entprellen wie in der Sammlung: 300 ms nach dem letzten Tastendruck.
  useEffect(() => {
    const suche = suchtext.trim()
    if (suche === '') {
      setSpiele(null)
      return
    }
    const zeit = setTimeout(async () => {
      setSucht(true)
      try {
        const a = await anfrage<{ spiele: SuchSpiel[] }>(`/api/games?search=${encodeURIComponent(suche)}&limit=10`)
        setSpiele(a.spiele)
      } catch {
        setSpiele([])
      } finally {
        setSucht(false)
      }
    }, 300)
    return () => clearTimeout(zeit)
  }, [suchtext])

  const plattformVorgabe: Plattform = istPlattform(angebot?.plattform) ? angebot!.plattform : 'PS4'

  return (
    <div className="auswahl">
      <p>
        <strong>EAN {ean}</strong> ist noch nicht zugeordnet
        {scans > 1 && ` (zum ${scans}. Mal gescannt)`}.
        {angebot && ` Ein Händler nennt „${angebot.titel}"${angebot.plattform ? ` (${angebot.plattform})` : ''}.`}
      </p>
      <p className="steuerung">
        <input
          type="search"
          value={suchtext}
          onChange={(e) => setSuchtext(e.target.value)}
          placeholder="Titel in der Sammlung suchen"
          aria-label={`Titel in der Sammlung suchen für ${ean}`}
          autoFocus={onSpaeter !== undefined}
        />{' '}
        {onSpaeter && (
          <button type="button" disabled={laeuft} onClick={onSpaeter}>
            {spaeterText}
          </button>
        )}
      </p>
      {sucht && <p>sucht …</p>}
      {spiele && spiele.length === 0 && !sucht && <p>Kein Spiel mit diesem Titel in der Sammlung.</p>}
      {spiele && spiele.length > 0 && (
        <ul className="treffer">
          {spiele.map((s) => (
            <li key={s.id}>
              <span className="titel">{s.titel}</span>{' '}
              {s.releases.map((r) => (
                <button key={r.id} type="button" disabled={laeuft} onClick={() => onWahl({ releaseId: r.id })}>
                  {r.plattform}
                  {r.exemplare > 0 && ` · Disc ×${r.exemplare}`}
                </button>
              ))}
              {s.releases.length < PLATTFORMEN.length && (
                <select
                  value=""
                  disabled={laeuft}
                  aria-label={`Andere Plattform für ${s.titel}`}
                  onChange={(e) => {
                    if (istPlattform(e.target.value)) onWahl({ spielId: s.id, plattform: e.target.value })
                  }}
                >
                  <option value="">andere Plattform …</option>
                  {PLATTFORMEN.filter((p) => !s.releases.some((r) => r.plattform === p)).map((p) => (
                    <option key={p} value={p}>{p} anlegen</option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}
      <SpielAnlegen
        key={ean}
        titelVorgabe={suchtext.trim()}
        plattformVorgabe={plattformVorgabe}
        vorhandenesVerwenden
        onAngelegt={(releaseId) => onWahl({ releaseId })}
      />
    </div>
  )
}
