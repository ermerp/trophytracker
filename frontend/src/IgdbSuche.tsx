import { useState } from 'react'
import { anfrage, datum, igdbLink, type IgdbKandidat } from './api'

/**
 * IGDB-Suche und Trefferliste (Abschnitt 7.6).
 *
 * Eine Komponente für drei Stellen: Spieldetail, Prüfansicht und ab Stufe 11
 * den Wunschlisten-Import (8.2, 8.3). Der Suchbegriff ist vorbelegt und
 * korrigierbar – Titel aus Fremdquellen sind abgekürzt oder anders
 * geschrieben, und eine Suche mit anpassbarer Eingabe löst das.
 */

export function KandidatenListe({
  kandidaten,
  onWahl,
  laeuft,
}: {
  kandidaten: IgdbKandidat[]
  onWahl: (k: IgdbKandidat) => void
  laeuft?: boolean
}) {
  if (kandidaten.length === 0) return null
  return (
    <ul className="kandidaten">
      {kandidaten.map((k) => {
        const link = igdbLink(k.slug)
        return (
          <li key={k.igdbId} className="kandidat">
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
            <button type="button" disabled={laeuft} onClick={() => onWahl(k)}>
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
}: {
  vorgabe: string
  /** Plattformen des Spiels – passende Kandidaten stehen dann vorn. */
  plattformen?: string[]
  onWahl: (k: IgdbKandidat) => void
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
      {treffer && <KandidatenListe kandidaten={treffer} onWahl={onWahl} laeuft={laeuft || sucht} />}
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
