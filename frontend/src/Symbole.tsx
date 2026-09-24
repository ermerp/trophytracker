/**
 * Der eigene Zeichensatz (Stufe 19).
 *
 * Keine Icon-Bibliothek: Bei einer fremden müsste jedes Zeichen einzeln gegen
 * die Markenregel geprüft werden (Abschnitt 13), und der Satz ist klein genug,
 * um ihn zu zeichnen. Alle Zeichen liegen auf 24 × 24, tragen `currentColor`
 * und eine Strichstärke – so nehmen sie die Farbe ihres Elternteils an.
 *
 * Gefüllt wird nur, wo die Füllung eine Aussage ist: ein erspieltes Platin,
 * ein gesetzter Favorit. Alles andere bleibt Umriss.
 */

export const ZEICHEN = {
	haus: '<path d="M3.5 10.6 12 3.5l8.5 7.1"/><path d="M6 9.9V20h12V9.9"/>',
	raster:
		'<rect x="3.6" y="3.6" width="7" height="7" rx="1.6"/><rect x="13.4" y="3.6" width="7" height="7" rx="1.6"/>' +
		'<rect x="3.6" y="13.4" width="7" height="7" rx="1.6"/><rect x="13.4" y="13.4" width="7" height="7" rx="1.6"/>',
	zeile:
		'<path d="M8.5 6h11M8.5 12h11M8.5 18h11"/>' +
		'<path d="M4.4 6h.01M4.4 12h.01M4.4 18h.01" stroke-width="2.6"/>',
	stern: '<path d="M12 3.8l2.55 5.2 5.75.84-4.16 4.05 1 5.73L12 16.9l-5.14 2.72 1-5.73-4.16-4.05 5.75-.84z"/>',
	haken: '<path d="M4.8 12.6l4.9 4.9 9.5-10.6"/>',
	lupe: '<circle cx="10.6" cy="10.6" r="6.6"/><path d="M15.4 15.4 21 21"/>',
	// Ein echtes Zahnrad mit acht Zaehnen. Die erste Fassung hatte Speichen um
	// einen Kreis und sah aus wie eine Sonne (Nutzer, 23.09.2026).
	zahnrad:
		'<path d="M19.03 10.05L21.55 10.32L21.55 13.68L19.03 13.95L18.35 15.59L19.95 17.56L17.56 19.95L15.59 18.35' +
		'L13.95 19.03L13.68 21.55L10.32 21.55L10.05 19.03L8.41 18.35L6.44 19.95L4.05 17.56L5.65 15.59L4.97 13.95' +
		'L2.45 13.68L2.45 10.32L4.97 10.05L5.65 8.41L4.05 6.44L6.44 4.05L8.41 5.65L10.05 4.97L10.32 2.45L13.68 2.45' +
		'L13.95 4.97L15.59 5.65L17.56 4.05L19.95 6.44L18.35 8.41Z"/><circle cx="12" cy="12" r="3.1"/>',
	disc: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="2.5"/>',
	wolke:
		'<path d="M7.4 17.2a3.9 3.9 0 0 1 .3-7.7 5.1 5.1 0 0 1 9.8 1.1 3.4 3.4 0 0 1 .2 6.6"/>' +
		'<path d="M12 10.8v7.4m0 0-2.5-2.5M12 18.2l2.5-2.5"/>',
	// PS Plus: ein fettes Kreuz, nur die Aussenlinie, kein Kreis darum
	// (Wunsch des Nutzers vom 24.09.2026).
	psplus: '<path d="M9.3 4.2h5.4v5.1h5.1v5.4h-5.1v5.1H9.3v-5.1H4.2V9.3h5.1z"/>',
	pokal:
		'<path d="M8 4.2h8v4.4a4 4 0 0 1-8 0z"/><path d="M8 5.4H5.4v1.7a3.6 3.6 0 0 0 2.9 3.5"/>' +
		'<path d="M16 5.4h2.6v1.7a3.6 3.6 0 0 1-2.9 3.5"/><path d="M12 12.6v3.3"/>' +
		'<path d="M8.4 19.8h7.2l-.9-3.1H9.3z"/>',
	hoch: '<path d="M12 19.2V5.4m0 0-5.6 5.6M12 5.4l5.6 5.6"/>',
	zurueck: '<path d="M19 12H5.4m0 0 5.6-5.6M5.4 12l5.6 5.6"/>',
	barcode: '<path d="M4 5.5v13M7.4 5.5v13M10.8 5.5v9M14.2 5.5v13M17.6 5.5v9M20.4 5.5v13"/>',
	muell: '<path d="M4.6 6.6h14.8M9.2 6.6V4.4h5.6v2.2M6.6 6.6l1 12.9h8.8l1-12.9"/>',
	kreuz: '<path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6"/>',
	plus: '<path d="M12 5.4v13.2M5.4 12h13.2"/>',
	durchgespielt: '<circle cx="12" cy="12" r="8.4"/><path d="M8.2 12.3l2.9 2.9 5.1-5.9"/>',
	abgebrochen: '<circle cx="12" cy="12" r="8.4"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/>',
	umhaengen: '<path d="M12 4.2v9.8m0 0-3.4-3.4M12 14l3.4-3.4"/><path d="M5.2 16.4v3.4h13.6v-3.4"/>',
	oeffnen: '<path d="M4.4 12h9.4m0 0-3.4-3.4M13.8 12l-3.4 3.4"/><path d="M15.6 4.6h4v14.8h-4"/>',
	winkel: '<path d="M9 5.4 15.6 12 9 18.6"/>',
	filter: '<path d="M4 7.2h9M19.4 7.2h.6M4 12h3.4M11.8 12h8.2M4 16.8h8.2M17 16.8h3"/>' +
		'<circle cx="16" cy="7.2" r="2.1"/><circle cx="9.6" cy="12" r="2.1"/><circle cx="14.8" cy="16.8" r="2.1"/>',
} as const

export type ZeichenName = keyof typeof ZEICHEN

type Props = {
	name: ZeichenName
	/** Kantenlänge in Pixeln; 22 passt in einen 44-px-Knopf. */
	groesse?: number
	/** Füllt die Form in derselben Farbe – nur für „das ist erreicht". */
	gefuellt?: boolean
	strich?: number
	className?: string
}

/**
 * Ein Zeichen. `aria-hidden`, weil die Bedeutung immer am Elternteil steht –
 * als sichtbarer Text oder als `aria-label` des Knopfes.
 */
export function Zeichen({ name, groesse = 22, gefuellt = false, strich = 1.7, className }: Props) {
	return (
		<svg
			className={className}
			width={groesse}
			height={groesse}
			viewBox="0 0 24 24"
			fill={gefuellt ? 'currentColor' : 'none'}
			stroke="currentColor"
			strokeWidth={strich}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			dangerouslySetInnerHTML={{ __html: ZEICHEN[name] }}
		/>
	)
}
