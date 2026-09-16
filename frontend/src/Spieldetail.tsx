import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  DISCQUELLE,
  DISC_FASSUNGEN,
  PLATINTEXT,
  PLATTFORMEN,
  PLAY_STATUS,
  QUELLEN,
  QUELLENTEXT,
  STATUSTEXT,
  ZUSTAENDE,
  anfrage,
  datum,
  euro,
  type Bewertung,
  type DiscFassung,
  type ErfasstAntwort,
  type Platin,
  type PlayStatus,
  type Plattform,
  type Quelle,
  type Zustand,
  KRITIKQUELLE,
  PLAN_ARTTEXT,
  RELEASE_STATUS_TEXT,
  type PlanArt,
  igdbLink,
  neuestePlattform,
  zeitpunkt,
  type IgdbKandidat,
  type ReleaseStatus,
  type Ereignis,
  type EreignisSeite,
} from './api'
import { IgdbSuche, datumOderUnbekannt } from './IgdbSuche'
import { Verlauf } from './Verlauf'

/**
 * Spieldetail (Use Cases 1, 2, 7): Releases, Exemplare, Trophäen.
 *
 * Trophäenfortschritt und eigene Bewertung stehen nebeneinander, nie
 * verrechnet (Abschnitt 1). Preise kommen in Stufe 20/21.
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
  zustand: Zustand | null
  anleitung: boolean
  kaufdatum: string | null
  kaufpreisCents: number | null
  notiz: string | null
  angelegtAm: string
}

type Digital = { id: number; quelle: Quelle; erworbenAm: string | null }

type Release = {
  id: number
  plattform: Plattform
  edition: string | null
  region: string | null
  discFassung: DiscFassung
  discQuelle: string | null
  psnProductId: string | null
  trophaeen: Trophaeen | null
  bewertung: Bewertung | null
  exemplare: Exemplar[]
  digital: Digital[]
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
  // '' heisst "ohne Plattform" - der Wunsch haengt dann am Spiel, nicht an einem
  // Release. Mit Plattform legt der Server das Release an, falls es fehlt.
  // null = noch nicht angefasst, dann gilt die neueste Plattform des Spiels.
  const [wunschWahl, setWunschWahl] = useState<string | null>(null)
  const wunschPlattform = wunschWahl ?? neuestePlattform((spiel?.releases ?? []).map((r) => r.plattform))

  // Verlauf (8.5): die letzten 20 Ereignisse, „mehr" hängt die nächste Seite an.
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

  /**
   * Wunsch anlegen - am Spiel oder an einem Release. Vorbelegt ist die
   * neueste Plattform des Spiels (Entscheidung des Nutzers vom 15.09.2026);
   * "ohne Plattform" bleibt waehlbar und wird ausdruecklich als "" gesendet.
   */
  function wunschAnlegen() {
    void tue(
      () => anfrage('/api/plans', { methode: 'POST', koerper: { art: 'wunsch', spielId: spiel!.id, plattform: wunschPlattform } }),
      'Auf die Wunschliste gesetzt.',
    )
  }

  /**
   * Eintrag entfernen. Raeumt der Worker dabei das Spiel mit ab (Waisen,
   * Abschnitt 5: nichts als dieser Eintrag hing daran), gibt es hier nichts
   * mehr zu zeigen - zurueck zur Sammlung statt "Spiel nicht gefunden".
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

  /** Offener Kaufeintrag an diesem Release (Stufe 15) - sperrt den Knopf, dieselbe Regel wie bei To-Do/Backlog. */
  const aufKaufliste = (releaseId: number) => spiel!.plaene.some((p) => p.releaseId === releaseId && p.art === 'kauf')

  /**
   * Besitz erfassen (Stufe 15): Der Worker erledigt dabei offene Kauf- und
   * Wunscheintraege am Release und am Spiel (Abschnitt 5); die Meldung sagt es.
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

  /** Offener To-Do- oder Backlog-Eintrag an diesem Release (Stufe 12). */
  function listenEintrag(releaseId: number) {
    return spiel!.plaene.find((p) => p.releaseId === releaseId && (p.art === 'todo' || p.art === 'backlog'))
  }
  const aufListe = (releaseId: number) => listenEintrag(releaseId) !== undefined

  function listeAnlegen(art: 'todo' | 'backlog', releaseId: number) {
    void tue(
      () => anfrage('/api/plans', { methode: 'POST', koerper: { art, releaseId } }),
      art === 'todo' ? 'Auf To-Do gesetzt.' : 'Ins Backlog gesetzt.',
    )
  }

  /** Gibt es schon einen offenen Wunsch fuer diese Wahl? Dann ist der Knopf aus. */
  function wunschVorhanden() {
    return spiel!.plaene.some(
      (p) => p.art === 'wunsch' && (wunschPlattform === '' ? p.releaseId === null : p.plattform === wunschPlattform),
    )
  }

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

  return (
    <>
      <p><button type="button" onClick={() => navigate(-1)}>← Zurück</button></p>

      <header className="detailkopf">
        {spiel.bild && <img src={spiel.bild} alt="" className={spiel.igdb.id !== null ? 'cover' : undefined} width={96} height={96} />}
        <div>
          <input
            type="text"
            className="titelfeld"
            defaultValue={spiel.titel}
            key={spiel.titel}
            aria-label="Titel"
            onBlur={(e) => {
              const t = e.target.value.trim()
              if (t) void umbenennen(t)
              else e.target.value = spiel.titel
            }}
          />
          <p className="zeile">{spiel.releases.length} Release(s)</p>
        </div>
      </header>

      {meldung && <p role="status">{meldung}</p>}

      <section className="igdb-block">
        <h2>IGDB</h2>
        {spiel.igdb.id !== null ? (
          <>
            <table>
              <tbody>
                <tr>
                  <td>Kritikerwertung</td>
                  <td>
                    {spiel.kritik
                      ? `${spiel.kritik.wert} von 100 (${spiel.kritik.anzahl ?? '?'} Wertungen, ${KRITIKQUELLE[spiel.kritik.quelle ?? ''] ?? 'Quelle unbekannt'})`
                      : 'unbekannt'}
                  </td>
                </tr>
                <tr>
                  <td>Erscheinungsdatum</td>
                  <td>
                    {datumOderUnbekannt(spiel.erscheinungsdatum)}
                    {spiel.releaseStatus !== 'unbekannt' && ` · ${RELEASE_STATUS_TEXT[spiel.releaseStatus]}`}
                  </td>
                </tr>
                <tr>
                  <td>Verknüpfung</td>
                  <td>
                    {spiel.igdb.quelle === 'automatisch' ? 'automatisch' : 'von Hand'}
                    {spiel.igdb.verknuepftAm && ` am ${zeitpunkt(spiel.igdb.verknuepftAm)}`}
                    {igdbLink(spiel.igdb.slug) && (
                      <>
                        {' · '}
                        <a href={igdbLink(spiel.igdb.slug)!} target="_blank" rel="noreferrer">bei IGDB ansehen</a>
                      </>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="knopfzeile">
              <button type="button" className="klein" onClick={() => setIgdbSuche(!igdbSuche)} disabled={laeuft}>
                {igdbSuche ? 'Suche schließen' : 'Anderen Eintrag wählen'}
              </button>
              <button type="button" className="klein" onClick={igdbLoesen} disabled={laeuft}>
                Verknüpfung lösen
              </button>
            </div>
          </>
        ) : spiel.igdb.abgelehntAm ? (
          <>
            <p className="zeile">Als „gibt es bei IGDB nicht" gespeichert ({zeitpunkt(spiel.igdb.abgelehntAm)}).</p>
            <button type="button" className="klein" onClick={igdbDochSuchen} disabled={laeuft}>
              Doch suchen
            </button>
          </>
        ) : (
          <>
            <p className="zeile">
              {spiel.igdb.gesuchtAm ? (
                <>Ohne eindeutigen Treffer – Kandidaten stehen in der <Link to="/igdb">IGDB-Zuordnung</Link>, oder hier suchen.</>
              ) : (
                <>Noch nicht bei IGDB gesucht. Der Abgleich läuft in den <Link to="/einstellungen">Einstellungen</Link>, oder hier suchen.</>
              )}
            </p>
            <div className="knopfzeile">
              <button type="button" className="klein" onClick={() => setIgdbSuche(!igdbSuche)} disabled={laeuft}>
                {igdbSuche ? 'Suche schließen' : 'Bei IGDB suchen'}
              </button>
              <button type="button" className="klein" onClick={igdbAblehnen} disabled={laeuft}>
                Gibt es bei IGDB nicht
              </button>
            </div>
          </>
        )}
        {igdbSuche && <IgdbSuche vorgabe={spiel.titel} plattformen={spiel.releases.map((r) => r.plattform)} onWahl={igdbWaehlen} laeuft={laeuft} />}
      </section>

      <section className="wunsch-block">
        <h2>Listen</h2>
        {spiel.plaene.length > 0 && (
          <ul className="besitz">
            {spiel.plaene.map((p) => (
              <li key={p.id} className="pille">
                {p.art === 'wunsch' ? '' : `${PLAN_ARTTEXT[p.art]} · `}
                {p.plattform ?? 'ohne Plattform'}
                <button
                  type="button"
                  aria-pressed={p.favorit}
                  title={p.favorit ? 'Favorit – klicken zum Entfernen' : 'Als Favorit markieren'}
                  disabled={laeuft}
                  onClick={() => tue(() => anfrage(`/api/plans/${p.id}`, { methode: 'PATCH', koerper: { favorit: !p.favorit } }))}
                >
                  {p.favorit ? '★' : '☆'}
                </button>
                <button
                  type="button"
                  title="Von der Liste entfernen"
                  aria-label="Von der Liste entfernen"
                  disabled={laeuft}
                  onClick={() => vonListeEntfernen(p.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="knopfzeile">
          <label>
            Plattform{' '}
            <select value={wunschPlattform} onChange={(e) => setWunschWahl(e.target.value)} disabled={laeuft}>
              <option value="">ohne Plattform</option>
              {PLATTFORMEN.map((p) => (
                <option key={p} value={p}>
                  {p}{spiel.releases.some((r) => r.plattform === p) ? '' : ' (neues Release)'}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="klein" disabled={laeuft || wunschVorhanden()} onClick={wunschAnlegen}>
            Auf die Wunschliste
          </button>
          <Link to="/wunschliste" className="zeile">zur Wunschliste</Link>
        </div>
        {spiel.releases.length > 0 && (
          <div className="knopfzeile">
            {/* To-Do und Backlog haengen am Release (Stufe 12) und sind mit der Bewertung gekoppelt (5.5): To-Do heisst am Spielen, Backlog pausiert. Ein offener Eintrag sperrt beide Knoepfe, wie in der Triage (8.1). */}
            {spiel.releases.map((r) => (
              <span key={r.id} className="pille">
                {r.plattform}
                <button type="button" disabled={laeuft || aufListe(r.id)} onClick={() => listeAnlegen('todo', r.id)}>Auf To-Do</button>
                <button type="button" disabled={laeuft || aufListe(r.id)} onClick={() => listeAnlegen('backlog', r.id)}>Ins Backlog</button>
                <button
                  type="button"
                  disabled={laeuft || aufKaufliste(r.id)}
                  onClick={() => tue(() => anfrage('/api/plans', { methode: 'POST', koerper: { art: 'kauf', releaseId: r.id } }), 'Auf die Kaufliste gesetzt.')}
                >
                  Auf die Kaufliste
                </button>
              </span>
            ))}
            <span className="zeile">To-Do heißt „am Spielen", Backlog „pausiert".</span>{' '}
            <Link to="/todo" className="zeile">zu To-Do und Backlog</Link>{' '}
            <Link to="/kaufliste" className="zeile">zur Kaufliste</Link>
          </div>
        )}
      </section>

      {spiel.releases.map((r) => (
        <section key={r.id} className="release-block">
          <h2>
            {r.plattform}
            {r.edition && ` · ${r.edition}`}
            {r.region && ` · ${r.region}`}
          </h2>

          {/* Disc-Fassung (Stufe 14): ja/nein von Hand traegt Quelle 'manuell' und wird von IGDB und Feed nie ueberschrieben; 'unbekannt' nimmt das Urteil zurueck. */}
          <p className="zeile disc-zeile">
            <label>
              Disc-Fassung:{' '}
              <select
                value={r.discFassung}
                disabled={laeuft}
                onChange={(ev) =>
                  tue(() => anfrage(`/api/releases/${r.id}`, { methode: 'PATCH', koerper: { discFassung: ev.target.value } }), 'Disc-Fassung gespeichert.')
                }
              >
                {DISC_FASSUNGEN.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            {r.discQuelle && ` (${DISCQUELLE[r.discQuelle] ?? r.discQuelle})`}
            {r.discFassung === 'ja' && !r.exemplare.length && r.trophaeen && r.trophaeen.fortschritt > 0 && (
              <>
                {' '}· <Link to="/luecken">Lücke</Link>
              </>
            )}
          </p>
          <PsnProduktId key={r.psnProductId ?? ''} release={r} laeuft={laeuft} onSpeichern={(wert) => tue(() => anfrage(`/api/releases/${r.id}`, { methode: 'PATCH', koerper: { psnProductId: wert } }), 'PSN-Produkt-Id gespeichert.')} />

          <div className="nebeneinander">
            <div>
              <h3>Trophäen (Sony)</h3>
              {r.trophaeen ? (
                <p>
                  <strong>{r.trophaeen.fortschritt} %</strong> ·{' '}
                  <span className={`platin ${r.trophaeen.platin}`}>{PLATINTEXT[r.trophaeen.platin]}</span>
                  <span className="zeile">
                    {' '}· {r.trophaeen.erspielt.bronze}/{r.trophaeen.definiert.bronze} Bronze ·{' '}
                    {r.trophaeen.erspielt.silber}/{r.trophaeen.definiert.silber} Silber ·{' '}
                    {r.trophaeen.erspielt.gold}/{r.trophaeen.definiert.gold} Gold · zuletzt{' '}
                    {datum(r.trophaeen.zuletztGespielt)}
                    {r.trophaeen.rohTitel !== spiel.titel && ` · bei Sony: „${r.trophaeen.rohTitel}"`}
                  </span>
                </p>
              ) : (
                <p className="zeile">keine Trophäenliste</p>
              )}
            </div>
            <div>
              <h3>Eigene Bewertung</h3>
              <BewertungForm
                bewertung={r.bewertung}
                laeuft={laeuft}
                onSpeichern={(felder) =>
                  tue(() => anfrage(`/api/releases/${r.id}/play-status`, { methode: 'PUT', koerper: felder }), 'Bewertung gespeichert.')
                }
              />
            </div>
          </div>

          <h3>Exemplare</h3>
          {r.exemplare.length === 0 && <p className="zeile">keine</p>}
          {r.exemplare.map((e) => (
            <ExemplarZeile
              key={e.id}
              exemplar={e}
              laeuft={laeuft}
              onSpeichern={(felder) =>
                tue(() => anfrage(`/api/physical-copies/${e.id}`, { methode: 'PATCH', koerper: felder }), 'Exemplar gespeichert.')
              }
              onLoeschen={() => {
                if (confirm('Dieses Exemplar löschen?')) {
                  void tue(() => anfrage(`/api/physical-copies/${e.id}`, { methode: 'DELETE' }), 'Exemplar gelöscht.')
                }
              }}
            />
          ))}
          <p>
            <button
              type="button"
              disabled={laeuft}
              onClick={() =>
                erfassen(() => anfrage<ErfasstAntwort>('/api/physical-copies', { methode: 'POST', koerper: { releaseId: r.id } }), 'Exemplar angelegt.')
              }
            >
              + Exemplar
            </button>
          </p>

          <h3>Digital</h3>
          {r.digital.length === 0 && <p className="zeile">keine</p>}
          {r.digital.length > 0 && (
            <ul className="digital">
              {r.digital.map((d) => (
                <li key={d.id}>
                  {QUELLENTEXT[d.quelle]}
                  {d.erworbenAm && <span className="zeile"> · erworben {datum(d.erworbenAm)}</span>}{' '}
                  <button
                    type="button"
                    className="klein"
                    disabled={laeuft}
                    aria-label={`${QUELLENTEXT[d.quelle]} entfernen`}
                    onClick={() => {
                      if (confirm(`„${QUELLENTEXT[d.quelle]}" entfernen?`)) {
                        void tue(() => anfrage(`/api/digital-entitlements/${d.id}`, { methode: 'DELETE' }), 'Entfernt.')
                      }
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <DigitalAnlegen
            belegt={r.digital.map((d) => d.quelle)}
            laeuft={laeuft}
            onAnlegen={(quelle, erworbenAm) =>
              erfassen(
                () => anfrage<ErfasstAntwort>('/api/digital-entitlements', { methode: 'POST', koerper: { releaseId: r.id, quelle, erworbenAm } }),
                `„${QUELLENTEXT[quelle]}" angelegt.`,
              )
            }
          />

          <p>
            <button type="button" className="gefaehrlich" disabled={laeuft} onClick={() => releaseLoeschen(r)}>
              Release löschen
            </button>
          </p>
        </section>
      ))}

      <section className="verlauf-block">
        <h2>Verlauf</h2>
        {verlauf.ereignisse.length === 0 ? (
          <p className="zeile">Noch nichts protokolliert – der Verlauf beginnt mit Stufe 16.</p>
        ) : (
          <Verlauf ereignisse={verlauf.ereignisse} mitTitel={false} />
        )}
        {verlauf.weiter && (
          <p>
            <button type="button" className="klein" disabled={laeuft} onClick={() => void verlaufLaden(letztesEreignis(verlauf.ereignisse))}>
              ältere anzeigen
            </button>
          </p>
        )}
      </section>

      <section>
        <h2>Spiel</h2>
        {freiePlattformen.length > 0 && (
          <p className="steuerung">
            <select id="neue-plattform" aria-label="Plattform für neues Release" defaultValue={freiePlattformen[0]}>
              {freiePlattformen.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>{' '}
            <button
              type="button"
              disabled={laeuft}
              onClick={() => {
                const wahl = (document.getElementById('neue-plattform') as HTMLSelectElement).value
                void tue(
                  () => anfrage('/api/releases', { methode: 'POST', koerper: { spielId: spiel.id, plattform: wahl } }),
                  `${wahl}-Release angelegt.`,
                )
              }}
            >
              + Release
            </button>
          </p>
        )}
        <p>
          <button type="button" className="gefaehrlich" disabled={laeuft} onClick={spielLoeschen}>
            Spiel löschen
          </button>
        </p>
      </section>
    </>
  )
}

const letztesEreignis = (liste: Ereignis[]): number | null => liste[liste.length - 1]?.id ?? null

type ExemplarFelder = {
  ean?: string | null
  zustand?: Zustand | null
  anleitung?: boolean
  kaufdatum?: string | null
  kaufpreisCents?: number | null
  notiz?: string | null
}

/** Ein Exemplar, inline bearbeitbar. Preis wird in Euro eingegeben und in Cent gesendet. */
function ExemplarZeile({
  exemplar: e,
  laeuft,
  onSpeichern,
  onLoeschen,
}: {
  exemplar: Exemplar
  laeuft: boolean
  onSpeichern: (felder: ExemplarFelder) => Promise<void>
  onLoeschen: () => void
}) {
  const [bearbeitet, setBearbeitet] = useState(false)
  const [zustand, setZustand] = useState<Zustand | ''>(e.zustand ?? '')
  const [anleitung, setAnleitung] = useState(e.anleitung)
  const [kaufdatum, setKaufdatum] = useState(e.kaufdatum ?? '')
  const [preis, setPreis] = useState(e.kaufpreisCents === null ? '' : (e.kaufpreisCents / 100).toFixed(2))
  const [ean, setEan] = useState(e.ean ?? '')
  const [notiz, setNotiz] = useState(e.notiz ?? '')

  async function speichern(ev: React.FormEvent) {
    ev.preventDefault()
    const cents = preis.trim() === '' ? null : Math.round(Number(preis.replace(',', '.')) * 100)
    if (cents !== null && (!Number.isFinite(cents) || cents < 0)) return
    await onSpeichern({
      zustand: zustand || null,
      anleitung,
      kaufdatum: kaufdatum || null,
      kaufpreisCents: cents,
      ean: ean.trim() || null,
      notiz: notiz.trim() || null,
    })
    setBearbeitet(false)
  }

  if (!bearbeitet) {
    return (
      <p className="exemplar">
        {e.zustand ?? 'Zustand unbekannt'}
        {e.anleitung && ' · mit Anleitung'}
        {' · gekauft '}{datum(e.kaufdatum)}
        {' · '}{euro(e.kaufpreisCents)}
        {e.ean && ` · EAN ${e.ean}`}
        {e.notiz && <span className="zeile"> · {e.notiz}</span>}{' '}
        <button type="button" className="klein" disabled={laeuft} onClick={() => setBearbeitet(true)}>Bearbeiten</button>{' '}
        <button type="button" className="klein" disabled={laeuft} onClick={onLoeschen} aria-label="Exemplar löschen">×</button>
      </p>
    )
  }

  return (
    <form className="exemplar-form" onSubmit={speichern}>
      <label>
        Zustand{' '}
        <select value={zustand} onChange={(ev) => setZustand(ev.target.value as Zustand | '')}>
          <option value="">unbekannt</option>
          {ZUSTAENDE.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </label>
      <label>
        <input type="checkbox" checked={anleitung} onChange={(ev) => setAnleitung(ev.target.checked)} /> mit Anleitung
      </label>
      <label>
        Kaufdatum <input type="date" value={kaufdatum} onChange={(ev) => setKaufdatum(ev.target.value)} />
      </label>
      <label>
        Preis (€) <input type="text" inputMode="decimal" value={preis} onChange={(ev) => setPreis(ev.target.value)} placeholder="unbekannt" />
      </label>
      <label>
        EAN <input type="text" inputMode="numeric" value={ean} onChange={(ev) => setEan(ev.target.value)} pattern="[0-9]{8,14}" />
      </label>
      <label>
        Notiz <input type="text" value={notiz} onChange={(ev) => setNotiz(ev.target.value)} />
      </label>
      <p>
        <button type="submit" disabled={laeuft}>Speichern</button>{' '}
        <button type="button" onClick={() => setBearbeitet(false)}>Abbrechen</button>
      </p>
    </form>
  )
}

function DigitalAnlegen({
  belegt,
  laeuft,
  onAnlegen,
}: {
  belegt: Quelle[]
  laeuft: boolean
  onAnlegen: (quelle: Quelle, erworbenAm: string | null) => Promise<void>
}) {
  const frei = QUELLEN.filter((q) => !belegt.includes(q))
  const [quelle, setQuelle] = useState<Quelle | ''>('')
  const [erworbenAm, setErworbenAm] = useState('')

  if (frei.length === 0) return null
  const wahl = quelle && frei.includes(quelle) ? quelle : frei[0]

  return (
    <p className="steuerung">
      <select value={wahl} onChange={(ev) => setQuelle(ev.target.value as Quelle)} aria-label="Digitale Quelle">
        {frei.map((q) => <option key={q} value={q}>{QUELLENTEXT[q]}</option>)}
      </select>{' '}
      <input type="date" value={erworbenAm} onChange={(ev) => setErworbenAm(ev.target.value)} aria-label="erworben am" />{' '}
      <button
        type="button"
        disabled={laeuft}
        onClick={async () => {
          await onAnlegen(wahl, erworbenAm || null)
          setErworbenAm('')
        }}
      >
        + digital
      </button>
    </p>
  )
}

type BewertungFelder = {
  status: PlayStatus
  begonnenAm: string | null
  beendetAm: string | null
  bewertung: number | null
  notiz: string | null
}

/**
 * Eigene Bewertung je Release. Steht neben den Trophäen, nie darin
 * verrechnet: Der Fortschritt kommt von Sony, der Status von dir.
 */
function BewertungForm({
  bewertung: b,
  laeuft,
  onSpeichern,
}: {
  bewertung: Bewertung | null
  laeuft: boolean
  onSpeichern: (felder: BewertungFelder) => Promise<void>
}) {
  const [offen, setOffen] = useState(false)
  const [status, setStatus] = useState<PlayStatus>(b?.status ?? 'nicht_gespielt')
  const [begonnenAm, setBegonnenAm] = useState(b?.begonnenAm ?? '')
  const [beendetAm, setBeendetAm] = useState(b?.beendetAm ?? '')
  const [wertung, setWertung] = useState(b?.bewertung === null || b === null ? '' : String(b.bewertung))
  const [notiz, setNotiz] = useState(b?.notiz ?? '')

  async function speichern(ev: React.FormEvent) {
    ev.preventDefault()
    await onSpeichern({
      status,
      begonnenAm: begonnenAm || null,
      beendetAm: beendetAm || null,
      bewertung: wertung === '' ? null : Number(wertung),
      notiz: notiz.trim() || null,
    })
    setOffen(false)
  }

  if (!offen) {
    return (
      <p>
        {b ? (
          <>
            <strong>{STATUSTEXT[b.status]}</strong>
            <span className="zeile">
              {b.bewertung !== null && ` · ${b.bewertung}/10`}
              {b.begonnenAm && ` · begonnen ${datum(b.begonnenAm)}`}
              {b.beendetAm && ` · beendet ${datum(b.beendetAm)}`}
              {b.notiz && ` · ${b.notiz}`}
            </span>
          </>
        ) : (
          <span className="zeile">kein Status</span>
        )}{' '}
        <button type="button" className="klein" disabled={laeuft} onClick={() => setOffen(true)}>
          {b ? 'Ändern' : 'Setzen'}
        </button>
      </p>
    )
  }

  return (
    <form className="bewertung-form" onSubmit={speichern}>
      <label>
        Status{' '}
        <select value={status} onChange={(ev) => setStatus(ev.target.value as PlayStatus)}>
          {PLAY_STATUS.map((w) => <option key={w} value={w}>{STATUSTEXT[w]}</option>)}
        </select>
      </label>
      <label>
        Bewertung{' '}
        <select value={wertung} onChange={(ev) => setWertung(ev.target.value)}>
          <option value="">keine</option>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}/10</option>)}
        </select>
      </label>
      <label>
        Begonnen <input type="date" value={begonnenAm} onChange={(ev) => setBegonnenAm(ev.target.value)} />
      </label>
      <label>
        Beendet <input type="date" value={beendetAm} onChange={(ev) => setBeendetAm(ev.target.value)} />
      </label>
      <label>
        Notiz <input type="text" value={notiz} onChange={(ev) => setNotiz(ev.target.value)} />
      </label>
      <p>
        <button type="submit" disabled={laeuft}>Speichern</button>{' '}
        <button type="button" onClick={() => setOffen(false)}>Abbrechen</button>
      </p>
    </form>
  )
}

/**
 * PSN-Produkt-Id je Release (Abschnitt 3, seit Stufe 14 pflegbar) - fuer die
 * Store-Preisabfrage in Stufe 21. Leer heisst unbekannt, nie vorbelegt.
 */
function PsnProduktId({ release, laeuft, onSpeichern }: { release: Release; laeuft: boolean; onSpeichern: (wert: string) => Promise<void> }) {
  // Der key am Aufruf setzt das Feld nach dem Speichern neu auf.
  const [wert, setWert] = useState(release.psnProductId ?? '')
  const geaendert = wert.trim() !== (release.psnProductId ?? '')
  return (
    <p className="zeile disc-zeile">
      <label>
        PSN-Produkt-Id:{' '}
        <input type="text" value={wert} placeholder="unbekannt" size={20} onChange={(ev) => setWert(ev.target.value)} />
      </label>{' '}
      {geaendert && (
        <button type="button" className="klein" disabled={laeuft} onClick={() => onSpeichern(wert)}>speichern</button>
      )}
    </p>
  )
}
