import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { anfrage, euro, type VerworfenesAngebot } from './api'
import { useEscape } from './spieldetail/useEscape'
import { Zeichen } from './Symbole'

/**
 * Ein Gebrauchtpreis, bei vorhandenem Angebot als Link (Stufe 20e) – und
 * seit Stufe 20h mit dem Menü, in dem ein untaugliches Angebot verworfen und
 * ein Verwerfen zurückgenommen wird.
 *
 * Eine eigene Datei, weil ihn drei Listen und das Spieldetail brauchen und
 * die Beschriftung an einer Stelle stehen soll: Die Zahl ist eine **Forderung
 * bei einem Anbieter**, kein Wert – verkaufte Preise gibt eBay nicht heraus
 * (7.3). Ohne Angebot steht „unbekannt", nie „0" oder „–" (Abschnitt 3).
 *
 * Der Link kann ins Leere führen: Ein eBay-Angebot verschwindet, wenn es
 * verkauft ist, und wir fragen einmal am Tag nach. Das `title` sagt es, damit
 * niemand einen Fehler vermutet, wo keiner ist.
 *
 * **Kein neues Bedienelement:** Die Tafel (`.tafel`, `.tafelname`,
 * `.menuezeile`) gibt es seit Stufe 19a, und `Sortierung.tsx` benutzt sie
 * schon außerhalb des Spieldetails. Sie steht hier in allen vier Ansichten
 * gleich (Entscheidung des Nutzers vom 09.10.2026); in den Listen wäre eine
 * Zusatzzeile unter dem Preis eine fünfte Angabe in einer Zeile, die auf
 * 360 px schon voll ist.
 *
 * **Nicht `.menuetafel`:** Die hängt mit `right: 0` am Anker und setzt
 * voraus, dass der am rechten Rand steht – im Spieldetail und in der
 * Sortierleiste tut er das. Hier sitzt er mitten in einer Textzeile, und die
 * Tafel lief bei 360 px links aus dem Bild (gesehen im Bild vom 11.10.2026).
 * Deshalb die Seitenränder von `.tafel` und die Höhe gemessen.
 */
export function Preis({
  text,
  url,
  releaseId,
  itemId,
  verworfen = 0,
  ohneAngebot = false,
  onGeaendert,
}: {
  text: string
  url: string | null
  /** Ohne Release gibt es nichts zu verwerfen – ein Wunsch ohne Release etwa. */
  releaseId?: number | null
  /** Kennung des gezeigten Angebots; null heißt: gültig, aber nicht verwerfbar. */
  itemId?: string | null
  /** Wie viele Angebote hier schon verworfen sind. */
  verworfen?: number
  /** Es liegt gar kein Angebot vor – etwas anderes als „Angebot ohne Kennung". */
  ohneAngebot?: boolean
  /** Nach Verwerfen oder Rücknahme neu laden; fehlt er, bleibt es beim Preis. */
  onGeaendert?: () => void
}) {
  const [menue, setMenue] = useState(false)
  const anker = useRef<HTMLButtonElement>(null)

  const zahl = url === null ? <>{text}</> : (
    <a href={url} target="_blank" rel="noreferrer noopener" title="Angebot bei eBay – kann inzwischen verkauft sein">
      {text}
    </a>
  )

  // Nichts zu entscheiden: kein Release, kein Weg zum Neuladen, oder weder
  // ein verwerfbares Angebot noch etwas Verworfenes. Dann bleibt es beim
  // Preis – ein Menü, das nur „nichts zu tun" sagen kann, ist Lärm.
  if (releaseId === null || releaseId === undefined || onGeaendert === undefined) return zahl
  if ((itemId === null || itemId === undefined) && verworfen === 0) return zahl

  return (
    <>
      {zahl}{' '}
      <button
        type="button"
        ref={anker}
        className="ikone klein"
        aria-label={verworfen > 0 ? `Angebot verwerfen, ${verworfen} verworfen` : 'Angebot verwerfen'}
        aria-expanded={menue}
        onClick={() => setMenue(!menue)}
      >
        <Zeichen name="mehr" groesse={18} />
      </button>
      {menue && (
        <AngebotMenue
          releaseId={releaseId}
          itemId={itemId ?? null}
          text={text}
          ohneAngebot={ohneAngebot}
          anker={anker}
          schliessen={() => setMenue(false)}
          onGeaendert={onGeaendert}
        />
      )}
    </>
  )
}

/**
 * Die Tafel am Preis: das gezeigte Angebot verwerfen, Verworfenes
 * zurücknehmen.
 *
 * Die Sperrliste wird erst **beim Aufklappen** geholt. In den Listen steht
 * nur ihre Anzahl (`v_luecken`, `v_kaufkandidaten`, `PLAN_AUSWAHL`); die
 * Titel in jede Zeile von vier Ansichten zu legen wären Lesekosten für
 * etwas, das fast nie zu sehen ist.
 *
 * Keine Rückfrage vor dem Verwerfen: Es ist vollständig umkehrbar, und die
 * Rücknahme steht in derselben Tafel. Eine Bestätigung gehört vor das
 * Unumkehrbare.
 */
function AngebotMenue({
  releaseId,
  itemId,
  text,
  ohneAngebot,
  anker,
  schliessen,
  onGeaendert,
}: {
  releaseId: number
  itemId: string | null
  text: string
  ohneAngebot: boolean
  anker: RefObject<HTMLButtonElement | null>
  schliessen: () => void
  onGeaendert: () => void
}) {
  useEscape(schliessen)
  const [verworfene, setVerworfene] = useState<VerworfenesAngebot[] | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  const tafel = useRef<HTMLDivElement>(null)
  const [lage, setLage] = useState<{ top: number; left: number; width: number } | null>(null)

  /*
   * Die Tafel geht am Knopf auf – unter ihm, solange sie dort ganz
   * hineinpasst, sonst darüber; und links an ihm ausgerichtet, aber am
   * Fensterrand geklemmt.
   *
   * Beides wird GEMESSEN, nicht geraten. Ihre Höhe hängt daran, wie viele
   * Angebote verworfen sind, und ihre Breite an der Fensterbreite. Ohne die
   * Klemmung lief sie bei 360 px links aus dem Bild; ohne das `left` klebte
   * sie bei 1280 px am Fensterrand, weit weg von ihrem Knopf (beides im Bild
   * vom 11.10.2026 gesehen).
   */
  useLayoutEffect(() => {
    const knopf = anker.current
    const el = tafel.current
    if (!knopf || !el) return
    const r = knopf.getBoundingClientRect()
    const rand = 8
    // `offsetWidth` ist IMMER die Rahmenbreite, `.tafel` rechnet aber in
    // `content-box`: Die gemessene Breite als `width` zurueckzuschreiben
    // legte Polster und Rahmen jedes Mal obendrauf, 358 → 386 → 414, bis die
    // Tafel rechts aus dem Bild lief (gesehen am 11.10.2026). `border-box`
    // schliesst die Rueckkopplung.
    const breite = Math.min(el.offsetWidth, window.innerWidth - 2 * rand)
    const hoehe = el.offsetHeight
    const unten = r.bottom + rand
    setLage({
      top: unten + hoehe <= window.innerHeight - rand ? unten : Math.max(rand, r.top - hoehe - rand),
      left: Math.max(rand, Math.min(r.left, window.innerWidth - breite - rand)),
      width: breite,
    })
  }, [anker, verworfene, meldung])

  // Die Tafel steht fest im Bild (`position: fixed`, wie die Glocke). Beim
  // Scrollen löste sie sich deshalb vom Preis, zu dem sie gehört – also
  // schließt sie.
  useEffect(() => {
    const zu = () => schliessen()
    window.addEventListener('scroll', zu, { passive: true })
    return () => window.removeEventListener('scroll', zu)
  }, [schliessen])

  useEffect(() => {
    let abgelegt = false
    void anfrage<{ verworfene: VerworfenesAngebot[] }>(`/api/sync/markt/verwerfen/${releaseId}`)
      .then((a) => {
        if (!abgelegt) setVerworfene(a.verworfene)
      })
      .catch((f: unknown) => {
        if (!abgelegt) setMeldung(f instanceof Error ? f.message : 'Die verworfenen Angebote ließen sich nicht laden.')
      })
    return () => {
      abgelegt = true
    }
  }, [releaseId])

  async function tue(pfad: string, kennung: string) {
    setLaeuft(true)
    setMeldung(null)
    try {
      // Die Antwort nennt die neue Sperrliste UND – wenn der Neuabruf
      // durchkam – den neuen Preis. Fehlt `preis` ganz, hat eBay nicht
      // geantwortet; dann sagt `meldung`, was war, und die Liste lädt
      // trotzdem neu: Die Entscheidung selbst steht fest.
      const a = await anfrage<{ verworfene: VerworfenesAngebot[]; preis?: unknown; meldung?: string }>(pfad, {
        methode: 'POST',
        koerper: { releaseId, itemId: kennung },
      })
      setVerworfene(a.verworfene)
      if (a.meldung) setMeldung(a.meldung)
      onGeaendert()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div
      className="tafel"
      role="menu"
      ref={tafel}
      style={
        lage === null
          ? { visibility: 'hidden' }
          : { top: `${lage.top}px`, left: `${lage.left}px`, right: 'auto', width: `${lage.width}px`, boxSizing: 'border-box' }
      }
    >
      <div className="tafelname">Angebot</div>
      {/* Drei Fälle, und sie sagen drei verschiedene Dinge: kein Angebot
          (meist, weil alles verworfen ist), ein Angebot ohne Kennung (gültig,
          nur nicht verwerfbar – die Sperrliste braucht etwas, worauf sie
          zeigen kann), oder eines, das sich verwerfen lässt. */}
      {ohneAngebot ? (
        <p className="menuezeile">
          <span className="still">Zu diesem Release liegt gerade kein Angebot vor.</span>
        </p>
      ) : itemId === null ? (
        <p className="menuezeile">
          <span className="still">Dieses Angebot trägt keine eBay-Kennung und lässt sich deshalb nicht verwerfen.</span>
        </p>
      ) : (
        <p className="menuezeile">
          <span className="still">{text}</span>
          <button type="button" className="knopf" disabled={laeuft} onClick={() => void tue('/api/sync/markt/verwerfen', itemId)}>
            Angebot verwerfen
          </button>
        </p>
      )}

      {verworfene === null && meldung === null && <p className="menuezeile"><span className="still">wird geladen …</span></p>}

      {verworfene !== null && verworfene.length > 0 && (
        <>
          <div className="tafelname">
            {verworfene.length} {verworfene.length === 1 ? 'verworfenes Angebot' : 'verworfene Angebote'}
          </div>
          {verworfene.map((v) => (
            <p className="menuezeile" key={v.itemId}>
              <span className="still">
                „{v.titel}" {euro(v.preisCents)}
              </span>
              <button
                type="button"
                className="knopf"
                disabled={laeuft}
                onClick={() => void tue('/api/sync/markt/verwerfen/ruecknahme', v.itemId)}
              >
                zurücknehmen
              </button>
            </p>
          ))}
        </>
      )}

      {meldung && (
        <p className="menuezeile" role="alert">
          <span className="still">{meldung}</span>
        </p>
      )}
    </div>
  )
}
