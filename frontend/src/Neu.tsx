import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QUELLETEXT, anfrage, kurzesDatum, type Ereignis, type EreignisSeite } from './api'

/**
 * „Neu" – der Feed des Dashboards (Stufe 19a).
 *
 * Gefüllt aus dem Änderungsprotokoll (`game_event`, Abschnitt 8.5): Jede
 * Zeile trägt ihren Satz schon aus `src/domain/ereignis.ts`, gebildet zur
 * Lesezeit. Es gibt hier also keine eigene Abfrage und keine zweite
 * Satzbildung – nur `GET /api/events` mit kleinem Limit.
 *
 * **Was noch fehlt:** „3 neue Trophäen in Elden Ring" braucht die
 * Einzeltrophäen aus Stufe 19b (7.7). Bis dahin zeigt der Feed, was der
 * Sync ohnehin erkennt und was du selbst erfasst hast. Er steht deshalb an
 * vielen Tagen still – das ist der ehrliche Stand und kein Fehler.
 */

/** Auf dem Handy vier Zeilen, am Desktop füllen mehr die rechte Spalte. */
const ANZAHL = 8

export function Neu() {
	const [ereignisse, setEreignisse] = useState<Ereignis[] | null>(null)
	const [meldung, setMeldung] = useState('')

	useEffect(() => {
		anfrage<EreignisSeite>(`/api/events?limit=${ANZAHL}`)
			.then((s) => setEreignisse(s.ereignisse))
			.catch((f) => setMeldung(f instanceof Error ? f.message : 'Der Verlauf ließ sich nicht laden.'))
	}, [])

	if (meldung) return null
	if (!ereignisse) return null

	return (
		<div className="block">
			<div className="blockname">
				Neu
				{ereignisse.length > 0 && (
					<span className="rechts">
						<Link to="/aenderungen">alle</Link>
					</span>
				)}
			</div>
			{ereignisse.length === 0 ? (
				<p className="ruhig klein">Noch nichts protokolliert.</p>
			) : (
				<div className="feed">
					{ereignisse.map((e) => (
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
