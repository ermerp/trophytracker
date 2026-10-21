import { useEffect, useRef, useState } from 'react'
import { Zeichen } from './Symbole'

/**
 * Die Sortierung einer Liste: ein verankertes Menü und ein Richtungspfeil.
 *
 * Bis Stufe 20e war das in jeder der fünf Listen ein natives `<select>` –
 * das einzige Bedienelement der Anwendung, das die Gestaltungslinie aus
 * Stufe 19 nicht mitmacht (Rückmeldung des Nutzers vom 02.10.2026). Hier
 * steht stattdessen dieselbe Tafel wie im Spieldetail (`.menuetafel`), also
 * ein Muster, das es schon gab, statt eines neuen.
 *
 * **Die Richtung ist nicht für jedes Kriterium dasselbe.** „Aufsteigend" ist
 * beim Preis das Erwartete (günstigstes zuerst), bei der Kritikerwertung das
 * Gegenteil (beste zuerst). Jede Liste sagt deshalb je Wert, was ihre
 * natürliche Richtung ist; der Pfeil zeigt die *tatsächliche* Richtung an,
 * nicht „Standard oder umgekehrt". Nur eine Abweichung von der natürlichen
 * Richtung landet in der URL – so bleibt sie sauber.
 */

import type { Richtung } from './vergleich'

// Die Vergleicher stehen seit 20e-b ohne React in `vergleich.ts`, damit ein Test sie erreicht.
export { nachZahl, umgekehrt, type Richtung } from './vergleich'

export type SortierleisteProps<T extends string> = {
  /** Beschriftung je Wert, in Anzeigereihenfolge. */
  texte: Readonly<Record<T, string>>
  /** Was bei diesem Wert die natürliche Reihenfolge ist. */
  natuerlich: Readonly<Record<T, Richtung>>
  wert: T
  richtung: Richtung
  waehlen: (wert: T, richtung: Richtung) => void
}

export function Sortierleiste<T extends string>({ texte, natuerlich, wert, richtung, waehlen }: SortierleisteProps<T>) {
  const [offen, setOffen] = useState(false)
  const anker = useRef<HTMLDivElement>(null)

  // Ein Klick daneben schließt das Menü – wie beim Punktmenü des Spieldetails.
  useEffect(() => {
    if (!offen) return
    const zu = (ev: MouseEvent) => {
      if (!anker.current?.contains(ev.target as Node)) setOffen(false)
    }
    document.addEventListener('mousedown', zu)
    return () => document.removeEventListener('mousedown', zu)
  }, [offen])

  const andere: Richtung = richtung === 'auf' ? 'ab' : 'auf'
  const richtungstext = richtung === 'auf' ? 'aufsteigend' : 'absteigend'

  return (
    <div className="sortierleiste" ref={anker}>
      <button
        type="button"
        className={offen ? 'chip griff offen' : 'chip griff'}
        aria-expanded={offen}
        aria-haspopup="menu"
        onClick={() => setOffen(!offen)}
      >
        {texte[wert]}
        <span className={offen ? 'pfeil auf' : 'pfeil'}>
          <Zeichen name="winkel" groesse={13} strich={2.1} />
        </span>
      </button>

      <button
        type="button"
        className="chip"
        // Der Pfeil allein sagt nicht, was er tut – der Name schon.
        aria-label={`Reihenfolge ${richtungstext}, umschalten auf ${andere === 'auf' ? 'aufsteigend' : 'absteigend'}`}
        title={`${richtungstext} – zum Umkehren klicken`}
        onClick={() => waehlen(wert, andere)}
      >
        <span className={richtung === 'ab' ? 'richtung ab' : 'richtung'}>
          <Zeichen name="hoch" groesse={14} strich={2.1} />
        </span>
      </button>

      {offen && (
        <div className="tafel menuetafel" role="menu">
          <div className="tafelname">Sortieren nach</div>
          {(Object.entries(texte) as [T, string][]).map(([w, text]) => (
            <p key={w} className="menuezeile">
              <button
                type="button"
                className="knopf leiser"
                role="menuitemradio"
                aria-checked={w === wert}
                onClick={() => {
                  setOffen(false)
                  // Ein Wechsel des Kriteriums setzt die Richtung auf die
                  // natürliche zurück: „Titel absteigend" nach „Preis
                  // aufsteigend" wäre selten gemeint.
                  waehlen(w, natuerlich[w])
                }}
              >
                {text}
                {w === wert && <Zeichen name="haken" groesse={14} strich={2.1} />}
              </button>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
