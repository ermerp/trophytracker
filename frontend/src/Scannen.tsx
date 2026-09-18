import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PLATTFORMEN, anfrage, erledigtText, type ErfasstAntwort, type Plattform } from './api'
import { useKamera } from './kamera'
import { SpielAnlegen } from './SpielAnlegen'

/**
 * Scannen (Abschnitt 9, Stufe 17): Serienerfassung des Regals.
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

type SuchRelease = { id: number; plattform: Plattform; exemplare: number; digital: string[] }
type SuchSpiel = { id: number; titel: string; bild: string | null; releases: SuchRelease[] }

type Zustand =
  | { art: 'leer' }
  | { art: 'treffer'; t: Treffer }
  | { art: 'auswahl'; t: Treffer }
  | { art: 'erfasst'; z: Zuordnung }

const istPlattform = (w: string | null | undefined): w is Plattform => (PLATTFORMEN as readonly string[]).includes(w ?? '')

export function Scannen() {
  const [params, setParams] = useSearchParams()
  const [zustand, setZustand] = useState<Zustand>({ art: 'leer' })
  const [eingabe, setEingabe] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [sitzung, setSitzung] = useState(0)

  const [letzterCode, setLetzterCode] = useState<string | null>(null)

  /** `zaehlen: false` beim Öffnen aus den Einstellungen – kein neuer Scan. */
  const aufloesen = useCallback(async (roh: string, zaehlen = true) => {
    setFehler(null)
    setHinweis(null)
    setLaeuft(true)
    try {
      const t = await anfrage<Treffer>('/api/scan', { methode: 'POST', koerper: { ean: roh, zaehlen } })
      setLetzterCode(t.ean)
      setZustand(t.treffer === 'mapping' ? { art: 'treffer', t } : { art: 'auswahl', t })
      return true
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Auflösen fehlgeschlagen.')
      return false
    } finally {
      setLaeuft(false)
    }
  }, [])

  // Der zuletzt behandelte Code löst nicht erneut aus, bis ein anderer kam
  // (siehe useKamera); dieselbe Disc noch einmal geht über das Textfeld.
  const { videoRef, status: kameraStatus, fehler: kameraFehler, nativ, geraete, starten, stoppen, wechseln, pausiert, setPausiert, kandidat } =
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

  return (
    <>
      <h1>Scannen</h1>

      <section className="scanner">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Kamerabild"
          hidden={kameraStatus === 'aus' || kameraStatus === 'fehler'}
        />
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
          <Auswahl
            key={zustand.t.ean}
            t={zustand.t}
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

/** Stufe 3 und 4 der Kette: aus der Sammlung wählen oder anlegen. Je Code neu aufgebaut (key). */
function Auswahl({
  t,
  laeuft,
  onWahl,
  onSpaeter,
}: {
  t: Treffer
  laeuft: boolean
  onWahl: (koerper: { releaseId: number } | { spielId: number; plattform: Plattform }) => void
  onSpaeter: () => void
}) {
  const [suchtext, setSuchtext] = useState(t.angebot?.titel ?? '')
  const [spiele, setSpiele] = useState<SuchSpiel[] | null>(null)
  const [sucht, setSucht] = useState(false)

  // Suche entprellen wie in der Sammlung: 300 ms nach dem letzten Tastendruck.
  useEffect(() => {
    const suche = suchtext.trim()
    if (suche === '') {
      setSpiele(null)
      return
    }
    const zeit = setTimeout(async () => {
      setSucht(true)
      try {
        const a = await anfrage<{ spiele: SuchSpiel[] }>(`/api/games?search=${encodeURIComponent(suche)}&limit=10`)
        setSpiele(a.spiele)
      } catch {
        setSpiele([])
      } finally {
        setSucht(false)
      }
    }, 300)
    return () => clearTimeout(zeit)
  }, [suchtext])

  const plattformVorgabe: Plattform = istPlattform(t.angebot?.plattform) ? t.angebot!.plattform : 'PS4'

  return (
    <div className="auswahl">
      <p>
        <strong>EAN {t.ean}</strong> ist noch nicht zugeordnet
        {t.scans > 1 && ` (zum ${t.scans}. Mal gescannt)`}.
        {t.angebot && ` Ein Händler nennt „${t.angebot.titel}"${t.angebot.plattform ? ` (${t.angebot.plattform})` : ''}.`}
      </p>
      <p className="steuerung">
        <input
          type="search"
          value={suchtext}
          onChange={(e) => setSuchtext(e.target.value)}
          placeholder="Titel in der Sammlung suchen"
          aria-label="Titel in der Sammlung suchen"
          autoFocus
        />{' '}
        <button type="button" disabled={laeuft} onClick={onSpaeter}>Später</button>
      </p>
      {sucht && <p>sucht …</p>}
      {spiele && spiele.length === 0 && !sucht && <p>Kein Spiel mit diesem Titel in der Sammlung.</p>}
      {spiele && spiele.length > 0 && (
        <ul className="treffer">
          {spiele.map((s) => (
            <li key={s.id}>
              <span className="titel">{s.titel}</span>{' '}
              {s.releases.map((r) => (
                <button key={r.id} type="button" disabled={laeuft} onClick={() => onWahl({ releaseId: r.id })}>
                  {r.plattform}
                  {r.exemplare > 0 && ` · Disc ×${r.exemplare}`}
                </button>
              ))}
              {s.releases.length < PLATTFORMEN.length && (
                <select
                  value=""
                  disabled={laeuft}
                  aria-label={`Andere Plattform für ${s.titel}`}
                  onChange={(e) => {
                    if (istPlattform(e.target.value)) onWahl({ spielId: s.id, plattform: e.target.value })
                  }}
                >
                  <option value="">andere Plattform …</option>
                  {PLATTFORMEN.filter((p) => !s.releases.some((r) => r.plattform === p)).map((p) => (
                    <option key={p} value={p}>{p} anlegen</option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}
      <SpielAnlegen
        key={t.ean}
        titelVorgabe={suchtext.trim()}
        plattformVorgabe={plattformVorgabe}
        vorhandenesVerwenden
        onAngelegt={(releaseId) => onWahl({ releaseId })}
      />
    </div>
  )
}
