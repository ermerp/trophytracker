import { useLayoutEffect, useRef, useState } from 'react'
import { alsDatum, anfrage, datumMitJahr, euro, kurzesDatum } from '../api'
import { Zeichen } from '../Symbole'

/**
 * Der Preisverlauf eines Release als Diagramm (Stufe 20f, Abschnitt 6).
 *
 * An einem Prototyp mit echten Punkten abgestimmt (11.10.2026). Die
 * tragenden Entscheidungen stehen dort, nicht hier:
 *
 * - **Eine Treppe, keine Linie von Punkt zu Punkt.** Geschrieben wird nur bei
 *   Änderung, dazwischen gilt der alte Preis weiter; die letzte Stufe läuft
 *   bis heute.
 * - **Ein Diagramm je Kanal, übereinander.** Mit einer gemeinsamen Preisachse
 *   wurden Händler und Markt zu einem flachen Strich am unteren Rand, sobald
 *   der Store weit darüber liegt (12,16 € gegen 69,99 € bei *Tales of
 *   Arise*) – und sie würde die Kanäle optisch verrechnen, was Abschnitt 6
 *   verbietet. Händler und Markt teilen sich eine Achse: derselbe Kanal,
 *   sollen vergleichbar liegen.
 * - **Antippen statt Hover**, denn auf dem Handy gibt es keines. Der
 *   angetippte Punkt landet in einer festen Wertzeile über dem Diagramm,
 *   nicht in einer schwebenden Tafel – die bräuchte Positionsrechnung und
 *   hätte bei 360 px keinen Platz.
 * - **Gold bleibt frei** (Entscheidung des Nutzers vom 11.10.2026): Der
 *   Akzent gehört Favoritenstern, 100 % und Platin, nicht einer Preisreihe.
 *
 * Geladen wird erst beim Aufklappen, wie bei der Trophäenliste: 225 von 490
 * Releases haben überhaupt keine Punkte (11.10.2026).
 */

type Reihe = 'haendler' | 'markt' | 'store'
type Punkt = { reihe: Reihe; stand: string; preisCents: number; quelle: string }
type Antwort = { bis: string; punkte: Punkt[] }

const NAME: Record<Reihe, string> = { haendler: 'Händler', markt: 'Markt', store: 'Store' }
/** Welche Reihe in welchem Diagramm steht. Verrechnet wird über die Grenze nie. */
const KANAL: Record<Reihe, 'gebraucht' | 'store'> = {
  haendler: 'gebraucht',
  markt: 'gebraucht',
  store: 'store',
}
const KANALNAME = { gebraucht: 'Gebraucht', store: 'Store' } as const

/** `alsDatum` liest D1s `2026-09-26 08:14:12` als UTC, nicht als Ortszeit. */
const zeit = (wert: string) => alsDatum(wert).getTime()

const OBEN = 10
const LINKS = 46
const RECHTS = 10

type Masse = { x: (t: number) => number; y: (c: number) => number; lo: number; hi: number; hoehe: number }

function masse(punkte: Punkt[], breite: number, x0: number, x1: number, mitZeitachse: boolean): Masse {
  // Am Desktop steht die Karte in zwei Spalten, das Diagramm wird trotzdem
  // breiter – ohne mehr Höhe liefe die Treppe als flacher Strich durch.
  const flaeche = breite < 480 ? 84 : 120
  const unten = mitZeitachse ? 24 : 8
  const preise = punkte.map((p) => p.preisCents)
  let lo = Math.min(...preise)
  let hi = Math.max(...preise)
  // Eine Reihe mit einem einzigen Punkt ist der häufigste Fall (im Mittel
  // 2,06 Punkte je Reihe): Sie bekommt eine Achse um ihren Wert herum.
  if (hi === lo) {
    lo = Math.max(0, lo - 100)
    hi = hi + 100
  }
  const luft = (hi - lo) * 0.14
  lo = Math.max(0, lo - luft)
  hi = hi + luft
  return {
    lo,
    hi,
    hoehe: OBEN + flaeche + unten,
    x: (t) => LINKS + ((t - x0) / Math.max(1, x1 - x0)) * (breite - LINKS - RECHTS),
    y: (c) => OBEN + (1 - (c - lo) / (hi - lo)) * flaeche,
  }
}

/**
 * Die Stufe EINES Punkts: der senkrechte Anstieg auf seinen Preis und die
 * Waagerechte, solange er gilt – bis zum nächsten Punkt, sonst bis heute.
 * Das ist zugleich sein Trefferfeld: Angeklickt wird die Linie, nicht der
 * Punkt (Rückmeldung des Nutzers vom 11.10.2026).
 */
function stufe(punkte: Punkt[], i: number, m: Masse, x1: number) {
  const p = punkte[i]
  const x = m.x(zeit(p.stand))
  const bis = i + 1 < punkte.length ? m.x(zeit(punkte[i + 1].stand)) : m.x(x1)
  const vorher = i > 0 ? m.y(punkte[i - 1].preisCents) : m.y(p.preisCents)
  return `M ${x.toFixed(1)} ${vorher.toFixed(1)} V ${m.y(p.preisCents).toFixed(1)} H ${bis.toFixed(1)}`
}

/** Waagerecht bis zum neuen Datum, dann senkrecht auf den neuen Preis – und zuletzt bis heute. */
function treppe(punkte: Punkt[], m: Masse, x1: number) {
  let d = `M ${m.x(zeit(punkte[0].stand)).toFixed(1)} ${m.y(punkte[0].preisCents).toFixed(1)}`
  for (const p of punkte.slice(1)) {
    d += ` H ${m.x(zeit(p.stand)).toFixed(1)} V ${m.y(p.preisCents).toFixed(1)}`
  }
  return d + ` H ${m.x(x1).toFixed(1)}`
}

/**
 * Welcher Punkt zu einem Tippen gehoert: In jeder Reihe die Stufe suchen, die
 * den Zeitpunkt enthaelt, und davon die naechste nehmen.
 *
 * Warum nicht einfach ein Trefferfeld je Stufe: Haendler und Markt liegen oft
 * dicht beieinander und bei *Assassin's Creed Odyssey* an drei Tagen exakt
 * uebereinander - ein 20 px breiter Strich der einen Reihe verdeckt die
 * andere dann vollstaendig. So gewinnt immer die Kurve, die naeher liegt, und
 * die ganze Flaeche ist antippbar statt nur die Linie selbst.
 */
function naechsterPunkt(punkte: Punkt[], reihen: Reihe[], m: Masse, zx: number, zy: number) {
  let beste: Punkt | null = null
  let abstand = Infinity
  for (const reihe of reihen) {
    const eigene = punkte
      .filter((p) => p.reihe === reihe)
      .sort((a, b) => zeit(a.stand) - zeit(b.stand))
    // Die letzte Stufe, die bei oder vor dem getippten Zeitpunkt beginnt;
    // links vom ersten Punkt gilt der erste.
    let treffer = eigene[0]
    for (const p of eigene) if (m.x(zeit(p.stand)) <= zx) treffer = p
    const d = Math.abs(m.y(treffer.preisCents) - zy)
    if (d < abstand) {
      abstand = d
      beste = treffer
    }
  }
  return beste
}

function Diagramm({
  punkte,
  breite,
  x0,
  von,
  x1,
  mitZeitachse,
  gewaehlt,
  onWaehlen,
}: {
  punkte: Punkt[]
  breite: number
  x0: number
  von: string
  x1: number
  mitZeitachse: boolean
  gewaehlt: Punkt | null
  onWaehlen: (p: Punkt) => void
}) {
  const m = masse(punkte, breite, x0, x1, mitZeitachse)
  const reihen = [...new Set(punkte.map((p) => p.reihe))]

  return (
    <svg viewBox={`0 0 ${breite} ${m.hoehe}`} width={breite} height={m.hoehe} className="preissvg">
      {[m.lo, m.hi].map((c) => (
        <g key={c}>
          <line className="netz" x1={LINKS} y1={m.y(c)} x2={breite - RECHTS} y2={m.y(c)} />
          <text className="achse" x={0} y={m.y(c) + 3}>
            {euro(Math.round(c))}
          </text>
        </g>
      ))}
      {mitZeitachse && (
        <>
          <text className="achse" x={LINKS} y={m.hoehe - 6}>
            {kurzesDatum(von)}
          </text>
          <text className="achse" x={breite - RECHTS} y={m.hoehe - 6} textAnchor="end">
            heute
          </text>
        </>
      )}
      {reihen.map((reihe) => {
        const eigene = punkte
          .filter((p) => p.reihe === reihe)
          .sort((a, b) => zeit(a.stand) - zeit(b.stand))
        return (
          <g key={reihe} className={`r-${reihe}`}>
            <path className="treppe" d={treppe(eigene, m, x1)} />
            {eigene.map((p, i) => (
              <g key={p.stand}>
                <circle
                  className={gewaehlt === p ? 'punkt gewaehlt' : 'punkt'}
                  cx={m.x(zeit(p.stand))}
                  cy={m.y(p.preisCents)}
                  r={3.5}
                />
                {/* Die Stufe ist das TASTATURZIEL – der Zeitraum, in dem der
                    Preis galt, nicht der 3,5 px breite Punkt. Das Zeigen
                    uebernimmt die Flaeche darueber, deshalb nimmt dieser
                    Pfad keine Mausereignisse an. */}
                <path
                  className="ziel"
                  d={stufe(eigene, i, m, x1)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${NAME[p.reihe]} ${datumMitJahr(p.stand)}: ${euro(p.preisCents)}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onWaehlen(p)
                    }
                  }}
                />
              </g>
            ))}
          </g>
        )
      })}
      {/* Zuletzt und ueber allem: die Flaeche, die das Tippen aufnimmt. */}
      <rect
        className="waehlflaeche"
        x={LINKS}
        y={0}
        width={Math.max(0, breite - LINKS - RECHTS)}
        height={m.hoehe}
        onClick={(e) => {
          const kasten = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
          if (!kasten || kasten.width === 0) return
          const faktor = breite / kasten.width
          const gewaehlter = naechsterPunkt(
            punkte,
            reihen,
            m,
            (e.clientX - kasten.left) * faktor,
            (e.clientY - kasten.top) * faktor,
          )
          if (gewaehlter) onWaehlen(gewaehlter)
        }}
      />
    </svg>
  )
}

export function Preisverlauf({ releaseId }: { releaseId: number }) {
  const [offen, setOffen] = useState(false)
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [gewaehlt, setGewaehlt] = useState<Punkt | null>(null)
  const [breite, setBreite] = useState(0)
  const flaeche = useRef<HTMLDivElement>(null)

  async function umschalten() {
    if (offen) return setOffen(false)
    setOffen(true)
    if (daten) return
    try {
      setDaten(await anfrage<Antwort>(`/api/releases/${releaseId}/preise`))
    } catch (fehler) {
      setMeldung(fehler instanceof Error ? fehler.message : 'Der Preisverlauf ließ sich nicht laden.')
    }
  }

  // In echten Pixeln zeichnen statt ein viewBox zu skalieren: Sonst wüchsen
  // Strichstärke und Schrift am Desktop mit.
  useLayoutEffect(() => {
    const el = flaeche.current
    if (!el) return
    setBreite(Math.round(el.clientWidth))
    const beobachter = new ResizeObserver(() => setBreite(Math.round(el.clientWidth)))
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [offen, daten])


  const punkte = daten?.punkte ?? []
  const kanaele = [...new Set(punkte.map((p) => KANAL[p.reihe]))]
  const x0 = punkte.length > 0 ? Math.min(...punkte.map((p) => zeit(p.stand))) : 0
  const von = punkte.length > 0 ? punkte.reduce((a, b) => (zeit(a.stand) <= zeit(b.stand) ? a : b)).stand : ''
  // Die letzte Stufe läuft bis zum Stand des SERVERS, nicht bis zu dem des
  // Geräts – eine falsch gestellte Uhr zöge sie sonst in die Zukunft.
  const x1 = daten ? zeit(daten.bis) : 0
  const zeigen = gewaehlt ?? (punkte.length > 0 ? punkte.reduce((a, b) => (zeit(a.stand) >= zeit(b.stand) ? a : b)) : null)

  return (
    <div className="preisverlauf">
      <button type="button" className="knopfname blockname" onClick={umschalten} aria-expanded={offen}>
        Preisverlauf
        <span className={offen ? 'pfeil auf' : 'pfeil'}>
          <Zeichen name="winkel" groesse={14} strich={2.1} />
        </span>
      </button>

      {offen && meldung && <p className="still">{meldung}</p>}
      {offen && !daten && !meldung && <p className="still">Wird geladen …</p>}
      {offen && daten && punkte.length === 0 && <p className="still">Noch keine Preispunkte.</p>}

      {offen && daten && punkte.length > 0 && (
        <>
          {zeigen && (
            <p className="wertzeile">
              <span className={`preis r-${zeigen.reihe}`}>{euro(zeigen.preisCents)}</span>
              <span className={`reihename r-${zeigen.reihe}`}>{NAME[zeigen.reihe]}</span>
              <span className="wann">{datumMitJahr(zeigen.stand)}</span>
            </p>
          )}
          <div className="preisflaeche" ref={flaeche}>
            {breite > 0 &&
              kanaele.map((k, i) => (
                <div key={k}>
                  {kanaele.length > 1 && <p className="kanalname">{KANALNAME[k]}</p>}
                  <Diagramm
                    punkte={punkte.filter((p) => KANAL[p.reihe] === k)}
                    breite={breite}
                    x0={x0}
                    von={von}
                    x1={x1}
                    mitZeitachse={i === kanaele.length - 1}
                    gewaehlt={gewaehlt}
                    onWaehlen={setGewaehlt}
                  />
                </div>
              ))}
          </div>
          <ul className="preislegende">
            {[...new Set(punkte.map((p) => p.reihe))].map((r) => (
              <li key={r} className={`r-${r}`}>
                <i />
                {NAME[r]}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
