import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  FORMTEXT,
  PLATTFORMEN,
  anfrage,
  textAusDatei,
  zeitpunkt,
  type IgdbKandidat,
  type ImportGruppe,
  type ImportLauf,
  type ImportSeite,
  type ImportZeile,
  type PlanEintrag,
} from './api'
import { IgdbSuche, KandidatenListe } from './IgdbSuche'

/**
 * Wunschliste importieren (Use Case 9, Abschnitt 8.2).
 *
 * Ein Lauf je Datei; der Zustand liegt in der Datenbank. Jede Zeile bekommt
 * beim Abgleich die neueste Plattform des Treffers vorgeschlagen, änderbar im
 * Dropdown vor der Übernahme (Entscheidung des Nutzers vom 15.09.2026); bei
 * Zeilen zur Durchsicht gilt „neueste des Treffers", bis etwas gewählt ist.
 * Der Abgleich läuft
 * in Schritten (acht Zeilen je Aufruf), solange `weiter` zurückkommt – wie
 * beim IGDB-Abgleich. Danach die Durchsicht in drei Blöcken: Eindeutige und
 * schon vorhandene Spiele als ein Block mit einem Knopf, Einzelentscheidung
 * nur für Mehrdeutige und Zeilen ohne Treffer (Entscheidung des Nutzers vom
 * 15.09.2026: als Liste, nicht eine Zeile je Bildschirm). Jede Entscheidung
 * ist sofort gespeichert; nichts wird stillschweigend übernommen.
 */

const SEITE = 20

type AbgleichAntwort = {
  status: 'erfolg' | 'laufend' | 'fehler'
  geprueft: number
  sammlung: number
  eindeutig: number
  mehrdeutig: number
  ohneTreffer: number
  nochOffen: number
  weiter: boolean
  meldung?: string
}

type UebernahmeAntwort = { status: 'erfolg' | 'fehler'; uebernommen: number; spieleAngelegt: number; nochOffen: number; weiter: boolean; meldung?: string }

const jahrAus = (name: string) => {
  const m = /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(name)
  return m ? m[1] : ''
}

export function WunschlisteImport() {
  const { id } = useParams()
  return id ? <ImportLaufAnsicht id={Number(id)} /> : <ImportStart />
}

/** Schritt 1: Datei oder Text, Jahr aus dem Dateinamen (korrigierbar), dazu die bisherigen Läufe. */
function ImportStart() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [dateiname, setDateiname] = useState('')
  const [jahr, setJahr] = useState('')
  const [laeufe, setLaeufe] = useState<ImportLauf[] | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  const laden = useCallback(async () => {
    try {
      setLaeufe((await anfrage<{ laeufe: ImportLauf[] }>('/api/imports/wishlist')).laeufe)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
    }
  }, [])

  useEffect(() => {
    void laden()
  }, [laden])

  async function dateiGewaehlt(datei: File | undefined) {
    if (!datei) return
    setText(await textAusDatei(datei))
    setDateiname(datei.name)
    setJahr(jahrAus(datei.name))
  }

  async function anlegen(ereignis: React.FormEvent) {
    ereignis.preventDefault()
    setLaeuft(true)
    setMeldung(null)
    try {
      const a = await anfrage<{ id: number; zeilen: number; ueberschriften: string[]; zusammengefuehrt: number }>('/api/imports/wishlist', {
        methode: 'POST',
        koerper: { text, dateiname: dateiname || undefined, jahr: jahr === '' ? null : Number(jahr) },
      })
      navigate(`/import/${a.id}`, {
        state: { start: true, hinweis: `${a.zeilen} Titelzeilen, ${a.ueberschriften.length} Überschriften erkannt${a.zusammengefuehrt > 0 ? `, ${a.zusammengefuehrt} Doppelungen zusammengeführt` : ''}.` },
      })
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Anlegen fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  async function loeschen(l: ImportLauf) {
    if (!confirm(`Import „${l.quelle ?? 'Eingabe'}" verwerfen? Schon übernommene Wünsche bleiben auf der Wunschliste.`)) return
    try {
      await anfrage(`/api/imports/wishlist/${l.id}`, { methode: 'DELETE' })
      await laden()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Löschen fehlgeschlagen.')
    }
  }

  return (
    <>
      <h1>Wunschliste importieren</h1>
      <p className="zeile">
        Eine Textdatei oder eingefügter Text, ein Titel pro Zeile. Jahreslisten mit „-Januar" … „-Dezember" und Listen mit
        Abschnitten „PS4" / „PS3" werden erkannt; das Jahr kommt aus dem Dateinamen und entscheidet Gleichnamige.
        Nichts wird stillschweigend übernommen – die Durchsicht folgt nach dem Abgleich.
      </p>

      <form onSubmit={anlegen} className="import-form">
        <label>
          Datei{' '}
          <input type="file" accept=".txt,.tsv,.csv,text/plain" onChange={(e) => void dateiGewaehlt(e.target.files?.[0])} disabled={laeuft} />
        </label>
        <label>
          Jahr der Liste{' '}
          <input type="number" min={1990} max={2100} value={jahr} onChange={(e) => setJahr(e.target.value)} placeholder="leer = unbekannt" disabled={laeuft} />
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={'-Januar\nEin Spiel\nNoch ein Spiel\n\n-Februar\n…'}
          aria-label="Wunschliste als Text"
          disabled={laeuft}
        />
        <div className="knopfzeile">
          <button type="submit" disabled={laeuft || text.trim() === ''}>
            {laeuft ? 'legt an …' : 'Einlesen und abgleichen'}
          </button>
          {dateiname && <span className="zeile">aus „{dateiname}"</span>}
        </div>
      </form>

      {meldung && <p role="alert" className="auffaellig">{meldung}</p>}

      {laeufe && laeufe.length > 0 && (
        <section>
          <h2>Bisherige Importe</h2>
          <ul className="importliste">
            {laeufe.map((l) => {
              const offen = l.zaehler.ungeprueft + l.zaehler.klar + l.zaehler.mehrdeutig + l.zaehler.ohneTreffer
              return (
                <li key={l.id}>
                  <Link to={`/import/${l.id}`}><strong>{l.quelle ?? 'Eingabe'}</strong></Link>{' '}
                  <span className="zeile">
                    {zeitpunkt(l.angelegtAm)} · {l.zaehler.gesamt} Zeilen · {l.zaehler.uebernommen} übernommen ·{' '}
                    {offen > 0 ? `${offen} offen` : 'fertig'}
                  </span>{' '}
                  <button type="button" className="klein gefaehrlich" onClick={() => loeschen(l)}>verwerfen</button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </>
  )
}

/** Schritt 2 und 3: Abgleich mit Fortschritt, dann die Durchsicht. */
function ImportLaufAnsicht({ id }: { id: number }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [lauf, setLauf] = useState<ImportLauf | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>((location.state as { hinweis?: string } | null)?.hinweis ?? null)
  const [abgleich, setAbgleich] = useState<{ laeuft: boolean; text: string | null }>({ laeuft: false, text: null })
  const [uebernahme, setUebernahme] = useState<{ laeuft: boolean; text: string | null }>({ laeuft: false, text: null })
  const [eben, setEben] = useState<ImportZeile | null>(null)
  const [version, setVersion] = useState(0)
  const [autostart, setAutostart] = useState(Boolean((location.state as { start?: boolean } | null)?.start))

  const laden = useCallback(async () => {
    try {
      setLauf(await anfrage<ImportLauf>(`/api/imports/wishlist/${id}`))
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
    }
  }, [id])

  useEffect(() => {
    void laden()
  }, [laden])

  /** Zähler neu laden und die Listen zum Neuladen anstoßen. */
  async function aktualisieren() {
    await laden()
    setVersion((v) => v + 1)
  }

  const abgleichen = useCallback(async () => {
    setAbgleich({ laeuft: true, text: 'Abgleich läuft …' })
    setMeldung(null)
    const summe = { sammlung: 0, eindeutig: 0, mehrdeutig: 0, ohneTreffer: 0 }
    try {
      for (let runde = 0; runde < 200; runde++) {
        const a = await anfrage<AbgleichAntwort>(`/api/imports/wishlist/${id}/abgleich`, { methode: 'POST' })
        summe.sammlung += a.sammlung
        summe.eindeutig += a.eindeutig
        summe.mehrdeutig += a.mehrdeutig
        summe.ohneTreffer += a.ohneTreffer
        setAbgleich({
          laeuft: true,
          text: `Noch ${a.nochOffen} Zeilen … (${summe.sammlung} in der Sammlung, ${summe.eindeutig} eindeutig, ${summe.mehrdeutig + summe.ohneTreffer} zur Durchsicht)`,
        })
        if (a.status === 'fehler') {
          setMeldung(a.meldung ?? 'Der Abgleich ist fehlgeschlagen.')
          break
        }
        if (!a.weiter) break
        if (a.meldung) await new Promise((r) => setTimeout(r, 1500))
      }
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Der Abgleich ist fehlgeschlagen.')
    } finally {
      setAbgleich({ laeuft: false, text: null })
      await laden()
      setVersion((v) => v + 1)
    }
  }, [id, laden])

  useEffect(() => {
    if (autostart && lauf && lauf.zaehler.ungeprueft > 0 && !abgleich.laeuft) {
      setAutostart(false)
      navigate(location.pathname, { replace: true, state: null })
      void abgleichen()
    }
  }, [autostart, lauf, abgleich.laeuft, abgleichen, navigate, location.pathname])

  async function uebernehmen() {
    if (!lauf) return
    setUebernahme({ laeuft: true, text: 'Übernahme läuft …' })
    setMeldung(null)
    let summe = 0
    try {
      for (let runde = 0; runde < 100; runde++) {
        const a = await anfrage<UebernahmeAntwort>(`/api/imports/wishlist/${id}/uebernehmen`, { methode: 'POST' })
        summe += a.uebernommen
        setUebernahme({ laeuft: true, text: `${summe} übernommen, noch ${a.nochOffen} …` })
        if (a.status === 'fehler') {
          setMeldung(a.meldung ?? 'Die Übernahme ist fehlgeschlagen.')
          break
        }
        if (!a.weiter) break
      }
      setHinweis(`${summe} Wünsche übernommen.`)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Die Übernahme ist fehlgeschlagen.')
    } finally {
      setUebernahme({ laeuft: false, text: null })
      await aktualisieren()
    }
  }

  async function entscheiden(zeile: ImportZeile, koerper: Record<string, unknown>, erfolg: (z: ImportZeile & { wunsch?: PlanEintrag | null }) => string) {
    setMeldung(null)
    try {
      const z = await anfrage<ImportZeile & { wunsch?: PlanEintrag | null }>(`/api/imports/wishlist/${id}/zeilen/${zeile.id}/entscheiden`, { methode: 'POST', koerper })
      setHinweis(erfolg(z))
      setEben(z.entscheidung === 'offen' ? null : z)
      await aktualisieren()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Fehlgeschlagen.')
      await aktualisieren()
    }
  }

  const uebernehmenIgdb = (zeile: ImportZeile, k: IgdbKandidat, plattform: string) =>
    entscheiden(zeile, { aktion: 'igdb', igdbId: k.igdbId, plattform }, (z) => `„${zeile.titel}" → ${k.name} (${z.wunsch?.plattform ?? 'ohne Plattform'}) auf die Wunschliste gesetzt.`)

  const ueberspringen = (zeile: ImportZeile) => entscheiden(zeile, { aktion: 'ueberspringen' }, () => `„${zeile.titel}" übersprungen.`)

  const zuruecknehmen = (zeile: ImportZeile) =>
    entscheiden(zeile, { aktion: 'zuruecknehmen' }, () => `„${zeile.titel}" wieder offen.`)

  /** Freitext: Ist der Suchbegriff geändert worden, wird die Zeile erst umbenannt. */
  async function freitext(zeile: ImportZeile, begriff: string) {
    try {
      if (begriff !== zeile.titel) {
        await anfrage(`/api/imports/wishlist/${id}/zeilen/${zeile.id}`, { methode: 'PATCH', koerper: { titel: begriff } })
      }
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Umbenennen fehlgeschlagen.')
      return
    }
    await entscheiden(zeile, { aktion: 'freitext' }, () => `„${begriff}" ohne IGDB-Eintrag auf die Wunschliste gesetzt.`)
  }

  async function aufteilen(zeile: ImportZeile, titel: string[]) {
    setMeldung(null)
    try {
      await anfrage(`/api/imports/wishlist/${id}/zeilen/${zeile.id}/aufteilen`, { methode: 'POST', koerper: { titel } })
      setHinweis(`„${zeile.titel}" in ${titel.length} Zeilen aufgeteilt – Abgleich starten, um sie zu suchen.`)
      await aktualisieren()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Aufteilen fehlgeschlagen.')
    }
  }

  async function plattformSetzen(zeile: ImportZeile, plattform: string) {
    setMeldung(null)
    try {
      await anfrage(`/api/imports/wishlist/${id}/zeilen/${zeile.id}`, { methode: 'PATCH', koerper: { plattform } })
      setVersion((v) => v + 1)
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Plattform ändern fehlgeschlagen.')
    }
  }

  async function umbenennen(zeile: ImportZeile, titel: string) {
    setMeldung(null)
    try {
      await anfrage(`/api/imports/wishlist/${id}/zeilen/${zeile.id}`, { methode: 'PATCH', koerper: { titel } })
      setHinweis(`„${zeile.titel}" → „${titel}" – Abgleich starten, um neu zu suchen.`)
      await aktualisieren()
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : 'Umbenennen fehlgeschlagen.')
    }
  }

  if (!lauf) return meldung ? <p role="alert" className="auffaellig">{meldung}</p> : <p>wird geladen …</p>

  const z = lauf.zaehler
  const beschaeftigt = abgleich.laeuft || uebernahme.laeuft
  const aktionen: ZeilenAktionen = { uebernehmenIgdb, ueberspringen, zuruecknehmen, freitext, aufteilen, umbenennen, plattformSetzen, beschaeftigt }

  return (
    <>
      <p className="zeile"><Link to="/import">← Alle Importe</Link></p>
      <h1>Import „{lauf.quelle ?? 'Eingabe'}"</h1>
      <p className="zeile">
        {FORMTEXT[lauf.form]} · Jahr {lauf.jahr ?? 'unbekannt'} · {z.gesamt} Zeilen · {z.uebernommen} übernommen · {z.uebersprungen} übersprungen
        {z.schonVorhanden > 0 && ` · ${z.schonVorhanden} schon auf der Wunschliste`}
      </p>

      {hinweis && (
        <p role="status" className="hinweis">
          {hinweis}
          {eben && (
            <>
              {' '}
              <button type="button" className="klein" onClick={() => void zuruecknehmen(eben)} disabled={beschaeftigt}>Rückgängig</button>
            </>
          )}
        </p>
      )}
      {meldung && <p role="alert" className="auffaellig">{meldung}</p>}

      {(z.ungeprueft > 0 || abgleich.laeuft) && (
        <section className="import-block">
          <h2>Abgleich</h2>
          <p className="zeile">{z.ungeprueft} Zeilen sind noch nicht gegen Sammlung und IGDB abgeglichen.</p>
          <div className="fortschrittsbalken" aria-hidden="true">
            <div style={{ width: `${z.gesamt === 0 ? 0 : Math.round(((z.gesamt - z.ungeprueft) / z.gesamt) * 100)}%` }} />
          </div>
          <div className="knopfzeile">
            <button type="button" onClick={() => void abgleichen()} disabled={beschaeftigt}>
              {abgleich.laeuft ? 'läuft …' : 'Abgleich starten'}
            </button>
            {abgleich.text && <span className="zeile">{abgleich.text}</span>}
          </div>
        </section>
      )}

      {z.klar > 0 && (
        <section className="import-block">
          <h2>Eindeutig und in der Sammlung</h2>
          <p className="zeile">
            {z.klar} Zeilen treffen ein Spiel der Sammlung, ein schon angelegtes Spiel oder genau einen IGDB-Eintrag. Die Plattform ist
            mit der neuesten des Treffers vorbelegt und in der Liste änderbar. Ein Spiel, das du digital gespielt hast, bleibt ein Wunsch –
            „physisch besitzen wollen" ist genau die Lücke.
          </p>
          <div className="knopfzeile">
            <button type="button" onClick={() => void uebernehmen()} disabled={beschaeftigt}>
              {uebernahme.laeuft ? 'läuft …' : `${z.klar} Einträge übernehmen`}
            </button>
            {uebernahme.text && <span className="zeile">{uebernahme.text}</span>}
          </div>
          <details>
            <summary>Liste zeigen – für Zweifelsfälle: überspringen oder anders wählen</summary>
            <Zeilenliste id={id} gruppe="klar" version={version} aktionen={aktionen} />
          </details>
        </section>
      )}

      {(z.mehrdeutig > 0 || z.ohneTreffer > 0) && (
        <section className="import-block">
          <h2>Zur Durchsicht</h2>
          <p className="zeile">
            {z.mehrdeutig} mit mehreren Kandidaten, {z.ohneTreffer} ohne Treffer. Kandidat übernehmen, anders suchen, ohne IGDB-Eintrag
            übernehmen, aufteilen oder überspringen – jede Entscheidung ist sofort gespeichert.
          </p>
          <Zeilenliste id={id} gruppe="unklar" version={version} aktionen={aktionen} />
        </section>
      )}

      {z.uebersprungen > 0 && (
        <details className="import-block">
          <summary>{z.uebersprungen} übersprungene Zeilen</summary>
          <Zeilenliste id={id} gruppe="uebersprungen" version={version} aktionen={aktionen} />
        </details>
      )}

      {z.uebernommen > 0 && (
        <details className="import-block">
          <summary>{z.uebernommen} übernommene Zeilen</summary>
          <Zeilenliste id={id} gruppe="uebernommen" version={version} aktionen={aktionen} />
        </details>
      )}

      {z.ungeprueft === 0 && z.klar === 0 && z.mehrdeutig === 0 && z.ohneTreffer === 0 && (
        <p className="hinweis">
          Nichts mehr offen. <Link to="/wunschliste">Zur Wunschliste</Link>
        </p>
      )}
    </>
  )
}

type ZeilenAktionen = {
  uebernehmenIgdb: (zeile: ImportZeile, k: IgdbKandidat, plattform: string) => Promise<void>
  ueberspringen: (zeile: ImportZeile) => Promise<void>
  zuruecknehmen: (zeile: ImportZeile) => Promise<void>
  freitext: (zeile: ImportZeile, begriff: string) => Promise<void>
  aufteilen: (zeile: ImportZeile, titel: string[]) => Promise<void>
  umbenennen: (zeile: ImportZeile, titel: string) => Promise<void>
  plattformSetzen: (zeile: ImportZeile, plattform: string) => Promise<void>
  beschaeftigt: boolean
}

/** Eine Gruppe seitenweise; `version` stößt das Neuladen nach einer Entscheidung an. */
function Zeilenliste({ id, gruppe, version, aktionen }: { id: number; gruppe: ImportGruppe; version: number; aktionen: ZeilenAktionen }) {
  const [seite, setSeite] = useState<ImportSeite | null>(null)
  const [offset, setOffset] = useState(0)
  const [meldung, setMeldung] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    anfrage<ImportSeite>(`/api/imports/wishlist/${id}?gruppe=${gruppe}&limit=${SEITE}&offset=${offset}`)
      .then((s) => {
        if (!aktiv) return
        // Nach einer Entscheidung kann die Seite leer geworden sein - zurückblättern.
        if (s.zeilen.length === 0 && offset > 0) setOffset(Math.max(0, offset - SEITE))
        else setSeite(s)
      })
      .catch((f) => aktiv && setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.'))
    return () => {
      aktiv = false
    }
  }, [id, gruppe, offset, version])

  if (meldung) return <p role="alert" className="auffaellig">{meldung}</p>
  if (!seite) return <p className="zeile">wird geladen …</p>
  if (seite.gesamt === 0) return <p className="zeile">Nichts in dieser Gruppe.</p>
  const bis = Math.min(seite.gesamt, offset + seite.zeilen.length)

  return (
    <>
      <p className="zeile">{offset + 1}–{bis} von {seite.gesamt}</p>
      <ul className="offene-liste">
        {seite.zeilen.map((zeile) => (
          <ImportZeileKarte key={zeile.id} zeile={zeile} aktionen={aktionen} />
        ))}
      </ul>
      {seite.gesamt > SEITE && (
        <p className="blaettern">
          <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - SEITE))}>← Zurück</button>{' '}
          <button type="button" disabled={bis >= seite.gesamt} onClick={() => setOffset(offset + SEITE)}>Weiter →</button>
        </p>
      )}
    </>
  )
}

const TREFFERTEXT: Record<NonNullable<ImportZeile['treffer']>, string> = {
  sammlung: 'in der Sammlung',
  vorhanden: 'schon angelegt',
  eindeutig: 'eindeutig bei IGDB',
  mehrdeutig: 'mehrere Kandidaten',
  ohne_treffer: 'kein Treffer',
}

function ImportZeileKarte({ zeile, aktionen }: { zeile: ImportZeile; aktionen: ZeilenAktionen }) {
  const offen = zeile.entscheidung === 'offen'
  const unklar = zeile.treffer === 'mehrdeutig' || zeile.treffer === 'ohne_treffer'
  const [zeigeWahl, setZeigeWahl] = useState(false)
  const [suche, setSuche] = useState(offen && zeile.treffer === 'ohne_treffer')
  const [teilen, setTeilen] = useState(false)
  const [teilText, setTeilText] = useState(zeile.titel)
  const [umbenennen, setUmbenennen] = useState(false)
  const [neuerTitel, setNeuerTitel] = useState(zeile.titel)
  // Zur Durchsicht: 'auto' = neueste des gewählten Treffers, solange die Zeile keine Plattform hat; '' = ohne.
  const [plattform, setPlattform] = useState<string>(zeile.plattform ?? 'auto')

  const gewaehlt = zeile.igdbId !== null ? zeile.kandidaten.find((k) => k.igdbId === zeile.igdbId) : undefined
  const beschaeftigt = aktionen.beschaeftigt
  const rohAnders = zeile.originals.filter((o) => o !== zeile.titel)

  function treffer() {
    if (zeile.treffer === 'sammlung' || zeile.treffer === 'vorhanden') {
      return (
        <>
          {TREFFERTEXT[zeile.treffer]}:{' '}
          {zeile.spielId !== null ? <Link to={`/spiel/${zeile.spielId}`}>{zeile.spielTitel}</Link> : zeile.spielTitel}
          {zeile.plattform ? (zeile.releasePlattform === zeile.plattform ? ` (${zeile.plattform})` : ` (${zeile.plattform}, Release entsteht)`) : ' (am Spiel, ohne Plattform)'}
          {zeile.treffer === 'sammlung' && ' – schon gespielt, Wunsch bleibt'}
        </>
      )
    }
    if (zeile.treffer === 'eindeutig') {
      return (
        <>
          {TREFFERTEXT.eindeutig}: <strong>{gewaehlt?.name ?? `IGDB ${zeile.igdbId}`}</strong>
          {gewaehlt?.erscheinungsdatum && ` (${gewaehlt.erscheinungsdatum.slice(0, 4)})`}
          {gewaehlt && gewaehlt.plattformen.length > 0 && ` · ${gewaehlt.plattformen.join(', ')}`}
        </>
      )
    }
    return zeile.treffer ? TREFFERTEXT[zeile.treffer] : 'noch nicht abgeglichen'
  }

  return (
    <li className={offen ? 'offen-block' : 'offen-block erledigt'}>
      <header className="offen-kopf">
        {(gewaehlt?.cover || zeile.spielBild) && <img src={gewaehlt?.cover ?? zeile.spielBild ?? ''} alt="" width={36} height={48} />}
        <div>
          <strong>{zeile.titel}</strong>
          {rohAnders.length > 0 && <span className="zeile"> · in der Liste: {rohAnders.join(' / ')}</span>}
          <div className="zeile">
            {zeile.listenDatum ? `Liste ${zeile.listenDatum}` : 'ohne Datum'} · {zeile.plattform ?? 'ohne Plattform'}
            {zeile.entscheidung === 'schon_vorhanden' && ' · schon auf der Wunschliste'}
            {zeile.entscheidung === 'uebersprungen' && ' · übersprungen'}
            {zeile.entscheidung === 'uebernommen' && ' · übernommen'}
          </div>
          <div className="zeile">{treffer()}</div>
        </div>
      </header>

      {offen && unklar && (
        <label className="zeile">
          Plattform{' '}
          <select value={plattform} onChange={(e) => setPlattform(e.target.value)} disabled={beschaeftigt}>
            <option value="auto">neueste des Treffers</option>
            {PLATTFORMEN.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
            <option value="">ohne Plattform</option>
          </select>
        </label>
      )}
      {offen && !unklar && (
        <label className="zeile">
          Plattform{' '}
          <select value={zeile.plattform ?? ''} onChange={(e) => void aktionen.plattformSetzen(zeile, e.target.value)} disabled={beschaeftigt}>
            {PLATTFORMEN.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
            <option value="">ohne Plattform</option>
          </select>
        </label>
      )}

      {offen && (unklar || zeigeWahl) && zeile.kandidaten.length > 0 && (
        <KandidatenListe kandidaten={zeile.kandidaten} onWahl={(k) => void aktionen.uebernehmenIgdb(zeile, k, plattform)} laeuft={beschaeftigt} />
      )}

      <div className="knopfzeile">
        {offen && !unklar && (
          <button type="button" className="klein" onClick={() => setZeigeWahl(!zeigeWahl)} disabled={beschaeftigt}>
            {zeigeWahl ? 'Kandidaten schließen' : 'Anders wählen'}
          </button>
        )}
        {offen && (
          <>
            <button type="button" className="klein" onClick={() => setSuche(!suche)} disabled={beschaeftigt}>
              {suche ? 'Suche schließen' : 'Anders suchen'}
            </button>
            <button type="button" className="klein" onClick={() => setUmbenennen(!umbenennen)} disabled={beschaeftigt}>Umbenennen</button>
            <button type="button" className="klein" onClick={() => setTeilen(!teilen)} disabled={beschaeftigt}>Aufteilen</button>
            <button type="button" className="klein" onClick={() => void aktionen.ueberspringen(zeile)} disabled={beschaeftigt}>Überspringen</button>
          </>
        )}
        {(zeile.entscheidung === 'uebersprungen' || zeile.entscheidung === 'uebernommen' || zeile.entscheidung === 'schon_vorhanden') && (
          <button type="button" className="klein" onClick={() => void aktionen.zuruecknehmen(zeile)} disabled={beschaeftigt}>
            {zeile.entscheidung === 'uebernommen' ? 'Zurücknehmen (Wunsch löschen)' : 'Doch entscheiden'}
          </button>
        )}
      </div>

      {offen && suche && (
        <IgdbSuche
          vorgabe={zeile.titel}
          plattformen={plattform && plattform !== 'auto' ? [plattform] : []}
          onWahl={(k) => void aktionen.uebernehmenIgdb(zeile, k, plattform)}
          onOhneTreffer={(begriff) => void aktionen.freitext(zeile, begriff)}
          laeuft={beschaeftigt}
        />
      )}

      {offen && umbenennen && (
        <form
          className="notizfeld"
          onSubmit={(e) => {
            e.preventDefault()
            setUmbenennen(false)
            if (neuerTitel.trim() !== '' && neuerTitel.trim() !== zeile.titel) void aktionen.umbenennen(zeile, neuerTitel.trim())
          }}
        >
          <input value={neuerTitel} onChange={(e) => setNeuerTitel(e.target.value)} aria-label="Neuer Titel" autoFocus />
          <button type="submit" className="klein">Umbenennen und neu suchen</button>
        </form>
      )}

      {offen && teilen && (
        <form
          className="aufteilen"
          onSubmit={(e) => {
            e.preventDefault()
            const titel = teilText.split(/\r?\n/).map((t) => t.trim()).filter((t) => t !== '')
            if (titel.length < 2) return
            setTeilen(false)
            void aktionen.aufteilen(zeile, titel)
          }}
        >
          <textarea value={teilText} onChange={(e) => setTeilText(e.target.value)} rows={3} aria-label="Ein Titel je Zeile" />
          <button type="submit" className="klein">In diese Zeilen aufteilen</button>
        </form>
      )}
    </li>
  )
}
