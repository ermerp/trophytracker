import { useEffect, useState } from 'react'
import { PLATTFORMEN, anfrage, type Plattform } from './api'
import { PlattformChip } from './SpielTeile'
import { Zeichen } from './Symbole'
import { gleichesZiel, type HuellenWahl } from './scanner'

/**
 * Einen Barcode einem Spiel der Sammlung zuordnen (Stufe 3 der Kette,
 * Abschnitt 9.2): dieselbe Suche wie die Sammlungsansicht
 * (`GET /api/games?search=&limit=10`, gemessen in `test/lesekosten.spec.ts`).
 *
 * Seit Nachtrag f1g nur noch die Suche – das Anlegen eines neuen Spiels hat
 * im Scanner seine eigene Karte (Fall 3), und „Überspringen" ist das Kreuz
 * der Karte. Je Spiel ein Knopf je Release (mit Disc gesperrt: je Release
 * genau eine) und „andere Plattform" für Releases, die es noch nicht gibt.
 *
 * Seit Nachtrag f1h **wählt** ein Tipp, statt sofort zuzuordnen: Eine
 * Collection-Disc enthält mehrere Spiele, die in der Sammlung einzeln stehen,
 * und jedes bekommt seine Disc mit demselben Code. Die Wahl überlebt einen
 * neuen Suchbegriff (ICO und Shadow of the Colossus findet keine Suche
 * zugleich); zugeordnet wird über den Hauptknopf der Karte.
 *
 * Seit Nachtrag f1i kann die Karte eine Liste **vorgeben** – die Spiele einer
 * Collection aus IGDB. Sie steht da, solange das Suchfeld leer ist; wer tippt,
 * sucht weitere Spiele dazu, und die Wahl bleibt.
 */

type SuchRelease = { id: number; plattform: Plattform; exemplare: number; digital: string[] }
export type SuchSpiel = { id: number; titel: string; bild: string | null; releases: SuchRelease[] }

export const istPlattform = (w: string | null | undefined): w is Plattform =>
  (PLATTFORMEN as readonly string[]).includes(w ?? '')

export function ScanAuswahl({
  ean,
  vorgabe = '',
  laeuft,
  wahl,
  vorgegeben,
  onUmschalten,
}: {
  ean: string
  /** Vorbelegung des Suchfelds. */
  vorgabe?: string
  /** Spiele, die bei leerem Suchfeld dastehen (die Collection, Nachtrag f1i). */
  vorgegeben?: readonly SuchSpiel[]
  laeuft: boolean
  /** Die gewählten Spiele dieser Hülle. */
  wahl: readonly HuellenWahl[]
  onUmschalten: (w: HuellenWahl) => void
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

  /** Was gerade dasteht: das Suchergebnis, bei leerem Feld die vorgegebene Liste. */
  const sichtbar: readonly SuchSpiel[] | null = suchtext.trim() === '' ? (vorgegeben ?? null) : spiele
  const gewaehlt = (spielId: number, ziel: HuellenWahl['ziel']) => wahl.some((w) => w.spielId === spielId && gleichesZiel(w.ziel, ziel))
  /** Gewählte Spiele, die die aktuelle Suche nicht zeigt – sonst sähe man sie nicht mehr. */
  const ausserhalb = wahl.filter((w) => !sichtbar?.some((s) => s.id === w.spielId))

  return (
    <div className="scan-suche">
      <input
        type="search"
        value={suchtext}
        onChange={(e) => setSuchtext(e.target.value)}
        placeholder={vorgegeben ? 'Weitere Spiele suchen' : 'Titel in der Sammlung suchen'}
        aria-label={`Titel in der Sammlung suchen für ${ean}`}
      />
      {ausserhalb.length > 0 && (
        <p className="scan-zeile">
          Gewählt:{' '}
          {ausserhalb.map((w, i) => (
            <span key={w.spielId}>
              {i > 0 && ' · '}
              {w.titel} ({w.plattform === 'PSVITA' ? 'Vita' : w.plattform})
            </span>
          ))}
        </p>
      )}
      {sucht && <p className="scan-still">sucht …</p>}
      {sichtbar === spiele && spiele && spiele.length === 0 && !sucht && <p className="scan-still">Kein Spiel mit diesem Titel in der Sammlung.</p>}
      {sichtbar && sichtbar.length > 0 && (
        <ul className="scan-wahlliste">
          {sichtbar.map((s) => {
            const neu = wahl.find((w) => w.spielId === s.id && 'spielId' in w.ziel)
            return (
              <li key={s.id} className="scan-wahl">
                <span className="scan-mini">{s.bild ? <img src={s.bild} alt="" loading="lazy" /> : null}</span>
                <span className="scan-wahl-titel">{s.titel}</span>
                <span className="scan-wahl-knoepfe">
                  {s.releases.map((r) => {
                    const an = gewaehlt(s.id, { releaseId: r.id })
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={an ? 'knopf gewaehlt' : 'knopf'}
                        aria-pressed={an}
                        disabled={laeuft || r.exemplare > 0}
                        title={r.exemplare > 0 ? 'Steht schon im Regal' : `Für diese Hülle wählen (${r.plattform})`}
                        aria-label={r.exemplare > 0 ? `${r.plattform}: schon im Regal` : `${s.titel} (${r.plattform}) für diese Hülle wählen`}
                        onClick={() =>
                          onUmschalten({ spielId: s.id, titel: s.titel, plattform: r.plattform, ziel: { releaseId: r.id }, releaseNeu: false })
                        }
                      >
                        {an && <Zeichen name="haken" groesse={14} />}
                        <PlattformChip plattform={r.plattform} />
                        {r.exemplare > 0 && ' im Regal'}
                      </button>
                    )
                  })}
                  {neu && 'spielId' in neu.ziel && (
                    <button
                      type="button"
                      className="knopf gewaehlt"
                      aria-pressed
                      disabled={laeuft}
                      aria-label={`${s.titel} (${neu.plattform} anlegen) abwählen`}
                      onClick={() => onUmschalten(neu)}
                    >
                      <Zeichen name="haken" groesse={14} />
                      <PlattformChip plattform={neu.plattform} /> neu
                    </button>
                  )}
                  {s.releases.length < PLATTFORMEN.length && (
                    <select
                      value=""
                      disabled={laeuft}
                      aria-label={`Andere Plattform für ${s.titel}`}
                      onChange={(e) => {
                        const p = e.target.value
                        if (istPlattform(p)) onUmschalten({ spielId: s.id, titel: s.titel, plattform: p, ziel: { spielId: s.id, plattform: p }, releaseNeu: true })
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
            )
          })}
        </ul>
      )}
    </div>
  )
}
