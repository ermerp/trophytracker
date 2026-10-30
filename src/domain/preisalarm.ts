/**
 * Preisalarm (Stufe 20g, Abschnitt 16.2): ob ein neuer Preis eine Meldung
 * hinter der Glocke ausloest.
 *
 * Reine Logik ohne Datenbank, damit sie ohne D1 getestet wird. Die Preis-
 * Routen der Abendlaeufe lesen die Lage (src/db/preisalarm.ts), rufen
 * `alarmPruefen` je Release und haengen das Ergebnis in DENSELBEN Schreib-
 * Batch wie den Preis - die Nebenwirkung gehoert an den Schritt (CLAUDE.md).
 *
 * Zwei Ausloeser, beide je Release und Kanal zu EINER Meldung zusammengefasst,
 * die den tiefsten Preis zeigt (Entscheidung des Nutzers vom 30.10.2026):
 *
 * - **Allzeittief**, je Reihe gerechnet - Haendler und Markt werden nie
 *   verrechnet (Abschnitt 6): Reihe mindestens 30 Tage alt (ab dem ersten
 *   Punkt, in Tagen, nicht in Punkten), mindestens 3 Punkte mit dem neuen,
 *   und mindestens 10 % unter dem bisherigen Tief.
 * - **Grenze** am Release: meldet beim Unterschreiten und wird erst wieder
 *   scharf, wenn der Preis ueber die Grenze zurueckgeht - oder die Grenze neu
 *   gesetzt wird. Eine neue Grenze ueber dem aktuellen Preis meldet beim
 *   naechsten Lauf (Entscheidung vom 30.10.2026).
 */

export type AlarmKanal = "gebraucht" | "store";
export type AlarmReihe = "haendler" | "markt" | "store";
export type AlarmArt = "tief" | "grenze";

/** Mindesthistorie in Tagen und Punkten, Mindesttiefe (16.2, Entscheidung vom 09.10.2026). */
export const MINDEST_TAGE = 30;
export const MINDEST_PUNKTE = 3;
export const MINDEST_TIEFE = 0.1;

/**
 * Der Kanal, der fuer ein Release alarmiert - zur LESEZEIT entschieden, nie
 * gespeichert (Entscheidung vom 11.10.2026): Disc `ja` -> Gebrauchtpreis;
 * `nein` oder "physisch nicht gewuenscht" (verworfener Kauf, 5.3) -> Store;
 * `unbekannt` -> Gebrauchtpreis, sobald eine Gebrauchtreihe besteht, sonst
 * Store. So alarmiert ein Eintrag auf dem einzigen Kanal, den er hat.
 */
export function alarmKanal(disc: string, kaufVerworfen: boolean, hatGebrauchtreihe: boolean): AlarmKanal {
	if (kaufVerworfen || disc === "nein") return "store";
	if (disc === "ja") return "gebraucht";
	return hatGebrauchtreihe ? "gebraucht" : "store";
}

/** Ein Punkt einer Reihe, wie er VOR dem Schreiben des neuen Preises besteht. */
export type Punkt = { preisCents: number; am: string };

/** Was ueber ein Release vor dem Schreiben bekannt ist. */
export type AlarmLage = {
	releaseId: number;
	disc: string;
	kaufVerworfen: boolean;
	hatGebrauchtreihe: boolean;
	grenzeCents: number | null;
	grenzeAm: string | null;
	/** Bisherige Punkte je Reihe, verworfene Angebote schon herausgenommen. */
	punkte: Partial<Record<AlarmReihe, Punkt[]>>;
	/** Die offene Meldung dieses Kanals, falls es eine gibt. */
	offen: Partial<Record<AlarmKanal, { id: number; preisCents: number }>>;
	/** Wann zuletzt eine Grenz-Meldung entstand (gleich welcher Zustand), oder null. */
	letzteGrenzeAm: string | null;
};

/** Ein neuer Preis aus dem Lauf, je Reihe. */
export type NeuerPreis = { reihe: AlarmReihe; preisCents: number; ebayItemId: string | null };

/** Was zu schreiben ist: eine neue Meldung oder eine tiefere fuer die offene. */
export type AlarmSchreiben = {
	releaseId: number;
	kanal: AlarmKanal;
	art: AlarmArt;
	reihe: AlarmReihe;
	preisCents: number;
	vorherCents: number;
	ebayItemId: string | null;
	/** Id der offenen Meldung, die tiefer wird - sonst null: neue Meldung. */
	ersetzt: number | null;
};

const REIHEN_JE_KANAL: Record<AlarmKanal, readonly AlarmReihe[]> = {
	gebraucht: ["haendler", "markt"],
	store: ["store"],
};

/** `YYYY-MM-DD HH:MM:SS` (UTC, wie SQLite `datetime('now')`) als Millisekunden. */
const ms = (am: string): number => Date.parse(`${am.replace(" ", "T")}Z`);

/**
 * Ob die neuen Preise eines Laufs eine Meldung ausloesen.
 *
 * `kanal` ist der Kanal des Schritts, der die Preise liefert. Gehoert das
 * Release zum anderen Kanal, meldet dieser Schritt nichts - ein Release mit
 * Disc meldet nicht ueber den Store.
 *
 * Gibt null zurueck, wenn nichts zu schreiben ist.
 */
export function alarmPruefen(
	lage: AlarmLage,
	kanal: AlarmKanal,
	neu: readonly NeuerPreis[],
	jetzt: Date,
): AlarmSchreiben | null {
	if (alarmKanal(lage.disc, lage.kaufVerworfen, lage.hatGebrauchtreihe) !== kanal) return null;
	const eigene = neu.filter((n) => REIHEN_JE_KANAL[kanal].includes(n.reihe));
	if (eigene.length === 0) return null;

	const kandidaten: Omit<AlarmSchreiben, "ersetzt" | "releaseId" | "kanal">[] = [];

	// --- Allzeittief, je Reihe -------------------------------------------
	for (const n of eigene) {
		const bisher = lage.punkte[n.reihe] ?? [];
		if (bisher.length + 1 < MINDEST_PUNKTE) continue;
		const erster = Math.min(...bisher.map((p) => ms(p.am)));
		if (jetzt.getTime() - erster < MINDEST_TAGE * 86_400_000) continue;
		const tief = Math.min(...bisher.map((p) => p.preisCents));
		// Ganzzahlig verglichen: 10 % genau ist ein Treffer.
		if (n.preisCents * 10 > tief * 9) continue;
		kandidaten.push({ art: "tief", reihe: n.reihe, preisCents: n.preisCents, vorherCents: tief, ebayItemId: n.ebayItemId });
	}

	// --- Grenze, ueber den tiefsten Preis des Kanals -----------------------
	const grenze = lage.grenzeCents;
	if (grenze !== null) {
		const tiefster = eigene.reduce((a, b) => (b.preisCents < a.preisCents ? b : a));
		if (tiefster.preisCents < grenze) {
			// Der tiefste juengste Punkt VOR diesem Lauf: Lag er auf oder ueber
			// der Grenze, ist das hier ein Unterschreiten.
			const juengste = REIHEN_JE_KANAL[kanal].flatMap((r) => {
				const p = lage.punkte[r] ?? [];
				return p.length === 0 ? [] : [p.reduce((a, b) => (b.am > a.am ? b : a)).preisCents];
			});
			const vorherDarueber = juengste.length > 0 && Math.min(...juengste) >= grenze;
			// Seit die Grenze gilt, noch keine Grenz-Meldung: Die Grenze ist neu
			// gesetzt und damit scharf, auch wenn der Preis schon darunter lag.
			const neuGesetzt = lage.letzteGrenzeAm === null || (lage.grenzeAm !== null && lage.letzteGrenzeAm < lage.grenzeAm);
			if (vorherDarueber || neuGesetzt) {
				kandidaten.push({ art: "grenze", reihe: tiefster.reihe, preisCents: tiefster.preisCents, vorherCents: grenze, ebayItemId: tiefster.ebayItemId });
			}
		}
	}

	if (kandidaten.length === 0) return null;
	// Der tiefste Preis traegt die Meldung; bei Gleichstand das Allzeittief,
	// weil es mehr sagt als "unter deiner Grenze".
	const wahl = kandidaten.reduce((a, b) =>
		b.preisCents < a.preisCents || (b.preisCents === a.preisCents && b.art === "tief" && a.art !== "tief") ? b : a,
	);

	const offen = lage.offen[kanal];
	if (offen) {
		// Hoechstens eine offene Meldung: Nur ein tieferer Preis aendert sie.
		if (wahl.preisCents >= offen.preisCents) return null;
		return { ...wahl, releaseId: lage.releaseId, kanal, ersetzt: offen.id };
	}
	return { ...wahl, releaseId: lage.releaseId, kanal, ersetzt: null };
}
