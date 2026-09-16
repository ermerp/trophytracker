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
  gestartetAm: string
  beendetAm: string | null
  titlesSeen: number | null
  offset: number
  meldung: string | null
} | null

type StatusAntwort = { zugang: Zugang; letzterLauf: Lauf; trophaeen: number }

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

const datum = (wert: string | null) =>
  wert ? new Date(wert.replace(' ', 'T') + (wert.includes('Z') ? '' : 'Z')).toLocaleString('de-DE') : 'unbekannt'

const STATUSTEXT: Record<string, string> = {
  ok: 'in Ordnung',
  abgelaufen: 'abgelaufen – bitte ein neues NPSSO eintragen',
  fehler: 'Fehler beim letzten Versuch',
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
      {status?.letzterLauf && (
        <p>
          Letzter Lauf: {status.letzterLauf.status}, gestartet {datum(status.letzterLauf.gestartetAm)}
          {status.letzterLauf.titlesSeen !== null && ` – ${status.letzterLauf.titlesSeen} Titel`}
          {status.letzterLauf.meldung && ` – ${status.letzterLauf.meldung}`}
        </p>
      )}

      {meldung && <p role="status">{meldung}</p>}
    </section>
  )
}
