import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiFehler, PLATTFORMEN, anfrage, erledigtText, neuestePlattform, type ErfasstAntwort, type IgdbKandidat, type Plattform } from './api'
import { Kopfzeile } from './Kopfzeile'
import { ScanAuswahl, type Wahl } from './ScanAuswahl'
import { Dubletten, useAnlegen, type Angelegt } from './SpielAnlegen'
import { PlattformChip } from './SpielTeile'
import { Zeichen } from './Symbole'
import { useKamera } from './kamera'
import {
  anderePlattformen,
  hauptRelease,
  kandidatenOrdnen,
  scanZurueck,
  signalFuer,
  type Erfassung,
  type Ergebnis,
  type Schritt,
  type Signal,
} from './scanner'
import {
  ERGEBNIS_TEXT,
  SCHLUESSEL,
  alsText,
  lesen,
  listeOffen,
  neueId,
  stateZurListe,
  vorne,
  zuruecknehmen,
  type ScanEintrag,
} from './scanverlauf'
import { signalGeben, tonBereit } from './ton'

/**
 * Scannen (Abschnitt 9, Stufe 17, überarbeitet in Nachtrag f1g):
 * Serienerfassung des Regals, gebaut für das Handy.
 *
 * Drei feste Zonen übereinander: das Kamerabild mit Zielrahmen und **einer**
 * Statuszeile, darunter **eine Karte je Fall** und darunter „Letzte Scans".
 * Jede Entscheidungskarte hat dieselbe Höhe und **einen** Hauptknopf, immer
 * an derselben Stelle unten; das Kreuz oben rechts bricht ab, ohne etwas zu
 * speichern (Entscheidungen des Nutzers vom 28.11.2026, am Prototyp):
 *
 * 1. **Code bekannt** (Mapping, Stufe 1 der Kette 9.2): „Steht schon im
 *    Regal" – Weiter. Je Release genau eine Disc (Entscheidung vom
 *    27.09.2026); die zweimal gezogene Hülle ist beim Scannen das häufigste
 *    Versehen.
 * 2. **Code unbekannt, Spiel in der Sammlung** (eBay-Vorschlag, 17c):
 *    „Disc erfassen · PS4".
 * 3. **Spiel nicht in der Sammlung**: IGDB-Suche mit dem eBay-Titel und
 *    „Anlegen + Disc erfassen" in einem Zug. Rückgängig nimmt dann auch das
 *    neue Spiel wieder weg (`scanZurueck`).
 * 4. **Erfasst**: ein knapper Block mit Rückgängig; die Kamera läuft sofort
 *    weiter, der Block bleibt bis zum nächsten Code.
 * 5. **Fehler**: Meldung und „Nochmal versuchen".
 *
 * Jeder Fall gibt ein Signal – Rahmenfarbe, Ton und Vibration (`scanner.ts`,
 * `ton.ts`) –, damit man beim Abscannen nicht auf den Bildschirm sehen muss.
 * Das Textfeld für die EAN bleibt als Notnagel hinter „Code eintippen".
 * Ein Code, der nicht zugeordnet wird, hinterlässt in der Datenbank keine
 * Spur (9.3); „Letzte Scans" ist nur ein Gedächtnis des Geräts.
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

/**
 * Antwort der Live-Auflösung bei eBay (Stufe 17c). `null` als Titel heißt:
 * eBay kennt den Code nicht – ein Ergebnis, kein Fehler.
 */
type Kandidat = {
  spielId: number
  titel: string
  bild: string | null
  releases: Array<{ releaseId: number; plattform: Plattform; exemplare: number }>
}
type Online = { titel: string | null; angebote: number; eindeutig: boolean; zielSpielId: number | null; kandidaten: Kandidat[] }

/** Stand der Live-Abfrage, je Code: läuft, Ergebnis, oder nicht verfügbar. */
type OnlineStand = { ean: string } & ({ art: 'laeuft' } | { art: 'da'; o: Online } | { art: 'aus'; grund: string })

/** Was zum Zuordnen gehört, aber nicht in den Körper der Anfrage. */
type Zusammenhang = {
  spielNeu: boolean
  releaseNeu: boolean
  bild: string | null
  vorherMapping: Erfassung['vorherMapping']
}

/** Was „Nochmal versuchen" wiederholt. */
type Wiederholung =
  | { art: 'aufloesen'; roh: string; zaehlen: boolean }
  | { art: 'zuordnen'; ean: string; koerper: Wahl; z: Zusammenhang }
  | { art: 'zurueck'; rest: Schritt[]; erfasst: ErfasstKarte }

type Modus = 'vorschlag' | 'suche' | 'anlegen'

type ErfasstKarte = {
  art: 'erfasst'
  e: Erfassung
  z: Zuordnung
  bild: string | null
  eintragId: string
}

type Karte =
  | { art: 'leer'; hinweis: string | null }
  | { art: 'code'; t: Treffer; modus: Modus }
  | ErfasstKarte
  | { art: 'fehler'; ean: string | null; meldung: string; nochmal: Wiederholung | null }

/**
 * Ein Netzausfall kommt als `TypeError` mit englischem Text des Browsers
 * („Failed to fetch") – auf der Karte steht stattdessen, was er bedeutet.
 */
const meldungAus = (f: unknown, ersatz: string) =>
  f instanceof TypeError ? 'Keine Verbindung zum Server.' : f instanceof Error ? f.message : ersatz

/** Ein Fehler mit 4xx ist eine Antwort, kein Ausfall – nochmal versuchen ändert nichts. */
const wiederholbar = (f: unknown) => !(f instanceof ApiFehler && f.status >= 400 && f.status < 500)

/** Das Gedächtnis „Letzte Scans" im `localStorage` – jeder Zugriff in `try` (Ansicht.ts). */
function useScanVerlauf() {
  const [liste, setListe] = useState<ScanEintrag[]>(() => {
    try {
      return lesen(localStorage.getItem(SCHLUESSEL))
    } catch {
      return []
    }
  })
  const aendern = useCallback((f: (l: ScanEintrag[]) => ScanEintrag[]) => {
    setListe((alt) => {
      const neu = f(alt)
      try {
        localStorage.setItem(SCHLUESSEL, alsText(neu))
      } catch {
        // Nicht gemerkt – angezeigt wird es trotzdem.
      }
      return neu
    })
  }, [])
  return { liste, aendern }
}

export function Scannen() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [karte, setKarte] = useState<Karte>({ art: 'leer', hinweis: null })
  const [eingabe, setEingabe] = useState('')
  const [eintippen, setEintippen] = useState(false)
  const [online, setOnline] = useState<OnlineStand | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  /** Discs dieser Sitzung – der Zähler in der Kopfzeile. */
  const [sitzung, setSitzung] = useState(0)
  const verlauf = useScanVerlauf()
  const listeAuf = listeOffen(location.state)

  // --- Signal: Rahmen, Zeichen, Ton, Vibration ---------------------------------------
  const [blitz, setBlitz] = useState<Signal | null>(null)
  const blitzZeit = useRef<ReturnType<typeof setTimeout> | null>(null)
  const signal = useCallback((e: Ergebnis) => {
    const s = signalFuer(e)
    signalGeben(s)
    setBlitz(s)
    if (blitzZeit.current) clearTimeout(blitzZeit.current)
    blitzZeit.current = setTimeout(() => setBlitz(null), 900)
  }, [])
  useEffect(() => () => { if (blitzZeit.current) clearTimeout(blitzZeit.current) }, [])

  // Android lässt Ton erst nach einer Berührung zu; die Kamera startet ohne.
  useEffect(() => {
    const wecken = () => tonBereit()
    document.addEventListener('pointerdown', wecken, { once: true })
    return () => document.removeEventListener('pointerdown', wecken)
  }, [])

  // --- Letzte Scans: der offene Code -----------------------------------------------------
  /**
   * Der Code, dessen Karte noch auf eine Entscheidung wartet. Kommt ein neuer
   * Code, schließt das Kreuz die Karte oder verlässt man die Ansicht, wird
   * er als „abgebrochen" notiert – nur auf dem Gerät.
   */
  const offen = useRef<{ id: string; ean: string } | null>(null)
  const abbrechenNotieren = useCallback(() => {
    const o = offen.current
    if (!o) return
    offen.current = null
    verlauf.aendern((l) =>
      vorne(l, { id: o.id, ean: o.ean, zeit: new Date().toISOString(), ergebnis: 'abgebrochen', spielId: null, titel: null, plattform: null, bild: null }),
    )
  }, [verlauf])
  const abbrechenRef = useRef(abbrechenNotieren)
  abbrechenRef.current = abbrechenNotieren
  useEffect(() => () => abbrechenRef.current(), [])

  const [letzterCode, setLetzterCode] = useState<string | null>(null)
  const aktuellerCode = useRef<string | null>(null)
  /**
   * Die Erkennung pausiert, solange eine Karte auf eine Entscheidung wartet –
   * auch bei einem eingetippten Code. `useKamera` kommt erst nach `aufloesen`,
   * deshalb über einen Ref.
   */
  const pausieren = useRef<(wert: boolean) => void>(() => {})

  /** Titelvorschlag von eBay nachladen – nur für den Code, der gerade auf der Karte steht. */
  const onlineHolen = useCallback(async (ean: string) => {
    setOnline({ ean, art: 'laeuft' })
    try {
      const o = await anfrage<Online>(`/api/scan/${ean}/online`)
      if (aktuellerCode.current === ean) setOnline({ ean, art: 'da', o })
    } catch (f) {
      if (aktuellerCode.current === ean) setOnline({ ean, art: 'aus', grund: meldungAus(f, 'Die Abfrage ist fehlgeschlagen.') })
    }
  }, [])

  /** `zaehlen: false` beim Öffnen über `?ean=` – kein neuer Scan. */
  const aufloesen = useCallback(
    async (roh: string, zaehlen = true) => {
      setLaeuft(true)
      try {
        const t = await anfrage<Treffer>('/api/scan', { methode: 'POST', koerper: { ean: roh, zaehlen } })
        abbrechenNotieren()
        aktuellerCode.current = t.ean
        setLetzterCode(t.ean)
        setEingabe('')
        const exemplare = t.release?.exemplare ?? null
        signal({ art: 'aufgeloest', treffer: t.treffer, exemplare })
        const id = neueId(t.ean, Date.now(), Math.random())
        if (t.treffer === 'mapping' && t.release && t.release.exemplare > 0) {
          // Fall 1 ist schon das Ergebnis: Die Disc steht im Regal.
          const r = t.release
          verlauf.aendern((l) =>
            vorne(l, { id, ean: t.ean, zeit: new Date().toISOString(), ergebnis: 'regal', spielId: r.spielId, titel: r.titel, plattform: r.plattform, bild: r.bild }),
          )
          offen.current = null
        } else {
          offen.current = { id, ean: t.ean }
        }
        setKarte({ art: 'code', t, modus: t.treffer === 'angebot' ? 'suche' : 'vorschlag' })
        pausieren.current(true)
        // Lokal nichts gefunden: jetzt erst eBay fragen (Kette 9.2). Bewusst
        // nach dem Anzeigen der Karte – ein langsames eBay darf das Scannen
        // nicht aufhalten, und ohne Zugangsdaten läuft alles wie bisher weiter.
        setOnline(null)
        if (t.treffer === 'keiner') void onlineHolen(t.ean)
        return true
      } catch (f) {
        signal({ art: 'fehler' })
        setKarte({ art: 'fehler', ean: null, meldung: meldungAus(f, 'Auflösen fehlgeschlagen.'), nochmal: wiederholbar(f) ? { art: 'aufloesen', roh, zaehlen } : null })
        return false
      } finally {
        setLaeuft(false)
      }
    },
    [abbrechenNotieren, onlineHolen, signal, verlauf],
  )

  // Der zuletzt behandelte Code löst nicht erneut aus, bis ein anderer kam
  // (siehe useKamera); dieselbe Disc noch einmal geht über das Textfeld.
  const { videoRef, status: kameraStatus, fehler: kameraFehler, nativ, geraete, starten, stoppen, wechseln, pausiert, setPausiert, kandidat, gespiegelt } =
    useKamera(aufloesen, letzterCode)
  pausieren.current = setPausiert

  // ?ean= (alte Links aus den Einstellungen): sofort auflösen, Kamera bleibt aus, bis sie gestartet wird.
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

  // Die volle Liste steht über dem Scanner: solange sie offen ist, ruht die Erkennung.
  const pausiertVorListe = useRef(false)
  const listeGesehen = useRef(false)
  useEffect(() => {
    if (!listeGesehen.current) {
      listeGesehen.current = true
      if (!listeAuf) return
    }
    if (listeAuf) {
      pausiertVorListe.current = pausiert
      setPausiert(true)
    } else {
      setPausiert(pausiertVorListe.current)
    }
    // Nur beim Öffnen und Schließen der Liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listeAuf])

  /** Karte schließen und weiterscannen. */
  function weiter(neu: Karte = { art: 'leer', hinweis: null }) {
    setKarte(neu)
    setPausiert(false)
  }

  /** Das Kreuz: nichts speichern, als „abgebrochen" notieren, weiter. */
  function abbrechen() {
    abbrechenNotieren()
    weiter()
  }

  async function zuordnen(ean: string, koerper: Wahl, z: Zusammenhang) {
    setLaeuft(true)
    const eintragId = offen.current?.ean === ean ? offen.current.id : neueId(ean, Date.now(), Math.random())
    try {
      const antwort = await anfrage<Zuordnung>(`/api/scan/${ean}/assign`, { methode: 'POST', koerper })
      const e: Erfassung = {
        exemplarId: antwort.id,
        ean,
        releaseId: antwort.releaseId,
        spielId: antwort.spiel?.spielId ?? null,
        absichtenErledigt: antwort.absichtenErledigt,
        physischStatusGesetzt: antwort.physischStatusGesetzt,
        spielNeu: z.spielNeu,
        releaseNeu: z.releaseNeu,
        vorherMapping: z.vorherMapping,
      }
      offen.current = null
      verlauf.aendern((l) =>
        vorne(l, {
          id: eintragId,
          ean,
          zeit: new Date().toISOString(),
          ergebnis: 'erfasst',
          spielId: antwort.spiel?.spielId ?? null,
          titel: antwort.spiel?.titel ?? null,
          plattform: antwort.spiel?.plattform ?? null,
          bild: z.bild,
        }),
      )
      setSitzung((n) => n + 1)
      signal({ art: 'erfasst' })
      weiter({ art: 'erfasst', e, z: { ...antwort, ean }, bild: z.bild, eintragId })
    } catch (f) {
      if (f instanceof ApiFehler && f.status === 409 && typeof f.antwort.releaseId === 'number') {
        // Je Release genau eine Disc: Das Mapping hat der Worker trotzdem
        // gesetzt (9.2) – die Karte sagt jetzt, was beim nächsten Scan kommt.
        const a = f.antwort as { releaseId: number; game_id?: number; title?: string; platform?: Plattform }
        const t: Treffer = {
          ean,
          treffer: 'mapping',
          scans: 0,
          release: { releaseId: a.releaseId, spielId: a.game_id ?? 0, titel: a.title ?? '', plattform: a.platform ?? 'PS4', bild: z.bild, exemplare: 1 },
        }
        offen.current = null
        verlauf.aendern((l) =>
          vorne(l, { id: eintragId, ean, zeit: new Date().toISOString(), ergebnis: 'regal', spielId: a.game_id ?? null, titel: a.title ?? null, plattform: a.platform ?? null, bild: z.bild }),
        )
        signal({ art: 'schon_da' })
        setKarte({ art: 'code', t, modus: 'vorschlag' })
      } else {
        signal({ art: 'fehler' })
        setKarte({ art: 'fehler', ean, meldung: meldungAus(f, 'Zuordnen fehlgeschlagen.'), nochmal: wiederholbar(f) ? { art: 'zuordnen', ean, koerper, z } : null })
      }
    } finally {
      setLaeuft(false)
    }
  }

  /**
   * Rückgängig: Schritt für Schritt aus `scanZurueck`. Scheitert einer, steht
   * die Fehlerkarte da, und „Nochmal versuchen" setzt beim gescheiterten an –
   * die erledigten Schritte noch einmal zu schicken, liefe auf 404.
   */
  async function zurueck(erfasst: ErfasstKarte, schritte: Schritt[] = scanZurueck(erfasst.e)) {
    setLaeuft(true)
    let i = 0
    try {
      for (; i < schritte.length; i++) {
        const s = schritte[i]
        try {
          await anfrage(s.pfad, { methode: s.methode, koerper: s.koerper })
        } catch (f) {
          if (!(s.erwartet !== undefined && f instanceof ApiFehler && f.status === s.erwartet)) throw f
        }
      }
      verlauf.aendern((l) => zuruecknehmen(l, erfasst.eintragId, erfasst.e.spielNeu))
      setSitzung((n) => Math.max(0, n - 1))
      setKarte({ art: 'leer', hinweis: 'Zurückgenommen.' })
    } catch (f) {
      signal({ art: 'fehler' })
      setKarte({ art: 'fehler', ean: erfasst.e.ean, meldung: meldungAus(f, 'Rückgängig fehlgeschlagen.'), nochmal: { art: 'zurueck', rest: schritte.slice(i), erfasst } })
    } finally {
      setLaeuft(false)
    }
  }

  async function insBacklog(k: ErfasstKarte) {
    setLaeuft(true)
    try {
      await anfrage('/api/plans', { methode: 'POST', koerper: { art: 'backlog', releaseId: k.z.releaseId } })
      setKarte({ ...k, z: { ...k.z, aufListe: true } })
    } catch (f) {
      setKarte({ art: 'fehler', ean: k.e.ean, meldung: meldungAus(f, 'Anlegen fehlgeschlagen.'), nochmal: null })
    } finally {
      setLaeuft(false)
    }
  }

  function nochmal(w: Wiederholung) {
    if (w.art === 'aufloesen') void aufloesen(w.roh, w.zaehlen)
    else if (w.art === 'zuordnen') void zuordnen(w.ean, w.koerper, w.z)
    else void zurueck(w.erfasst, w.rest)
  }

  function listeOeffnen() {
    navigate({ pathname: location.pathname, search: location.search }, { state: stateZurListe(location.state) })
  }

  function listeSchliessen() {
    if (listeOffen(location.state)) navigate(-1)
  }

  /**
   * Braucht die Karte Platz für eine Liste (Suche, Anlegen), wird die Kamera
   * flacher und die Karte um genau so viel höher – sie ist dann ohnehin
   * pausiert, und der Hauptknopf bleibt, wo er ist.
   */
  const eng =
    karte.art === 'code' &&
    (karte.modus !== 'vorschlag' ||
      (karte.t.treffer !== 'mapping' &&
        online?.ean === karte.t.ean &&
        online.art !== 'laeuft' &&
        !(online.art === 'da' && online.o.kandidaten.length > 0)) ||
      (karte.t.treffer === 'angebot'))

  const zustandText =
    kameraStatus === 'startet'
      ? 'Kamera startet …'
      : pausiert
        ? 'pausiert'
        : kandidat
          ? `liest ${kandidat} …`
          : 'Barcode in den Rahmen halten'

  return (
    <>
      <Kopfzeile
        titel={listeAuf ? 'Letzte Scans' : 'Scannen'}
        zurueck
        zusatz={
          !listeAuf && (
            <span className="scan-zaehler" aria-label={`${sitzung} Discs in dieser Sitzung erfasst`}>
              <b>{sitzung}</b> erfasst
            </span>
          )
        }
      />

      {listeAuf && <ScanListe liste={verlauf.liste} onSchliessen={listeSchliessen} />}

      <div className={eng ? 'scanner eng' : 'scanner'} hidden={listeAuf}>
        <div className={`scan-kamera${blitz ? ` signal-${blitz}` : ''}`}>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            aria-label="Kamerabild"
            className={gespiegelt ? 'gespiegelt' : undefined}
            hidden={kameraStatus !== 'laeuft' && kameraStatus !== 'startet'}
          />
          {kameraStatus === 'laeuft' && (
            <div className="scan-ziel" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
          )}
          {(kameraStatus === 'aus' || kameraStatus === 'fehler') && (
            <div className="scan-kamera-mitte">
              {kameraFehler && <p role="alert">{kameraFehler}</p>}
              <button type="button" className="knopf" onClick={() => { tonBereit(); void starten() }}>
                Kamera starten
              </button>
            </div>
          )}
          {(blitz === 'erfasst' || blitz === 'fehler') && (
            <span className="scan-gross" aria-hidden="true">{blitz === 'erfasst' ? '✓' : '!'}</span>
          )}
          {nativ === false && (
            <span className="pille scan-fallback" title="Kein nativer BarcodeDetector – ZXing im Browser">Fallback</span>
          )}
          {(kameraStatus === 'laeuft' || kameraStatus === 'startet') && (
            <span className="scan-zustand" role="status">{zustandText}</span>
          )}
          <button
            type="button"
            className="scan-eintippen"
            aria-expanded={eintippen}
            onClick={() => setEintippen((x) => !x)}
          >
            Code eintippen
          </button>
        </div>

        {eintippen && (
          <form
            className="scan-eintipp"
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
              placeholder="EAN"
              aria-label="EAN eintippen"
              autoFocus
            />
            <button type="submit" className="knopf" disabled={laeuft || eingabe.trim() === ''}>Auflösen</button>
            {kameraStatus === 'laeuft' && geraete.length > 1 && (
              <button type="button" className="knopf leiser" onClick={wechseln}>Kamera wechseln</button>
            )}
            {kameraStatus === 'laeuft' && (
              <button type="button" className="knopf leiser" onClick={stoppen}>Kamera aus</button>
            )}
          </form>
        )}

        <div aria-live="polite">
          {karte.art === 'leer' && karte.hinweis && <p className="scan-hinweis" role="status">{karte.hinweis}</p>}

          {karte.art === 'code' && (
            <CodeKarte
              key={`${karte.t.ean}-${karte.modus}`}
              t={karte.t}
              modus={karte.modus}
              online={online?.ean === karte.t.ean ? online : null}
              laeuft={laeuft}
              onModus={(modus) => setKarte({ ...karte, modus })}
              onAbbrechen={abbrechen}
              onWeiter={() => weiter()}
              onZuordnen={(koerper, z) => zuordnen(karte.t.ean, koerper, z)}
            />
          )}

          {karte.art === 'erfasst' && (
            <ErfasstBlock k={karte} laeuft={laeuft} onZurueck={() => zurueck(karte)} onBacklog={() => insBacklog(karte)} />
          )}

          {karte.art === 'fehler' && (
            <KartenRahmen
              kennung="Fehler"
              ean={karte.ean}
              onAbbrechen={abbrechen}
              haupt={
                karte.nochmal ? (
                  <button type="button" className="scan-haupt" disabled={laeuft} onClick={() => nochmal(karte.nochmal!)}>
                    Nochmal versuchen
                  </button>
                ) : (
                  <button type="button" className="scan-haupt" onClick={abbrechen}>Weiter</button>
                )
              }
            >
              <p className="scan-aussage fehler" role="alert">{karte.meldung}</p>
            </KartenRahmen>
          )}
        </div>

        <LetzteScans liste={verlauf.liste} zeilen={karte.art === 'code' || karte.art === 'fehler' ? 2 : 3} onAlle={listeOeffnen} />
      </div>
    </>
  )
}

// --- Bausteine der Karte -----------------------------------------------------------------

/** Das Gerüst jeder Entscheidungskarte: Kennung, Kreuz, Inhalt, unten der Hauptknopf. */
function KartenRahmen({
  kennung,
  ean,
  onAbbrechen,
  haupt,
  leise,
  children,
}: {
  kennung: string
  ean: string | null
  onAbbrechen?: () => void
  haupt?: ReactNode
  leise?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="scan-karte" aria-label={kennung}>
      <div className="scan-kennung">
        <span>{kennung}</span>
        {ean && <span className="scan-ean">{ean}</span>}
        {onAbbrechen && (
          <button type="button" className="scan-x" aria-label="Abbrechen, nichts speichern" title="Abbrechen" onClick={onAbbrechen}>
            <Zeichen name="kreuz" groesse={16} />
          </button>
        )}
      </div>
      <div className="scan-inhalt">{children}</div>
      {/* Die leise Zeile steht immer da, auch leer – sonst rückte der Hauptknopf nach unten. */}
      <div className="scan-unten">
        {haupt}
        <div className="scan-leise">{leise}</div>
      </div>
    </section>
  )
}

/** Das Kennzeichen im hellen Hauptknopf – ohne Plattformfarbe, die verschwände dort. */
function HauptPlattform({ p }: { p: Plattform }) {
  return <span className="plattform">{p === 'PSVITA' ? 'VITA' : p}</span>
}

function Cover({ bild, klein }: { bild: string | null; klein?: boolean }) {
  return <span className={klein ? 'scan-mini' : 'scan-cover'}>{bild ? <img src={bild} alt="" /> : null}</span>
}

/** Ein leiser Knopf unten auf der Karte – sieht aus wie ein Link, ist eine Aktion. */
function Leise({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="scan-link" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

/** „Andere Plattform": ein Auswahlfeld, das wie ein leiser Link aussieht – Wahl ist Aktion. */
function PlattformAuswahl({
  text,
  optionen,
  disabled,
  onWahl,
}: {
  text: string
  optionen: Array<{ wert: string; text: string }>
  disabled?: boolean
  onWahl: (wert: string) => void
}) {
  if (optionen.length === 0) return null
  return (
    <select
      className="scan-link"
      value=""
      disabled={disabled}
      aria-label={text}
      onChange={(e) => e.target.value && onWahl(e.target.value)}
    >
      <option value="">{text} …</option>
      {optionen.map((o) => (
        <option key={o.wert} value={o.wert}>{o.text}</option>
      ))}
    </select>
  )
}

const KEIN_ZUSAMMENHANG: Zusammenhang = { spielNeu: false, releaseNeu: false, bild: null, vorherMapping: null }

/** Fall 1–3 für einen Code: Vorschlag, Suche in der Sammlung oder Anlegen. */
function CodeKarte({
  t,
  modus,
  online,
  laeuft,
  onModus,
  onAbbrechen,
  onWeiter,
  onZuordnen,
}: {
  t: Treffer
  modus: Modus
  online: OnlineStand | null
  laeuft: boolean
  onModus: (m: Modus) => void
  onAbbrechen: () => void
  onWeiter: () => void
  onZuordnen: (koerper: Wahl, z: Zusammenhang) => void
}) {
  const r = t.release
  /** Worauf der Code vorher zeigte – Rückgängig bringt es zurück. */
  const vorherMapping: Erfassung['vorherMapping'] = r ? { releaseId: r.releaseId, mitDisc: r.exemplare > 0 } : null

  if (modus === 'suche') {
    return (
      <KartenRahmen
        kennung={t.treffer === 'mapping' ? 'Anderes Spiel' : 'In der Sammlung suchen'}
        ean={t.ean}
        onAbbrechen={onAbbrechen}
        leise={
          <>
            <Leise onClick={() => onModus('vorschlag')}>Zurück</Leise>
            <Leise onClick={() => onModus('anlegen')}>Spiel anlegen</Leise>
          </>
        }
      >
        {t.angebot && (
          <p className="scan-zeile">
            Händler: „{t.angebot.titel}"{t.angebot.plattform ? ` (${t.angebot.plattform})` : ''}
          </p>
        )}
        <ScanAuswahl
          ean={t.ean}
          vorgabe={t.angebot?.titel ?? (online?.art === 'da' ? (online.o.titel ?? '') : '')}
          laeuft={laeuft}
          onWahl={(w, releaseNeu) => onZuordnen(w, { ...KEIN_ZUSAMMENHANG, releaseNeu, vorherMapping })}
        />
      </KartenRahmen>
    )
  }

  // Fall 1: Der Code ist zugeordnet.
  if (t.treffer === 'mapping' && r && modus === 'vorschlag') {
    const imRegal = r.exemplare > 0
    return (
      <KartenRahmen
        kennung={imRegal ? 'Schon erfasst' : 'Code bekannt'}
        ean={t.ean}
        onAbbrechen={imRegal ? undefined : onAbbrechen}
        haupt={
          imRegal ? (
            <button type="button" className="scan-haupt" onClick={onWeiter} autoFocus>Weiter</button>
          ) : (
            <button
              type="button"
              className="scan-haupt"
              disabled={laeuft}
              onClick={() => onZuordnen({ releaseId: r.releaseId }, { ...KEIN_ZUSAMMENHANG, bild: r.bild, vorherMapping })}
            >
              Disc erfassen · <HauptPlattform p={r.plattform} />
            </button>
          )
        }
        leise={
          <>
            <Leise onClick={() => onModus('suche')}>Ist ein anderes Spiel</Leise>
            <Link className="scan-link" to={`/spiel/${r.spielId}`}>Zum Spiel</Link>
          </>
        }
      >
        <div className="scan-spiel">
          <Cover bild={r.bild} />
          <div>
            <p className="scan-titel">{r.titel}</p>
            <p className="scan-meta">
              <PlattformChip plattform={r.plattform} />
              <span>{imRegal ? `Disc ×${r.exemplare}` : 'noch keine Disc'}</span>
            </p>
            <p className={imRegal ? 'scan-aussage regal' : 'scan-aussage'}>{imRegal ? 'Steht schon im Regal.' : 'Disc ins Regal aufnehmen?'}</p>
          </div>
        </div>
      </KartenRahmen>
    )
  }

  // Fall 2: eBay nennt ein Spiel der Sammlung.
  if (modus === 'vorschlag' && online?.art === 'da' && online.o.kandidaten.length > 0) {
    return <SammlungsKarte t={t} o={online.o} laeuft={laeuft} onModus={onModus} onAbbrechen={onAbbrechen} onWeiter={onWeiter} onZuordnen={onZuordnen} vorherMapping={vorherMapping} />
  }

  // Fall 3: nicht in der Sammlung (oder eBay weiß nichts) – anlegen.
  return (
    <NeuKarte
      key={online?.art ?? 'ohne'}
      t={t}
      online={online}
      laeuft={laeuft}
      onModus={onModus}
      onAbbrechen={onAbbrechen}
      onAngelegt={(a, bild) =>
        onZuordnen({ releaseId: a.releaseId }, { spielNeu: a.spielNeu, releaseNeu: a.releaseNeu, bild, vorherMapping })
      }
    />
  )
}

/** Fall 2: Der Code ist unbekannt, eBay nennt ein Spiel (oder mehrere) aus der Sammlung. */
function SammlungsKarte({
  t,
  o,
  laeuft,
  onModus,
  onAbbrechen,
  onWeiter,
  onZuordnen,
  vorherMapping,
}: {
  t: Treffer
  o: Online
  laeuft: boolean
  onModus: (m: Modus) => void
  onAbbrechen: () => void
  onWeiter: () => void
  onZuordnen: (koerper: Wahl, z: Zusammenhang) => void
  vorherMapping: Erfassung['vorherMapping']
}) {
  const kandidaten = kandidatenOrdnen(o.kandidaten, o.zielSpielId)
  const [gewaehlt, setGewaehlt] = useState(kandidaten[0].spielId)
  const k = kandidaten.find((x) => x.spielId === gewaehlt) ?? kandidaten[0]
  const haupt = hauptRelease(k.releases)
  const andere = anderePlattformen(k.releases, haupt)
  const z: Zusammenhang = { ...KEIN_ZUSAMMENHANG, bild: k.bild, vorherMapping }

  return (
    <KartenRahmen
      kennung="Neuer Code"
      ean={t.ean}
      onAbbrechen={onAbbrechen}
      haupt={
        haupt ? (
          <button type="button" className="scan-haupt" disabled={laeuft} onClick={() => onZuordnen({ releaseId: haupt.releaseId }, z)}>
            Disc erfassen · <HauptPlattform p={haupt.plattform} />
          </button>
        ) : (
          <button type="button" className="scan-haupt" onClick={onWeiter}>Weiter</button>
        )
      }
      leise={
        <>
          <PlattformAuswahl
            text="Andere Plattform"
            disabled={laeuft}
            optionen={andere.map((a) => ({
              wert: a.art === 'release' ? `r${a.releaseId}` : `p${a.plattform}`,
              text: a.art === 'release' ? a.plattform : `${a.plattform} anlegen`,
            }))}
            onWahl={(w) => {
              const a = andere.find((x) => (x.art === 'release' ? `r${x.releaseId}` : `p${x.plattform}`) === w)
              if (!a) return
              if (a.art === 'release') onZuordnen({ releaseId: a.releaseId }, z)
              else onZuordnen({ spielId: k.spielId, plattform: a.plattform }, { ...z, releaseNeu: true })
            }}
          />
          <Leise onClick={() => onModus('suche')}>Anderes Spiel suchen</Leise>
        </>
      }
    >
      {kandidaten.length === 1 ? (
        <div className="scan-spiel">
          <Cover bild={k.bild} />
          <div>
            <p className="scan-titel">{k.titel}</p>
            <p className="scan-meta">
              <span>in deiner Sammlung</span>
              {k.releases.map((r) => (
                <span key={r.releaseId} className="scan-release">
                  <PlattformChip plattform={r.plattform} />
                  {r.exemplare > 0 ? ' im Regal' : ''}
                </span>
              ))}
            </p>
            {!haupt && <p className="scan-aussage regal">Steht schon im Regal.</p>}
            {o.titel && <p className="scan-zeile">eBay: {o.titel}</p>}
          </div>
        </div>
      ) : (
        <>
          {o.titel && <p className="scan-zeile">eBay: {o.titel}</p>}
          <ul className="scan-wahlliste">
            {kandidaten.map((x) => {
              const h = hauptRelease(x.releases)
              return (
                <li key={x.spielId}>
                  <button
                    type="button"
                    className={x.spielId === k.spielId ? 'scan-wahl gewaehlt' : 'scan-wahl'}
                    aria-pressed={x.spielId === k.spielId}
                    onClick={() => setGewaehlt(x.spielId)}
                  >
                    <Cover bild={x.bild} klein />
                    <span className="scan-wahl-titel">{x.titel}</span>
                    {h ? <PlattformChip plattform={h.plattform} /> : <span className="scan-still">im Regal</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </KartenRahmen>
  )
}

/** Fall 3: Spiel nicht in der Sammlung – IGDB-Treffer wählen, anlegen und die Disc erfassen in einem Zug. */
function NeuKarte({
  t,
  online,
  laeuft,
  onModus,
  onAbbrechen,
  onAngelegt,
}: {
  t: Treffer
  online: OnlineStand | null
  laeuft: boolean
  onModus: (m: Modus) => void
  onAbbrechen: () => void
  /** `bild`: das Cover des gewählten Treffers – für den Erfasst-Block und „Letzte Scans". */
  onAngelegt: (a: Angelegt, bild: string | null) => void
}) {
  const titel = online?.art === 'da' ? online.o.titel : (t.angebot?.titel ?? null)
  const [begriff, setBegriff] = useState(titel ?? '')
  const [treffer, setTreffer] = useState<IgdbKandidat[] | null>(null)
  const [sucht, setSucht] = useState(false)
  const [suchfehler, setSuchfehler] = useState<string | null>(null)
  const [gewaehlt, setGewaehlt] = useState<number | null>(null)
  const [plattformWahl, setPlattformWahl] = useState<Record<number, Plattform>>({})

  const plattformVon = (k: IgdbKandidat): Plattform => plattformWahl[k.igdbId] ?? (neuestePlattform(k.plattformen) || 'PS4')
  const wahl = treffer?.find((k) => k.igdbId === gewaehlt) ?? null
  const a = useAnlegen((x) => onAngelegt(x, x.spielNeu && wahl ? wahl.cover : null), wahl ? plattformVon(wahl) : 'PS4')

  async function suchen(text: string) {
    if (text.trim() === '') return
    setSucht(true)
    setSuchfehler(null)
    try {
      const antwort = await anfrage<{ treffer: IgdbKandidat[] }>(`/api/igdb/search?q=${encodeURIComponent(text.trim())}&plattformen=`)
      setTreffer(antwort.treffer)
      setGewaehlt(antwort.treffer[0]?.igdbId ?? null)
    } catch (f) {
      setSuchfehler(meldungAus(f, 'Suche fehlgeschlagen.'))
      setTreffer([])
    } finally {
      setSucht(false)
    }
  }

  // Mit einem Titel von eBay sucht die Karte sofort – das ist der Sinn der Live-Auflösung.
  const erstesMal = useRef(false)
  useEffect(() => {
    if (erstesMal.current) return
    erstesMal.current = true
    if (titel) void suchen(titel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const beschaeftigt = laeuft || a.laeuft || sucht

  return (
    <KartenRahmen
      kennung="Neuer Code"
      ean={t.ean}
      onAbbrechen={onAbbrechen}
      haupt={
        <button
          type="button"
          className="scan-haupt"
          disabled={beschaeftigt || !wahl}
          onClick={() => wahl && a.anlegen({ igdbId: wahl.igdbId }, false, plattformVon(wahl))}
        >
          Anlegen + Disc erfassen
        </button>
      }
      leise={
        <>
          <PlattformAuswahl
            text="Ohne IGDB anlegen"
            disabled={beschaeftigt || treffer === null || begriff.trim() === ''}
            optionen={PLATTFORMEN.map((p) => ({ wert: p, text: `„${begriff.trim()}" als ${p}` }))}
            onWahl={(p) => a.anlegen({ titel: begriff.trim() }, false, p)}
          />
          <Leise onClick={() => onModus('suche')}>In der Sammlung suchen</Leise>
        </>
      }
    >
      <p className="scan-zeile einzeilig">
        {online?.art === 'laeuft'
          ? 'Frage eBay nach dem Titel …'
          : online?.art === 'aus'
            ? `Kein Titel von eBay: ${online.grund}`
            : online?.art === 'da' && online.o.titel === null
              ? 'eBay kennt diesen Code nicht.'
              : titel
                ? <>{t.angebot && online === null ? 'Händler' : 'eBay'}: <b>„{titel}"</b> – nicht in deiner Sammlung.</>
                : 'Titel bei IGDB suchen.'}
      </p>
      <form
        className="scan-suchzeile"
        onSubmit={(e) => {
          e.preventDefault()
          void suchen(begriff)
        }}
      >
        <input type="search" value={begriff} onChange={(e) => setBegriff(e.target.value)} placeholder="Titel bei IGDB suchen" aria-label="Suchbegriff für IGDB" />
        <button type="submit" className="knopf" disabled={sucht || begriff.trim() === ''}>{sucht ? 'sucht …' : 'Suchen'}</button>
      </form>
      {suchfehler && <p className="scan-aussage fehler" role="alert">{suchfehler}</p>}
      {treffer && treffer.length === 0 && !suchfehler && <p className="scan-still">Nichts gefunden – anderen Begriff versuchen.</p>}
      {treffer && treffer.length > 0 && (
        <ul className="scan-wahlliste">
          {treffer.map((k) => {
            const an = k.igdbId === gewaehlt
            return (
              <li key={k.igdbId} className={an ? 'scan-wahlzeile gewaehlt' : 'scan-wahlzeile'}>
                <button type="button" className="scan-wahl" aria-pressed={an} onClick={() => setGewaehlt(k.igdbId)}>
                  <Cover bild={k.cover} klein />
                  <span className="scan-wahl-titel">
                    {k.name}
                    <span className="scan-still">
                      {' '}
                      {k.erscheinungsdatum ? k.erscheinungsdatum.slice(0, 4) : 'Datum unbekannt'}
                      {k.typ && ` · ${k.typ}`}
                    </span>
                  </span>
                  {!an && <PlattformChip plattform={plattformVon(k)} />}
                </button>
                {an && (
                  <select
                    value={plattformVon(k)}
                    disabled={beschaeftigt}
                    aria-label={`Plattform für ${k.name}`}
                    onChange={(e) => setPlattformWahl({ ...plattformWahl, [k.igdbId]: e.target.value as Plattform })}
                  >
                    {PLATTFORMEN.map((p) => (
                      <option key={p} value={p}>
                        {p}
                        {k.plattformen.includes(p) ? '' : ' (nicht bei IGDB)'}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <Dubletten a={a} vorhandenesVerwenden plattform={wahl ? plattformVon(wahl) : 'PS4'} />
      {a.meldung && <p className="scan-zeile" role="status">{a.meldung}</p>}
    </KartenRahmen>
  )
}

/** Fall 4: knapp – die Kamera läuft schon weiter, der Block bleibt bis zum nächsten Code. */
function ErfasstBlock({ k, laeuft, onZurueck, onBacklog }: { k: ErfasstKarte; laeuft: boolean; onZurueck: () => void; onBacklog: () => void }) {
  const s = k.z.spiel
  return (
    <section className="scan-erfasst" aria-label="Erfasst">
      <Cover bild={k.bild} klein />
      <div className="scan-erfasst-text">
        <p className="scan-erfasst-titel">
          {s ? <Link to={`/spiel/${s.spielId}`}>{s.titel}</Link> : `Release ${k.z.releaseId}`}
          {s && <PlattformChip plattform={s.plattform} />}
        </p>
        <p className="scan-aussage erfasst" role="status">
          Disc erfasst.{k.z.absichtenErledigt.length > 0 && ` ${erledigtText(k.z.absichtenErledigt)}`}
        </p>
        {k.z.absichtenErledigt.length > 0 && !k.z.aufListe && (
          <button type="button" className="scan-link" disabled={laeuft} onClick={onBacklog}>ins Backlog übernehmen</button>
        )}
      </div>
      <button type="button" className="knopf" disabled={laeuft} onClick={onZurueck}>Rückgängig</button>
    </section>
  )
}

// --- Letzte Scans ------------------------------------------------------------------------

function ZeileInhalt({ e, mitZeit }: { e: ScanEintrag; mitZeit?: boolean }) {
  return (
    <>
      <Cover bild={e.bild} klein />
      <span className="scan-zeile-mitte">
        <span className="scan-zeile-titel">{e.titel ?? e.ean}</span>
        {mitZeit && (
          <span className="scan-still">
            {zeitText(e.zeit)}
            {e.titel && ` · ${e.ean}`}
          </span>
        )}
      </span>
      {e.plattform && <PlattformChip plattform={e.plattform} />}
      <span className={`scan-ergebnis ${e.ergebnis}`}>{ERGEBNIS_TEXT[e.ergebnis]}</span>
    </>
  )
}

function ScanZeile({ e, mitZeit }: { e: ScanEintrag; mitZeit?: boolean }) {
  return e.spielId !== null ? (
    <Link className="scan-eintrag" to={`/spiel/${e.spielId}`}>
      <ZeileInhalt e={e} mitZeit={mitZeit} />
    </Link>
  ) : (
    <div className="scan-eintrag">
      <ZeileInhalt e={e} mitZeit={mitZeit} />
    </div>
  )
}

/** Ortszeit des Geräts; ein anderer Tag bekommt sein Datum davor. */
function zeitText(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const uhr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? uhr : `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${uhr}`
}

/**
 * Unter einer Entscheidungskarte passen auf dem Handy des Nutzers zwei Zeilen,
 * unter dem knappen Erfasst-Block drei (gemessen bei 360 x 800 mit den
 * sicheren Bereichen 37/17).
 */
function LetzteScans({ liste, zeilen, onAlle }: { liste: ScanEintrag[]; zeilen: number; onAlle: () => void }) {
  if (liste.length === 0) return null
  return (
    <section className="scan-letzte" aria-label="Letzte Scans">
      <div className="scan-letzte-kopf">
        <span>Letzte Scans</span>
        <button type="button" className="scan-link" onClick={onAlle}>alle ({liste.length})</button>
      </div>
      {liste.slice(0, zeilen).map((e) => (
        <ScanZeile key={e.id} e={e} />
      ))}
    </section>
  )
}

/** „alle": die letzten 50, Zurück schließt (wie eine Tafel, `scanverlauf.ts`). */
function ScanListe({ liste, onSchliessen }: { liste: ScanEintrag[]; onSchliessen: () => void }) {
  return (
    <section className="scan-liste" aria-label="Alle letzten Scans">
      <div className="scan-letzte-kopf">
        <span>Nur auf diesem Gerät · {liste.length}</span>
        <button type="button" className="scan-link" onClick={onSchliessen}>schließen</button>
      </div>
      {liste.length === 0 && <p className="scan-still">Noch nichts gescannt.</p>}
      {liste.map((e) => (
        <ScanZeile key={e.id} e={e} mitZeit />
      ))}
    </section>
  )
}
