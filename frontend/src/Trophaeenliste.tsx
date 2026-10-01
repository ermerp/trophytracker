import { useState } from 'react'
import { anfrage } from './api'
import { Zeichen } from './Symbole'

/**
 * Die Trophäenliste eines Release (Stufe 19b, Abschnitt 13).
 *
 * An einem Prototyp in vier Runden abgestimmt (01.10.2026). Die tragenden
 * Entscheidungen stehen dort, nicht hier:
 *
 * - **Erspielt ist hell, offen ist dunkel.** Das Symbol trägt den Zustand
 *   ohne ein Wort – dieselbe Regel wie bei Disc und Download. Deshalb braucht
 *   keine Zeile ein Häkchen.
 * - **Platin ist keine Zeile wie die anderen**, sondern trägt einen Streifen
 *   in der Platinfarbe. Im ersten Entwurf stand es als Eintrag 1 von 49 in
 *   der Liste, und erst im Bild war zu sehen, dass das falsch ist.
 * - **Gold bleibt sparsam:** Nur „ultra selten" ist gold.
 * - **Versteckte sind zugedeckt, nicht weggelassen.** Stufe und Seltenheit
 *   bleiben sichtbar – die verraten nichts.
 *
 * Geladen wird erst beim Aufklappen: Eine Liste sind rund 91 gelesene Zeilen,
 * und ein Spieldetail mit drei Releases soll sie nicht alle mitbringen.
 */

type Trophaee = {
  id: number
  stufe: 'platin' | 'gold' | 'silber' | 'bronze'
  name: string
  beschreibung: string | null
  symbol: string | null
  versteckt: boolean
  gruppe: string
  erspielt: boolean
  erspieltAm: string | null
  seltenheit: number | null
  seltenheitStufe: 'ultra_selten' | 'sehr_selten' | 'selten' | 'haeufig' | null
  fortschritt: { stand: number; ziel: number } | null
}

type Antwort = { gruppen: { id: string; name: string }[]; trophaeen: Trophaee[] }

const STUFENTEXT = { platin: 'Platin', gold: 'Gold', silber: 'Silber', bronze: 'Bronze' } as const
const SELTENTEXT = {
  ultra_selten: 'ultra selten',
  sehr_selten: 'sehr selten',
  selten: 'selten',
  haeufig: 'häufig',
} as const

const tag = (wert: string | null) =>
  wert ? new Date(wert).toLocaleDateString('de-DE') : null

export function Trophaeenliste({
  releaseId,
  erspielt: erspieltGesamt,
  definiert,
  children,
}: {
  releaseId: number
  erspielt: number
  definiert: number
  /** Die Stufenzeile – sie steht zwischen Überschrift und Liste und bleibt beim Aufklappen stehen. */
  children: React.ReactNode
}) {
  const [offen, setOffen] = useState(false)
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [filter, setFilter] = useState<'alle' | 'offen' | 'erspielt'>('alle')
  const [alleAuf, setAlleAuf] = useState(false)
  const [aufgedeckt, setAufgedeckt] = useState<number[]>([])

  async function umschalten() {
    if (offen) return setOffen(false)
    setOffen(true)
    if (daten) return
    try {
      setDaten(await anfrage<Antwort>(`/api/releases/${releaseId}/trophaeen`))
    } catch (fehler) {
      setMeldung(fehler instanceof Error ? fehler.message : 'Die Trophäen ließen sich nicht laden.')
    }
  }

  const alle = daten?.trophaeen ?? []
  const erspielt = alle.filter((t) => t.erspielt).length
  const gezeigt = alle.filter((t) =>
    filter === 'alle' ? true : filter === 'offen' ? !t.erspielt : t.erspielt,
  )

  // Nach Gruppen, in der Reihenfolge, die Sony liefert. Ohne DLC ist es eine.
  const gruppen =
    daten && daten.gruppen.length > 0
      ? daten.gruppen
      : [{ id: 'default', name: 'Hauptspiel' }]

  return (
    <div className="trophliste">
      {/*
        Die Überschrift steht ÜBER den Zeichen und nennt die Zahl direkt
        (Rückmeldung des Nutzers vom 01.10.2026) – vorher stand dort
        „anzeigen", und die Zahl erschien erst nach dem Laden. Der Pfeil ist
        derselbe wie überall sonst beim Aufklappen; die Zeichen bleiben beim
        Öffnen stehen, die Liste wächst darunter.
      */}
      <button type="button" className="knopfname blockname" onClick={umschalten} aria-expanded={offen}>
        Trophäen
        <span className="rechts zahl trophzahl">
          {erspieltGesamt} von {definiert}
        </span>
        {/* Derselbe Winkel wie bei den aufklappbaren Blöcken des Dashboards. */}
        <span className={offen ? 'pfeil auf' : 'pfeil'}>
          <Zeichen name="winkel" groesse={14} strich={2.1} />
        </span>
      </button>

      {children}

      {offen && meldung && <p className="still">{meldung}</p>}
      {offen && !daten && !meldung && <p className="still">Wird geladen …</p>}

      {offen && daten && (
        <>
          <div className="trophkopf">
            <div className="chips">
              {(['alle', 'offen', 'erspielt'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`chip ${filter === f ? 'an' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'alle' ? 'Alle' : f === 'offen' ? 'Offen' : 'Erspielt'}{' '}
                  <span className="zahl">
                    {f === 'alle' ? alle.length : f === 'offen' ? alle.length - erspielt : erspielt}
                  </span>
                </button>
              ))}
            </div>
            {alle.some((t) => t.versteckt && !t.erspielt) && (
              <label className="regler">
                <input type="checkbox" checked={alleAuf} onChange={(e) => setAlleAuf(e.target.checked)} />
                <span className="spur" />
                <span>Versteckte aufdecken</span>
              </label>
            )}
          </div>

          {gruppen.map((g) => {
            const drin = gezeigt.filter((t) => t.gruppe === g.id)
            if (drin.length === 0) return null
            const inGruppe = alle.filter((t) => t.gruppe === g.id)
            return (
              <div className="trophgruppe" key={g.id}>
                <div className="gruppenname">
                  {g.name}
                  <span className="linie" />
                  <span className="zahl">
                    {inGruppe.filter((t) => t.erspielt).length}/{inGruppe.length}
                  </span>
                </div>
                <div className="gruppeninhalt">
                  {drin.map((t) => (
                    <Zeile
                      key={t.id}
                      t={t}
                      /*
                       * Zugedeckt bleibt nur, was versteckt UND noch nicht
                       * erspielt ist (Rückmeldung des Nutzers vom 01.10.2026).
                       * Eine versteckte Trophäe, die man hat, ist kein
                       * Geheimnis mehr – sie zuzudecken verschweigt dem Nutzer
                       * seine eigene Leistung.
                       */
                      zu={t.versteckt && !t.erspielt && !alleAuf && !aufgedeckt.includes(t.id)}
                      aufdecken={() => setAufgedeckt((a) => [...a, t.id])}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function Zeile({ t, zu, aufdecken }: { t: Trophaee; zu: boolean; aufdecken: () => void }) {
  const platin = t.stufe === 'platin'
  return (
    <div className={`troph${t.erspielt ? '' : ' offen'}${platin ? ' platin' : ''}${zu ? ' zu' : ''}`}>
      {t.symbol ? <img src={t.symbol} alt="" loading="lazy" /> : <span className="kein-symbol" />}
      <div className="wer">
        {zu ? (
          <div className="trophdeckel">
            <span className="wort">Versteckte Trophäe</span>
            <div>
              <button type="button" className="aufdecken" onClick={aufdecken}>
                aufdecken
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="name">
              {t.name}
              {t.versteckt && <span className="versteckt"> · versteckt</span>}
            </div>
            {t.beschreibung && <div className="was">{t.beschreibung}</div>}
          </>
        )}
        <div className="meta">
          <span className={`stufepunkt s-${t.stufe}`}>
            <i />
            {STUFENTEXT[t.stufe]}
          </span>
          {/* Unbekannt bleibt unbekannt – nie „0 %" (Abschnitt 3). */}
          {t.seltenheit !== null && t.seltenheitStufe && (
            <span className={`selten${t.seltenheitStufe === 'ultra_selten' ? ' ultra' : ''}`}>
              {t.seltenheit.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %
              {' · '}
              {SELTENTEXT[t.seltenheitStufe]}
            </span>
          )}
          {t.erspieltAm && <span>{tag(t.erspieltAm)}</span>}
        </div>
        {/* Den Fortschritt nur, solange er einer ist: Eine erspielte Trophäe
            trägt bei Sony keinen mehr, und „20 von 20" wäre doppelt gemoppelt. */}
        {t.fortschritt && !t.erspielt && (
          <div className="fortschritt">
            <div className="balken">
              <div
                style={{
                  width: `${Math.min(100, (100 * t.fortschritt.stand) / Math.max(1, t.fortschritt.ziel))}%`,
                  background: 'var(--st-am_spielen)',
                }}
              />
            </div>
            <span className="zahl">
              {t.fortschritt.stand} von {t.fortschritt.ziel}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
