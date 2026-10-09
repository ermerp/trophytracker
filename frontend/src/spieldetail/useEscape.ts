import { useEffect } from 'react'

/** Escape schliesst jede Tafel – dieselbe Regel wie bei der Glocke (Stufe 19a). */
export function useEscape(schliessen: () => void) {
  useEffect(() => {
    function taste(e: KeyboardEvent) {
      if (e.key === 'Escape') schliessen()
    }
    document.addEventListener('keydown', taste)
    return () => document.removeEventListener('keydown', taste)
  }, [schliessen])
}
