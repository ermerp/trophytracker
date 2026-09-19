import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { anfrage, zeitpunkt, erledigtText, scanWiederOeffnen, type ErfasstAntwort, type Plattform } from './api'
import { ScanAuswahl, type Wahl } from './ScanAuswahl'

/**
 * Offene Scans zuordnen (Abschnitt 9.3, Stufe 17b).
 *
 * Aufgebaut wie die Import-Durchsicht (8.2): Blöcke statt ein Code je
 * Bildschirm. Wer hier arbeitet, liest jeden Vorschlag („Killzone 3 –
 * erfassen?"); das ist kein Blindtippen wie in der Prüfliste, und
 * Ausgelassenes bleibt stehen.
 *
 * Erfasst wird über dieselbe Route wie im Scanner: Disc mit EAN, Mapping,
 * Protokoll „per Barcode" – und offene Kauf- und Wunscheinträge am Ziel
 * werden dabei erledigt (Abschnitt 5), samt Rückgängig.
 */

type Kandidat = { spielId: number; titel: string; releases: Array<{ releaseId: number; plattform: Plattform }> }

type Scan = {
  ean: string
  scans: number
  zuerstAm: string
  zuletztAm: string
  titel: string | null
  quelle: string | null
  geprueftAm: string | null
  eindeutig: boolean
  kandidaten: Kandidat[]
}

type Antwort = { anzahl: number; ungeprueft: number; eindeutig: number; scans: Scan[] }

type Zuordnung = ErfasstAntwort & {
  ean: string
  releaseId: number
  spiel: { spielId: number; titel: string; plattform: Plattform } | null
  /** Der Vorschlag, den dieser Code hatte – für „Rückgängig". */
  vorschlag: { titel: string | null; quelle: string | null }
}

/** Ein eindeutiger Treffer mit genau einem Release – nur dann ist das Ziel ohne Rückfrage klar. */
function zielVon(s: Scan): { kandidat: Kandidat; releaseId: number } | null {
  if (!s.eindeutig || s.kandidaten.length === 0) return null
  const k = s.kandidaten[0]
  return k.releases.length === 1 ? { kandidat: k, releaseId: k.releases[0].releaseId } : null
}

export function Scans() {
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [erledigt, setErledigt] = useState<Zuordnung[]>([])
  const [offenerCode, setOffenerCode] = useState<string | null>(null)

  const laden = useCallback(async () => {
    try {
      setDaten(await anfrage<Antwort>('/api/scan/unresolved'))
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
    }
  }, [])

  useEffect(() => {
    void laden()
  }, [laden])

  function entferne(ean: string) {
    setDaten((d) => d && { ...d, anzahl: d.anzahl - 1, scans: d.scans.filter((s) => s.ean !== ean) })
  }

  async function erfassen(ean: string, wahl: Wahl): Promise<Zuordnung | null> {
    setFehler(null)
    const vorher = daten?.scans.find((s) => s.ean === ean)
    try {
      const antwort = await anfrage<Zuordnung>(`/api/scan/${ean}/assign`, { methode: 'POST', koerper: wahl })
      const z = { ...antwort, vorschlag: { titel: vorher?.titel ?? null, quelle: vorher?.quelle ?? null } }
      entferne(ean)
      setErledigt((e) => [z, ...e])
      setOffenerCode(null)
      return z
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Erfassen fehlgeschlagen.')
      return null
    }
  }

  /** Alle eindeutigen mit genau einem Release – nacheinander, mit Fortschritt. */
  async function alleEindeutigen() {
    if (!daten) return
    const ziele = daten.scans.filter((s) => zielVon(s) !== null)
    setLaeuft(true)
    setHinweis(null)
    let n = 0
    for (const s of ziele) {
      const ziel = zielVon(s)
      if (!ziel) continue
      if (!(await erfassen(s.ean, { releaseId: ziel.releaseId }))) break
      n += 1
      setHinweis(`${n} von ${ziele.length} erfasst …`)
    }
    setHinweis(`${n} von ${ziele.length} erfasst.`)
    setLaeuft(false)
  }

  /** Nimmt eine Zuordnung zurück: Absichten wieder öffnen, Disc löschen, Mapping lösen. */
  async function rueckgaengig(z: Zuordnung) {
    setFehler(null)
    setLaeuft(true)
    try {
      for (const a of z.absichtenErledigt) {
        await anfrage(`/api/plans/${a.id}`, { methode: 'PATCH', koerper: { status: 'offen' } })
      }
      await anfrage(`/api/physical-copies/${z.id}`, { methode: 'DELETE' })
      await anfrage(`/api/scan/${z.ean}`, { methode: 'DELETE' })
      await scanWiederOeffnen(z.ean, z.vorschlag.titel, z.vorschlag.quelle)
      setErledigt((e) => e.filter((x) => x.ean !== z.ean))
      setHinweis(`${z.ean} zurückgenommen – der Code steht wieder in der Liste.`)
      await laden()
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Rückgängig fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  /** Löscht den Scan endgültig – für Codes, die kein Spiel sind. Deshalb mit Rückfrage. */
  async function verwerfen(ean: string) {
    if (!confirm(`Code ${ean} wirklich verwerfen? Er ist danach weg, als wäre er nie gescannt worden.`)) return
    setFehler(null)
    try {
      await anfrage(`/api/scan/unresolved/${ean}`, { methode: 'DELETE' })
      entferne(ean)
      setHinweis(`${ean} verworfen.`)
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Verwerfen fehlgeschlagen.')
    }
  }

  /**
   * „Titel ist falsch": Die Quelle hat zu einem richtigen Code einen falschen
   * Datensatz (Zahnpasta zu einem Sony-Code, 18.09.2026). Der Vorschlag geht,
   * der Code bleibt und rückt in „Ohne Titel".
   */
  async function titelFalsch(ean: string) {
    setFehler(null)
    try {
      await anfrage(`/api/scan/${ean}/vorschlag`, { methode: 'DELETE' })
      setDaten(
        (d) =>
          d && {
            ...d,
            scans: d.scans.map((s) => (s.ean === ean ? { ...s, titel: null, quelle: null, eindeutig: false, kandidaten: [] } : s)),
          },
      )
      setHinweis(`Vorschlag zu ${ean} verworfen – der Code bleibt offen.`)
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Verwerfen fehlgeschlagen.')
    }
  }

  if (!daten) return <p>{fehler ?? 'wird geladen …'}</p>

  const eindeutige = daten.scans.filter((s) => zielVon(s) !== null)
  const mitTitel = daten.scans.filter((s) => zielVon(s) === null && s.titel !== null)
  const ohneTitel = daten.scans.filter((s) => s.titel === null)

  return (
    <>
      <h1>Offene Scans</h1>
      <p className="zeile">
        Gescannte Codes, die noch keinem Release gehören. Den Titel holt ein täglicher Job bei einer
        EAN-Quelle; der Abgleich mit deiner Sammlung entsteht beim Anzeigen. Erfassen legt die Disc
        an, merkt sich den Code und erledigt offene Wunsch- und Kaufeinträge.
      </p>

      {fehler && <p role="alert" className="auffaellig">{fehler}</p>}
      {hinweis && <p role="status" className="hinweis">{hinweis}</p>}

      {daten.anzahl === 0 && <p>Kein offener Scan. {erledigt.length > 0 && 'Alles zugeordnet.'}</p>}

      {erledigt.length > 0 && (
        <section>
          <h2>Gerade erfasst ({erledigt.length})</h2>
          <ul className="gesammelt">
            {erledigt.map((z) => (
              <li key={z.ean}>
                <span className="titel">{z.ean}</span>{' '}
                {z.spiel ? (
                  <>
                    <Link to={`/spiel/${z.spiel.spielId}`}>{z.spiel.titel}</Link> ({z.spiel.plattform})
                  </>
                ) : (
                  `Release ${z.releaseId}`
                )}
                {z.absichtenErledigt.length > 0 && ` – ${erledigtText(z.absichtenErledigt)}`}{' '}
                <button type="button" className="klein" disabled={laeuft} onClick={() => rueckgaengig(z)}>
                  Rückgängig
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {eindeutige.length > 0 && (
        <section>
          <h2>Eindeutig ({eindeutige.length})</h2>
          <p className="zeile">Der Titel der Quelle nennt genau ein Spiel deiner Sammlung, und das hat genau ein Release.</p>
          <p>
            <button type="button" disabled={laeuft} onClick={alleEindeutigen}>
              Alle {eindeutige.length} erfassen
            </button>
          </p>
          <ul className="scanliste">
            {eindeutige.map((s) => {
              const ziel = zielVon(s)!
              return (
                <li key={s.ean}>
                  <span className="titel">{ziel.kandidat.titel}</span>{' '}
                  <span className="pille">{ziel.kandidat.releases[0].plattform}</span>{' '}
                  <button type="button" disabled={laeuft} onClick={() => erfassen(s.ean, { releaseId: ziel.releaseId })}>
                    Erfassen
                  </button>
                  <span className="zeile"> {s.ean} · „{s.titel}" ({s.quelle})</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {mitTitel.length > 0 && (
        <section>
          <h2>Ohne eindeutiges Ziel ({mitTitel.length})</h2>
          <p className="zeile">
            Die Quelle kennt den Code, aber das Spiel fehlt in der Sammlung, passt auf mehrere Titel
            oder hat mehrere Releases – hier entscheidest du.
          </p>
          <ul className="scanliste">
            {mitTitel.map((s) => (
              <li key={s.ean}>
                <span className="titel">„{s.titel}"</span>{' '}
                <span className="zeile">{s.ean} · {s.quelle}</span>
                {s.kandidaten.length > 0 && (
                  <ul className="treffer">
                    {s.kandidaten.map((k) => (
                      <li key={k.spielId}>
                        <span className="titel">{k.titel}</span>{' '}
                        {k.releases.map((r) => (
                          <button
                            key={r.releaseId}
                            type="button"
                            disabled={laeuft}
                            onClick={() => erfassen(s.ean, { releaseId: r.releaseId })}
                          >
                            {r.plattform}
                          </button>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
                {offenerCode === s.ean ? (
                  <ScanAuswahl
                    ean={s.ean}
                    scans={s.scans}
                    vorgabe={s.titel ?? ''}
                    laeuft={laeuft}
                    onWahl={(wahl) => erfassen(s.ean, wahl)}
                    onSpaeter={() => setOffenerCode(null)}
                    spaeterText="Zuklappen"
                  />
                ) : (
                  <p className="knopfzeile">
                    <button type="button" className="klein" onClick={() => setOffenerCode(s.ean)}>
                      Suchen oder anlegen
                    </button>{' '}
                    <button type="button" className="klein" disabled={laeuft} onClick={() => titelFalsch(s.ean)}>
                      Titel ist falsch
                    </button>{' '}
                    <button type="button" className="klein" disabled={laeuft} onClick={() => verwerfen(s.ean)}>
                      Scan verwerfen
                    </button>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ohneTitel.length > 0 && (
        <section>
          <h2>Ohne Titel ({ohneTitel.length})</h2>
          <p className="zeile">
            {daten.ungeprueft > 0
              ? `${daten.ungeprueft} davon hat der Job noch nicht angefragt – er läuft täglich und schafft 100 Codes.`
              : 'Die Quelle kennt diese Codes nicht oder ihr Vorschlag war falsch. Hülle heraussuchen und den Titel selbst zuordnen.'}
          </p>
          <ul className="scanliste">
            {ohneTitel.map((s) => (
              <li key={s.ean}>
                <span className="titel">{s.ean}</span>{' '}
                <span className="zeile">
                  {s.scans}× gescannt, zuletzt {zeitpunkt(s.zuletztAm)}
                  {s.geprueftAm === null ? ' · noch nicht angefragt' : ' · kein brauchbarer Titel'}
                </span>
                {offenerCode === s.ean ? (
                  <ScanAuswahl
                    ean={s.ean}
                    scans={s.scans}
                    laeuft={laeuft}
                    onWahl={(wahl) => erfassen(s.ean, wahl)}
                    onSpaeter={() => setOffenerCode(null)}
                    spaeterText="Zuklappen"
                  />
                ) : (
                  <p className="knopfzeile">
                    <button type="button" className="klein" onClick={() => setOffenerCode(s.ean)}>
                      Suchen oder anlegen
                    </button>{' '}
                    <button type="button" className="klein" disabled={laeuft} onClick={() => verwerfen(s.ean)}>
                      Scan verwerfen
                    </button>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
