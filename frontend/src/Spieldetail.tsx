import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  DISCTEXT,
  PLATINTEXT,
  PLATTFORMEN,
  QUELLEN,
  QUELLENTEXT,
  ZUSTAENDE,
  anfrage,
  datum,
  euro,
  type DiscFassung,
  type Platin,
  type Plattform,
  type Quelle,
  type Zustand,
} from './api'

/**
 * Spieldetail (Use Cases 1, 2, 7): Releases, Exemplare, Trophäen.
 *
 * Trophäenfortschritt und eigener Status stehen später nebeneinander, nie
 * verrechnet – die eigene Bewertung kommt in Stufe 6, Preise in Stufe 18/19.
 */

type Stufen = { bronze: number; silber: number; gold: number; platin: number }

type Trophaeen = {
  npCommunicationId: string
  rohTitel: string
  fortschritt: number
  platin: Platin
  erspielt: Stufen
  definiert: Stufen
  zuletztGespielt: string | null
}

type Exemplar = {
  id: number
  ean: string | null
  zustand: Zustand | null
  anleitung: boolean
  kaufdatum: string | null
  kaufpreisCents: number | null
  notiz: string | null
  angelegtAm: string
}

type Digital = { id: number; quelle: Quelle; erworbenAm: string | null }

type Release = {
  id: number
  plattform: Plattform
  edition: string | null
  region: string | null
  discFassung: DiscFassung
  discQuelle: string | null
  trophaeen: Trophaeen | null
  exemplare: Exemplar[]
  digital: Digital[]
}

type Spiel = { id: number; titel: string; bild: string | null; igdbId: number | null; releases: Release[] }

export function Spieldetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [spiel, setSpiel] = useState<Spiel | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  const laden = useCallback(async () => {
    try {
      setSpiel(await anfrage<Spiel>(`/api/games/${id}`))
      setFehler(null)
    } catch (f) {
      setFehler(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
    }
  }, [id])

  useEffect(() => {
    void laden()
  }, [laden])

  /** Führt einen Schreibzugriff aus und lädt danach neu. */
  async function tue(aktion: () => Promise<unknown>, erfolg?: string) {
    setLaeuft(true)
    setMeldung(null)
    try {
      await aktion()
      if (erfolg) setMeldung(erfolg)
      await laden()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  async function umbenennen(titel: string) {
    if (!spiel || titel === spiel.titel) return
    await tue(() => anfrage(`/api/games/${spiel.id}`, { methode: 'PATCH', koerper: { titel } }), `Umbenannt: ${titel}`)
  }

  async function spielLoeschen() {
    if (!spiel) return
    const listen = spiel.releases.filter((r) => r.trophaeen).length
    const exemplare = spiel.releases.reduce((n, r) => n + r.exemplare.length, 0)
    const was = [
      `${spiel.releases.length} Release(s)`,
      exemplare > 0 && `${exemplare} Exemplar(e)`,
      listen > 0 && `${listen} Trophäenliste(n) zurück in die Zuordnung`,
    ].filter(Boolean).join(', ')
    if (!confirm(`„${spiel.titel}" löschen? Das nimmt mit: ${was}.`)) return
    setLaeuft(true)
    try {
      await anfrage(`/api/games/${spiel.id}`, { methode: 'DELETE' })
      navigate('/sammlung')
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Löschen fehlgeschlagen.')
      setLaeuft(false)
    }
  }

  async function releaseLoeschen(r: Release) {
    if (!spiel) return
    const was = [
      r.exemplare.length > 0 && `${r.exemplare.length} Exemplar(e)`,
      r.digital.length > 0 && `${r.digital.length} digitale Berechtigung(en)`,
      r.trophaeen && 'die Trophäenliste geht zurück in die Zuordnung',
      spiel.releases.length === 1 && 'das Spiel selbst, weil kein Release bleibt',
    ].filter(Boolean)
    const text = was.length ? ` Das nimmt mit: ${was.join(', ')}.` : ''
    if (!confirm(`${r.plattform}-Release von „${spiel.titel}" löschen?${text}`)) return

    if (spiel.releases.length === 1) {
      setLaeuft(true)
      try {
        await anfrage(`/api/releases/${r.id}`, { methode: 'DELETE' })
        navigate('/sammlung')
      } catch (f) {
        setMeldung(f instanceof Error ? f.message : 'Löschen fehlgeschlagen.')
        setLaeuft(false)
      }
      return
    }
    await tue(() => anfrage(`/api/releases/${r.id}`, { methode: 'DELETE' }), `${r.plattform}-Release gelöscht.`)
  }

  if (fehler) {
    return (
      <>
        <p role="alert">{fehler}</p>
        <p><Link to="/sammlung">Zur Sammlung</Link></p>
      </>
    )
  }
  if (!spiel) return <p>wird geladen …</p>

  const freiePlattformen = PLATTFORMEN.filter((p) => !spiel.releases.some((r) => r.plattform === p))

  return (
    <>
      <p><button type="button" onClick={() => navigate(-1)}>← Zurück</button></p>

      <header className="detailkopf">
        {spiel.bild && <img src={spiel.bild} alt="" width={96} height={96} />}
        <div>
          <input
            type="text"
            className="titelfeld"
            defaultValue={spiel.titel}
            key={spiel.titel}
            aria-label="Titel"
            onBlur={(e) => {
              const t = e.target.value.trim()
              if (t) void umbenennen(t)
              else e.target.value = spiel.titel
            }}
          />
          <p className="zeile">
            {spiel.releases.length} Release(s)
            {spiel.igdbId === null && ' · ohne IGDB-Zuordnung (Stufe 9)'}
          </p>
        </div>
      </header>

      {meldung && <p role="status">{meldung}</p>}

      {spiel.releases.map((r) => (
        <section key={r.id} className="release-block">
          <h2>
            {r.plattform}
            {r.edition && ` · ${r.edition}`}
            {r.region && ` · ${r.region}`}
          </h2>

          <p className="zeile">
            {DISCTEXT[r.discFassung]}
            {r.discQuelle && ` (${r.discQuelle})`}
            {' · '}
            <span title="Eigene Bewertung kommt in Stufe 6">eigener Status: noch nicht erfassbar</span>
          </p>

          {r.trophaeen ? (
            <p>
              <strong>{r.trophaeen.fortschritt} %</strong> ·{' '}
              <span className={`platin ${r.trophaeen.platin}`}>{PLATINTEXT[r.trophaeen.platin]}</span>
              <span className="zeile">
                {' '}· {r.trophaeen.erspielt.bronze}/{r.trophaeen.definiert.bronze} Bronze ·{' '}
                {r.trophaeen.erspielt.silber}/{r.trophaeen.definiert.silber} Silber ·{' '}
                {r.trophaeen.erspielt.gold}/{r.trophaeen.definiert.gold} Gold · zuletzt{' '}
                {datum(r.trophaeen.zuletztGespielt)}
                {r.trophaeen.rohTitel !== spiel.titel && ` · bei Sony: „${r.trophaeen.rohTitel}"`}
              </span>
            </p>
          ) : (
            <p className="zeile">keine Trophäenliste</p>
          )}

          <h3>Exemplare</h3>
          {r.exemplare.length === 0 && <p className="zeile">keine</p>}
          {r.exemplare.map((e) => (
            <ExemplarZeile
              key={e.id}
              exemplar={e}
              laeuft={laeuft}
              onSpeichern={(felder) =>
                tue(() => anfrage(`/api/physical-copies/${e.id}`, { methode: 'PATCH', koerper: felder }), 'Exemplar gespeichert.')
              }
              onLoeschen={() => {
                if (confirm('Dieses Exemplar löschen?')) {
                  void tue(() => anfrage(`/api/physical-copies/${e.id}`, { methode: 'DELETE' }), 'Exemplar gelöscht.')
                }
              }}
            />
          ))}
          <p>
            <button
              type="button"
              disabled={laeuft}
              onClick={() =>
                tue(() => anfrage('/api/physical-copies', { methode: 'POST', koerper: { releaseId: r.id } }), 'Exemplar angelegt.')
              }
            >
              + Exemplar
            </button>
          </p>

          <h3>Digital</h3>
          {r.digital.length === 0 && <p className="zeile">keine</p>}
          {r.digital.length > 0 && (
            <ul className="digital">
              {r.digital.map((d) => (
                <li key={d.id}>
                  {QUELLENTEXT[d.quelle]}
                  {d.erworbenAm && <span className="zeile"> · erworben {datum(d.erworbenAm)}</span>}{' '}
                  <button
                    type="button"
                    className="klein"
                    disabled={laeuft}
                    aria-label={`${QUELLENTEXT[d.quelle]} entfernen`}
                    onClick={() => {
                      if (confirm(`„${QUELLENTEXT[d.quelle]}" entfernen?`)) {
                        void tue(() => anfrage(`/api/digital-entitlements/${d.id}`, { methode: 'DELETE' }), 'Entfernt.')
                      }
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <DigitalAnlegen
            belegt={r.digital.map((d) => d.quelle)}
            laeuft={laeuft}
            onAnlegen={(quelle, erworbenAm) =>
              tue(
                () => anfrage('/api/digital-entitlements', { methode: 'POST', koerper: { releaseId: r.id, quelle, erworbenAm } }),
                `„${QUELLENTEXT[quelle]}" angelegt.`,
              )
            }
          />

          <p>
            <button type="button" className="gefaehrlich" disabled={laeuft} onClick={() => releaseLoeschen(r)}>
              Release löschen
            </button>
          </p>
        </section>
      ))}

      <section>
        <h2>Spiel</h2>
        {freiePlattformen.length > 0 && (
          <p className="steuerung">
            <select id="neue-plattform" aria-label="Plattform für neues Release" defaultValue={freiePlattformen[0]}>
              {freiePlattformen.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>{' '}
            <button
              type="button"
              disabled={laeuft}
              onClick={() => {
                const wahl = (document.getElementById('neue-plattform') as HTMLSelectElement).value
                void tue(
                  () => anfrage('/api/releases', { methode: 'POST', koerper: { spielId: spiel.id, plattform: wahl } }),
                  `${wahl}-Release angelegt.`,
                )
              }}
            >
              + Release
            </button>
          </p>
        )}
        <p>
          <button type="button" className="gefaehrlich" disabled={laeuft} onClick={spielLoeschen}>
            Spiel löschen
          </button>
        </p>
      </section>
    </>
  )
}

type ExemplarFelder = {
  ean?: string | null
  zustand?: Zustand | null
  anleitung?: boolean
  kaufdatum?: string | null
  kaufpreisCents?: number | null
  notiz?: string | null
}

/** Ein Exemplar, inline bearbeitbar. Preis wird in Euro eingegeben und in Cent gesendet. */
function ExemplarZeile({
  exemplar: e,
  laeuft,
  onSpeichern,
  onLoeschen,
}: {
  exemplar: Exemplar
  laeuft: boolean
  onSpeichern: (felder: ExemplarFelder) => Promise<void>
  onLoeschen: () => void
}) {
  const [bearbeitet, setBearbeitet] = useState(false)
  const [zustand, setZustand] = useState<Zustand | ''>(e.zustand ?? '')
  const [anleitung, setAnleitung] = useState(e.anleitung)
  const [kaufdatum, setKaufdatum] = useState(e.kaufdatum ?? '')
  const [preis, setPreis] = useState(e.kaufpreisCents === null ? '' : (e.kaufpreisCents / 100).toFixed(2))
  const [ean, setEan] = useState(e.ean ?? '')
  const [notiz, setNotiz] = useState(e.notiz ?? '')

  async function speichern(ev: React.FormEvent) {
    ev.preventDefault()
    const cents = preis.trim() === '' ? null : Math.round(Number(preis.replace(',', '.')) * 100)
    if (cents !== null && (!Number.isFinite(cents) || cents < 0)) return
    await onSpeichern({
      zustand: zustand || null,
      anleitung,
      kaufdatum: kaufdatum || null,
      kaufpreisCents: cents,
      ean: ean.trim() || null,
      notiz: notiz.trim() || null,
    })
    setBearbeitet(false)
  }

  if (!bearbeitet) {
    return (
      <p className="exemplar">
        {e.zustand ?? 'Zustand unbekannt'}
        {e.anleitung && ' · mit Anleitung'}
        {' · gekauft '}{datum(e.kaufdatum)}
        {' · '}{euro(e.kaufpreisCents)}
        {e.ean && ` · EAN ${e.ean}`}
        {e.notiz && <span className="zeile"> · {e.notiz}</span>}{' '}
        <button type="button" className="klein" disabled={laeuft} onClick={() => setBearbeitet(true)}>Bearbeiten</button>{' '}
        <button type="button" className="klein" disabled={laeuft} onClick={onLoeschen} aria-label="Exemplar löschen">×</button>
      </p>
    )
  }

  return (
    <form className="exemplar-form" onSubmit={speichern}>
      <label>
        Zustand{' '}
        <select value={zustand} onChange={(ev) => setZustand(ev.target.value as Zustand | '')}>
          <option value="">unbekannt</option>
          {ZUSTAENDE.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </label>
      <label>
        <input type="checkbox" checked={anleitung} onChange={(ev) => setAnleitung(ev.target.checked)} /> mit Anleitung
      </label>
      <label>
        Kaufdatum <input type="date" value={kaufdatum} onChange={(ev) => setKaufdatum(ev.target.value)} />
      </label>
      <label>
        Preis (€) <input type="text" inputMode="decimal" value={preis} onChange={(ev) => setPreis(ev.target.value)} placeholder="unbekannt" />
      </label>
      <label>
        EAN <input type="text" inputMode="numeric" value={ean} onChange={(ev) => setEan(ev.target.value)} pattern="[0-9]{8,14}" />
      </label>
      <label>
        Notiz <input type="text" value={notiz} onChange={(ev) => setNotiz(ev.target.value)} />
      </label>
      <p>
        <button type="submit" disabled={laeuft}>Speichern</button>{' '}
        <button type="button" onClick={() => setBearbeitet(false)}>Abbrechen</button>
      </p>
    </form>
  )
}

function DigitalAnlegen({
  belegt,
  laeuft,
  onAnlegen,
}: {
  belegt: Quelle[]
  laeuft: boolean
  onAnlegen: (quelle: Quelle, erworbenAm: string | null) => Promise<void>
}) {
  const frei = QUELLEN.filter((q) => !belegt.includes(q))
  const [quelle, setQuelle] = useState<Quelle | ''>('')
  const [erworbenAm, setErworbenAm] = useState('')

  if (frei.length === 0) return null
  const wahl = quelle && frei.includes(quelle) ? quelle : frei[0]

  return (
    <p className="steuerung">
      <select value={wahl} onChange={(ev) => setQuelle(ev.target.value as Quelle)} aria-label="Digitale Quelle">
        {frei.map((q) => <option key={q} value={q}>{QUELLENTEXT[q]}</option>)}
      </select>{' '}
      <input type="date" value={erworbenAm} onChange={(ev) => setErworbenAm(ev.target.value)} aria-label="erworben am" />{' '}
      <button
        type="button"
        disabled={laeuft}
        onClick={async () => {
          await onAnlegen(wahl, erworbenAm || null)
          setErworbenAm('')
        }}
      >
        + digital
      </button>
    </p>
  )
}
