/**
 * Feste UTC-Zeiten der Automatik in der Ortszeit des Geräts, ohne React –
 * damit ein Test sie erreicht.
 *
 * Bis zum 25.10.2026 standen in den Einstellungen „zwischen 5 und 8 Uhr" und
 * „zwischen 8 und 11 Uhr" als Text – richtig nur in der Sommerzeit. Cron und
 * Actions laufen in UTC und kennen keine Umstellung; die Ortszeit wird deshalb
 * für den heutigen Tag gerechnet, nicht hingeschrieben.
 *
 * `zeitzone` ist nur für den Test da; ohne sie gilt die des Geräts.
 */

function utcHeute(stunde: number, minute: number, heute: Date): Date {
  return new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), heute.getUTCDate(), stunde, minute))
}

/** Die volle Stunde in Ortszeit, ohne führende Null: `ortsstunde(3)` ist im Winter in Berlin „4". */
export function ortsstunde(utcStunde: number, heute = new Date(), zeitzone?: string): string {
  // Nur die Stunde: `format` allein ergibt in de-DE „04 Uhr".
  const teile = new Intl.DateTimeFormat('de-DE', { hour: 'numeric', hourCycle: 'h23', timeZone: zeitzone }).formatToParts(
    utcHeute(utcStunde, 0, heute),
  )
  return String(Number(teile.find((t) => t.type === 'hour')?.value))
}

/** Stunde und Minute in Ortszeit: `ortszeit(20, 17)` ist im Winter in Berlin „21:17". */
export function ortszeit(utcStunde: number, utcMinute: number, heute = new Date(), zeitzone?: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: zeitzone,
  }).format(utcHeute(utcStunde, utcMinute, heute))
}
