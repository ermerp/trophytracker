import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { anfrage, erledigtText, scanWiederOeffnen, type ErfasstAntwort, type Plattform } from './api'
import { ScanAuswahl } from './ScanAuswahl'
import { useKamera } from './kamera'
import { tonBekannt, tonFehler, tonNeu } from './ton'

/**
 * Scannen (Abschnitt 9, Stufe 17): Serienerfassung des Regals.
 *
 * Zwei Betriebsarten: **Zuordnen** (Vorgabe) zeigt zu jedem Code seine Karte;
 * **Nur sammeln** schreibt erkannte Codes bloß weg und scannt sofort weiter,
 * mit einem Ton als Rückmeldung – für den ersten Durchgang durch ein volles
 * Regal, wenn die Zuordnung später in einem Rutsch passieren soll.
 *
 * Drei feste Zonen – Kamera, Textfeld als Notnagel, Ergebniskarte –, damit
 * die Bedienelemente bei jeder Disc an derselben Stelle stehen (Darstellungs-
 * regel in Abschnitt 13). Die Kette aus 9.2: Mapping-Treffer → eine Karte mit
 * „Weiteres Exemplar"; sonst die Suche in der eigenen Sammlung (dieselbe
 * Abfrage wie die Sammlungsansicht) und darunter „Spiel anlegen" wie in der
 * Sammlung. Zuordnen legt Disc und Mapping an, erledigt Kauf- und Wunsch-
 * einträge und protokolliert „per Barcode"; Rückgängig nimmt alles zurück.
 * „Später" lässt den Code als offenen Scan stehen (Einstellungen).
 */

type Treffer = {
  ean: string
  treffer: 'mapping' | 'angebot' | 'keiner'
  release?: { releaseId: number; spielId: number; titel: string; plattform: Plattform; bild: string | null; exemplare: number }
  angebot?: { titel: string; plattform: string | null }
  scans: number
}

type Zuordnung = ErfasstAntwort & {
  ean: string
  releaseId: number
  spiel: { spielId: number; titel: string; plattform: Plattform } | null
}

/** Ein im Sammelmodus weggeschriebener Code, neueste zuerst. */
type Gesammelt = { ean: string; titel: string | null; plattform: Plattform | null }

/**
 * Kurze Rückmeldung im Kamerabild (Rückmeldung des Nutzers vom 18.09.2026:
 * die Liste steht zu weit unten, um sie beim Scannen zu sehen).
 */
type Blitz = { art: 'neu' | 'bekannt' | 'fehler'; zeichen: string; text: string }

type Zustand =
  | { art: 'leer' }
  | { art: 'treffer'; t: Treffer }
  | { art: 'auswahl'; t: Treffer }
  | { art: 'erfasst'; z: Zuordnung }

export function Scannen() {
  const [params, setParams] = useSearchParams()
  const [zustand, setZustand] = useState<Zustand>({ art: 'leer' })
  const [eingabe, setEingabe] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [sitzung, setSitzung] = useState(0)
  const [sammeln, setSammeln] = useState(false)
  const [gesammelt, setGesammelt] = useState<Gesammelt[]>([])
  /** Codes dieser Sitzung – dieselbe Hülle ein zweites Mal ist keine zweite Disc. */
  const gesammelteCodes = useRef(new Set<string>())

  const [blitz, setBlitz] = useState<Blitz | null>(null)
  const blitzZeit = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Zeigt das Zeichen für einen Moment über dem Kamerabild. */
  const zeigeBlitz = useCallback((b: Blitz) => {
    setBlitz(b)
    if (blitzZeit.current) clearTimeout(blitzZeit.current)
    blitzZeit.current = setTimeout(() => setBlitz(null), 900)
  }, [])

  useEffect(() => () => { if (blitzZeit.current) clearTimeout(blitzZeit.current) }, [])

  const [letzterCode, setLetzterCode] = useState<string | null>(null)
  // Die Erkennungsschleife ruft `aufloesen` aus einem Effekt heraus auf und
  // sieht den Zustand vom Beginn des Laufs; der Modus kommt deshalb aus einem Ref.
  const sammelnRef = useRef(sammeln)
  sammelnRef.current = sammeln

  /** `zaehlen: false` beim Öffnen aus den Einstellungen – kein neuer Scan. */
  const aufloesen = useCallback(async (roh: string, zaehlen = true) => {
    setFehler(null)
    setHinweis(null)
    setLaeuft(true)
    try {
      const t = await anfrage<Treffer>('/api/scan', { methode: 'POST', koerper: { ean: roh, zaehlen } })
      setLetzterCode(t.ean)
      if (sammelnRef.current) {
        // Nur sammeln: der Code steht als offener Scan bzw. ist längst bekannt –
        // beides ohne Rückfrage, die Erkennung läuft sofort weiter (Rückgabe false).
        const schonDa = gesammelteCodes.current.has(t.ean)
        if (schonDa || t.treffer === 'mapping') tonBekannt()
        else tonNeu()
        zeigeBlitz(
          schonDa
            ? { art: 'bekannt', zeichen: '↻', text: `${t.ean} – schon gescannt` }
            : t.treffer === 'mapping'
              ? { art: 'bekannt', zeichen: '✓', text: `${t.release?.titel} (${t.release?.plattform})` }
              : { art: 'neu', zeichen: '✓', text: t.ean },
        )
        if (!schonDa) {
          gesammelteCodes.current.add(t.ean)
          setGesammelt((g) => [{ ean: t.ean, titel: t.release?.titel ?? null, plattform: t.release?.plattform ?? null }, ...g])
        }
        return false
      }
      zeigeBlitz({ art: 'neu', zeichen: '✓', text: t.ean })
      setZustand(t.treffer === 'mapping' ? { art: 'treffer', t } : { art: 'auswahl', t })
      return true
    } catch (f) {
      if (sammelnRef.current) tonFehler()
      zeigeBlitz({ art: 'fehler', zeichen: '✗', text: f instanceof Error ? f.message : 'Fehler' })
      setFehler(f instanceof Error ? f.message : 'Auflösen fehlgeschlagen.')
      return false
    } finally {
      setLaeuft(false)
    }
  }, [])

  // Der zuletzt behandelte Code löst nicht erneut aus, bis ein anderer kam
  // (siehe useKamera); dieselbe Disc noch einmal geht über das Textfeld.
  const { videoRef, status: kameraStatus, fehler: kameraFehler, nativ, geraete, starten, stoppen, wechseln, pausiert, setPausiert, kandidat, gespiegelt } =
    useKamera(aufloesen, letzterCode)

  // ?ean= aus den Einstellungen: sofort auflösen, Kamera bleibt aus, bis sie gestartet wird.
  const eanAusUrl = params.get('ean')
  const gestartet = useRef(false)
  useEffect(() => {
    if (gestartet.current) return
    gestartet.current = true
    if (eanAusUrl) {
      void aufloesen(eanAusUrl, false)
      setParams({}, { replace: true })
    } else {
      void starten()
    }
  }, [eanAusUrl, aufloesen, setParams, starten])

  /**
   * Einen eben gesammelten Code wieder wegwerfen (Rückmeldung des Nutzers vom
   * 18.09.2026: eine Fehllesung soll sofort raus, nicht erst beim Zuordnen).
   * Betrifft nur offene Scans – ein Code, der schon einem Release gehört,
   * wird hier nicht angefasst.
   */
  async function verwerfen(ean: string) {
    setFehler(null)
    try {
      await anfrage(`/api/scan/unresolved/${ean}`, { methode: 'DELETE' })
      gesammelteCodes.current.delete(ean)
      setGesammelt((g) => g.filter((x) => x.ean !== ean))
      setHinweis(`${ean} verworfen.`)
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Verwerfen fehlgeschlagen.')
    }
  }

  /** Zurück zum Scannen – die Kamera nimmt den nächsten Code. */
  function weiter(neu: Zustand = { art: 'leer' }) {
    setZustand(neu)
    setEingabe('')
    setHinweis(null)
    setPausiert(false)
  }

  async function zuordnen(ean: string, koerper: { releaseId: number } | { spielId: number; plattform: Plattform }) {
    setFehler(null)
    setHinweis(null)
    setLaeuft(true)
    try {
      const z = await anfrage<Zuordnung>(`/api/scan/${ean}/assign`, { methode: 'POST', koerper })
      setSitzung((n) => n + 1)
      weiter({ art: 'erfasst', z })
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Zuordnen fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  /** Nimmt Disc, Mapping und die dabei erledigten Absichten zurück. */
  async function rueckgaengig(z: Zuordnung) {
    setFehler(null)
    setLaeuft(true)
    try {
      for (const a of z.absichtenErledigt) {
        await anfrage(`/api/plans/${a.id}`, { methode: 'PATCH', koerper: { status: 'offen' } })
      }
      await anfrage(`/api/physical-copies/${z.id}`, { methode: 'DELETE' })
      await anfrage(`/api/scan/${z.ean}`, { methode: 'DELETE' })
      // Der Code war vor dem Zuordnen ein offener Scan und muss es wieder
      // werden – sonst ist er weder zugeordnet noch offen.
      await scanWiederOeffnen(z.ean)
      setSitzung((n) => Math.max(0, n - 1))
      weiter()
      setHinweis('Zurückgenommen.')
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Rückgängig fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  async function insBacklog(z: Zuordnung) {
    setFehler(null)
    try {
      await anfrage('/api/plans', { methode: 'POST', koerper: { art: 'backlog', releaseId: z.releaseId } })
      setZustand({ art: 'erfasst', z: { ...z, aufListe: true } })
      setHinweis('Ins Backlog gesetzt.')
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Anlegen fehlgeschlagen.')
    }
  }

  // Für „Letzten verwerfen": der zuletzt gesammelte Code, der noch keinem Spiel gehört.
  const letzterNeuer = gesammelt.find((g) => g.titel === null)

  return (
    <>
      <h1>Scannen</h1>

      <section className="scanner">
        <div className={`kamerabild${blitz ? ` blitz-${blitz.art}` : ''}`} hidden={kameraStatus === 'aus' || kameraStatus === 'fehler'}>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            aria-label="Kamerabild"
            className={gespiegelt ? 'gespiegelt' : undefined}
          />
          {blitz && (
            <p className="blitz" role="status">
              <span className="zeichen" aria-hidden="true">{blitz.zeichen}</span>
              <span className="text">{blitz.text}</span>
            </p>
          )}
          {sammeln && <p className="zaehler" aria-hidden="true">{gesammelt.length}</p>}
        </div>
        <p className="steuerung kamera-zeile">
          {kameraStatus === 'laeuft' ? (
            <>
              <span role="status">
                {pausiert ? 'Erkennung pausiert' : kandidat ? `liest ${kandidat} …` : 'Barcode vor die Kamera halten'}
              </span>{' '}
              {geraete.length > 1 && <button type="button" onClick={wechseln}>Kamera wechseln</button>}{' '}
              <button type="button" onClick={stoppen}>Kamera aus</button>
            </>
          ) : kameraStatus === 'startet' ? (
            <span role="status">Kamera startet …</span>
          ) : (
            <button type="button" onClick={() => starten()}>Kamera starten</button>
          )}
          {nativ === false && <span className="pille" title="Kein nativer BarcodeDetector – ZXing im Browser">Fallback</span>}
        </p>
        {kameraFehler && <p role="alert" className="auffaellig">{kameraFehler}</p>}

        <p className="steuerung">
          <label>
            <input
              type="checkbox"
              checked={sammeln}
              onChange={(e) => {
                setSammeln(e.target.checked)
                setZustand({ art: 'leer' })
                setPausiert(false)
              }}
              aria-label="Nur sammeln"
            />{' '}
            Nur sammeln – Codes wegschreiben, Zuordnung später
          </label>
        </p>

        <form
          className="steuerung"
          onSubmit={(e) => {
            e.preventDefault()
            if (eingabe.trim()) void aufloesen(eingabe)
          }}
        >
          <input
            type="text"
            inputMode="numeric"
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            placeholder="EAN eintippen"
            aria-label="EAN eintippen"
          />{' '}
          <button type="submit" disabled={laeuft || eingabe.trim() === ''}>Auflösen</button>
        </form>
      </section>

      {fehler && <p role="alert" className="auffaellig">{fehler}</p>}
      {hinweis && <p role="status" className="hinweis">{hinweis}</p>}

      {sammeln ? (
        <section className="scankarte" aria-live="polite">
          <p className="zeile">
            Jeder erkannte Code wird weggeschrieben, die Erkennung läuft weiter – ein heller Ton heißt „neu",
            zwei tiefe „kenne ich schon". Zuordnen kannst du später in einem Rutsch (Einstellungen → Offene Scans).
          </p>
          <p className="steuerung">
            <strong>Gesammelt: {gesammelt.length}</strong>
            {letzterNeuer && (
              <>
                {' '}
                <button type="button" onClick={() => verwerfen(letzterNeuer.ean)}>
                  Letzten verwerfen ({letzterNeuer.ean})
                </button>
              </>
            )}
          </p>
          <ul className="gesammelt">
            {gesammelt.slice(0, 12).map((g) => (
              <li key={g.ean}>
                <span className="titel">{g.ean}</span>{' '}
                <span className="wozu">{g.titel ? `schon zugeordnet: ${g.titel} (${g.plattform})` : 'neu'}</span>
                {!g.titel && (
                  <button type="button" className="klein" onClick={() => verwerfen(g.ean)}>
                    verwerfen
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : (
      <section className="scankarte" aria-live="polite">
        {zustand.art === 'leer' && (
          <p className="zeile">
            {sitzung > 0 ? `In dieser Sitzung erfasst: ${sitzung}.` : 'Noch nichts gescannt.'}{' '}
            Ein erkannter Code erscheint hier.
          </p>
        )}

        {zustand.art === 'treffer' && zustand.t.release && (
          <TrefferKarte
            t={zustand.t}
            laeuft={laeuft}
            onExemplar={() => zuordnen(zustand.t.ean, { releaseId: zustand.t.release!.releaseId })}
            onAnderes={() => setZustand({ art: 'auswahl', t: zustand.t })}
            onWeiter={() => weiter()}
          />
        )}

        {zustand.art === 'auswahl' && (
          <ScanAuswahl
            key={zustand.t.ean}
            ean={zustand.t.ean}
            scans={zustand.t.scans}
            angebot={zustand.t.angebot ?? null}
            laeuft={laeuft}
            onWahl={(koerper) => zuordnen(zustand.t.ean, koerper)}
            onSpaeter={() => weiter()}
          />
        )}

        {zustand.art === 'erfasst' && (
          <div className="erfasst">
            <p role="status">
              <strong>Disc erfasst:</strong>{' '}
              {zustand.z.spiel ? (
                <>
                  <Link to={`/spiel/${zustand.z.spiel.spielId}`}>{zustand.z.spiel.titel}</Link> ({zustand.z.spiel.plattform})
                </>
              ) : (
                `Release ${zustand.z.releaseId}`
              )}
              , EAN {zustand.z.ean}.
              {zustand.z.absichtenErledigt.length > 0 && ` ${erledigtText(zustand.z.absichtenErledigt)}`}
            </p>
            <p className="aktionen">
              {zustand.z.absichtenErledigt.length > 0 && !zustand.z.aufListe && (
                <button type="button" disabled={laeuft} onClick={() => insBacklog(zustand.z)}>ins Backlog übernehmen</button>
              )}
              <button type="button" disabled={laeuft} onClick={() => rueckgaengig(zustand.z)}>Rückgängig</button>
            </p>
            <p className="zeile">In dieser Sitzung erfasst: {sitzung}. Nächste Disc vor die Kamera halten.</p>
          </div>
        )}
      </section>
      )}
    </>
  )
}

/** Stufe 1 der Kette: der Code ist schon zugeordnet. */
function TrefferKarte({
  t,
  laeuft,
  onExemplar,
  onAnderes,
  onWeiter,
}: {
  t: Treffer
  laeuft: boolean
  onExemplar: () => void
  onAnderes: () => void
  onWeiter: () => void
}) {
  const r = t.release!
  return (
    <div className="pruefkarte">
      <div className="bild">{r.bild ? <img src={r.bild} alt="" /> : <span aria-hidden="true">▦</span>}</div>
      <div>
        <h2>
          <Link to={`/spiel/${r.spielId}`}>{r.titel}</Link> ({r.plattform})
        </h2>
        <p>
          EAN {t.ean} · {r.exemplare === 0 ? 'noch kein Exemplar' : `im Regal ×${r.exemplare}`}
        </p>
        <p className="aktionen">
          <button type="button" disabled={laeuft} onClick={onExemplar}>
            {r.exemplare === 0 ? 'Disc erfassen' : 'Weiteres Exemplar'}
          </button>
          <button type="button" disabled={laeuft} onClick={onAnderes}>Anderes Spiel</button>
          <button type="button" disabled={laeuft} onClick={onWeiter}>Weiter</button>
        </p>
      </div>
    </div>
  )
}
