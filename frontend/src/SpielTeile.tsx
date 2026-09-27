import { Link } from 'react-router-dom'
import {
	PLATINTEXT,
	QUELLENTEXT,
	STATUSTEXT,
	STUFENTEXT,
	TROPHAEENSTUFEN,
	type Platin,
	type PlayStatus,
	type Plattform,
	type Quelle,
	type TrophaeenStufe,
} from './api'
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

/**
 * „PS4" in Versalien und Plattformfarbe. Text, kein Logo (Abschnitt 13).
 *
 * `gross` ist die Fassung für die Release-Karte des Spieldetails: Dort ist das
 * Kennzeichen die Überschrift der Karte und stand neben zwei Besitzknöpfen zu
 * schwach da (Wunsch des Nutzers vom 27.09.2026). In Kacheln und Zeilen bleibt
 * es klein – da ist es eine Nebenangabe.
 */
export function PlattformChip({ plattform, gross }: { plattform: Plattform | string; gross?: boolean }) {
	const token = plattform.toLowerCase()
	return (
		<span className={gross ? 'plattform gross' : 'plattform'} style={{ color: `var(--${token}, var(--text-leise))` }}>
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

export type Stufenzahlen = { bronze: number; silber: number; gold: number; platin: number }

/**
 * Die vier Trophäenstufen als Pokale in ihren Metalltönen.
 *
 * **Immer absteigend – Platin, Gold, Silber, Bronze** (Regel seit Stufe 19c,
 * Entscheidung des Nutzers vom 27.09.2026). Die Reihenfolge kommt aus
 * `TROPHAEENSTUFEN` und wird nirgends von Hand hingeschrieben: Spieldetail,
 * Prüfliste und die Trophäenliste zählten vorher jede für sich aufwärts,
 * während das Dashboard schon absteigend zählte.
 *
 * Dieselbe Dreiwertigkeit wie beim Platin-Zeichen: Was es **gar nicht gibt**
 * (`definiert === 0`, bei Platin 93 von 431 Titeln), steht nicht als „0/0" da,
 * sondern fehlt.
 *
 * **Die Metallfarbe trägt jeder Pokal, auch ein leerer** (Entscheidung des
 * Nutzers vom 27.09.2026); erspielt oder nicht sagt allein die **Füllung**.
 * Bis dahin nahm ein leerer Pokal den `--aus`-Ton an – und bei BioShock
 * Infinite standen dadurch zwei identisch graue Pokale mit „0/1"
 * nebeneinander, Platin und Gold, nicht zu unterscheiden. Die Stufe ist hier
 * anders als beim Platin-Zeichen der Listen kein Zustand, sondern ein
 * **Zähler**: Welche Stufe gemeint ist, muss lesbar bleiben, auch wenn nichts
 * erspielt ist. Die Füllung leistet die Unterscheidung ohnehin.
 */
export function TrophaeenStufen({
	erspielt,
	definiert,
	groesse = 13,
}: {
	erspielt: Stufenzahlen
	definiert: Stufenzahlen
	groesse?: number
}) {
	return (
		<div className="stufen">
			{TROPHAEENSTUFEN.filter((s) => definiert[s] > 0).map((s: TrophaeenStufe) => {
				const hat = erspielt[s] > 0
				return (
					<span
						key={s}
						className={hat ? 'stufe' : 'stufe leer'}
						title={`${STUFENTEXT[s]}: ${erspielt[s]} von ${definiert[s]}`}
						style={{ color: `var(--troph-${s})` }}
					>
						<Zeichen name="pokal" groesse={groesse} gefuellt={hat} strich={1.5} />
						<b>{erspielt[s]}</b>
						<span className="von">/{definiert[s]}</span>
					</span>
				)
			})}
		</div>
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
