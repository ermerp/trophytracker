import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { anfrage, euro, type KaufKandidat } from './api'
import { ErscheintBaldLink, Filterleiste, Meldungen, PlanKarte, usePlanListe } from './Absichten'

/**
 * Kaufliste (Use Cases 6 und 10, Stufe 15): sortiert und gefiltert wie die
 * Wunschliste (5.2), jede Kachel mit Herkunft. Darunter die Kandidaten aus
 * v_kaufkandidaten in zwei Blöcken: belegte Lücken ohne Kaufeintrag und
 * offene Wünsche, die noch nicht kopiert wurden (Entscheidung des Nutzers
 * vom 16.09.2026: ein Wunsch kommt als Kopie, der Wunsch bleibt).
 *
 * „physisch nicht gewünscht" bei einer Lücke ist derselbe verworfene
 * Kaufeintrag wie in der Lückenansicht (5.3); er steht unter „auch erledigte
 * und verworfene", „wieder öffnen" macht ihn zum offenen Kauf. „erledigt"
 * erledigt den Wunsch dazu mit; das Erfassen einer Disc oder Berechtigung
 * erledigt beides von selbst (Abschnitt 5). Angekündigte Titel sind keine
 * Kandidaten (8.4). Gebrauchtpreise kommen mit Stufe 18 – bis dahin
 * „unbekannt", nie „0".
 */
type Kandidaten = { anzahl: number; luecken: number; wuensche: number; kandidaten: KaufKandidat[] }

export function Kaufliste() {
  const liste = usePlanListe('kauf')
  const { daten, laeuft, nurFavoriten, plattformen, suche } = liste
  const [kandidaten, setKandidaten] = useState<Kandidaten | null>(null)

  const kandidatenLaden = useCallback(async () => {
    try {
      setKandidaten(await anfrage<Kandidaten>('/api/purchase-candidates'))
    } catch {
      setKandidaten({ anzahl: 0, luecken: 0, wuensche: 0, kandidaten: [] })
    }
  }, [])

  useEffect(() => {
    void kandidatenLaden()
  }, [kandidatenLaden])

  async function uebernehmen(k: KaufKandidat) {
    setVerworfen(null)
    const ziel =
      k.releaseId !== null ? { releaseId: k.releaseId } : k.spielId !== null ? { spielId: k.spielId, plattform: '' } : { titel: k.titel }
    if (await liste.anlegen({ herkunft: k.quelle, favorit: k.favorit, ...ziel })) await kandidatenLaden()
  }

  /** „physisch nicht gewünscht" (5.3): kauf/luecke/verworfen über dieselbe Route wie die Lückenansicht. */
  const [verworfen, setVerworfen] = useState<{ id: number; titel: string } | null>(null)
  async function verwerfen(k: KaufKandidat) {
    if (k.releaseId === null) return
    liste.setLaeuft(true)
    liste.setMeldung(null)
    liste.setEben(null)
    try {
      const a = await anfrage<{ id: number }>(`/api/gaps/${k.releaseId}/verwerfen`, { methode: 'POST' })
      setVerworfen({ id: a.id, titel: k.titel })
      await liste.laden()
      await kandidatenLaden()
    } catch (f) {
      liste.setMeldung(f instanceof Error ? f.message : 'Verwerfen fehlgeschlagen.')
    } finally {
      liste.setLaeuft(false)
    }
  }

  /** Rückgängig bringt den Kandidaten zurück – nach der Übernahme wie nach dem Verwerfen. */
  async function rueckgaengig() {
    await liste.rueckgaengig()
    await kandidatenLaden()
  }
  async function verwerfenRueckgaengig() {
    if (!verworfen) return
    const v = verworfen
    setVerworfen(null)
    try {
      await anfrage(`/api/plans/${v.id}`, { methode: 'DELETE' })
      await liste.laden()
      await kandidatenLaden()
    } catch (f) {
      liste.setMeldung(f instanceof Error ? f.message : 'Rückgängig fehlgeschlagen.')
    }
  }

  const block = (quelle: 'luecke' | 'wunsch') => (kandidaten?.kandidaten ?? []).filter((k) => k.quelle === quelle)

  function zeile(k: KaufKandidat) {
    const ziel = k.spielId !== null ? `/spiel/${k.spielId}` : null
    return (
      <li key={`${k.quelle}-${k.planId ?? k.releaseId}`}>
        {ziel ? (
          <Link to={ziel} className={k.bild ? 'bild cover' : 'bild'}>
            {k.bild ? <img src={k.bild} alt="" loading="lazy" /> : <span aria-hidden="true">{k.titel.slice(0, 1)}</span>}
          </Link>
        ) : (
          <span className="bild" aria-hidden="true">?</span>
        )}
        <div>
          {ziel ? <Link to={ziel} className="titel">{k.titel}</Link> : <span className="titel">{k.titel}</span>}
          <div className="zeile">
            {k.plattform ?? 'ohne Plattform'} · Kritik {k.kritik ?? 'unbekannt'}
            {k.quelle === 'luecke' && ` · Gebraucht ${k.besterGebrauchtpreisCents === null ? 'unbekannt' : euro(k.besterGebrauchtpreisCents)}`}
            {k.favorit && ' · ★'}
          </div>
        </div>
        <div className="knopfzeile">
          <button type="button" className="klein" disabled={laeuft} onClick={() => uebernehmen(k)}>auf die Kaufliste</button>
          {k.quelle === 'luecke' && (
            <button type="button" className="klein" disabled={laeuft} onClick={() => verwerfen(k)}>physisch nicht gewünscht</button>
          )}
        </div>
      </li>
    )
  }

  return (
    <>
      <h1>Kaufliste</h1>
      <p className="zeile">
        Gespeist aus Lücken und Wunschliste. Eine Disc oder Berechtigung zu erfassen erledigt den Eintrag – und den Wunsch dazu.{' '}
        <ErscheintBaldLink />
      </p>

      <Filterleiste liste={liste} />
      <Meldungen liste={{ ...liste, rueckgaengig }} />
      {verworfen && (
        <p role="status" className="hinweis">
          „{verworfen.titel}" als physisch nicht gewünscht verworfen.{' '}
          <button type="button" onClick={verwerfenRueckgaengig}>Rückgängig</button>
        </p>
      )}

      {!daten ? (
        <p>wird geladen …</p>
      ) : daten.eintraege.length === 0 ? (
        <p>{nurFavoriten || plattformen.size > 0 || suche ? 'Nichts passt zum Filter.' : 'Die Kaufliste ist leer.'}</p>
      ) : (
        <>
          <p>{daten.eintraege.length} Einträge</p>
          <ul className="kacheln">
            {daten.eintraege.map((e) => (
              <PlanKarte key={e.id} e={e} liste={liste} />
            ))}
          </ul>
        </>
      )}

      <section className="kandidaten">
        <h2>Kandidaten</h2>
        {!kandidaten ? (
          <p>wird geladen …</p>
        ) : kandidaten.anzahl === 0 ? (
          <p>
            Keine Kandidaten. Lücken entstehen aus digital gespielten Titeln mit belegter Disc-Fassung (<Link to="/luecken">Lücken</Link>), Wünsche auf der{' '}
            <Link to="/wunschliste">Wunschliste</Link>.
          </p>
        ) : (
          <>
            <details open={kandidaten.luecken > 0 && kandidaten.luecken <= 20}>
              <summary>aus Lücken ({kandidaten.luecken})</summary>
              <p className="zeile">
                Digital gespielt, Disc-Fassung belegt, nicht im Regal. „physisch nicht gewünscht" merkt sich die Ablehnung als verworfenen Eintrag – wie in der{' '}
                <Link to="/luecken">Lückenansicht</Link>.
              </p>
              {kandidaten.luecken > 0 && <ul className="kandidatenliste">{block('luecke').map(zeile)}</ul>}
            </details>
            <details open={kandidaten.wuensche > 0 && kandidaten.wuensche <= 20}>
              <summary>aus Wünschen ({kandidaten.wuensche})</summary>
              <p className="zeile">Offene Wünsche, die noch nicht auf der Kaufliste stehen. Die Kopie nimmt den Favorit-Stern mit; der Wunsch bleibt, bis der Kauf erledigt ist.</p>
              {kandidaten.wuensche > 0 && <ul className="kandidatenliste">{block('wunsch').map(zeile)}</ul>}
            </details>
          </>
        )}
      </section>
    </>
  )
}
