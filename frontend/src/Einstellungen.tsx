import { useCallback, useEffect, useState } from 'react'

/**
 * Einstellungen: NPSSO hinterlegen und Sync auslösen.
 *
 * Der Sync holt pro Aufruf nur wenige Seiten (10-ms-CPU-Grenze). Solange
 * `weiter` zurückkommt, ruft diese Ansicht erneut auf und zeigt den
 * Fortschritt – damit ist die Blätterung auch ohne Cron bedienbar.
 */

type Zugang = {
  eingerichtet: boolean
  status: 'ok' | 'abgelaufen' | 'fehler' | null
  npssoHinterlegtAm: string | null
  refreshLaeuftAbUm: string | null
  letzterErfolgAm: string | null
}

type Lauf = {
  status: string
  ausloeser: 'nutzer' | 'cron'
  gestartetAm: string
  beendetAm: string | null
  titlesSeen: number | null
  offset: number
  meldung: string | null
} | null

/** Seit Stufe 18 auch der juengste Lauf des Cron (Abschnitt 10.1). */
export type StatusAntwort = {
  zugang: Zugang
  letzterLauf: Lauf
  letzterAutomatischerLauf: Lauf
  /** Was die letzten Cron-Aufrufe taten, neueste zuerst (Stufe 18b). */
  cronVerlauf: string[]
  trophaeen: number
  /** Stand der wöchentlichen Kaufliste (Stufe 18e, 7.7). */
  besitz?: { fertigAm: string | null; fehlerAm: string | null; laeuft: boolean }
}

type SyncAntwort = {
  status: 'erfolg' | 'laufend' | 'fehler'
  phase: 'abruf' | 'normalisierung'
  offset: number
  seitenGeholt: number
  titlesSeen: number | null
  offeneSeiten?: number
  vorbelegt?: number
  eingereiht?: number
  eingereihtNachGrund?: { erstimport: number; neueTrophaeen: number; dlcErweitert: number }
  weiter: boolean
  meldung?: string
  /** Fehlversuche an derselben Seite, wenn dieser Aufruf einen hatte (Stufe 18e). */
  fehlversuche?: number
}

/** Was POST /api/sync/besitz zurückgibt (Stufe 18e). */
type BesitzAntwort = {
  status: 'erfolg' | 'fehler'
  geholt: number
  kauf: number
  plus: number
  entfallen: number
  erledigt?: number
  weiter: boolean
  meldung?: string
  fehler?: string
}

/** "3 neu in der Prüfliste (1 zum ersten Mal, 1 weitergespielt, 1 DLC)" - nur, was nicht null ist. */
function eingereihtText(d: SyncAntwort): string {
  if (!d.eingereiht) return ''
  const teile = d.eingereihtNachGrund
    ? [
        [d.eingereihtNachGrund.erstimport, 'zum ersten Mal'],
        [d.eingereihtNachGrund.neueTrophaeen, 'weitergespielt'],
        [d.eingereihtNachGrund.dlcErweitert, 'DLC'],
      ].filter(([n]) => n)
    : []
  const klammer = teile.length > 1 ? ` (${teile.map(([n, t]) => `${n} ${t}`).join(', ')})` : ''
  return ` ${d.eingereiht} neu in der Prüfliste${klammer}.`
}

/** Nur der Tag - fuer Marken, die ohnehin nur ein Datum sind (Stufe 18e). */
const datumNurTag = (wert: string | null) =>
  wert ? new Date(`${wert}T00:00:00Z`).toLocaleDateString('de-DE') : 'noch keiner'

const datum = (wert: string | null) =>
  wert ? new Date(wert.replace(' ', 'T') + (wert.includes('Z') ? '' : 'Z')).toLocaleString('de-DE') : 'unbekannt'

const STATUSTEXT: Record<string, string> = {
  ok: 'in Ordnung',
  abgelaufen: 'abgelaufen – bitte ein neues NPSSO eintragen',
  fehler: 'Fehler beim letzten Versuch',
}

const AUSLOESERTEXT: Record<string, string> = { nutzer: 'von Hand', cron: 'automatisch' }

/** Eine Zeile zu einem Lauf: Status, Ausloeser, Start, Titel, Meldung. */
function laufText(lauf: NonNullable<Lauf>): string {
  return (
    `${lauf.status}, ${AUSLOESERTEXT[lauf.ausloeser] ?? lauf.ausloeser}, gestartet ${datum(lauf.gestartetAm)}` +
    (lauf.titlesSeen !== null ? ` – ${lauf.titlesSeen} Titel` : '') +
    (lauf.meldung ? ` – ${lauf.meldung}` : '')
  )
}

export function Einstellungen() {
  const [status, setStatus] = useState<StatusAntwort | null>(null)
  const [npsso, setNpsso] = useState('')
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [fortschritt, setFortschritt] = useState<string | null>(null)

  const statusLaden = useCallback(async () => {
    const antwort = await fetch('/api/sync/status')
    if (antwort.ok) setStatus((await antwort.json()) as StatusAntwort)
  }, [])

  useEffect(() => {
    void statusLaden()
  }, [statusLaden])

  async function npssoSpeichern(ereignis: React.FormEvent) {
    ereignis.preventDefault()
    setMeldung(null)
    setLaeuft(true)
    try {
      const antwort = await fetch('/api/settings/npsso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ npsso }),
      })
      const daten = (await antwort.json()) as { fehler?: string }
      if (!antwort.ok) {
        setMeldung(daten.fehler ?? 'Das NPSSO konnte nicht gespeichert werden.')
        return
      }
      setNpsso('')
      setMeldung('NPSSO geprüft und gespeichert.')
      await statusLaden()
    } finally {
      setLaeuft(false)
    }
  }

  /**
   * Normalisierung erneut ausführen – ohne PSN-Zugriff.
   * Nützlich, wenn die Abbildung korrigiert wurde: Die Rohdaten liegen schon.
   */
  async function neuNormalisieren() {
    setMeldung(null)
    setLaeuft(true)
    setFortschritt('Normalisierung wird zurückgesetzt …')
    try {
      const antwort = await fetch('/api/sync/normalize', { method: 'POST' })
      const daten = (await antwort.json()) as { fehler?: string; zurueckgesetzt?: number }
      if (!antwort.ok) {
        setMeldung(daten.fehler ?? 'Zurücksetzen fehlgeschlagen.')
        setFortschritt(null)
        return
      }
      await weiterlaufen(`${daten.zurueckgesetzt} Seiten werden neu ausgewertet …`)
    } finally {
      setLaeuft(false)
    }
  }

  /** Ruft POST /api/sync, solange etwas offen ist. */
  async function weiterlaufen(start: string) {
    setFortschritt(start)
    for (let runde = 0; runde < 100; runde++) {
      const antwort = await fetch('/api/sync', { method: 'POST' })
      const daten = (await antwort.json()) as SyncAntwort

      if (daten.status === 'fehler') {
        setMeldung(daten.meldung ?? 'Der Abruf ist fehlgeschlagen.')
        break
      }
      // Ein Fehlversuch beendet den Lauf nicht mehr (Stufe 18e): Er bleibt
      // offen und wird fortgesetzt. Ohne diesen Zweig endete die Schleife
      // stumm, weil `weiter` dann false ist.
      if (daten.meldung) {
        setMeldung(
          `${daten.meldung} Versuch ${daten.fehlversuche ?? 1} von 3 – der Lauf bleibt offen, „Jetzt abrufen" macht weiter.`,
        )
        break
      }
      setFortschritt(
        daten.phase === 'abruf'
          ? `Abruf: ${daten.offset} von ${daten.titlesSeen ?? '?'} Titeln …`
          : daten.weiter
            ? `Auswertung: noch ${daten.offeneSeiten ?? '?'} Seiten …`
            : `Fertig: ${daten.titlesSeen ?? 0} Titel ausgewertet.` +
              (daten.vorbelegt ? ` ${daten.vorbelegt} Status vorbelegt.` : '') +
              eingereihtText(daten),
      )
      if (!daten.weiter) break
    }
    await statusLaden()
  }

  /**
   * Die Kaufliste von Hand holen (Stufe 18e, 7.7).
   *
   * Der Schritt lief bisher nur wöchentlich im Cron, und als er am
   * 23.09.2026 stumm scheiterte, war er von hier aus nicht anzustoßen.
   * Fünfzehn Seiten à 50 Einträge – dieselbe Schleife wie beim Sync.
   */
  async function kauflisteHolen() {
    setMeldung(null)
    setLaeuft(true)
    setFortschritt('Kaufliste wird abgerufen …')
    let kauf = 0
    let plus = 0
    try {
      for (let runde = 0; runde < 40; runde++) {
        const antwort = await fetch('/api/sync/besitz', { method: 'POST' })
        const daten = (await antwort.json()) as BesitzAntwort
        if (daten.status !== 'erfolg') {
          setMeldung(daten.meldung ?? daten.fehler ?? 'Der Abruf der Kaufliste ist fehlgeschlagen.')
          setFortschritt(null)
          break
        }
        kauf += daten.kauf
        plus += daten.plus
        setFortschritt(
          daten.weiter
            ? `Kaufliste: ${kauf} gekauft, ${plus} über PS Plus erkannt …`
            : `Fertig: ${kauf} gekauft, ${plus} über PS Plus, ${daten.entfallen} nicht mehr im Katalog.` +
              (daten.erledigt ? ` ${daten.erledigt} Einträge erledigt.` : ''),
        )
        if (!daten.weiter) break
      }
      await statusLaden()
    } finally {
      setLaeuft(false)
    }
  }

  async function synchronisieren() {
    setMeldung(null)
    setLaeuft(true)
    try {
      await weiterlaufen('Abruf läuft …')
    } finally {
      setLaeuft(false)
    }
  }

  const zugang = status?.zugang

  return (
    <section>
      <h2>PlayStation-Verbindung</h2>

      {zugang && !zugang.eingerichtet && (
        <p>Noch kein NPSSO hinterlegt.</p>
      )}
      {zugang?.eingerichtet && (
        <table>
          <tbody>
            <tr>
              <td>Zustand</td>
              <td>{STATUSTEXT[zugang.status ?? ''] ?? 'unbekannt'}</td>
            </tr>
            <tr>
              <td>NPSSO hinterlegt</td>
              <td>{datum(zugang.npssoHinterlegtAm)}</td>
            </tr>
            <tr>
              <td>Letzter Erfolg</td>
              <td>{datum(zugang.letzterErfolgAm)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <form onSubmit={npssoSpeichern}>
        <label htmlFor="npsso">
          Neues NPSSO – zu finden unter{' '}
          <a href="https://ca.account.sony.com/api/v1/ssocookie" target="_blank" rel="noreferrer">
            ca.account.sony.com/api/v1/ssocookie
          </a>{' '}
          im angemeldeten Browser
        </label>
        <input
          id="npsso"
          type="password"
          autoComplete="off"
          value={npsso}
          onChange={(e) => setNpsso(e.target.value)}
          placeholder="npsso-Wert einfügen"
        />
        <button type="submit" disabled={laeuft || npsso.trim() === ''}>
          Prüfen und speichern
        </button>
      </form>

      <h2>Trophäen abrufen</h2>
      <p>
        Der Abruf legt die Antworten zuerst unverändert ab und wertet sie danach aus.
        {status?.trophaeen ? ` Aktuell ${status.trophaeen} Titel ausgewertet.` : ''}
      </p>
      <button type="button" onClick={synchronisieren} disabled={laeuft || !zugang?.eingerichtet}>
        Jetzt abrufen
      </button>{' '}
      <button type="button" onClick={neuNormalisieren} disabled={laeuft}>
        Nur neu auswerten
      </button>
      <p className="zeile">
        „Nur neu auswerten" nutzt die gespeicherten Rohdaten und spricht PlayStation
        nicht an.
      </p>
      {fortschritt && <p>{fortschritt}</p>}
      {status?.letzterLauf && <p>Letzter Lauf: {laufText(status.letzterLauf)}</p>}

      <h2>Automatik</h2>
      <p>
        Der Worker arbeitet in zwei Fenstern, alle fünf Minuten je ein kleiner Schritt. Zwischen 5 und 8 Uhr
        (03:00–05:59 UTC) alles, was PlayStation anspricht: Trophäen, Spielzeiten und einmal wöchentlich die
        Kaufliste. Zwischen 8 und 10 Uhr (06:00–07:59 UTC) die Wartung – erschienene Titel freigeben,
        IGDB-Metadaten und Disc-Fassungen auffrischen, alte PSN-Rohantworten wegräumen.
      </p>
      <p>
        Eine gescheiterte Seite wird bis zu dreimal erneut geholt, bevor der Lauf aufgegeben wird; danach ist
        die nächste Nacht wieder dran. Bei abgelaufenem NPSSO ruht der Abruf, bis ein neues eingetragen ist.
      </p>

      <p>
        Letzter automatischer Abruf:{' '}
        {status?.letzterAutomatischerLauf ? laufText(status.letzterAutomatischerLauf) : 'noch keiner'}
      </p>
      <h3>Kaufliste</h3>
      <p>
        Letzter vollständiger Durchlauf: {datumNurTag(status?.besitz?.fertigAm ?? null)}
        {status?.besitz?.fehlerAm ? ` – letzter Fehlversuch: ${datumNurTag(status.besitz.fehlerAm)}` : ''}
        {status?.besitz?.laeuft ? ' – ein Durchlauf ist gerade offen.' : ''}
      </p>
      <button type="button" onClick={kauflisteHolen} disabled={laeuft || !zugang?.eingerichtet}>
        Kaufliste jetzt abrufen
      </button>
      <p className="zeile">
        Sonys Kaufliste sagt, was gekauft und was über PS Plus im Katalog ist. Sie läuft sonst einmal
        wöchentlich mit; der Knopf holt sie sofort.
      </p>
      <h3>Letzte Cron-Aufrufe</h3>
      {status && status.cronVerlauf.length === 0 ? (
        <p className="zeile">Noch keiner vermerkt.</p>
      ) : (
        <ul className="cron-verlauf">
          {status?.cronVerlauf.map((zeile) => (
            <li key={zeile}>{zeile}</li>
          ))}
        </ul>
      )}
      <p className="zeile">
        Aufeinanderfolgende Aufrufe derselben Arbeit stehen als eine Zeile da („sync ×5
        offset=100→400"), damit eine ganze Nacht in den Verlauf passt. Bewegt sich die Zahl dabei nicht,
        ist der Schritt hängengeblieben. Zeilen mit einer Meldung werden nie zusammengefasst.
      </p>

      {meldung && <p role="status">{meldung}</p>}
    </section>
  )
}
