import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiFehler, PLATTFORMEN, anfrage, type IgdbKandidat, type Plattform } from './api'
import { IgdbSuche } from './IgdbSuche'
import { angelegtAus } from './scanner'

/**
 * Spiel von Hand anlegen – für Discs, die nie gestartet wurden und deshalb
 * keine Trophäenliste haben.
 *
 * Seit Stufe 17 in einem Schritt (Rückmeldung des Nutzers vom 18.09.2026):
 * Plattform wählen, Titel suchen, Treffer antippen – das Spiel entsteht mit
 * dem IGDB-Namen, verknüpft, mit Cover und Wertung. Vorher legte man erst an,
 * ging ins Spieldetail und suchte dort. „Ohne IGDB-Eintrag anlegen" bleibt für
 * Fälle, die IGDB nicht kennt (die PlayStation Move Starter Disc etwa); dort
 * gehört danach „Gibt es bei IGDB nicht" im Spieldetail dazu.
 *
 * Bei gleichem Titelschlüssel warnt der Server und nennt Kandidaten; dann ist
 * meist ein weiteres Release gemeint. Kommt der Aufruf aus dem Scanner, wird
 * ein vorhandenes Release angeboten, statt zurück in die Suche zu schicken.
 */

type Kandidat = { spielId: number; titel: string; plattformen: string[] }

/**
 * Was ein Anlegen ergeben hat. `spielNeu` und `releaseNeu` sind das
 * Gedächtnis für ein Rückgängig im Scanner (Nachtrag f1g): Was in diesem Zug
 * entstand, muss es wieder entfernen.
 *
 * Kennt die Sammlung den IGDB-Eintrag schon, antwortet der Server mit
 * `vorhanden` und sagt mit `releaseNeu`, ob er das Release der Plattform eben
 * erst angelegt hat (`angelegtAus` in `scanner.ts`).
 */
export type Angelegt = {
  spielId: number
  releaseId: number
  titel: string
  plattform: Plattform
  spielNeu: boolean
  releaseNeu: boolean
}

type Antwort = { spielId: number; releaseId: number; titel: string; vorhanden?: boolean; releaseNeu?: boolean }

/**
 * Der Schreibweg des Anlegens ohne Oberfläche – geteilt von „Spiel anlegen"
 * (Sammlung) und dem Scanner, der im Fall 3 eigene Treffer zeigt, aber
 * dieselben Wege braucht: anlegen mit oder ohne IGDB, bei gleichem
 * Titelschlüssel die Kandidaten, „Release anhängen", „vorhandenes Release
 * verwenden" und „Trotzdem als neues Spiel anlegen".
 */
export function useAnlegen(onAngelegt: (a: Angelegt) => Promise<void> | void, standardPlattform: Plattform) {
  const [kandidaten, setKandidaten] = useState<Kandidat[]>([])
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  /** Was zuletzt versucht wurde – für „Trotzdem als neues Spiel anlegen". */
  const [versuch, setVersuch] = useState<{ titel?: string; igdbId?: number; plattform: Plattform } | null>(null)

  function leeren() {
    setKandidaten([])
    setMeldung(null)
    setVersuch(null)
  }

  async function fertig(a: Angelegt) {
    setMeldung(
      a.spielNeu || a.releaseNeu
        ? `„${a.titel}" (${a.plattform}) angelegt.`
        : `„${a.titel}" (${a.plattform}) gewählt – war schon in der Sammlung.`,
    )
    setKandidaten([])
    setVersuch(null)
    await onAngelegt(a)
  }

  /**
   * Einziger Schreibweg: mit igdbId verknüpft der Server gleich mit, mit titel
   * nicht. Die Plattform kommt vom Treffer (dort vorbelegt mit seiner
   * neuesten), sonst die Vorgabe.
   */
  async function anlegen(was: { titel?: string; igdbId?: number }, trotzdem = false, gewaehlt?: string) {
    const ziel = (PLATTFORMEN as readonly string[]).includes(gewaehlt ?? '') ? (gewaehlt as Plattform) : standardPlattform
    setLaeuft(true)
    setMeldung(null)
    setVersuch({ ...was, plattform: ziel })
    try {
      const a = await anfrage<Antwort>('/api/games', { methode: 'POST', koerper: { ...was, plattform: ziel, trotzdem } })
      await fertig({
        spielId: a.spielId,
        releaseId: a.releaseId,
        titel: a.titel,
        plattform: ziel,
        ...angelegtAus(a),
      })
    } catch (f) {
      if (f instanceof ApiFehler && f.status === 409 && Array.isArray(f.antwort.kandidaten)) {
        setKandidaten(f.antwort.kandidaten as Kandidat[])
      } else {
        setMeldung(f instanceof Error ? f.message : 'Anlegen fehlgeschlagen.')
      }
    } finally {
      setLaeuft(false)
    }
  }

  async function releaseAnhaengen(k: Kandidat) {
    setLaeuft(true)
    try {
      const ziel = versuch?.plattform ?? standardPlattform
      const a = await anfrage<{ releaseId: number }>('/api/releases', {
        methode: 'POST',
        koerper: { spielId: k.spielId, plattform: ziel },
      })
      await fertig({ spielId: k.spielId, releaseId: a.releaseId, titel: k.titel, plattform: ziel, spielNeu: false, releaseNeu: true })
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Anhängen fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  /** Das vorhandene Release des Kandidaten auf der gewählten Plattform (Scanner). */
  async function vorhandenes(k: Kandidat) {
    setLaeuft(true)
    try {
      const ziel = versuch?.plattform ?? standardPlattform
      const detail = await anfrage<{ releases: Array<{ id: number; plattform: string }> }>(`/api/games/${k.spielId}`)
      const r = detail.releases.find((x) => x.plattform === ziel)
      if (!r) throw new Error('Release nicht gefunden.')
      await fertig({ spielId: k.spielId, releaseId: r.id, titel: k.titel, plattform: ziel, spielNeu: false, releaseNeu: false })
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Auswahl fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  return { kandidaten, meldung, laeuft, versuch, leeren, anlegen, releaseAnhaengen, vorhandenes }
}

export type Anlegen = ReturnType<typeof useAnlegen>

/**
 * Gleicher Titelschlüssel: die vorhandenen Spiele mit „Release anhängen" bzw.
 * „vorhandenes Release verwenden" und „Trotzdem als neues Spiel anlegen".
 */
export function Dubletten({ a, vorhandenesVerwenden, plattform }: { a: Anlegen; vorhandenesVerwenden: boolean; plattform: Plattform }) {
  if (a.kandidaten.length === 0) return null
  const ziel = a.versuch?.plattform ?? plattform
  return (
    <div className="hinweis">
      <p>Ein Spiel mit diesem Titel gibt es schon:</p>
      <ul>
        {a.kandidaten.map((k) => (
          <li key={k.spielId}>
            <Link to={`/spiel/${k.spielId}`}>{k.titel}</Link> ({k.plattformen.join(', ') || 'ohne Release'}){' '}
            {vorhandenesVerwenden && k.plattformen.includes(ziel) ? (
              <button type="button" disabled={a.laeuft} onClick={() => a.vorhandenes(k)}>
                vorhandenes {ziel}-Release verwenden
              </button>
            ) : (
              <button type="button" disabled={a.laeuft || k.plattformen.includes(ziel)} onClick={() => a.releaseAnhaengen(k)}>
                {ziel}-Release anhängen
              </button>
            )}
          </li>
        ))}
      </ul>
      {a.versuch && (
        <button type="button" disabled={a.laeuft} onClick={() => a.anlegen(a.versuch!, true, a.versuch!.plattform)}>
          Trotzdem als neues Spiel anlegen
        </button>
      )}
    </div>
  )
}

export function SpielAnlegen({
  onAngelegt,
  titelVorgabe = '',
  plattformVorgabe = 'PS4',
  vorhandenesVerwenden = false,
  onSchliessen,
  fokus = false,
}: {
  /** Cursor sofort in die Suche - in der Sammlung, wo ein Tipp das Formular öffnet; im Scanner nicht (Nachtrag f1b). */
  fokus?: boolean
  onAngelegt: (releaseId: number, a: Angelegt) => Promise<void> | void
  titelVorgabe?: string
  plattformVorgabe?: Plattform
  /** Bei einem Kandidaten mit der gewählten Plattform dessen Release anbieten (Scanner). */
  vorhandenesVerwenden?: boolean
  /**
   * Von außen gesteuert (Sammlung, Stufe f2c): Der Aufrufer zeigt das
   * Formular nur, solange es offen ist, und schaltet es über ein Zeichen in
   * der Kopfzeile. Es steht dann gleich offen, ohne eigenen Textknopf, und
   * „Abbrechen" ruft diese Funktion. Ohne sie bleibt der Textknopf.
   */
  onSchliessen?: () => void
}) {
  const [offen, setOffen] = useState(onSchliessen !== undefined)
  const [plattform, setPlattform] = useState<Plattform>(plattformVorgabe)
  const a = useAnlegen((x) => onAngelegt(x.releaseId, x), plattform)

  function zuruecksetzen() {
    a.leeren()
    setOffen(false)
    onSchliessen?.()
  }

  if (!offen) {
    return (
      <p>
        <button type="button" onClick={() => { setPlattform(plattformVorgabe); setOffen(true) }}>Spiel anlegen</button>
        {a.meldung && <span role="status"> {a.meldung}</span>}
      </p>
    )
  }

  return (
    <div className="anlegen">
      <p className="steuerung">
        <label>
          Plattform{' '}
          <select value={plattform} onChange={(e) => setPlattform(e.target.value as Plattform)}>
            {PLATTFORMEN.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>{' '}
        <span className="zeile">gilt ohne IGDB-Eintrag; ein Treffer bringt seine eigene mit</span>{' '}
        <button type="button" onClick={zuruecksetzen}>Abbrechen</button>
      </p>

      <IgdbSuche
        vorgabe={titelVorgabe}
        fokus={fokus}
        laeuft={a.laeuft}
        mitPlattform
        onWahl={(k: IgdbKandidat, gewaehlt: string) => { void a.anlegen({ igdbId: k.igdbId }, false, gewaehlt) }}
        onOhneTreffer={(begriff) => { void a.anlegen({ titel: begriff }) }}
        ohneTrefferText="Ohne IGDB-Eintrag anlegen"
      />

      <Dubletten a={a} vorhandenesVerwenden={vorhandenesVerwenden} plattform={plattform} />
      {a.meldung && <p role="status">{a.meldung}</p>}
    </div>
  )
}
