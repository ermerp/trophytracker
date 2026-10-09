import { QUELLEN, QUELLENTEXT, type Quelle } from '../api'
import { useEscape } from './useEscape'

/**
 * Woher der Download kommt – Kauf, PS Plus, Testversion, Sonstiges.
 *
 * **Ohne Vorauswahl.** Das alte Formular hatte ein Auswahlfeld, dessen erster
 * Eintrag „Kauf" war; wer sich durch die Sammlung klickte, legte damit acht
 * falsche Einträge an, alle am Anfang des Alphabets (gemessen am 27.09.2026).
 * Die erste Fassung von Stufe 19c wiederholte den Fehler, indem der Knopf
 * „Digital" stillschweigend `kauf` schrieb. Hier steht jede Quelle als eigener
 * Knopf, und keiner ist der Vorschlag.
 *
 * Schon belegte Quellen fehlen: `UNIQUE (release_id, source)` liesse sie
 * ohnehin nicht zweimal zu.
 */
export function QuellenTafel({
  belegt,
  laeuft,
  schliessen,
  onWaehlen,
}: {
  belegt: readonly Quelle[]
  laeuft: boolean
  schliessen: () => void
  onWaehlen: (q: Quelle) => void
}) {
  useEscape(schliessen)
  const offen = QUELLEN.filter((q) => !belegt.includes(q))
  if (offen.length === 0) return null
  return (
    <div className="wahltafel" role="group" aria-label="Woher kommt der Download?">
      {offen.map((q) => (
        <button key={q} type="button" className="knopf" disabled={laeuft} onClick={() => onWaehlen(q)}>
          {QUELLENTEXT[q]}
        </button>
      ))}
      <p className="still">Was PSN selbst erkennt, steht ohne Zutun hier – von Hand nur, was dort fehlt.</p>
    </div>
  )
}
