import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { QUELLETEXT, anfrage, kurzesDatum } from './api'
import { FEED_DESKTOP, FEED_HANDY, passendeEintraege } from './feedhoehe'

/**
 * „Neu" – der Feed des Dashboards (Stufe 19a, zwei Quellen seit 19b).
 *
 * Gefüllt aus **zwei** Quellen, die der Worker zur Lesezeit nach Zeit mischt:
 * dem Änderungsprotokoll (`game_event`) und den erspielten Einzeltrophäen
 * (`trophy`). Eine erspielte Trophäe ist kein Änderungsereignis – niemand hat
 * etwas geschrieben –, deshalb steht sie nicht im Protokoll, sondern wird
 * direkt gelesen und je Spiel und Tag zu einer Zeile verdichtet („12
 * Trophäen, davon 1 Gold"). Platin steht immer für sich.
 *
 * Den Satz bildet weiterhin der Worker (`src/domain/ereignis.ts`), nicht
 * diese Datei: eine Zeile, ein Text, eine Stelle.
 *
 * **Am Desktop so hoch wie die linke Spalte (Stufe f2d).** Ab 64 rem steht
 * der Feed rechts neben den Kennzahlen und endet auf deren Unterkante; die
 * Höhe gibt allein die linke Spalte vor (`dashboard.css`). Gezeigt werden so
 * viele Einträge, wie ganz hineinpassen – die Rechnung steht ohne React in
 * `feedhoehe.ts`. Die übrigen bleiben im DOM, aber unsichtbar
 * (`visibility`, nicht `display`): So lassen sie sich weiter messen, wenn die
 * linke Spalte nachlädt und wächst, und das Ausblenden ändert keine Höhe –
 * die Messung kann sich nicht selbst wieder auslösen. Unter 64 rem steht der
 * Feed unter den Kacheln und zeigt acht Einträge wie bisher, ohne Messung.
 */

/** Ab hier steht der Feed neben den Kennzahlen – dieselbe Grenze wie in `dashboard.css`. */
const NEBENEINANDER = '(min-width: 64rem)'

/** Ob das Fenster gerade breit genug ist; folgt Größenänderungen. */
function useNebeneinander(): boolean {
	const [breit, setBreit] = useState(() => window.matchMedia(NEBENEINANDER).matches)
	useEffect(() => {
		const abfrage = window.matchMedia(NEBENEINANDER)
		const folgen = () => setBreit(abfrage.matches)
		abfrage.addEventListener('change', folgen)
		return () => abfrage.removeEventListener('change', folgen)
	}, [])
	return breit
}

/** Eine Zeile des Feeds, wie der Worker sie liefert. */
type FeedZeile = {
	id: string
	/** Dieselben Quellen wie im Protokoll; eine Trophäe kommt von Sony, also `sync`. */
	quelle: keyof typeof QUELLETEXT
	art: string
	zeitpunkt: string
	titel: string
	spielId: number | null
	text: string
}

type FeedAntwort = { zeilen: FeedZeile[]; trophaeenVollstaendig: boolean }

export function Neu() {
	const breit = useNebeneinander()
	const [zeilen, setZeilen] = useState<FeedZeile[] | null>(null)
	const [meldung, setMeldung] = useState('')
	// Wie viele Einträge ganz passen; `null` heißt „noch nicht gemessen".
	const [passend, setPassend] = useState<number | null>(null)
	const feedRef = useRef<HTMLDivElement>(null)

	// Der Desktop holt so viele, wie die höchste Spalte brauchen kann, das
	// Handy die acht von bisher. Wechselt das Fenster über die Grenze, wird
	// neu geholt – selten, und so bleibt der Aufruf am Handy billig.
	useEffect(() => {
		let aktuell = true
		anfrage<FeedAntwort>(breit ? `/api/feed?anzahl=${FEED_DESKTOP}` : '/api/feed')
			.then((s) => {
				if (aktuell) setZeilen(s.zeilen)
			})
			.catch((f) => {
				if (aktuell) setMeldung(f instanceof Error ? f.message : 'Der Verlauf ließ sich nicht laden.')
			})
		return () => {
			aktuell = false
		}
	}, [breit])

	// Vor dem Malen messen (useLayoutEffect), damit nie ein halber Eintrag
	// aufblitzt. Der ResizeObserver beobachtet den Platz – er ändert sich,
	// wenn die linke Spalte ihre Daten bekommt – und die Einträge selbst,
	// deren Höhe sich mit der Schrift ändert. Das Ausblenden ändert keine
	// dieser Größen, deshalb keine Schleife; ein gleicher Wert rendert nicht neu.
	useLayoutEffect(() => {
		const feed = feedRef.current
		if (!breit || !feed) return
		const messen = () => {
			const hoehen = Array.from(feed.children, (z) => z.getBoundingClientRect().height)
			setPassend(passendeEintraege(hoehen, feed.clientHeight))
		}
		messen()
		const beobachter = new ResizeObserver(messen)
		beobachter.observe(feed)
		for (const z of Array.from(feed.children)) beobachter.observe(z)
		return () => beobachter.disconnect()
	}, [breit, zeilen])

	if (meldung) return null
	if (!zeilen) return null

	// Am Handy die acht, am Desktop alle geholten – sichtbar davon nur, was passt.
	const gezeigt = breit ? zeilen : zeilen.slice(0, FEED_HANDY)
	const sichtbar = breit ? (passend ?? 0) : gezeigt.length

	return (
		<div className="block">
			<div className="blockname">
				Neu
				{zeilen.length > 0 && (
					<span className="rechts">
						<Link to="/aenderungen">alle</Link>
					</span>
				)}
			</div>
			{zeilen.length === 0 ? (
				<p className="ruhig klein">Noch nichts protokolliert.</p>
			) : (
				<div className="feed" ref={feedRef}>
					{gezeigt.map((e, i) => (
						<div key={e.id} className={i < sichtbar ? 'zeile' : 'zeile ueberzaehlig'}>
							<span className={`qpille q-${e.quelle}`}>{QUELLETEXT[e.quelle]}</span>
							<span className="text">
								{e.spielId ? (
									<Link to={`/spiel/${e.spielId}`}>
										<b>{e.titel}</b>
									</Link>
								) : (
									<b>{e.titel}</b>
								)}
								<br />
								{e.text}
							</span>
							<span className="wann">{kurzesDatum(e.zeitpunkt)}</span>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
