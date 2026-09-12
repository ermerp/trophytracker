import { useCallback, useEffect, useState } from 'react'

/**
 * Trophäenliste – die erste Ansicht auf echten Daten.
 *
 * Zeigt Fremddaten von Sony. Die eigene Bewertung (`play_status`) kommt in
 * Stufe 6 daneben, nie darin verrechnet.
 */

type Platin = 'erspielt' | 'offen' | 'nicht_verfuegbar'

type Titel = {
  npCommunicationId: string
  titel: string
  plattform: string
  symbol: string | null
  fortschritt: number
  platin: Platin
  erspielt: { bronze: number; silber: number; gold: number; platin: number }
  definiert: { bronze: number; silber: number; gold: number; platin: number }
  zuletztGespielt: string | null
  zugeordnet: boolean
}

type Antwort = {
  gesamt: number
  limit: number
  offset: number
  sortierung: Sortierung
  titel: Titel[]
}

type Sortierung = 'zuletzt' | 'fortschritt' | 'titel'

const SORTIERTEXT: Record<Sortierung, string> = {
  zuletzt: 'zuletzt gespielt',
  fortschritt: 'Fortschritt',
  titel: 'Titel',
}

// Dreiwertig, nicht Boolean: 93 von 431 Titeln haben gar keine Platin-Trophäe.
// "offen" wäre dort schlicht falsch.
const PLATINTEXT: Record<Platin, string> = {
  erspielt: 'Platin',
  offen: 'Platin offen',
  nicht_verfuegbar: 'kein Platin vorgesehen',
}

const SEITE = 50

const datum = (wert: string | null) =>
  wert ? new Date(wert).toLocaleDateString('de-DE') : 'unbekannt'

export function Trophaeen() {
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [sortierung, setSortierung] = useState<Sortierung>('zuletzt')
  const [nurPlatin, setNurPlatin] = useState(false)
  const [offset, setOffset] = useState(0)
  const [laedt, setLaedt] = useState(false)

  const laden = useCallback(async () => {
    setLaedt(true)
    try {
      const abfrage = new URLSearchParams({
        limit: String(SEITE),
        offset: String(offset),
        sortierung,
        nurPlatin: String(nurPlatin),
      })
      const antwort = await fetch(`/api/trophies?${abfrage}`)
      if (antwort.ok) setDaten((await antwort.json()) as Antwort)
    } finally {
      setLaedt(false)
    }
  }, [offset, sortierung, nurPlatin])

  useEffect(() => {
    void laden()
  }, [laden])

  function wechsle(neu: Partial<{ sortierung: Sortierung; nurPlatin: boolean }>) {
    if (neu.sortierung !== undefined) setSortierung(neu.sortierung)
    if (neu.nurPlatin !== undefined) setNurPlatin(neu.nurPlatin)
    setOffset(0)
  }

  if (!daten) return <section><h2>Trophäen</h2><p>wird geladen …</p></section>

  const bis = Math.min(daten.offset + SEITE, daten.gesamt)

  return (
    <section>
      <h2>Trophäen</h2>

      {daten.gesamt === 0 ? (
        <p>
          Noch keine Trophäendaten. In den Einstellungen abrufen – die
          Normalisierung läuft danach von selbst.
        </p>
      ) : (
        <>
          <p className="steuerung">
            <label>
              Sortierung{' '}
              <select
                value={sortierung}
                onChange={(e) => wechsle({ sortierung: e.target.value as Sortierung })}
              >
                {Object.entries(SORTIERTEXT).map(([wert, text]) => (
                  <option key={wert} value={wert}>{text}</option>
                ))}
              </select>
            </label>{' '}
            <label>
              <input
                type="checkbox"
                checked={nurPlatin}
                onChange={(e) => wechsle({ nurPlatin: e.target.checked })}
              />{' '}
              nur mit Platin
            </label>
          </p>

          <p>
            {daten.offset + 1}–{bis} von {daten.gesamt}
            {laedt && ' – lädt …'}
          </p>

          <ul className="trophaeen">
            {daten.titel.map((t) => (
              <li key={t.npCommunicationId}>
                {t.symbol && <img src={t.symbol} alt="" width={56} height={56} loading="lazy" />}
                <div>
                  <strong>{t.titel}</strong>
                  <div className="zeile">
                    {t.plattform} · {t.fortschritt} % ·{' '}
                    <span className={`platin ${t.platin}`}>{PLATINTEXT[t.platin]}</span>
                  </div>
                  <div className="zeile">
                    {t.erspielt.bronze}/{t.definiert.bronze} Bronze ·{' '}
                    {t.erspielt.silber}/{t.definiert.silber} Silber ·{' '}
                    {t.erspielt.gold}/{t.definiert.gold} Gold · zuletzt{' '}
                    {datum(t.zuletztGespielt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <p>
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - SEITE))}
              disabled={offset === 0 || laedt}
            >
              Zurück
            </button>{' '}
            <button
              type="button"
              onClick={() => setOffset(offset + SEITE)}
              disabled={bis >= daten.gesamt || laedt}
            >
              Weiter
            </button>
          </p>
        </>
      )}
    </section>
  )
}
