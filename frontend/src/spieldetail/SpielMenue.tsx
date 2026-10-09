import { KRITIKQUELLE, zeitpunkt, type Plattform } from '../api'
import { datumOderUnbekannt } from '../IgdbSuche'
import type { Spiel } from './typen'
import { useEscape } from './useEscape'

/** Das Punktmenü der Kopfzeile: neues Release, IGDB, Spiel löschen. */
export function SpielMenue({
  spiel,
  laeuft,
  freiePlattformen,
  schliessen,
  onRelease,
  onSuche,
  sucheOffen,
  onLoesen,
  onAblehnen,
  onDochSuchen,
  onSpielLoeschen,
}: {
  spiel: Spiel
  laeuft: boolean
  freiePlattformen: readonly Plattform[]
  schliessen: () => void
  onRelease: (p: Plattform) => void
  onSuche: () => void
  sucheOffen: boolean
  onLoesen: () => void
  onAblehnen: () => void
  onDochSuchen: () => void
  onSpielLoeschen: () => void
}) {
  useEscape(schliessen)
  return (
    <div className="tafel menuetafel kopfmenue" role="menu">
      <div className="tafelname">IGDB</div>
      {spiel.igdb.id !== null ? (
        <>
          <p className="menuezeile">
            <span className="still">
              {spiel.igdb.quelle === 'automatisch' ? 'automatisch' : 'von Hand'} verknüpft
              {spiel.igdb.verknuepftAm && ` · ${zeitpunkt(spiel.igdb.verknuepftAm)}`}
            </span>
          </p>
          {spiel.kritik && (
            <p className="menuezeile">
              <span className="still">
                {spiel.kritik.wert} von 100 · {spiel.kritik.anzahl ?? '?'} Wertungen ·{' '}
                {KRITIKQUELLE[spiel.kritik.quelle ?? ''] ?? 'Quelle unbekannt'}
              </span>
            </p>
          )}
          <p className="menuezeile">
            <span className="still">erschienen {datumOderUnbekannt(spiel.erscheinungsdatum)}</span>
          </p>
          <p className="menuezeile knopfzeile">
            <button type="button" className="knopf" disabled={laeuft} onClick={() => { schliessen(); onSuche() }}>
              {sucheOffen ? 'Suche schließen' : 'Anderen Eintrag wählen'}
            </button>
            <button type="button" className="knopf leiser" disabled={laeuft} onClick={() => { schliessen(); onLoesen() }}>
              Verknüpfung lösen
            </button>
          </p>
        </>
      ) : spiel.igdb.abgelehntAm ? (
        <p className="menuezeile">
          <button type="button" className="knopf" disabled={laeuft} onClick={() => { schliessen(); onDochSuchen() }}>
            Doch suchen
          </button>
        </p>
      ) : (
        <p className="menuezeile knopfzeile">
          <button type="button" className="knopf" disabled={laeuft} onClick={() => { schliessen(); onSuche() }}>
            {sucheOffen ? 'Suche schließen' : 'Bei IGDB suchen'}
          </button>
          <button type="button" className="knopf leiser" disabled={laeuft} onClick={() => { schliessen(); onAblehnen() }}>
            Gibt es bei IGDB nicht
          </button>
        </p>
      )}

      {freiePlattformen.length > 0 && (
        <>
          <div className="tafelname">Release hinzufügen</div>
          <p className="menuezeile knopfzeile">
            {freiePlattformen.map((p) => (
              <button
                key={p}
                type="button"
                className="knopf"
                disabled={laeuft}
                onClick={() => { schliessen(); onRelease(p) }}
              >
                + {p === 'PSVITA' ? 'Vita' : p}
              </button>
            ))}
          </p>
        </>
      )}

      <div className="tafelname gefahr">Gefährlich</div>
      <p className="menuezeile">
        <button type="button" className="knopf gefahr" disabled={laeuft} onClick={() => { schliessen(); onSpielLoeschen() }}>
          Spiel löschen
        </button>
      </p>
    </div>
  )
}
