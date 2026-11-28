import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiFehler, PLATTFORMEN, anfrage, erledigtText, neuestePlattform, type ErfasstAntwort, type IgdbKandidat, type Plattform } from './api'
import { Kopfzeile } from './Kopfzeile'
import { ScanAuswahl } from './ScanAuswahl'
import { Dubletten, useAnlegen, type Angelegt } from './SpielAnlegen'
import { PlattformChip } from './SpielTeile'
import { Zeichen } from './Symbole'
import { useKamera } from './kamera'
import {
  PLATTFORM_FOLGE,
  anderePlattformen,
  erfassungAus,
  gemeinsamePlattform,
  hauptRelease,
  hauptText,
  kandidatenOrdnen,
  rahmenFuer,
  scanZurueck,
  signalFuer,
  wahlUmschalten,
  zielAufPlattform,
  zieleOrdnen,
  type AntwortDisc,
  type Erfassung,
  type Ergebnis,
  type HuellenWahl,
  type KartenLage,
  type Schritt,
  type Signal,
  type Ziel,
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
 * **Eine Hülle, mehrere Spiele** (Nachtrag f1h): Eine Collection-Disc trägt
 * an jedem ihrer Spiele eine eigene Disc mit demselben Code. In Fall 2 und in
 * der Suche lassen sich deshalb mehrere Spiele wählen („Disc für n Spiele
 * erfassen"), Fall 1 zeigt alle Spiele der Hülle, und „+ weiteres Spiel
 * dieser Hülle" hängt eines an einen schon erfassten Code an. Rückgängig
 * nimmt den ganzen Zug zurück.
 *
 * Jeder Fall gibt ein Signal – Rahmenfarbe, Ton und Vibration (`scanner.ts`,
 * `ton.ts`) –, damit man beim Abscannen nicht auf den Bildschirm sehen muss.
 * Das Textfeld für die EAN bleibt als Notnagel hinter „Code eintippen".
 * Ein Code, der nicht zugeordnet wird, hinterlässt in der Datenbank keine
 * Spur (9.3); „Letzte Scans" ist nur ein Gedächtnis des Geräts.
 */

type HuellenSpiel = { releaseId: number; spielId: number; titel: string; plattform: Plattform; bild: string | null; exemplare: number }

type Treffer = {
  ean: string
  treffer: 'mapping' | 'angebot' | 'keiner'
  release?: HuellenSpiel
  /** Alle Spiele der Hülle, das Mapping-Release vorn (Nachtrag f1h); fehlt bei einem älteren Worker. */
  huelle?: HuellenSpiel[]
  angebot?: { titel: string; plattform: string | null }
  scans: number
}

/** Eine Disc des Zugs, wie der Worker sie nennt (Nachtrag f1h). */
type ZugDisc = AntwortDisc &
  Pick<ErfasstAntwort, 'absichtenErledigt' | 'aufListe'> & {
    spiel: { spielId: number; titel: string; plattform: Plattform } | null
    bild?: string | null
  }

type Zuordnung = ErfasstAntwort & {
  ean: string
  releaseId: number
  spiel: { spielId: number; titel: string; plattform: Plattform } | null
  discs?: ZugDisc[]
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
  /** Fall 3: Spiel und Release, die `POST /api/games` eben angelegt hat. */
  angelegt: { releaseId: number; spielNeu: boolean; releaseNeu: boolean } | null
  bild: string | null
  vorherMapping: Erfassung['vorherMapping']
}

/** Was „Nochmal versuchen" wiederholt. */
type Wiederholung =
  | { art: 'aufloesen'; roh: string; zaehlen: boolean }
  | { art: 'zuordnen'; ean: string; ziele: Ziel[]; z: Zusammenhang }
  | { art: 'zurueck'; rest: Schritt[]; erfasst: ErfasstKarte }

/** `weitere`: die Suche für ein weiteres Spiel eines schon erfassten Codes (Nachtrag f1h). */
type Modus = 'vorschlag' | 'suche' | 'anlegen' | 'weitere'

type ErfasstKarte = {
  art: 'erfasst'
  e: Erfassung
  z: Zuordnung
  /** Die Discs dieses Zugs mit Titel und Plattform – eine je Spiel der Hülle. */
  discs: ZugDisc[]
  bild: string | null
  eintragId: string
}

type Karte =
  | { art: 'leer'; hinweis: string | null }
  | { art: 'code'; t: Treffer; modus: Modus; vorwahl?: HuellenWahl[] }
  | ErfasstKarte
  | { art: 'fehler'; ean: string | null; meldung: string; nochmal: Wiederholung | null }

/** Was der Rahmen des Kamerabilds wissen muss (`rahmenFuer`). */
function kartenLage(k: Karte): KartenLage {
  if (k.art === 'code') return { art: 'code', signal: signalFuer({ art: 'aufgeloest', treffer: k.t.treffer, exemplare: k.t.release?.exemplare ?? null }) }
  if (k.art === 'fehler') return { art: 'fehler' }
  return { art: k.art }
}

/** Die Discs aus der Antwort – bei einem älteren Worker die eine oben. */
const discsAus = (a: Zuordnung): ZugDisc[] =>
  a.discs ?? [{ id: a.id, releaseId: a.releaseId, physischStatusGesetzt: a.physischStatusGesetzt, spiel: a.spiel, absichtenErledigt: a.absichtenErledigt, aufListe: a.aufListe }]

const titelDerHuelle = (discs: readonly ZugDisc[]) => discs.map((d) => d.spiel?.titel ?? `Release ${d.releaseId}`).join(' + ')

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

  // Der zuletzt angenommene Code löst erst wieder aus, wenn er zwischendurch
  // aus dem Bild war (`wiederholsperre.ts`, Nachtrag f1h).
  const { videoRef, status: kameraStatus, fehler: kameraFehler, nativ, geraete, starten, stoppen, wechseln, pausiert, setPausiert, kandidat, gespiegelt } =
    useKamera(aufloesen)
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

  async function zuordnen(ean: string, ziele: Ziel[], z: Zusammenhang) {
    setLaeuft(true)
    const eintragId = offen.current?.ean === ean ? offen.current.id : neueId(ean, Date.now(), Math.random())
    try {
      const antwort = await anfrage<Zuordnung>(`/api/scan/${ean}/assign`, { methode: 'POST', koerper: { ziele } })
      const discs = discsAus(antwort)
      const e = erfassungAus(ean, discs, z.angelegt, z.vorherMapping)
      offen.current = null
      const erste = discs[0]?.spiel ?? null
      verlauf.aendern((l) =>
        vorne(l, {
          id: eintragId,
          ean,
          zeit: new Date().toISOString(),
          ergebnis: 'erfasst',
          spielId: erste?.spielId ?? null,
          titel: erste ? titelDerHuelle(discs) : null,
          plattform: erste?.plattform ?? null,
          bild: z.bild,
        }),
      )
      setSitzung((n) => n + 1)
      signal({ art: 'erfasst' })
      weiter({ art: 'erfasst', e, z: { ...antwort, ean }, discs, bild: z.bild, eintragId })
    } catch (f) {
      if (f instanceof ApiFehler && f.status === 409 && typeof f.antwort.releaseId === 'number' && ziele.length === 1) {
        // Je Release genau eine Disc: Das Mapping hat der Worker trotzdem
        // gesetzt (9.2) – die Karte sagt jetzt, was beim nächsten Scan kommt.
        const a = f.antwort as { releaseId: number; game_id?: number; title?: string; platform?: Plattform }
        const r: HuellenSpiel = { releaseId: a.releaseId, spielId: a.game_id ?? 0, titel: a.title ?? '', plattform: a.platform ?? 'PS4', bild: z.bild, exemplare: 1 }
        const t: Treffer = { ean, treffer: 'mapping', scans: 0, release: r, huelle: [r] }
        offen.current = null
        verlauf.aendern((l) =>
          vorne(l, { id: eintragId, ean, zeit: new Date().toISOString(), ergebnis: 'regal', spielId: a.game_id ?? null, titel: a.title ?? null, plattform: a.platform ?? null, bild: z.bild }),
        )
        signal({ art: 'schon_da' })
        setKarte({ art: 'code', t, modus: 'vorschlag' })
      } else {
        // Bei mehreren Zielen schreibt ein 409 nichts (Nachtrag f1h); die
        // Meldung des Workers nennt das Spiel, dessen Disc schon steht.
        signal({ art: 'fehler' })
        setKarte({ art: 'fehler', ean, meldung: meldungAus(f, 'Zuordnen fehlgeschlagen.'), nochmal: wiederholbar(f) ? { art: 'zuordnen', ean, ziele, z } : null })
      }
    } finally {
      setLaeuft(false)
    }
  }

  /**
   * Rückgängig: Schritt für Schritt aus `scanZurueck` – für alle Discs des
   * Zugs. Scheitert einer, steht die Fehlerkarte da, und „Nochmal versuchen"
   * setzt beim gescheiterten an – die erledigten Schritte noch einmal zu
   * schicken, liefe auf 404.
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
      verlauf.aendern((l) => zuruecknehmen(l, erfasst.eintragId, erfasst.e.discs[0]?.spielNeu === true))
      setSitzung((n) => Math.max(0, n - 1))
      setKarte({ art: 'leer', hinweis: 'Zurückgenommen.' })
    } catch (f) {
      signal({ art: 'fehler' })
      setKarte({ art: 'fehler', ean: erfasst.e.ean, meldung: meldungAus(f, 'Rückgängig fehlgeschlagen.'), nochmal: { art: 'zurueck', rest: schritte.slice(i), erfasst } })
    } finally {
      setLaeuft(false)
    }
  }

  /** „ins Backlog übernehmen": jedes Release des Zugs, dessen Kauf oder Wunsch erledigt wurde und das auf keiner Liste steht. */
  async function insBacklog(k: ErfasstKarte) {
    setLaeuft(true)
    try {
      for (const d of k.discs.filter((x) => x.absichtenErledigt.length > 0 && !x.aufListe)) {
        await anfrage('/api/plans', { methode: 'POST', koerper: { art: 'backlog', releaseId: d.releaseId } })
      }
      setKarte({ ...k, z: { ...k.z, aufListe: true }, discs: k.discs.map((d) => ({ ...d, aufListe: true })) })
    } catch (f) {
      setKarte({ art: 'fehler', ean: k.e.ean, meldung: meldungAus(f, 'Anlegen fehlgeschlagen.'), nochmal: null })
    } finally {
      setLaeuft(false)
    }
  }

  /**
   * „+ weiteres Spiel dieser Hülle" am Erfasst-Block (Nachtrag f1h): Der
   * Code ist jetzt bekannt; die Suche hängt ein weiteres Spiel an ihn an.
   * Das Rückgängig des ersten Zugs ist damit vorbei – wie bei jedem neuen Code.
   */
  async function weiteresSpiel(k: ErfasstKarte) {
    setLaeuft(true)
    try {
      const t = await anfrage<Treffer>('/api/scan', { methode: 'POST', koerper: { ean: k.e.ean, zaehlen: false } })
      offen.current = { id: neueId(t.ean, Date.now(), Math.random()), ean: t.ean }
      aktuellerCode.current = t.ean
      setKarte({ art: 'code', t, modus: 'weitere' })
      setPausiert(true)
    } catch (f) {
      setKarte({ art: 'fehler', ean: k.e.ean, meldung: meldungAus(f, 'Der Code ließ sich nicht laden.'), nochmal: null })
    } finally {
      setLaeuft(false)
    }
  }

  function nochmal(w: Wiederholung) {
    if (w.art === 'aufloesen') void aufloesen(w.roh, w.zaehlen)
    else if (w.art === 'zuordnen') void zuordnen(w.ean, w.ziele, w.z)
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

  /** Solange eine Karte wartet, steht die Farbe ihres Falls; sonst nur das kurze Aufleuchten nach „erfasst". */
  const rahmen = rahmenFuer(kartenLage(karte), blitz)

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
        <div className={`scan-kamera${rahmen ? ` signal-${rahmen}` : ''}`}>
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
              vorwahl={karte.vorwahl ?? []}
              online={online?.ean === karte.t.ean ? online : null}
              laeuft={laeuft}
              onModus={(modus, vorwahl) => setKarte({ ...karte, modus, vorwahl })}
              onAbbrechen={abbrechen}
              onWeiter={() => weiter()}
              onZuordnen={(ziele, z) => zuordnen(karte.t.ean, ziele, z)}
            />
          )}

          {karte.art === 'erfasst' && (
            <ErfasstBlock
              k={karte}
              laeuft={laeuft}
              onZurueck={() => zurueck(karte)}
              onBacklog={() => insBacklog(karte)}
              onWeitere={() => weiteresSpiel(karte)}
            />
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
      <option value="">{text}</option>
      {optionen.map((o) => (
        <option key={o.wert} value={o.wert}>{o.text}</option>
      ))}
    </select>
  )
}

const KEIN_ZUSAMMENHANG: Zusammenhang = { angelegt: null, bild: null, vorherMapping: null }

/** Die gewählten Spiele als Ziele des Zuordnens, das alte Mapping-Release vorn (`zieleOrdnen`). */
const zieleAus = (wahl: readonly HuellenWahl[], vorher: Erfassung['vorherMapping']): Ziel[] =>
  zieleOrdnen(wahl, vorher?.releaseId ?? null).map((w) => w.ziel)

/** Der Hauptknopf für eine Wahl: „Disc erfassen · PS4" oder „Disc für 2 Spiele erfassen · PS3". */
function HauptWahl({ wahl, laeuft, onClick }: { wahl: readonly HuellenWahl[]; laeuft: boolean; onClick: () => void }) {
  const h = hauptText(wahl)
  return (
    <button type="button" className="scan-haupt" disabled={laeuft || wahl.length === 0} onClick={onClick}>
      {h.text}
      {h.plattform && (
        <>
          {' · '}
          <HauptPlattform p={h.plattform} />
        </>
      )}
    </button>
  )
}

/** Fall 1–3 für einen Code: Vorschlag, Suche in der Sammlung oder Anlegen. */
function CodeKarte({
  t,
  modus,
  vorwahl,
  online,
  laeuft,
  onModus,
  onAbbrechen,
  onWeiter,
  onZuordnen,
}: {
  t: Treffer
  modus: Modus
  vorwahl: HuellenWahl[]
  online: OnlineStand | null
  laeuft: boolean
  onModus: (m: Modus, vorwahl?: HuellenWahl[]) => void
  onAbbrechen: () => void
  onWeiter: () => void
  onZuordnen: (ziele: Ziel[], z: Zusammenhang) => void
}) {
  const r = t.release
  /** Worauf der Code vorher zeigte – Rückgängig bringt es zurück. */
  const vorherMapping: Erfassung['vorherMapping'] = r ? { releaseId: r.releaseId, mitDisc: r.exemplare > 0 } : null

  if (modus === 'suche' || modus === 'weitere') {
    return (
      <SuchKarte
        t={t}
        modus={modus}
        vorwahl={vorwahl}
        vorgabe={t.angebot?.titel ?? (online?.art === 'da' ? (online.o.titel ?? '') : '')}
        laeuft={laeuft}
        onModus={onModus}
        onAbbrechen={onAbbrechen}
        onZuordnen={(wahl) => onZuordnen(zieleAus(wahl, vorherMapping), { ...KEIN_ZUSAMMENHANG, bild: null, vorherMapping })}
      />
    )
  }

  // Fall 1: Der Code ist zugeordnet – mit allen Spielen der Hülle (Nachtrag f1h).
  if (t.treffer === 'mapping' && r && modus === 'vorschlag') {
    const imRegal = r.exemplare > 0
    const huelle = t.huelle && t.huelle.length > 0 ? t.huelle : [r]
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
              onClick={() => onZuordnen([{ releaseId: r.releaseId }], { ...KEIN_ZUSAMMENHANG, bild: r.bild, vorherMapping })}
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
        {huelle.length === 1 ? (
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
        ) : (
          <>
            <p className={imRegal ? 'scan-aussage regal' : 'scan-aussage'}>
              {imRegal ? 'Steht schon im Regal.' : 'Disc ins Regal aufnehmen?'}
            </p>
            <ul className="scan-wahlliste">
              {huelle.map((h) => (
                <li key={h.releaseId}>
                  <Link className="scan-wahl" to={`/spiel/${h.spielId}`}>
                    <Cover bild={h.bild} klein />
                    <span className="scan-wahl-titel">{h.titel}</span>
                    <PlattformChip plattform={h.plattform} />
                    <span className="scan-still">{h.exemplare > 0 ? 'im Regal' : 'keine Disc'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </KartenRahmen>
    )
  }

  // Fall 2: eBay nennt ein Spiel der Sammlung.
  if (modus === 'vorschlag' && online?.art === 'da' && online.o.kandidaten.length > 0) {
    return (
      <SammlungsKarte
        t={t}
        o={online.o}
        laeuft={laeuft}
        onModus={onModus}
        onAbbrechen={onAbbrechen}
        onWeiter={onWeiter}
        onZuordnen={(wahl, bild) => onZuordnen(zieleAus(wahl, vorherMapping), { ...KEIN_ZUSAMMENHANG, bild, vorherMapping })}
      />
    )
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
        onZuordnen([{ releaseId: a.releaseId }], { angelegt: { releaseId: a.releaseId, spielNeu: a.spielNeu, releaseNeu: a.releaseNeu }, bild, vorherMapping })
      }
    />
  )
}

/**
 * Die Suche in der Sammlung (Stufe 3 der Kette) – seit Nachtrag f1h mit
 * Mehrfachwahl: Ein Tipp wählt, der Hauptknopf erfasst. Das ist auch der Weg,
 * eine schon falsch erfasste Collection zu ergänzen (Fall 1 → „Ist ein
 * anderes Spiel") und am Erfasst-Block ein weiteres Spiel an die Hülle zu
 * hängen (`weitere`).
 */
function SuchKarte({
  t,
  modus,
  vorwahl,
  vorgabe,
  laeuft,
  onModus,
  onAbbrechen,
  onZuordnen,
}: {
  t: Treffer
  modus: 'suche' | 'weitere'
  vorwahl: HuellenWahl[]
  vorgabe: string
  laeuft: boolean
  onModus: (m: Modus, vorwahl?: HuellenWahl[]) => void
  onAbbrechen: () => void
  onZuordnen: (wahl: HuellenWahl[]) => void
}) {
  const [wahl, setWahl] = useState<HuellenWahl[]>(vorwahl)
  return (
    <KartenRahmen
      kennung={modus === 'weitere' || vorwahl.length > 0 ? 'Spiele der Hülle' : t.treffer === 'mapping' ? 'Anderes Spiel' : 'In der Sammlung suchen'}
      ean={t.ean}
      onAbbrechen={onAbbrechen}
      haupt={<HauptWahl wahl={wahl} laeuft={laeuft} onClick={() => onZuordnen(wahl)} />}
      leise={
        modus === 'weitere' ? undefined : (
          <>
            <Leise onClick={() => onModus('vorschlag')}>Zurück</Leise>
            <Leise onClick={() => onModus('anlegen')}>Spiel anlegen</Leise>
          </>
        )
      }
    >
      {t.angebot && (
        <p className="scan-zeile">
          Händler: „{t.angebot.titel}"{t.angebot.plattform ? ` (${t.angebot.plattform})` : ''}
        </p>
      )}
      <ScanAuswahl ean={t.ean} vorgabe={vorgabe} laeuft={laeuft} wahl={wahl} onUmschalten={(w) => setWahl((alt) => wahlUmschalten(alt, w))} />
    </KartenRahmen>
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
}: {
  t: Treffer
  o: Online
  laeuft: boolean
  onModus: (m: Modus, vorwahl?: HuellenWahl[]) => void
  onAbbrechen: () => void
  onWeiter: () => void
  onZuordnen: (wahl: HuellenWahl[], bild: string | null) => void
}) {
  const kandidaten = kandidatenOrdnen(o.kandidaten, o.zielSpielId)
  /** Die Wahl eines Kandidaten: sein Release ohne Disc auf der neuesten Plattform (`hauptRelease`). */
  const wahlVon = (k: Kandidat): HuellenWahl | null => {
    const h = hauptRelease(k.releases)
    return h ? { spielId: k.spielId, titel: k.titel, plattform: h.plattform, ziel: { releaseId: h.releaseId }, releaseNeu: false } : null
  }
  const [wahl, setWahl] = useState<HuellenWahl[]>(() => {
    const erste = kandidaten.map(wahlVon).find((w) => w !== null)
    return erste ? [erste] : []
  })
  const bildVon = (spielId: number | undefined) => kandidaten.find((k) => k.spielId === spielId)?.bild ?? null
  const bild = bildVon(wahl[0]?.spielId)
  const einer = kandidaten.length === 1
  const k = kandidaten[0]

  /**
   * „Andere Plattform": für alle gewählten Spiele auf einmal – eine Hülle hat
   * eine Plattform. Nur Plattformen, auf denen keines schon eine Disc hat;
   * gewählt ist Aktion, wie vor f1h.
   */
  const basis = einer ? [k] : kandidaten.filter((x) => wahl.some((w) => w.spielId === x.spielId))
  const jetzt = gemeinsamePlattform(wahl)
  const plattformen = basis.length === 0 ? [] : PLATTFORM_FOLGE.filter((p) => p !== jetzt && basis.every((x) => zielAufPlattform(x.spielId, x.releases, p) !== null))
  const auf = (p: (typeof PLATTFORM_FOLGE)[number]): HuellenWahl[] =>
    basis.map((x) => {
      const z = zielAufPlattform(x.spielId, x.releases, p)!
      return { spielId: x.spielId, titel: x.titel, plattform: p, ...z }
    })
  const andere = einer ? anderePlattformen(k.releases, hauptRelease(k.releases)) : null

  return (
    <KartenRahmen
      kennung="Neuer Code"
      ean={t.ean}
      onAbbrechen={onAbbrechen}
      haupt={
        wahl.length > 0 || !kandidaten.every((x) => hauptRelease(x.releases) === null) ? (
          <HauptWahl wahl={wahl} laeuft={laeuft} onClick={() => onZuordnen(wahl, bild)} />
        ) : (
          <button type="button" className="scan-haupt" onClick={onWeiter}>Weiter</button>
        )
      }
      leise={
        <>
          <PlattformAuswahl
            text="Andere Plattform"
            disabled={laeuft}
            optionen={plattformen.map((p) => ({
              wert: p,
              text: andere ? (andere.find((a) => a.plattform === p)?.art === 'neu' ? `${p} anlegen` : p) : basis.every((x) => x.releases.some((r) => r.plattform === p)) ? p : `${p} anlegen`,
            }))}
            onWahl={(w) => {
              const p = PLATTFORM_FOLGE.find((x) => x === w)
              if (p) onZuordnen(auf(p), bild)
            }}
          />
          <Leise onClick={() => onModus('suche')}>Anderes Spiel</Leise>
        </>
      }
    >
      {einer ? (
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
            {wahl.length === 0 && <p className="scan-aussage regal">Steht schon im Regal.</p>}
            {o.titel && <p className="scan-zeile">eBay: {o.titel}</p>}
            <WeiteresSpiel laeuft={laeuft} onClick={() => onModus('suche', wahl)} />
          </div>
        </div>
      ) : (
        <>
          {o.titel && <p className="scan-zeile">eBay: {o.titel}</p>}
          <ul className="scan-wahlliste">
            {kandidaten.map((x) => {
              const w = wahlVon(x)
              const an = wahl.some((y) => y.spielId === x.spielId)
              return (
                <li key={x.spielId}>
                  <button
                    type="button"
                    className={an ? 'scan-wahl gewaehlt' : 'scan-wahl'}
                    aria-pressed={an}
                    disabled={laeuft || w === null}
                    onClick={() => {
                      // Abwählen nimmt den Eintrag, wie er gewählt ist (auch nach „Andere Plattform").
                      const da = wahl.find((y) => y.spielId === x.spielId)
                      if (da || w) setWahl((alt) => wahlUmschalten(alt, da ?? w!))
                    }}
                  >
                    <Cover bild={x.bild} klein />
                    <span className="scan-wahl-titel">{x.titel}</span>
                    {w ? <PlattformChip plattform={an ? (wahl.find((y) => y.spielId === x.spielId)?.plattform ?? w.plattform) : w.plattform} /> : <span className="scan-still">im Regal</span>}
                    {an && <Zeichen name="haken" groesse={16} className="scan-haken" />}
                  </button>
                </li>
              )
            })}
          </ul>
          <WeiteresSpiel laeuft={laeuft} onClick={() => onModus('suche', wahl)} />
        </>
      )}
    </KartenRahmen>
  )
}

/** Der leise Weg zu einem weiteren Spiel derselben Hülle (Nachtrag f1h). */
function WeiteresSpiel({ laeuft, onClick }: { laeuft: boolean; onClick: () => void }) {
  return (
    <button type="button" className="scan-link scan-weitere" disabled={laeuft} onClick={onClick}>
      + weiteres Spiel dieser Hülle
    </button>
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
  onModus: (m: Modus, vorwahl?: HuellenWahl[]) => void
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
            text="Ohne IGDB"
            disabled={beschaeftigt || treffer === null || begriff.trim() === ''}
            optionen={PLATTFORMEN.map((p) => ({ wert: p, text: `„${begriff.trim()}" als ${p} anlegen` }))}
            onWahl={(p) => a.anlegen({ titel: begriff.trim() }, false, p)}
          />
          <Leise onClick={() => onModus('suche')}>In Sammlung suchen</Leise>
        </>
      }
    >
      <p className="scan-zeile">
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
                  {an ? <Zeichen name="haken" groesse={16} className="scan-haken" /> : <PlattformChip plattform={plattformVon(k)} />}
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
function ErfasstBlock({
  k,
  laeuft,
  onZurueck,
  onBacklog,
  onWeitere,
}: {
  k: ErfasstKarte
  laeuft: boolean
  onZurueck: () => void
  onBacklog: () => void
  onWeitere: () => void
}) {
  const erledigt = k.discs.flatMap((d) => d.absichtenErledigt)
  const backlog = k.discs.some((d) => d.absichtenErledigt.length > 0 && !d.aufListe)
  return (
    <section className="scan-erfasst" aria-label="Erfasst">
      <Cover bild={k.bild} klein />
      <div className="scan-erfasst-text">
        <p className="scan-erfasst-titel">
          {k.discs.map((d, i) => (
            <span key={d.releaseId}>
              {i > 0 && <span className="scan-still">+ </span>}
              {d.spiel ? <Link to={`/spiel/${d.spiel.spielId}`}>{d.spiel.titel}</Link> : `Release ${d.releaseId}`}
              {d.spiel && (i === k.discs.length - 1 || d.spiel.plattform !== k.discs[i + 1]?.spiel?.plattform) && <PlattformChip plattform={d.spiel.plattform} />}
              {i < k.discs.length - 1 && ' '}
            </span>
          ))}
        </p>
        <p className="scan-aussage erfasst" role="status">
          {k.discs.length > 1 ? `Disc für ${k.discs.length} Spiele erfasst.` : 'Disc erfasst.'}
          {erledigt.length > 0 && ` ${erledigtText(erledigt)}`}
        </p>
        {backlog && (
          <button type="button" className="scan-link" disabled={laeuft} onClick={onBacklog}>ins Backlog übernehmen</button>
        )}
        <WeiteresSpiel laeuft={laeuft} onClick={onWeitere} />
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
