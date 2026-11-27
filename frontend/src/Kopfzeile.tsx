import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import type { Ansicht } from './Ansicht'
import { SUCH_STATE, nachSuche, ohneSuche, suchSchritt, vonDerSuche } from './suchverlauf'
import { AppSymbol, Zeichen, type ZeichenName } from './Symbole'

/**
 * Die Kopfzeile aller Listenansichten (Stufe 19).
 *
 * Vorher hatte jede Ansicht ihre eigene Überschrift und ihre eigene Suche –
 * die Sammlung ein Dropdown-Band, die Listen eine Kästchenreihe. Hier steht
 * beides einmal: Titel links, rechts Zusatzaktionen, Lupe, Ansichtsumschalter
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
 *
 * **Zurück leert zuerst die Suche** (Stufe f2a): Der erste Begriff legt einen
 * Verlaufseintrag an, jedes weitere Tippen ersetzt ihn, und das Leeren geht
 * zurück, statt einen zweiten gleichen Eintrag anzulegen. Die Entscheidung
 * steht in `suchverlauf.ts`.
 */

/**
 * Eine Zusatzaktion: entweder ein Ziel (Scannen) oder ein Schalter (Formular
 * auf/zu). `offen` sagt beim Schalter, ob sein Formular gerade steht
 * (`aria-expanded`); eine eigene Farbe dafür gibt es nicht.
 */
type Aktion = { name: ZeichenName; text: string; ziel?: string; onClick?: () => void; offen?: boolean }

type Props = {
	titel: string
	/** Name des Suchparameters in der URL; ohne ihn gibt es keine Lupe. */
	sucheParam?: string
	/** Kacheln/Zeilen; ohne ihn gibt es keinen Umschalter (To-Do, seit f2e auch Wunschliste, Kaufliste und Lücken). */
	ansicht?: Ansicht
	/**
	 * Zusätzliche Symbole vor der Lupe, in dieser Reihenfolge – in der Sammlung
	 * „Spiel anlegen" und der Barcode (seit Stufe f2c mehrere).
	 */
	aktionen?: readonly Aktion[]
	/** Das App-Symbol links vom Schriftzug – nur das Dashboard trägt es (Stufe 19a). */
	logo?: boolean
	/**
	 * Ein Zurück-Pfeil links vom Titel – nur das Spieldetail trägt ihn
	 * (Stufe 19c). Es ist die einzige Ansicht, die kein Ort der Leiste ist:
	 * Man kommt aus der Sammlung, der Wunschliste, dem Dashboard oder dem
	 * Scanner, und der Weg zurück ist der, den man gekommen ist.
	 */
	zurueck?: boolean
	/**
	 * Der Titel steht nur als `aria-label` in der Leiste, nicht sichtbar
	 * (Rückmeldung des Nutzers vom 27.09.2026: „nochmal der Name ist
	 * unnötig"). Das Spieldetail trägt den Titel gross im Heldenblock
	 * darunter; zweimal derselbe Name kostete eine Zeile und sagte nichts
	 * Neues. Die Leiste bleibt trotzdem, weil sie klebt: Zurück und das
	 * Punktmenü sollen auch weit unten erreichbar sein.
	 */
	stillerTitel?: boolean
	/** Ein eigenes Element vor dem Zahnrad, etwa die Glocke des Dashboards. */
	zusatz?: React.ReactNode
}

export function Kopfzeile({ titel, sucheParam, ansicht, aktionen = [], logo, zusatz, zurueck, stillerTitel }: Props) {
	const [params, setParams] = useSearchParams()
	const navigate = useNavigate()
	const location = useLocation()
	const gesetzt = sucheParam ? (params.get(sucheParam) ?? '') : ''
	const [offen, setOffen] = useState(gesetzt !== '')
	const [text, setText] = useState(gesetzt)
	const feld = useRef<HTMLInputElement>(null)
	// Der Begriff, den wir zuletzt selbst in die URL geschrieben haben - damit
	// der Effekt auf `gesetzt` die eigene Aenderung von einer fremden (Zurueck,
	// „Filter zuruecksetzen") unterscheidet.
	const geschrieben = useRef<string | null>(null)

	// Zurueck aus der Suche nimmt nur den Begriff weg (Nachtrag f2b-c): Was
	// waehrend der Suche an Filtern und Sortierung gesetzt wurde, kommt per
	// `replace` auf den Eintrag davor. Gemerkt wird je Ansicht - ein Zurueck
	// auf eine andere Route uebernimmt nichts.
	const navigationsart = useNavigationType()
	const suchEintrag = useRef<{ pfad: string; mitnehmen: string } | null>(null)
	useEffect(() => {
		if (!sucheParam) return
		const vorher = suchEintrag.current
		const warSuche = vorher !== null && vorher.pfad === location.pathname
		const uebernehmen = nachSuche(warSuche, location.state, navigationsart === 'POP', vorher?.mitnehmen ?? null, location.search, sucheParam)
		suchEintrag.current = vonDerSuche(location.state) ? { pfad: location.pathname, mitnehmen: ohneSuche(location.search, sucheParam) } : null
		if (uebernehmen !== null) setParams(new URLSearchParams(uebernehmen), { replace: true, state: location.state })
		// Nur bei einem Wechsel des Eintrags; der Rest wird dabei frisch gelesen.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location.key])

	// Entprellen: erst 300 ms nach dem letzten Tastendruck in die URL. Stand
	// vorher in Sammlung.tsx und gilt jetzt fuer alle Listen gleich.
	useEffect(() => {
		if (!sucheParam) return
		const schritt = suchSchritt(gesetzt, text, location.state)
		if (schritt === 'keiner') return
		const t = setTimeout(() => {
			geschrieben.current = text
			if (schritt === 'zurueck') {
				navigate(-1)
				return
			}
			const neu = new URLSearchParams(params)
			if (text) neu.set(sucheParam, text)
			else neu.delete(sucheParam)
			neu.delete('offset')
			if (schritt === 'push') setParams(neu, { state: SUCH_STATE })
			else setParams(neu, { replace: true, state: location.state })
		}, 300)
		return () => clearTimeout(t)
	}, [text, gesetzt, sucheParam, params, setParams, location.state, navigate])

	// Ein Zurueck, ein Wechsel der Ansicht oder „Filter zuruecksetzen" kann den
	// Begriff von aussen aendern - das Feld folgt, statt den alten Stand zu
	// zeigen, und klappt zu, wenn er leer ist. Die eigene Aenderung laesst es
	// stehen: Wer mit dem Kreuz leert, will meist gleich Neues tippen.
	useEffect(() => {
		const eigene = geschrieben.current === gesetzt
		geschrieben.current = null
		if (eigene) return
		setText(gesetzt)
		setOffen(gesetzt !== '')
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
					{zurueck && (
						<button type="button" className="ikone" aria-label="Zurück" title="Zurück" onClick={() => navigate(-1)}>
							<Zeichen name="zurueck" />
						</button>
					)}
					{logo && <AppSymbol />}
					{stillerTitel ? <h1 className="nur-vorlesen">{titel}</h1> : <h1>{titel}</h1>}
					{stillerTitel && <span className="fueller" />}
					{aktionen.map((aktion) =>
						aktion.ziel ? (
							<Link key={aktion.text} to={aktion.ziel} className="ikone" aria-label={aktion.text} title={aktion.text}>
								<Zeichen name={aktion.name} />
							</Link>
						) : (
							<button
								key={aktion.text}
								type="button"
								className="ikone"
								aria-label={aktion.text}
								title={aktion.text}
								aria-expanded={aktion.offen}
								onClick={aktion.onClick}
							>
								<Zeichen name={aktion.name} />
							</button>
						),
					)}
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
					{zusatz}
					<Link to="/einstellungen" className="ikone nur-handy" aria-label="Einstellungen" title="Einstellungen">
						<Zeichen name="zahnrad" />
					</Link>
				</>
			)}
		</header>
	)
}
