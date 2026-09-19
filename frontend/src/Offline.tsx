import { useSyncExternalStore } from 'react'

/**
 * Offline-Hinweis der PWA (Stufe 18, Abschnitt 13).
 *
 * Der Service Worker beantwortet Leseanfragen offline aus dem Cache; die
 * Ansichten sehen dann keinen Unterschied. Dieser Balken sagt, dass der
 * Stand alt sein kann und Schreiben erst wieder online geht - eine
 * Warteschlange fuer Aenderungen gibt es bewusst nicht.
 */

function abonnieren(melden: () => void) {
  window.addEventListener('online', melden)
  window.addEventListener('offline', melden)
  return () => {
    window.removeEventListener('online', melden)
    window.removeEventListener('offline', melden)
  }
}

export function Offline() {
  const online = useSyncExternalStore(abonnieren, () => navigator.onLine, () => true)
  if (online) return null
  return (
    <p className="offline" role="status">
      Offline – du siehst den zuletzt geladenen Stand. Änderungen sind erst wieder online möglich.
    </p>
  )
}
