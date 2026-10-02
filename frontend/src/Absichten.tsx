import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, NavLink, useSearchParams } from 'react-router-dom'
import { HERKUNFTTEXT, PLAN_STATUSTEXT, PLATTFORMEN, anfrage, datum, gebrauchtpreis, type PlanArt, type PlanEintrag, type PlayStatus } from './api'
import { Preis } from './Preis'
import { nachZahl, umgekehrt, type Richtung } from './Sortierung'
import type { Ansichtsart } from './Ansicht'
import type { ChipGruppe } from './Chips'
import { Cover, PlattformChip, ZustandsZeile } from './SpielTeile'
import { Zeichen, type ZeichenName } from './Symbole'

/**
 * Geteilte Bausteine der Listen (Abschnitt 5): Wunschliste (Stufe 10), To-Do
 * und Backlog (Stufe 12) und Kaufliste (Stufe 15) zeigen dieselbe Kachel und
 * dieselben Filter. Was sich unterscheidet – die IGDB-Suche der Wunschliste,
 * das Sortieren der To-Do-Liste, die Kandidaten von Backlog und Kaufliste –,
 * bleibt in den Ansichten.
 *
 * Kaufliste (Entscheidungen des Nutzers vom 16.09.2026): Ein Wunsch kommt als
 * Kopie auf die Kaufliste, der Wunsch bleibt; „erledigt" am Kauf erledigt
 * den Wunsch mit. Was im Besitz ist, erledigt der Worker beim Erfassen
 * selbst – die Kachel zeigt „im Besitz" nur noch für Altfälle.
 *
 * To-Do und Backlog sind mit der Bewertung gekoppelt (5.5): To-Do heißt
 * „am Spielen", Backlog „pausiert". Ihre Kacheln schließen deshalb nicht
 * mit „erledigt", sondern mit der Bewertung („durchgespielt",
 * „abgebrochen"), und der Worker schließt den Eintrag mit; nie gestartete
 * im Backlog kennen nur „nicht vorgesehen".
 *
 * Sortierung und Filter liegen in der URL, wie in der Sammlung.
 */

/** Was jede Liste anbietet. To-Do hat zusätzlich die eigene Reihenfolge. */
export const SORTIERBAR = {
  favorit: 'Favoriten zuerst, dann Wertung',
  wertung: 'Kritikerwertung',
  preis: 'Gebrauchtpreis',
  titel: 'Titel',
  release: 'Erscheinungsdatum',
  angelegt: 'zuletzt angelegt',
} as const
export const SORTIERTEXT = { ...SORTIERBAR, position: 'eigene Reihenfolge' } as const
/** Was alle Listen ausser To-Do anbieten – „eigene Reihenfolge" gibt es nur dort. */
export type ListenSortierung = keyof typeof SORTIERBAR
export type Sortierung = keyof typeof SORTIERTEXT

// Seit Stufe 19d ohne 'ohne': Jeder Eintrag hängt an einem Release (Abschnitt 5).
const PLATTFORM_FILTER = PLATTFORMEN

/** Dieselbe Ordnung wie im Worker, damit eine Änderung die Kachel sofort an ihren Platz rückt. */
const nachTitel = (a: PlanEintrag, b: PlanEintrag) => a.titel.localeCompare(b.titel, 'de') || a.id - b.id
/** Was bei welchem Kriterium die natürliche Reihenfolge ist (Stufe 20e). */
export const SORTIER_NATUERLICH: Record<Sortierung, Richtung> = {
  favorit: 'ab',
  wertung: 'ab',
  preis: 'auf',
  titel: 'auf',
  release: 'auf',
  angelegt: 'ab',
  position: 'auf',
}

/**
 * Der Vergleicher zur Wahl. Die Richtung geht hinein, statt das Ergebnis
 * umzukehren – sonst stünden absteigend die Einträge **ohne** Wert vorn, und
 * „unbekannt" ist kein hoher Wert, sondern gar keiner (5.2).
 */
export function VERGLEICH(sortierung: Sortierung, richtung: Richtung): (a: PlanEintrag, b: PlanEintrag) => number {
  switch (sortierung) {
    case 'titel':
      return richtung === 'auf' ? nachTitel : umgekehrt(nachTitel)
    case 'wertung':
      return nachZahl((e: PlanEintrag) => e.kritik, richtung === 'auf' ? 'ab' : 'auf', nachTitel)
    case 'preis':
      return nachZahl((e: PlanEintrag) => e.preisCents, richtung, nachTitel)
    case 'position':
      return nachZahl((e: PlanEintrag) => e.position, richtung, (a, b) => a.id - b.id)
    case 'angelegt': {
      const auf = (a: PlanEintrag, b: PlanEintrag) => a.angelegtAm.localeCompare(b.angelegtAm) || a.id - b.id
      return richtung === 'auf' ? umgekehrt(auf) : auf
    }
    case 'release': {
      // Ohne Datum ans Ende, in beiden Richtungen.
      const jahr = (e: PlanEintrag) => (e.erscheinungsdatum ? Number(e.erscheinungsdatum.replaceAll('-', '')) : null)
      return nachZahl(jahr, richtung, nachTitel)
    }
    default: {
      const auf = (a: PlanEintrag, b: PlanEintrag) =>
        Number(a.favorit) - Number(b.favorit) || nachZahl((e: PlanEintrag) => e.kritik, 'ab', nachTitel)(a, b)
      return richtung === 'ab' ? umgekehrt(auf) : auf
    }
  }
}

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
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [eben, setEben] = useState<PlanEintrag | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)

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
    setParams(neu, { replace: true })
  }

  function setzeParam(name: string, wert: string) {
    const neu = new URLSearchParams(params)
    if (wert) neu.set(name, wert)
    else neu.delete(name)
    setParams(neu, { replace: true })
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
    setHinweis(null)
    try {
      const e = await anfrage<PlanEintrag & { wuenscheErledigt?: number }>(`/api/plans/${id}`, { methode: 'PATCH', koerper })
      ersetze(e)
      // Kauf erledigt erledigt den Wunsch mit (Stufe 15) - das steht auf einer anderen Seite, deshalb sagen.
      if (e.wuenscheErledigt) setHinweis(`„${e.titel}" ist damit auch auf der Wunschliste erledigt.`)
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
    setHinweis(null)
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
    art, daten, setDaten, meldung, setMeldung, hinweis, laeuft, setLaeuft, eben, setEben,
    sortierung, richtung, setzeSortierung, nurFavoriten, alle, plattformen, suche,
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

/** Fehlermeldung und die Rückgängig-Zeile nach dem Anlegen. */
export function Meldungen({ liste }: { liste: PlanListe }) {
  const { meldung, hinweis, eben, rueckgaengig } = liste
  return (
    <>
      {meldung && <p role="alert" className="auffaellig">{meldung}</p>}
      {hinweis && <p role="status" className="hinweis">{hinweis}</p>}
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
export function Reiter({ eintraege }: { eintraege: ReadonlyArray<readonly [ziel: string, text: string]> }) {
  return (
    <nav className="reiter" aria-label="Listen">
      {eintraege.map(([ziel, text]) => (
        <NavLink key={ziel} to={ziel}>
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
 * Eine Karte der Absichtslisten – als Kachel oder als Zeile (Stufe 19).
 *
 * Cover, Titel, Plattform, Kritik und Jahr, Favoritenstern und die Knöpfe als
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
        {e.spielId === null ? 'ohne IGDB-Eintrag' : `Kritik ${e.kritik ?? 'unbekannt'}`}
        {e.releaseStatus === 'angekuendigt' && ` · erscheint ${e.erscheinungsdatum ? datum(e.erscheinungsdatum) : 'unbekannt'}`}
        {e.releaseStatus !== 'angekuendigt' && e.erscheinungsdatum && ` · ${e.erscheinungsdatum.slice(0, 4)}`}
        {e.art === 'kauf' && e.herkunft && ` · ${HERKUNFTTEXT[e.herkunft] ?? e.herkunft}`}
        {/* Der Preis nur dort, wo er eine Entscheidung trägt: auf der
            Kaufliste und am offenen Wunsch. Im Backlog oder auf To-Do steht
            das Spiel schon im Regal (Stufe 20e).

            Und nur, wenn es einen gibt. „Gebraucht unbekannt" an jedem der
            rund 350 Wünsche wäre Lärm – die Kachelzeile lässt auch sonst weg,
            was leer ist (Herkunft, Jahr). Wo der Preis eine Spalte ist, in
            der Lückenansicht, steht „unbekannt" weiterhin ausgeschrieben. */}
        {(e.art === 'kauf' || e.art === 'wunsch') && e.status === 'offen' && e.preisCents !== null && (
          <>
            {' · '}Gebraucht <Preis {...gebrauchtpreis(e.preisCents, e.preisAnbieter, e.preisUrl)} />
          </>
        )}
        {(e.art === 'kauf' || e.art === 'wunsch') && e.status === 'offen' && e.imBesitz && ' · im Besitz'}
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
