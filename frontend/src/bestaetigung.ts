/**
 * Zwei übereinstimmende Lesungen, bevor ein Barcode gilt (Abschnitt 9.1).
 *
 * Die Prüfziffer fängt Tippfehler, aber nicht jeden Fehlgriff der Erkennung:
 * Am 17.09.2026 las der Scanner eine Darksiders-Disc als 8005809114554 statt
 * 4005209114554 – zwei Ziffern daneben, beide mit Gewicht 1, die Summe um
 * genau 10 verschoben, die Prüfziffer also unverändert gültig. Ein solcher
 * Fehlgriff hängt am einzelnen Bild (Unschärfe, Winkel) und wiederholt sich
 * fast nie; zwei übereinstimmende Lesungen kosten rund 150 ms und beseitigen
 * ihn. Bilder ohne Code zählen nicht mit – eine kurze Unschärfe zwischen zwei
 * Lesungen darf den Zähler nicht zurücksetzen.
 *
 * Eigenes Modul, weil es Logik ist und ohne Kamera prüfbar sein soll.
 */

export const BESTAETIGUNGEN = 2

export type Kandidat = { code: string; anzahl: number } | null

/** Eine Lesung verbuchen: gleicher Code zählt hoch, ein anderer beginnt neu. */
export function zaehleLesung(bisher: Kandidat, code: string): Kandidat {
  return bisher?.code === code ? { code, anzahl: bisher.anzahl + 1 } : { code, anzahl: 1 }
}

export function istBestaetigt(kandidat: Kandidat): boolean {
  return kandidat !== null && kandidat.anzahl >= BESTAETIGUNGEN
}
