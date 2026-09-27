import { useCallback, useEffect, useState } from 'react'

/**
 * Was das Gerät wirklich misst (Stufe 19c, Nachbesserung).
 *
 * **Warum es das gibt:** Am 27.09.2026 meldete der Nutzer eine Seite, die
 * sich schieben lässt, obwohl der ganze Inhalt zu sehen ist. Im
 * Headless-Browser war das dreimal nicht nachzustellen – und dreimal habe ich
 * daneben geraten (Scrollhöhe, Textskalierung, Chromes Adressleiste). Der
 * Grund ist immer derselbe: Auf dem Entwicklungsrechner sind alle
 * `env(safe-area-inset-*)` **null**, auf einem Handy mit `viewport-fit=cover`
 * nicht. Wer die Zahlen nicht hat, rät.
 *
 * Deshalb liest diese Tafel sie dort aus, wo sie gelten. Sie ist bewusst
 * dauerhaft und nicht hinter einem Entwicklerschalter: Sie kostet nichts,
 * schreibt nichts und beantwortet eine Frage, die bei einer PWA auf fremder
 * Hardware sonst nicht zu beantworten ist.
 *
 * Die sicheren Bereiche sind nicht direkt auslesbar – `env()` gibt es nur in
 * CSS. Ein unsichtbarer Messfühler bekommt sie deshalb als Polsterung, und
 * `getComputedStyle` liest sie in Pixeln zurück.
 */

type Werte = {
	fenster: string
	geraet: string
	sicher: string
	seite: string
	ueberhang: number
	main: string
	modus: string
}

function messen(fuehler: HTMLElement | null): Werte {
	const d = document.documentElement
	const m = document.querySelector('main')
	const s = fuehler ? getComputedStyle(fuehler) : null
	const px = (w: string | undefined) => Math.round(Number.parseFloat(w ?? '0'))
	return {
		fenster: `${window.innerWidth} × ${window.innerHeight}`,
		geraet: `${Math.round(window.devicePixelRatio * 100) / 100}× · ${screen.width} × ${screen.height}`,
		sicher: s
			? `oben ${px(s.paddingTop)} · unten ${px(s.paddingBottom)} · links ${px(s.paddingLeft)} · rechts ${px(s.paddingRight)}`
			: 'nicht gemessen',
		seite: `${d.scrollHeight} px hoch, Fenster ${d.clientHeight} px`,
		ueberhang: d.scrollHeight - d.clientHeight,
		main: m ? `${Math.round(m.getBoundingClientRect().height)} px` : 'keines',
		modus: window.matchMedia('(display-mode: standalone)').matches ? 'installiert' : 'im Browser',
	}
}

export function Anzeigewerte() {
	const [werte, setWerte] = useState<Werte | null>(null)
	const [fuehler, setFuehler] = useState<HTMLDivElement | null>(null)

	const neu = useCallback(() => {
		if (fuehler) setWerte(messen(fuehler))
	}, [fuehler])

	useEffect(() => {
		if (!fuehler) return
		// Nach dem Zeichnen messen, sonst steht die Seitenhöhe noch auf dem
		// Stand vor dem Layout.
		const t = setTimeout(neu, 100)
		window.addEventListener('resize', neu)
		return () => {
			clearTimeout(t)
			window.removeEventListener('resize', neu)
		}
	}, [fuehler, neu])

	return (
		<section>
			<h2>Anzeige</h2>
			{/* Der Messfühler: nimmt die sicheren Bereiche als Polsterung auf,
			    damit sie sich in Pixeln auslesen lassen. */}
			<div
				ref={setFuehler}
				aria-hidden="true"
				style={{
					position: 'fixed',
					top: 0,
					left: 0,
					width: 0,
					height: 0,
					visibility: 'hidden',
					paddingTop: 'env(safe-area-inset-top)',
					paddingBottom: 'env(safe-area-inset-bottom)',
					paddingLeft: 'env(safe-area-inset-left)',
					paddingRight: 'env(safe-area-inset-right)',
				}}
			/>
			{werte === null ? (
				<p className="zeile">wird gemessen …</p>
			) : (
				<table>
					<tbody>
						<tr>
							<td>Fenster</td>
							<td>{werte.fenster}</td>
						</tr>
						<tr>
							<td>Bildschirm</td>
							<td>{werte.geraet}</td>
						</tr>
						<tr>
							<td>Sichere Bereiche</td>
							<td>{werte.sicher}</td>
						</tr>
						<tr>
							<td>Diese Seite</td>
							<td>{werte.seite}</td>
						</tr>
						<tr>
							<td>Überhang</td>
							<td>{werte.ueberhang <= 0 ? 'keiner' : `${werte.ueberhang} px scrollbar`}</td>
						</tr>
						<tr>
							<td>Inhaltsbereich</td>
							<td>{werte.main}</td>
						</tr>
						<tr>
							<td>Modus</td>
							<td>{werte.modus}</td>
						</tr>
					</tbody>
				</table>
			)}
			<p className="zeile">
				Fenster, Bildschirm, sichere Bereiche und Modus gehören zum <strong>Gerät</strong> und
				gelten überall. „Diese Seite", „Überhang" und „Inhaltsbereich" beschreiben dagegen die
				Einstellungen – die sind lang und scrollen immer.
			</p>
			<p>
				<button type="button" className="klein" onClick={neu}>
					Neu messen
				</button>
			</p>
		</section>
	)
}
