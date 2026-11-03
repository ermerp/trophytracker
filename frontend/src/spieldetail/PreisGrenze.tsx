import { useEffect, useState } from 'react'
import { anfrage, euro } from '../api'
import { centsAlsEingabe, euroInCents } from '../preisalarm'
import type { Release } from './typen'

/**
 * „Preisalarm unter … €" (Stufe 20g) – die Grenze am Release.
 *
 * Steht nur bei offenem Wunsch oder Kauf (`preisalarm` kommt sonst als null)
 * und ist **leer, nie vorbelegt** (Abschnitt 3): Eine globale Vorbelegung
 * löste sofort Meldungen aus. Gespeichert wird beim Verlassen des Feldes oder
 * mit Enter; ein leeres Feld nimmt die Grenze zurück (`null`, nicht 0).
 *
 * Darunter steht, für welchen Kanal die Grenze gerade gilt – der wechselt
 * von selbst, wenn eBay später doch eine Disc findet –, und ob der Preis
 * schon darunter liegt: Dann meldet der nächste Abendlauf (Entscheidung des
 * Nutzers vom 30.10.2026).
 */
export function PreisGrenze({
  release: r,
  laeuft,
  tue,
}: {
  release: Release
  laeuft: boolean
  tue: (aktion: () => Promise<unknown>, erfolg?: string) => Promise<void>
}) {
  const alarm = r.preisalarm
  const gespeichert = alarm?.grenzeCents ?? null
  const [text, setText] = useState(centsAlsEingabe(gespeichert))
  const [falsch, setFalsch] = useState(false)

  // Nach dem Neuladen folgt das Feld dem gespeicherten Wert.
  useEffect(() => setText(centsAlsEingabe(gespeichert)), [gespeichert])

  if (!alarm) return null

  const speichern = () => {
    const cents = euroInCents(text)
    if (cents === undefined) {
      setFalsch(true)
      return
    }
    setFalsch(false)
    if (cents === gespeichert) return
    void tue(
      () => anfrage(`/api/releases/${r.id}`, { methode: 'PATCH', koerper: { preisGrenzeCents: cents } }),
      cents === null ? 'Preisalarm entfernt.' : `Preisalarm unter ${euro(cents)}.`,
    )
  }

  const kanal = alarm.kanal === 'gebraucht' ? 'den Gebrauchtpreis' : 'den Store-Preis'
  const darunter = gespeichert !== null && alarm.aktuellCents !== null && alarm.aktuellCents < gespeichert

  return (
    <div className="preisgrenze">
      <label>
        Preisalarm unter{' '}
        <input
          inputMode="decimal"
          autoComplete="off"
          value={text}
          disabled={laeuft}
          aria-invalid={falsch}
          className={falsch ? 'auffaellig' : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={speichern}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />{' '}
        €
      </label>
      <p className="ruhig klein">
        {falsch
          ? 'Ein Betrag in Euro, etwa 12,50 – oder leer für keine Grenze.'
          : gespeichert === null
            ? `Leer heißt: nur Allzeittiefs melden. Gilt für ${kanal}.`
            : darunter
              ? `Liegt schon darunter (${euro(alarm.aktuellCents)}) – der nächste Abendlauf meldet. Gilt für ${kanal}.`
              : `Gilt für ${kanal}.`}
      </p>
    </div>
  )
}
