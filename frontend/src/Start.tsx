import { useEffect, useState } from 'react'
import { Kopfzeile } from './Kopfzeile'
import { Kennzahlen } from './Kennzahlen'
import { Neu } from './Neu'
import { Glocke, Tafel, useOffenePosten, Warnblock } from './Offenes'

/**
 * Das Dashboard (Stufe 19a, Abschnitt 13).
 *
 * Bis Stufe 19 trug diese Seite nur den Hinweisblock und hielt den Platz
 * frei. Jetzt steht hier, was die Spezifikation verlangt: Kennzahlen je
 * Plattform, Platin-Zähler, Backlog-Länge, letzter Sync, die Warnung bei
 * abgelaufenem Zugang und die Prüfliste samt `unentschieden`-Zahl.
 *
 * Zwei Dinge sind dabei entschieden worden (Nutzer, 24.–27.09.2026):
 *
 * - **Warnung und Information sind getrennt.** Gelb erscheint nur, was
 *   stillsteht; alles Zählende liegt hinter der Glocke (`Offenes.tsx`).
 * - **Kein PSN-Abruf.** Die Trophäenzähler je Stufe kommen als Summe über
 *   `trophy_progress`, nicht aus `trophySummary`; das Trophäen-Level wandert
 *   nach Stufe 19b (7.7).
 *
 * Der Aufbau unterscheidet sich zwischen Handy und Desktop nur im Layout,
 * nicht im Verhalten – auch am Desktop liegen die offenen Posten hinter der
 * Glocke, obwohl dort Platz für einen Dauerblock wäre.
 */
export function Start() {
	const { warnungen, posten } = useOffenePosten()
	const [tafel, setTafel] = useState(false)

	// Die Tafel schwebt über der Seite; Escape schliesst sie, wie jedes andere
	// Aufgeklappte in der Anwendung (Suche, Filtertafel).
	useEffect(() => {
		if (!tafel) return
		const zu = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setTafel(false)
		}
		window.addEventListener('keydown', zu)
		return () => window.removeEventListener('keydown', zu)
	}, [tafel])

	return (
		<>
			<Kopfzeile
				titel="Trophytracker"
				logo
				zusatz={
					<Glocke
						warnungen={warnungen.length}
						posten={posten.length}
						offen={tafel}
						umschalten={() => setTafel((o) => !o)}
					/>
				}
			/>
			<div className="seite dashboard">
				{tafel && <Tafel warnungen={warnungen} posten={posten} />}
				<Warnblock warnungen={warnungen} />
				<div className="dspalten">
					<div className="dlinks">
						<Kennzahlen />
					</div>
					<div className="drechts">
						<Neu />
					</div>
				</div>
			</div>
		</>
	)
}
