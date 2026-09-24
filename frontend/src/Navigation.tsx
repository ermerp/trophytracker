import { NavLink, useLocation } from 'react-router-dom'
import { Zeichen, type ZeichenName } from './Symbole'

/**
 * Hauptnavigation (Abschnitt 13, aufgeräumt in Stufe 19).
 *
 * Bis hierher trug die Leiste **sieben** Einträge mit Text, zuletzt bei
 * 0,6 rem und negativem Buchstabenabstand, damit sie auf 320 px passte – die
 * Spezifikation nannte das selbst eine Notlösung. Jetzt sind es **vier
 * Symbole ohne Text** (Entscheidung des Nutzers vom 23.09.2026):
 *
 * - Kaufliste und Lücken sind Reiter der Wunschliste, wie das Backlog neben
 *   To-Do. Der Leisteneintrag bleibt auf allen dreien markiert.
 * - Scannen ist eine Aktion in der Kopfzeile der Sammlung, kein eigener Ort.
 * - Einstellungen sind das Zahnrad in der Kopfzeile.
 *
 * Am Desktop dieselben Einträge als Seitenleiste – dort **mit** Text und mit
 * den Reitern als Unterpunkten, weil der Platz da ist (Wunsch des Nutzers vom
 * 23.09.2026).
 */

type Eintrag = {
	ziel: string
	name: ZeichenName
	text: string
	/** Pfade, die denselben Eintrag markieren (Reiter derselben Seite). */
	unter: ReadonlyArray<{ ziel: string; text: string }>
}

const EINTRAEGE: readonly Eintrag[] = [
	{ ziel: '/start', name: 'haus', text: 'Start', unter: [] },
	{ ziel: '/sammlung', name: 'raster', text: 'Sammlung', unter: [] },
	{
		ziel: '/wunschliste',
		name: 'stern',
		text: 'Wunschliste',
		unter: [
			{ ziel: '/kaufliste', text: 'Kaufliste' },
			{ ziel: '/luecken', text: 'Lücken' },
		],
	},
	{ ziel: '/todo', name: 'haken', text: 'To-Do', unter: [{ ziel: '/backlog', text: 'Backlog' }] },
]

export function Navigation() {
	const { pathname } = useLocation()

	return (
		<nav className="nav" aria-label="Hauptnavigation">
			{EINTRAEGE.map((e) => {
				const aktiv = pathname === e.ziel || e.unter.some((u) => u.ziel === pathname)
				return (
					<div key={e.ziel} className="nav-gruppe">
						<NavLink to={e.ziel} aria-label={e.text} title={e.text} className={aktiv ? 'nav-haupt active' : 'nav-haupt'}>
							<Zeichen name={e.name} groesse={24} strich={1.8} />
							<span className="nav-text">{e.text}</span>
							<span className="nav-punkt" aria-hidden="true" />
						</NavLink>
						{e.unter.map((u) => (
							<NavLink key={u.ziel} to={u.ziel} className="nav-unter">
								{u.text}
							</NavLink>
						))}
					</div>
				)
			})}
			{/* Nur am Desktop: auf dem Handy sitzen die Einstellungen in der Kopfzeile. */}
			<NavLink to="/einstellungen" className="nav-unten">
				<Zeichen name="zahnrad" groesse={22} strich={1.8} />
				<span>Einstellungen</span>
			</NavLink>
		</nav>
	)
}
