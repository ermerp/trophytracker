/**
 * Der Klick nach dem Ziehen (Nachtrag f1e, Rückmeldung des Nutzers vom
 * 27.11.2026: „wenn ich in der To-Do-Liste auf ein Spiel klicke und es nach
 * oben verschiebe, öffnet es sich danach").
 *
 * Die ganze Karte ist Anfasser, Titel und Cover sind Links. Endet ein Ziehen
 * mit der Maus über der Karte, schickt der Browser danach einen `click`.
 * `@dnd-kit/core` 6.3.1 fängt ihn im Capture am Dokument ab, ruft aber nur
 * `stopPropagation` – React Router sieht ihn dann nicht und ruft kein
 * `preventDefault`, und der Browser folgt dem `href` selbst: Die Seite lädt
 * das Spiel neu (belegt mit der Maus im headless Chrome, 27.11.2026).
 *
 * Deshalb hängt sich nach dem Ziehen ein Abfänger **am Fenster** ein – das
 * liegt über dem Dokument, sein Capture läuft vor dem von dnd-kit – und
 * schluckt genau den nächsten Klick, wenn er binnen `ms` kommt. Ein Tipp ohne
 * Ziehen löst nie ein Ziehen aus und bleibt damit der Link.
 */

/** Wie lange nach dem Loslassen ein Klick noch zum Ziehen gehört. */
export const ZIEHKLICK_MS = 500

/**
 * Schluckt den nächsten `click` auf `ziel` (Capture), sofern er binnen `ms`
 * kommt; danach ist der Abfänger weg. Gibt eine Funktion zum vorzeitigen
 * Entfernen zurück.
 */
export function naechstenKlickSchlucken(ziel: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, ms: number = ZIEHKLICK_MS): () => void {
  let weg = false
  const abfangen = (ev: Event) => {
    ev.preventDefault()
    ev.stopPropagation()
    entfernen()
  }
  const uhr = setTimeout(() => entfernen(), ms)
  function entfernen() {
    if (weg) return
    weg = true
    clearTimeout(uhr)
    ziel.removeEventListener('click', abfangen, true)
  }
  ziel.addEventListener('click', abfangen, true)
  return entfernen
}
