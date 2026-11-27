import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  HERKUNFTTEXT,
  PLAN_STATUSTEXT,
  PLATTFORMEN,
  QUELLENTEXT,
  anfrage,
  euro,
  gebrauchtpreisText,
  storeUrl,
  type ErfasstAntwort,
  type PlanEintrag,
  type Quelle,
  type StorePreis,
} from './api'
import type { PlanListe } from './Absichten'
import { stateZumZeilenmenue, zeilenmenueOffen } from './filterverlauf'
import {
  digitalVorgesehen,
  erfassenZurueck,
  erfasstText,
  planMenue,
  rabattProzent,
  sortierwert,
  type MenueAktion,
  type MenueEintrag,
  type Schritt,
  type Sortierwert,
} from './preisliste'
import { AngebotMenue, Preis } from './Preis'
import { QuellenTafel } from './spieldetail/QuellenTafel'
import { useEscape } from './spieldetail/useEscape'
import { Cover, PlattformChip } from './SpielTeile'
import { Zeichen } from './Symbole'

/**
 * Die Zeile der Preisliste (Nachtrag f2e): Wunschliste, Kaufliste und Lücken
 * zeigen seit dem 27.11.2026 nur noch Zeilen (Entscheidung des Nutzers am
 * Prototyp, die Kachelvariante ist verworfen). To-Do und Backlog behalten
 * `PlanKarte` mit Kacheln und Knöpfen.
 *
 * Am Handy: Cover | Titel und eine Meta-Zeile | Preise | „⋯". Die
 * Hauptaktion ist dort der oberste Menüeintrag. Ab 48 rem bekommt jeder
 * Preis seine Spalte, und die Hauptaktion steht als Pille in der Zeile.
 *
 * Was in Zeile und Menü steht, entscheidet `preisliste.ts` – hier ist nur
 * das Bild davon.
 */

/**
 * Das Menü einer Zeile hängt am Verlauf wie das Sortiermenü (Nachtrag f2b-c,
 * `filterverlauf.ts`): Öffnen legt einen Eintrag an, Zurück schließt es. So
 * schließt die Zurück-Geste am Handy das Menü, statt die Liste zu verlassen.
 */
export function useZeilenmenue() {
  const location = useLocation()
  const navigate = useNavigate()
  const offen = zeilenmenueOffen(location.state)
  return {
    offen,
    oeffnen: (schluessel: string) =>
      navigate({ pathname: location.pathname, search: location.search }, { state: stateZumZeilenmenue(location.state, schluessel) }),
    schliessen: () => navigate(-1),
  }
}

/** „Wertung 94" – die Beschriftung leise, der Wert betont. */
export function SortierwertText({ w }: { w: Sortierwert }) {
  return (
    <span>
      {w.vor && `${w.vor} `}
      <span className="sortwert">{w.wert}</span>
    </span>
  )
}

/** Der Gebrauchtpreis: Zeichen „Disc", die Zahl als Link aufs Angebot; der Anbieter steht nur im `title`. */
export function Gebraucht({ cents, anbieter, url }: { cents: number | null; anbieter: string | null; url: string | null }) {
  return (
    <span className="preisangabe" title="gebraucht">
      <Zeichen name="disc" groesse={14} />
      {cents === null ? (
        <span className="preisunbekannt">unbekannt</span>
      ) : (
        // Ohne Releasebezug und ohne `onGeaendert`: Der Preis trägt hier kein
        // eigenes Menü, das Verwerfen steht im Menü „⋯" der Zeile.
        <Preis text={euro(cents)} url={url} titel={`gebraucht ${gebrauchtpreisText(cents, anbieter)} – kann inzwischen verkauft sein`} />
      )}
    </span>
  )
}

/**
 * Der Digitalpreis: Wolke, bei einem Titel im PS Plus-Katalog deren
 * Plus-Fassung (eigene Zeichnung, kein Monogramm). Im Angebot steht der
 * Rabatt davor und – nur am Desktop – der Grundpreis durchgestrichen danach.
 *
 * PS3 und Vita bekommen gar nichts (`digitalVorgesehen`): Der Store fragt
 * dort nicht, also ist der Preis nicht unbekannt, sondern nicht vorgesehen.
 */
export function Digital({ plattform, store }: { plattform: string | null; store: StorePreis | null }) {
  if (!digitalVorgesehen(plattform)) return null
  if (store === null) {
    return (
      <span className="preisangabe" title="digital">
        <Zeichen name="wolke" groesse={14} />
        <span className="preisunbekannt">unbekannt</span>
      </span>
    )
  }
  const rabatt = rabattProzent(store.preisCents, store.grundpreisCents, store.imAngebot)
  const url = storeUrl(store.produktId)
  const text = euro(store.preisCents)
  return (
    <span className="preisangabe" title={store.imPlusKatalog ? 'digital, im PS Plus-Katalog' : 'digital'}>
      <Zeichen name={store.imPlusKatalog ? 'psplus' : 'wolke'} groesse={14} />
      {rabatt !== null && <span className="preisrabatt">−{rabatt}&thinsp;%</span>}
      {url === null ? (
        text
      ) : (
        <a href={url} target="_blank" rel="noreferrer noopener" title="Im PlayStation Store ansehen">
          {text}
        </a>
      )}
      {rabatt !== null && store.grundpreisCents !== null && <span className="preisstatt">{euro(store.grundpreisCents)}</span>}
    </span>
  )
}

/** „57 Wünsche · 14 im Angebot · 4 auf der Kaufliste" – die Zahl betont, der Rest leise. */
export function KopfSatz({ anzahl, teile }: { anzahl: string; teile: readonly string[] }) {
  return (
    <span>
      <span className="kopfzahl">{anzahl}</span>
      {teile.map((t) => ` · ${t}`).join('')}
    </span>
  )
}

/** Der Spaltenkopf über der Liste – nur am Desktop, wo die Preise Spalten sind. */
export function Spaltenkopf({ digital = true }: { digital?: boolean }) {
  return (
    <div className={digital ? 'spaltenkopf' : 'spaltenkopf luecke'} aria-hidden="true">
      <span />
      <span>Titel</span>
      <span>gebraucht</span>
      {digital && <span>digital</span>}
    </div>
  )
}

type ZeileProps = {
  /** Schlüssel des Menüs im Verlauf – je Zeile eindeutig („p12", „l7"). */
  schluessel: string
  /** Zusatzklasse: `luecke` (eine Preisspalte), `erledigt`. */
  klasse?: string
  spielId: number | null
  titel: string
  bild: string | null
  favorit?: boolean
  /** Die Teile der Meta-Zeile; den Trenner „·" setzt das CSS davor. */
  meta: ReactNode[]
  /** Die Preise (`Gebraucht`, `Digital`). */
  preise: ReactNode
  menue: MenueEintrag[]
  laeuft: boolean
  onAktion: (a: MenueAktion) => void
  /** „Plattform ändern": die heutige und was bei einer Wahl geschieht. */
  plattform?: { aktuell: string | null; waehlen: (p: string) => void }
  /** „Digital erfassen …": die Quelle aus `QuellenTafel`. */
  onDigital?: (q: Quelle) => void
  /** „Gebrauchtangebot verwerfen": die Tafel aus `Preis.tsx`. */
  angebot?: { releaseId: number; itemId: string | null; text: string; ohneAngebot: boolean; onGeaendert: () => void }
}

export function PreisZeile({
  schluessel,
  klasse,
  spielId,
  titel,
  bild,
  favorit = false,
  meta,
  preise,
  menue,
  laeuft,
  onAktion,
  plattform,
  onDigital,
  angebot,
}: ZeileProps) {
  const navigate = useNavigate()
  const zm = useZeilenmenue()
  const offen = zm.offen === schluessel
  const anker = useRef<HTMLSpanElement>(null)
  const knopf = useRef<HTMLButtonElement>(null)
  const [plattformOffen, setPlattformOffen] = useState(false)
  const [quellen, setQuellen] = useState(false)
  const [angebotOffen, setAngebotOffen] = useState(false)
  const ziel = spielId !== null ? `/spiel/${spielId}` : undefined
  const haupt = menue.find((m) => m.haupt)

  // Ein Tipp daneben schließt das Menü und tut sonst nichts – dasselbe Muster
  // wie die Sortierung (`Sortierung.tsx`): Ginge er durch, liefe sein Ziel
  // gegen das Zurück, das noch unterwegs ist.
  useEffect(() => {
    if (!offen) return
    const daneben = (ev: Event) => !anker.current?.contains(ev.target as Node)
    const halten = (ev: MouseEvent) => {
      if (daneben(ev)) ev.preventDefault()
    }
    const zu = (ev: MouseEvent) => {
      if (!daneben(ev)) return
      ev.preventDefault()
      ev.stopPropagation()
      zm.schliessen()
    }
    document.addEventListener('mousedown', halten, true)
    document.addEventListener('click', zu, true)
    return () => {
      document.removeEventListener('mousedown', halten, true)
      document.removeEventListener('click', zu, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen])

  useEffect(() => {
    if (!offen) setPlattformOffen(false)
  }, [offen])

  /** Ein Menüeintrag. Erst zu, dann die Aktion – eine Rückfrage steht sonst über dem offenen Menü. */
  function waehle(m: MenueEintrag) {
    if (m.aktion === 'plattform') {
      setPlattformOffen(true)
      return
    }
    // Der Verweis ersetzt den Menü-Eintrag im Verlauf: Zurück führt danach
    // auf die Liste, nicht auf ein offenes Menü.
    if (m.aktion === 'kauflisteAnsehen') {
      navigate('/kaufliste', { replace: true })
      return
    }
    zm.schliessen()
    if (m.aktion === 'digital') setQuellen(true)
    else if (m.aktion === 'angebot') setAngebotOffen(true)
    else onAktion(m.aktion)
  }

  return (
    <li className={klasse ? `preiszeile ${klasse}` : 'preiszeile'}>
      <Cover bild={bild} cover={bild !== null} titel={titel} ziel={ziel} />
      <div className="preiszeile-text">
        {ziel ? (
          <Link to={ziel} className="preistitel">
            {favorit && <Zeichen name="stern" groesse={13} gefuellt className="favstern" />}
            {titel}
          </Link>
        ) : (
          <span className="preistitel">{titel}</span>
        )}
        <span className="preismeta">
          {meta.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </span>
      </div>
      <div className="preisspalten">{preise}</div>
      {haupt?.haupt && (
        <div className="hauptaktion">
          {haupt.aktion === 'kauflisteAnsehen' ? (
            <Link to="/kaufliste" className="ruhend">
              <Zeichen name={haupt.zeichen} groesse={15} />
              {haupt.haupt.knopf}
            </Link>
          ) : (
            <button type="button" disabled={laeuft} onClick={() => onAktion(haupt.aktion)}>
              <Zeichen name={haupt.zeichen} groesse={15} />
              {haupt.haupt.knopf}
            </button>
          )}
        </div>
      )}
      <span className="menueanker" ref={anker}>
        <button
          type="button"
          ref={knopf}
          className="ikone"
          aria-label={`Mehr zu „${titel}"`}
          aria-haspopup="menu"
          aria-expanded={offen}
          onClick={() => (offen ? zm.schliessen() : zm.oeffnen(schluessel))}
        >
          <Zeichen name="mehr" groesse={20} />
        </button>
        {offen && (
          <ZeilenMenue menue={menue} laeuft={laeuft} schliessen={zm.schliessen} waehle={waehle}>
            {plattformOffen && plattform && (
              <select
                value={plattform.aktuell ?? ''}
                aria-label="Plattform"
                autoFocus
                onChange={(ev) => {
                  zm.schliessen()
                  plattform.waehlen(ev.target.value)
                }}
              >
                {plattform.aktuell === null && <option value="">Plattform wählen</option>}
                {PLATTFORMEN.map((p) => (
                  <option key={p} value={p}>
                    {p === 'PSVITA' ? 'Vita' : p}
                  </option>
                ))}
              </select>
            )}
          </ZeilenMenue>
        )}
      </span>
      {quellen && onDigital && (
        <QuellenTafel
          belegt={[]}
          laeuft={laeuft}
          schliessen={() => setQuellen(false)}
          onWaehlen={(q) => {
            setQuellen(false)
            onDigital(q)
          }}
        />
      )}
      {angebotOffen && angebot && (
        <AngebotMenue
          releaseId={angebot.releaseId}
          itemId={angebot.itemId}
          text={angebot.text}
          ohneAngebot={angebot.ohneAngebot}
          anker={knopf}
          schliessen={() => setAngebotOffen(false)}
          onGeaendert={angebot.onGeaendert}
        />
      )}
    </li>
  )
}

/** Die Tafel des Menüs: `.menuetafel` wie im Spieldetail, Einträge mit Zeichen, Gefährliches unten. */
function ZeilenMenue({
  menue,
  laeuft,
  schliessen,
  waehle,
  children,
}: {
  menue: MenueEintrag[]
  laeuft: boolean
  schliessen: () => void
  waehle: (m: MenueEintrag) => void
  /** Die Plattformwahl, wenn sie aufgeklappt ist – sie ersetzt ihren Eintrag. */
  children?: ReactNode
}) {
  useEscape(schliessen)
  return (
    <div className="tafel menuetafel zeilenmenue" role="menu">
      {menue.map((m) => (
        <Fragment key={m.aktion}>
          {m.trenner && <hr />}
          {m.aktion === 'plattform' && children ? (
            <div className="menuepunkt">
              <Zeichen name={m.zeichen} groesse={18} />
              {children}
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className={m.gefahr ? 'menuepunkt gefahr' : 'menuepunkt'}
              disabled={laeuft && m.aktion !== 'kauflisteAnsehen'}
              onClick={() => waehle(m)}
            >
              <Zeichen name={m.zeichen} groesse={18} />
              {m.text}
            </button>
          )}
        </Fragment>
      ))}
    </div>
  )
}

// --- Erfassen und Rückgängig ------------------------------------------------------

/** Was nach einer Aktion zurückgenommen werden kann: die Meldung und die Schritte dahin. */
export type Rueckweg = { text: string; schritte: Schritt[] }

/**
 * Besitz erfassen wie im Spieldetail – der Worker erledigt dabei offene
 * Kauf- und Wunscheinträge am Release (`absichtenErledigen`, Abschnitt 5) –
 * und den Rückweg dazu aus der Antwort bauen (`erfassenZurueck`).
 */
export async function besitzErfassen(
  releaseId: number,
  titel: string,
  besitz: { art: 'disc' } | { art: 'digital'; quelle: Quelle },
): Promise<Rueckweg> {
  const a =
    besitz.art === 'disc'
      ? await anfrage<ErfasstAntwort>('/api/physical-copies', { methode: 'POST', koerper: { releaseId } })
      : await anfrage<ErfasstAntwort>('/api/digital-entitlements', { methode: 'POST', koerper: { releaseId, quelle: besitz.quelle } })
  return {
    text: erfasstText(titel, besitz.art === 'disc' ? 'Disc' : `„${QUELLENTEXT[besitz.quelle]}"`, a.absichtenErledigt),
    schritte: erfassenZurueck({
      besitz: besitz.art,
      id: a.id,
      releaseId,
      absichtenErledigt: a.absichtenErledigt,
      physischStatusGesetzt: a.physischStatusGesetzt,
    }),
  }
}

/**
 * Eine Aktion mit „Rückgängig" daneben. `tue` führt aus und merkt sich den
 * Rückweg, `rueckgaengig` geht ihn Schritt für Schritt – in der Reihenfolge,
 * die `preisliste.ts` festlegt – und lädt danach in jedem Fall neu: Auch ein
 * halber Rückweg hat etwas geändert.
 */
export function useRueckweg(laden: () => Promise<unknown>, setMeldung: (m: string | null) => void) {
  const [rueckweg, setRueckweg] = useState<Rueckweg | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  async function tue(aktion: () => Promise<Rueckweg | null>) {
    setLaeuft(true)
    setMeldung(null)
    setRueckweg(null)
    try {
      setRueckweg(await aktion())
      await laden()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  async function rueckgaengig() {
    if (!rueckweg) return
    const r = rueckweg
    setRueckweg(null)
    setLaeuft(true)
    setMeldung(null)
    try {
      for (const s of r.schritte) await anfrage(s.pfad, { methode: s.methode, koerper: s.koerper })
    } catch (f) {
      setMeldung(f instanceof Error ? `Rückgängig nur zum Teil: ${f.message}` : 'Rückgängig fehlgeschlagen.')
    } finally {
      await laden()
      setLaeuft(false)
    }
  }

  return { rueckweg, setRueckweg, tue, rueckgaengig, laeuft }
}

export type RueckwegZustand = ReturnType<typeof useRueckweg>

/** Die Meldungszeile mit „Rückgängig". */
export function RueckwegZeile({ weg }: { weg: RueckwegZustand }) {
  if (!weg.rueckweg) return null
  return (
    <p role="status" className="hinweis">
      {weg.rueckweg.text}{' '}
      <button type="button" onClick={() => void weg.rueckgaengig()} disabled={weg.laeuft}>
        Rückgängig
      </button>
    </p>
  )
}

// --- Die Zeile eines Wunsches oder Kaufs -------------------------------------------

/**
 * Wunsch und Kauf in der Preisliste. Meta-Zeile: Plattform · Sortierwert ·
 * Wagen (Wunsch, der schon auf der Kaufliste steht) · Herkunft (Kauf).
 */
export function PlanPreisZeile({ e, liste, weg }: { e: PlanEintrag; liste: PlanListe; weg: RueckwegZustand }) {
  const laeuft = liste.laeuft || weg.laeuft
  const offen = e.status === 'offen'

  const meta: ReactNode[] = [
    // Freitext hat kein Spiel und deshalb keine Plattform – der eine Fall ohne (Abschnitt 5).
    e.spielId === null ? (
      <span className="plattform leer">Freitext</span>
    ) : e.plattform ? (
      <PlattformChip plattform={e.plattform} />
    ) : (
      <span className="plattform leer">Plattform wählen</span>
    ),
    e.spielId === null ? (
      'ohne IGDB-Eintrag'
    ) : (
      <SortierwertText
        w={sortierwert(liste.sortierung, {
          spieler: e.spieler,
          kritik: e.kritik,
          erscheinungsdatum: e.erscheinungsdatum,
          angekuendigt: e.releaseStatus === 'angekuendigt',
        })}
      />
    ),
  ]
  if (e.art === 'wunsch' && offen && e.aufKaufliste !== null) {
    meta.push(
      <span className="wagenzeichen" title="steht auf der Kaufliste" aria-label="steht auf der Kaufliste">
        <Zeichen name="wagen" groesse={14} />
      </span>,
    )
  }
  if (e.art === 'kauf' && e.herkunft) meta.push(HERKUNFTTEXT[e.herkunft] ?? e.herkunft)
  // Altfälle: Seit Stufe 15 erledigt das Erfassen den Eintrag selbst.
  if (offen && e.imBesitz) meta.push('im Besitz')
  if (!offen) meta.push(PLAN_STATUSTEXT[e.status])

  function aktion(a: MenueAktion) {
    switch (a) {
      case 'aufKaufliste':
        weg.setRueckweg(null)
        void liste.aufKaufliste(e)
        return
      case 'disc': {
        const releaseId = e.releaseId
        if (releaseId === null || !confirm(`Disc für ${e.plattform ?? 'dieses Release'} erfassen?`)) return
        liste.setEben(null)
        void weg.tue(() => besitzErfassen(releaseId, e.titel, { art: 'disc' }))
        return
      }
      case 'favorit':
        void liste.aendern(e.id, { favorit: !e.favorit })
        return
      case 'verworfen':
        void liste.aendern(e.id, { status: 'verworfen' })
        return
      case 'oeffnen':
        void liste.aendern(e.id, { status: 'offen' })
        return
      case 'entfernen':
        void liste.entfernen(e)
        return
    }
  }

  return (
    <PreisZeile
      schluessel={`p${e.id}`}
      klasse={offen ? undefined : 'erledigt'}
      spielId={e.spielId}
      titel={e.titel}
      bild={e.bild}
      favorit={e.favorit}
      meta={meta}
      preise={
        offen && (
          <>
            <Gebraucht cents={e.preisCents} anbieter={e.preisAnbieter} url={e.preisUrl} />
            <Digital plattform={e.plattform} store={e.store} />
          </>
        )
      }
      menue={planMenue({
        art: e.art === 'kauf' ? 'kauf' : 'wunsch',
        status: e.status,
        favorit: e.favorit,
        releaseId: e.releaseId,
        spielId: e.spielId,
        plattform: e.plattform,
        aufKaufliste: e.aufKaufliste,
        // Ohne Preis gibt es kein Angebot zu verwerfen – aber sehr wohl
        // Verworfenes zurückzunehmen: Genau dann steht dort „unbekannt",
        // WEIL alles verworfen ist (Stufe 20h).
        angebotItemId: e.preisCents === null ? null : e.preisItemId,
        angebotVerworfen: e.preisVerworfen,
      })}
      laeuft={laeuft}
      onAktion={aktion}
      plattform={{ aktuell: e.plattform, waehlen: (p) => void liste.aendern(e.id, { plattform: p }) }}
      onDigital={(q) => {
        const releaseId = e.releaseId
        if (releaseId === null) return
        liste.setEben(null)
        void weg.tue(() => besitzErfassen(releaseId, e.titel, { art: 'digital', quelle: q }))
      }}
      angebot={
        e.releaseId === null
          ? undefined
          : {
              releaseId: e.releaseId,
              itemId: e.preisCents === null ? null : e.preisItemId,
              text: gebrauchtpreisText(e.preisCents, e.preisAnbieter),
              ohneAngebot: e.preisCents === null,
              onGeaendert: () => void liste.laden(),
            }
      }
    />
  )
}
