import { useState } from 'react'
import { Link } from 'react-router-dom'
import { type IgdbKandidat } from './api'
import { ErscheintBaldLink, Meldungen, PLAN_CHIPS, PlanKarte, Reiter, SORTIERTEXT, usePlanListe } from './Absichten'
import { useAnsicht } from './Ansicht'
import { Chips } from './Chips'
import { IgdbSuche } from './IgdbSuche'
import { Kopfzeile } from './Kopfzeile'
import { Zeichen } from './Symbole'

/**
 * Wunschliste (Use Case 4, ab Stufe 10; Use Case 11 für das Datum).
 *
 * Favoriten zuerst, dann nach Kritikerwertung (5.2); alternativ Wertung,
 * Titel, Erscheinungsdatum, zuletzt angelegt. Neue Wünsche kommen aus der
 * IGDB-Suche; jeder Treffer trägt sein eigenes Plattform-Dropdown, vorbelegt
 * mit seiner neuesten. Ein Eintrag ohne IGDB-Zuordnung entsteht nur über den
 * ausdrücklichen Knopf (8.2).
 *
 * Seit Stufe 19 ist sie die erste von **drei Reitern** – Kaufliste und Lücken
 * sitzen daneben, wie das Backlog neben To-Do. Damit trägt die untere Leiste
 * vier Symbole statt sieben.
 */

/** Die drei Reiter dieser Seite (Stufe 19). */
export const WUNSCH_REITER = [
	['/wunschliste', 'Wunschliste'],
	['/kaufliste', 'Kaufliste'],
	['/luecken', 'Lücken'],
] as const

export function Wunschliste() {
	const liste = usePlanListe('wunsch')
	const { daten, laeuft, sortierung, setzeParam } = liste
	const ansicht = useAnsicht('wunsch')
	const [hinzufuegen, setHinzufuegen] = useState(false)

	async function anlegen(koerper: Record<string, unknown>) {
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
				ansicht={ansicht}
				aktion={{ name: 'plus', text: 'Wunsch hinzufügen', onClick: () => setHinzufuegen(!hinzufuegen) }}
			/>
			<Reiter eintraege={WUNSCH_REITER} />
			<Chips gruppen={PLAN_CHIPS} />

			<div className="seite">
				{hinzufuegen && (
					<section className="anlegen">
						<p className="ruhig klein">
							Bei IGDB suchen und übernehmen. Die Plattform steht an jedem Treffer, vorbelegt mit seiner neuesten;
							Freitext bleibt immer ohne Plattform.
						</p>
						<IgdbSuche vorgabe="" onWahl={igdbWaehlen} onOhneTreffer={ohneTreffer} laeuft={laeuft} mitPlattform />
					</section>
				)}

				<Meldungen liste={liste} />

				{!daten ? (
					<p className="ruhig">wird geladen …</p>
				) : daten.eintraege.length === 0 ? (
					<p className="ruhig">Nichts passt zum Filter.</p>
				) : (
					<>
						<div className="listenkopf">
							<span>{daten.eintraege.length} Einträge</span>
							<ErscheintBaldLink />
							<Link to="/import" className="ruhig klein">
								Liste importieren
							</Link>
							<label>
								<span className="nur-vorlesen">Sortierung</span>
								<select
									value={sortierung}
									onChange={(e) => setzeParam('sort', e.target.value === 'favorit' ? '' : e.target.value)}
								>
									{Object.entries(SORTIERTEXT)
										.filter(([wert]) => wert !== 'position')
										.map(([wert, text]) => (
											<option key={wert} value={wert}>
												{text}
											</option>
										))}
								</select>
							</label>
						</div>

						<ul className={ansicht.art === 'kacheln' ? 'kacheln' : 'zeilen'}>
							{daten.eintraege.map((e) => (
								<PlanKarte
									key={e.id}
									e={e}
									liste={liste}
									art={ansicht.art}
									knoepfe={
										e.aufKaufliste !== null ? (
											<Link to="/kaufliste" className="ikone" aria-label="steht auf der Kaufliste" title="steht auf der Kaufliste">
												<Zeichen name="umhaengen" groesse={19} gefuellt />
											</Link>
										) : (
											<button
												type="button"
												className="ikone"
												aria-label="Auf die Kaufliste"
												title="Auf die Kaufliste"
												disabled={laeuft}
												onClick={() => liste.aufKaufliste(e)}
											>
												<Zeichen name="umhaengen" groesse={19} />
											</button>
										)
									}
								/>
							))}
						</ul>
					</>
				)}
			</div>
		</>
	)
}
