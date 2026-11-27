import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { stateNachFilter } from './filterverlauf'
import { STATUSTEXT, anfrage, gebrauchtpreisText, marktBefund, type DiscFassung, type PlayStatus } from './api'
import { Sortierleiste, type Richtung } from './Sortierung'
import { LUECKEN_NATUERLICH, LUECKEN_SORTIERUNG, lueckenVergleich, type LueckenSortierung } from './vergleich'
import { PREIS_FILTER_TEXT, lueckeMenue, lueckenSortierwert, nachBefund, preisFilterAusParam, type MenueAktion } from './preisliste'
import { Reiter } from './Absichten'
import { Chips, type ChipGruppe } from './Chips'
import { Kopfzeile } from './Kopfzeile'
import { Zeichen } from './Symbole'
import { Cover, PlattformChip, zustandsFarbe } from './SpielTeile'
import { Gebraucht, PreisZeile, RueckwegZeile, SortierwertText, Spaltenkopf, besitzErfassen, useRueckweg, type RueckwegZustand } from './PreisZeile'
import { WUNSCH_REITER } from './Wunschliste'

/**
 * Lücken (Use Case 3, Stufe 14): digital gespielt, Disc-Fassung belegt,
 * nicht im Regal. „physisch nicht gewünscht" ist ein verworfener Kaufeintrag
 * (5.3) – die Lücke bleibt als Tatsache in der View, die Ansicht blendet sie
 * nur aus; „Rückgängig" und „wieder zeigen" löschen den Eintrag (wie
 * „nicht vorgesehen" im Backlog).
 *
 * Daneben „Disc unklar": digital gespielt, nicht im Regal, aber ohne Beleg
 * für eine Disc (Entscheidung des Nutzers vom 16.09.2026, Block B). Dort
 * entsteht das „nein" von Hand – oder ein „ja", wenn er es besser weiß als
 * IGDB. **„physisch nicht gewünscht" gibt es dort nicht** (Entscheidung des
 * Nutzers vom 02.10.2026): eine einzige Frage – gibt es die Disc? Die Absicht
 * entscheidet sich danach unter „Disc belegt".
 *
 * Seit Nachtrag f2e (Entscheidung des Nutzers vom 27.11.2026):
 *
 * - **Ein Umschalter statt zweier Blöcke.** „Disc belegt | Disc unklar" steht
 *   oben; vorher lag der zweite Block erst nach allen Lücken und war
 *   zugeklappt kaum zu finden (Rückmeldung vom 02.10.2026). Der Zustand
 *   bleibt im URL-Parameter `unbekannte=1` und übersteht ein Neuladen.
 * - **Zeilen wie Wunsch- und Kaufliste**, mit „auf die Kaufliste" als
 *   Hauptaktion. Bis hierher übernahm erst die Kaufliste die Lücken aus
 *   ihrem Kandidatenblock; jetzt geschieht es dort, wo die Lücke steht.
 * - **Ob eine Lücke schon auf der Kaufliste steht, weiß die Ansicht nicht:**
 *   `/api/gaps` nennt nur den verworfenen Kaufeintrag. Der Knopf bleibt
 *   deshalb stehen, und ein zweites Übernehmen beantwortet der Worker mit 409
 *   – die Meldung steht dann oben.
 *
 * Der Gebrauchtpreis ist eine Forderung eines Anbieters, kein Wert. Die eBay-
 * Zahl bei „Disc unklar" sagt, wie viele Fälle eBay in der Plattform-
 * Kategorie gar nicht kennt – bei bekannten Discs trifft das nur auf 3 % zu.
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
  /** Kritikerwertung des Spiels; null heisst unbekannt (seit 20e-b, zum Sortieren). */
  kritik: number | null
  /** Spielerwertung des Spiels (seit 20k, zum Sortieren). */
  spieler: number | null
  /** Erscheinungsdatum des Spiels als ISO-Datum; null heisst unbekannt (seit 20e-b). */
  erscheinungsdatum: string | null
  eigenerStatus: PlayStatus | null
  besterGebrauchtpreisCents: number | null
  gebrauchtpreisAnbieter: string | null
  gebrauchtpreisUrl: string | null
  gebrauchtpreisItemId: string | null
  gebrauchtpreisVerworfen: number
  marktGeprueftAm: string | null
  marktRohangebote: number | null
  verworfen: boolean
  planId: number | null
}

/** Nur noch „auch verworfene" – „Disc unklar" ist seit f2e der Umschalter oben. */
const LUECKEN_CHIPS: readonly ChipGruppe[] = [{ param: 'verworfene', titel: 'Verworfene', werte: [['1', 'auch verworfene']] }]

/**
 * Unter „Disc belegt" dazu der Gebrauchtpreis (Nachtrag f2e-c), mit demselben
 * Parameter wie auf Wunsch- und Kaufliste. Digitalpreis und Angebot fehlen:
 * Eine Lücke ist digital schon gespielt, die Zeile trägt keinen Store-Preis.
 * Unter „Disc unklar" fehlt auch er, weil die Frage-Zeile keinen Preis zeigt –
 * ein gesetzter Filter bleibt in der URL und wirkt beim Zurückschalten wieder.
 */
const LUECKEN_CHIPS_BELEGT: readonly ChipGruppe[] = [
  ...LUECKEN_CHIPS,
  { param: 'preis', titel: 'Auswahl', mehrfach: true, werte: [['gebraucht', PREIS_FILTER_TEXT.gebraucht]] },
]

type Antwort = { anzahl: number; verworfen: number; unbekannt: number; luecken: Luecke[]; moeglich: Luecke[] }

export function Luecken() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const mitVerworfenen = params.get('verworfene') === '1'
  const unklar = params.get('unbekannte') === '1'
  // Nur „mit Gebrauchtpreis" hat hier eine Bedeutung (Nachtrag f2e-c).
  const nurGebraucht = preisFilterAusParam(params.get('preis')).has('gebraucht')
  const sortierung: LueckenSortierung =
    (params.get('sort') as LueckenSortierung) in LUECKEN_SORTIERUNG ? (params.get('sort') as LueckenSortierung) : 'titel'
  const richtung: Richtung = params.get('richtung') === 'ab' || params.get('richtung') === 'auf'
    ? (params.get('richtung') as Richtung)
    : LUECKEN_NATUERLICH[sortierung]
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)

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

  const weg = useRueckweg(laden, setMeldung)

  function segment(zuUnklar: boolean) {
    if (zuUnklar === unklar) return
    const neu = new URLSearchParams(params)
    if (zuUnklar) neu.set('unbekannte', '1')
    else neu.delete('unbekannte')
    setParams(neu, { replace: true, state: stateNachFilter(location.state) })
  }

  /** Die Disc-Frage unter „Disc unklar"; Rückgängig setzt sie auf „unbekannt" zurück. */
  const discSetzen = (l: Luecke, fassung: DiscFassung) =>
    weg.tue(async () => {
      await anfrage(`/api/releases/${l.releaseId}`, { methode: 'PATCH', koerper: { discFassung: fassung } })
      return {
        text: `„${l.titel}": Disc-Fassung auf „${fassung}" gesetzt.`,
        schritte: [{ methode: 'PATCH', pfad: `/api/releases/${l.releaseId}`, koerper: { discFassung: 'unbekannt' } }],
      }
    })

  const wiederZeigen = (l: Luecke) => {
    const planId = l.planId
    if (planId === null) return
    void weg.tue(async () => {
      await anfrage(`/api/plans/${planId}`, { methode: 'DELETE' })
      return null
    })
  }

  const belegt = daten?.luecken.filter((l) => !nurGebraucht || l.besterGebrauchtpreisCents !== null)

  const ebayUnbekannt = daten ? daten.moeglich.filter((l) => !l.verworfen && l.marktRohangebote === 0).length : 0

  return (
    <>
      <Kopfzeile titel="Lücken" />
      <Reiter eintraege={WUNSCH_REITER} />
      <Chips
        gruppen={unklar ? LUECKEN_CHIPS : LUECKEN_CHIPS_BELEGT}
        rechts={
          // Unter „Disc unklar" ordnet der Befund (`nachBefund`), nicht die Sortierung.
          !unklar && (
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
                // Eine offene Filtertafel bleibt offen (Stufe f2b, `filterverlauf.ts`).
                setParams(neu, { replace: true, state: stateNachFilter(location.state) })
              }}
            />
          )
        }
      />

      <div className="seite">
        <div className="segmente" role="group" aria-label="Disc-Fassung">
          <button type="button" aria-pressed={!unklar} onClick={() => segment(false)}>
            Disc belegt{daten && <span className="zahl">{daten.anzahl}</span>}
          </button>
          <button type="button" aria-pressed={unklar} onClick={() => segment(true)}>
            Disc unklar{daten && <span className="zahl">{daten.unbekannt}</span>}
          </button>
        </div>
        <p className="ruhig klein">
          {unklar
            ? `Digital gespielt, nicht im Regal – gibt es eine Disc? Deine Antwort überschreibt IGDB nicht mehr.${
                ebayUnbekannt > 0 ? ` ${ebayUnbekannt} davon kennt eBay gar nicht.` : ''
              }`
            : 'Digital gespielt, als Disc erschienen, nicht im Regal.'}
        </p>

        {meldung && <p role="alert" className="auffaellig">{meldung}</p>}
        <RueckwegZeile weg={weg} />

        {!daten ? (
          <p className="ruhig">wird geladen …</p>
        ) : unklar ? (
          daten.moeglich.length === 0 ? (
            <p className="ruhig">Nichts offen.</p>
          ) : (
            <ul className="preisliste">
              {nachBefund(daten.moeglich).map((l) => (
                <FrageZeile key={l.releaseId} l={l}>
                  {l.verworfen ? (
                    <button type="button" disabled={weg.laeuft} onClick={() => wiederZeigen(l)}>wieder zeigen</button>
                  ) : (
                    <>
                      <button type="button" disabled={weg.laeuft} onClick={() => void discSetzen(l, 'ja')}>Disc gibt es</button>
                      <button type="button" disabled={weg.laeuft} onClick={() => void discSetzen(l, 'nein')}>gibt es nicht</button>
                    </>
                  )}
                </FrageZeile>
              ))}
            </ul>
          )
        ) : belegt && belegt.length === 0 ? (
          <p className="ruhig">
            {nurGebraucht && daten.luecken.length > 0
              ? 'Nichts passt zum Filter.'
              : daten.anzahl === 0 && daten.verworfen === 0
              ? 'Keine Lücken. Lücke ist ein digital gespieltes Release, dessen Disc-Fassung belegt ist und das nicht im Regal steht.'
              : 'Alle Lücken sind verworfen – „auch verworfene" holt sie zurück.'}
          </p>
        ) : (
          <>
            <Spaltenkopf digital={false} />
            <ul className="preisliste">
              {[...(belegt ?? [])].sort(lueckenVergleich<Luecke>(sortierung, richtung)).map((l) => (
                <LueckeZeile key={l.releaseId} l={l} sortierung={sortierung} weg={weg} laden={laden} wiederZeigen={wiederZeigen} />
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  )
}

/**
 * Eine belegte Lücke: Plattform · Fortschritt in der Zustandsfarbe · Platin ·
 * Zustand · Sortierwert, rechts nur der Gebrauchtpreis.
 */
function LueckeZeile({
  l,
  sortierung,
  weg,
  laden,
  wiederZeigen,
}: {
  l: Luecke
  sortierung: LueckenSortierung
  weg: RueckwegZustand
  laden: () => Promise<void>
  wiederZeigen: (l: Luecke) => void
}) {
  const w = lueckenSortierwert(sortierung, {
    spieler: l.spieler,
    kritik: l.kritik,
    erscheinungsdatum: l.erscheinungsdatum,
    angekuendigt: false,
  })
  const meta: ReactNode[] = [
    <PlattformChip plattform={l.plattform} />,
    <>
      <span className="prozent" style={{ color: zustandsFarbe(l.eigenerStatus) }}>
        {l.fortschritt}&thinsp;%
      </span>
      {l.platin && (
        <span className="platinzeichen" title="Platin" aria-label="Platin">
          <Zeichen name="pokal" groesse={13} />
        </span>
      )}
    </>,
  ]
  if (l.eigenerStatus) meta.push(STATUSTEXT[l.eigenerStatus])
  if (w) meta.push(<SortierwertText w={w} />)
  if (l.verworfen) meta.push('verworfen')

  function aktion(a: MenueAktion) {
    switch (a) {
      case 'aufKaufliste':
        // Wie bis f2e der Kandidatenblock der Kaufliste: Herkunft „luecke".
        void weg.tue(async () => {
          const e = await anfrage<{ id: number }>('/api/plans', {
            methode: 'POST',
            koerper: { art: 'kauf', herkunft: 'luecke', releaseId: l.releaseId },
          })
          return { text: `„${l.titel}" auf die Kaufliste gesetzt.`, schritte: [{ methode: 'DELETE', pfad: `/api/plans/${e.id}` }] }
        })
        return
      case 'disc':
        if (!confirm(`Disc für ${l.plattform} erfassen?`)) return
        void weg.tue(() => besitzErfassen(l.releaseId, l.titel, { art: 'disc' }))
        return
      case 'nichtGewuenscht':
        // „physisch nicht gewünscht" (5.3): kauf/luecke/verworfen; Rückgängig löscht den Eintrag.
        void weg.tue(async () => {
          const a = await anfrage<{ id: number }>(`/api/gaps/${l.releaseId}/verwerfen`, { methode: 'POST' })
          return { text: `„${l.titel}" als physisch nicht gewünscht verworfen.`, schritte: [{ methode: 'DELETE', pfad: `/api/plans/${a.id}` }] }
        })
        return
      case 'wiederZeigen':
        wiederZeigen(l)
        return
    }
  }

  return (
    <PreisZeile
      schluessel={`l${l.releaseId}`}
      klasse={l.verworfen ? 'luecke erledigt' : 'luecke'}
      spielId={l.spielId}
      titel={l.titel}
      bild={l.bild}
      meta={meta}
      preise={<Gebraucht cents={l.besterGebrauchtpreisCents} anbieter={l.gebrauchtpreisAnbieter} url={l.gebrauchtpreisUrl} />}
      menue={lueckeMenue({
        verworfen: l.verworfen,
        angebotItemId: l.besterGebrauchtpreisCents === null ? null : l.gebrauchtpreisItemId,
        angebotVerworfen: l.gebrauchtpreisVerworfen,
      })}
      laeuft={weg.laeuft}
      onAktion={aktion}
      angebot={{
        releaseId: l.releaseId,
        itemId: l.besterGebrauchtpreisCents === null ? null : l.gebrauchtpreisItemId,
        text: gebrauchtpreisText(l.besterGebrauchtpreisCents, l.gebrauchtpreisAnbieter),
        ohneAngebot: l.besterGebrauchtpreisCents === null,
        onGeaendert: () => void laden(),
      }}
    />
  )
}

/**
 * Eine Zeile unter „Disc unklar": Cover | Titel, Plattform, eBay-Befund |
 * die beiden Antworten. Am Handy stehen die Knöpfe unter dem Text, am
 * Desktop rechts daneben.
 */
function FrageZeile({ l, children }: { l: Luecke; children: ReactNode }) {
  const befund = marktBefund(l.marktRohangebote, l.marktGeprueftAm)
  return (
    <li className={l.verworfen ? 'preisfrage erledigt' : 'preisfrage'}>
      <Cover bild={l.bild} cover={l.bild !== null} titel={l.titel} ziel={`/spiel/${l.spielId}`} />
      <div className="preiszeile-text">
        <Link to={`/spiel/${l.spielId}`} className="preistitel">
          {l.titel}
        </Link>
        <span className="preismeta">
          <span>
            <PlattformChip plattform={l.plattform} />
          </span>
          {l.verworfen && <span>verworfen</span>}
        </span>
        {befund && <span className="preisbefund">{befund}</span>}
      </div>
      <div className="entscheid">{children}</div>
    </li>
  )
}
