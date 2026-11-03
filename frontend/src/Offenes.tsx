import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { anfrage, type IgdbStatus, type ImportLauf, type Preisalarm, type ReviewFortschritt } from './api'
import { preisalarmText } from './preisalarm'
import { PlattformChip } from './SpielTeile'
import { Zeichen } from './Symbole'

/**
 * Offene Posten des Dashboards (Stufe 19a, Abschnitt 13) und die
 * Betriebswarnungen (Stufe 18m, Abschnitt 16.2).
 *
 * Vier Stufen, in dieser Rangfolge (Entscheidungen des Nutzers vom 27.09.,
 * 18.10., 20.10. und 30.10.2026):
 *
 * - **Rot – handeln**: Etwas steht still oder steht kurz davor. Roter Block
 *   auf der Seite, immer sichtbar, und oben in der Tafel.
 * - **Türkis – Preis** (Stufe 20g): Ein Preis passt zu einer offenen Absicht.
 *   Eine gute Nachricht, keine Arbeit; nur hinter der Glocke, quittiert über
 *   den Haken.
 * - **Gelb – Posten**: Arbeit wartet. Prüfliste, `unentschieden`, Zuordnung,
 *   IGDB, Import, Freitext, Backlog-Kandidaten.
 * - **Grau – zur Kenntnis**: In der Nacht ging etwas schief, es steht aber
 *   nichts still, und es ist nichts zu tun. Still, nur hinter der Glocke.
 *
 * Rot und „zur Kenntnis" urteilt der Server (`GET /api/betrieb/warnungen`) –
 * bis 18m setzte diese Datei drei Warnungen selbst aus drei Antworten
 * zusammen. Die Glocke zählt die höchste Stufe, die da ist; ein Punkt in der
 * Farbe der nächsten sagt, dass darunter noch etwas wartet. Die Kopfzeile
 * klebt oben, das Alarmzeichen bleibt deshalb über die ganze Seite sichtbar,
 * während der Block wegscrollt.
 *
 * Die Unentschieden-Zeile steht auch dann, wenn die Prüfliste leer ist: Sonst
 * verschwindet die zweite Runde aus dem Blick.
 */

export type Posten = { key: string; inhalt: React.ReactNode }

export type OffeneDaten = {
	rot: Posten[]
	kenntnis: Posten[]
	posten: Posten[]
	preise: Preisalarm[]
	/** Quittieren über den Haken (Stufe 20g); die Zeile verschwindet sofort. */
	quittieren: (id: number) => void
}

/** Eine Betriebswarnung, wie der Server sie urteilt (src/domain/betrieb.ts). */
export type Betriebswarnung = {
	art: string
	stufe: 'rot' | 'kenntnis'
	text: string
	ziel?: 'einstellungen'
	zielText?: string
}

/** Was `/api/betrieb/warnungen` liefert – das Zugangsende lesen auch die Einstellungen. */
export type BetriebAntwort = {
	warnungen: Betriebswarnung[]
	zugangsende: {
		am: string
		quelle: 'sony' | 'gemessen'
		sonyAm: string | null
		lebensdauerTage: number | null
		tage: number
		stufe: 'rot' | 'kenntnis' | null
	} | null
}

const ZIELE: Record<NonNullable<Betriebswarnung['ziel']>, string> = { einstellungen: '/einstellungen' }

function alsPosten(w: Betriebswarnung, i: number): Posten {
	return {
		key: `${w.art}-${i}`,
		inhalt: (
			<>
				{w.text}
				{w.ziel && (
					<>
						{' '}
						<Link to={ZIELE[w.ziel]}>{w.zielText ?? 'Einstellungen'}</Link>
					</>
				)}
			</>
		),
	}
}

export function useOffenePosten(): OffeneDaten {
	const [params] = useSearchParams()
	const [review, setReview] = useState<ReviewFortschritt | null>(null)
	const [listenOffen, setListenOffen] = useState(0)
	const [igdb, setIgdb] = useState<IgdbStatus | null>(null)
	const [importOffen, setImportOffen] = useState<{ id: number; offen: number } | null>(null)
	const [freitext, setFreitext] = useState(0)
	const [kandidaten, setKandidaten] = useState(0)
	const [storeOffen, setStoreOffen] = useState(0)
	const [betrieb, setBetrieb] = useState<Betriebswarnung[]>([])
	const [preise, setPreise] = useState<Preisalarm[]>([])

	useEffect(() => {
		// Fehler bleiben hier still: Ein Posten, der sich nicht laden lässt,
		// darf das Dashboard nicht leeren. Was fehlt, fehlt – die Zahlen
		// daneben kommen aus einer eigenen Anfrage und stehen trotzdem.
		anfrage<ReviewFortschritt>('/api/review/progress').then(setReview).catch(() => {})
		anfrage<BetriebAntwort>('/api/betrieb/warnungen')
			.then((a) => setBetrieb(a.warnungen))
			.catch(() => {})
		anfrage<{ listenOffen: number }>('/api/zuordnung/offen?limit=1')
			.then((a) => setListenOffen(a.listenOffen))
			.catch(() => {})
		anfrage<IgdbStatus>('/api/igdb/status').then(setIgdb).catch(() => {})
		anfrage<{ alarme: Preisalarm[] }>('/api/preisalarme')
			.then((a) => setPreise(a.alarme))
			.catch(() => {})
		anfrage<{ eintraege: unknown[] }>('/api/sync/store/offen')
			.then((a) => setStoreOffen(a.eintraege.length))
			.catch(() => {})
		anfrage<{ laeufe: ImportLauf[] }>('/api/imports/wishlist')
			.then((a) => {
				const offen = a.laeufe
					.map((l) => ({
						id: l.id,
						offen: l.zaehler.ungeprueft + l.zaehler.klar + l.zaehler.mehrdeutig + l.zaehler.ohneTreffer,
					}))
					.find((l) => l.offen > 0)
				setImportOffen(offen ?? null)
			})
			.catch(() => {})
		anfrage<{ eintraege: Array<{ zustand: string }> }>('/api/unmatched')
			.then((a) => setFreitext(a.eintraege.filter((e) => e.zustand === 'freitext').length))
			.catch(() => {})
		anfrage<{ anzahl: number }>('/api/backlog-candidates')
			.then((a) => setKandidaten(a.anzahl))
			.catch(() => {})
	}, [])

	// --- Betriebswarnungen: geurteilt vom Server (Stufe 18m) ----------------
	const rot = betrieb.filter((w) => w.stufe === 'rot').map(alsPosten)
	const kenntnis = betrieb.filter((w) => w.stufe === 'kenntnis').map(alsPosten)
	const posten: Posten[] = []

	// --- Information: etwas wartet ------------------------------------------

	if (review && review.offen > 0) {
		posten.push({
			key: 'pruefen',
			inhalt: (
				<>
					<strong>{review.offen}</strong> {review.offen === 1 ? 'Spiel wartet' : 'Spiele warten'} auf deine erste Durchsicht.{' '}
					<Link to="/pruefliste">Prüfliste</Link>
				</>
			),
		})
	}
	// Store-Zuordnung (Stufe 21d): Information, keine Warnung - es steht
	// nichts still, es wartet Arbeit. Die Luecke sitzt bei IGDB und laesst
	// sich nicht verhindern; was geht, ist sie nicht still zu lassen. Sie
	// verschwindet von selbst, sobald IGDB den Eintrag nachliefert (30-Tage-
	// Nachfrage) oder du die Adresse einfuegst.
	if (storeOffen > 0) {
		posten.push({
			key: 'store',
			inhalt: (
				<>
					<strong>{storeOffen}</strong> {storeOffen === 1 ? 'Eintrag hat' : 'Einträge haben'} keinen Store-Eintrag.{' '}
					<Link to="/einstellungen">Nachtragen</Link>
				</>
			),
		})
	}
	if (review && review.unentschieden > 0 && params.get('playStatus') !== 'unentschieden') {
		posten.push({
			key: 'unentschieden',
			inhalt: (
				<>
					<strong>{review.unentschieden}</strong> {review.unentschieden === 1 ? 'Spiel steht' : 'Spiele stehen'} auf „unentschieden".{' '}
					<Link to="/sammlung?playStatus=unentschieden">Ansehen</Link>
				</>
			),
		})
	}
	if (listenOffen > 0) {
		posten.push({
			key: 'zuordnung',
			inhalt: (
				<>
					<strong>{listenOffen}</strong> {listenOffen === 1 ? 'Trophäenliste ist' : 'Trophäenlisten sind'} noch nicht zugeordnet.{' '}
					<Link to="/zuordnung">Zuordnung</Link>
				</>
			),
		})
	}
	if (igdb && igdb.zugangsdaten && igdb.ungeprueft > 0) {
		posten.push({
			key: 'igdb-abgleich',
			inhalt: (
				<>
					<strong>{igdb.ungeprueft}</strong> {igdb.ungeprueft === 1 ? 'Spiel wurde' : 'Spiele wurden'} noch nicht bei IGDB gesucht.{' '}
					<Link to="/einstellungen">Abgleich starten</Link>
				</>
			),
		})
	}
	if (igdb && igdb.zurPruefung > 0) {
		posten.push({
			key: 'igdb-pruefung',
			inhalt: (
				<>
					<strong>{igdb.zurPruefung}</strong> {igdb.zurPruefung === 1 ? 'Spiel wartet' : 'Spiele warten'} auf die IGDB-Zuordnung.{' '}
					<Link to="/igdb">IGDB-Zuordnung</Link>
				</>
			),
		})
	}
	if (importOffen) {
		posten.push({
			key: 'import',
			inhalt: (
				<>
					Ein Wunschlisten-Import hat <strong>{importOffen.offen}</strong> {importOffen.offen === 1 ? 'offene Zeile' : 'offene Zeilen'}.{' '}
					<Link to={`/import/${importOffen.id}`}>Weiter</Link>
				</>
			),
		})
	}
	if (freitext > 0) {
		posten.push({
			key: 'freitext',
			inhalt: (
				<>
					<strong>{freitext}</strong> {freitext === 1 ? 'Eintrag hat' : 'Einträge haben'} keinen IGDB-Eintrag.{' '}
					<Link to="/ohne-zuordnung">Ohne Zuordnung</Link>
				</>
			),
		})
	}
	if (kandidaten > 0) {
		posten.push({
			key: 'kandidaten',
			inhalt: (
				<>
					<strong>{kandidaten}</strong> {kandidaten === 1 ? 'Spiel im Besitz steht' : 'Spiele im Besitz stehen'} auf keiner Liste.{' '}
					<Link to="/backlog">Backlog-Kandidaten</Link>
				</>
			),
		})
	}

	// Die Zeile geht sofort weg; scheitert die Anfrage, kommt sie mit dem
	// nächsten Laden zurück - es geht nichts verloren, was der Server hält.
	const quittieren = (id: number) => {
		setPreise((p) => p.filter((a) => a.id !== id))
		anfrage(`/api/preisalarme/${id}/quittieren`, { methode: 'POST' }).catch(() => {})
	}

	return { rot, kenntnis, posten, preise, quittieren }
}

/**
 * Die Glocke in der Kopfzeile.
 *
 * Sie zählt die **höchste Stufe**, die da ist: rot die Warnungen, sonst
 * türkis die Preisalarme (seit 20g), sonst gelb die offenen Posten, sonst
 * grau die Hinweise zur Kenntnis. Ein Punkt in der
 * Farbe der nächsten Stufe sagt, dass darunter noch etwas liegt. Bis zum
 * 20.10.2026 stand Grau vor Gelb – verkehrt, denn „zur Kenntnis" heißt
 * „nichts zu tun", ein Posten „Arbeit wartet" (Entscheidung des Nutzers). Ist nichts da, ist die Glocke kein Knopf,
 * sondern nur ein Zeichen: Es gäbe nichts aufzuklappen.
 */
export function Glocke({
	rot,
	preise,
	kenntnis,
	posten,
	offen,
	umschalten,
}: {
	rot: number
	preise: number
	kenntnis: number
	posten: number
	offen: boolean
	umschalten: () => void
}) {
	// Die Stufen in ihrer Rangfolge, nur die besetzten.
	const besetzt = (
		[
			['rot', rot],
			['preisalarm', preise],
			['posten', posten],
			['kenntnis', kenntnis],
		] as const
	).filter(([, n]) => n > 0)
	const teile = [
		rot > 0 && `${rot} ${rot === 1 ? 'Warnung' : 'Warnungen'}`,
		preise > 0 && `${preise} ${preise === 1 ? 'Preisalarm' : 'Preisalarme'}`,
		posten > 0 && `${posten} offene Posten`,
		kenntnis > 0 && `${kenntnis} zur Kenntnis`,
	].filter(Boolean)
	const text = teile.length > 0 ? teile.join(', ') : 'Nichts offen'

	if (besetzt.length === 0) {
		return (
			<span className="ikone" title={text}>
				<Zeichen name="glocke" />
				<span className="nur-vorlesen">{text}</span>
			</span>
		)
	}
	const [stufe, zahl] = besetzt[0]!
	// Die nächste Stufe darunter, falls es eine gibt.
	const darunter = besetzt[1]?.[0] ?? null
	const glocke = { rot: 'alarm', preisalarm: 'preisalarm', posten: 'wach', kenntnis: 'kenntnis' }[stufe]
	const marke = { rot: 'rot', preisalarm: 'preisalarm', posten: '', kenntnis: 'kenntnis' }
	return (
		<button
			type="button"
			className={`ikone ${glocke}`}
			aria-label={text}
			aria-expanded={offen}
			title={text}
			onClick={umschalten}
		>
			<Zeichen name="glocke" />
			<span className={`punktzahl ${marke[stufe]}`.trim()}>{zahl}</span>
			{darunter && <span className={`nebenpunkt ${marke[darunter]}`.trim()} />}
		</button>
	)
}

/** Der rote Block: nur, was Handeln braucht. Immer sichtbar, nie nur hinter der Glocke. */
export function Warnblock({ rot }: { rot: Posten[] }) {
	if (rot.length === 0) return null
	return (
		<ul className="warnungen">
			{rot.map((w) => (
				<li key={w.key}>{w.inhalt}</li>
			))}
		</ul>
	)
}

/**
 * Die Tafel hinter der Glocke. Sie zeigt **alles**, in der Rangfolge der
 * Glocke – oben Rot, dann die Posten, dann zur Kenntnis (seit 20.10.2026): Der rote Zähler an der Glocke braucht seine
 * Auflösung auch dann, wenn der rote Block weit oben aus dem Bild gescrollt
 * ist. Der Preisalarm aus 20g steht als eigene Gruppe zwischen Warnungen und
 * Posten, in seinem eigenen Ton (16.2).
 */
export function Tafel({ rot, kenntnis, posten, preise, quittieren }: OffeneDaten) {
	return (
		<div className="tafel glockentafel" role="region" aria-label="Offene Posten">
			{rot.length > 0 && (
				<>
					<div className="tafelname gefahr">Handeln</div>
					<ul>
						{rot.map((w) => (
							<li key={w.key}>{w.inhalt}</li>
						))}
					</ul>
				</>
			)}
			{preise.length > 0 && (
				<>
					<div className="tafelname preisalarm">Preise</div>
					{/* Der Titel führt ins Spieldetail, ohne zu quittieren; quittiert
					    wird nur über den Haken (Entscheidung vom 30.10.2026). */}
					<ul className="preisalarmliste">
						{preise.map((a) => (
							<li key={a.id}>
								<div className="preisalarmtext">
									<Link to={`/spiel/${a.gameId}`}>{a.titel}</Link> <PlattformChip plattform={a.plattform} />
									<div className="ruhig klein">{preisalarmText(a)}</div>
								</div>
								<button
									type="button"
									className="ikone"
									aria-label={`Preisalarm zu ${a.titel} gesehen`}
									title="Gesehen"
									onClick={() => quittieren(a.id)}
								>
									<Zeichen name="haken" />
								</button>
							</li>
						))}
					</ul>
				</>
			)}
			{posten.length > 0 && (
				<>
					<div className="tafelname">Offene Posten</div>
					<ul>
						{posten.map((p) => (
							<li key={p.key}>{p.inhalt}</li>
						))}
					</ul>
				</>
			)}
			{kenntnis.length > 0 && (
				<>
					<div className="tafelname kenntnis">Zur Kenntnis</div>
					<ul className="kenntnisliste">
						{kenntnis.map((w) => (
							<li key={w.key}>{w.inhalt}</li>
						))}
					</ul>
				</>
			)}
		</div>
	)
}
