import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QUELLETEXT, anfrage, kurzesDatum } from './api'

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
 */

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
	const [zeilen, setZeilen] = useState<FeedZeile[] | null>(null)
	const [meldung, setMeldung] = useState('')

	useEffect(() => {
		anfrage<FeedAntwort>('/api/feed')
			.then((s) => setZeilen(s.zeilen))
			.catch((f) => setMeldung(f instanceof Error ? f.message : 'Der Verlauf ließ sich nicht laden.'))
	}, [])

	if (meldung) return null
	if (!zeilen) return null

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
				<div className="feed">
					{zeilen.map((e) => (
						<div key={e.id} className="zeile">
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
