import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { anfrage, type IgdbStatus, type ImportLauf, type ReviewFortschritt } from './api'
import type { StatusAntwort } from './Einstellungen'
import type { Sicherungsstand } from './Sicherung'
import { Zeichen } from './Symbole'

/**
 * Offene Posten des Dashboards (Stufe 19a, Abschnitt 13).
 *
 * Bis Stufe 19 stand alles in einem gelben Block – der Zugang, der
 * fehlgeschlagene Nachtlauf und die Prüfliste gleich laut. Seit 19a sind es
 * zwei Dinge (Entscheidung des Nutzers vom 27.09.2026):
 *
 * - **Warnung**: Etwas steht still. Abgelaufener Zugang, fehlgeschlagener
 *   Nachtlauf, überfällige Sicherung. Gelber Block, immer sichtbar.
 * - **Information**: Etwas wartet. Prüfliste, `unentschieden`, Zuordnung,
 *   IGDB, Import, Freitext, Backlog-Kandidaten. Liegt hinter der Glocke.
 *
 * An der Glocke schlägt Rot Gelb: Gibt es Warnungen, nennt die Zahl **sie**,
 * und ein gelber Punkt sagt, dass außerdem Posten warten. Die Kopfzeile klebt
 * oben, das Alarmzeichen bleibt deshalb über die ganze Seite sichtbar,
 * während der gelbe Block wegscrollt – genau das meint Abschnitt 13 mit „sein
 * Fehler muss am Morgen hier stehen".
 *
 * Die Unentschieden-Zeile steht auch dann, wenn die Prüfliste leer ist: Sonst
 * verschwindet die zweite Runde aus dem Blick.
 */

export type Posten = { key: string; inhalt: React.ReactNode }

export type OffeneDaten = { warnungen: Posten[]; posten: Posten[] }

export function useOffenePosten(): OffeneDaten {
	const [params] = useSearchParams()
	const [review, setReview] = useState<ReviewFortschritt | null>(null)
	const [listenOffen, setListenOffen] = useState(0)
	const [sicherung, setSicherung] = useState<Sicherungsstand | null>(null)
	const [igdb, setIgdb] = useState<IgdbStatus | null>(null)
	const [importOffen, setImportOffen] = useState<{ id: number; offen: number } | null>(null)
	const [freitext, setFreitext] = useState(0)
	const [kandidaten, setKandidaten] = useState(0)
	const [storeOffen, setStoreOffen] = useState(0)
	const [sync, setSync] = useState<StatusAntwort | null>(null)

	useEffect(() => {
		// Fehler bleiben hier still: Ein Posten, der sich nicht laden lässt,
		// darf das Dashboard nicht leeren. Was fehlt, fehlt – die Zahlen
		// daneben kommen aus einer eigenen Anfrage und stehen trotzdem.
		anfrage<ReviewFortschritt>('/api/review/progress').then(setReview).catch(() => {})
		anfrage<StatusAntwort>('/api/sync/status').then(setSync).catch(() => {})
		anfrage<{ listenOffen: number }>('/api/zuordnung/offen?limit=1')
			.then((a) => setListenOffen(a.listenOffen))
			.catch(() => {})
		anfrage<Sicherungsstand>('/api/backup/status').then(setSicherung).catch(() => {})
		anfrage<IgdbStatus>('/api/igdb/status').then(setIgdb).catch(() => {})
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

	const warnungen: Posten[] = []
	const posten: Posten[] = []

	// --- Warnungen: etwas steht still ---------------------------------------

	// Abschnitt 7.1: Der abgelaufene Zugang ist ein regulärer Zustand, aber
	// der nächtliche Abruf steht dann – das ist keine Wartezeile.
	if (sync?.zugang.status === 'abgelaufen') {
		warnungen.push({
			key: 'npsso',
			inhalt: (
				<>
					Der PlayStation-Zugang ist <b>abgelaufen</b> – der nächtliche Abruf steht still.{' '}
					<Link to="/einstellungen">Neues NPSSO eintragen</Link>
				</>
			),
		})
	}
	if (sync?.letzterAutomatischerLauf && nachtlaufFehlgeschlagen(sync.letzterAutomatischerLauf)) {
		warnungen.push({
			key: 'nachtlauf',
			inhalt: (
				<>
					Der <b>automatische Abruf</b> ist fehlgeschlagen
					{sync.letzterAutomatischerLauf.meldung ? `: ${sync.letzterAutomatischerLauf.meldung}` : '.'}{' '}
					<Link to="/einstellungen">Einstellungen</Link>
				</>
			),
		})
	}
	// Abschnitt 14.2: „Ein Backup, von dem man nicht weiss, ob es laeuft, ist
	// kein Backup." Acht Tage, nicht sieben – der Lauf ist wöchentlich.
	if (sicherung && sicherung.letzterErfolgAm === null) {
		warnungen.push({
			key: 'sicherung',
			inhalt: (
				<>
					Noch <b>keine Sicherung</b> – die Daten liegen nur bei Cloudflare.{' '}
					<Link to="/einstellungen">Einstellungen</Link>
				</>
			),
		})
	} else if (sicherung?.tageSeit != null && sicherung.tageSeit > 8) {
		warnungen.push({
			key: 'sicherung',
			inhalt: (
				<>
					Die letzte Sicherung ist <b>{sicherung.tageSeit} Tage</b> alt.{' '}
					<Link to="/einstellungen">Einstellungen</Link>
				</>
			),
		})
	}

	// --- Information: etwas wartet ------------------------------------------

	if (review && review.offen > 0) {
		posten.push({
			key: 'pruefen',
			inhalt: (
				<>
					<strong>{review.offen}</strong> Spiele warten auf deine erste Durchsicht.{' '}
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
					<strong>{review.unentschieden}</strong> Spiele stehen auf „unentschieden".{' '}
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
					<strong>{listenOffen}</strong> Trophäenlisten sind noch nicht zugeordnet.{' '}
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
					<strong>{igdb.ungeprueft}</strong> Spiele wurden noch nicht bei IGDB gesucht.{' '}
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
					<strong>{igdb.zurPruefung}</strong> Spiele warten auf die IGDB-Zuordnung.{' '}
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
					Ein Wunschlisten-Import hat <strong>{importOffen.offen}</strong> offene Zeilen.{' '}
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
					<strong>{freitext}</strong> Einträge haben keinen IGDB-Eintrag.{' '}
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
					<strong>{kandidaten}</strong> Spiele im Besitz stehen auf keiner Liste.{' '}
					<Link to="/backlog">Backlog-Kandidaten</Link>
				</>
			),
		})
	}

	return { warnungen, posten }
}

/**
 * Die Glocke in der Kopfzeile.
 *
 * Drei Zustände: still ohne Marke, gelb mit der Anzahl offener Posten, rot
 * mit der Anzahl der **Warnungen** – dann sagt ein gelber Punkt, dass es
 * außerdem Posten gibt. Ohne beides ist die Glocke kein Knopf, sondern nur
 * ein Zeichen: Es gäbe nichts aufzuklappen.
 */
export function Glocke({
	warnungen,
	posten,
	offen,
	umschalten,
}: {
	warnungen: number
	posten: number
	offen: boolean
	umschalten: () => void
}) {
	const alarm = warnungen > 0
	const zahl = alarm ? warnungen : posten
	const text = alarm
		? `${warnungen} ${warnungen === 1 ? 'Warnung' : 'Warnungen'}${posten > 0 ? `, ${posten} offene Posten` : ''}`
		: posten > 0
			? `${posten} offene Posten`
			: 'Nichts offen'

	if (zahl === 0) {
		return (
			<span className="ikone" title={text}>
				<Zeichen name="glocke" />
				<span className="nur-vorlesen">{text}</span>
			</span>
		)
	}
	return (
		<button
			type="button"
			className={`ikone ${alarm ? 'alarm' : 'wach'}`}
			aria-label={text}
			aria-expanded={offen}
			title={text}
			onClick={umschalten}
		>
			<Zeichen name="glocke" />
			<span className={alarm ? 'punktzahl rot' : 'punktzahl'}>{zahl}</span>
			{alarm && posten > 0 && <span className="nebenpunkt" />}
		</button>
	)
}

/** Der gelbe Block: nur, was stillsteht. Immer sichtbar, nie hinter der Glocke. */
export function Warnblock({ warnungen }: { warnungen: Posten[] }) {
	if (warnungen.length === 0) return null
	return (
		<ul className="warnungen">
			{warnungen.map((w) => (
				<li key={w.key}>{w.inhalt}</li>
			))}
		</ul>
	)
}

/**
 * Die Tafel hinter der Glocke. Sie zeigt **beides** – oben die Warnungen,
 * darunter die Posten: Der rote Zähler an der Glocke braucht seine Auflösung
 * auch dann, wenn der gelbe Block weit oben aus dem Bild gescrollt ist.
 */
export function Tafel({ warnungen, posten }: OffeneDaten) {
	return (
		<div className="tafel" role="region" aria-label="Offene Posten">
			{warnungen.length > 0 && (
				<>
					<div className="tafelname gefahr">Steht still</div>
					<ul>
						{warnungen.map((w) => (
							<li key={w.key}>{w.inhalt}</li>
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
		</div>
	)
}

/** Fehlgeschlagen und jünger als 24 Stunden – ältere hat ein neuer Lauf abgelöst. */
function nachtlaufFehlgeschlagen(lauf: NonNullable<StatusAntwort['letzterAutomatischerLauf']>): boolean {
	if (lauf.status !== 'fehler') return false
	const gestartet = new Date(lauf.gestartetAm.replace(' ', 'T') + (lauf.gestartetAm.includes('Z') ? '' : 'Z'))
	return Date.now() - gestartet.getTime() < 24 * 60 * 60 * 1000
}
