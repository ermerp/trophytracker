import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { STATUSTEXT, anfrage, euro, type DiscFassung, type PlayStatus } from './api'
import { Reiter } from './Absichten'
import { Chips, type ChipGruppe } from './Chips'
import { Kopfzeile } from './Kopfzeile'
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
 * weiß als IGDB; „physisch nicht gewünscht" gibt es auch hier (Wunsch des
 * Nutzers vom 16.09.2026): Die Frage nach der Disc bleibt offen, die Absicht
 * ist trotzdem entschieden. Preise kommen mit Stufe 20; bis dahin steht
 * „unbekannt".
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
  verworfen: boolean
  planId: number | null
}

/** Die beiden Umschalter der Ansicht, als Chips wie überall sonst (Stufe 19). */
const LUECKEN_CHIPS: readonly ChipGruppe[] = [
  { param: 'verworfene', werte: [['1', 'auch verworfene']] },
  { param: 'unbekannte', werte: [['1', 'Disc-Fassung unbekannt']] },
]

type Antwort = { anzahl: number; verworfen: number; unbekannt: number; luecken: Luecke[]; moeglich: Luecke[] }

type Eben =
  | { art: 'verworfen'; titel: string; planId: number }
  | { art: 'disc'; titel: string; releaseId: number; gesetzt: DiscFassung }

export function Luecken() {
  // Die beiden Umschalter schreibt jetzt die Chip-Leiste in die URL.
  const [params] = useSearchParams()
  const mitVerworfenen = params.get('verworfene') === '1'
  const moeglichOffen = params.get('unbekannte') === '1'
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
        Digital gespielt, Disc-Fassung belegt, nicht im Regal. Die Disc-Fassung kommt aus IGDB (Einstellungen → IGDB → „Disc-Fassungen prüfen") oder von
        Hand im Spieldetail. Preise folgen mit dem Händler-Feed.
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
          <p>
            {daten.anzahl} {daten.anzahl === 1 ? 'Lücke' : 'Lücken'}
            {mitVerworfenen && daten.verworfen > 0 && `, dazu ${daten.verworfen} verworfen`}
          </p>
          <ul className="kandidatenliste">
            {daten.luecken.map((l) => (
              <LueckeZeile key={l.releaseId} l={l}>
                {l.verworfen ? (
                  <button type="button" className="klein" disabled={laeuft} onClick={() => wiederZeigen(l)}>wieder als Lücke zeigen</button>
                ) : (
                  <button type="button" className="klein" disabled={laeuft} onClick={() => verwerfen(l)}>physisch nicht gewünscht</button>
                )}
              </LueckeZeile>
            ))}
          </ul>
        </>
      )}

      <section className="kandidaten">
        <h2>Disc-Fassung unbekannt{daten && ` (${daten.unbekannt})`}</h2>
        <p className="ruhig klein">
          Digital gespielt und nicht im Regal, aber ohne Beleg, dass es eine Disc gibt. „Disc gibt es" macht daraus eine Lücke, „gibt es nicht" nimmt das
          Release dauerhaft heraus – beides gilt als deine Entscheidung und wird von IGDB nicht mehr überschrieben. „physisch nicht gewünscht" lässt die
          Frage offen und blendet das Release trotzdem aus: ob es die Disc gibt, ist dir dann egal.
        </p>
        {moeglichOffen &&
          (!daten ? (
            <p>wird geladen …</p>
          ) : daten.moeglich.length === 0 ? (
            <p>Nichts offen.</p>
          ) : (
            <ul className="kandidatenliste">
              {daten.moeglich.map((l) => (
                <LueckeZeile key={l.releaseId} l={l}>
                  {l.verworfen ? (
                    <button type="button" className="klein" disabled={laeuft} onClick={() => wiederZeigen(l)}>wieder zeigen</button>
                  ) : (
                    <>
                      <button type="button" className="klein" disabled={laeuft} onClick={() => discSetzen(l, 'ja')}>Disc gibt es</button>
                      <button type="button" className="klein" disabled={laeuft} onClick={() => discSetzen(l, 'nein')}>gibt es nicht</button>
                      <button type="button" className="klein" disabled={laeuft} onClick={() => verwerfen(l)}>physisch nicht gewünscht</button>
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
          {' · '}Gebrauchtpreis: {euro(l.besterGebrauchtpreisCents)}
          {l.verworfen && ' · verworfen'}
        </div>
      </div>
      <div className="knopfzeile">{children}</div>
    </li>
  )
}
