import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { anfrage, zeitpunkt, type IgdbStatus } from './api'

/**
 * IGDB in den Einstellungen (Abschnitt 7.6): Zustand, Abgleich, Auffrischen.
 *
 * Der Abgleich sucht je Aufruf für acht Spiele (10-ms-CPU-Grenze, vier
 * IGDB-Anfragen je Sekunde). Solange `weiter` zurückkommt, ruft diese
 * Ansicht erneut auf – wie beim Trophäen-Sync.
 */

type AbgleichAntwort = {
  status: 'erfolg' | 'laufend' | 'fehler'
  geprueft: number
  verknuepft: number
  vorgeschlagen: number
  ohneTreffer: number
  nochOffen: number
  weiter: boolean
  meldung?: string
}

type AuffrischAntwort = { status: 'erfolg' | 'fehler'; angefragt: number; aktualisiert: number; meldung?: string }
type PhysischAntwort = { status: 'erfolg' | 'fehler'; angefragt: number; gesetzt: number; nochOffen: number; weiter: boolean; meldung?: string }

export function Igdb() {
  const [status, setStatus] = useState<IgdbStatus | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [fortschritt, setFortschritt] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)

  const statusLaden = useCallback(async () => {
    try {
      setStatus(await anfrage<IgdbStatus>('/api/igdb/status'))
    } catch {
      /* Anzeige bleibt leer */
    }
  }, [])

  useEffect(() => {
    void statusLaden()
  }, [statusLaden])

  async function abgleichen() {
    setLaeuft(true)
    setMeldung(null)
    const summe = { verknuepft: 0, vorgeschlagen: 0, ohneTreffer: 0 }
    try {
      for (let runde = 0; runde < 200; runde++) {
        const a = await anfrage<AbgleichAntwort>('/api/igdb/abgleich', { methode: 'POST' })
        summe.verknuepft += a.verknuepft
        summe.vorgeschlagen += a.vorgeschlagen
        summe.ohneTreffer += a.ohneTreffer
        setFortschritt(`Noch ${a.nochOffen} Spiele … (${summe.verknuepft} verknüpft, ${summe.vorgeschlagen} zur Prüfung)`)
        if (a.status === 'fehler') {
          setMeldung(a.meldung ?? 'Der Abgleich ist fehlgeschlagen.')
          break
        }
        if (!a.weiter) {
          setFortschritt(
            `Fertig: ${summe.verknuepft} verknüpft, ${summe.vorgeschlagen} zur Prüfung, ${summe.ohneTreffer} ohne Treffer.`,
          )
          break
        }
        // Beim Ratenlimit einen Moment Luft lassen.
        if (a.meldung) await new Promise((r) => setTimeout(r, 1500))
      }
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Der Abgleich ist fehlgeschlagen.')
    } finally {
      setLaeuft(false)
      await statusLaden()
    }
  }

  /** Offene Spiele zurueck in die Suche - etwa nach einer verbesserten Regel. */
  async function erneutSuchen() {
    if (!status || !confirm(`${status.zurPruefung} Spiele zur Prüfung erneut bei IGDB suchen? Verknüpfungen und Ablehnungen bleiben.`)) return
    setLaeuft(true)
    setMeldung(null)
    try {
      const a = await anfrage<{ zurueckgesetzt: number }>('/api/igdb/erneut-suchen', { methode: 'POST' })
      setFortschritt(`${a.zurueckgesetzt} Spiele zurückgesetzt.`)
      await statusLaden()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Zurücksetzen fehlgeschlagen.')
      setLaeuft(false)
      return
    }
    setLaeuft(false)
    await abgleichen()
  }

  async function auffrischen() {
    setLaeuft(true)
    setMeldung(null)
    try {
      const a = await anfrage<AuffrischAntwort>('/api/igdb/auffrischen', { methode: 'POST' })
      setFortschritt(`${a.aktualisiert} von ${a.angefragt} Spielen aufgefrischt.`)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Auffrischen fehlgeschlagen.')
    } finally {
      setLaeuft(false)
      await statusLaden()
    }
  }

  /**
   * Disc-Fassung aus IGDB (7.6, Stufe 14): 50 Spiele je Aufruf, solange
   * `weiter` gilt. Setzt nur `unbekannt` → `ja`; ein `nein` bleibt.
   */
  async function discPruefen() {
    setLaeuft(true)
    setMeldung(null)
    let gesetzt = 0
    try {
      for (let runde = 0; runde < 100; runde++) {
        const a = await anfrage<PhysischAntwort>('/api/igdb/physisch', { methode: 'POST' })
        gesetzt += a.gesetzt
        setFortschritt(`Noch ${a.nochOffen} Spiele … (${gesetzt} Disc-Fassungen belegt)`)
        if (a.status === 'fehler') {
          setMeldung(a.meldung ?? 'Die Prüfung ist fehlgeschlagen.')
          break
        }
        if (!a.weiter) {
          setFortschritt(`Disc-Fassungen geprüft: ${gesetzt} Releases neu als „ja" belegt.`)
          break
        }
      }
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Prüfung fehlgeschlagen.')
    } finally {
      setLaeuft(false)
      await statusLaden()
    }
  }

  return (
    <section>
      <h2>IGDB</h2>
      <p className="zeile">
        Cover, Kritikerwertung und Erscheinungsdatum kommen von IGDB. Automatisch verknüpft wird
        nur ein eindeutiger Treffer; alles andere wartet in der{' '}
        <Link to="/igdb">IGDB-Zuordnung</Link>.
      </p>

      {status && !status.zugangsdaten && (
        <p className="hinweis">
          Keine IGDB-Zugangsdaten hinterlegt. Die Secrets <code>IGDB_CLIENT_ID</code> und{' '}
          <code>IGDB_CLIENT_SECRET</code> fehlen – siehe README.
        </p>
      )}

      {status && (
        <table>
          <tbody>
            <tr><td>Verknüpft</td><td>{status.verknuepft} von {status.gesamt}</td></tr>
            <tr><td>Zur Prüfung</td><td>{status.zurPruefung > 0 ? <Link to="/igdb">{status.zurPruefung}</Link> : 0}</td></tr>
            <tr><td>Noch nicht gesucht</td><td>{status.ungeprueft}</td></tr>
            <tr><td>Kein IGDB-Eintrag</td><td>{status.abgelehnt}</td></tr>
            <tr><td>Letzte Aktualisierung</td><td>{status.letzteAktualisierung ? zeitpunkt(status.letzteAktualisierung) : 'noch nie'}</td></tr>
            <tr><td>Disc-Fassung aus IGDB</td><td>{status.discBelegt} Releases belegt, {status.discOffen} Spiele zu prüfen</td></tr>
          </tbody>
        </table>
      )}

      <button type="button" onClick={abgleichen} disabled={laeuft || !status?.zugangsdaten || status.ungeprueft === 0}>
        Abgleich starten
      </button>{' '}
      <button type="button" onClick={auffrischen} disabled={laeuft || !status?.zugangsdaten || status.verknuepft === 0}>
        Metadaten auffrischen
      </button>{' '}
      <button type="button" onClick={erneutSuchen} disabled={laeuft || !status?.zugangsdaten || status.zurPruefung === 0}>
        Offene erneut suchen
      </button>{' '}
      <button type="button" onClick={discPruefen} disabled={laeuft || !status?.zugangsdaten || status.discOffen === 0}>
        Disc-Fassungen prüfen
      </button>
      <p className="zeile">
        „Auffrischen" holt Wertung, Cover und Datum für die 50 am längsten nicht aktualisierten
        Spiele erneut. „Offene erneut suchen" wiederholt die Suche für alle Spiele zur Prüfung –
        sinnvoll, wenn die Suchregel besser geworden ist. „Disc-Fassungen prüfen" fragt IGDBs
        Händlereinträge ab und setzt „Disc-Fassung: ja", wo ein physischer Eintrag zur Plattform
        existiert – nie „nein", das bleibt deine Entscheidung; geprüfte Spiele kommen nach 30 Tagen
        wieder dran. Ergebnis: <Link to="/luecken">Lücken</Link>.
      </p>
      {fortschritt && <p>{fortschritt}</p>}
      {meldung && <p role="alert">{meldung}</p>}
    </section>
  )
}
