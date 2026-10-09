import { useCallback, useEffect, useState } from 'react'
import { alsDatum, datumMitJahr } from './api'

/**
 * Einstellungen: NPSSO hinterlegen und Sync auslösen.
 *
 * Der Sync holt pro Aufruf nur wenige Seiten (10-ms-CPU-Grenze). Solange
 * `weiter` zurückkommt, ruft diese Ansicht erneut auf und zeigt den
 * Fortschritt – damit ist die Blätterung auch ohne Cron bedienbar.
 */

type Zugang = {
  eingerichtet: boolean
  status: 'ok' | 'abgelaufen' | 'fehler' | null
  npssoHinterlegtAm: string | null
  /** Sonys Ankündigung aus `expires_in` – eine Angabe, keine Zusage (7.1). */
  npssoLaeuftAbUm: string | null
  refreshLaeuftAbUm: string | null
  letzterErfolgAm: string | null
}

/** Ein aufgezeichneter Zugang (Stufe 19e) – nur Zeitpunkte, nie ein Token. */
type ZugangVerlauf = {
  eingetragenAm: string
  angekuendigtBis: string | null
  letzterErfolgAm: string | null
  ausgang: 'gestorben' | 'ersetzt' | 'offen'
  endeAm: string | null
}

type Lauf = {
  status: string
  ausloeser: 'nutzer' | 'cron'
  gestartetAm: string
  beendetAm: string | null
  titlesSeen: number | null
  offset: number
  meldung: string | null
} | null

/** Seit Stufe 18 auch der juengste Lauf des Cron (Abschnitt 10.1). */
export type StatusAntwort = {
  zugang: Zugang
  letzterLauf: Lauf
  letzterAutomatischerLauf: Lauf
  /** Was die letzten Cron-Aufrufe taten, neueste zuerst (Stufe 18b). */
  cronVerlauf: string[]
  trophaeen: number
  /** Stand der wöchentlichen Kaufliste (Stufe 18e, 7.7). */
  besitz?: { fertigAm: string | null; fehlerAm: string | null; laeuft: boolean }
  /** Wie lange die bisherigen Zugänge gehalten haben (Stufe 19e). */
  zugaenge?: ZugangVerlauf[]
}

type SyncAntwort = {
  status: 'erfolg' | 'laufend' | 'fehler'
  phase: 'abruf' | 'normalisierung'
  offset: number
  seitenGeholt: number
  titlesSeen: number | null
  offeneSeiten?: number
  vorbelegt?: number
  eingereiht?: number
  eingereihtNachGrund?: { erstimport: number; neueTrophaeen: number; dlcErweitert: number }
  weiter: boolean
  meldung?: string
  /** Fehlversuche an derselben Seite, wenn dieser Aufruf einen hatte (Stufe 18e). */
  fehlversuche?: number
}

/** Was POST /api/sync/besitz zurückgibt (Stufe 18e). */
type BesitzAntwort = {
  status: 'erfolg' | 'fehler'
  geholt: number
  kauf: number
  plus: number
  entfallen: number
  erledigt?: number
  weiter: boolean
  meldung?: string
  fehler?: string
}

/** "3 neu in der Prüfliste (1 zum ersten Mal, 1 weitergespielt, 1 DLC)" - nur, was nicht null ist. */
function eingereihtText(d: SyncAntwort): string {
  if (!d.eingereiht) return ''
  const teile = d.eingereihtNachGrund
    ? [
        [d.eingereihtNachGrund.erstimport, 'zum ersten Mal'],
        [d.eingereihtNachGrund.neueTrophaeen, 'weitergespielt'],
        [d.eingereihtNachGrund.dlcErweitert, 'DLC'],
      ].filter(([n]) => n)
    : []
  const klammer = teile.length > 1 ? ` (${teile.map(([n, t]) => `${n} ${t}`).join(', ')})` : ''
  return ` ${d.eingereiht} neu in der Prüfliste${klammer}.`
}

/** Nur der Tag - fuer Marken, die ohnehin nur ein Datum sind (Stufe 18e). */
const datumNurTag = (wert: string | null) =>
  wert ? new Date(`${wert}T00:00:00Z`).toLocaleDateString('de-DE') : 'noch keiner'

const datum = (wert: string | null) =>
  wert ? new Date(wert.replace(' ', 'T') + (wert.includes('Z') ? '' : 'Z')).toLocaleString('de-DE') : 'unbekannt'

const AUSLOESERTEXT: Record<string, string> = { nutzer: 'von Hand', cron: 'automatisch' }

/** Eine Zeile zu einem Lauf: Status, Ausloeser, Start, Titel, Meldung. */
function laufText(lauf: NonNullable<Lauf>): string {
  return (
    `${lauf.status}, ${AUSLOESERTEXT[lauf.ausloeser] ?? lauf.ausloeser}, gestartet ${datum(lauf.gestartetAm)}` +
    (lauf.titlesSeen !== null ? ` – ${lauf.titlesSeen} Titel` : '') +
    (lauf.meldung ? ` – ${lauf.meldung}` : '')
  )
}

/**
 * Der Zugangsblock (Stufe 19e).
 *
 * Der alte Ablauf war sechs Schritte lang, und der unangenehmste davon war
 * das Markieren von 64 Zeichen zwischen zwei Anführungszeichen auf einem
 * Handydisplay. Er lässt sich nicht abschaffen – das NPSSO ist ein Cookie auf
 * Sonys Domain, und keine Seite fremder Herkunft darf es lesen (gemessen am
 * 29.09.2026: CORS steht offen, `SameSite` nicht). Was bleibt, ist ihn kurz
 * zu machen:
 *
 *   Knopf → Tab geht auf → alles kopieren → zurück → fertig.
 *
 * Den letzten Schritt macht die Anwendung selbst: Sie merkt am
 * `visibilitychange`, dass du zurück bist, liest die Zwischenablage und
 * prüft, was darin steht. Klappt das nicht – keine Berechtigung, nichts
 * Brauchbares drin –, bleibt der Weg von Hand darunter stehen.
 */

const SONY_URL = 'https://ca.account.sony.com/api/v1/ssocookie'

/**
 * Ab wann gemeldet wird, dass der Zugang bald abläuft.
 *
 * 18 Tage, nicht Sonys Ankündigung: Die lautete rund 60 Tage, gehalten hat
 * der Zugang 25 (gemessen am 29.09.2026, 7.1). Sieben Tage Vorlauf auf die
 * gemessene Lebensdauer – eine Faustregel auf EINEM Messpunkt, die durch die
 * Aufzeichnung in `psn_zugang` mit jeder Runde besser wird.
 */
const WARNEN_AB_TAGEN = 18

/** Grob genug: ganze Tage seit einem Zeitpunkt aus D1 oder ISO. */
function tageSeit(wert: string | null): number | null {
  if (!wert) return null
  const t = alsDatum(wert)
  if (!t) return null
  return Math.floor((Date.now() - t.getTime()) / 86_400_000)
}

function tageText(tage: number | null): string {
  if (tage === null) return 'unbekannt'
  if (tage === 0) return 'heute'
  if (tage === 1) return 'gestern'
  return `vor ${tage} Tagen`
}

type Zustand = 'ok' | 'bald' | 'weg'
const ZUSTANDSWORT: Record<Zustand, string> = {
  ok: 'Verbunden',
  bald: 'Läuft bald ab',
  weg: 'Abgelaufen',
}

function zustandAus(zugang: Zugang): Zustand {
  if (!zugang.eingerichtet || zugang.status === 'abgelaufen') return 'weg'
  const tage = tageSeit(zugang.npssoHinterlegtAm)
  return tage !== null && tage >= WARNEN_AB_TAGEN ? 'bald' : 'ok'
}

type Rueckmeldung = { art: 'laeuft' | 'gut' | 'schlecht'; text: string } | null

export function ZugangBlock({
  zugang,
  zugaenge,
  trophaeen,
  neuLaden,
}: {
  zugang: Zugang | undefined
  zugaenge: ZugangVerlauf[]
  trophaeen: number | undefined
  neuLaden: () => Promise<void>
}) {
  const [wartet, setWartet] = useState(false)
  const [rueck, setRueck] = useState<Rueckmeldung>(null)
  const [handfeld, setHandfeld] = useState('')
  const [laeuft, setLaeuft] = useState(false)

  const eintragen = useCallback(
    async (text: string) => {
      setLaeuft(true)
      setRueck({ art: 'laeuft', text: 'Zugang erkannt – wird bei PlayStation geprüft …' })
      try {
        const antwort = await fetch('/api/settings/npsso', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ npsso: text }),
        })
        const daten = (await antwort.json()) as { fehler?: string; npssoLaeuftAbUm?: string | null }
        if (!antwort.ok) {
          setRueck({ art: 'schlecht', text: daten.fehler ?? 'Der Zugang konnte nicht gespeichert werden.' })
          return false
        }
        setHandfeld('')
        setRueck({
          art: 'gut',
          text: daten.npssoLaeuftAbUm
            ? `Zugang geprüft und gespeichert. Gültig bis ${datumMitJahr(daten.npssoLaeuftAbUm)}.`
            : 'Zugang geprüft und gespeichert.',
        })
        await neuLaden()
        return true
      } finally {
        setLaeuft(false)
      }
    },
    [neuLaden],
  )

  /**
   * Zurück in der Anwendung: nachsehen, ob in der Zwischenablage etwas liegt,
   * das wie ein Zugang aussieht.
   *
   * Die lose Prüfung hier entscheidet nur, ob es sich lohnt zu fragen – die
   * verbindliche macht der Worker (`npssoAusText`). Jeder Fehler ist
   * harmlos: keine Berechtigung, kein Fokus, nichts Passendes drin – dann
   * bleibt der Weg von Hand.
   */
  useEffect(() => {
    if (!wartet) return
    const zurueck = () => {
      if (document.visibilityState !== 'visible') return
      setWartet(false)
      void (async () => {
        try {
          const text = await navigator.clipboard.readText()
          if (!/(^|[^A-Za-z0-9])[A-Za-z0-9]{64}([^A-Za-z0-9]|$)/.test(text)) {
            setRueck({
              art: 'schlecht',
              text: 'In der Zwischenablage stand kein Zugang. Bist du bei PlayStation angemeldet?',
            })
            return
          }
          await eintragen(text)
        } catch {
          setRueck({
            art: 'schlecht',
            text: 'Die Zwischenablage ließ sich nicht lesen. Füge den Text unten von Hand ein.',
          })
        }
      })()
    }
    document.addEventListener('visibilitychange', zurueck)
    return () => document.removeEventListener('visibilitychange', zurueck)
  }, [wartet, eintragen])

  if (!zugang) return null
  const zustand = zustandAus(zugang)
  const tage = tageSeit(zugang.npssoHinterlegtAm)
  const gemessen = zugaenge.filter((z) => z.ausgang === 'gestorben' && z.endeAm)

  return (
    <section className={`karte zugang ${zustand}`}>
      <h2>PlayStation-Verbindung</h2>

      <div className="zugangkopf">
        <span className="punkt" />
        <span className="zugangwort">{zugang.eingerichtet ? ZUSTANDSWORT[zustand] : 'Nicht eingerichtet'}</span>
      </div>

      {zustand === 'bald' && (
        <p className="still zugangsatz">
          Ein Zugang hielt bisher rund 25 Tage. Erneuere ihn, wenn es dir passt – sonst steht der nächtliche
          Abruf still.
        </p>
      )}
      {zustand === 'weg' && zugang.eingerichtet && (
        <p className="still zugangsatz">
          Der nächtliche Abruf steht still, bis ein neuer Zugang eingetragen ist. Vorhandene Daten bleiben
          unverändert.
        </p>
      )}

      {zugang.eingerichtet && (
        <div className="fakten">
          <span>Zugang eingetragen</span>
          <b>{tageText(tage)}</b>
          <span>Letzter Abruf</span>
          <b>{zugang.letzterErfolgAm ? datumMitJahr(zugang.letzterErfolgAm) : 'noch keiner'}</b>
          {zugang.npssoLaeuftAbUm && (
            <>
              <span>Sony nennt als Frist</span>
              <b>{datumMitJahr(zugang.npssoLaeuftAbUm)}</b>
            </>
          )}
          {trophaeen !== undefined && (
            <>
              <span>Trophäenlisten</span>
              <b className="zahl">{trophaeen}</b>
            </>
          )}
        </div>
      )}

      {rueck && (
        <div className={`rueck ${rueck.art}`} role="status">
          <span className="zeichen">{rueck.art === 'gut' ? '✓' : rueck.art === 'schlecht' ? '✕' : '◌'}</span>
          <span>{rueck.text}</span>
        </div>
      )}

      {wartet ? (
        <div className="schritte">
          <div className="schritt fertig">
            <span className="nr">1</span>
            <span>Sonys Seite ist in einem neuen Tab offen.</span>
          </div>
          <div className="schritt jetzt">
            <span className="nr">2</span>
            <span>
              Dort <b>lange auf die lange Zeichenfolge tippen</b> – sie wird am Stück markiert – und kopieren.
              Genauso gut: „Alles auswählen". Der Text ist klein, aber du musst ihn nicht lesen.
            </span>
          </div>
          <div className="schritt">
            <span className="nr">3</span>
            <span>Zurück zu Trophytracker – den Rest mache ich.</span>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className={`knopf gross${zustand === 'ok' ? '' : ' betont'}`}
        disabled={laeuft}
        onClick={() => {
          setRueck(null)
          setWartet(true)
          window.open(SONY_URL, '_blank', 'noopener')
        }}
      >
        {wartet ? 'Tab noch einmal öffnen' : 'Zugang erneuern'}
      </button>

      <details>
        <summary>Von Hand eintragen</summary>
        <form
          className="handfeld"
          onSubmit={(e) => {
            e.preventDefault()
            void eintragen(handfeld)
          }}
        >
          <input
            type="password"
            autoComplete="off"
            value={handfeld}
            placeholder="Wert oder ganzen Text einfügen"
            onChange={(e) => setHandfeld(e.target.value)}
          />
          <button type="submit" className="knopf" disabled={laeuft || handfeld.trim() === ''}>
            Speichern
          </button>
        </form>
        <p className="still zugangsatz">
          Beides wird angenommen: der ganze Text von Sonys Seite oder nur der Wert.
        </p>
      </details>

      {gemessen.length > 0 && (
        <details>
          <summary>Wie lange Zugänge halten</summary>
          <ul className="zugangsliste">
            {gemessen.map((z) => (
              <li key={z.eingetragenAm}>
                <span className="zahl">{tageZwischen(z.eingetragenAm, z.endeAm)}</span> Tage – eingetragen{' '}
                {datumMitJahr(z.eingetragenAm)}
                {z.angekuendigtBis ? `, angekündigt bis ${datumMitJahr(z.angekuendigtBis)}` : ''}
              </li>
            ))}
          </ul>
          <p className="still zugangsatz">
            Gezählt werden nur abgelehnte Zugänge. Wer früher erneuert, erfährt nie, wie lange seiner
            gehalten hätte.
          </p>
        </details>
      )}
    </section>
  )
}

/** Ganze Tage zwischen zwei Zeitpunkten, für die Liste oben. */
function tageZwischen(von: string, bis: string | null): number | string {
  const a = alsDatum(von)
  const b = bis ? alsDatum(bis) : null
  if (!a || !b) return 'unbekannt'
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000))
}

/** Was `GET /api/sync/trophaeen` sagt (Stufe 19b). */
type TrophaeenStand = {
  offen: number
  gesamt: number
  gespeichert: number
  level: { level: number; punkte: number; bisNaechstes: number; prozent: number } | null
  /** Ausgang des letzten Drucks – überlebt das Neuladen (Stufe 19b, 01.10.2026). */
  letzte: { am: string; listen: number; trophaeen: number; offen: number; meldung?: string } | null
}

/** Was `GET /api/sync/markt` sagt (Stufe 20). */
type MarktStand = {
  zugangsdaten: boolean
  mitPreis: number
  geprueft: number
  ohneAngebot: number
  offen: number
}

/** Was eine Portion zurueckgibt (`POST /api/sync/markt`). */
type MarktAntwort = {
  status: 'erfolg' | 'fehler'
  geprueft: number
  mitPreis: number
  discBelegt: number
  ohneAngebot: number
  nochOffen: number
  weiter: boolean
  meldung?: string
  fehler?: string
}

/** Was `GET /api/sync/store` sagt (Stufe 21). */
type StoreStand = {
  mitPreis: number
  imAngebot: number
  imPlusKatalog: number
  geprueft: number
  ohneId: number
  ohneWebstore: number
}

/** Ein Eintrag der Nachpflegeliste (`GET /api/sync/store/offen`, Stufe 21d). */
type StoreOffen = { releaseId: number; gameId: number; titel: string; plattform: string }

/** Was eine Portion zurueckgibt (`POST /api/sync/store`). */
type StoreAntwort = {
  status: 'erfolg' | 'fehler'
  geprueft: number
  mitPreis: number
  imAngebot: number
  imPlusKatalog: number
  zugeordnet: number
  ohneTreffer: number
  nochOffen: number
  anfragen: number
  weiter: boolean
  meldung?: string
  fehler?: string
}

/** Was eine Portion zurueckgibt (`POST /api/sync/trophaeen`). */
type TrophaeenAntwort = {
  listen: number
  trophaeen: number
  offen: number
  gesamt: number
  meldung?: string
}

export function Einstellungen() {
  const [status, setStatus] = useState<StatusAntwort | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [fortschritt, setFortschritt] = useState<string | null>(null)
  const [trophaeen, setTrophaeen] = useState<TrophaeenStand | null>(null)
  const [trophText, setTrophText] = useState<string | null>(null)
  const [markt, setMarkt] = useState<MarktStand | null>(null)
  const [marktText, setMarktText] = useState<string | null>(null)
  const [store, setStore] = useState<StoreStand | null>(null)
  const [storeText, setStoreText] = useState<string | null>(null)
  const [storeOffen, setStoreOffen] = useState<StoreOffen[] | null>(null)

  const statusLaden = useCallback(async () => {
    const antwort = await fetch('/api/sync/status')
    if (antwort.ok) setStatus((await antwort.json()) as StatusAntwort)
  }, [])

  const trophaeenStandLaden = useCallback(async () => {
    const antwort = await fetch('/api/sync/trophaeen')
    if (antwort.ok) setTrophaeen((await antwort.json()) as TrophaeenStand)
  }, [])

  const marktStandLaden = useCallback(async () => {
    const antwort = await fetch('/api/sync/markt')
    if (antwort.ok) setMarkt((await antwort.json()) as MarktStand)
  }, [])

  const storeStandLaden = useCallback(async () => {
    const antwort = await fetch('/api/sync/store')
    if (antwort.ok) setStore((await antwort.json()) as StoreStand)
    const offen = await fetch('/api/sync/store/offen')
    if (offen.ok) setStoreOffen(((await offen.json()) as { eintraege: StoreOffen[] }).eintraege)
  }, [])

  useEffect(() => {
    void statusLaden()
    void trophaeenStandLaden()
    void marktStandLaden()
    void storeStandLaden()
  }, [statusLaden, trophaeenStandLaden, marktStandLaden, storeStandLaden])

  /**
   * Normalisierung erneut ausführen – ohne PSN-Zugriff.
   * Nützlich, wenn die Abbildung korrigiert wurde: Die Rohdaten liegen schon.
   */
  async function neuNormalisieren() {
    setMeldung(null)
    setLaeuft(true)
    setFortschritt('Normalisierung wird zurückgesetzt …')
    try {
      const antwort = await fetch('/api/sync/normalize', { method: 'POST' })
      const daten = (await antwort.json()) as { fehler?: string; zurueckgesetzt?: number }
      if (!antwort.ok) {
        setMeldung(daten.fehler ?? 'Zurücksetzen fehlgeschlagen.')
        setFortschritt(null)
        return
      }
      await weiterlaufen(`${daten.zurueckgesetzt} Seiten werden neu ausgewertet …`)
    } finally {
      setLaeuft(false)
    }
  }

  /** Ruft POST /api/sync, solange etwas offen ist. */
  async function weiterlaufen(start: string) {
    setFortschritt(start)
    for (let runde = 0; runde < 100; runde++) {
      const antwort = await fetch('/api/sync', { method: 'POST' })
      const daten = (await antwort.json()) as SyncAntwort

      if (daten.status === 'fehler') {
        setMeldung(daten.meldung ?? 'Der Abruf ist fehlgeschlagen.')
        break
      }
      // Ein Fehlversuch beendet den Lauf nicht mehr (Stufe 18e): Er bleibt
      // offen und wird fortgesetzt. Ohne diesen Zweig endete die Schleife
      // stumm, weil `weiter` dann false ist.
      if (daten.meldung) {
        setMeldung(
          `${daten.meldung} Versuch ${daten.fehlversuche ?? 1} von 3 – der Lauf bleibt offen, „Jetzt abrufen" macht weiter.`,
        )
        break
      }
      setFortschritt(
        daten.phase === 'abruf'
          ? `Abruf: ${daten.offset} von ${daten.titlesSeen ?? '?'} Titeln …`
          : daten.weiter
            ? `Auswertung: noch ${daten.offeneSeiten ?? '?'} Seiten …`
            : `Fertig: ${daten.titlesSeen ?? 0} Titel ausgewertet.` +
              (daten.vorbelegt ? ` ${daten.vorbelegt} Status vorbelegt.` : '') +
              eingereihtText(daten),
      )
      if (!daten.weiter) break
    }
    await statusLaden()
  }

  /**
   * Die Kaufliste von Hand holen (Stufe 18e, 7.7).
   *
   * Der Schritt lief bisher nur wöchentlich im Cron, und als er am
   * 23.09.2026 stumm scheiterte, war er von hier aus nicht anzustoßen.
   * Fünfzehn Seiten à 50 Einträge – dieselbe Schleife wie beim Sync.
   */
  async function kauflisteHolen() {
    setMeldung(null)
    setLaeuft(true)
    setFortschritt('Kaufliste wird abgerufen …')
    let kauf = 0
    let plus = 0
    try {
      for (let runde = 0; runde < 40; runde++) {
        const antwort = await fetch('/api/sync/besitz', { method: 'POST' })
        const daten = (await antwort.json()) as BesitzAntwort
        if (daten.status !== 'erfolg') {
          setMeldung(daten.meldung ?? daten.fehler ?? 'Der Abruf der Kaufliste ist fehlgeschlagen.')
          setFortschritt(null)
          break
        }
        kauf += daten.kauf
        plus += daten.plus
        setFortschritt(
          daten.weiter
            ? `Kaufliste: ${kauf} gekauft, ${plus} über PS Plus erkannt …`
            : `Fertig: ${kauf} gekauft, ${plus} über PS Plus, ${daten.entfallen} nicht mehr im Katalog.` +
              (daten.erledigt ? ` ${daten.erledigt} Einträge erledigt.` : ''),
        )
        if (!daten.weiter) break
      }
      await statusLaden()
    } finally {
      setLaeuft(false)
    }
  }

  /**
   * Einzeltrophäen holen (Stufe 19b, 7.7).
   *
   * Ruft Portionen nach, bis nichts mehr offen ist – 431 Listen sind rund
   * 31 Aufrufe und zusammen etwa vier Minuten. Dass die Oberfläche das
   * treiben muss, ist keine Umständlichkeit: Ein Worker-Aufruf darf
   * höchstens 50 Fremdanfragen machen, und eine Liste kostet zwei bis drei.
   *
   * Bricht ab, sobald eine Portion eine Meldung zurückgibt – bei `429` ist
   * das Sonys Bitte aufzuhören. Was geschrieben wurde, bleibt stehen; der
   * nächste Druck macht dort weiter.
   */
  async function trophaeenHolen() {
    setTrophText('Trophäen werden geholt …')
    setLaeuft(true)
    // `listen` zaehlt, was DIESER Druck geholt hat; `erledigt` kommt vom
    // Server und ist der Stand des ganzen Bestands. Die beiden sind
    // auseinanderzuhalten: Beim ersten Entwurf stand die eine Zahl neben der
    // Gesamtzahl der anderen – nach einem Abbruch begann die Anzeige damit
    // wieder bei null, obwohl schon 168 Listen geholt waren (Rückmeldung des
    // Nutzers vom 01.10.2026).
    let listen = 0
    let trophaeen = 0

    /*
     * Den Bildschirm wach halten, solange es läuft.
     *
     * Der Durchlauf dauert rund vier Minuten, und auf dem Handy sperrt der
     * Bildschirm vorher. Ein Tab im Hintergrund bekommt seine Zeitgeber
     * gedrosselt und laufende Abrufe abgebrochen – genau daran ist der erste
     * Durchlauf am 01.10.2026 bei 126 von 431 Listen stehengeblieben.
     * `wakeLock` gibt es nicht überall; fehlt es, läuft alles wie bisher,
     * nur eben mit dem Risiko.
     */
    let wach: WakeLockSentinel | null = null
    try {
      wach = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      wach = null
    }

    try {
      for (let runde = 0; runde < 150; runde++) {
        /*
         * Jede Portion in ihrem eigenen try.
         *
         * Vorher lag nur ein try um die ganze Schleife, und ein
         * fehlgeschlagener `fetch` sprang heraus: keine Meldung, der
         * Fortschrittstext fror bei der letzten Zahl ein, und der Block
         * darüber zeigte weiter den alten Stand. Von außen sah das aus wie
         * „hängt", obwohl nur die Verbindung weg war (Befund vom 01.10.2026).
         * Jetzt wird ein Netzfehler einmal wiederholt und danach benannt.
         */
        let daten: TrophaeenAntwort
        try {
          daten = await einePortion()
        } catch {
          await new Promise((fertig) => setTimeout(fertig, 1_500))
          try {
            daten = await einePortion()
          } catch {
            setTrophText(
              `Die Verbindung ist abgerissen – ${listen} Listen in diesem Durchlauf geholt. ` +
                'Ein erneuter Druck macht dort weiter.',
            )
            break
          }
        }

        listen += daten.listen
        trophaeen += daten.trophaeen
        // Die Zahl im Block mitziehen, nicht erst am Ende: Sie ist das, was
        // der Nutzer ansieht, und sie stand bisher bis zum Schluss still
        // (Rückmeldung vom 01.10.2026: „geht nur hoch, wenn ich neu lade").
        setTrophaeen((alt) =>
          alt ? { ...alt, offen: daten.offen, gespeichert: alt.gespeichert + daten.trophaeen } : alt,
        )
        setTrophText(
          daten.offen > 0
            ? `${daten.gesamt - daten.offen} von ${daten.gesamt} Listen · ${trophaeen} Trophäen in diesem Durchlauf …`
            : `Fertig: alle ${daten.gesamt} Listen. ${trophaeen} Trophäen in diesem Durchlauf geholt.`,
        )
        if (daten.meldung) {
          /*
           * Bei einem Ratenlimit ist „gleich nochmal" der falsche Rat: Sonys
           * Fenster läuft weiter, und der nächste Druck liefe sofort wieder
           * hinein. Vermutet am 01.10.2026, nachdem der Knopf zweimal
           * hintereinander anhielt – beim zweiten Mal schon nach zwei
           * Portionen, also deutlich früher als beim ersten. Das passt zu
           * einem Fenster, das vom ersten Durchlauf noch offen war. Belegt
           * ist es nicht; die aufgezeichnete Meldung sagt es beim nächsten
           * Mal.
           */
          const limit = daten.meldung.includes('429')
          setTrophText(
            `${daten.meldung} Angehalten bei ${daten.gesamt - daten.offen} von ${daten.gesamt} Listen – ` +
              (limit
                ? 'PlayStation drosselt gerade. Warte ein paar Minuten, dann macht ein erneuter Druck dort weiter.'
                : 'ein erneuter Druck macht dort weiter.'),
          )
          break
        }
        if (daten.offen === 0) break
        // Pause zwischen den Portionen: Die Trophäen-API ist inoffiziell, und
        // 940 Anfragen am Stück wären ein Schwall (Entscheidung des Nutzers
        // vom 01.10.2026).
        await new Promise((fertig) => setTimeout(fertig, 250))
      }
    } finally {
      // Beides gehört hierher und nicht ans Ende des Versuchs: Nach einem
      // Abbruch muss der Block erst recht den echten Stand zeigen.
      await trophaeenStandLaden()
      void wach?.release()
      setLaeuft(false)
    }
  }

  /**
   * Eine Portion holen; wirft bei Netzfehler, Zeitüberschreitung und bei
   * einer Fehlerantwort.
   *
   * **Die Zeitgrenze ist der Kern.** `fetch` wartet von sich aus unbegrenzt,
   * und ein Wiederholen bei *Fehler* hilft nicht gegen eine Anfrage, die
   * schlicht nie antwortet. Genau das ist am 01.10.2026 passiert: Die
   * Portion davor lief sauber durch – der Server hat sie aufgezeichnet –,
   * die nächste Anfrage kam nie zurück, und die Oberfläche wartete still
   * weiter. Für den Nutzer sah es aus, als zähle nichts mehr hoch; in
   * Wahrheit hing die Schleife mitten im Abruf.
   */
  async function einePortion(): Promise<TrophaeenAntwort> {
    const antwort = await fetch('/api/sync/trophaeen', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
    })
    const daten = (await antwort.json()) as TrophaeenAntwort
    if (!antwort.ok) throw new Error(daten.meldung ?? 'Der Abruf der Trophäen ist fehlgeschlagen.')
    return daten
  }

  async function synchronisieren() {
    setMeldung(null)
    setLaeuft(true)
    try {
      await weiterlaufen('Abruf läuft …')
    } finally {
      setLaeuft(false)
    }
  }

  /**
   * Gebrauchtpreise holen (Stufe 20). Zehn Releases je Aufruf, also zwanzig
   * Fremdanfragen – ein Aufruf darf fünfzig machen (15.4). Die Schleife ruft
   * nach, solange `weiter` gesetzt ist; bei rund 370 betroffenen Releases
   * sind das 37 Durchläufe.
   *
   * Die Zeitgrenze steht am `fetch`, nicht nur ein Wiederholen bei Fehler –
   * dieselbe Lehre wie bei den Trophäen am 01.10.2026: Eine Anfrage, die nie
   * antwortet, lässt die Oberfläche sonst still warten.
   */
  async function marktHolen() {
    setMeldung(null)
    setMarktText('Preise werden geholt …')
    setLaeuft(true)
    let geprueft = 0
    let preise = 0
    let discs = 0
    try {
      for (;;) {
        const antwort = await fetch('/api/sync/markt', { method: 'POST', signal: AbortSignal.timeout(60_000) })
        const daten = (await antwort.json()) as MarktAntwort
        if (!antwort.ok) throw new Error(daten.meldung ?? daten.fehler ?? 'Der Abruf der Preise ist fehlgeschlagen.')
        geprueft += daten.geprueft
        preise += daten.mitPreis
        discs += daten.discBelegt
        setMarktText(`${geprueft} Releases geprüft, ${preise} mit Preis, ${discs} Disc-Fassungen belegt – noch ${daten.nochOffen} offen …`)
        if (!daten.weiter || daten.geprueft === 0) break
      }
      setMarktText(`Fertig: ${geprueft} Releases geprüft, ${preise} mit Preis, ${discs} Disc-Fassungen belegt.`)
    } catch (fehler) {
      setMarktText(`Angehalten nach ${geprueft} Releases: ${fehler instanceof Error ? fehler.message : 'unbekannter Fehler'}`)
    } finally {
      setLaeuft(false)
      await marktStandLaden()
    }
  }

  /**
   * Store-Preise holen (Stufe 21). Zehn Releases je Aufruf, höchstens vierzig
   * Fremdanfragen – beim ersten Mal kostet ein Release bis zu vier (Concept
   * und bis zu drei Produktseiten), danach genau eine.
   *
   * Zeitgrenze am `fetch` aus demselben Grund wie oben: Eine Anfrage, die nie
   * antwortet, ließe die Oberfläche still warten.
   */
  async function storeHolen() {
    setMeldung(null)
    setStoreText('Store-Preise werden geholt …')
    setLaeuft(true)
    let geprueft = 0
    let preise = 0
    let angebote = 0
    try {
      for (;;) {
        const antwort = await fetch('/api/sync/store', { method: 'POST', signal: AbortSignal.timeout(60_000) })
        const daten = (await antwort.json()) as StoreAntwort
        if (!antwort.ok) throw new Error(daten.meldung ?? daten.fehler ?? 'Der Abruf der Store-Preise ist fehlgeschlagen.')
        geprueft += daten.geprueft
        preise += daten.mitPreis
        angebote += daten.imAngebot
        setStoreText(`${geprueft} Releases geprüft, ${preise} mit Preis, ${angebote} im Angebot …`)
        if (!daten.weiter || daten.geprueft === 0) break
      }
      setStoreText(`Fertig: ${geprueft} Releases geprüft, ${preise} mit Preis, ${angebote} im Angebot.`)
    } catch (fehler) {
      setStoreText(`Angehalten nach ${geprueft} Releases: ${fehler instanceof Error ? fehler.message : 'unbekannter Fehler'}`)
    } finally {
      setLaeuft(false)
      await storeStandLaden()
    }
  }

  const zugang = status?.zugang

  return (
    <section>
      <ZugangBlock
        zugang={zugang}
        zugaenge={status?.zugaenge ?? []}
        trophaeen={status?.trophaeen}
        neuLaden={statusLaden}
      />

      <h2>Trophäen abrufen</h2>
      <p>
        Der Abruf legt die Antworten zuerst unverändert ab und wertet sie danach aus.
        {status?.trophaeen ? ` Aktuell ${status.trophaeen} Titel ausgewertet.` : ''}
      </p>
      <button type="button" onClick={synchronisieren} disabled={laeuft || !zugang?.eingerichtet}>
        Jetzt abrufen
      </button>{' '}
      <button type="button" onClick={neuNormalisieren} disabled={laeuft}>
        Nur neu auswerten
      </button>
      <p className="zeile">
        „Nur neu auswerten" nutzt die gespeicherten Rohdaten und spricht PlayStation
        nicht an.
      </p>
      {fortschritt && <p>{fortschritt}</p>}
      {status?.letzterLauf && <p>Letzter Lauf: {laufText(status.letzterLauf)}</p>}

      <h2>Automatik</h2>
      <p>
        Der Worker arbeitet in zwei Fenstern, alle fünf Minuten je ein kleiner Schritt. Zwischen 5 und 8 Uhr
        (03:00–05:59 UTC) alles, was PlayStation anspricht: Trophäen, Spielzeiten und einmal wöchentlich die
        Kaufliste. Zwischen 8 und 11 Uhr (06:00–08:59 UTC) die Wartung – erschienene Titel freigeben,
        IGDB-Metadaten und Disc-Fassungen auffrischen, Gebrauchtpreise bei eBay holen, alte PSN-Rohantworten
        wegräumen.
      </p>
      <p>
        Eine gescheiterte Seite wird bis zu dreimal erneut geholt, bevor der Lauf aufgegeben wird; danach ist
        die nächste Nacht wieder dran. Bei abgelaufenem NPSSO ruht der Abruf, bis ein neues eingetragen ist.
      </p>

      <p>
        Letzter automatischer Abruf:{' '}
        {status?.letzterAutomatischerLauf ? laufText(status.letzterAutomatischerLauf) : 'noch keiner'}
      </p>
      <h3>Kaufliste</h3>
      <p>
        Letzter vollständiger Durchlauf: {datumNurTag(status?.besitz?.fertigAm ?? null)}
        {status?.besitz?.fehlerAm ? ` – letzter Fehlversuch: ${datumNurTag(status.besitz.fehlerAm)}` : ''}
        {status?.besitz?.laeuft ? ' – ein Durchlauf ist gerade offen.' : ''}
      </p>
      <button type="button" onClick={kauflisteHolen} disabled={laeuft || !zugang?.eingerichtet}>
        Kaufliste jetzt abrufen
      </button>
      <p className="zeile">
        Sonys Kaufliste sagt, was gekauft und was über PS Plus im Katalog ist. Sie läuft sonst einmal
        wöchentlich mit; der Knopf holt sie sofort.
      </p>
      <h3>Gebrauchtpreise</h3>
      <p className="zeile">
        {markt === null
          ? 'Wird geladen …'
          : !markt.zugangsdaten
            ? 'Keine eBay-Zugangsdaten hinterlegt – Preise bleiben „unbekannt".'
            : `${markt.geprueft} Releases gefragt, ${markt.mitPreis} mit Preis, ${markt.ohneAngebot} ohne jedes Angebot.`}
      </p>
      <button type="button" onClick={marktHolen} disabled={laeuft || !markt?.zugangsdaten}>
        Preise jetzt holen
      </button>
      {marktText && (
        <p className="zeile" role="status">
          {marktText}
        </p>
      )}
      <p className="zeile">
        Gesucht wird bei eBay – zuerst bei rebuy und medimops, dann im breiten Gebrauchtmarkt. Die Zahl ist
        eine Forderung bei einem Anbieter, kein Wert. Findet die Suche in der Plattform-Kategorie gar nichts,
        steht das in der Lückenansicht als Hinweis auf eine reine Download-Fassung; ob es die Disc gibt,
        entscheidest weiter nur du. Der Schritt läuft sonst nachts in der Wartung mit, zehn Releases je Aufruf.
      </p>
      <h3>Store-Preise</h3>
      <p className="zeile">
        {store === null
          ? 'Wird geladen …'
          : `${store.geprueft} Releases gefragt, ${store.mitPreis} mit Preis, ${store.imAngebot} im Angebot, ` +
            `${store.imPlusKatalog} im PS Plus-Katalog.`}
      </p>
      <button type="button" onClick={storeHolen} disabled={laeuft}>
        Store-Preise jetzt holen
      </button>
      {storeText && (
        <p className="zeile" role="status">
          {storeText}
        </p>
      )}
      <p className="zeile">
        Gefragt wird der PlayStation Store, und zwar nur für offene Wünsche, die Kaufliste und Titel ohne
        Disc-Fassung – nicht für die ganze Sammlung. Genommen wird der Kaufpreis, nie der Preis eines
        Probespiels oder eines Abos; liegt ein Titel im PS Plus-Katalog, steht das daneben. Zugangsdaten
        braucht es nicht. Der Schritt läuft sonst nachts im PSN-Fenster mit, zehn Releases je Aufruf.
      </p>
      {storeOffen !== null && storeOffen.length > 0 && (
        <StoreNachpflege eintraege={storeOffen} laeuft={laeuft} onFertig={storeStandLaden} />
      )}
      {store !== null && store.ohneWebstore > 0 && (
        <p className="zeile still">
          Dazu {store.ohneWebstore} PS3- und Vita-Releases, für die der Web-Store keine Seiten mehr führt – sie werden gar
          nicht erst gefragt.
        </p>
      )}
      <h3>Einzeltrophäen</h3>
      <p className="zeile">
        {trophaeen === null
          ? 'Wird geladen …'
          : trophaeen.offen === 0
            ? `Vollständig: ${trophaeen.gespeichert} Trophäen aus ${trophaeen.gesamt} Listen.`
            : `${trophaeen.gesamt - trophaeen.offen} von ${trophaeen.gesamt} Listen geholt, ${trophaeen.gespeichert} Trophäen.`}
        {trophaeen?.level ? ` Trophäen-Level ${trophaeen.level.level}.` : ''}
      </p>
      <button
        type="button"
        onClick={trophaeenHolen}
        disabled={laeuft || !zugang?.eingerichtet}
      >
        {trophaeen?.offen === 0 ? 'Level und Jahre auffrischen' : 'Trophäen jetzt holen'}
      </button>
      {/*
        Fortschritt und Grund stehen HIER, direkt unter ihrem Knopf.
        Vorher teilten sie sich die Zeilen mit dem Kauflisten-Knopf: der
        Fortschritt stand über dem Block, die Meldung mehrere Bildschirme
        darunter. Am 01.10.2026 blieb der Durchlauf zweimal stehen, und der
        Nutzer konnte beide Male nicht sehen, warum – die Erklärung war da,
        nur nicht dort, wo er hinsah.
      */}
      {trophText && (
        <p className="zeile" role="status">
          {trophText}
        </p>
      )}
      {!trophText && trophaeen?.letzte?.meldung && (
        <p className="zeile">
          Zuletzt angehalten ({datum(trophaeen.letzte.am)}): {trophaeen.letzte.meldung}
        </p>
      )}
      <p className="zeile">
        Holt Name, Beschreibung, Seltenheit und Erspiel-Datum jeder einzelnen Trophäe. Der erste
        Durchlauf dauert rund vier Minuten und lässt sich jederzeit abbrechen – der nächste Druck
        macht dort weiter. Danach hält der Nachtlauf den Bestand selbst aktuell.
      </p>
      <h3>Letzte Cron-Aufrufe</h3>
      {status && status.cronVerlauf.length === 0 ? (
        <p className="zeile">Noch keiner vermerkt.</p>
      ) : (
        <ul className="cron-verlauf">
          {status?.cronVerlauf.map((zeile) => (
            <li key={zeile}>{zeile}</li>
          ))}
        </ul>
      )}
      <p className="zeile">
        Aufeinanderfolgende Aufrufe derselben Arbeit stehen als eine Zeile da („sync ×5
        offset=100→400"), damit eine ganze Nacht in den Verlauf passt. Bewegt sich die Zahl dabei nicht,
        ist der Schritt hängengeblieben. Zeilen mit einer Meldung werden nie zusammengefasst.
      </p>

      {meldung && <p role="status">{meldung}</p>}
    </section>
  )
}


/**
 * Nachpflege fehlender Store-Zuordnungen (Stufe 21d).
 *
 * Warum es diese Liste gibt: Die Store-Id kommt von IGDB, und für manche
 * Spiele hat dort niemand den PlayStation-Store-Eintrag hinterlegt – gemessen
 * am 03.10.2026 für 9 von 79 Releases. Verhindern lässt sich das nicht, die
 * Lücke sitzt in fremden Daten. Was sich bauen lässt, ist, dass sie nicht
 * still bleibt: Der Zähler steht an der Glocke, und hier steht die Arbeit.
 *
 * Eingefügt wird die aus dem Browser kopierte Adresse. Eine **Produkt**-Adresse
 * gilt für dieses Release, eine **Concept**-Adresse für das ganze Spiel – bei
 * einem Cross-Gen-Titel also für beide Fassungen auf einmal.
 *
 * Gespeichert wird und der Preis kommt im selben Aufruf: Ohne das stünde die
 * Zeile bis zum nächsten Morgen stumm da, weil die Tagesfrist greift.
 */
function StoreNachpflege({
  eintraege,
  laeuft,
  onFertig,
}: {
  eintraege: StoreOffen[]
  laeuft: boolean
  onFertig: () => Promise<void>
}) {
  const [werte, setWerte] = useState<Record<number, string>>({})
  const [aktiv, setAktiv] = useState<number | null>(null)
  const [meldungen, setMeldungen] = useState<Record<number, string>>({})

  async function eintragen(e: StoreOffen) {
    const adresse = (werte[e.releaseId] ?? '').trim()
    if (adresse === '') return
    setAktiv(e.releaseId)
    try {
      const antwort = await fetch(`/api/sync/store/${e.releaseId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adresse }),
        signal: AbortSignal.timeout(30_000),
      })
      const daten = (await antwort.json()) as StoreAntwort & { fehler?: string }
      if (!antwort.ok) throw new Error(daten.fehler ?? 'Das hat nicht geklappt.')
      setMeldungen((m) => ({
        ...m,
        [e.releaseId]: daten.mitPreis > 0 ? 'Preis geholt.' : 'Gespeichert, aber der Store nennt dazu keinen Kaufpreis.',
      }))
      if (daten.mitPreis > 0) await onFertig()
    } catch (fehler) {
      setMeldungen((m) => ({ ...m, [e.releaseId]: fehler instanceof Error ? fehler.message : 'Unbekannter Fehler' }))
    } finally {
      setAktiv(null)
    }
  }

  return (
    <div className="nachpflege">
      <p className="zeile">
        <strong>{eintraege.length}</strong> {eintraege.length === 1 ? 'Eintrag hat' : 'Einträge haben'} keinen
        Store-Eintrag bei IGDB. Öffne das Spiel im PlayStation Store, kopiere die Adresse aus der Adresszeile und füge
        sie hier ein – eine Produktseite gilt für dieses Release, eine Concept-Seite für beide Plattformen.
      </p>
      {eintraege.map((e) => (
        <div key={e.releaseId} className="nachpflegezeile">
          <span className="nachpflegetitel">
            {e.titel} <span className="still">· {e.plattform}</span>
          </span>
          <input
            type="url"
            inputMode="url"
            placeholder="Store-Adresse einfügen"
            value={werte[e.releaseId] ?? ''}
            onChange={(ev) => setWerte((w) => ({ ...w, [e.releaseId]: ev.target.value }))}
            disabled={laeuft || aktiv !== null}
            aria-label={`Store-Adresse für ${e.titel}`}
          />
          <button
            type="button"
            onClick={() => void eintragen(e)}
            disabled={laeuft || aktiv !== null || (werte[e.releaseId] ?? '').trim() === ''}
          >
            {aktiv === e.releaseId ? 'läuft …' : 'eintragen'}
          </button>
          {meldungen[e.releaseId] && (
            <span className="zeile still" role="status">
              {meldungen[e.releaseId]}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
