import { useState } from 'react'
import { Link } from 'react-router-dom'
import { type IgdbKandidat } from './api'
import { ErscheintBaldLink, Meldungen, PLAN_CHIPS, Reiter, SORTIERBAR, SORTIER_NATUERLICH, type ListenSortierung, usePlanListe } from './Absichten'
import { Chips } from './Chips'
import { Sortierleiste } from './Sortierung'
import { IgdbSuche } from './IgdbSuche'
import { Kopfzeile } from './Kopfzeile'
import { wunschKopf } from './preisliste'
import { KopfSatz, PlanPreisZeile, RueckwegZeile, Spaltenkopf, useRueckweg } from './PreisZeile'

/**
 * Wunschliste (Use Case 4, ab Stufe 10; Use Case 11 für das Datum).
 *
 * Favoriten zuerst, dann nach Spielerwertung (5.2, seit 20k); alternativ
 * Spieler- oder Kritikerwertung, Titel, Erscheinungsdatum, zuletzt angelegt. Neue Wünsche kommen aus der
 * IGDB-Suche; jeder Treffer trägt sein eigenes Plattform-Dropdown, vorbelegt
 * mit seiner neuesten. Ein Eintrag ohne IGDB-Zuordnung entsteht nur über den
 * ausdrücklichen Knopf (8.2).
 *
 * Seit Stufe 19 ist sie die erste von **drei Reitern** – Kaufliste und Lücken
 * sitzen daneben, wie das Backlog neben To-Do. Damit trägt die untere Leiste
 * vier Symbole statt sieben.
 *
 * Seit Nachtrag f2e nur noch Zeilen mit Gebraucht- und Digitalpreis, ohne
 * Kacheln (Entscheidung des Nutzers vom 27.11.2026, am Prototyp): Hier wird
 * verglichen, und Preise vergleicht man untereinander, nicht in einem Raster.
 */

/** Die drei Reiter dieser Seite (Stufe 19). */
export const WUNSCH_REITER = [
	['/wunschliste', 'Wunschliste', 'stern'],
	['/kaufliste', 'Kaufliste', 'wagen'],
	['/luecken', 'Lücken', 'luecke'],
] as const

export function Wunschliste() {
	const liste = usePlanListe('wunsch')
	const { daten, laeuft, sortierung, richtung, setzeSortierung } = liste
	const weg = useRueckweg(liste.laden, liste.setMeldung)
	const [hinzufuegen, setHinzufuegen] = useState(false)

	async function anlegen(koerper: Record<string, unknown>) {
		weg.setRueckweg(null)
		if (await liste.anlegen(koerper)) setHinzufuegen(false)
	}
	const igdbWaehlen = (k: IgdbKandidat, plattform: string) => anlegen({ igdbId: k.igdbId, plattform })
	// Freitext hat kein Spiel und damit kein Release - die Plattform bleibt weg.
	const ohneTreffer = (begriff: string) => anlegen({ titel: begriff })

	return (
		<>
			<Kopfzeile
				titel="Wunschliste"
				sucheParam="suche"
				aktionen={[{ name: 'plus', text: 'Wunsch hinzufügen', offen: hinzufuegen, onClick: () => setHinzufuegen(!hinzufuegen) }]}
			/>
			<Reiter eintraege={WUNSCH_REITER} />
			<Chips
				gruppen={PLAN_CHIPS}
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
				{hinzufuegen && (
					<section className="anlegen">
						<p className="ruhig klein">
							Bei IGDB suchen und übernehmen. Die Plattform steht an jedem Treffer, vorbelegt mit seiner
							neuesten und vor dem Speichern änderbar. Nur ein Freitext hat kein Spiel und deshalb keine
							Plattform.
						</p>
						<IgdbSuche vorgabe="" onWahl={igdbWaehlen} onOhneTreffer={ohneTreffer} laeuft={laeuft} mitPlattform />
						{/* Der zweite Weg, Wünsche anzulegen – er gehört hinter dasselbe
						    Pluszeichen (Wunsch des Nutzers vom 24.09.2026). */}
						<p className="klein">
							Oder mehrere auf einmal: <Link to="/import">Liste importieren</Link>
						</p>
					</section>
				)}

				<Meldungen liste={liste} />
				<RueckwegZeile weg={weg} />

				{!daten ? (
					<p className="ruhig">wird geladen …</p>
				) : daten.eintraege.length === 0 ? (
					<p className="ruhig">Nichts passt zum Filter.</p>
				) : (
					<>
						<div className="listenkopf">
							<KopfSatz {...wunschKopf(daten.eintraege)} />
							<ErscheintBaldLink />
						</div>
						<Spaltenkopf />
						<ul className="preisliste">
							{daten.eintraege.map((e) => (
								<PlanPreisZeile key={e.id} e={e} liste={liste} weg={weg} />
							))}
						</ul>
					</>
				)}
			</div>
		</>
	)
}
