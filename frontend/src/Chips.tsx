import { useSearchParams } from 'react-router-dom'
import { Zeichen } from './Symbole'

/**
 * Die Filterleiste als Chips (Stufe 19).
 *
 * Bis hierher gab es zwei Gestalten für dieselbe Aufgabe: Dropdowns in der
 * Sammlung, Kästchen in den Absichtslisten. Jetzt eine – eine waagerecht
 * scrollbare Reihe, in der ein Tipp den Filter setzt und ein zweiter ihn
 * wieder wegnimmt. Wunsch des Nutzers vom 22.09.2026: „PS4 oder PS5 oder Disc,
 * dann würden alle PS4- und PS5-Spiele angezeigt, die ich als Disc habe."
 *
 * Gesetzte Chips stehen **vorn** und in Gold mit Kreuz, damit ein aktiver
 * Filter nie aus dem sichtbaren Ausschnitt scrollt. Ganz hinten räumt ein
 * Chip alles ab.
 *
 * Das ist reine Oberfläche: Die Parameter sind dieselben, die `/api/games`
 * und `/api/plans` ohnehin kennen. Ein unbekannter Wert wird von den Routen
 * ignoriert, nicht mit 400 beantwortet – ein alter Link zeigt die Liste.
 */

export type ChipGruppe = {
	/** Der Parametername in der URL, etwa `platform` oder `owned`. */
	param: string
	/** Mehrere Werte gleichzeitig, kommagetrennt (Plattformen). */
	mehrfach?: boolean
	werte: ReadonlyArray<readonly [wert: string, text: string]>
}

type Chip = { schluessel: string; text: string; aktiv: boolean; umschalten: () => void }

export function Chips({ gruppen }: { gruppen: readonly ChipGruppe[] }) {
	const [params, setParams] = useSearchParams()

	function setze(param: string, wert: string) {
		const neu = new URLSearchParams(params)
		if (wert) neu.set(param, wert)
		else neu.delete(param)
		// Ein geaenderter Filter macht die Seitenzahl sinnlos.
		neu.delete('offset')
		setParams(neu, { replace: true })
	}

	const chips: Chip[] = []
	for (const gruppe of gruppen) {
		const roh = params.get(gruppe.param) ?? ''
		const gesetzt = gruppe.mehrfach ? new Set(roh.split(',').filter(Boolean)) : new Set(roh ? [roh] : [])
		for (const [wert, text] of gruppe.werte) {
			const aktiv = gesetzt.has(wert)
			chips.push({
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
			})
		}
	}

	// Gesetzte zuerst, sonst in der angegebenen Reihenfolge.
	const geordnet = [...chips].sort((a, b) => Number(b.aktiv) - Number(a.aktiv))
	const etwasAktiv = chips.some((c) => c.aktiv)

	function allesAb() {
		const neu = new URLSearchParams()
		// Sortierung ist kein Filter und bleibt stehen.
		const sort = params.get('sort')
		if (sort) neu.set('sort', sort)
		setParams(neu, { replace: true })
	}

	return (
		<div className="chips" role="group" aria-label="Filter">
			{geordnet.map((c) => (
				<button
					key={c.schluessel}
					type="button"
					className={c.aktiv ? 'chip aktiv' : 'chip'}
					aria-pressed={c.aktiv}
					onClick={c.umschalten}
				>
					{c.text}
					{c.aktiv && <Zeichen name="kreuz" groesse={13} strich={2} />}
				</button>
			))}
			{etwasAktiv && (
				<button type="button" className="chip ab" onClick={allesAb}>
					Filter zurücksetzen
				</button>
			)}
		</div>
	)
}
