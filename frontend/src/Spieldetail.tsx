import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { spielzeitText } from './spielzeit'
import {
  DISCQUELLE,
  DISC_FASSUNGEN,
  KRITIKQUELLE,
  PLAN_ARTEN,
  PLAN_ARTTEXT,
  PLATTFORMEN,
  PLAY_STATUS,
  QUELLEN,
  QUELLENTEXT,
  STATUSTEXT,
  anfrage,
  datum,
  gebrauchtpreisText,
  igdbLink,
  marktBefund,
  produktNameAbweichend,
  storeBefundText,
  zeitpunkt,
  type Bewertung,
  type DiscFassung,
  type Ereignis,
  type EreignisSeite,
  type ErfasstAntwort,
  type IgdbKandidat,
  type Platin,
  type PlanArt,
  type PlayStatus,
  type Plattform,
  type Quelle,
  type ReleaseStatus,
} from './api'
import { IgdbSuche, datumOderUnbekannt } from './IgdbSuche'
import { Kopfzeile } from './Kopfzeile'
import { Cover, PlattformChip, TrophaeenStufen, zustandsFarbe } from './SpielTeile'
import { StorePreis } from './StorePreis'
import { Trophaeenliste } from './Trophaeenliste'
import { Zeichen } from './Symbole'
import { Verlauf } from './Verlauf'

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

type Stufen = { bronze: number; silber: number; gold: number; platin: number }

type Trophaeen = {
  npCommunicationId: string
  rohTitel: string
  fortschritt: number
  platin: Platin
  erspielt: Stufen
  definiert: Stufen
  zuletztGespielt: string | null
}

type Exemplar = {
  id: number
  ean: string | null
  zustand: string | null
  anleitung: boolean
  kaufdatum: string | null
  kaufpreisCents: number | null
  notiz: string | null
  angelegtAm: string
}

type Digital = { id: number; quelle: Quelle; erworbenAm: string | null; herkunft: 'nutzer' | 'psn' }

/** Spielzeit aus PSN (7.7); alle Felder können fehlen – PS3 und Vita liefern keine. */
type Spielzeit = {
  sekunden: number | null
  anzahl: number | null
  erstesSpielAm: string | null
  letztesSpielAm: string | null
}

type Release = {
  id: number
  plattform: Plattform
  edition: string | null
  region: string | null
  discFassung: DiscFassung
  discQuelle: string | null
  psnProductId: string | null
  /** Gebrauchtangebot aus eBay (Stufe 20); null heißt: noch nie gefragt. */
  markt: {
    geprueftAm: string
    rohangebote: number | null
    preisCents: number | null
    anbieter: string | null
    zustand: string | null
    url: string | null
  } | null
  /**
   * Store-Preis (Stufe 21); null heißt: noch nie gefragt. `befund` sagt,
   * warum kein Preis da ist, statt ihn als 0 auszugeben (Abschnitt 3).
   */
  store: {
    geprueftAm: string
    befund: string | null
    preisCents: number | null
    grundpreisCents: number | null
    imAngebot: boolean
    imPlusKatalog: boolean
    produktName: string | null
    produktId: string | null
  } | null
  trophaeen: Trophaeen | null
  bewertung: Bewertung | null
  exemplare: Exemplar[]
  digital: Digital[]
  spielzeit: Spielzeit | null
}

type IgdbZustand = {
  id: number | null
  slug: string | null
  quelle: 'automatisch' | 'manuell' | null
  verknuepftAm: string | null
  aktualisiertAm: string | null
  gesuchtAm: string | null
  abgelehntAm: string | null
}

type Kritik = { wert: number; anzahl: number | null; quelle: string | null; standVom: string | null }

/** Offene Absicht am Spiel (releaseId null) oder an einem seiner Releases (Stufe 10). */
type Plan = {
  id: number
  art: PlanArt
  releaseId: number | null
  plattform: Plattform | null
  favorit: boolean
  notiz: string | null
}

type Spiel = {
  id: number
  titel: string
  bild: string | null
  igdbId: number | null
  igdb: IgdbZustand
  kritik: Kritik | null
  erscheinungsdatum: string | null
  releaseStatus: ReleaseStatus
  plaene: Plan[]
  releases: Release[]
}

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

/**
 * Der Titel als Überschrift, mit einem Stift daneben.
 *
 * Bis Stufe 19c stand hier ein dauerhaft offenes `<input>`, das bei 390 px
 * über den rechten Rand lief – „Nebelwacht: Zweite…" war abgeschnitten
 * (gesehen im Bild vom 27.09.2026). Eine Überschrift bricht um, und das
 * Umbenennen wird eine bewusste Handlung statt eines Formulars, das immer
 * offensteht (Entscheidung des Nutzers vom 27.09.2026).
 */
function TitelFeld({ titel, laeuft, onSpeichern }: { titel: string; laeuft: boolean; onSpeichern: (t: string) => void }) {
  const [offen, setOffen] = useState(false)
  const feld = useRef<HTMLInputElement>(null)

  if (!offen) {
    return (
      <h1 className="spieltitel">
        {titel}
        <button type="button" className="stift" aria-label="Titel ändern" disabled={laeuft} onClick={() => setOffen(true)}>
          <Zeichen name="stift" groesse={16} />
        </button>
      </h1>
    )
  }
  return (
    <form
      className="titelform"
      onSubmit={(e) => {
        e.preventDefault()
        const t = feld.current?.value.trim()
        if (t) onSpeichern(t)
        setOffen(false)
      }}
    >
      <label htmlFor="spieltitel" className="nur-vorlesen">Titel</label>
      <input id="spieltitel" ref={feld} type="text" defaultValue={titel} autoFocus onKeyDown={(e) => e.key === 'Escape' && setOffen(false)} />
      <button type="submit" className="knopf" disabled={laeuft}>Speichern</button>
      <button type="button" className="knopf leiser" onClick={() => setOffen(false)}>Abbrechen</button>
    </form>
  )
}

/**
 * Eine Release-Karte: Besitz, Trophäen, Zustand.
 *
 * Die Reihenfolge ist die Entscheidung des Nutzers vom 27.09.2026 – erst der
 * Prozentwert mit Balken, dann der eigene Zustand, dann die Stufen. So
 * schliesst der Zustand den Fortschritt ab und leitet zu dem über, was ab
 * Stufe 19b darunter aufklappt: die einzelnen Trophäen.
 */
function ReleaseKarte({
  release: r,
  spiel,
  laeuft,
  tue,
  erfassen,
  onLoeschen,
}: {
  release: Release
  spiel: Spiel
  laeuft: boolean
  tue: (aktion: () => Promise<unknown>, erfolg?: string) => Promise<void>
  erfassen: (aktion: () => Promise<ErfasstAntwort>, erfolg: string) => Promise<void>
  onLoeschen: () => void
}) {
  const [menue, setMenue] = useState(false)
  const [zustand, setZustand] = useState(false)
  const [quellenwahl, setQuellenwahl] = useState(false)

  const disc = r.exemplare.length > 0
  const gekauft = r.digital.find((d) => d.quelle !== 'plus')
  const plus = r.digital.find((d) => d.quelle === 'plus')
  const digital = gekauft ?? plus ?? null
  const status = r.bewertung?.status ?? null
  const listenEintrag = spiel.plaene.find((p) => p.releaseId === r.id && (p.art === 'todo' || p.art === 'backlog'))

  // Spielzeit gibt es nur für PS4 und PS5 (7.7). Bei PS3 und Vita steht
  // deshalb gar nichts statt „unbekannt": Sie ist dort nicht unbekannt,
  // sondern nicht vorgesehen – dieselbe Dreiwertigkeit wie beim
  // Platin-Zeichen (Entscheidung des Nutzers vom 27.09.2026).
  const spielzeitVorgesehen = r.plattform === 'PS4' || r.plattform === 'PS5'

  const erspielt = r.trophaeen ? summe(r.trophaeen.erspielt) : 0
  const definiert = r.trophaeen ? summe(r.trophaeen.definiert) : 0

  return (
    <section className="karte release">
      {/* Plattform, Besitz und das Punktmenü stehen in **einer** Zeile
          (Wunsch des Nutzers vom 27.09.2026). Der Besitz stand vorher als
          eigener Block darunter und schob die Trophäen nach unten, obwohl er
          zusammen mit dem Kennzeichen dieselbe Frage beantwortet: Was habe
          ich hier, und auf welcher Plattform. */}
      <div className="releasekopf">
        <PlattformChip plattform={r.plattform} gross />

        <div className="besitzknoepfe">
        <BesitzKnopf
          name="disc"
          wort="Disc"
          gesetzt={disc}
          satz={disc ? 'im Regal' : 'erfassen'}
          laeuft={laeuft}
          onErfassen={() => {
            if (!confirm(`Disc für ${r.plattform} erfassen?`)) return
            void erfassen(() => anfrage<ErfasstAntwort>('/api/physical-copies', { methode: 'POST', koerper: { releaseId: r.id } }), 'Disc erfasst.')
          }}
        />
        <BesitzKnopf
          name={digital && !gekauft ? 'psplus' : 'wolke'}
          wort={digital ? QUELLENTEXT[digital.quelle] : 'Digital'}
          // Von PSN erkannt heisst: kein Knopf. Der nächste Lauf legte die
          // Zeile ohnehin wieder an (7.7).
          gesetzt={digital !== null}
          satz={digital ? (digital.herkunft === 'psn' ? 'von PSN erkannt' : datum(digital.erworbenAm)) : 'wählen'}
          laeuft={laeuft}
          // Kein stiller Standardwert: Die erste Fassung von 19c legte ohne
          // Rückfrage „Kauf" an – genau der vorbelegte Wert, der in der
          // Produktion acht falsche Einträge erzeugt hat, alle am Anfang des
          // Alphabets (Befund vom 27.09.2026). Ein freiwilliges Feld bleibt
          // leer, statt mit einem plausiblen Wert vorbelegt zu werden
          // (Abschnitt 3).
          onErfassen={() => setQuellenwahl(!quellenwahl)}
        />
        </div>

        <span className="menueanker">
          <button
            type="button"
            className="ikone klein"
            aria-label={`Mehr zum ${r.plattform}-Release`}
            aria-expanded={menue}
            onClick={() => setMenue(!menue)}
          >
            <Zeichen name="mehr" groesse={20} />
          </button>
          {menue && (
            <ReleaseMenue
              release={r}
              laeuft={laeuft}
              schliessen={() => setMenue(false)}
              tue={tue}
              onLoeschen={onLoeschen}
            />
          )}
        </span>
      </div>

      {quellenwahl && (
        <QuellenTafel
          belegt={r.digital.map((d) => d.quelle)}
          laeuft={laeuft}
          schliessen={() => setQuellenwahl(false)}
          onWaehlen={(q) => {
            setQuellenwahl(false)
            void erfassen(
              () => anfrage<ErfasstAntwort>('/api/digital-entitlements', { methode: 'POST', koerper: { releaseId: r.id, quelle: q } }),
              `„${QUELLENTEXT[q]}" erfasst.`,
            )
          }}
        />
      )}

      {r.trophaeen ? (
        <>
          <p className="trophzeile">
            <span className="prozent" style={{ color: zustandsFarbe(status) }}>
              {r.trophaeen.fortschritt}&thinsp;%
            </span>
            <span className="still">
              <span className="zahl">{erspielt}</span> von <span className="zahl">{definiert}</span> Trophäen
            </span>
          </p>
          <div className="balken">
            <div style={{ width: `${r.trophaeen.fortschritt}%`, background: zustandsFarbe(status) }} />
          </div>
        </>
      ) : (
        <p className="still">Keine Trophäenliste – dieses Release ist keiner Liste von Sony zugeordnet.</p>
      )}

      <div className="zustandzeile">
        <span className="zustand">
          <span className="punkt" style={{ background: zustandsFarbe(status) }} />
          {status ? STATUSTEXT[status] : 'kein Status'}
        </span>
        {listenEintrag && <span className="still">· auf {PLAN_ARTTEXT[listenEintrag.art]}</span>}
        <button type="button" className="knopf leiser" disabled={laeuft} onClick={() => setZustand(!zustand)}>
          ändern
        </button>
      </div>

      {/* Der Gebrauchtpreis steht nur da, wenn die Disc NICHT im Regal liegt:
          Wer sie hat, braucht kein Angebot. „ab" und der Anbietername sind
          Pflicht – die Zahl ist eine Forderung, kein Wert (Abschnitt 6). */}
      {!disc && r.markt && (
        <p className="still">
          {r.markt.preisCents !== null ? (
            <>
              Gebraucht: {gebrauchtpreisText(r.markt.preisCents, r.markt.anbieter)}
              {r.markt.zustand && ` (${r.markt.zustand})`}
              {/* Eigene Zeile statt „· Angebot ansehen" hinter dem Preis: Bei
                  360 px brach die Zeile dort um und begann mit dem Trennpunkt. */}
              {r.markt.url && (
                <>
                  <br />
                  <a href={r.markt.url} target="_blank" rel="noreferrer noopener">Angebot ansehen</a>
                </>
              )}
            </>
          ) : (
            (marktBefund(r.markt.rohangebote, r.markt.geprueftAm) ?? 'Gebraucht: unbekannt')
          )}
        </p>
      )}

      {/* Der Store-Preis steht UNTER dem Gebrauchtpreis und unabhängig davon,
          ob die Disc im Regal liegt: Wer die Disc hat, kann die digitale
          Fassung trotzdem noch kaufen wollen – und bei einem Titel ohne Disc
          ist das hier der einzige Preis. Nie mit dem Gebrauchtpreis zu einem
          Wert verrechnet (Abschnitt 6). */}
      {r.store && (
        <p className="still">
          {r.store.preisCents !== null ? (
            <StorePreis
              store={{
                preisCents: r.store.preisCents,
                grundpreisCents: r.store.grundpreisCents,
                imAngebot: r.store.imAngebot,
                imPlusKatalog: r.store.imPlusKatalog,
                produktName: produktNameAbweichend(r.store.produktName, spiel.titel),
                produktId: r.store.produktId,
              }}
            />
          ) : (
            storeBefundText(r.store.befund, r.store.geprueftAm)
          )}
        </p>
      )}

      {zustand && (
        <ZustandTafel
          aktuell={status}
          laeuft={laeuft}
          schliessen={() => setZustand(false)}
          onWaehlen={(s) => {
            setZustand(false)
            void tue(
              () => anfrage(`/api/releases/${r.id}/play-status`, { methode: 'PUT', koerper: { status: s } }),
              `Zustand: ${STATUSTEXT[s]}.`,
            )
          }}
        />
      )}

      {/* Überschrift mit Zahl und Pfeil, darunter die Zeichen, darunter – beim
          Aufklappen – die einzelnen Trophäen (Stufe 19b, Rückmeldung des
          Nutzers vom 01.10.2026). Die Zeichen bleiben beim Öffnen stehen.
          Geladen wird erst beim Öffnen: Eine Liste sind rund 91 gelesene
          Zeilen, und ein Spiel mit drei Releases soll sie nicht alle
          mitbringen. */}
      {r.trophaeen && (
        <Trophaeenliste
          releaseId={r.id}
          erspielt={erspielt}
          definiert={definiert}
        >
          <TrophaeenStufen erspielt={r.trophaeen.erspielt} definiert={r.trophaeen.definiert} />
        </Trophaeenliste>
      )}

      {/* Zwei feste Zeilen statt eines Flusses mit „·": Auf dem Handy brach
          der Text ohnehin um, und der Umbruch lag je nach Datumslänge
          woanders (Wunsch des Nutzers vom 27.09.2026). */}
      <p className="still fusszeile">
        {r.trophaeen && <span className="reihe">zuletzt gespielt {datum(r.trophaeen.zuletztGespielt)}</span>}
        {spielzeitVorgesehen && (
          <span className="reihe">
            Spielzeit <span className="zahl">{spielzeitText(r.spielzeit?.sekunden ?? null)}</span>
            {r.spielzeit?.anzahl ? <> in <span className="zahl">{r.spielzeit.anzahl}</span> Sitzungen</> : null}
          </span>
        )}
      </p>
    </section>
  )
}

const summe = (s: Stufen) => s.bronze + s.silber + s.gold + s.platin

/**
 * Ein Besitzknopf. Gesetzt ist hell, fehlend steht gestrichelt da und lädt
 * zum Erfassen ein – dieselbe Regel wie überall: vorhanden hell, fehlend im
 * `--aus`-Ton (Abschnitt 13).
 *
 * **Entfernt wird hier nicht** (Entscheidung des Nutzers vom 27.09.2026): Das
 * liegt im Punktmenü des Release. In der Praxis wird selten etwas entfernt,
 * und ein Fehltipp auf einem Knopf, der beides kann, hätte die gescannte EAN
 * gekostet.
 */
function BesitzKnopf({
  name,
  wort,
  satz,
  gesetzt,
  laeuft,
  onErfassen,
}: {
  name: 'disc' | 'wolke' | 'psplus'
  wort: string
  /** Die Nebenzeile – nur im offenen Zustand sichtbar, sonst der `title`. */
  satz: string
  gesetzt: boolean
  laeuft: boolean
  onErfassen: () => void
}) {
  const zeichen = <Zeichen name={name} groesse={22} strich={1.4} />

  // Gesetzt: reine Anzeige, kein Knopf – entfernt wird im Punktmenü. Und
  // **ohne Nebenzeile**: Seit die Knöpfe neben dem Kennzeichen stehen, bleiben
  // je rund 110 px, und „2× im Regal" wurde zu „2× im R…" (gesehen im Bild vom
  // 27.09.2026). Das Wort sagt, was es ist, der helle Ton sagt, dass es da
  // ist – die Herkunft steht im `title` und im Menü. Nur eine Stückzahl über
  // eins kommt ans Wort, weil sie sonst verschwände.
  if (gesetzt) {
    return (
      <span className="besitzknopf" title={`${wort} – ${satz}`}>
        {zeichen}
        <span className="wort">
          <b>{wort}</b>
        </span>
      </span>
    )
  }
  return (
    <button type="button" className="besitzknopf aus" disabled={laeuft} onClick={onErfassen} title={`${wort} erfassen`}>
      {zeichen}
      <span className="wort">
        <b>{wort}</b>
        <span>{satz}</span>
      </span>
    </button>
  )
}

/**
 * Woher der Download kommt – Kauf, PS Plus, Testversion, Sonstiges.
 *
 * **Ohne Vorauswahl.** Das alte Formular hatte ein Auswahlfeld, dessen erster
 * Eintrag „Kauf" war; wer sich durch die Sammlung klickte, legte damit acht
 * falsche Einträge an, alle am Anfang des Alphabets (gemessen am 27.09.2026).
 * Die erste Fassung von Stufe 19c wiederholte den Fehler, indem der Knopf
 * „Digital" stillschweigend `kauf` schrieb. Hier steht jede Quelle als eigener
 * Knopf, und keiner ist der Vorschlag.
 *
 * Schon belegte Quellen fehlen: `UNIQUE (release_id, source)` liesse sie
 * ohnehin nicht zweimal zu.
 */
function QuellenTafel({
  belegt,
  laeuft,
  schliessen,
  onWaehlen,
}: {
  belegt: readonly Quelle[]
  laeuft: boolean
  schliessen: () => void
  onWaehlen: (q: Quelle) => void
}) {
  useEscape(schliessen)
  const offen = QUELLEN.filter((q) => !belegt.includes(q))
  if (offen.length === 0) return null
  return (
    <div className="wahltafel" role="group" aria-label="Woher kommt der Download?">
      {offen.map((q) => (
        <button key={q} type="button" className="knopf" disabled={laeuft} onClick={() => onWaehlen(q)}>
          {QUELLENTEXT[q]}
        </button>
      ))}
      <p className="still">Was PSN selbst erkennt, steht ohne Zutun hier – von Hand nur, was dort fehlt.</p>
    </div>
  )
}

/** Die sieben Zustände als Tafel. To-Do und Backlog ziehen mit (5.5). */
function ZustandTafel({
  aktuell,
  laeuft,
  schliessen,
  onWaehlen,
}: {
  aktuell: PlayStatus | null
  laeuft: boolean
  schliessen: () => void
  onWaehlen: (s: PlayStatus) => void
}) {
  useEscape(schliessen)
  return (
    <div className="wahltafel" role="group" aria-label="Zustand wählen">
      {PLAY_STATUS.map((s) => (
        <button
          key={s}
          type="button"
          className={s === aktuell ? 'zustandwahl aktiv' : 'zustandwahl'}
          disabled={laeuft}
          onClick={() => onWaehlen(s)}
        >
          <span className="punkt" style={{ background: zustandsFarbe(s) }} />
          {STATUSTEXT[s]}
        </button>
      ))}
      <p className="still">„am Spielen" setzt auf To-Do, „pausiert" ins Backlog (5.5).</p>
    </div>
  )
}

/**
 * Auf eine der vier Listen setzen.
 *
 * **Immer an einem Release**, nie am Spiel: Ein Eintrag ohne Plattform ist
 * keine brauchbare Absicht (Entscheidung des Nutzers vom 27.09.2026) – erst
 * die Plattform entscheidet über Lücke, Kauf und Preis. Seit Stufe 19d gilt
 * das überall: in Wunschliste, Import, Filter und API, für alle vier Listen.
 * Gemessen am 28.09.2026 hingen ohnehin alle 94 Einträge an einem Release.
 */
function ListenTafel({
  spiel,
  laeuft,
  schliessen,
  onSetzen,
}: {
  spiel: Spiel
  laeuft: boolean
  schliessen: () => void
  onSetzen: (art: PlanArt, releaseId: number) => void
}) {
  useEscape(schliessen)
  return (
    <div className="wahltafel breit" role="group" aria-label="Auf eine Liste setzen">
      {spiel.releases.map((r) => (
        <div key={r.id} className="listenzeile">
          <PlattformChip plattform={r.plattform} />
          {PLAN_ARTEN.map((art) => {
            const schon = spiel.plaene.some((p) => p.releaseId === r.id && p.art === art)
            return (
              <button
                key={art}
                type="button"
                className="knopf"
                disabled={laeuft || schon}
                title={schon ? `Steht schon auf ${PLAN_ARTTEXT[art]}` : undefined}
                onClick={() => {
                  schliessen()
                  onSetzen(art, r.id)
                }}
              >
                {PLAN_ARTTEXT[art]}
              </button>
            )
          })}
        </div>
      ))}
      <p className="still">To-Do und Backlog setzen zugleich den Zustand: „am Spielen" beziehungsweise „pausiert".</p>
    </div>
  )
}

/** Das Punktmenü des Release: Disc-Fassung, PSN-Id, Entfernen, Löschen. */
function ReleaseMenue({
  release: r,
  laeuft,
  schliessen,
  tue,
  onLoeschen,
}: {
  release: Release
  laeuft: boolean
  schliessen: () => void
  tue: (aktion: () => Promise<unknown>, erfolg?: string) => Promise<void>
  onLoeschen: () => void
}) {
  useEscape(schliessen)
  return (
    <div className="tafel menuetafel" role="menu">
      {r.trophaeen && (
        <>
          {/* Der Rohtitel von Sony steht hier statt auf der Karte: Er weicht
              bei 132 der 431 Listen ab (gemessen 27.09.2026) und wäre dort
              auf jedem dritten Spiel eine zweite Zeile. Gebraucht wird er
              beim Zweifel an der Zuordnung – und dafür schlägt man nach. */}
          <div className="tafelname">Trophäenliste</div>
          <p className="menuezeile">
            <span className="still">
              bei Sony: „{r.trophaeen.rohTitel}"
              <br />
              {r.trophaeen.npCommunicationId}
            </span>
          </p>
        </>
      )}

      <div className="tafelname">Disc-Fassung</div>
      <p className="menuezeile">
        <label>
          <select
            value={r.discFassung}
            disabled={laeuft}
            onChange={(ev) => {
              schliessen()
              void tue(
                () => anfrage(`/api/releases/${r.id}`, { methode: 'PATCH', koerper: { discFassung: ev.target.value } }),
                'Disc-Fassung gespeichert.',
              )
            }}
          >
            {DISC_FASSUNGEN.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        {r.discQuelle && <span className="still"> {DISCQUELLE[r.discQuelle] ?? r.discQuelle}</span>}
      </p>

      <div className="tafelname">Store-Adresse</div>
      <PsnProduktId
        key={r.psnProductId ?? ''}
        release={r}
        laeuft={laeuft}
        onSpeichern={(wert) => {
          schliessen()
          // Leeren geht weiterhin über die Release-Route; eine Adresse geht
          // über den Store-Weg, der sie auswertet UND den Preis gleich holt
          // (Stufe 21d) – sonst stünde die Zeile bis zum nächsten Morgen still.
          if (wert === null) {
            void tue(() => anfrage(`/api/releases/${r.id}`, { methode: 'PATCH', koerper: { psnProductId: null } }), 'Entfernt.')
            return
          }
          void tue(
            () => anfrage(`/api/sync/store/${r.id}`, { methode: 'POST', koerper: { adresse: wert } }),
            'Eingetragen, Preis geholt.',
          )
        }}
      />

      {(r.exemplare.length > 0 || r.digital.some((d) => d.herkunft === 'nutzer')) && (
        <>
          <div className="tafelname">Besitz entfernen</div>
          {r.exemplare.map((e) => (
            <p key={e.id} className="menuezeile">
              <span>
                Disc
                {/* Die EAN bleibt der Zuordnung erhalten: Sie steht in
                    `ean_mapping` am Release, nicht am Exemplar, und ein
                    gelöschtes Exemplar fasst sie nicht an (Abschnitt 9.2). */}
                {e.ean && <span className="still"> · EAN {e.ean}</span>}
              </span>
              <button
                type="button"
                className="knopf gefahr"
                disabled={laeuft}
                onClick={() => {
                  if (!confirm('Diese Disc entfernen? Die gescannte EAN bleibt dem Release zugeordnet.')) return
                  schliessen()
                  void tue(() => anfrage(`/api/physical-copies/${e.id}`, { methode: 'DELETE' }), 'Disc entfernt.')
                }}
              >
                entfernen
              </button>
            </p>
          ))}
          {r.digital
            .filter((d) => d.herkunft === 'nutzer')
            .map((d) => (
              <p key={d.id} className="menuezeile">
                <span>{QUELLENTEXT[d.quelle]}</span>
                <button
                  type="button"
                  className="knopf gefahr"
                  disabled={laeuft}
                  onClick={() => {
                    if (!confirm(`„${QUELLENTEXT[d.quelle]}" entfernen?`)) return
                    schliessen()
                    void tue(() => anfrage(`/api/digital-entitlements/${d.id}`, { methode: 'DELETE' }), 'Entfernt.')
                  }}
                >
                  entfernen
                </button>
              </p>
            ))}
        </>
      )}

      <div className="tafelname gefahr">Gefährlich</div>
      <p className="menuezeile">
        <button
          type="button"
          className="knopf gefahr"
          disabled={laeuft}
          onClick={() => {
            schliessen()
            onLoeschen()
          }}
        >
          Release löschen
        </button>
      </p>
    </div>
  )
}

/** Das Punktmenü der Kopfzeile: neues Release, IGDB, Spiel löschen. */
function SpielMenue({
  spiel,
  laeuft,
  freiePlattformen,
  schliessen,
  onRelease,
  onSuche,
  sucheOffen,
  onLoesen,
  onAblehnen,
  onDochSuchen,
  onSpielLoeschen,
}: {
  spiel: Spiel
  laeuft: boolean
  freiePlattformen: readonly Plattform[]
  schliessen: () => void
  onRelease: (p: Plattform) => void
  onSuche: () => void
  sucheOffen: boolean
  onLoesen: () => void
  onAblehnen: () => void
  onDochSuchen: () => void
  onSpielLoeschen: () => void
}) {
  useEscape(schliessen)
  return (
    <div className="tafel menuetafel kopfmenue" role="menu">
      <div className="tafelname">IGDB</div>
      {spiel.igdb.id !== null ? (
        <>
          <p className="menuezeile">
            <span className="still">
              {spiel.igdb.quelle === 'automatisch' ? 'automatisch' : 'von Hand'} verknüpft
              {spiel.igdb.verknuepftAm && ` · ${zeitpunkt(spiel.igdb.verknuepftAm)}`}
            </span>
          </p>
          {spiel.kritik && (
            <p className="menuezeile">
              <span className="still">
                {spiel.kritik.wert} von 100 · {spiel.kritik.anzahl ?? '?'} Wertungen ·{' '}
                {KRITIKQUELLE[spiel.kritik.quelle ?? ''] ?? 'Quelle unbekannt'}
              </span>
            </p>
          )}
          <p className="menuezeile">
            <span className="still">erschienen {datumOderUnbekannt(spiel.erscheinungsdatum)}</span>
          </p>
          <p className="menuezeile knopfzeile">
            <button type="button" className="knopf" disabled={laeuft} onClick={() => { schliessen(); onSuche() }}>
              {sucheOffen ? 'Suche schließen' : 'Anderen Eintrag wählen'}
            </button>
            <button type="button" className="knopf leiser" disabled={laeuft} onClick={() => { schliessen(); onLoesen() }}>
              Verknüpfung lösen
            </button>
          </p>
        </>
      ) : spiel.igdb.abgelehntAm ? (
        <p className="menuezeile">
          <button type="button" className="knopf" disabled={laeuft} onClick={() => { schliessen(); onDochSuchen() }}>
            Doch suchen
          </button>
        </p>
      ) : (
        <p className="menuezeile knopfzeile">
          <button type="button" className="knopf" disabled={laeuft} onClick={() => { schliessen(); onSuche() }}>
            {sucheOffen ? 'Suche schließen' : 'Bei IGDB suchen'}
          </button>
          <button type="button" className="knopf leiser" disabled={laeuft} onClick={() => { schliessen(); onAblehnen() }}>
            Gibt es bei IGDB nicht
          </button>
        </p>
      )}

      {freiePlattformen.length > 0 && (
        <>
          <div className="tafelname">Release hinzufügen</div>
          <p className="menuezeile knopfzeile">
            {freiePlattformen.map((p) => (
              <button
                key={p}
                type="button"
                className="knopf"
                disabled={laeuft}
                onClick={() => { schliessen(); onRelease(p) }}
              >
                + {p === 'PSVITA' ? 'Vita' : p}
              </button>
            ))}
          </p>
        </>
      )}

      <div className="tafelname gefahr">Gefährlich</div>
      <p className="menuezeile">
        <button type="button" className="knopf gefahr" disabled={laeuft} onClick={() => { schliessen(); onSpielLoeschen() }}>
          Spiel löschen
        </button>
      </p>
    </div>
  )
}

/**
 * Die Store-Zuordnung eines Releases (Stufe 21, Feld seit 21d toleranter).
 *
 * Gebraucht wird sie, wenn IGDB den PlayStation-Store-Eintrag nicht kennt –
 * gemessen am 03.10.2026 bei 9 von 79 Releases. Eingefügt wird die aus dem
 * Browser kopierte Adresse; eine Produktseite gilt für dieses Release, eine
 * Concept-Seite für beide Plattformen des Spiels.
 */
function PsnProduktId({
  release: r,
  laeuft,
  onSpeichern,
}: {
  release: Release
  laeuft: boolean
  onSpeichern: (wert: string | null) => void
}) {
  const [wert, setWert] = useState(r.psnProductId ?? '')
  const geaendert = wert.trim() !== (r.psnProductId ?? '')
  return (
    <p className="menuezeile">
      <label>
        <span className="nur-vorlesen">Store-Adresse oder Produkt-Id</span>
        <input
          type="text"
          value={wert}
          placeholder="Store-Adresse einfügen"
          disabled={laeuft}
          onChange={(e) => setWert(e.target.value)}
        />
      </label>
      {geaendert && (
        <button type="button" className="knopf" disabled={laeuft} onClick={() => onSpeichern(wert.trim() === '' ? null : wert.trim())}>
          speichern
        </button>
      )}
    </p>
  )
}

/** Escape schliesst jede Tafel – dieselbe Regel wie bei der Glocke (Stufe 19a). */
function useEscape(schliessen: () => void) {
  useEffect(() => {
    function taste(e: KeyboardEvent) {
      if (e.key === 'Escape') schliessen()
    }
    document.addEventListener('keydown', taste)
    return () => document.removeEventListener('keydown', taste)
  }, [schliessen])
}
