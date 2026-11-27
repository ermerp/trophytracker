/**
 * Der Hinweis am IGDB-Treffer, was schon da ist (Nachtrag f1d): die Sammlung
 * je Plattform mit dem Stärksten (Disc, gekauft, PS Plus, gespielt), dann
 * genau dieser Eintrag als offener Wunsch. Eine Datei ohne Abhängigkeiten,
 * damit ein Test sie erreicht.
 */

type Stand = {
  aufWunschliste?: Array<{ plattform: string | null }>
  inSammlung?: Array<{ plattform: string; art: string }>
}

const plattformKurz = (p: string | null) => (p === 'PSVITA' ? 'Vita' : p)

/** „In der Sammlung: PS4 Disc, PS5 gespielt", „Schon auf der Wunschliste: PS5" – leer, wenn nichts da ist. */
export function standText(k: Stand): string[] {
  const zeilen: string[] = []
  if (k.inSammlung && k.inSammlung.length > 0) {
    zeilen.push(`In der Sammlung: ${k.inSammlung.map((s) => `${plattformKurz(s.plattform)} ${s.art}`).join(', ')}`)
  }
  if (k.aufWunschliste && k.aufWunschliste.length > 0) {
    const p = k.aufWunschliste.map((w) => plattformKurz(w.plattform)).filter(Boolean)
    zeilen.push(p.length > 0 ? `Schon auf der Wunschliste: ${p.join(', ')}` : 'Schon auf der Wunschliste')
  }
  return zeilen
}
