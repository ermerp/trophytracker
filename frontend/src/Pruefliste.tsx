import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AKTIONSTEXT,
  PLATINTEXT,
  REVIEW_AKTIONEN,
  STATUSTEXT,
  anfrage,
  datum,
  type Platin,
  type PlayStatus,
  type ReviewAktion,
  type ReviewFortschritt,
} from './api'

/**
 * Prüfliste (Use Case 8, Abschnitt 8.1): ein Spiel pro Bildschirm.
 *
 * Jede Entscheidung wird sofort gespeichert; „Beenden" fragt deshalb nicht
 * nach. Wer zurückkommt, macht beim nächsten offenen Eintrag weiter.
 * „Überspringen" setzt `unentschieden` – die zweite Runde, auffindbar über
 * den Status-Filter der Sammlung.
 */

type Stufen = { bronze: number; silber: number; gold: number; platin: number }

type Eintrag = {
  releaseId: number
  spielId: number
  titel: string
  plattform: string
  grund: string
  grundText: string
  detail: string | null
  bild: string | null
  fortschritt: number | null
  platin: Platin | null
  erspielt: Stufen
  definiert: Stufen
  zuletztGespielt: string | null
  aktuellerStatus: PlayStatus | null
}

type Queue = { gesamtOffen: number; eintraege: Eintrag[] }

export function Pruefliste() {
  const [eintrag, setEintrag] = useState<Eintrag | null | undefined>(undefined)
  const [fortschritt, setFortschritt] = useState<ReviewFortschritt | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)

  const laden = useCallback(async () => {
    try {
      const [q, f] = await Promise.all([
        anfrage<Queue>('/api/review/queue?limit=1'),
        anfrage<ReviewFortschritt>('/api/review/progress'),
      ])
      setEintrag(q.eintraege[0] ?? null)
      setFortschritt(f)
    } catch (fehler) {
      setMeldung(fehler instanceof Error ? fehler.message : 'Laden fehlgeschlagen.')
    }
  }, [])

  useEffect(() => {
    void laden()
  }, [laden])

  const entscheiden = useCallback(
    async (aktion: ReviewAktion) => {
      if (!eintrag || laeuft) return
      setLaeuft(true)
      setMeldung(null)
      try {
        // Nur die Warteschlange neu holen: Die Fortschrittszahlen stehen
        // schon in der Antwort. Ein zusaetzliches /progress je Entscheidung
        // kostet bei 430 Einträgen rund 1.700 gelesene Zeilen - über einen
        // ganzen Durchgang die Hälfte des gesamten Leseaufwands.
        const a = await anfrage<{ nochOffen: number }>(`/api/review/${eintrag.releaseId}/decide`, {
          methode: 'POST',
          koerper: { aktion },
        })
        setFortschritt((f) =>
          f && {
            ...f,
            offen: a.nochOffen,
            erledigt: f.erledigt + 1,
            unentschieden: f.unentschieden + (aktion === 'ueberspringen' ? 1 : 0),
          },
        )
        const q = await anfrage<Queue>('/api/review/queue?limit=1')
        setEintrag(q.eintraege[0] ?? null)
      } catch (fehler) {
        setMeldung(fehler instanceof Error ? fehler.message : 'Entscheidung fehlgeschlagen.')
      } finally {
        setLaeuft(false)
      }
    },
    [eintrag, laeuft],
  )

  // Tastenkürzel 1–7, nicht in Eingabefeldern.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      const n = Number(e.key)
      if (n >= 1 && n <= REVIEW_AKTIONEN.length) void entscheiden(REVIEW_AKTIONEN[n - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entscheiden])

  if (eintrag === undefined) return <p>wird geladen …</p>

  const kopf = fortschritt && (
    <header className="prueflisten-kopf">
      <h1>Prüfliste</h1>
      <p>
        noch <strong>{fortschritt.offen}</strong> von {fortschritt.gesamt}
        <span className="zeile nur-desktop"> · Tasten 1–7 entscheiden</span>{' '}
        <Link to="/sammlung">Beenden</Link>
      </p>
      <p className="zeile hinweiszeile">Du bewertest den Spielstand, nicht den Besitz.</p>
      <div className="fortschrittsbalken" aria-hidden="true">
        <div style={{ width: `${fortschritt.gesamt ? (100 * (fortschritt.gesamt - fortschritt.offen)) / fortschritt.gesamt : 0}%` }} />
      </div>
    </header>
  )

  if (eintrag === null) {
    return (
      <>
        {kopf}
        <p>Alles durchgesehen – der Datenbestand steht.</p>
        {fortschritt && fortschritt.unentschieden > 0 && (
          <p className="hinweis">
            {fortschritt.unentschieden} Spiele hast du übersprungen.{' '}
            <Link to="/sammlung?playStatus=unentschieden">In der Sammlung ansehen</Link>
          </p>
        )}
        <p><Link to="/sammlung">Zur Sammlung</Link></p>
      </>
    )
  }

  const e = eintrag
  return (
    <>
      {kopf}
      {meldung && <p role="alert" className="auffaellig">{meldung}</p>}

      <article className="pruefkarte">
        <div className="bild">
          {e.bild ? <img src={e.bild} alt="" /> : <span aria-hidden="true">{e.titel.slice(0, 1)}</span>}
        </div>
        <div>
          <p className="zeile">{e.grundText}</p>
          <h2>
            <Link to={`/spiel/${e.spielId}`}>{e.titel}</Link> <span className="zeile">{e.plattform}</span>
          </h2>
          {e.detail && <p className="hinweis">{e.detail}</p>}
          {e.fortschritt === null ? (
            <p className="zeile">keine Trophäenliste</p>
          ) : (
            <p>
              <strong>{e.fortschritt} %</strong> ·{' '}
              <span className={`platin ${e.platin}`}>{PLATINTEXT[e.platin ?? 'nicht_verfuegbar']}</span>
              <br />
              <span className="zeile">
                {e.erspielt.bronze}/{e.definiert.bronze} Bronze · {e.erspielt.silber}/{e.definiert.silber} Silber ·{' '}
                {e.erspielt.gold}/{e.definiert.gold} Gold · zuletzt {datum(e.zuletztGespielt)}
              </span>
            </p>
          )}
          <p>
            Aktuell: <strong>{e.aktuellerStatus ? STATUSTEXT[e.aktuellerStatus] : 'kein Status'}</strong>
            {e.aktuellerStatus && e.grund === 'erstimport' && <span className="zeile"> (vorbelegt)</span>}
          </p>
        </div>
      </article>

      <div className="aktionen">
        {REVIEW_AKTIONEN.map((a, i) => (
          <button key={a} type="button" disabled={laeuft} onClick={() => entscheiden(a)}>
            <kbd>{i + 1}</kbd> {AKTIONSTEXT[a]}
          </button>
        ))}
      </div>
    </>
  )
}
