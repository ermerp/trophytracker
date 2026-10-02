import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { STATUSTEXT, anfrage, gebrauchtpreis, marktBefund, type DiscFassung, type PlayStatus } from './api'
import { Preis } from './Preis'
import { nachZahl, Sortierleiste, umgekehrt, type Richtung } from './Sortierung'
import { Reiter } from './Absichten'
import { Chips, type ChipGruppe } from './Chips'
import { Kopfzeile } from './Kopfzeile'
import { Zeichen } from './Symbole'
import { PlattformChip } from './SpielTeile'
import { WUNSCH_REITER } from './Wunschliste'

/**
 * Lücken (Use Case 3, Stufe 14): digital gespielt, Disc-Fassung belegt,
 * nicht im Regal. „physisch nicht gewünscht" ist ein verworfener Kaufeintrag
 * (5.3) – die Lücke bleibt als Tatsache in der View, die Ansicht blendet sie
 * nur aus; „Rückgängig" und „wieder zeigen" löschen den Eintrag (wie
 * „nicht vorgesehen" im Backlog). Stufe 15 macht daraus die Kaufliste.
 *
 * Darunter „Disc-Fassung unbekannt": digital gespielt, nicht im Regal, aber
 * ohne Beleg für eine Disc (Entscheidung des Nutzers vom 16.09.2026, Block
 * B). Dort entsteht das „nein" von Hand – oder ein „ja", wenn er es besser
 * weiß als IGDB.
 *
 * **„physisch nicht gewünscht" gibt es im zweiten Block nicht mehr**
 * (Entscheidung des Nutzers vom 02.10.2026, sie kehrt seinen Wunsch vom
 * 16.09.2026 um). Dort steht eine einzige Frage – gibt es die Disc? –, und
 * ein dritter Knopf, der die Frage offen lässt und die Zeile trotzdem
 * ausblendet, gehört nicht in dieselbe Reihe. Die Absicht entscheidet sich
 * danach in der Lückenliste, wo die Disc-Fassung geklärt ist.
 *
 * Seit Stufe 20 stehen echte Gebrauchtpreise darin – „ab 12,77 € bei rebuy",
 * eine Forderung bei einem Anbieter, kein Wert. Und der zweite Block nennt,
 * was die eBay-Suche über die unbekannte Disc-Fassung sagt: Findet sie in der
 * Plattform-Kategorie gar nichts, spricht das für „nur digital" (gemessen 3 %
 * Fehlrate). Die Reihenfolge holt diese Fälle nach vorne, damit der Block
 * abarbeitbar ist; entschieden wird er trotzdem von Hand (Abschnitt 3).
 */

type Luecke = {
  releaseId: number
  spielId: number
  titel: string
  bild: string | null
  plattform: string
  discFassung: DiscFassung
  discQuelle: string | null
  fortschritt: number
  platin: boolean
  eigenerStatus: PlayStatus | null
  besterGebrauchtpreisCents: number | null
  gebrauchtpreisAnbieter: string | null
  gebrauchtpreisUrl: string | null
  marktGeprueftAm: string | null
  marktRohangebote: number | null
  verworfen: boolean
  planId: number | null
}

/**
 * Die eindeutigen Fälle zuerst: erst „eBay kennt nichts" (0 Rohangebote),
 * dann das Ungeprüfte, dann das mit Angeboten ohne klare Zuordnung. So steht
 * oben, was sich in einem Klick entscheiden lässt.
 */
function nachBefund(zeilen: readonly Luecke[]): Luecke[] {
  const rang = (l: Luecke) => (l.marktRohangebote === 0 ? 0 : l.marktRohangebote === null ? 1 : 2)
  return [...zeilen].sort((a, b) => rang(a) - rang(b) || a.titel.localeCompare(b.titel, 'de'))
}

/**
 * Sortierung der Lückenliste (Stufe 20e, nachgereicht am 02.10.2026).
 *
 * Die Ansicht hatte als einzige Liste gar keine – sie kam aus der Datenbank
 * nach Titel und blieb so. Für den Gebrauchtpreis ist das zu wenig: „Was
 * fülle ich als Nächstes auf" ist genau die Frage, die ein Preis beantwortet.
 *
 * Gilt nur für die obere Liste. Der zweite Block bleibt nach seinem Befund
 * geordnet – dort ist „eBay kennt kein Angebot" die Reihenfolge, die ihn
 * abarbeitbar macht, und ein Preis steht dort ohnehin selten.
 */
const LUECKEN_SORTIERUNG = {
  titel: 'Titel',
  preis: 'Gebrauchtpreis',
  fortschritt: 'Fortschritt',
} as const
type LueckenSortierung = keyof typeof LUECKEN_SORTIERUNG

/** Was bei welchem Kriterium die natürliche Reihenfolge ist. */
const LUECKEN_NATUERLICH: Record<LueckenSortierung, Richtung> = {
  titel: 'auf',
  preis: 'auf',
  fortschritt: 'ab',
}

const nachLueckenTitel = (a: Luecke, b: Luecke) =>
  a.titel.localeCompare(b.titel, 'de') || a.plattform.localeCompare(b.plattform)

/**
 * Der Vergleicher zur Wahl – die Richtung geht hinein, statt das Ergebnis
 * umzukehren: Ohne Preis bleibt in beiden Richtungen hinten (5.2).
 */
function lueckenVergleich(sortierung: LueckenSortierung, richtung: Richtung) {
  if (sortierung === 'titel') return richtung === 'auf' ? nachLueckenTitel : umgekehrt(nachLueckenTitel)
  const wert =
    sortierung === 'preis'
      ? (l: Luecke) => l.besterGebrauchtpreisCents
      : (l: Luecke) => l.fortschritt
  return nachZahl(wert, richtung, nachLueckenTitel)
}

/** Die beiden Umschalter der Ansicht, als Chips wie überall sonst (Stufe 19). */
const LUECKEN_CHIPS: readonly ChipGruppe[] = [
  { param: 'verworfene', titel: 'Verworfene', werte: [['1', 'auch verworfene']] },
  { param: 'unbekannte', titel: 'Zweiter Block', werte: [['1', 'Disc-Fassung unbekannt']] },
]

type Antwort = { anzahl: number; verworfen: number; unbekannt: number; luecken: Luecke[]; moeglich: Luecke[] }

type Eben =
  | { art: 'verworfen'; titel: string; planId: number }
  | { art: 'disc'; titel: string; releaseId: number; gesetzt: DiscFassung }

export function Luecken() {
  // Die beiden Umschalter schreibt jetzt die Chip-Leiste in die URL.
  const [params, setParams] = useSearchParams()
  const mitVerworfenen = params.get('verworfene') === '1'
  const moeglichOffen = params.get('unbekannte') === '1'
  const sortierung: LueckenSortierung =
    (params.get('sort') as LueckenSortierung) in LUECKEN_SORTIERUNG ? (params.get('sort') as LueckenSortierung) : 'titel'
  const richtung: Richtung = params.get('richtung') === 'ab' || params.get('richtung') === 'auf'
    ? (params.get('richtung') as Richtung)
    : LUECKEN_NATUERLICH[sortierung]
  // Der obere Block ist zugeklappbar, damit der zweite schnell erreichbar ist
  // (Wunsch des Nutzers vom 02.10.2026). Bewusst KEIN URL-Parameter: Er soll
  // beim Aufruf der Ansicht immer offen sein, das Zuklappen gilt nur für den
  // Moment. Der zweite Block steht dagegen in der URL - dort ist "geöffnet"
  // eine Arbeitsentscheidung, die ein Neuladen überstehen soll.
  const [lueckenOffen, setLueckenOffen] = useState(true)
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [eben, setEben] = useState<Eben | null>(null)

  const laden = useCallback(async () => {
    try {
      setDaten(await anfrage<Antwort>(`/api/gaps?unbekannte=1${mitVerworfenen ? '&verworfene=1' : ''}`))
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
    }
  }, [mitVerworfenen])

  useEffect(() => {
    void laden()
  }, [laden])


  async function tue(aktion: () => Promise<unknown>, danach?: Eben | null) {
    setLaeuft(true)
    setMeldung(null)
    try {
      await aktion()
      if (danach !== undefined) setEben(danach)
      await laden()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  const verwerfen = (l: Luecke) =>
    tue(async () => {
      const a = await anfrage<{ id: number }>(`/api/gaps/${l.releaseId}/verwerfen`, { methode: 'POST' })
      setEben({ art: 'verworfen', titel: l.titel, planId: a.id })
    })

  const wiederZeigen = (l: Luecke) =>
    l.planId !== null ? tue(() => anfrage(`/api/plans/${l.planId}`, { methode: 'DELETE' }), null) : Promise.resolve()

  const discSetzen = (l: Luecke, fassung: DiscFassung) =>
    tue(
      () => anfrage(`/api/releases/${l.releaseId}`, { methode: 'PATCH', koerper: { discFassung: fassung } }),
      { art: 'disc', titel: l.titel, releaseId: l.releaseId, gesetzt: fassung },
    )

  async function rueckgaengig() {
    if (!eben) return
    const e = eben
    await tue(
      () =>
        e.art === 'verworfen'
          ? anfrage(`/api/plans/${e.planId}`, { methode: 'DELETE' })
          : anfrage(`/api/releases/${e.releaseId}`, { methode: 'PATCH', koerper: { discFassung: 'unbekannt' } }),
      null,
    )
  }

  return (
    <>
      <Kopfzeile titel="Lücken" />
      <Reiter eintraege={WUNSCH_REITER} />
      <Chips gruppen={LUECKEN_CHIPS} />

      <div className="seite">
      <p className="ruhig klein">
        Digital gespielt, Disc-Fassung belegt, nicht im Regal. Die Disc-Fassung kommt aus IGDB (Einstellungen → IGDB → „Disc-Fassungen prüfen"), aus einem
        eBay-Angebot oder von Hand im Spieldetail. Der Preis ist eine Forderung bei einem Anbieter, kein Wert.
      </p>

      {meldung && <p role="alert" className="auffaellig">{meldung}</p>}
      {eben && (
        <p role="status" className="hinweis">
          „{eben.titel}"{' '}
          {eben.art === 'verworfen' ? 'als physisch nicht gewünscht verworfen' : `Disc-Fassung auf „${eben.gesetzt}" gesetzt`}.{' '}
          <button type="button" onClick={rueckgaengig} disabled={laeuft}>Rückgängig</button>
        </p>
      )}

      {!daten ? (
        <p className="ruhig">wird geladen …</p>
      ) : daten.luecken.length === 0 ? (
        <p className="ruhig">
          {daten.anzahl === 0 && daten.verworfen === 0
            ? 'Keine Lücken. Lücke ist ein digital gespieltes Release, dessen Disc-Fassung belegt ist und das nicht im Regal steht.'
            : 'Alle Lücken sind verworfen – „auch verworfene zeigen" holt sie zurück.'}
        </p>
      ) : (
        <>
          <div className="listenkopf">
            <h2>
              <button
                type="button"
                className="knopfname kandidatenkopf"
                aria-expanded={lueckenOffen}
                onClick={() => setLueckenOffen(!lueckenOffen)}
              >
                <span>
                  {daten.anzahl} {daten.anzahl === 1 ? 'Lücke' : 'Lücken'}
                  {mitVerworfenen && daten.verworfen > 0 && `, dazu ${daten.verworfen} verworfen`}
                </span>
                <span className={lueckenOffen ? 'pfeil auf' : 'pfeil'}>
                  <Zeichen name="winkel" groesse={18} strich={2.1} />
                </span>
              </button>
            </h2>
            <Sortierleiste
              texte={LUECKEN_SORTIERUNG}
              natuerlich={LUECKEN_NATUERLICH}
              wert={sortierung}
              richtung={richtung}
              waehlen={(w, r) => {
                const neu = new URLSearchParams(params)
                if (w === 'titel') neu.delete('sort')
                else neu.set('sort', w)
                // Nur eine Abweichung von der natürlichen Richtung in die URL.
                if (r === LUECKEN_NATUERLICH[w]) neu.delete('richtung')
                else neu.set('richtung', r)
                setParams(neu, { replace: true })
              }}
            />
          </div>
          {lueckenOffen && (
          <ul className="kandidatenliste">
            {[...daten.luecken].sort(lueckenVergleich(sortierung, richtung)).map((l) => (
              <LueckeZeile key={l.releaseId} l={l}>
                {l.verworfen ? (
                  <button type="button" className="klein" disabled={laeuft} onClick={() => wiederZeigen(l)}>wieder als Lücke zeigen</button>
                ) : (
                  <button type="button" className="klein" disabled={laeuft} onClick={() => verwerfen(l)}>physisch nicht gewünscht</button>
                )}
              </LueckeZeile>
            ))}
          </ul>
          )}
        </>
      )}

      <section className="kandidaten">
        {/*
          Die Überschrift IST der Schalter. Vorher stand der zweite Block nur
          hinter dem Chip „Disc-Fassung unbekannt" – und der liegt zwei Ebenen
          tief hinter der Filter-Pille, während die Überschrift hier erst nach
          allen 213 Lücken auftaucht. Zugeklappt war der Block damit praktisch
          unauffindbar (Rückmeldung des Nutzers vom 02.10.2026). Der Chip
          schreibt denselben Parameter und bleibt gleichwertig.
        */}
        <h2>
          <button
            type="button"
            className="knopfname kandidatenkopf"
            aria-expanded={moeglichOffen}
            onClick={() => {
              const neu = new URLSearchParams(params)
              if (moeglichOffen) neu.delete('unbekannte')
              else neu.set('unbekannte', '1')
              setParams(neu, { replace: true })
            }}
          >
            <span>Disc-Fassung unbekannt{daten && ` (${daten.unbekannt})`}</span>
            <span className={moeglichOffen ? 'pfeil auf' : 'pfeil'}>
              <Zeichen name="winkel" groesse={18} strich={2.1} />
            </span>
          </button>
        </h2>
        {moeglichOffen && (
          <p className="ruhig klein">
            Digital gespielt und nicht im Regal, aber ohne Beleg, dass es eine Disc gibt. „Disc gibt es" macht daraus eine Lücke, „gibt es nicht" nimmt das
            Release dauerhaft heraus – beides gilt als deine Entscheidung und wird von IGDB nicht mehr überschrieben. Hier geht es nur um diese eine Frage;
            ob du die Disc haben willst, entscheidest du danach in der Lückenliste. Oben stehen die Fälle, zu denen eBay in der
            Plattform-Kategorie gar kein Angebot kennt – bei bekannten Discs trifft das nur auf 3 % zu, es spricht also für „nur digital".
          </p>
        )}
        {moeglichOffen &&
          (!daten ? (
            <p>wird geladen …</p>
          ) : daten.moeglich.length === 0 ? (
            <p>Nichts offen.</p>
          ) : (
            <ul className="kandidatenliste">
              {nachBefund(daten.moeglich).map((l) => (
                <LueckeZeile key={l.releaseId} l={l}>
                  {l.verworfen ? (
                    <button type="button" className="klein" disabled={laeuft} onClick={() => wiederZeigen(l)}>wieder zeigen</button>
                  ) : (
                    <>
                      <button type="button" className="klein" disabled={laeuft} onClick={() => discSetzen(l, 'ja')}>Disc gibt es</button>
                      <button type="button" className="klein" disabled={laeuft} onClick={() => discSetzen(l, 'nein')}>gibt es nicht</button>
                    </>
                  )}
                </LueckeZeile>
              ))}
            </ul>
          ))}
      </section>
      </div>
    </>
  )
}

function LueckeZeile({ l, children }: { l: Luecke; children: ReactNode }) {
  // Nur im zweiten Block interessant: Bei einer belegten Luecke ist die Frage
  // ja schon beantwortet.
  const befund = l.discFassung === 'unbekannt' ? marktBefund(l.marktRohangebote, l.marktGeprueftAm) : null
  return (
    <li className={l.verworfen ? 'verworfen' : undefined}>
      <Link to={`/spiel/${l.spielId}`} className={l.bild ? 'bild cover' : 'bild'}>
        {l.bild ? <img src={l.bild} alt="" loading="lazy" /> : <span aria-hidden="true">{l.titel.slice(0, 1)}</span>}
      </Link>
      <div>
        <Link to={`/spiel/${l.spielId}`} className="titel">{l.titel}</Link>
        <div className="ruhig klein">
          <PlattformChip plattform={l.plattform} /> {l.fortschritt} %{l.platin && ' · Platin'}
          {l.eigenerStatus && ` · ${STATUSTEXT[l.eigenerStatus]}`}
          {' · '}Gebraucht: <Preis {...gebrauchtpreis(l.besterGebrauchtpreisCents, l.gebrauchtpreisAnbieter, l.gebrauchtpreisUrl)} />
          {l.verworfen && ' · verworfen'}
        </div>
        {befund && <div className="ruhig klein">{befund}</div>}
      </div>
      <div className="knopfzeile">{children}</div>
    </li>
  )
}
