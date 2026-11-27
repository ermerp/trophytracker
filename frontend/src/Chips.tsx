import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import { nachTafel, schliessSchritt, stateNachFilter, stateZumOeffnen, tafelOffen } from './filterverlauf'
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
 * **Eine Zeile mit der Sortierung, seit Stufe f2b.** Rechts in derselben
 * Zeile steht, was die Ansicht als `rechts` hereinreicht – die Sortierleiste.
 * Sie stand vorher im Listenkopf unter den Chips und fehlte damit bei leerer
 * Trefferliste. Die gesetzten Filter stehen am Desktop zwischen „Filter" und
 * Sortierung und brechen um, bevor sie die Sortierung erreichen; auf dem
 * Handy beginnen sie sofort eine zweite Zeile (Wunsch des Nutzers). Die
 * Leiste scrollt nicht mehr waagerecht: Das schnitt die Pillen am rechten
 * Rand ab und hätte auch das Sortiermenü abgeschnitten.
 *
 * Das ist reine Oberfläche: Die Parameter sind dieselben, die `/api/games`
 * und `/api/plans` ohnehin kennen. Ein unbekannter Wert wird von den Routen
 * ignoriert, nicht mit 400 beantwortet – ein alter Link zeigt die Liste.
 */

export type ChipGruppe = {
	/** Der Parametername in der URL, etwa `platform` oder `owned`. */
	param: string
	/**
	 * Überschrift der Gruppe in der Tafel. Folgen zwei Gruppen mit derselben
	 * Überschrift aufeinander, stehen ihre Chips in **einer** Zeile – so teilen
	 * sich Favoriten und Preisfilter „Auswahl", obwohl sie verschiedene
	 * Parameter setzen (Nachtrag f2e-c-b).
	 */
	titel: string
	/** Mehrere Werte gleichzeitig, kommagetrennt (Plattformen). */
	mehrfach?: boolean
	werte: ReadonlyArray<readonly [wert: string, text: string]>
}

type Chip = { schluessel: string; text: string; aktiv: boolean; umschalten: () => void }

export function Chips({ gruppen, rechts }: { gruppen: readonly ChipGruppe[]; rechts?: ReactNode }) {
	const [params, setParams] = useSearchParams()
	const location = useLocation()
	const navigate = useNavigate()
	const navigationsart = useNavigationType()
	// Offen ist die Tafel, wenn der Verlaufseintrag sie traegt - so schliesst
	// Zurueck sie von allein (Stufe f2b, `filterverlauf.ts`).
	const offen = tafelOffen(location.state)
	const warOffen = useRef(false)
	// Was nach dem Schliessen auf dem Eintrag davor gelten soll.
	const mitnehmen = useRef<string | null>(null)

	useEffect(() => {
		const uebernehmen = nachTafel(warOffen.current, location.state, navigationsart === 'POP', mitnehmen.current, location.search)
		warOffen.current = offen
		mitnehmen.current = offen ? location.search : null
		if (uebernehmen !== null) setParams(new URLSearchParams(uebernehmen), { replace: true, state: location.state })
		// Nur bei einem Wechsel des Eintrags; der Rest wird dabei frisch gelesen.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location.key])

	function oeffnen() {
		navigate({ pathname: location.pathname, search: location.search }, { state: stateZumOeffnen(location.state) })
	}

	/** Schliesst die Tafel; `danach` gilt anschliessend auf dem Eintrag davor. */
	function schliessen(danach: string) {
		if (schliessSchritt(location.state) === 'zurueck') {
			mitnehmen.current = danach
			navigate(-1)
		} else {
			setParams(new URLSearchParams(danach), { replace: true })
		}
	}

	function setze(param: string, wert: string) {
		const neu = new URLSearchParams(params)
		if (wert) neu.set(param, wert)
		else neu.delete(param)
		// Ein geaenderter Filter macht die Seitenzahl sinnlos.
		neu.delete('offset')
		setParams(neu, { replace: true, state: stateNachFilter(location.state) })
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

	// Aufeinanderfolgende Gruppen gleicher Überschrift zu einer Zeile der Tafel.
	const zeilen: { titel: string; chips: Chip[] }[] = []
	for (const { gruppe, chips } of nachGruppe) {
		const letzte = zeilen.at(-1)
		if (letzte && letzte.titel === gruppe.titel) letzte.chips.push(...chips)
		else zeilen.push({ titel: gruppe.titel, chips: [...chips] })
	}

	function allesAb() {
		const neu = new URLSearchParams()
		// Sortierung ist kein Filter und bleibt stehen – mit ihrer Richtung.
		for (const p of ['sort', 'richtung']) {
			const wert = params.get(p)
			if (wert) neu.set(p, wert)
		}
		if (offen) schliessen(neu.toString())
		// Die Such-Markierung bleibt, damit Zurueck das Zuruecksetzen mitnimmt (`suchverlauf.ts`).
		else setParams(neu, { replace: true, state: stateNachFilter(location.state) })
	}

	return (
		<div className="filter">
			<div className="filterzeile">
				<button
					type="button"
					className={offen ? 'chip griff offen' : 'chip griff'}
					aria-expanded={offen}
					onClick={() => (offen ? schliessen(params.toString()) : oeffnen())}
				>
					<Zeichen name="filter" groesse={15} />
					Filter
					{aktive.length > 0 && <span className="zahl">{aktive.length}</span>}
				</button>

				{aktive.length > 0 && (
					<div className="filtergesetzt">
						{aktive.map((c) => (
							<button key={c.schluessel} type="button" className="chip aktiv" aria-pressed onClick={c.umschalten}>
								{c.text}
								<Zeichen name="kreuz" groesse={13} strich={2} />
							</button>
						))}
						<button type="button" className="chip ab" onClick={allesAb}>
							zurücksetzen
						</button>
					</div>
				)}

				{rechts && <div className="filterrechts">{rechts}</div>}
			</div>

			{offen && (
				<div className="filtertafel">
					{zeilen.map(({ titel, chips }) => (
						<div key={titel} className="filtergruppe">
							<span className="filtername">{titel}</span>
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
