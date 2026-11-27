import { Link } from 'react-router-dom'
import { ErscheintBaldLink, Meldungen, PREISLISTE_CHIPS, Reiter, SORTIERBAR, SORTIER_NATUERLICH, type ListenSortierung, usePlanListe } from './Absichten'
import { Chips } from './Chips'
import { Sortierleiste } from './Sortierung'
import { Kopfzeile } from './Kopfzeile'
import { eintraegeText, passtZuPreis } from './preisliste'
import { KopfSatz, PlanPreisZeile, RueckwegZeile, Spaltenkopf, useRueckweg } from './PreisZeile'
import { WUNSCH_REITER } from './Wunschliste'

/**
 * Kaufliste (Use Cases 6 und 10, Stufe 15): sortiert und gefiltert wie die
 * Wunschliste (5.2), jede Zeile mit Herkunft und Preisen.
 *
 * Seit Nachtrag f2e (Entscheidung des Nutzers vom 27.11.2026):
 *
 * - **Nur Zeilen**, wie Wunschliste und Lücken – mit „Disc erfassen" als
 *   Hauptaktion. Das Erfassen erledigt den Eintrag und den Wunsch dazu
 *   (Abschnitt 5), „Rückgängig" öffnet beide wieder. „erledigt" von Hand
 *   gibt es nicht mehr.
 * - **Keine Kandidatenblöcke mehr.** Übernommen wird dort, wo die Kandidaten
 *   stehen – in den Reitern Lücken und Wunschliste, mit „auf die Kaufliste".
 *   Die Route `/api/purchase-candidates` bleibt im Worker; diese Ansicht ruft
 *   sie nicht mehr ab.
 *
 * Gebrauchtpreise sind eine Forderung eines Anbieters, kein Wert; ohne
 * Angebot steht „unbekannt", nie „0".
 */
export function Kaufliste() {
  const liste = usePlanListe('kauf')
  const { daten, nurFavoriten, plattformen, suche, preisFilter, sortierung, richtung, setzeSortierung } = liste
  const weg = useRueckweg(liste.laden, liste.setMeldung)
  // Die Preisfilter wirken im Browser (Nachtrag f2e-c); Kopfzeile und Liste zählen nur, was sichtbar ist.
  const sichtbar = daten?.eintraege.filter((e) => passtZuPreis({ gebrauchtCents: e.preisCents, store: e.store }, preisFilter))

  return (
    <>
      <Kopfzeile titel="Kaufliste" sucheParam="suche" />
      <Reiter eintraege={WUNSCH_REITER} />
      <Chips
        gruppen={PREISLISTE_CHIPS}
        rechts={
          <Sortierleiste
            texte={SORTIERBAR}
            natuerlich={SORTIER_NATUERLICH}
            wert={sortierung as ListenSortierung}
            richtung={richtung}
            waehlen={(w, r) => setzeSortierung(w, r)}
          />
        }
      />

      <div className="seite">
        <Meldungen liste={liste} />
        <RueckwegZeile weg={weg} />

        {!sichtbar ? (
          <p className="ruhig">wird geladen …</p>
        ) : sichtbar.length === 0 ? (
          <p className="ruhig">{nurFavoriten || plattformen.size > 0 || suche || preisFilter.size > 0 ? 'Nichts passt zum Filter.' : 'Die Kaufliste ist leer.'}</p>
        ) : (
          <>
            <div className="listenkopf">
              <KopfSatz anzahl={eintraegeText(sichtbar.length)} teile={['Erfassen einer Disc oder Berechtigung erledigt sie']} />
              <ErscheintBaldLink />
            </div>
            <Spaltenkopf />
            <ul className="preisliste">
              {sichtbar.map((e) => (
                <PlanPreisZeile key={e.id} e={e} liste={liste} weg={weg} />
              ))}
            </ul>
          </>
        )}

        {/* Ohne Zahlen: Sie kämen aus `/api/purchase-candidates`, und genau
            diesen Abruf spart die Ansicht seit f2e. */}
        <p className="kaufverweis">
          Noch nicht auf der Kaufliste? Übernommen wird in den Reitern <Link to="/luecken">Lücken</Link> und{' '}
          <Link to="/wunschliste">Wunschliste</Link>.
        </p>
      </div>
    </>
  )
}
