import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
	PLATTFORMEN,
	PLAY_STATUS,
	STATUSTEXT,
	anfrage,
	type DiscFassung,
	type Platin,
	type PlayStatus,
	type Plattform,
	type Quelle,
} from './api'
import { useAnsicht } from './Ansicht'
import { Chips, type ChipGruppe } from './Chips'
import { Kopfzeile } from './Kopfzeile'
import { BesitzZeichen, Cover, Fortschritt, PlatinZeichen, PlattformChip, Prozent, ZustandsZeile } from './SpielTeile'
import { SpielAnlegen } from './SpielAnlegen'

/**
 * Sammlung (Use Case 1): Kachelraster oder Zeilen, Filter als Chips.
 *
 * Seit Stufe 19 ist der **Besitz nur noch Anzeige** (Entscheidung des Nutzers
 * vom 23.09.2026). Die Schnellerfassung „+ Disc" / „+ digital" war mit der
 * Klickzahl bei der Ersterfassung des Regals begründet – die ist erledigt,
 * und erfasst wird seither über den Scanner und im Spieldetail. Beide tragen
 * das Erledigen offener Kauf- und Wunscheinträge samt „Rückgängig" schon, es
 * geht also keine Funktion verloren, nur ein Weg.
 *
 * Die Filter liegen weiterhin in der URL, damit „Zurück" aus dem Spieldetail
 * den Stand wiederherstellt.
 */

const SEITE = 50

type Release = {
	id: number
	plattform: Plattform
	discFassung: DiscFassung
	fortschritt: number | null
	platin: Platin | null
	zuletztGespielt: string | null
	status: PlayStatus | null
	exemplare: number
	digital: Array<{ quelle: Quelle; herkunft: 'nutzer' | 'psn' }>
}

type Spiel = {
	id: number
	titel: string
	bild: string | null
	/** true: `bild` ist das IGDB-Cover (Hochformat), sonst das Trophäensymbol. */
	cover: boolean
	kritik: number | null
	zuletztGespielt: string | null
	releases: Release[]
}

type Antwort = { gesamt: number; limit: number; offset: number; spiele: Spiel[] }

const GRUPPEN: readonly ChipGruppe[] = [
	{ param: 'platform', mehrfach: true, werte: PLATTFORMEN.map((p) => [p, p === 'PSVITA' ? 'Vita' : p] as const) },
	{
		param: 'owned',
		werte: [
			['physisch', 'im Regal'],
			['digital', 'digital'],
			['beide', 'beides'],
			['keins', 'nicht im Besitz'],
		],
	},
	{ param: 'playStatus', werte: PLAY_STATUS.map((w) => [w, STATUSTEXT[w]] as const) },
	{
		param: 'platinum',
		werte: [
			['ja', 'Platin'],
			['nein', 'Platin offen'],
			['nichtverfuegbar', 'kein Platin'],
		],
	},
	{
		// Ob es die Disc ueberhaupt gibt - dreiwertig, nie zu ja/nein verkuerzt.
		param: 'physicalAvailable',
		werte: [
			['ja', 'Disc gibt es'],
			['nein', 'Disc gibt es nicht'],
			['unbekannt', 'Disc unbekannt'],
		],
	},
]

const SORTIERTEXT = { titel: 'Titel', zuletzt: 'zuletzt gespielt', spielzeit: 'Spielzeit' } as const

/** Der weiteste Trophäenstand eines Spiels – der Balken am Cover fasst zusammen, die Zeilen darunter nennen jeden einzeln. */
function weitester(releases: readonly Release[]): Release | null {
	let beste: Release | null = null
	for (const r of releases) {
		if (r.fortschritt === null) continue
		if (!beste || r.fortschritt > (beste.fortschritt ?? -1)) beste = r
	}
	return beste
}

export function Sammlung() {
	const [params, setParams] = useSearchParams()
	const [daten, setDaten] = useState<Antwort | null>(null)
	const [laedt, setLaedt] = useState(false)
	const [meldung, setMeldung] = useState<string | null>(null)
	const ansicht = useAnsicht('sammlung')

	const offset = Math.max(0, Number(params.get('offset')) || 0)

	const laden = useCallback(async () => {
		setLaedt(true)
		try {
			const abfrage = new URLSearchParams(params)
			abfrage.set('limit', String(SEITE))
			setDaten(await anfrage<Antwort>(`/api/games?${abfrage}`))
		} catch (f) {
			setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
		} finally {
			setLaedt(false)
		}
	}, [params])

	useEffect(() => {
		void laden()
	}, [laden])

	function setzeParam(name: string, wert: string) {
		const neu = new URLSearchParams(params)
		if (wert) neu.set(name, wert)
		else neu.delete(name)
		if (name !== 'offset') neu.delete('offset')
		setParams(neu, { replace: true })
	}

	const bis = daten ? Math.min(offset + SEITE, daten.gesamt) : 0
	const filterAktiv = [...params.keys()].some((k) => k !== 'offset' && k !== 'sort')

	return (
		<>
			<Kopfzeile
				titel="Sammlung"
				sucheParam="search"
				ansicht={ansicht}
				aktion={{ name: 'barcode', text: 'Regal scannen', ziel: '/scannen' }}
			/>
			<Chips gruppen={GRUPPEN} />

			<div className="seite">
				<SpielAnlegen onAngelegt={laden} />

				{meldung && (
					<p role="alert" className="auffaellig">
						{meldung}
					</p>
				)}

				{!daten ? (
					<p className="ruhig">wird geladen …</p>
				) : daten.gesamt === 0 ? (
					<p className="ruhig">
						{filterAktiv
							? 'Nichts gefunden.'
							: 'Noch keine Spiele. Sie entstehen aus der Zuordnung der Trophäenlisten oder über „Spiel anlegen".'}
					</p>
				) : (
					<>
						<div className="listenkopf">
							<span>
								{offset + 1}–{bis} von {daten.gesamt} Spielen{laedt && ' – lädt …'}
							</span>
							<label>
								<span className="nur-vorlesen">Sortierung</span>
								<select value={params.get('sort') ?? 'titel'} onChange={(e) => setzeParam('sort', e.target.value)}>
									{Object.entries(SORTIERTEXT).map(([wert, text]) => (
										<option key={wert} value={wert}>
											{text}
										</option>
									))}
								</select>
							</label>
						</div>

						<ul className={ansicht.art === 'kacheln' ? 'kacheln' : 'zeilen'}>
							{daten.spiele.map((s) =>
								ansicht.art === 'kacheln' ? (
									<SpielKachel key={s.id} spiel={s} />
								) : (
									<SpielZeile key={s.id} spiel={s} />
								),
							)}
						</ul>

						{daten.gesamt > SEITE && (
							<p className="blaettern">
								<button
									type="button"
									onClick={() => setzeParam('offset', String(Math.max(0, offset - SEITE)))}
									disabled={offset === 0 || laedt}
								>
									Zurück
								</button>{' '}
								<button
									type="button"
									onClick={() => setzeParam('offset', String(offset + SEITE))}
									disabled={bis >= daten.gesamt || laedt}
								>
									Weiter
								</button>
							</p>
						)}
					</>
				)}
			</div>
		</>
	)
}

/** Ein Release in einer Zeile: Plattform, Prozent, Platin, Besitz – und darunter der Zustand. */
function ReleaseZeile({ r }: { r: Release }) {
	return (
		<div className="release">
			<div className="release-daten">
				<PlattformChip plattform={r.plattform} />
				<Prozent pct={r.fortschritt} />
				<PlatinZeichen platin={r.platin} />
				<span className="fueller" />
				<BesitzZeichen disc={r.exemplare > 0} digital={r.digital.map((d) => d.quelle)} />
			</div>
			<ZustandsZeile status={r.status} klein />
		</div>
	)
}

function SpielKachel({ spiel }: { spiel: Spiel }) {
	const beste = weitester(spiel.releases)
	return (
		<li className="kachel">
			<div className="kachel-bild">
				<Cover bild={spiel.bild} cover={spiel.cover} titel={spiel.titel} ziel={`/spiel/${spiel.id}`} />
				<Fortschritt pct={beste?.fortschritt ?? null} status={beste?.status ?? null} />
			</div>
			<Link to={`/spiel/${spiel.id}`} className="titel">
				{spiel.titel}
			</Link>
			{spiel.releases.map((r) => (
				<ReleaseZeile key={r.id} r={r} />
			))}
		</li>
	)
}

function SpielZeile({ spiel }: { spiel: Spiel }) {
	return (
		<li className="eintrag">
			<Cover bild={spiel.bild} cover={spiel.cover} titel={spiel.titel} ziel={`/spiel/${spiel.id}`} breite={48} />
			<div className="eintrag-text">
				<Link to={`/spiel/${spiel.id}`} className="titel">
					{spiel.titel}
				</Link>
				{spiel.releases.map((r) => (
					<ReleaseZeile key={r.id} r={r} />
				))}
			</div>
		</li>
	)
}
