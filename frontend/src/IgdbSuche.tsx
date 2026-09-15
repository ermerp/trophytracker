import { useState } from 'react'
import { PLATTFORMEN, anfrage, datum, igdbLink, neuestePlattform, type IgdbKandidat } from './api'

/**
 * IGDB-Suche und Trefferliste (Abschnitt 7.6).
 *
 * Eine Komponente für drei Stellen: Spieldetail, Prüfansicht und ab Stufe 11
 * den Wunschlisten-Import (8.2, 8.3). Der Suchbegriff ist vorbelegt und
 * korrigierbar – Titel aus Fremdquellen sind abgekürzt oder anders
 * geschrieben, und eine Suche mit anpassbarer Eingabe löst das.
 */

/**
 * Plattform je Treffer (Entscheidung des Nutzers vom 15.09.2026): Die Treffer
 * einer Suche nennen verschiedene Plattformen, deshalb steht das Dropdown am
 * Treffer, vorbelegt mit dessen neuester – konkret, nicht „neueste des
 * Treffers" als Platzhalter. „Ohne Plattform" bleibt wählbar.
 */
function PlattformWahl({ kandidat, wert, onChange, laeuft }: { kandidat: IgdbKandidat; wert: string; onChange: (w: string) => void; laeuft?: boolean }) {
  return (
    <select value={wert} onChange={(e) => onChange(e.target.value)} disabled={laeuft} aria-label={`Plattform für ${kandidat.name}`}>
      {PLATTFORMEN.map((p) => (
        <option key={p} value={p}>
          {p}
          {kandidat.plattformen.includes(p) ? '' : ' (nicht bei IGDB)'}
        </option>
      ))}
      <option value="">ohne Plattform</option>
    </select>
  )
}

export function KandidatenListe({
  kandidaten,
  onWahl,
  laeuft,
  mitPlattform = false,
}: {
  kandidaten: IgdbKandidat[]
  /** Mit `mitPlattform` kommt die gewählte Plattform mit ('' = ohne). */
  onWahl: (k: IgdbKandidat, plattform: string) => void
  laeuft?: boolean
  mitPlattform?: boolean
}) {
  const [wahl, setWahl] = useState<Record<number, string>>({})
  if (kandidaten.length === 0) return null
  const plattformVon = (k: IgdbKandidat) => wahl[k.igdbId] ?? neuestePlattform(k.plattformen)
  return (
    <ul className="kandidaten">
      {kandidaten.map((k) => {
        const link = igdbLink(k.slug)
        return (
          <li key={k.igdbId} className={mitPlattform ? 'kandidat mit-plattform' : 'kandidat'}>
            <span className="kandidat-bild">
              {k.cover ? <img src={k.cover} alt="" loading="lazy" /> : <span aria-hidden="true">?</span>}
            </span>
            <span className="kandidat-text">
              <strong>{k.name}</strong>
              <span className="zeile">
                {k.erscheinungsdatum ? k.erscheinungsdatum.slice(0, 4) : 'Datum unbekannt'}
                {k.typ && ` · ${k.typ}`}
                {k.plattformen.length > 0 && ` · ${k.plattformen.join(', ')}`}
                {k.kritik && ` · Kritik ${k.kritik.wert}`}
              </span>
              {link && (
                <a href={link} target="_blank" rel="noreferrer" className="zeile">
                  bei IGDB ansehen
                </a>
              )}
            </span>
            {mitPlattform && (
              <PlattformWahl kandidat={k} wert={plattformVon(k)} onChange={(w) => setWahl({ ...wahl, [k.igdbId]: w })} laeuft={laeuft} />
            )}
            <button type="button" disabled={laeuft} onClick={() => onWahl(k, plattformVon(k))}>
              Übernehmen
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function IgdbSuche({
  vorgabe,
  plattformen = [],
  onWahl,
  onOhneTreffer,
  laeuft,
  mitPlattform = false,
}: {
  vorgabe: string
  /** Plattformen des Spiels – passende Kandidaten stehen dann vorn. */
  plattformen?: string[]
  onWahl: (k: IgdbKandidat, plattform: string) => void
  /** Dropdown je Treffer (für Wünsche); ohne: Treffer werden ohne Plattform gewählt. */
  mitPlattform?: boolean
  /**
   * Freitext ohne IGDB-Eintrag übernehmen (8.2). Der Knopf erscheint erst,
   * nachdem eine Suche gelaufen ist: kein Fallback, eine Entscheidung.
   */
  onOhneTreffer?: (begriff: string) => void
  laeuft?: boolean
}) {
  const [begriff, setBegriff] = useState(vorgabe)
  const [treffer, setTreffer] = useState<IgdbKandidat[] | null>(null)
  const [sucht, setSucht] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function suchen(ereignis?: React.FormEvent) {
    ereignis?.preventDefault()
    if (begriff.trim() === '') return
    setSucht(true)
    setFehler(null)
    try {
      const a = await anfrage<{ treffer: IgdbKandidat[] }>(
        `/api/igdb/search?q=${encodeURIComponent(begriff.trim())}&plattformen=${encodeURIComponent(plattformen.join(','))}`,
      )
      setTreffer(a.treffer)
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Suche fehlgeschlagen.')
    } finally {
      setSucht(false)
    }
  }

  return (
    <div className="igdb-suche">
      <form onSubmit={suchen} className="suchzeile">
        <input
          type="search"
          value={begriff}
          onChange={(e) => setBegriff(e.target.value)}
          aria-label="Suchbegriff für IGDB"
          placeholder="Titel bei IGDB suchen"
        />
        <button type="submit" disabled={sucht || laeuft || begriff.trim() === ''}>
          {sucht ? 'sucht …' : 'Suchen'}
        </button>
      </form>
      {fehler && <p role="alert">{fehler}</p>}
      {treffer && treffer.length === 0 && <p className="zeile">Nichts gefunden – anderen Begriff versuchen.</p>}
      {treffer && <KandidatenListe kandidaten={treffer} onWahl={onWahl} laeuft={laeuft || sucht} mitPlattform={mitPlattform} />}
      {treffer && onOhneTreffer && begriff.trim() !== '' && (
        <p className="zeile">
          Nicht dabei?{' '}
          <button type="button" className="klein" disabled={laeuft || sucht} onClick={() => onOhneTreffer(begriff.trim())}>
            Ohne IGDB-Eintrag übernehmen: „{begriff.trim()}"
          </button>
        </p>
      )}
    </div>
  )
}

/** Datum oder „unbekannt" – die Darstellungsregel aus Abschnitt 13. */
export const datumOderUnbekannt = (wert: string | null) => (wert ? datum(wert) : 'unbekannt')
