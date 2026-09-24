import { useEffect, useState } from 'react'
import { Zeichen } from './Symbole'

/**
 * Zurück nach oben (Stufe 19).
 *
 * Wunsch des Nutzers vom 22.09.2026: „bei Mobile soll es immer einen kleinen
 * Pfeil geben, um jederzeit wieder ganz nach oben zu scrollen." Bei 431 Titeln
 * ist die Sammlung lang genug, dass der Rückweg sonst Arbeit ist.
 *
 * Der Knopf steht im App-Rahmen und gilt damit in jeder Ansicht. Er erscheint
 * erst ab einer Tiefe, in der er gebraucht wird – vorher wäre er nur ein
 * Punkt, der etwas verdeckt.
 */

const AB_TIEFE = 600

export function NachOben() {
	const [sichtbar, setSichtbar] = useState(false)

	useEffect(() => {
		const pruefen = () => setSichtbar(window.scrollY > AB_TIEFE)
		pruefen()
		window.addEventListener('scroll', pruefen, { passive: true })
		return () => window.removeEventListener('scroll', pruefen)
	}, [])

	if (!sichtbar) return null

	return (
		<button
			type="button"
			className="nach-oben"
			aria-label="Nach oben"
			title="Nach oben"
			onClick={() =>
				window.scrollTo({
					top: 0,
					// Wer Bewegung abgestellt hat, bekommt den Sprung.
					behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
				})
			}
		>
			<Zeichen name="hoch" groesse={20} strich={1.9} />
		</button>
	)
}
