import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
	anfrage,
	datum,
	PLATTFORMEN,
	PLAY_STATUS,
	STATUSTEXT,
	STUFENTEXT,
	type Kennzahlen as Zahlen,
	type LetztesPlatin,
	type PlattformZahlen,
	type PlayStatus,
} from './api'
import { Cover, PlattformChip, zustandsFarbe } from './SpielTeile'
import { Zeichen } from './Symbole'

/**
 * Die Kennzahlen des Dashboards (Stufe 19a, Abschnitt 13).
 *
 * Alles kommt aus `GET /api/stats` – einer Anfrage, einem Batch. Gezählt wird
 * dieselbe Sammlung wie in der Sammlungsansicht: Releases, die nur einen
 * Wunsch tragen, bleiben außen vor (Abschnitt 3), sonst stünden hier 489
 * Releases und dort 438.
 *
 * Aufbau auf dem Handy: vier Kennzahlen, Plattformen, „Wie ich dastehe",
 * Trophäen. Auf dem Desktop kommt „Zuletzt gespielt · mit Platin" neben den
 * Kreis und die beiden Tabellen kommen fest dazu, die das Handy hinter dem
 * Aufklappen hält – dort ist der Platz da.
 */

/** Deutsche Tausendertrennung mit schmalem Leerraum, wie überall in den Zahlen. */
const t = (n: number) => n.toLocaleString('de-DE').replace(/\./g, ' ')

export function Kennzahlen() {
	const [zahlen, setZahlen] = useState<Zahlen | null>(null)
	const [meldung, setMeldung] = useState('')
	const [auf, setAuf] = useState<'plattform' | 'trophaeen' | null>(null)

	useEffect(() => {
		// Bewusst kein Merken des Aufklappzustands: Wer aufs Dashboard
		// zurückkommt, findet es zugeklappt vor (Entscheidung des Nutzers vom
		// 27.09.2026) – anders als die Kachel-/Zeilen-Wahl aus Stufe 19.
		anfrage<Zahlen>('/api/stats')
			.then(setZahlen)
			.catch((f) => setMeldung(f instanceof Error ? f.message : 'Die Kennzahlen ließen sich nicht laden.'))
	}, [])

	if (meldung) return <p className="ruhig">{meldung}</p>
	if (!zahlen) return null

	const anteil = zahlen.trophaeen.definiert
		? Math.round((100 * zahlen.trophaeen.erspielt) / zahlen.trophaeen.definiert)
		: null

	return (
		<>
			<div className="block b-zahlen">
				<div className="reihe">
					<div className="kachel">
						{/* Fehlt jede Trophäenliste, ist der Anteil unbekannt – nie 0 % (Abschnitt 13). */}
						<span className="zahl gold">{anteil === null ? 'unbekannt' : `${anteil} %`}</span>
						<span className="wort">Trophäen</span>
					</div>
					<div className="kachel">
						<span className="zahl">{t(zahlen.spiele)}</span>
						<span className="wort">Spiele</span>
					</div>
					<Link className="kachel" to="/backlog">
						<span className="zahl">{t(zahlen.listen.backlog)}</span>
						<span className="wort">Backlog</span>
					</Link>
					<Link className="kachel" to="/todo">
						<span className="zahl">{t(zahlen.listen.todo)}</span>
						<span className="wort">To-Do</span>
					</Link>
				</div>
			</div>

			<Aufklappbar
				klasse="b-plattform"
				name="Je Plattform"
				offen={auf === 'plattform'}
				umschalten={() => setAuf(auf === 'plattform' ? null : 'plattform')}
				tabelle={<PlattformTabelle zeilen={zahlen.plattformen} />}
			>
				<div className="reihe">
					{PLATTFORMEN.map((p) => {
						const z = zahlen.plattformen.find((x) => x.plattform === p)
						return (
							<Link key={p} className="kachel pk" to={`/sammlung?platform=${p}`}>
								<PlattformChip plattform={p} />
								<span className="zahl">{t(z?.releases ?? 0)}</span>
							</Link>
						)
					})}
				</div>
			</Aufklappbar>

			{/* Ohne Releases gäbe es hier nur eine Überschrift über nichts. */}
			{zahlen.releases > 0 && (
			<div className="block b-dastehen">
				<div className="blockname">Wie ich dastehe</div>
				<div className="dastehen">
					<Kreis status={zahlen.status} gesamt={zahlen.releases} />
					<div className="legende">
						{PLAY_STATUS.filter((s) => zahlen.status[s] > 0)
							.sort((a, b) => zahlen.status[b] - zahlen.status[a])
							.map((s) => (
								<Link key={s} className="zustand" to={`/sammlung?playStatus=${s}`}>
									<span className="punkt" style={{ background: zustandsFarbe(s) }} />
									{STATUSTEXT[s]}
									<span className="n">{t(zahlen.status[s])}</span>
								</Link>
							))}
					</div>
				</div>
			</div>
			)}

			<Aufklappbar
				klasse="b-trophaeen"
				name="Trophäen"
				rechts={`${t(zahlen.trophaeen.erspielt)} von ${t(zahlen.trophaeen.definiert)}`}
				offen={auf === 'trophaeen'}
				umschalten={() => setAuf(auf === 'trophaeen' ? null : 'trophaeen')}
				tabelle={<Stufenzeilen stufen={zahlen.trophaeen.stufen} />}
			>
				{/*
				  Level und die vier Stufen in EINER Zeile (Stufe 19b, am Prototyp in
				  vier Runden abgestimmt). Die Kacheln sind weg: Wort und „von 338"
				  stehen ohnehin in der Tabelle darunter, und die Zahlen nehmen die
				  Fläche neben der Level-Zahl ein, statt an ihrem Rand zu kleben.
				  Auf dem Gerät des Nutzers (360 px) rutscht die Stufenreihe auf eine
				  eigene Zeile – gemessen, auch mit kleineren Maßen.
				*/}
				<div className="levelzeile">
					{zahlen.level && (
						<div className="level">
							<span className="wert">{t(zahlen.level.level)}</span>
							<span className="wort">Level</span>
						</div>
					)}
					<div className="stufenkurz">
						{zahlen.trophaeen.stufen.map((s) => (
							<span key={s.stufe} className="sk" style={{ color: `var(--troph-${s.stufe})` }}>
								{/* Unser eigener Pokal, nie Sonys Formen (Abschnitt 13). */}
								<Zeichen name="pokal" groesse={22} strich={1.5} />
								{t(s.erspielt)}
								<span className="nur-vorlesen">
									{STUFENTEXT[s.stufe]}: {s.erspielt} von {s.definiert}
								</span>
							</span>
						))}
					</div>
				</div>

				{/* Der Balken gehört zum Level und fehlt ohne es ganz – eine leere
				    Spur unter vier Zahlen wäre ein Fortschritt zu nichts. */}
				{zahlen.level && (
					<>
						<div className="balken levelbalken">
							<div style={{ width: `${zahlen.level.prozent}%`, background: 'var(--gold)' }} />
						</div>
						<div className="levelfuss">
							<span>{t(zahlen.level.punkte)} Punkte</span>
							<span>
								{t(zahlen.level.bisNaechstes)} bis Level {t(zahlen.level.level + 1)}
							</span>
						</div>
					</>
				)}
			</Aufklappbar>

			<JahreBlock />

			{/* Nur am Desktop: neben dem Kreis ist dort Platz, auf dem Handy wäre es
			    ein sechster Block auf einer Seite, die schon scrollt. */}
			{zahlen.letztesPlatin && <LetztesPlatinBlock spiel={zahlen.letztesPlatin} />}

			{/* Am Desktop stehen die beiden Tabellen fest, statt hinter dem Aufklappen. */}
			<div className="nur-desktop dtabellen">
				<div className="block">
					<div className="blockname">Bestand je Plattform</div>
					<PlattformTabelle zeilen={zahlen.plattformen} />
				</div>
				<div className="block">
					<div className="blockname">Anteil je Stufe</div>
					<Stufenzeilen stufen={zahlen.trophaeen.stufen} />
				</div>
			</div>
		</>
	)
}

/**
 * Ein Block, dessen Überschrift ein Knopf ist: Ein Tipp klappt die Tabelle
 * unter den Kacheln auf. Nur auf dem Handy – am Desktop stehen die Tabellen
 * ohnehin da, und der Winkel wäre ein Knopf ohne Wirkung.
 */
function Aufklappbar({
	klasse,
	name,
	rechts,
	offen,
	umschalten,
	tabelle,
	children,
}: {
	klasse: string
	name: string
	rechts?: string
	offen: boolean
	umschalten: () => void
	tabelle: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<div className={`block ${klasse}`}>
			<button type="button" className="blockname knopfname nur-handy-flex" onClick={umschalten} aria-expanded={offen}>
				{name}
				<span className={offen ? 'pfeil auf' : 'pfeil'}>
					<Zeichen name="winkel" groesse={14} strich={2.1} />
				</span>
				{rechts && <span className="rechts">{rechts}</span>}
			</button>
			<div className="blockname nur-desktop">
				{name}
				{rechts && <span className="rechts">{rechts}</span>}
			</div>
			{children}
			{offen && <div className="aufklapp nur-handy">{tabelle}</div>}
		</div>
	)
}

function PlattformTabelle({ zeilen }: { zeilen: PlattformZahlen[] }) {
	return (
		<table className="plattformtabelle">
			<thead>
				<tr>
					<th>Plattform</th>
					<th>Spiele</th>
					<th>Platin</th>
					<th>Disc</th>
					<th>Download</th>
				</tr>
			</thead>
			<tbody>
				{zeilen.map((z) => (
					<tr key={z.plattform}>
						<td>
							<PlattformChip plattform={z.plattform} />
						</td>
						<td>{t(z.spiele)}</td>
						<td>
							{/* Dreiwertig: der Nenner sind die Listen MIT Platin, nicht alle. */}
							<span style={{ color: 'var(--gold)' }}>{t(z.platin)}</span>{' '}
							<span className="von">/ {t(z.platinMoeglich)}</span>
						</td>
						<td className={z.disc === 0 ? 'aus' : undefined}>{t(z.disc)}</td>
						<td className={z.digital === 0 ? 'aus' : undefined}>{t(z.digital)}</td>
					</tr>
				))}
			</tbody>
		</table>
	)
}

function Stufenzeilen({ stufen }: { stufen: Zahlen['trophaeen']['stufen'] }) {
	return (
		<>
			{stufen.map((s) => (
				<div key={s.stufe} className="stufe">
					<span className="name">{STUFENTEXT[s.stufe]}</span>
					<span className="spur">
						<span className="balken hoch">
							<div
								style={{
									width: `${s.definiert ? (100 * s.erspielt) / s.definiert : 0}%`,
									background: `var(--troph-${s.stufe})`,
								}}
							/>
						</span>
					</span>
					<span className="wert">
						{t(s.erspielt)} / {t(s.definiert)}
					</span>
				</div>
			))}
		</>
	)
}

/**
 * Das zuletzt **gespielte** Spiel mit Platin.
 *
 * Nicht „letztes Platin": Wann ein Platin erspielt wurde, weiß die Datenbank
 * nicht – von 164 Spielen mit Platin hat keines ein Beendet-Datum, und der
 * Zeitpunkt je Trophäe kommt erst mit Stufe 19b (7.7). Die Überschrift sagt
 * deshalb genau das, was die Zahl hergibt.
 */
/**
 * Trophäen je Jahr (Stufe 19b, am Prototyp entschieden).
 *
 * **Jahre ohne Trophäe werden ergänzt.** Die Abfrage liefert nur Jahre, in
 * denen etwas erspielt wurde; eine Achse mit Lücken zeigt keinen Verlauf,
 * sondern eine Aufzählung. Gold trägt nur das beste Jahr – der Akzent bleibt
 * sparsam (13).
 */
function JahreBlock() {
	const [jahre, setJahre] = useState<Array<{ jahr: number; anzahl: number }> | null>(null)
	const [offen, setOffen] = useState(false)

	async function umschalten() {
		if (offen) return setOffen(false)
		setOffen(true)
		if (jahre) return
		try {
			setJahre((await anfrage<{ jahre: Array<{ jahr: number; anzahl: number }> }>('/api/stats/jahre')).jahre)
		} catch {
			setJahre([])
		}
	}

	return (
		<div className="block b-jahre">
			<button type="button" className="blockname knopfname" onClick={umschalten} aria-expanded={offen}>
				Trophäen je Jahr
				<span className="rechts">{offen ? '' : 'anzeigen'}</span>
			</button>
			{offen && (jahre ? <Saeulen jahre={jahre} /> : <p className="ruhig klein">Wird geladen …</p>)}
		</div>
	)
}

/**
 * Die Säulen selbst.
 *
 * **Jahre ohne Trophäe werden ergänzt.** Die Abfrage liefert nur Jahre, in
 * denen etwas erspielt wurde; eine Achse mit Lücken zeigt keinen Verlauf,
 * sondern eine Aufzählung. Gold trägt nur das beste Jahr – der Akzent bleibt
 * sparsam (13).
 */
function Saeulen({ jahre }: { jahre: Array<{ jahr: number; anzahl: number }> }) {
	if (jahre.length === 0) return <p className="ruhig klein">Noch keine Trophäe mit Datum.</p>
	const von = jahre[0].jahr
	const bis = jahre[jahre.length - 1].jahr
	const nach = new Map(jahre.map((j) => [j.jahr, j.anzahl]))
	const alle = Array.from({ length: bis - von + 1 }, (_, i) => ({
		jahr: von + i,
		anzahl: nach.get(von + i) ?? 0,
	}))
	const hoechste = Math.max(...alle.map((j) => j.anzahl))
	const summe = alle.reduce((s, j) => s + j.anzahl, 0)
	const bestes = alle.find((j) => j.anzahl === hoechste)

	return (
		<>
			{/* Das beste Jahr wird nur hervorgehoben, wenn es mehrere gibt: Bei
			    einem einzigen wäre „das beste" keine Aussage, sondern eine goldene
			    Fläche über die ganze Breite. */}
			<div className="jahre">
				{alle.map((j) => (
					<div key={j.jahr} className={`jahr${alle.length > 1 && j.anzahl === hoechste ? ' best' : ''}`}>
						<div
							className="saeule"
							style={{ height: `${hoechste ? (100 * j.anzahl) / hoechste : 0}%` }}
						/>
						<span className="nur-vorlesen">
							{j.jahr}: {j.anzahl}
						</span>
					</div>
				))}
			</div>
			<div className="jahrnamen">
				{alle.map((j) => (
					<span key={j.jahr}>{String(j.jahr).slice(2)}</span>
				))}
			</div>
			<p className="still jahrfuss">
				{bestes && alle.length > 1 ? (
					<>
						Bestes Jahr: <span className="zahl">{bestes.jahr}</span> mit{' '}
						<span className="zahl">{t(bestes.anzahl)}</span> Trophäen
					</>
				) : (
					<>
						<span className="zahl">{t(summe)}</span> Trophäen mit Datum
					</>
				)}
			</p>
		</>
	)
}

function LetztesPlatinBlock({ spiel }: { spiel: LetztesPlatin }) {
	return (
		<div className="block nur-desktop b-platin">
			<div className="blockname">Zuletzt gespielt · mit Platin</div>
			<div className="lp">
				<Cover bild={spiel.bild} cover={spiel.bild !== null} titel={spiel.titel} ziel={`/spiel/${spiel.spielId}`} breite={92} />
				<div className="lp-text">
					<Link className="lp-titel" to={`/spiel/${spiel.spielId}`}>
						{spiel.titel}
					</Link>
					<div className="lp-zeile">
						<PlattformChip plattform={spiel.plattform} />
						<span style={{ color: 'var(--troph-platin)', display: 'inline-flex' }}>
							<Zeichen name="pokal" groesse={18} strich={1.6} gefuellt />
						</span>
						<span className="lp-platin">Platin</span>
					</div>
					<div className="lp-zahlen">
						<span style={{ color: 'var(--troph-gold)' }}>{t(spiel.gold)} Gold</span>
						<span style={{ color: 'var(--troph-silber)' }}>{t(spiel.silber)} Silber</span>
						<span style={{ color: 'var(--troph-bronze)' }}>{t(spiel.bronze)} Bronze</span>
					</div>
					<div className="lp-fuss">
						{spiel.fortschritt}&thinsp;% der Liste ·{' '}
						{spiel.zuletztGespielt ? `zuletzt gespielt ${datum(spiel.zuletztGespielt)}` : 'zuletzt gespielt unbekannt'}
					</div>
				</div>
			</div>
		</div>
	)
}

/**
 * Der Zustandskreis als Inline-SVG.
 *
 * Sechs Segmente aus `stroke-dasharray`; die kleinsten sind ein Haarstrich
 * (drei von 438 sind 0,7 %), deshalb trägt die Legende daneben die Zahl. Ohne
 * Releases gibt es den Kreis nicht – ein leerer Ring wäre eine Behauptung.
 */
function Kreis({ status, gesamt }: { status: Record<PlayStatus, number>; gesamt: number }) {
	if (gesamt === 0) return null
	const r = 46
	const umfang = 2 * Math.PI * r
	let start = 0
	const segmente = PLAY_STATUS.filter((s) => status[s] > 0).map((s) => {
		const laenge = (umfang * status[s]) / gesamt
		const teil = { s, laenge, versatz: -start }
		start += laenge
		return teil
	})
	return (
		<div className="kreis">
			<svg viewBox="0 0 116 116" aria-hidden="true">
				{segmente.map(({ s, laenge, versatz }) => (
					<circle
						key={s}
						cx="58"
						cy="58"
						r={r}
						fill="none"
						stroke={zustandsFarbe(s)}
						strokeWidth="15"
						strokeDasharray={`${laenge} ${umfang - laenge}`}
						strokeDashoffset={versatz}
						transform="rotate(-90 58 58)"
					/>
				))}
			</svg>
			<div className="kreismitte">
				<span className="zahl">{t(gesamt)}</span>
				<span className="wort">Releases</span>
			</div>
		</div>
	)
}
