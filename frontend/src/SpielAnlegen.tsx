import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiFehler, PLATTFORMEN, anfrage, type IgdbKandidat, type Plattform } from './api'
import { IgdbSuche } from './IgdbSuche'

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

type Angelegt = { spielId: number; releaseId: number; titel: string; vorhanden?: boolean }

export function SpielAnlegen({
  onAngelegt,
  titelVorgabe = '',
  plattformVorgabe = 'PS4',
  vorhandenesVerwenden = false,
}: {
  onAngelegt: (releaseId: number) => Promise<void> | void
  titelVorgabe?: string
  plattformVorgabe?: Plattform
  /** Bei einem Kandidaten mit der gewählten Plattform dessen Release anbieten (Scanner). */
  vorhandenesVerwenden?: boolean
}) {
  const [offen, setOffen] = useState(false)
  const [plattform, setPlattform] = useState<Plattform>(plattformVorgabe)
  const [kandidaten, setKandidaten] = useState<Kandidat[]>([])
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  /** Was zuletzt versucht wurde – für „Trotzdem als neues Spiel anlegen". */
  const [versuch, setVersuch] = useState<{ titel?: string; igdbId?: number; plattform: Plattform } | null>(null)

  function zuruecksetzen() {
    setKandidaten([])
    setMeldung(null)
    setVersuch(null)
    setOffen(false)
  }

  async function fertig(a: Angelegt, ziel: Plattform = plattform) {
    setMeldung(
      a.vorhanden
        ? `„${a.titel}" (${ziel}) gewählt – war schon in der Sammlung.`
        : `„${a.titel}" (${ziel}) angelegt.`,
    )
    setKandidaten([])
    setVersuch(null)
    await onAngelegt(a.releaseId)
  }

  /**
   * Einziger Schreibweg: mit igdbId verknüpft der Server gleich mit, mit titel
   * nicht. Die Plattform kommt vom Treffer (dort vorbelegt mit seiner
   * neuesten), sonst aus dem Dropdown oben.
   */
  async function anlegen(was: { titel?: string; igdbId?: number }, trotzdem = false, gewaehlt?: string) {
    const ziel = (PLATTFORMEN as readonly string[]).includes(gewaehlt ?? '') ? (gewaehlt as Plattform) : plattform
    setLaeuft(true)
    setMeldung(null)
    setVersuch({ ...was, plattform: ziel })
    try {
      await fertig(await anfrage<Angelegt>('/api/games', { methode: 'POST', koerper: { ...was, plattform: ziel, trotzdem } }), ziel)
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
      const ziel = versuch?.plattform ?? plattform
      const a = await anfrage<{ releaseId: number }>('/api/releases', {
        methode: 'POST',
        koerper: { spielId: k.spielId, plattform: ziel },
      })
      await fertig({ spielId: k.spielId, releaseId: a.releaseId, titel: k.titel }, ziel)
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
      const ziel = versuch?.plattform ?? plattform
      const detail = await anfrage<{ releases: Array<{ id: number; plattform: string }> }>(`/api/games/${k.spielId}`)
      const r = detail.releases.find((x) => x.plattform === ziel)
      if (!r) throw new Error('Release nicht gefunden.')
      await fertig({ spielId: k.spielId, releaseId: r.id, titel: k.titel }, ziel)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Auswahl fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  if (!offen) {
    return (
      <p>
        <button type="button" onClick={() => { setPlattform(plattformVorgabe); setOffen(true) }}>Spiel anlegen</button>
        {meldung && <span role="status"> {meldung}</span>}
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
        laeuft={laeuft}
        mitPlattform
        ohnePlattform={false}
        onWahl={(k: IgdbKandidat, gewaehlt: string) => { void anlegen({ igdbId: k.igdbId }, false, gewaehlt) }}
        onOhneTreffer={(begriff) => { void anlegen({ titel: begriff }) }}
        ohneTrefferText="Ohne IGDB-Eintrag anlegen"
      />

      {kandidaten.length > 0 && (
        <div className="hinweis">
          <p>Ein Spiel mit diesem Titel gibt es schon:</p>
          <ul>
            {kandidaten.map((k) => (
              <li key={k.spielId}>
                <Link to={`/spiel/${k.spielId}`}>{k.titel}</Link> ({k.plattformen.join(', ') || 'ohne Release'}){' '}
                {vorhandenesVerwenden && k.plattformen.includes(versuch?.plattform ?? plattform) ? (
                  <button type="button" disabled={laeuft} onClick={() => vorhandenes(k)}>
                    vorhandenes {versuch?.plattform ?? plattform}-Release verwenden
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={laeuft || k.plattformen.includes(versuch?.plattform ?? plattform)}
                    onClick={() => releaseAnhaengen(k)}
                  >
                    {versuch?.plattform ?? plattform}-Release anhängen
                  </button>
                )}
              </li>
            ))}
          </ul>
          {versuch && (
            <button type="button" disabled={laeuft} onClick={() => anlegen(versuch, true, versuch.plattform)}>
              Trotzdem als neues Spiel anlegen
            </button>
          )}
        </div>
      )}
      {meldung && <p role="status">{meldung}</p>}
    </div>
  )
}
