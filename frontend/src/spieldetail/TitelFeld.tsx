import { useRef, useState } from 'react'
import { Zeichen } from '../Symbole'

/**
 * Der Titel als Überschrift, mit einem Stift daneben.
 *
 * Bis Stufe 19c stand hier ein dauerhaft offenes `<input>`, das bei 390 px
 * über den rechten Rand lief – „Nebelwacht: Zweite…" war abgeschnitten
 * (gesehen im Bild vom 27.09.2026). Eine Überschrift bricht um, und das
 * Umbenennen wird eine bewusste Handlung statt eines Formulars, das immer
 * offensteht (Entscheidung des Nutzers vom 27.09.2026).
 */
export function TitelFeld({ titel, laeuft, onSpeichern }: { titel: string; laeuft: boolean; onSpeichern: (t: string) => void }) {
  const [offen, setOffen] = useState(false)
  const feld = useRef<HTMLInputElement>(null)

  if (!offen) {
    return (
      <h1 className="spieltitel">
        {titel}
        <button type="button" className="stift" aria-label="Titel ändern" disabled={laeuft} onClick={() => setOffen(true)}>
          <Zeichen name="stift" groesse={16} />
        </button>
      </h1>
    )
  }
  return (
    <form
      className="titelform"
      onSubmit={(e) => {
        e.preventDefault()
        const t = feld.current?.value.trim()
        if (t) onSpeichern(t)
        setOffen(false)
      }}
    >
      <label htmlFor="spieltitel" className="nur-vorlesen">Titel</label>
      <input id="spieltitel" ref={feld} type="text" defaultValue={titel} autoFocus onKeyDown={(e) => e.key === 'Escape' && setOffen(false)} />
      <button type="submit" className="knopf" disabled={laeuft}>Speichern</button>
      <button type="button" className="knopf leiser" onClick={() => setOffen(false)}>Abbrechen</button>
    </form>
  )
}
