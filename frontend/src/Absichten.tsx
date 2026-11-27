import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { stateNachFilter } from './filterverlauf'
import { PLAN_STATUSTEXT, PLATTFORMEN, anfrage, datum, type PlanArt, type PlanEintrag, type PlayStatus } from './api'
import { SORTIERBAR, SORTIERTEXT, SORTIER_NATUERLICH, VERGLEICH, type Richtung, type Sortierung } from './vergleich'
import type { Ansichtsart } from './Ansicht'
import type { ChipGruppe } from './Chips'
import { Cover, PlattformChip, ZustandsZeile } from './SpielTeile'
import { Zeichen, type ZeichenName } from './Symbole'
import { PREIS_FILTER, PREIS_FILTER_TEXT, preisFilterAusParam } from './preisliste'

/**
 * Geteilte Bausteine der Listen (Abschnitt 5): Wunschliste (Stufe 10), To-Do
 * und Backlog (Stufe 12) und Kaufliste (Stufe 15) teilen Zustand, Filter und
 * Schreibzugriffe. Was sich unterscheidet – die IGDB-Suche der Wunschliste,
 * das Sortieren der To-Do-Liste, die Kandidaten des Backlogs –, bleibt in den
 * Ansichten.
 *
 * Die Kachel `PlanKarte` tragen seit Nachtrag f2e nur noch To-Do und Backlog.
 * Wunschliste und Kaufliste zeigen Zeilen mit Preisen (`PreisZeile.tsx`,
 * Entscheidung des Nutzers vom 27.11.2026); „erledigt" gibt es dort nicht
 * mehr als Handgriff – ein Wunsch oder Kauf erledigt sich durch das Erfassen
 * einer Disc oder Berechtigung, das der Worker selbst nachzieht.
 *
 * Kaufliste (Entscheidungen des Nutzers vom 16.09.2026): Ein Wunsch kommt als
 * Kopie auf die Kaufliste, der Wunsch bleibt.
 *
 * To-Do und Backlog sind mit der Bewertung gekoppelt (5.5): To-Do heißt
 * „am Spielen", Backlog „pausiert". Ihre Kacheln schließen deshalb nicht
 * mit „erledigt", sondern mit der Bewertung („durchgespielt",
 * „abgebrochen"), und der Worker schließt den Eintrag mit; nie gestartete
 * im Backlog kennen nur „nicht vorgesehen".
 *
 * Sortierung und Filter liegen in der URL, wie in der Sammlung.
 */

export { SORTIERBAR, SORTIERTEXT, SORTIER_NATUERLICH, VERGLEICH, type ListenSortierung, type Sortierung } from './vergleich'

// Seit Stufe 19d ohne 'ohne': Jeder Eintrag hängt an einem Release (Abschnitt 5).
const PLATTFORM_FILTER = PLATTFORMEN

/** Die Liste im Dativ, für Meldungen und Rückfragen. */
export const LISTE_DATIV: Record<PlanArt, string> = {
  wunsch: 'der Wunschliste',
  todo: 'der To-Do-Liste',
  backlog: 'dem Backlog',
  kauf: 'der Kaufliste',
}

/** „auf die Wunschliste gesetzt", „auf To-Do gesetzt", „ins Backlog gesetzt". */
function gesetztText(e: PlanEintrag): string {
  if (e.status === 'verworfen') return 'als nicht vorgesehen abgelehnt'
  return { wunsch: 'auf die Wunschliste gesetzt', todo: 'auf To-Do gesetzt', backlog: 'ins Backlog gesetzt', kauf: 'auf die Kaufliste gesetzt' }[e.art]
}

type Antwort = { sortierung: Sortierung; eintraege: PlanEintrag[] }

/**
 * Zustand und Schreibzugriffe einer Liste. `laden` fragt den Worker mit den
 * Filtern aus der URL; `ersetze` sortiert eine geänderte Kachel lokal ein,
 * ohne neu zu laden; `anlegen` merkt sich den neuen Eintrag für „Rückgängig".
 */
export function usePlanListe(art: PlanArt) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [eben, setEben] = useState<PlanEintrag | null>(null)

  const standard: Sortierung = art === 'todo' ? 'position' : 'favorit'
  // „eigene Reihenfolge" gibt es nur auf To-Do. Anderswo ist `?sort=position`
  // kein gueltiger Wert und faellt auf den Standard zurueck – damit ist der
  // Wert, den die Sortierleiste bekommt, immer einer, den sie auch anbietet.
  const erlaubt = art === 'todo' ? SORTIERTEXT : SORTIERBAR
  const sortierung: Sortierung = (params.get('sort') as Sortierung) in erlaubt ? (params.get('sort') as Sortierung) : standard
  const richtung: Richtung =
    params.get('richtung') === 'ab' || params.get('richtung') === 'auf'
      ? (params.get('richtung') as Richtung)
      : SORTIER_NATUERLICH[sortierung]
  const nurFavoriten = params.get('favorit') === '1'
  const alle = params.get('status') === 'alle'
  const plattformParam = params.get('plattform') ?? ''
  const plattformen = new Set(plattformParam.split(',').filter((p) => (PLATTFORM_FILTER as readonly string[]).includes(p)))
  const suche = (params.get('suche') ?? '').trim()
  // Im Browser gefiltert (Nachtrag f2e-c), nicht im Worker - die Ansicht wendet ihn an.
  const preisFilter = preisFilterAusParam(params.get('preis'))

  const laden = useCallback(async () => {
    try {
      const abfrage = new URLSearchParams({ kind: art, sort: sortierung })
      if (nurFavoriten) abfrage.set('favorit', '1')
      if (alle) abfrage.set('status', 'alle')
      if (plattformParam) abfrage.set('plattform', plattformParam)
      if (suche) abfrage.set('suche', suche)
      const d = await anfrage<Antwort>(`/api/plans?${abfrage}`)
      // Der Worker sortiert in seiner natürlichen Richtung; die zweite macht
      // der Browser. Die Listen sind klein (nach dem Import rund 350 Zeilen),
      // und so braucht die Route keinen zweiten Parameter.
      setDaten({ ...d, eintraege: [...d.eintraege].sort(VERGLEICH(sortierung, richtung)) })
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
    }
  }, [art, sortierung, richtung, nurFavoriten, alle, plattformParam, suche])

  useEffect(() => {
    void laden()
  }, [laden])

  /** Kriterium und Richtung zusammen – nur Abweichungen landen in der URL. */
  function setzeSortierung(w: Sortierung, r: Richtung) {
    const neu = new URLSearchParams(params)
    if (w === standard) neu.delete('sort')
    else neu.set('sort', w)
    if (r === SORTIER_NATUERLICH[w]) neu.delete('richtung')
    else neu.set('richtung', r)
    // Bei offener Filtertafel bleibt ihre Markierung - sonst schloesse die
    // Sortierung sie und ihr Eintrag bliebe verwaist im Verlauf (Stufe f2b).
    setParams(neu, { replace: true, state: stateNachFilter(location.state) })
  }

  function setzeParam(name: string, wert: string) {
    const neu = new URLSearchParams(params)
    if (wert) neu.set(name, wert)
    else neu.delete(name)
    // Die Such-Markierung bleibt, damit Zurueck den Filter mitnimmt (`suchverlauf.ts`).
    setParams(neu, { replace: true, state: stateNachFilter(location.state) })
  }

  function plattformFilterUmschalten(p: string) {
    const neu = new Set(plattformen)
    if (neu.has(p)) neu.delete(p)
    else neu.add(p)
    setzeParam('plattform', [...neu].join(','))
  }

  /** Eine Kachel im lokalen Stand ersetzen und neu einsortieren – kein Neuladen. */
  function ersetze(e: PlanEintrag) {
    setDaten((d) => {
      if (!d) return d
      const rest = d.eintraege.filter((x) => x.id !== e.id)
      const bleibt =
        e.art === art &&
        (alle || e.status === 'offen') &&
        (!nurFavoriten || e.favorit) &&
        (plattformen.size === 0 || (e.plattform !== null && plattformen.has(e.plattform))) &&
        (suche === '' || e.titel.toLocaleLowerCase('de').includes(suche.toLocaleLowerCase('de')))
      return { ...d, eintraege: (bleibt ? [...rest, e] : rest).sort(VERGLEICH(sortierung, richtung)) }
    })
  }

  async function aendern(id: number, koerper: Record<string, unknown>) {
    setMeldung(null)
    try {
      // Den Hinweis „auch auf der Wunschliste erledigt" (`wuenscheErledigt`)
      // gibt es seit Nachtrag f2e nicht mehr: Kein Listenknopf setzt einen
      // Kauf noch von Hand auf erledigt.
      ersetze(await anfrage<PlanEintrag>(`/api/plans/${id}`, { methode: 'PATCH', koerper }))
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Ändern fehlgeschlagen.')
    }
  }

  async function entfernen(e: PlanEintrag) {
    if (!confirm(`„${e.titel}" von ${LISTE_DATIV[art]} entfernen?`)) return
    setMeldung(null)
    try {
      await anfrage(`/api/plans/${e.id}`, { methode: 'DELETE' })
      setDaten((d) => d && { ...d, eintraege: d.eintraege.filter((x) => x.id !== e.id) })
      if (eben?.id === e.id) setEben(null)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Entfernen fehlgeschlagen.')
    }
  }

  /** Anlegen (Standard: diese Liste; `art` im Körper übersteuert); der neue Eintrag steht für „Rückgängig" bereit. */
  async function anlegen(koerper: Record<string, unknown>): Promise<PlanEintrag | null> {
    setLaeuft(true)
    setMeldung(null)
    try {
      const e = await anfrage<PlanEintrag & { spielAngelegt: boolean }>('/api/plans', {
        methode: 'POST',
        koerper: { art, ...koerper },
      })
      setEben(e)
      await laden()
      return e
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Anlegen fehlgeschlagen.')
      return null
    } finally {
      setLaeuft(false)
    }
  }

  /**
   * Bewertung vom Listenknopf aus (5.5): nur der Status, Datum und Notiz
   * bleiben; der Worker zieht den Eintrag nach, deshalb neu laden.
   */
  async function bewerten(e: PlanEintrag, status: PlayStatus) {
    if (e.releaseId === null) return
    setMeldung(null)
    try {
      await anfrage(`/api/releases/${e.releaseId}/play-status`, { methode: 'PATCH', koerper: { status } })
      await laden()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Bewerten fehlgeschlagen.')
    }
  }

  /** Löscht den eben angelegten Eintrag – samt Spiel und Release, falls sie nur dafür entstanden. */
  async function rueckgaengig() {
    if (!eben) return
    const e = eben
    setEben(null)
    try {
      await anfrage(`/api/plans/${e.id}`, { methode: 'DELETE' })
      // Ein Eintrag einer anderen Liste (Kopie auf die Kaufliste): Die eigene Liste neu laden, weil ihre Kacheln ihn nennen.
      if (e.art !== art) await laden()
      else setDaten((d) => d && { ...d, eintraege: d.eintraege.filter((x) => x.id !== e.id) })
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Rückgängig fehlgeschlagen.')
    }
  }

  /** Kopie eines Wunsches auf die Kaufliste (Stufe 15): dasselbe Ziel, Favorit kommt mit, Herkunft „wunsch". */
  async function aufKaufliste(e: PlanEintrag) {
    const ziel =
      e.releaseId !== null ? { releaseId: e.releaseId } : e.spielId !== null ? { spielId: e.spielId, plattform: '' } : { titel: e.titel }
    await anlegen({ art: 'kauf', herkunft: 'wunsch', favorit: e.favorit, ...ziel })
  }

  return {
    art, daten, setDaten, meldung, setMeldung, laeuft, setLaeuft, eben, setEben,
    sortierung, richtung, setzeSortierung, nurFavoriten, alle, plattformen, suche, preisFilter,
    laden, setzeParam, plattformFilterUmschalten, ersetze, aendern, entfernen, anlegen, rueckgaengig, bewerten, aufKaufliste,
  }
}

/** Link auf „Erscheint bald" (Use Case 11), nur wenn es dort etwas gibt. */
export function ErscheintBaldLink() {
  const [anzahl, setAnzahl] = useState(0)
  useEffect(() => {
    anfrage<{ anzahl: number }>('/api/upcoming').then((a) => setAnzahl(a.anzahl)).catch(() => {})
  }, [])
  if (anzahl === 0) return null
  return (
    <Link to="/erscheint-bald" className="zeile">
      {anzahl === 1 ? 'Ein vorgemerkter Titel erscheint erst noch' : `${anzahl} vorgemerkte Titel erscheinen erst noch`}
    </Link>
  )
}

export type PlanListe = ReturnType<typeof usePlanListe>

/**
 * Die Filter der Absichtslisten als Chips (Stufe 19) – dieselbe Gestalt wie
 * in der Sammlung. Vorher war es hier eine Kästchenreihe und dort ein Band
 * aus Dropdowns; das war dieselbe Aufgabe in zwei Formen.
 */
export const PLAN_CHIPS: readonly ChipGruppe[] = [
	{
		param: 'plattform',
		titel: 'Plattform',
		mehrfach: true,
    werte: PLATTFORMEN.map((p) => [p, p === 'PSVITA' ? 'Vita' : p] as const),
	},
	{ param: 'favorit', titel: 'Auswahl', werte: [['1', 'Favoriten']] },
	{ param: 'status', titel: 'Erledigte', werte: [['alle', 'auch erledigte und verworfene']] },
]

/**
 * Die Preisfilter (Nachtrag f2e-c) – nur auf Wunsch- und Kaufliste, wo die
 * Zeilen Preise tragen. Die Gruppe grenzt gemeinsam ein (`passtZuPreis`) und
 * steht in der Tafel direkt hinter den Favoriten, in derselben Zeile.
 */
export const PREIS_GRUPPE: ChipGruppe = {
  param: 'preis',
  // Dieselbe Überschrift wie die Favoriten: eine Zeile „Auswahl" in der Tafel (Wunsch des Nutzers vom 27.11.2026).
  titel: 'Auswahl',
  mehrfach: true,
  werte: PREIS_FILTER.map((w) => [w, PREIS_FILTER_TEXT[w]] as const),
}

/** Die Filter von Wunsch- und Kaufliste: die der Absichtslisten und die Preise. */
export const PREISLISTE_CHIPS: readonly ChipGruppe[] = PLAN_CHIPS.flatMap((g) => (g.param === 'favorit' ? [g, PREIS_GRUPPE] : [g]))

/** Fehlermeldung und die Rückgängig-Zeile nach dem Anlegen. */
export function Meldungen({ liste }: { liste: PlanListe }) {
  const { meldung, eben, rueckgaengig } = liste
  return (
    <>
      {meldung && <p role="alert" className="auffaellig">{meldung}</p>}
      {eben && (
        <p role="status" className="hinweis">
          „{eben.titel}" {gesetztText(eben)}.{' '}
          <button type="button" onClick={rueckgaengig}>Rückgängig</button>
        </p>
      )}
    </>
  )
}

/**
 * Reiter einer Seite (Abschnitt 13). To-Do und Backlog waren von Anfang an
 * zwei Reiter; seit Stufe 19 sind Kaufliste und Lücken die Reiter der
 * Wunschliste, damit die untere Leiste vier Symbole trägt statt sieben.
 */
export function Reiter({
  eintraege,
}: {
  eintraege: ReadonlyArray<readonly [ziel: string, text: string, zeichen: ZeichenName]>
}) {
  // Das Zeichen nur am Desktop (Stufe f2c): Auf 360 px ragte die Zeile
  // „Wunschliste | Kaufliste | Lücken" mit Zeichen 48 px über.
  return (
    <nav className="reiter" aria-label="Listen">
      {eintraege.map(([ziel, text, zeichen]) => (
        <NavLink key={ziel} to={ziel}>
          <Zeichen name={zeichen} groesse={17} className="nur-desktop" />
          {text}
        </NavLink>
      ))}
    </nav>
  )
}

type KarteProps = {
  e: PlanEintrag
  liste: PlanListe
  art: Ansichtsart
  /** Artspezifische Knöpfe, etwa „auf die Kaufliste". */
  knoepfe?: ReactNode
  liRef?: (el: HTMLLIElement | null) => void
  style?: CSSProperties
  className?: string
  /**
   * Die Eigenschaften von `useSortable` (To-Do). Sie sitzen auf der **ganzen
   * Karte**, nicht auf einem Griff – seit Stufe 19 gibt es keinen mehr.
   */
  zieher?: Record<string, unknown>
}

/** Ein Symbolknopf der Karte. Was er tut, steht im `aria-label`, nicht daneben. */
function IKnopf({
  name,
  text,
  onClick,
  gefahr,
}: {
  name: ZeichenName
  text: string
  onClick: () => void
  gefahr?: boolean
}) {
  return (
    <button
      type="button"
      className={gefahr ? 'ikone gefahr' : 'ikone'}
      aria-label={text}
      title={text}
      onClick={onClick}
      // Die ganze Karte ist in der To-Do-Liste der Ziehgriff (Stufe 19);
      // ohne das hier startete jeder Knopfdruck eine Verschiebung.
      onPointerDown={(ev) => ev.stopPropagation()}
    >
      <Zeichen name={name} groesse={19} />
    </button>
  )
}

/**
 * Eine Karte von To-Do und Backlog – als Kachel oder als Zeile (Stufe 19).
 * Wunschliste und Kaufliste tragen seit Nachtrag f2e `PlanPreisZeile`; die
 * Preise, die Herkunft und „im Besitz" stehen deshalb nur noch dort.
 *
 * Cover, Titel, Plattform, Wertung (die Spielerwertung, seit 20k) und Jahr, Favoritenstern und die Knöpfe als
 * Symbole. Bei To-Do und Backlog am Release stehen statt „erledigt" die
 * Bewertungen „durchgespielt" und „abgebrochen" (Kopplung, 5.5); nie
 * gestartete kennen stattdessen nur „nicht vorgesehen".
 *
 * Zwei Dinge sind seit Stufe 19 anders (Rückmeldung des Nutzers vom
 * 22.09.2026):
 *
 * - **Die Notiz wird nicht mehr angezeigt.** Sie bleibt in Datenmodell, API
 *   und Spieldetail – „es reicht, wenn sie nicht angezeigt wird".
 * - **Die Plattform ist nur in der Kachel änderbar.** In der Zeile steht sie
 *   als Kennzeichen; das Dropdown hätte dort die Knopfreihe verdrängt. Das
 *   Umhängen bleibt seltene Nachpflege – seit Stufe 19d trägt jeder Eintrag
 *   von Anfang an eine der vier Plattformen (Abschnitt 5).
 */
export function PlanKarte({ e, liste, art, knoepfe, liRef, style, className, zieher }: KarteProps) {
  const { aendern, entfernen, bewerten } = liste
  /*
   * Die Plattform steht als Kennzeichen da, nicht als Dropdown (Wunsch des
   * Nutzers vom 24.09.2026: „Plattformauswahl soll weg und Plattformboxen
   * sollen stattdessen dorthin"). Ein Tipp darauf macht sie wieder zum
   * Dropdown - das Umhängen eines Eintrags auf eine andere Plattform bleibt
   * damit möglich, ohne dass ein Auswahlfeld die Zeile beherrscht.
   */
  const [plattformOffen, setPlattformOffen] = useState(false)
  const gekoppelt = (e.art === 'todo' || e.art === 'backlog') && e.releaseId !== null
  const nieGestartet = e.eigenerStatus === null || e.eigenerStatus === 'nicht_gespielt'
  const klassen = [
    art === 'kacheln' ? 'kachel' : 'eintrag',
    e.status === 'offen' ? '' : 'erledigt',
    zieher ? 'ziehbar' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const meta = (
    <div className="release-daten umbrechend">
      {e.spielId === null ? (
        // Freitext hat kein Spiel und deshalb keine Plattform - der eine Fall,
        // in dem es keine gibt (Abschnitt 5). Das Kennzeichen sagt den Grund,
        // seit Stufe 19d nicht mehr "ohne Plattform".
        <span className="plattform leer">Freitext</span>
      ) : plattformOffen ? (
        <select
          value={e.plattform ?? ''}
          aria-label="Plattform"
          autoFocus
          onBlur={() => setPlattformOffen(false)}
          onChange={(ev) => {
            setPlattformOffen(false)
            void aendern(e.id, { plattform: ev.target.value })
          }}
        >
          {PLATTFORMEN.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          className="plattform-knopf"
          title="Plattform ändern – ein Release entsteht bei Bedarf"
          onClick={() => setPlattformOffen(true)}
          onPointerDown={(ev) => ev.stopPropagation()}
        >
          {/* Seit Stufe 19d entsteht kein Eintrag mehr ohne Release; ein alter
              zeigt hier eine Einladung, keinen gültigen Zustand. */}
          {e.plattform ? <PlattformChip plattform={e.plattform} /> : <span className="plattform leer">Plattform wählen</span>}
        </button>
      )}
      {e.art !== 'wunsch' && e.eigenerStatus && <ZustandsZeile status={e.eigenerStatus} klein />}
      <span className="ruhig klein">
        {e.spielId === null ? 'ohne IGDB-Eintrag' : `Wertung ${e.spieler ?? 'unbekannt'}`}
        {e.releaseStatus === 'angekuendigt' && ` · erscheint ${e.erscheinungsdatum ? datum(e.erscheinungsdatum) : 'unbekannt'}`}
        {e.releaseStatus !== 'angekuendigt' && e.erscheinungsdatum && ` · ${e.erscheinungsdatum.slice(0, 4)}`}
        {e.status !== 'offen' && ` · ${PLAN_STATUSTEXT[e.status]}`}
      </span>
    </div>
  )

  const stern = (
    <button
      type="button"
      className={e.favorit ? 'ikone stern aktiv' : 'ikone stern'}
      aria-pressed={e.favorit}
      aria-label={e.favorit ? 'Favorit – klicken zum Entfernen' : 'Als Favorit markieren'}
      title={e.favorit ? 'Favorit – klicken zum Entfernen' : 'Als Favorit markieren'}
      onClick={() => aendern(e.id, { favorit: !e.favorit })}
      onPointerDown={(ev) => ev.stopPropagation()}
    >
      <Zeichen name="stern" groesse={19} gefuellt={e.favorit} />
    </button>
  )

  const knopfzeile = (
    <div className="knoepfe">
      {art === 'zeilen' && stern}
      {e.status === 'offen' ? (
        <>
          {knoepfe}
          {gekoppelt ? (
            nieGestartet ? (
              <IKnopf name="kreuz" text="nicht vorgesehen" onClick={() => aendern(e.id, { status: 'verworfen' })} />
            ) : (
              <>
                <IKnopf name="durchgespielt" text="durchgespielt" onClick={() => bewerten(e, 'durchgespielt')} />
                <IKnopf name="abgebrochen" text="abgebrochen" onClick={() => bewerten(e, 'abgebrochen')} />
              </>
            )
          ) : (
            <>
              <IKnopf name="haken" text="erledigt" onClick={() => aendern(e.id, { status: 'erledigt' })} />
              <IKnopf name="kreuz" text="verworfen" onClick={() => aendern(e.id, { status: 'verworfen' })} />
            </>
          )}
        </>
      ) : (
        <IKnopf name="oeffnen" text="wieder öffnen" onClick={() => aendern(e.id, { status: 'offen' })} />
      )}
      <IKnopf name="muell" text="entfernen" gefahr onClick={() => entfernen(e)} />
    </div>
  )

  const titel =
    e.spielId !== null ? (
      <Link to={`/spiel/${e.spielId}`} className="titel">
        {e.titel}
      </Link>
    ) : (
      <span className="titel">{e.titel}</span>
    )

  if (art === 'kacheln') {
    return (
      <li ref={liRef} style={style} className={klassen} {...zieher}>
        <div className="kachel-bild">
          <Cover
            bild={e.bild}
            cover={e.bild !== null}
            titel={e.titel}
            ziel={e.spielId !== null ? `/spiel/${e.spielId}` : undefined}
          />
          <span className="ecke">{stern}</span>
        </div>
        {titel}
        {meta}
        {knopfzeile}
      </li>
    )
  }

  return (
    <li ref={liRef} style={style} className={`${klassen} hoch`} {...zieher}>
      <Cover
        bild={e.bild}
        cover={e.bild !== null}
        titel={e.titel}
        ziel={e.spielId !== null ? `/spiel/${e.spielId}` : undefined}
        breite={52}
      />
      <div className="eintrag-text">
        {titel}
        {meta}
        {knopfzeile}
      </div>
    </li>
  )
}
