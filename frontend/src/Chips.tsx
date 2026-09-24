import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Zeichen } from './Symbole'

/**
 * Die Filterleiste (Stufe 19).
 *
 * Bis hierher gab es zwei Gestalten für dieselbe Aufgabe: Dropdowns in der
 * Sammlung, Kästchen in den Absichtslisten. Jetzt eine – ein Tipp setzt den
 * Filter, ein zweiter nimmt ihn weg. Wunsch des Nutzers vom 22.09.2026:
 * „PS4 oder PS5 oder Disc, dann würden alle PS4- und PS5-Spiele angezeigt,
 * die ich als Disc habe."
 *
 * **Zwei Ebenen, seit dem 24.09.2026.** Die erste Fassung legte alle Chips
 * nebeneinander – in der Sammlung waren das 23, und die Rückmeldung war
 * „zu lang". Sichtbar ist jetzt nur, was **gesetzt** ist, davor ein Knopf
 * „Filter" mit der Anzahl. Er klappt eine Tafel auf, in der die Gruppen
 * untereinander stehen, jede mit ihrem Namen. Im Normalfall ist die Leiste
 * damit eine einzige Zeile mit einem Knopf; wer filtert, sieht genau seine
 * Filter und nichts sonst.
 *
 * Das ist reine Oberfläche: Die Parameter sind dieselben, die `/api/games`
 * und `/api/plans` ohnehin kennen. Ein unbekannter Wert wird von den Routen
 * ignoriert, nicht mit 400 beantwortet – ein alter Link zeigt die Liste.
 */

export type ChipGruppe = {
	/** Der Parametername in der URL, etwa `platform` oder `owned`. */
	param: string
	/** Überschrift der Gruppe in der Tafel. */
	titel: string
	/** Mehrere Werte gleichzeitig, kommagetrennt (Plattformen). */
	mehrfach?: boolean
	werte: ReadonlyArray<readonly [wert: string, text: string]>
}

type Chip = { schluessel: string; text: string; aktiv: boolean; umschalten: () => void }

export function Chips({ gruppen }: { gruppen: readonly ChipGruppe[] }) {
	const [params, setParams] = useSearchParams()
	const [offen, setOffen] = useState(false)

	function setze(param: string, wert: string) {
		const neu = new URLSearchParams(params)
		if (wert) neu.set(param, wert)
		else neu.delete(param)
		// Ein geaenderter Filter macht die Seitenzahl sinnlos.
		neu.delete('offset')
		setParams(neu, { replace: true })
	}

	const nachGruppe = gruppen.map((gruppe) => {
		const roh = params.get(gruppe.param) ?? ''
		const gesetzt = gruppe.mehrfach ? new Set(roh.split(',').filter(Boolean)) : new Set(roh ? [roh] : [])
		const chips: Chip[] = gruppe.werte.map(([wert, text]) => {
			const aktiv = gesetzt.has(wert)
			return {
				schluessel: `${gruppe.param}:${wert}`,
				text,
				aktiv,
				umschalten: () => {
					if (!gruppe.mehrfach) {
						setze(gruppe.param, aktiv ? '' : wert)
						return
					}
					const neu = new Set(gesetzt)
					if (aktiv) neu.delete(wert)
					else neu.add(wert)
					setze(gruppe.param, [...neu].join(','))
				},
			}
		})
		return { gruppe, chips }
	})

	const aktive = nachGruppe.flatMap(({ chips }) => chips.filter((c) => c.aktiv))

	function allesAb() {
		const neu = new URLSearchParams()
		// Sortierung ist kein Filter und bleibt stehen.
		const sort = params.get('sort')
		if (sort) neu.set('sort', sort)
		setParams(neu, { replace: true })
		setOffen(false)
	}

	return (
		<div className="filter">
			<div className="chips">
				<button
					type="button"
					className={offen ? 'chip griff offen' : 'chip griff'}
					aria-expanded={offen}
					onClick={() => setOffen(!offen)}
				>
					<Zeichen name="filter" groesse={15} />
					Filter
					{aktive.length > 0 && <span className="zahl">{aktive.length}</span>}
				</button>

				{aktive.map((c) => (
					<button key={c.schluessel} type="button" className="chip aktiv" aria-pressed onClick={c.umschalten}>
						{c.text}
						<Zeichen name="kreuz" groesse={13} strich={2} />
					</button>
				))}

				{aktive.length > 0 && (
					<button type="button" className="chip ab" onClick={allesAb}>
						zurücksetzen
					</button>
				)}
			</div>

			{offen && (
				<div className="filtertafel">
					{nachGruppe.map(({ gruppe, chips }) => (
						<div key={gruppe.param} className="filtergruppe">
							<span className="filtername">{gruppe.titel}</span>
							<div className="chips lose">
								{chips.map((c) => (
									<button
										key={c.schluessel}
										type="button"
										className={c.aktiv ? 'chip aktiv' : 'chip'}
										aria-pressed={c.aktiv}
										onClick={c.umschalten}
									>
										{c.text}
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
