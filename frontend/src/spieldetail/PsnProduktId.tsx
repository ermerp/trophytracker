import { useState } from 'react'
import type { Release } from './typen'

/**
 * Die Store-Zuordnung eines Releases (Stufe 21, Feld seit 21d toleranter).
 *
 * Gebraucht wird sie, wenn IGDB den PlayStation-Store-Eintrag nicht kennt –
 * gemessen am 03.10.2026 bei 9 von 79 Releases. Eingefügt wird die aus dem
 * Browser kopierte Adresse; eine Produktseite gilt für dieses Release, eine
 * Concept-Seite für beide Plattformen des Spiels.
 */
export function PsnProduktId({
  release: r,
  laeuft,
  onSpeichern,
}: {
  release: Release
  laeuft: boolean
  onSpeichern: (wert: string | null) => void
}) {
  const [wert, setWert] = useState(r.psnProductId ?? '')
  const geaendert = wert.trim() !== (r.psnProductId ?? '')
  return (
    <p className="menuezeile">
      <label>
        <span className="nur-vorlesen">Store-Adresse oder Produkt-Id</span>
        <input
          type="text"
          value={wert}
          placeholder="Store-Adresse einfügen"
          disabled={laeuft}
          onChange={(e) => setWert(e.target.value)}
        />
      </label>
      {geaendert && (
        <button type="button" className="knopf" disabled={laeuft} onClick={() => onSpeichern(wert.trim() === '' ? null : wert.trim())}>
          speichern
        </button>
      )}
    </p>
  )
}
