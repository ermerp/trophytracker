import { useEffect, useState } from 'react'
import { PLATTFORMEN, anfrage, type Plattform } from './api'
import { PlattformChip } from './SpielTeile'

/**
 * Einen Barcode einem Spiel der Sammlung zuordnen (Stufe 3 der Kette,
 * Abschnitt 9.2): dieselbe Suche wie die Sammlungsansicht
 * (`GET /api/games?search=&limit=10`, gemessen in `test/lesekosten.spec.ts`).
 *
 * Seit Nachtrag f1g nur noch die Suche – das Anlegen eines neuen Spiels hat
 * im Scanner seine eigene Karte (Fall 3), und „Überspringen" ist das Kreuz
 * der Karte. Je Spiel ein Knopf je Release (mit Disc gesperrt: je Release
 * genau eine) und „andere Plattform" für Releases, die es noch nicht gibt.
 */

export type Wahl = { releaseId: number } | { spielId: number; plattform: Plattform }

type SuchRelease = { id: number; plattform: Plattform; exemplare: number; digital: string[] }
type SuchSpiel = { id: number; titel: string; bild: string | null; releases: SuchRelease[] }

export const istPlattform = (w: string | null | undefined): w is Plattform =>
  (PLATTFORMEN as readonly string[]).includes(w ?? '')

export function ScanAuswahl({
  ean,
  vorgabe = '',
  laeuft,
  onWahl,
}: {
  ean: string
  /** Vorbelegung des Suchfelds. */
  vorgabe?: string
  laeuft: boolean
  /** `releaseNeu`: Die Wahl legt ein Release an – Rückgängig muss es wieder entfernen. */
  onWahl: (wahl: Wahl, releaseNeu: boolean) => void
}) {
  const [suchtext, setSuchtext] = useState(vorgabe)
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

  return (
    <div className="scan-suche">
      <input
        type="search"
        value={suchtext}
        onChange={(e) => setSuchtext(e.target.value)}
        placeholder="Titel in der Sammlung suchen"
        aria-label={`Titel in der Sammlung suchen für ${ean}`}
      />
      {sucht && <p className="scan-still">sucht …</p>}
      {spiele && spiele.length === 0 && !sucht && <p className="scan-still">Kein Spiel mit diesem Titel in der Sammlung.</p>}
      {spiele && spiele.length > 0 && (
        <ul className="scan-wahlliste">
          {spiele.map((s) => (
            <li key={s.id} className="scan-wahl">
              <span className="scan-mini">{s.bild ? <img src={s.bild} alt="" loading="lazy" /> : null}</span>
              <span className="scan-wahl-titel">{s.titel}</span>
              <span className="scan-wahl-knoepfe">
                {s.releases.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="knopf"
                    disabled={laeuft || r.exemplare > 0}
                    title={r.exemplare > 0 ? 'Steht schon im Regal' : `Disc erfassen (${r.plattform})`}
                    aria-label={r.exemplare > 0 ? `${r.plattform}: schon im Regal` : `Disc erfassen: ${s.titel} (${r.plattform})`}
                    onClick={() => onWahl({ releaseId: r.id }, false)}
                  >
                    <PlattformChip plattform={r.plattform} />
                    {r.exemplare > 0 && ' im Regal'}
                  </button>
                ))}
                {s.releases.length < PLATTFORMEN.length && (
                  <select
                    value=""
                    disabled={laeuft}
                    aria-label={`Andere Plattform für ${s.titel}`}
                    onChange={(e) => {
                      if (istPlattform(e.target.value)) onWahl({ spielId: s.id, plattform: e.target.value }, true)
                    }}
                  >
                    <option value="">andere …</option>
                    {PLATTFORMEN.filter((p) => !s.releases.some((r) => r.plattform === p)).map((p) => (
                      <option key={p} value={p}>{p} anlegen</option>
                    ))}
                  </select>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
