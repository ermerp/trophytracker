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

/**
 * Ein zwölfstelliger UPC-A braucht eine Lesung mehr.
 *
 * Am 18.09.2026 las der Scanner den EAN-13 5026555400404 als UPC-A
 * 089555400404 – die letzten zehn Ziffern stimmen, der linke Teil ist
 * verstümmelt, und die kürzere Zahl hat zufällig eine gültige Prüfziffer.
 * Solche Lesungen entstehen, seit UPC-A überhaupt gefragt wird (Sony-Discs
 * tragen ihn), und sie sind nicht von einem echten UPC-A zu unterscheiden.
 * Deshalb: im selben Bild schlägt ein EAN-13 den UPC-A, und ein UPC-A allein
 * muss sich dreimal zeigen. Für eine echte UPC-A-Hülle sind das 150 ms mehr.
 */
export function noetigeBestaetigungen(format: string | undefined): number {
  return format === 'upc_a' ? 3 : BESTAETIGUNGEN
}

export type Kandidat = { code: string; anzahl: number } | null

/** Eine Lesung verbuchen: gleicher Code zählt hoch, ein anderer beginnt neu. */
export function zaehleLesung(bisher: Kandidat, code: string): Kandidat {
  return bisher?.code === code ? { code, anzahl: bisher.anzahl + 1 } : { code, anzahl: 1 }
}

export function istBestaetigt(kandidat: Kandidat, noetig: number = BESTAETIGUNGEN): boolean {
  return kandidat !== null && kandidat.anzahl >= noetig
}

/** Der Treffer eines Bildes: ein EAN-13 hat Vorrang vor einem UPC-A (siehe oben). */
export function besterTreffer<T extends { rawValue: string; format?: string }>(codes: readonly T[]): T | undefined {
  const brauchbar = codes.filter((c) => /^\d{8,14}$/.test(c.rawValue))
  return brauchbar.find((c) => c.format === 'ean_13') ?? brauchbar[0]
}
