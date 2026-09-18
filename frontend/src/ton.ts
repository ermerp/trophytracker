/**
 * Kurze Töne als Rückmeldung beim Sammeln (Abschnitt 9.1).
 *
 * Wer ein Regal abscannt, sieht nicht auf den Bildschirm – die Hände sind an
 * den Hüllen. Ein Ton sagt, ob der Code angekommen ist, ohne hinzusehen.
 * Der AudioContext entsteht erst beim ersten Ton (nach dem Tippen auf
 * „Kamera starten", also innerhalb einer Nutzeraktion); wo es ihn nicht gibt
 * oder er blockiert ist, passiert schlicht nichts.
 */

let kontext: AudioContext | null = null

function ton(frequenz: number, dauer = 0.08, verzoegerung = 0): void {
  try {
    kontext ??= new AudioContext()
    if (kontext.state === 'suspended') void kontext.resume()
    const start = kontext.currentTime + verzoegerung
    const oszillator = kontext.createOscillator()
    const lautstaerke = kontext.createGain()
    oszillator.frequency.value = frequenz
    // Weich ein- und ausblenden, sonst knackt es bei jedem Ton.
    lautstaerke.gain.setValueAtTime(0.0001, start)
    lautstaerke.gain.exponentialRampToValueAtTime(0.2, start + 0.01)
    lautstaerke.gain.exponentialRampToValueAtTime(0.0001, start + dauer)
    oszillator.connect(lautstaerke).connect(kontext.destination)
    oszillator.start(start)
    oszillator.stop(start + dauer + 0.02)
  } catch {
    // Ohne Ton geht es auch – die Liste auf dem Bildschirm zeigt dasselbe.
  }
}

/** Neuer, unbekannter Code: ein heller Ton. */
export const tonNeu = () => ton(1320)

/** Schon zugeordneter Code: zwei tiefere Töne – „kenne ich". */
export const tonBekannt = () => {
  ton(880)
  ton(880, 0.08, 0.12)
}

/** Etwas ging schief: ein tiefer Ton. */
export const tonFehler = () => ton(300, 0.25)
