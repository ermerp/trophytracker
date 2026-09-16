import { useState } from 'react'
import { Link } from 'react-router-dom'
import { type IgdbKandidat } from './api'
import { ErscheintBaldLink, Filterleiste, Meldungen, PlanKarte, usePlanListe } from './Absichten'
import { IgdbSuche } from './IgdbSuche'

/**
 * Wunschliste (Use Case 4, ab Stufe 10; Use Case 11 für das Datum).
 *
 * Favoriten zuerst, dann nach Kritikerwertung (5.2); alternativ Wertung,
 * Titel, Erscheinungsdatum, zuletzt angelegt. Filter: nur Favoriten,
 * Plattformen, „ohne Plattform" – der Filter, mit dem sich Wünsche ohne
 * Plattform nachpflegen lassen (Entscheidung des Nutzers vom 15.09.2026).
 * Neue Wünsche kommen aus der IGDB-Suche; jeder Treffer trägt sein eigenes
 * Plattform-Dropdown, vorbelegt mit seiner neuesten; „ohne Plattform" bleibt
 * wählbar. Ein Eintrag ohne IGDB-Zuordnung entsteht nur über den
 * ausdrücklichen Knopf (8.2). Bei angekündigten Titeln steht das
 * Erscheinungsdatum dort, wo später der Preis steht (8.4). Ein Release nur
 * aus Wunsch zählt nicht zur Sammlung (Abschnitt 3).
 *
 * Kachel, Filter und Schreibzugriffe teilt sie sich seit Stufe 12 mit
 * To-Do und Backlog (Absichten.tsx). „auf die Kaufliste" (Stufe 15) legt
 * eine Kopie an – der Wunsch bleibt, bis der Kauf erledigt ist.
 */
export function Wunschliste() {
  const liste = usePlanListe('wunsch')
  const { daten, laeuft, nurFavoriten, plattformen, suche } = liste
  const [hinzufuegen, setHinzufuegen] = useState(false)

  async function anlegen(koerper: Record<string, unknown>) {
    if (await liste.anlegen(koerper)) setHinzufuegen(false)
  }
  const igdbWaehlen = (k: IgdbKandidat, plattform: string) => anlegen({ igdbId: k.igdbId, plattform })
  // Freitext hat kein Spiel und damit kein Release - die Plattform bleibt weg.
  const ohneTreffer = (begriff: string) => anlegen({ titel: begriff })

  return (
    <>
      <h1>Wunschliste</h1>

      <section className="anlegen">
        <button type="button" onClick={() => setHinzufuegen(!hinzufuegen)} disabled={laeuft}>
          {hinzufuegen ? 'Schließen' : 'Wunsch hinzufügen'}
        </button>{' '}
        <Link to="/import" className="zeile">Liste importieren</Link>{' '}
        <ErscheintBaldLink />
        {hinzufuegen && (
          <>
            <p className="zeile">
              Bei IGDB suchen und übernehmen. Die Plattform steht an jedem Treffer, vorbelegt mit seiner neuesten; Freitext bleibt immer ohne Plattform.
            </p>
            <IgdbSuche vorgabe="" onWahl={igdbWaehlen} onOhneTreffer={ohneTreffer} laeuft={laeuft} mitPlattform />
          </>
        )}
      </section>

      <Filterleiste liste={liste} />
      <Meldungen liste={liste} />

      {!daten ? (
        <p>wird geladen …</p>
      ) : daten.eintraege.length === 0 ? (
        <p>{nurFavoriten || plattformen.size > 0 || suche ? 'Nichts passt zum Filter.' : 'Die Wunschliste ist leer.'}</p>
      ) : (
        <>
          <p>{daten.eintraege.length} Einträge</p>
          <ul className="kacheln">
            {daten.eintraege.map((e) => (
              <PlanKarte
                key={e.id}
                e={e}
                liste={liste}
                knoepfe={
                  e.aufKaufliste !== null ? (
                    <Link to="/kaufliste" className="zeile">auf der Kaufliste</Link>
                  ) : (
                    <button type="button" className="klein" disabled={laeuft} onClick={() => liste.aufKaufliste(e)}>auf die Kaufliste</button>
                  )
                }
              />
            ))}
          </ul>
        </>
      )}
    </>
  )
}
