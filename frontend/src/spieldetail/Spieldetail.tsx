import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  PLAN_ARTTEXT,
  PLATTFORMEN,
  anfrage,
  igdbLink,
  zeitpunkt,
  type Ereignis,
  type EreignisSeite,
  type ErfasstAntwort,
  type IgdbKandidat,
} from '../api'
import { IgdbSuche } from '../IgdbSuche'
import { Kopfzeile } from '../Kopfzeile'
import { Cover } from '../SpielTeile'
import { Zeichen } from '../Symbole'
import { Verlauf } from '../Verlauf'
import { ListenTafel } from './ListenTafel'
import { ReleaseKarte } from './ReleaseKarte'
import { SpielMenue } from './SpielMenue'
import { TitelFeld } from './TitelFeld'
import type { Release, Spiel } from './typen'

/**
 * Spieldetail (Use Cases 1, 2, 7), neu gebaut in Stufe 19c.
 *
 * **Warum der Umbau:** Stufe 19 hat die Listen auf die Linie „Vitrine"
 * gebracht, das Spieldetail blieb liegen – es trug als einzige oft besuchte
 * Ansicht keine Kopfzeile, kein Zeichen aus `SpielTeile.tsx` und ein
 * Titelfeld, das über den rechten Rand lief. Vor allem aber gab es den
 * meisten Platz an Felder, die **in keinem einzigen Fall** je ausgefüllt
 * waren: Note, Notiz, Begonnen, Beendet (0 von 431), Zustand, Kaufdatum,
 * Kaufpreis (0 von 53), Edition, Region, PSN-Produkt-Id (0 von 489).
 * Gemessen gegen die Produktion am 27.09.2026; die Spalten bleiben, der
 * Export bleibt, nur die Oberfläche zeigt sie nicht mehr.
 *
 * Damit stehen je Release nur noch Dinge, die eine Quelle füllt oder die der
 * Nutzer wirklich entscheidet:
 *
 * - **Besitz** als zwei grosse Knöpfe (Disc, digital). Was fehlt, steht
 *   gestrichelt da und lädt zum Erfassen ein; was von PSN erkannt wurde, ist
 *   Anzeige und kein Knopf (7.7 – was Sony sagt, korrigiert man bei Sony).
 * - **Trophäen** von Sony: Prozent in der Zustandsfarbe, Balken, die vier
 *   Stufen absteigend in ihren Metalltönen.
 * - **Der eigene Zustand** dazwischen, als Punkt und Wort – er schliesst den
 *   Prozentwert ab, statt darunter als Formular zu stehen (Wunsch des
 *   Nutzers vom 27.09.2026).
 *
 * Trophäenfortschritt und eigene Bewertung stehen weiter nebeneinander und
 * werden nie verrechnet (Abschnitt 1). Alles Seltene – Disc-Fassung von Hand,
 * PSN-Produkt-Id, Löschen, die IGDB-Aktionen – liegt hinter einem
 * Punktmenü: Ein Extraklick ist dort ein Gewinn, kein Verlust (Entscheidung
 * des Nutzers vom 27.09.2026).
 */

export function Spieldetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [spiel, setSpiel] = useState<Spiel | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [igdbSuche, setIgdbSuche] = useState(false)
  const [menue, setMenue] = useState(false)
  const [listen, setListen] = useState(false)

  // Verlauf (8.5): die letzten 20 Ereignisse, „ältere" hängt die nächste Seite an.
  const [verlauf, setVerlauf] = useState<EreignisSeite>({ weiter: false, ereignisse: [] })

  const verlaufLaden = useCallback(
    async (vor: number | null) => {
      const seite = await anfrage<EreignisSeite>(`/api/games/${id}/events?limit=20${vor === null ? '' : `&vor=${vor}`}`)
      setVerlauf((alt) => ({ weiter: seite.weiter, ereignisse: vor === null ? seite.ereignisse : [...alt.ereignisse, ...seite.ereignisse] }))
    },
    [id],
  )

  const laden = useCallback(async () => {
    try {
      setSpiel(await anfrage<Spiel>(`/api/games/${id}`))
      setFehler(null)
      await verlaufLaden(null)
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
    }
  }, [id, verlaufLaden])

  useEffect(() => {
    void laden()
  }, [laden])

  /** Führt einen Schreibzugriff aus und lädt danach neu. */
  async function tue(aktion: () => Promise<unknown>, erfolg?: string) {
    setLaeuft(true)
    setMeldung(null)
    try {
      await aktion()
      if (erfolg) setMeldung(erfolg)
      await laden()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  /**
   * Besitz erfassen (Stufe 15): Der Worker erledigt dabei offene Kauf- und
   * Wunscheinträge am Release und am Spiel (Abschnitt 5); die Meldung sagt es.
   */
  function erfassen(aktion: () => Promise<ErfasstAntwort>, erfolg: string) {
    return tue(async () => {
      const a = await aktion()
      if (a.absichtenErledigt.length > 0) {
        const arten = new Set(a.absichtenErledigt.map((x) => x.art))
        const liste = arten.has('wunsch') && arten.has('kauf') ? 'Wunsch- und Kaufliste' : arten.has('kauf') ? 'Kaufliste' : 'Wunschliste'
        setMeldung(`${erfolg} Von der ${liste} erledigt.`)
        return
      }
      setMeldung(erfolg)
    })
  }

  /**
   * Eintrag entfernen. Räumt der Worker dabei das Spiel mit ab (Waisen,
   * Abschnitt 5: nichts als dieser Eintrag hing daran), gibt es hier nichts
   * mehr zu zeigen – zurück zur Sammlung statt „Spiel nicht gefunden".
   */
  async function vonListeEntfernen(planId: number) {
    setLaeuft(true)
    setMeldung(null)
    try {
      const r = await anfrage<{ spielGeloescht: boolean }>(`/api/plans/${planId}`, { methode: 'DELETE' })
      if (r.spielGeloescht) {
        navigate('/sammlung')
        return
      }
      setMeldung('Von der Liste entfernt.')
      await laden()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  /** IGDB-Eintrag von Hand wählen – Quelle 'manuell', Metadaten kommen mit. */
  async function igdbWaehlen(k: IgdbKandidat) {
    if (!spiel) return
    setIgdbSuche(false)
    await tue(() => anfrage(`/api/unmatched/spiel/${spiel.id}/link`, { methode: 'POST', koerper: { igdbId: k.igdbId } }), `Mit „${k.name}" verknüpft.`)
  }

  async function igdbLoesen() {
    if (!spiel || !confirm('IGDB-Verknüpfung lösen? Cover, Wertung und Datum von IGDB werden entfernt.')) return
    await tue(() => anfrage(`/api/unmatched/spiel/${spiel.id}/link`, { methode: 'DELETE' }), 'Verknüpfung gelöst.')
  }

  async function igdbAblehnen() {
    if (!spiel) return
    await tue(() => anfrage(`/api/unmatched/spiel/${spiel.id}/ablehnen`, { methode: 'POST' }), 'Als „kein IGDB-Eintrag" gespeichert.')
  }

  async function igdbDochSuchen() {
    if (!spiel) return
    await tue(() => anfrage(`/api/unmatched/spiel/${spiel.id}/suchen`, { methode: 'POST' }))
    setIgdbSuche(true)
  }

  async function umbenennen(titel: string) {
    if (!spiel || titel === spiel.titel) return
    await tue(() => anfrage(`/api/games/${spiel.id}`, { methode: 'PATCH', koerper: { titel } }), `Umbenannt: ${titel}`)
  }

  async function spielLoeschen() {
    if (!spiel) return
    const listen = spiel.releases.filter((r) => r.trophaeen).length
    const exemplare = spiel.releases.reduce((n, r) => n + r.exemplare.length, 0)
    const was = [
      `${spiel.releases.length} Release(s)`,
      exemplare > 0 && `${exemplare} Exemplar(e)`,
      listen > 0 && `${listen} Trophäenliste(n) zurück in die Zuordnung`,
    ].filter(Boolean).join(', ')
    if (!confirm(`„${spiel.titel}" löschen? Das nimmt mit: ${was}.`)) return
    setLaeuft(true)
    try {
      await anfrage(`/api/games/${spiel.id}`, { methode: 'DELETE' })
      navigate('/sammlung')
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Löschen fehlgeschlagen.')
      setLaeuft(false)
    }
  }

  async function releaseLoeschen(r: Release) {
    if (!spiel) return
    const was = [
      r.exemplare.length > 0 && `${r.exemplare.length} Exemplar(e)`,
      r.digital.length > 0 && `${r.digital.length} digitale Berechtigung(en)`,
      r.trophaeen && 'die Trophäenliste geht zurück in die Zuordnung',
      spiel.releases.length === 1 && 'das Spiel selbst, weil kein Release bleibt',
    ].filter(Boolean)
    const text = was.length ? ` Das nimmt mit: ${was.join(', ')}.` : ''
    if (!confirm(`${r.plattform}-Release von „${spiel.titel}" löschen?${text}`)) return

    if (spiel.releases.length === 1) {
      setLaeuft(true)
      try {
        await anfrage(`/api/releases/${r.id}`, { methode: 'DELETE' })
        navigate('/sammlung')
      } catch (f) {
        setMeldung(f instanceof Error ? f.message : 'Löschen fehlgeschlagen.')
        setLaeuft(false)
      }
      return
    }
    await tue(() => anfrage(`/api/releases/${r.id}`, { methode: 'DELETE' }), `${r.plattform}-Release gelöscht.`)
  }

  if (fehler) {
    return (
      <>
        <p role="alert">{fehler}</p>
        <p><Link to="/sammlung">Zur Sammlung</Link></p>
      </>
    )
  }
  if (!spiel) return <p>wird geladen …</p>

  const freiePlattformen = PLATTFORMEN.filter((p) => !spiel.releases.some((r) => r.plattform === p))
  const jahr = spiel.erscheinungsdatum?.slice(0, 4) ?? null

  return (
    <>
      <Kopfzeile
        titel={spiel.titel}
        zurueck
        stillerTitel
        zusatz={
          <span className="menueanker">
            <button
              type="button"
              className="ikone"
              aria-label="Mehr zum Spiel"
              aria-expanded={menue}
              onClick={() => setMenue(!menue)}
            >
              <Zeichen name="mehr" />
            </button>
          </span>
        }
      />

      {menue && (
        <SpielMenue
          spiel={spiel}
          laeuft={laeuft}
          freiePlattformen={freiePlattformen}
          schliessen={() => setMenue(false)}
          onRelease={(p) =>
            tue(() => anfrage('/api/releases', { methode: 'POST', koerper: { spielId: spiel.id, plattform: p } }), `${p}-Release angelegt.`)
          }
          onSuche={() => setIgdbSuche(!igdbSuche)}
          sucheOffen={igdbSuche}
          onLoesen={igdbLoesen}
          onAblehnen={igdbAblehnen}
          onDochSuchen={igdbDochSuchen}
          onSpielLoeschen={spielLoeschen}
        />
      )}

      <div className="detail">
        <header className="held">
          <Cover bild={spiel.bild} cover={spiel.igdb.id !== null} titel={spiel.titel} />
          <div className="heldtext">
            <TitelFeld titel={spiel.titel} laeuft={laeuft} onSpeichern={umbenennen} />

            <p className="herkunft">
              {spiel.kritik ? (
                <>
                  <b className="zahl">{spiel.kritik.wert}</b>
                  <span className="still">/100</span>
                </>
              ) : (
                <span className="still">Wertung unbekannt</span>
              )}
              {jahr && <> · <span className="zahl">{jahr}</span></>}
              {spiel.releaseStatus === 'angekuendigt' && <> · angekündigt</>}
              {' · '}
              {igdbLink(spiel.igdb.slug) ? (
                <a href={igdbLink(spiel.igdb.slug)!} target="_blank" rel="noreferrer">IGDB</a>
              ) : (
                <span className="still">ohne IGDB-Eintrag</span>
              )}
            </p>

            <div className="pillen">
              {spiel.plaene.map((p) => (
                <span key={p.id} className={p.favorit ? 'pille gold' : 'pille'}>
                  {p.favorit && (
                    <span className="zeichen" style={{ color: 'var(--gold)' }}>
                      <Zeichen name="stern" groesse={12} gefuellt strich={1.5} />
                    </span>
                  )}
                  {PLAN_ARTTEXT[p.art]}
                  {p.plattform && <> · {p.plattform === 'PSVITA' ? 'Vita' : p.plattform}</>}
                  <button
                    type="button"
                    title="Von der Liste entfernen"
                    aria-label={`${PLAN_ARTTEXT[p.art]} entfernen`}
                    disabled={laeuft}
                    onClick={() => vonListeEntfernen(p.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button type="button" className="knopf leiser" disabled={laeuft} onClick={() => setListen(!listen)}>
                + Auf eine Liste
              </button>
            </div>

            {listen && (
              <ListenTafel
                spiel={spiel}
                laeuft={laeuft}
                schliessen={() => setListen(false)}
                onSetzen={(art, releaseId) =>
                  tue(
                    () => anfrage('/api/plans', { methode: 'POST', koerper: { art, releaseId } }),
                    `Auf ${PLAN_ARTTEXT[art]} gesetzt.`,
                  )
                }
              />
            )}
          </div>
        </header>

        {meldung && <p role="status" className="meldung">{meldung}</p>}

        {igdbSuche && (
          <section className="karte">
            <h2>IGDB-Eintrag wählen</h2>
            <IgdbSuche vorgabe={spiel.titel} plattformen={spiel.releases.map((r) => r.plattform)} onWahl={igdbWaehlen} laeuft={laeuft} />
          </section>
        )}

        {spiel.igdb.id === null && !igdbSuche && (
          <p className="hinweiszeile">
            {spiel.igdb.abgelehntAm ? (
              <>Als „gibt es bei IGDB nicht" gespeichert ({zeitpunkt(spiel.igdb.abgelehntAm)}).</>
            ) : spiel.igdb.gesuchtAm ? (
              <>Ohne eindeutigen IGDB-Treffer – Kandidaten stehen in der <Link to="/igdb">IGDB-Zuordnung</Link>.</>
            ) : (
              <>Noch nicht bei IGDB gesucht. Der Abgleich läuft in den <Link to="/einstellungen">Einstellungen</Link>.</>
            )}
          </p>
        )}

        <div className="releasespalten">
          {spiel.releases.map((r) => (
            <ReleaseKarte
              key={r.id}
              release={r}
              spiel={spiel}
              laeuft={laeuft}
              tue={tue}
              erfassen={erfassen}
              onLoeschen={() => releaseLoeschen(r)}
            />
          ))}

          <section className="karte">
            <details className="block">
              <summary>
                Verlauf{' '}
                <span className="wert">
                  {verlauf.ereignisse.length === 0
                    ? 'nichts'
                    : verlauf.ereignisse.length === 1
                      ? '1 Ereignis'
                      : `${verlauf.ereignisse.length} Ereignisse${verlauf.weiter ? '+' : ''}`}
                </span>
              </summary>
              <div>
                {verlauf.ereignisse.length === 0 ? (
                  <p className="still">Noch nichts protokolliert – der Verlauf beginnt mit Stufe 16.</p>
                ) : (
                  <Verlauf ereignisse={verlauf.ereignisse} mitTitel={false} />
                )}
                {verlauf.weiter && (
                  <p>
                    <button type="button" className="knopf leiser" disabled={laeuft} onClick={() => void verlaufLaden(letztesEreignis(verlauf.ereignisse))}>
                      ältere anzeigen
                    </button>
                  </p>
                )}
              </div>
            </details>
          </section>
        </div>
      </div>
    </>
  )
}

const letztesEreignis = (liste: Ereignis[]): number | null => liste[liste.length - 1]?.id ?? null
