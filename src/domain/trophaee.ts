/**
 * Einzeltrophaeen (Stufe 19b, Abschnitt 7.7).
 *
 * Reine Funktionen: Sonys Antwortform in unsere Zeilen, und die Seltenheit in
 * ihre Stufe. Kein Datenbankzugriff, damit beides ohne D1 testbar bleibt
 * (CLAUDE.md: "Testen, was Logik ist").
 */

/** Unsere Stufen, absteigend wie ueberall sonst (13). */
export const STUFEN = ["platin", "gold", "silber", "bronze"] as const;
export type Stufe = (typeof STUFEN)[number];

/** Sonys `trophyType` auf unsere deutschen Werte. */
const STUFE_AUS_SONY: Record<string, Stufe> = {
	platinum: "platin",
	gold: "gold",
	silver: "silber",
	bronze: "bronze",
};

/**
 * Die vier Seltenheitsfaecher.
 *
 * Gemessen am 01.10.2026 an 526 Trophaeen gegen Sonys eigenen `trophyRare`:
 * 0 reicht von 0,1 % bis 5,0 %, 1 von 5,1 % bis 15,0 %, 2 von 16,1 % bis
 * 49,5 %, 3 von 51,4 % bis 90,2 %. Die Schwellen liegen damit bei 5, 15 und
 * 50 Prozent.
 *
 * Gespeichert wird die Prozentzahl, nicht die Stufe: Sie ist berechnet und
 * gehoert deshalb nicht in die Datenbank (5.2). Dass wir sie selbst bilden
 * statt `trophyRare` zu uebernehmen, macht uns zugleich unabhaengig davon,
 * ob Sony seine Faecher spaeter anders schneidet.
 */
export const SELTENHEIT_SCHWELLEN = [5, 15, 50] as const;

export const SELTENHEITEN = ["ultra_selten", "sehr_selten", "selten", "haeufig"] as const;
export type Seltenheit = (typeof SELTENHEITEN)[number];

export const SELTENHEIT_TEXT: Record<Seltenheit, string> = {
	ultra_selten: "ultra selten",
	sehr_selten: "sehr selten",
	selten: "selten",
	haeufig: "häufig",
};

/** `null` heisst unbekannt und bleibt unbekannt - nie "haeufig" (Abschnitt 3). */
export function seltenheitStufe(rate: number | null | undefined): Seltenheit | null {
	if (rate === null || rate === undefined || !Number.isFinite(rate)) return null;
	const [ultra, sehr, selten] = SELTENHEIT_SCHWELLEN;
	if (rate <= ultra) return "ultra_selten";
	if (rate <= sehr) return "sehr_selten";
	if (rate <= selten) return "selten";
	return "haeufig";
}

/** Eine Trophaee, wie sie in die Datenbank geht. */
export type TrophaeeZeile = {
	trophyId: number;
	grade: Stufe;
	name: string;
	detail: string | null;
	iconUrl: string | null;
	hidden: 0 | 1;
	groupId: string;
	earned: 0 | 1;
	earnedAt: string | null;
	earnedRate: number | null;
	progressTarget: number | null;
	progressValue: number | null;
	progressRate: number | null;
	progressedAt: string | null;
};

/** Eine Gruppe (Hauptspiel oder DLC), wie sie in die Datenbank geht. */
export type GruppeZeile = {
	groupId: string;
	name: string;
	detail: string | null;
	iconUrl: string | null;
	bronze: number;
	silber: number;
	gold: number;
	platin: number;
};

/** Sonys Antwortformen, so weit wir sie anfassen. */
export type DefinitionRoh = {
	trophyId?: number | string;
	trophyType?: string;
	trophyName?: string;
	trophyDetail?: string;
	trophyIconUrl?: string;
	trophyHidden?: boolean;
	trophyGroupId?: string;
	trophyProgressTargetValue?: string | number;
};

export type StandRoh = {
	trophyId?: number | string;
	earned?: boolean;
	earnedDateTime?: string;
	trophyEarnedRate?: string | number;
	progress?: string | number;
	progressRate?: string | number;
	progressedDateTime?: string;
};

export type GruppeRoh = {
	trophyGroupId?: string;
	trophyGroupName?: string;
	trophyGroupDetail?: string;
	trophyGroupIconUrl?: string;
	definedTrophies?: { bronze?: number; silver?: number; gold?: number; platinum?: number };
};

/**
 * Sony liefert Zahlen teils als Text ("42.6", "15"), teils als Zahl. Beides
 * wird hier zur Zahl; alles andere zu `null` - ein unlesbarer Wert ist
 * unbekannt, nicht 0 (Abschnitt 3).
 */
export function zahl(wert: string | number | null | undefined): number | null {
	if (wert === null || wert === undefined || wert === "") return null;
	const n = typeof wert === "number" ? wert : Number(wert);
	return Number.isFinite(n) ? n : null;
}

function ganzzahl(wert: string | number | null | undefined): number | null {
	const n = zahl(wert);
	return n === null ? null : Math.trunc(n);
}

/**
 * Definitionen und eigenen Stand zu Zeilen verbinden.
 *
 * Der Stand wird ueber `trophyId` zugeordnet, nicht ueber die Reihenfolge:
 * Beide Antworten kommen aus zwei Abrufen, und sich auf gleiche Sortierung zu
 * verlassen waere eine Annahme ueber eine inoffizielle Schnittstelle.
 *
 * Eine Definition ohne passenden Stand ist moeglich (etwa, wenn PSN zwischen
 * den beiden Abrufen eine Trophaee ergaenzt) und zaehlt dann als nicht
 * erspielt. Umgekehrt wird ein Stand ohne Definition verworfen - ohne Namen
 * und Stufe waere die Zeile nicht anzeigbar.
 */
export function verbindeTrophaeen(definitionen: DefinitionRoh[], stand: StandRoh[]): TrophaeeZeile[] {
	const nachId = new Map<number, StandRoh>();
	for (const s of stand) {
		const id = ganzzahl(s.trophyId);
		if (id !== null) nachId.set(id, s);
	}

	const zeilen: TrophaeeZeile[] = [];
	for (const d of definitionen) {
		const trophyId = ganzzahl(d.trophyId);
		const grade = STUFE_AUS_SONY[d.trophyType ?? ""];
		// Ohne Id oder ohne bekannte Stufe waere die Zeile nicht zuzuordnen.
		// Lieber eine Trophaee weniger als eine falsche.
		if (trophyId === null || !grade) continue;

		const s = nachId.get(trophyId) ?? {};
		const earned = s.earned === true;
		zeilen.push({
			trophyId,
			grade,
			// Gemessen 311 von 311: auch versteckte tragen einen Namen. Der
			// Rueckfall ist trotzdem da, damit eine Ausnahme die ganze Liste
			// nicht kostet.
			name: d.trophyName?.trim() || "Ohne Namen",
			detail: d.trophyDetail?.trim() || null,
			iconUrl: d.trophyIconUrl ?? null,
			hidden: d.trophyHidden === true ? 1 : 0,
			groupId: d.trophyGroupId ?? "default",
			earned: earned ? 1 : 0,
			// Ein Zeitpunkt ohne erspielte Trophaee waere widerspruechlich.
			earnedAt: earned ? (s.earnedDateTime ?? null) : null,
			earnedRate: zahl(s.trophyEarnedRate),
			progressTarget: ganzzahl(d.trophyProgressTargetValue),
			progressValue: ganzzahl(s.progress),
			progressRate: zahl(s.progressRate),
			progressedAt: s.progressedDateTime ?? null,
		});
	}
	return zeilen;
}

export function verbindeGruppen(gruppen: GruppeRoh[]): GruppeZeile[] {
	const zeilen: GruppeZeile[] = [];
	for (const g of gruppen) {
		const groupId = g.trophyGroupId;
		if (!groupId) continue;
		zeilen.push({
			groupId,
			name: g.trophyGroupName?.trim() || (groupId === "default" ? "Hauptspiel" : groupId),
			detail: g.trophyGroupDetail?.trim() || null,
			iconUrl: g.trophyGroupIconUrl ?? null,
			bronze: g.definedTrophies?.bronze ?? 0,
			silber: g.definedTrophies?.silver ?? 0,
			gold: g.definedTrophies?.gold ?? 0,
			platin: g.definedTrophies?.platinum ?? 0,
		});
	}
	return zeilen;
}
