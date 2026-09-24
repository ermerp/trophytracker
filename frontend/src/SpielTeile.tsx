import { Link } from 'react-router-dom'
import { PLATINTEXT, QUELLENTEXT, STATUSTEXT, type Platin, type PlayStatus, type Plattform, type Quelle } from './api'
import { Zeichen } from './Symbole'

/**
 * Die Zeichen, aus denen Kachel und Zeile gebaut sind (Stufe 19).
 *
 * Sammlung und Absichtslisten haben verschiedene Datenformen – ein Spiel mit
 * Releases hier, ein `PlanEintrag` dort – und behalten deshalb ihre eigenen
 * Karten. Die Zeichen darin sind aber dieselben, und sie stehen nur hier.
 *
 * Grundregel für alles Dreiwertige: **vorhanden ist hell, nicht vorhanden ist
 * `--aus`, gar nicht vorgesehen ist nichts.** Ein Strich oder eine Null wäre
 * eine Behauptung (Abschnitt 13).
 */

/** Der Farbtoken eines Zustands; eine fehlende Zeile zählt als „nicht gespielt". */
export const zustandsFarbe = (status: PlayStatus | null) => `var(--st-${status ?? 'nicht_gespielt'})`

export function Cover({
	bild,
	cover,
	titel,
	ziel,
	breite,
}: {
	bild: string | null
	/** true: `bild` ist das IGDB-Cover (Hochformat), sonst das Trophäensymbol. */
	cover: boolean
	titel: string
	ziel?: string
	/** Feste Breite in Pixeln (Zeile); ohne sie füllt das Cover seine Spalte (Kachel). */
	breite?: number
}) {
	const inhalt = bild ? (
		<img src={bild} alt="" loading="lazy" className={cover ? 'fuellend' : undefined} />
	) : (
		<span aria-hidden="true">{titel.slice(0, 1)}</span>
	)
	// Das Hochformat kommt aus `aspect-ratio`, damit beide Fälle dieselbe Form
	// haben und ein fehlendes Cover keine andere Kachelhöhe erzeugt.
	const stil = breite ? { width: breite } : undefined
	const klasse = breite ? 'deckel fest' : 'deckel'
	return ziel ? (
		<Link to={ziel} className={klasse} style={stil}>
			{inhalt}
		</Link>
	) : (
		<span className={klasse} style={stil}>
			{inhalt}
		</span>
	)
}

/** „PS4" in Versalien und Plattformfarbe. Text, kein Logo (Abschnitt 13). */
export function PlattformChip({ plattform }: { plattform: Plattform | string }) {
	const token = plattform.toLowerCase()
	return (
		<span className="plattform" style={{ color: `var(--${token}, var(--text-leise))` }}>
			{plattform === 'PSVITA' ? 'VITA' : plattform}
		</span>
	)
}

/**
 * Der Fortschrittsbalken trägt die Zustandsfarbe: Ein Element leistet damit
 * beides, statt die Kachel zusätzlich einzufärben. Ohne Trophäenliste gibt es
 * ihn nicht – 0 % und „keine Liste" sind verschiedene Aussagen.
 */
export function Fortschritt({ pct, status, duenn }: { pct: number | null; status: PlayStatus | null; duenn?: boolean }) {
	if (pct === null) return null
	return (
		<div className={duenn ? 'balken duenn' : 'balken'}>
			<div style={{ width: `${pct}%`, background: zustandsFarbe(status) }} />
		</div>
	)
}

/** Tabellenziffern, bei 100 % in Gold. `null` heißt „keine Trophäenliste". */
export function Prozent({ pct }: { pct: number | null }) {
	if (pct === null) return <span className="prozent leer">keine Liste</span>
	return <span className={pct === 100 ? 'prozent voll' : 'prozent'}>{pct}&thinsp;%</span>
}

/**
 * Dreiwertig, wie die Daten (93 von 431 Titeln haben gar keine Platin-Trophäe):
 * gefüllt = erspielt, Umriss im `--aus`-Ton = offen, **nichts** = nicht
 * vorgesehen.
 */
export function PlatinZeichen({ platin, groesse = 15 }: { platin: Platin | null; groesse?: number }) {
	if (platin === null || platin === 'nicht_verfuegbar') return null
	const erspielt = platin === 'erspielt'
	return (
		<span
			className="zeichen"
			title={PLATINTEXT[platin]}
			style={{ color: erspielt ? 'var(--gold)' : 'var(--aus)' }}
		>
			<Zeichen name="pokal" groesse={groesse} gefuellt={erspielt} strich={1.5} />
		</span>
	)
}

/**
 * Disc und digitale Berechtigung.
 *
 * Ein gekaufter Download ist die Wolke, PS Plus ein Kreuz (Wunsch des Nutzers
 * vom 23.09.2026). Liegt beides vor, gewinnt der Kauf – dieselbe Regel wie im
 * Datenmodell (7.7). Was fehlt, steht im `--aus`-Ton da statt zu verschwinden:
 * „keine Disc" ist eine Aussage, „nichts" wäre keine.
 */
export function BesitzZeichen({
	disc,
	digital,
	groesse = 15,
}: {
	disc: boolean
	digital: readonly Quelle[]
	groesse?: number
}) {
	const gekauft = digital.find((q) => q !== 'plus')
	const nurPlus = !gekauft && digital.includes('plus')
	return (
		<>
			<span
				className="zeichen"
				title={disc ? 'Disc im Regal' : 'keine Disc'}
				style={{ color: disc ? 'var(--text-leise)' : 'var(--aus)' }}
			>
				<Zeichen name="disc" groesse={groesse} strich={1.5} />
			</span>
			<span
				className="zeichen"
				title={
					nurPlus
						? 'über PS Plus'
						: gekauft
							? QUELLENTEXT[gekauft]
							: 'nichts digital'
				}
				style={{ color: digital.length > 0 ? 'var(--text-leise)' : 'var(--aus)' }}
			>
				<Zeichen name={nurPlus ? 'psplus' : 'wolke'} groesse={groesse} strich={1.5} />
			</span>
		</>
	)
}

/**
 * Zustand als Punkt **und** Wort (Entscheidung des Nutzers vom 23.09.2026):
 * Der Punkt lässt die Liste überfliegen, das Wort macht ihn eindeutig.
 */
export function ZustandsZeile({ status, klein }: { status: PlayStatus | null; klein?: boolean }) {
	return (
		<span className={klein ? 'zustand klein' : 'zustand'}>
			<span className="punkt" style={{ background: zustandsFarbe(status) }} />
			{status ? STATUSTEXT[status] : 'kein Status'}
		</span>
	)
}
