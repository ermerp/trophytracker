/**
 * Normalisierung der PSN-Trophaeenliste.
 *
 * Reine Funktion: Roh-JSON hinein, Zeilenobjekte heraus. Keine Datenbank, kein
 * Netz. Damit ohne PSN-Zugriff beliebig wiederholbar - der Grund, warum
 * Abschnitt 7.1 Abruf und Normalisierung trennt.
 */

export type TrophyTitel = {
	np_communication_id: string;
	np_service_name: string;
	title_name: string;
	/**
	 * Der Rohwert von PSN, absichtlich unveraendert.
	 *
	 * Cross-Gen-Titel teilen sich eine Trophaeenliste und liefern mehrere
	 * Plattformen als kommagetrennte Liste ("PS3,PSVITA,PS4"). Auch Werte
	 * ausserhalb der Sammlung kommen vor ("PS5,PSPC"). trophy_progress.platform
	 * hat deshalb bewusst kein CHECK - hier stehen Tatsachen von Sony, keine
	 * Auswahl des Nutzers. Das Aufteilen passiert erst beim Matching in Stufe 4.
	 */
	platform: string;
	icon_url: string | null;
	defined_bronze: number;
	defined_silver: number;
	defined_gold: number;
	defined_platinum: number;
	earned_bronze: number;
	earned_silver: number;
	earned_gold: number;
	earned_platinum: number;
	progress_pct: number;
	last_played_at: string | null;
};

export type NormalisierungsErgebnis = {
	titel: TrophyTitel[];
	/** Eintraege ohne Pflichtfelder. Gezaehlt statt verschwiegen. */
	verworfen: number;
};

export class NormalisierungsError extends Error {}

type RohStufen = { bronze?: unknown; silver?: unknown; gold?: unknown; platinum?: unknown };

/** Fehlende oder unsinnige Zaehler werden zu 0, nicht zu NaN. */
function zahl(wert: unknown): number {
	return typeof wert === "number" && Number.isFinite(wert) && wert >= 0 ? Math.trunc(wert) : 0;
}

function text(wert: unknown): string | null {
	return typeof wert === "string" && wert !== "" ? wert : null;
}

function stufen(roh: unknown): Required<RohStufen> extends never ? never : RohStufen {
	return (typeof roh === "object" && roh !== null ? roh : {}) as RohStufen;
}

/**
 * Wertet eine Rohantwort aus.
 *
 * Einzelne unbrauchbare Eintraege werden gezaehlt und uebersprungen statt zu
 * werfen - eine kaputte Zeile darf nicht 100 gute mitreissen. Nur wenn die
 * Antwort als Ganzes unlesbar ist, gibt es einen Fehler.
 */
export function normalisiereSeite(raw: string): NormalisierungsErgebnis {
	let geparst: unknown;
	try {
		geparst = JSON.parse(raw);
	} catch {
		throw new NormalisierungsError("Rohantwort ist kein gültiges JSON.");
	}

	const liste = (geparst as { trophyTitles?: unknown })?.trophyTitles;
	if (!Array.isArray(liste)) {
		throw new NormalisierungsError("Rohantwort enthält kein Feld 'trophyTitles'.");
	}

	const titel: TrophyTitel[] = [];
	let verworfen = 0;

	for (const eintrag of liste) {
		const e = (typeof eintrag === "object" && eintrag !== null ? eintrag : {}) as Record<
			string,
			unknown
		>;

		const id = text(e.npCommunicationId);
		const name = text(e.trophyTitleName);
		if (!id || !name) {
			verworfen++;
			continue;
		}

		const definiert = stufen(e.definedTrophies);
		const erspielt = stufen(e.earnedTrophies);

		titel.push({
			np_communication_id: id,
			np_service_name: text(e.npServiceName) ?? "trophy",
			title_name: name,
			platform: text(e.trophyTitlePlatform) ?? "unbekannt",
			icon_url: text(e.trophyTitleIconUrl),
			defined_bronze: zahl(definiert.bronze),
			defined_silver: zahl(definiert.silver),
			defined_gold: zahl(definiert.gold),
			defined_platinum: zahl(definiert.platinum),
			earned_bronze: zahl(erspielt.bronze),
			earned_silver: zahl(erspielt.silver),
			earned_gold: zahl(erspielt.gold),
			earned_platinum: zahl(erspielt.platinum),
			progress_pct: Math.min(100, zahl(e.progress)),
			last_played_at: text(e.lastUpdatedDateTime),
		});
	}

	return { titel, verworfen };
}

/**
 * Platin-Kennzeichen, dreiwertig.
 *
 * Die Pruefung auf defined_platinum > 0 ist zwingend (Abschnitt 4.1): 93 von
 * 431 Titeln der echten Sammlung definieren gar keine Platin-Trophaee. Als
 * Boolean modelliert wuerden sie dauerhaft als "Platin offen" erscheinen.
 */
export type PlatinStand = "erspielt" | "offen" | "nicht_verfuegbar";

export function platinStand(defined_platinum: number, earned_platinum: number): PlatinStand {
	if (defined_platinum === 0) return "nicht_verfuegbar";
	return earned_platinum > 0 ? "erspielt" : "offen";
}
