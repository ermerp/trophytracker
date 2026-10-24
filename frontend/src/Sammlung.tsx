import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigationType, useSearchParams } from 'react-router-dom'
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
import { Sortierleiste, type Richtung } from './Sortierung'
import { BesitzZeichen, Cover, Fortschritt, PlatinZeichen, PlattformChip, Prozent, ZustandsZeile } from './SpielTeile'
import { SpielAnlegen } from './SpielAnlegen'
import { BLOCK, anhaengen, holen, mehrDa, merken, neuholenBloecke, schluessel as schluesselAus, vergessen } from './endlos'

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
 *
 * **Endlos-Scrollen seit Stufe 22** (16-2-endlos-scrollen.md): Kurz vor dem
 * Ende lädt die Liste den nächsten Block nach, statt zu blättern. Ändert sich
 * ein Filter oder die Sortierung, beginnt sie von vorn. Beim „Zurück" aus dem
 * Spieldetail (POP) zeigt sie sofort, was geladen war, an derselben Stelle,
 * und holt den Bereich still neu (`endlos.ts`).
 */

/** Wie früh nachgeladen wird: eine Bildschirmhöhe vor dem Ende. */
const VORLAUF = '0px 0px 100% 0px'

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
	spieler: number | null
	zuletztGespielt: string | null
	releases: Release[]
}

type Antwort = { gesamt: number; limit: number; offset: number; spiele: Spiel[] }
type Liste = { spiele: Spiel[]; gesamt: number }

const GRUPPEN: readonly ChipGruppe[] = [
	{ param: 'platform', titel: 'Plattform', mehrfach: true, werte: PLATTFORMEN.map((p) => [p, p === 'PSVITA' ? 'Vita' : p] as const) },
	{
		param: 'owned',
		titel: 'Besitz',
		werte: [
			['physisch', 'im Regal'],
			['digital', 'digital'],
			['beide', 'beides'],
			['keins', 'nicht im Besitz'],
		],
	},
	{ param: 'playStatus', titel: 'Status', werte: PLAY_STATUS.map((w) => [w, STATUSTEXT[w]] as const) },
	{
		param: 'platinum',
		titel: 'Platin',
		werte: [
			['ja', 'Platin'],
			['nein', 'Platin offen'],
			['nichtverfuegbar', 'kein Platin'],
		],
	},
	{
		// Ob es die Disc ueberhaupt gibt - dreiwertig, nie zu ja/nein verkuerzt.
		param: 'physicalAvailable',
		titel: 'Disc-Fassung',
		werte: [
			['ja', 'Disc gibt es'],
			['nein', 'Disc gibt es nicht'],
			['unbekannt', 'Disc unbekannt'],
		],
	},
]

const SORTIERTEXT = {
	titel: 'Titel',
	zuletzt: 'zuletzt gespielt',
	spielzeit: 'Spielzeit',
	wertung: 'Spielerwertung',
	kritik: 'Kritikerwertung',
	release: 'Erscheinungsdatum',
} as const
type SammlungSortierung = keyof typeof SORTIERTEXT

/**
 * Die natürliche Richtung je Kriterium – beim Titel A–Z, bei allen
 * anderen das Gegenteil (beste Wertung, neuestes Datum zuerst). Steht gleichlautend im Worker (`src/db/games.ts`),
 * weil die Sammlung als einzige Liste in SQL sortiert.
 */
const SAMMLUNG_NATUERLICH: Record<SammlungSortierung, Richtung> = {
	titel: 'auf',
	zuletzt: 'ab',
	spielzeit: 'ab',
	wertung: 'ab',
	kritik: 'ab',
	release: 'ab',
}

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
	const sortierung: SammlungSortierung =
		(params.get('sort') as SammlungSortierung) in SORTIERTEXT ? (params.get('sort') as SammlungSortierung) : 'titel'
	const richtung: Richtung =
		params.get('richtung') === 'ab' || params.get('richtung') === 'auf'
			? (params.get('richtung') as Richtung)
			: SAMMLUNG_NATUERLICH[sortierung]
	const [daten, setDaten] = useState<Liste | null>(null)
	const [laedt, setLaedt] = useState(false)
	const [meldung, setMeldung] = useState<string | null>(null)
	const ansicht = useAnsicht('sammlung')
	const navigation = useNavigationType()

	// Alles außer `offset` bestimmt die Liste; `offset` aus alten Lesezeichen zählt nicht mehr.
	const name = schluesselAus(params)
	const abfrageBasis = useCallback(() => {
		const abfrage = new URLSearchParams(params)
		abfrage.delete('offset')
		return abfrage
	}, [params])

	// Die aktuelle Liste und Höhe für den Zwischenspeicher - als Ref, damit
	// das Aufräumen beim Verlassen den letzten Stand sieht, nicht den beim Anlegen.
	const stand = useRef<{ name: string; daten: Liste | null; scrollY: number }>({ name, daten: null, scrollY: 0 })
	// Welche Liste gerade geladen wird: Eine Antwort für einen alten Filter wird verworfen.
	const aktuell = useRef(name)
	const wiederherstellen = useRef<number | null>(null)

	const block = useCallback(
		async (offset: number, limit: number) => {
			const abfrage = abfrageBasis()
			abfrage.set('limit', String(limit))
			abfrage.set('offset', String(offset))
			return anfrage<Antwort>(`/api/games?${abfrage}`)
		},
		[abfrageBasis],
	)

	/** Von vorn: der erste Block. */
	const neuLaden = useCallback(async () => {
		const fuer = name
		setLaedt(true)
		try {
			const a = await block(0, BLOCK)
			if (aktuell.current === fuer) setDaten({ spiele: a.spiele, gesamt: a.gesamt })
		} catch (f) {
			setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
		} finally {
			if (aktuell.current === fuer) setLaedt(false)
		}
	}, [block, name])

	/** Den geladenen Bereich still neu holen - nach dem Zurückkommen (Entscheidung vom 24.10.2026). */
	const stillNeuHolen = useCallback(
		async (geladen: number) => {
			const fuer = name
			setLaedt(true)
			try {
				let spiele: Spiel[] = []
				let gesamt = 0
				for (const b of neuholenBloecke(geladen)) {
					const a = await block(b.offset, b.limit)
					spiele = anhaengen(spiele, a.spiele)
					gesamt = a.gesamt
					if (a.spiele.length < b.limit) break
				}
				if (aktuell.current === fuer) setDaten({ spiele, gesamt })
			} catch (f) {
				setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
			} finally {
				if (aktuell.current === fuer) setLaedt(false)
			}
		},
		[block, name],
	)

	// Eine neue Filterkombination: aus dem Speicher, wenn es ein "Zurück" ist,
	// sonst von vorn und oben.
	useEffect(() => {
		aktuell.current = name
		setMeldung(null)
		const gemerkt = navigation === 'POP' ? holen<Spiel>(name) : null
		if (gemerkt) {
			setDaten({ spiele: gemerkt.eintraege, gesamt: gemerkt.gesamt })
			wiederherstellen.current = gemerkt.scrollY
			void stillNeuHolen(gemerkt.eintraege.length)
		} else {
			setDaten(null)
			if (stand.current.name !== name) window.scrollTo(0, 0)
			void neuLaden()
		}
		// Nur beim Wechsel der Liste - nicht bei jeder neuen Funktion.
	}, [name])

	// Die Höhe erst setzen, wenn die gemerkten Karten im DOM stehen.
	useLayoutEffect(() => {
		if (wiederherstellen.current === null || !daten) return
		window.scrollTo(0, wiederherstellen.current)
		wiederherstellen.current = null
	}, [daten])

	// Stand mitschreiben und beim Verlassen merken.
	useEffect(() => {
		stand.current = { ...stand.current, name, daten }
	}, [name, daten])
	useEffect(() => {
		const mitschreiben = () => {
			stand.current.scrollY = window.scrollY
		}
		window.addEventListener('scroll', mitschreiben, { passive: true })
		return () => {
			window.removeEventListener('scroll', mitschreiben)
			const { name: n, daten: d, scrollY } = stand.current
			if (d) merken(n, { eintraege: d.spiele, gesamt: d.gesamt, scrollY })
		}
	}, [])

	/** Den nächsten Block anhängen. */
	const nachladen = useCallback(async () => {
		if (laedt || !daten || !mehrDa(daten.spiele.length, daten.gesamt)) return
		const fuer = name
		setLaedt(true)
		try {
			const a = await block(daten.spiele.length, BLOCK)
			if (aktuell.current === fuer) setDaten({ spiele: anhaengen(daten.spiele, a.spiele), gesamt: a.gesamt })
		} catch (f) {
			setMeldung(f instanceof Error ? f.message : 'Laden fehlgeschlagen.')
		} finally {
			if (aktuell.current === fuer) setLaedt(false)
		}
	}, [block, daten, laedt, name])

	// Kurz vor dem Ende nachladen: ein Marker unter der Liste, eine Bildschirmhöhe Vorlauf.
	const marker = useRef<HTMLDivElement | null>(null)
	useEffect(() => {
		const el = marker.current
		if (!el) return
		const beobachter = new IntersectionObserver(
			(e) => {
				if (e.some((x) => x.isIntersecting)) void nachladen()
			},
			{ rootMargin: VORLAUF },
		)
		beobachter.observe(el)
		return () => beobachter.disconnect()
	}, [nachladen])

	function angelegt() {
		vergessen()
		void neuLaden()
	}

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
				<SpielAnlegen onAngelegt={angelegt} />

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
							<span>{daten.gesamt} {daten.gesamt === 1 ? 'Spiel' : 'Spiele'}</span>
							<Sortierleiste
								texte={SORTIERTEXT}
								natuerlich={SAMMLUNG_NATUERLICH}
								wert={sortierung}
								richtung={richtung}
								waehlen={(w, r) => {
									const neu = new URLSearchParams(params)
									if (w === 'titel') neu.delete('sort')
									else neu.set('sort', w)
									if (r === SAMMLUNG_NATUERLICH[w]) neu.delete('richtung')
									else neu.set('richtung', r)
									// Eine andere Reihenfolge heisst: wieder von vorn (neuer Schlüssel).
									neu.delete('offset')
									setParams(neu, { replace: true })
								}}
							/>
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

						<div ref={marker} aria-hidden="true" />
						<p className="ruhig" role="status">
							{laedt
								? 'lädt …'
								: mehrDa(daten.spiele.length, daten.gesamt)
									? `${daten.spiele.length} von ${daten.gesamt} geladen`
									: `Alle ${daten.gesamt} geladen.`}
						</p>
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
