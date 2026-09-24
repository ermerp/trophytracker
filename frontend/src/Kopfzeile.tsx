import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Ansicht } from './Ansicht'
import { Zeichen, type ZeichenName } from './Symbole'

/**
 * Die Kopfzeile aller Listenansichten (Stufe 19).
 *
 * Vorher hatte jede Ansicht ihre eigene Überschrift und ihre eigene Suche –
 * die Sammlung ein Dropdown-Band, die Listen eine Kästchenreihe. Hier steht
 * beides einmal: Titel links, rechts Zusatzaktion, Lupe, Ansichtsumschalter
 * und Zahnrad. Nur Symbole; was sie bedeuten, sagt `aria-label`.
 *
 * **Die Suche klappt erst auf Tippen auf** (Rückmeldung des Nutzers vom
 * 22.09.2026: „nimmt immer oben sehr viel Platz weg"). Escape oder ein leeres
 * Verlassen schließt sie wieder; ein gesetzter Suchbegriff hält sie offen und
 * färbt die Lupe, damit ein Filter nie unsichtbar wirkt.
 *
 * Der Suchparameter heißt in der Sammlung `search` und in den Listen `suche` –
 * das sind die Namen der jeweiligen Route, und sie werden hier durchgereicht
 * statt vereinheitlicht: Ein alter Link soll weiter funktionieren.
 */

/** Eine Zusatzaktion: entweder ein Ziel (Scannen) oder ein Schalter (Formular auf/zu). */
type Aktion = { name: ZeichenName; text: string; ziel?: string; onClick?: () => void }

type Props = {
	titel: string
	/** Name des Suchparameters in der URL; ohne ihn gibt es keine Lupe. */
	sucheParam?: string
	/** Kacheln/Zeilen; ohne ihn gibt es keinen Umschalter (To-Do, Lücken). */
	ansicht?: Ansicht
	/** Ein zusätzliches Symbol vor der Lupe, etwa der Barcode in der Sammlung. */
	aktion?: Aktion
}

export function Kopfzeile({ titel, sucheParam, ansicht, aktion }: Props) {
	const [params, setParams] = useSearchParams()
	const gesetzt = sucheParam ? (params.get(sucheParam) ?? '') : ''
	const [offen, setOffen] = useState(gesetzt !== '')
	const [text, setText] = useState(gesetzt)
	const feld = useRef<HTMLInputElement>(null)

	// Entprellen: erst 300 ms nach dem letzten Tastendruck in die URL. Stand
	// vorher in Sammlung.tsx und gilt jetzt fuer alle Listen gleich.
	useEffect(() => {
		if (!sucheParam || text === gesetzt) return
		const t = setTimeout(() => {
			const neu = new URLSearchParams(params)
			if (text) neu.set(sucheParam, text)
			else neu.delete(sucheParam)
			neu.delete('offset')
			setParams(neu, { replace: true })
		}, 300)
		return () => clearTimeout(t)
	}, [text, gesetzt, sucheParam, params, setParams])

	// Ein Wechsel der Ansicht (oder „Filter zuruecksetzen") kann den Begriff
	// von aussen leeren - das Feld folgt, statt den alten Stand zu zeigen.
	useEffect(() => {
		setText(gesetzt)
		if (gesetzt) setOffen(true)
	}, [gesetzt])

	function schliessen() {
		setText('')
		setOffen(false)
	}

	return (
		<header className="kopfzeile">
			{offen && sucheParam ? (
				<>
					<button type="button" className="ikone" aria-label="Suche schließen" onClick={schliessen}>
						<Zeichen name="zurueck" />
					</button>
					<div className="suchfeld">
						<Zeichen name="lupe" groesse={18} />
						<label htmlFor="kopfsuche" className="nur-vorlesen">
							Titel suchen
						</label>
						<input
							id="kopfsuche"
							ref={feld}
							type="search"
							value={text}
							autoFocus
							placeholder="Titel suchen"
							onChange={(e) => setText(e.target.value)}
							onKeyDown={(e) => e.key === 'Escape' && schliessen()}
							// Leer verlassen schliesst; mit Begriff bleibt sie offen.
							onBlur={() => text === '' && setOffen(false)}
						/>
					</div>
					{text !== '' && (
						<button
							type="button"
							className="ikone"
							aria-label="Eingabe löschen"
							onClick={() => {
								setText('')
								feld.current?.focus()
							}}
						>
							<Zeichen name="kreuz" groesse={18} />
						</button>
					)}
				</>
			) : (
				<>
					<h1>{titel}</h1>
					{aktion &&
						(aktion.ziel ? (
							<Link to={aktion.ziel} className="ikone" aria-label={aktion.text} title={aktion.text}>
								<Zeichen name={aktion.name} />
							</Link>
						) : (
							<button type="button" className="ikone" aria-label={aktion.text} title={aktion.text} onClick={aktion.onClick}>
								<Zeichen name={aktion.name} />
							</button>
						))}
					{sucheParam && (
						<button type="button" className="ikone" aria-label="Suchen" onClick={() => setOffen(true)}>
							<Zeichen name="lupe" />
						</button>
					)}
					{ansicht && (
						<button
							type="button"
							className="ikone"
							aria-label={ansicht.art === 'kacheln' ? 'Als Liste zeigen' : 'Als Kacheln zeigen'}
							title={ansicht.art === 'kacheln' ? 'Als Liste zeigen' : 'Als Kacheln zeigen'}
							onClick={ansicht.umschalten}
						>
							<Zeichen name={ansicht.art === 'kacheln' ? 'zeile' : 'raster'} />
						</button>
					)}
					<Link to="/einstellungen" className="ikone nur-handy" aria-label="Einstellungen" title="Einstellungen">
						<Zeichen name="zahnrad" />
					</Link>
				</>
			)}
		</header>
	)
}
