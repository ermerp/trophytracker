import { MUSTER, type Signal } from './scanner'

/**
 * Ton und Vibration als Rückmeldung beim Scannen (Abschnitt 9.1, Nachtrag f1g).
 *
 * Wer ein Regal abscannt, sieht nicht auf den Bildschirm – die Hände sind an
 * den Hüllen. Vier Muster sagen, was geschah, ohne hinzusehen (`MUSTER` in
 * `scanner.ts`, dort auch, welches Ergebnis welches Muster gibt).
 *
 * **Der AudioContext springt auf Android nur nach einer Nutzeraktion an.**
 * Die Kamera startet beim Öffnen der Ansicht von selbst, also ohne Tippen;
 * ein Kontext, der dort entstünde, bliebe stumm. `tonBereit` wird deshalb
 * beim ersten Tippen auf die Seite gerufen und weckt ihn. Wo es keinen
 * Kontext oder keine Vibration gibt, passiert schlicht nichts – nie ein Fehler.
 */

let kontext: AudioContext | null = null

/** Kontext anlegen bzw. wecken – innerhalb einer Nutzeraktion aufrufen. */
export function tonBereit(): void {
  try {
    kontext ??= new AudioContext()
    if (kontext.state === 'suspended') void kontext.resume().catch(() => undefined)
  } catch {
    // Ohne Ton geht es auch.
  }
}

function ton(frequenz: number, dauer: number, verzoegerung: number, form: OscillatorType): void {
  try {
    kontext ??= new AudioContext()
    if (kontext.state === 'suspended') void kontext.resume().catch(() => undefined)
    const start = kontext.currentTime + verzoegerung
    const oszillator = kontext.createOscillator()
    const lautstaerke = kontext.createGain()
    oszillator.type = form
    oszillator.frequency.value = frequenz
    // Weich ein- und ausblenden, sonst knackt es bei jedem Ton.
    lautstaerke.gain.setValueAtTime(0.0001, start)
    lautstaerke.gain.exponentialRampToValueAtTime(0.2, start + 0.01)
    lautstaerke.gain.exponentialRampToValueAtTime(0.0001, start + dauer)
    oszillator.connect(lautstaerke).connect(kontext.destination)
    oszillator.start(start)
    oszillator.stop(start + dauer + 0.02)
  } catch {
    // Ohne Ton geht es auch – die Karte zeigt dasselbe.
  }
}

/** Ton und Vibration eines Signals. Wirft nie. */
export function signalGeben(signal: Signal): void {
  const m = MUSTER[signal]
  for (const t of m.toene) ton(t.hz, t.dauer, t.ab, t.form)
  try {
    navigator.vibrate?.(m.vibration as number | number[])
  } catch {
    // Keine Vibration (Desktop, Firefox ohne Freigabe) – nichts zu tun.
  }
}
