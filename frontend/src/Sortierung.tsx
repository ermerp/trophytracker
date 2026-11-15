import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import { menueOffen, nachMenue, stateNachFilter, stateZumMenue } from './filterverlauf'
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
  const anker = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const navigationsart = useNavigationType()
  const [, setParams] = useSearchParams()
  // Offen ist das Menü, wenn der Verlaufseintrag es trägt – so schließt die
  // Zurück-Geste es von allein (Nachtrag f2b-c, `filterverlauf.ts`).
  const offen = menueOffen(location.state)
  const warOffen = useRef(false)
  // Was nach dem Schließen auf dem Eintrag davor gelten soll.
  const mitnehmen = useRef<string | null>(null)
  // Ein Kriterium ist gewählt: zurück, sobald sein Eintrag steht.
  const zuNachWahl = useRef(false)

  useEffect(() => {
    if (offen && zuNachWahl.current) {
      zuNachWahl.current = false
      mitnehmen.current = location.search
      navigate(-1)
      return
    }
    const uebernehmen = nachMenue(warOffen.current, location.state, navigationsart === 'POP', mitnehmen.current, location.search)
    warOffen.current = offen
    mitnehmen.current = offen ? location.search : null
    if (uebernehmen !== null) setParams(new URLSearchParams(uebernehmen), { replace: true, state: stateNachFilter(location.state) })
    // Nur bei einem Wechsel des Eintrags; der Rest wird dabei frisch gelesen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  function oeffnen() {
    navigate({ pathname: location.pathname, search: location.search }, { state: stateZumMenue(location.state) })
  }

  /** Offen ist das Menü nur in seinem eigenen Eintrag – schließen heißt zurück. */
  function schliessen() {
    mitnehmen.current = location.search
    navigate(-1)
  }

  // Ein Tipp daneben schließt das Menü – und tut sonst nichts. Ginge er
  // durch, liefe sein Ziel (ein Link, „Filter", das Suchfeld) gegen das
  // Zurück, das noch unterwegs ist, und legte einen Eintrag an, den das
  // Zurück gleich wieder wegnimmt. `mousedown` wird nur abgefangen, damit
  // kein Feld den Fokus bekommt.
  useEffect(() => {
    if (!offen) return
    const daneben = (ev: Event) => !anker.current?.contains(ev.target as Node)
    const halten = (ev: MouseEvent) => {
      if (daneben(ev)) ev.preventDefault()
    }
    const zu = (ev: MouseEvent) => {
      if (!daneben(ev)) return
      ev.preventDefault()
      ev.stopPropagation()
      schliessen()
    }
    document.addEventListener('mousedown', halten, true)
    document.addEventListener('click', zu, true)
    return () => {
      document.removeEventListener('mousedown', halten, true)
      document.removeEventListener('click', zu, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen, location.key])

  const andere: Richtung = richtung === 'auf' ? 'ab' : 'auf'
  const richtungstext = richtung === 'auf' ? 'aufsteigend' : 'absteigend'

  return (
    <div className="sortierleiste" ref={anker}>
      <button
        type="button"
        className={offen ? 'chip griff offen' : 'chip griff'}
        aria-expanded={offen}
        aria-haspopup="menu"
        onClick={() => (offen ? schliessen() : oeffnen())}
      >
        {/* Eine eigene Spanne, damit ein zu langer Text auf schmalem Schirm
            mit Auslassungszeichen endet, statt die Filterzeile zu sprengen. */}
        <span className="sortiertext">{texte[wert]}</span>
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
                  // Ein Wechsel des Kriteriums setzt die Richtung auf die
                  // natürliche zurück: „Titel absteigend" nach „Preis
                  // aufsteigend" wäre selten gemeint.
                  if (w === wert && natuerlich[w] === richtung) {
                    schliessen()
                    return
                  }
                  // Die Ansicht ersetzt den Menü-Eintrag (Markierung bleibt),
                  // danach geht das Menü zurück und nimmt die Sortierung mit.
                  zuNachWahl.current = true
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
