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
	type LetzteTrophaee,
	type LetztesPlatin,
	type PlattformZahlen,
	type PlayStatus,
} from './api'
import { Cover, PlattformChip, zustandsFarbe } from './SpielTeile'
import { PokalGruppe, Zeichen } from './Symbole'

/**
 * Die Kennzahlen des Dashboards (Stufe 19a, Abschnitt 13).
 *
 * Alles kommt aus `GET /api/stats` – einer Anfrage, einem Batch. Gezählt wird
 * dieselbe Sammlung wie in der Sammlungsansicht: Releases, die nur einen
 * Wunsch tragen, bleiben außen vor (Abschnitt 3), sonst stünden hier 489
 * Releases und dort 438.
 *
 * Aufbau seit Stufe 24 (13.1, 13.2): auf dem Handy Trophäen-Level und Je
 * Plattform (beide aufklappbar), die vier Kästen, „Wie ich dastehe", die
 * Jahre. Am Desktop stehen die beiden Tabellen fest in den oberen Flächen,
 * und neben den Kreis kommen letztes Platin und letzte Trophäe.
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
	const summe = (feld: 'disc' | 'digital' | 'nurPlus') => zahlen.plattformen.reduce((s, p) => s + p[feld], 0)
	const nurPlus = summe('nurPlus')

	/*
	 * Aufbau seit Stufe 24 (am Prototyp abgestimmt, Nutzer 07.11.2026). Der
	 * Quelltext steht in der Handy-Reihenfolge – Trophäen-Level, Je Plattform,
	 * die vier Kästen, Wie ich dastehe, Trophäen je Jahr –, damit ein
	 * Vorleseprogramm die Seite so hört, wie sie ohne Layout gemeint ist. Am
	 * Desktop werden daraus Flächen in vier Zeilen (13.2): oben zwei Spalten,
	 * die auf gleicher Höhe enden, darunter die Kästen über die volle Breite,
	 * dann Kreis, letztes Platin und letzte Trophäe, unten die Jahre.
	 */
	return (
		<>
			<div className="doben">
				<div className="dflaeche">
					<Aufklappbar
						klasse="b-trophaeen"
						name="Trophäen-Level"
						rechts={`${t(zahlen.trophaeen.erspielt)} von ${t(zahlen.trophaeen.definiert)}`}
						offen={auf === 'trophaeen'}
						umschalten={() => setAuf(auf === 'trophaeen' ? null : 'trophaeen')}
						tabelle={<Stufenzeilen stufen={zahlen.trophaeen.stufen} />}
					>
						{/*
						  Level und die vier Stufen in EINER Zeile (Stufe 19b, am Prototyp in
						  vier Runden abgestimmt). Auf dem Gerät des Nutzers (360 px) rutscht
						  die Stufenreihe auf eine eigene Zeile – gemessen, auch mit kleineren
						  Maßen.
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
					{/* Am Desktop steht die Tabelle fest, statt hinter dem Aufklappen. */}
					<div className="block nur-desktop dunter">
						<div className="blockname">Anteil je Stufe</div>
						<Stufenzeilen stufen={zahlen.trophaeen.stufen} />
					</div>
				</div>

				<div className="dflaeche">
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
					<div className="block nur-desktop dunter">
						<div className="blockname">Bestand je Plattform</div>
						<PlattformTabelle zeilen={zahlen.plattformen} />
					</div>
				</div>
			</div>

			{/*
			  Die vier Kästen (Stufe 24): flach, das Zeichen links, rechts Zahl und
			  eine Zeile. Backlog und To-Do sind gewichen – beide stehen in der
			  Navigation (Entscheidung des Nutzers vom 07.11.2026).
			*/}
			<div className="block b-zahlen">
				<div className="kastenreihe">
					{/* Fehlt jede Trophäenliste, ist der Anteil unbekannt – nie 0 % (Abschnitt 13). */}
					<Kasten ikon={<PokalGruppe />} zahl={anteil === null ? 'unbekannt' : `${anteil} %`} wort="Trophäen" gold />
					<Kasten
						ziel="/sammlung"
						ikon={<Zeichen name="regal" groesse={40} strich={1} />}
						zahl={t(zahlen.spiele)}
						wort="Spiele"
						zusatz={`${t(zahlen.releases)} Releases`}
					/>
					<Kasten
						ziel="/sammlung?owned=physisch"
						ikon={<Zeichen name="disc" groesse={36} strich={1.1} />}
						zahl={t(summe('disc'))}
						wort="Physisch"
					/>
					<Kasten
						ziel="/sammlung?owned=digital"
						ikon={<Zeichen name="wolke" groesse={36} strich={1.1} />}
						zahl={t(summe('digital'))}
						wort="Digital"
						zusatz={
							/* Das Zeichen statt des Worts (Wunsch des Nutzers vom 07.11.2026);
							   das Wort steht für Vorleseprogramme daneben. */
							nurPlus > 0 ? (
								<>
									davon {t(nurPlus)}
									<Zeichen name="psplus" groesse={15} strich={2} />
									<span className="nur-vorlesen">nur über PS Plus</span>
								</>
							) : undefined
						}
					/>
				</div>
			</div>

			<div className="dmitte">
				{/* Ohne Releases gäbe es hier nur eine Überschrift über nichts. */}
				{zahlen.releases > 0 && (
					<div className="dflaeche block b-dastehen">
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

				{/* Nur am Desktop (wie bisher das letzte Platin): Auf dem Handy wären
				    es zwei weitere Blöcke auf einer Seite, die schon scrollt. */}
				<div className="dzuletzt nur-desktop">
					{zahlen.letztesPlatin && <LetztesPlatinBlock spiel={zahlen.letztesPlatin} />}
					{zahlen.letzteTrophaee && <LetzteTrophaeeBlock trophaee={zahlen.letzteTrophaee} />}
				</div>
			</div>

			<JahreBlock />
		</>
	)
}

/**
 * Ein flacher Kasten der Kennzahlen (Stufe 24). Der Zusatz steht am Desktop
 * mit einem Punkt hinter dem Wort, auf dem Handy in einer eigenen Zeile –
 * dort bräche „Spiele · 445 Releases" bei 360 px mitten durch (gesehen am
 * Prototyp, 07.11.2026).
 */
function Kasten({
	ikon,
	zahl,
	wort,
	zusatz,
	gold = false,
	ziel,
}: {
	ikon: React.ReactNode
	zahl: string
	wort: string
	zusatz?: React.ReactNode
	gold?: boolean
	/** Wohin ein Tipp führt (Stufe 24b): die Sammlung, gefiltert nach Besitz. */
	ziel?: string
}) {
	const inhalt = (
		<>
			{ikon}
			<span className="ktext">
				<span className={gold ? 'kzahl gold' : 'kzahl'}>{zahl}</span>
				<span className="kwort">
					{wort}
					{zusatz && <span className="kzusatz">{zusatz}</span>}
				</span>
			</span>
		</>
	)
	return ziel ? (
		<Link className="kasten" to={ziel}>
			{inhalt}
		</Link>
	) : (
		<div className="kasten">{inhalt}</div>
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
					<th>Digital</th>
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
/**
 * Der Block steht offen, seit die Zahl billig ist (Stufe 19b, Nachbesserung
 * vom 01.10.2026): Vergangene Jahre werden nachts einmal gerechnet und
 * abgelegt, nur das laufende wird live gezählt. Vorher kostete die Auswertung
 * 18 060 gelesene Zeilen und musste deshalb hinter einen Klick.
 *
 * Eigene Abfrage statt `/api/stats`: Der Zwischenspeicher kann fehlen, und
 * dann rechnet die Route einmal alles – das soll die Kennzahlen nicht
 * aufhalten.
 */
function JahreBlock() {
	const [jahre, setJahre] = useState<Array<{ jahr: number; anzahl: number }> | null>(null)

	useEffect(() => {
		anfrage<{ jahre: Array<{ jahr: number; anzahl: number }> }>('/api/stats/jahre')
			.then((a) => setJahre(a.jahre))
			.catch(() => setJahre([]))
	}, [])

	return (
		<div className="dflaeche block b-jahre">
			<div className="blockname">Trophäen je Jahr</div>
			{jahre ? <Saeulen jahre={jahre} /> : <p className="ruhig klein">Wird geladen …</p>}
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

	/*
	 * Welches Jahr die Fußzeile nennt. `null` heißt „keins gewählt" – dann
	 * steht dort das beste. Ein Balken ist ein Knopf: Am Rechner genügt das
	 * Überfahren, auf dem Handy der Druck (Wunsch des Nutzers vom
	 * 01.10.2026). Eine Beschriftung an jeder Säule wäre bei sechzehn Jahren
	 * auf 360 px nicht lesbar.
	 */
	const [gewaehlt, setGewaehlt] = useState<number | null>(null)
	const gezeigt = alle.find((j) => j.jahr === gewaehlt) ?? bestes

	return (
		<>
			{/* Das beste Jahr wird nur hervorgehoben, wenn es mehrere gibt: Bei
			    einem einzigen wäre „das beste" keine Aussage, sondern eine goldene
			    Fläche über die ganze Breite. */}
			<div className="jahre">
				{alle.map((j) => (
					<button
						type="button"
						key={j.jahr}
						className={`jahr${alle.length > 1 && j.anzahl === hoechste ? ' best' : ''}${
							j.jahr === gewaehlt ? ' gewaehlt' : ''
						}`}
						onMouseEnter={() => setGewaehlt(j.jahr)}
						onMouseLeave={() => setGewaehlt(null)}
						onClick={() => setGewaehlt(j.jahr === gewaehlt ? null : j.jahr)}
						aria-label={`${j.jahr}: ${j.anzahl} Trophäen`}
					>
						<div
							className="saeule"
							style={{ height: `${hoechste ? (100 * j.anzahl) / hoechste : 0}%` }}
						/>
					</button>
				))}
			</div>
			<div className="jahrnamen">
				{alle.map((j) => (
					<span key={j.jahr}>{String(j.jahr).slice(2)}</span>
				))}
			</div>
			{/* Eine Zeile, die sich ändert – statt sechzehn Beschriftungen, von
			    denen auf dem Handy keine zu lesen wäre. Ohne Auswahl nennt sie
			    das beste Jahr; das ist die Aussage, die ohne Zutun gilt. */}
			<p className="still jahrfuss">
				{gezeigt ? (
					<>
						{gewaehlt === null && alle.length > 1 ? 'Bestes Jahr: ' : ''}
						<span className="zahl">{gezeigt.jahr}</span> ·{' '}
						<span className="zahl">{t(gezeigt.anzahl)}</span>{' '}
						{gezeigt.anzahl === 1 ? 'Trophäe' : 'Trophäen'}
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
		<div className="dflaeche block b-platin">
			{/* Seit Stufe 19b das ECHTE letzte Platin: `trophy.earned_at` nennt
			    den Zeitpunkt. Bis dahin hieß der Block „Zuletzt gespielt · mit
			    Platin", weil die Datenbank nur das wusste (Frage des Nutzers vom
			    01.10.2026: „könnte das jetzt nicht einfach ‚letztes Platin‘
			    sein?" – ja). */}
			<div className="blockname">Letztes Platin</div>
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
						<span className="lp-platin">{spiel.platinName}</span>
					</div>
					<div className="lp-zahlen">
						<span style={{ color: 'var(--troph-gold)' }}>{t(spiel.gold)} Gold</span>
						<span style={{ color: 'var(--troph-silber)' }}>{t(spiel.silber)} Silber</span>
						<span style={{ color: 'var(--troph-bronze)' }}>{t(spiel.bronze)} Bronze</span>
					</div>
					<div className="lp-fuss">
						{spiel.fortschritt}&thinsp;% der Liste · erspielt {datum(spiel.erspieltAm)}
					</div>
				</div>
			</div>
		</div>
	)
}

/**
 * Die zuletzt erspielte Trophäe, gleich welcher Stufe (Stufe 24): ihr Symbol
 * aus PSN, ohne Symbol unser Pokal in der Farbe ihrer Stufe (Stufe 24b).
 * Ohne Zuordnung steht der Titel ohne Link da.
 */
function LetzteTrophaeeBlock({ trophaee: tr }: { trophaee: LetzteTrophaee }) {
	const titel = tr.spielId === null ? <span className="lp-titel">{tr.name}</span> : (
		<Link className="lp-titel" to={`/spiel/${tr.spielId}`}>
			{tr.name}
		</Link>
	)
	return (
		<div className="dflaeche block b-lt">
			<div className="blockname">Letzte Trophäe</div>
			<div className="lp">
				{/* Das Symbol aus PSN wie in der Trophäenliste (Wunsch des Nutzers vom
				    07.11.2026); fehlt es, unser Pokal in der Farbe der Stufe. */}
				<span className="lt-ikon" style={{ color: `var(--troph-${tr.stufe})` }}>
					{tr.symbol ? (
						<img src={tr.symbol} alt="" loading="lazy" />
					) : (
						<Zeichen name="pokal" groesse={40} strich={1.4} gefuellt={tr.stufe === 'platin'} />
					)}
				</span>
				<div className="lp-text">
					{titel}
					<div className="lp-zeile">
						{tr.plattform && <PlattformChip plattform={tr.plattform} />}
						<span className="lt-spiel">{tr.titel}</span>
					</div>
					<div className="lp-zahlen">
						<span style={{ color: `var(--troph-${tr.stufe})` }}>{STUFENTEXT[tr.stufe]}</span>
						{/* Unbekannt bleibt unbekannt – weggelassen wie in der Trophäenliste, nie „0 %". */}
						{tr.seltenheit !== null && (
							<span>{tr.seltenheit.toLocaleString('de-DE', { maximumFractionDigits: 1 })} % der Spieler</span>
						)}
					</div>
					<div className="lp-fuss">erspielt {datum(tr.erspieltAm)}</div>
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
