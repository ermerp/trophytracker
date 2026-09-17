import { useCallback, useEffect, useRef, useState } from 'react'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

/**
 * Kamera und Barcode-Erkennung für den Scanner (Abschnitt 9.1, Stufe 17).
 *
 * Ein Codepfad über die Standard-API `BarcodeDetector`: Chrome auf Android
 * bringt sie mit; Firefox und Desktop-Chrome nicht – dort kommt der Ponyfill
 * `barcode-detector` (ZXing als WebAssembly) zum Zug, und zwar erst dann
 * (dynamischer Import), damit das Handy das WASM nie lädt. Die WASM-Datei
 * liefert der eigene Worker aus (`?url`-Import), nicht ein CDN – wichtig
 * für die PWA in Stufe 18 und dafür, dass der Scanner nicht an einer
 * fremden Adresse hängt.
 *
 * Nur EAN-13. Nach einem erkannten Code pausiert die Erkennung, bis der
 * Aufrufer sie weiterlaufen lässt (Serienerfassung: das Bild bleibt, die
 * Auflösung erscheint darunter). Der zuletzt behandelte Code (`ignoriere`)
 * löst nicht erneut aus, bis ein anderer kam – sonst ersetzt die Disc, die
 * noch vor der Kamera liegt, ihre eigene „erfasst"-Karte samt Rückgängig
 * durch einen Treffer oder zählt nach „Später" gleich wieder hoch. Dazu
 * eine Sperre von zwei Sekunden für Aufrufer ohne `ignoriere`.
 */

type Erkenner = { detect(bild: HTMLVideoElement): Promise<Array<{ rawValue: string }>> }

type NativerDetector = {
  new (optionen: { formats: string[] }): Erkenner
  getSupportedFormats(): Promise<string[]>
}

async function erkenner(): Promise<{ erkenner: Erkenner; nativ: boolean }> {
  const nativ = (globalThis as { BarcodeDetector?: NativerDetector }).BarcodeDetector
  if (nativ && (await nativ.getSupportedFormats().catch(() => [] as string[])).includes('ean_13')) {
    return { erkenner: new nativ({ formats: ['ean_13'] }), nativ: true }
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill')
  prepareZXingModule({ overrides: { locateFile: () => wasmUrl } })
  return { erkenner: new BarcodeDetector({ formats: ['ean_13'] }), nativ: false }
}

export type KameraStatus = 'aus' | 'startet' | 'laeuft' | 'fehler'

const TAKT_MS = 150
const SPERRE_MS = 2000

/**
 * `onCode` liefert, ob der Code angenommen wurde; bei `false` (etwa der
 * Worker antwortet mit einem Fehler) läuft die Erkennung sofort weiter.
 */
export function useKamera(onCode: (code: string) => Promise<boolean> | boolean, ignoriere: string | null = null) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const erkennerRef = useRef<Erkenner | null>(null)
  const pausiertRef = useRef(false)
  const letzterRef = useRef<{ code: string; zeit: number } | null>(null)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode
  const ignoriereRef = useRef(ignoriere)
  ignoriereRef.current = ignoriere

  const [status, setStatus] = useState<KameraStatus>('aus')
  const [fehler, setFehler] = useState<string | null>(null)
  const [nativ, setNativ] = useState<boolean | null>(null)
  const [geraete, setGeraete] = useState<MediaDeviceInfo[]>([])
  const [geraet, setGeraet] = useState<string | null>(null)
  const [pausiert, setPausiertState] = useState(false)

  const setPausiert = useCallback((wert: boolean) => {
    pausiertRef.current = wert
    setPausiertState(wert)
    if (!wert) letzterRef.current = { code: letzterRef.current?.code ?? '', zeit: Date.now() }
  }, [])

  const stoppen = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('aus')
  }, [])

  const starten = useCallback(
    async (deviceId: string | null = geraet) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setFehler(
          window.isSecureContext
            ? 'Dieser Browser bietet keinen Kamerazugriff.'
            : 'Kamerazugriff braucht HTTPS (oder localhost).',
        )
        setStatus('fehler')
        return
      }
      stoppen()
      setFehler(null)
      setStatus('startet')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        if (!erkennerRef.current) {
          const e = await erkenner()
          erkennerRef.current = e.erkenner
          setNativ(e.nativ)
        }
        const alle = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[])
        setGeraete(alle.filter((d) => d.kind === 'videoinput'))
        setGeraet(deviceId ?? stream.getVideoTracks()[0]?.getSettings().deviceId ?? null)
        setStatus('laeuft')
      } catch (f) {
        stoppen()
        const name = f instanceof DOMException ? f.name : ''
        setFehler(
          name === 'NotAllowedError'
            ? 'Kamerazugriff wurde abgelehnt. In den Browser-Einstellungen freigeben oder die EAN eintippen.'
            : name === 'NotFoundError'
              ? 'Keine Kamera gefunden. Die EAN lässt sich eintippen.'
              : f instanceof Error
                ? f.message
                : 'Kamera konnte nicht gestartet werden.',
        )
        setStatus('fehler')
      }
    },
    [geraet, stoppen],
  )

  /** Nächste Kamera in der Liste (Laptop mit externer Webcam, Handy vorn/hinten). */
  const wechseln = useCallback(() => {
    if (geraete.length < 2) return
    const i = geraete.findIndex((d) => d.deviceId === geraet)
    void starten(geraete[(i + 1) % geraete.length].deviceId)
  }, [geraete, geraet, starten])

  // Erkennungsschleife: läuft, solange die Kamera läuft und nicht pausiert ist.
  useEffect(() => {
    if (status !== 'laeuft') return
    let beschaeftigt = false
    const takt = setInterval(async () => {
      const video = videoRef.current
      const e = erkennerRef.current
      if (!video || !e || beschaeftigt || pausiertRef.current || video.readyState < 2) return
      beschaeftigt = true
      try {
        const codes = await e.detect(video)
        const code = codes.find((c) => /^\d{13}$/.test(c.rawValue))?.rawValue
        if (code && !pausiertRef.current && code !== ignoriereRef.current) {
          const letzter = letzterRef.current
          if (!letzter || letzter.code !== code || Date.now() - letzter.zeit > SPERRE_MS) {
            letzterRef.current = { code, zeit: Date.now() }
            pausiertRef.current = true
            setPausiertState(true)
            if (!(await onCodeRef.current(code))) {
              pausiertRef.current = false
              setPausiertState(false)
            }
          }
        }
      } catch {
        // Ein einzelnes Bild kann fehlschlagen (z. B. beim Umschalten); der nächste Takt versucht es erneut.
      } finally {
        beschaeftigt = false
      }
    }, TAKT_MS)
    return () => clearInterval(takt)
  }, [status])

  // Beim Verlassen der Ansicht die Kamera freigeben.
  useEffect(() => stoppen, [stoppen])

  return { videoRef, status, fehler, nativ, geraete, starten, stoppen, wechseln, pausiert, setPausiert }
}
