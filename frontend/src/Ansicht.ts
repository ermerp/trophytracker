import { useCallback, useState } from 'react'

/**
 * Kacheln oder Zeilen, je Liste getrennt (Stufe 19).
 *
 * Die Wahl liegt im Gerät, nicht am Server (Entscheidung des Nutzers vom
 * 23.09.2026): Auf dem Handy taugt die Zeile, am Schreibtisch die Kachel –
 * das ist eine Eigenschaft des Geräts, keine des Kontos. Kein Serverweg, keine
 * Lesekosten, keine Migration. Derselbe Weg wie die übersprungenen
 * Zuordnungen in `Zuordnung.tsx`.
 *
 * `localStorage` kann werfen (privates Fenster, gesperrte Website-Daten), und
 * ein Fehler beim Merken darf keine Liste unbenutzbar machen – deshalb steht
 * jeder Zugriff in `try`.
 */

export type Ansichtsart = 'kacheln' | 'zeilen'

export type Ansicht = { art: Ansichtsart; umschalten: () => void }

const schluesselVon = (liste: string) => `ansicht:${liste}`

function gelesen(liste: string, standard: Ansichtsart): Ansichtsart {
	try {
		const wert = localStorage.getItem(schluesselVon(liste))
		return wert === 'kacheln' || wert === 'zeilen' ? wert : standard
	} catch {
		return standard
	}
}

export function useAnsicht(liste: string, standard: Ansichtsart = 'kacheln'): Ansicht {
	const [art, setArt] = useState<Ansichtsart>(() => gelesen(liste, standard))

	const umschalten = useCallback(() => {
		setArt((bisher) => {
			const neu: Ansichtsart = bisher === 'kacheln' ? 'zeilen' : 'kacheln'
			try {
				localStorage.setItem(schluesselVon(liste), neu)
			} catch {
				// Gemerkt wird sie dann nicht - umgeschaltet trotzdem.
			}
			return neu
		})
	}, [liste])

	return { art, umschalten }
}
