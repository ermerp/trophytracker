import { useCallback, useEffect, useRef, useState } from 'react'
import { EREIGNIS_QUELLEN, QUELLETEXT, anfrage, type Ereignis, type EreignisQuelle, type EreignisSeite } from './api'
import { Verlauf } from './Verlauf'

/**
 * Änderungen (Abschnitt 8.5, Stufe 16): alles, was geschrieben wurde,
 * neueste zuerst, nach Quelle filterbar. Nur lesen – korrigiert wird dort,
 * wo die Änderung entstand. Seitenweise über `vor` (Keyset), nicht über
 * OFFSET: Die Tabelle wächst unbegrenzt.
 *
 * Seit Stufe 22 lädt sie kurz vor dem Ende von selbst nach, wie die Sammlung
 * (16-2-endlos-scrollen.md); bis dahin über den Knopf „ältere laden".
 */
export function Aenderungen() {
  const [quelle, setQuelle] = useState<EreignisQuelle | ''>('')
  const [ereignisse, setEreignisse] = useState<Ereignis[]>([])
  const [weiter, setWeiter] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)

  const laden = useCallback(
    async (vor: number | null) => {
      setLaeuft(true)
      try {
        const q = new URLSearchParams({ limit: '50' })
        if (quelle) q.set('quelle', quelle)
        if (vor !== null) q.set('vor', String(vor))
        const seite = await anfrage<EreignisSeite>(`/api/events?${q}`)
        setEreignisse((alt) => (vor === null ? seite.ereignisse : [...alt, ...seite.ereignisse]))
        setWeiter(seite.weiter)
        setMeldung(null)
      } catch (f) {
        setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
      } finally {
        setLaeuft(false)
      }
    },
    [quelle],
  )

  useEffect(() => {
    void laden(null)
  }, [laden])

  // Kurz vor dem Ende nachladen - ein Marker unter dem Verlauf, eine Bildschirmhöhe Vorlauf.
  const marker = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = marker.current
    if (!el || !weiter || laeuft) return
    const beobachter = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) void laden(ereignisse[ereignisse.length - 1]?.id ?? null)
      },
      { rootMargin: '0px 0px 100% 0px' },
    )
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [ereignisse, laden, laeuft, weiter])

  return (
    <>
      <h1>Änderungen</h1>
      <p className="zeile">
        Wer wann was geschrieben hat – du, der PSN-Sync, IGDB oder der Import. Fremddaten und eigene Bewertung bleiben getrennt: Ein Status vom Sync ist eine Vorbelegung, einer von dir eine Entscheidung.
      </p>
      <p className="steuerung">
        <label>
          Quelle{' '}
          <select value={quelle} onChange={(e) => setQuelle(e.target.value as EreignisQuelle | '')}>
            <option value="">alle</option>
            {EREIGNIS_QUELLEN.map((q) => <option key={q} value={q}>{QUELLETEXT[q]}</option>)}
          </select>
        </label>
      </p>
      {meldung && <p role="alert" className="auffaellig">{meldung}</p>}
      {ereignisse.length === 0 && !laeuft ? (
        <p>Noch keine Änderungen protokolliert – der Verlauf beginnt mit Stufe 16.</p>
      ) : (
        <Verlauf ereignisse={ereignisse} mitTitel />
      )}
      <div ref={marker} aria-hidden="true" />
      {ereignisse.length > 0 && (
        <p className="ruhig" role="status">
          {laeuft ? 'lädt …' : weiter ? '' : 'Das sind alle.'}
        </p>
      )}
    </>
  )
}
