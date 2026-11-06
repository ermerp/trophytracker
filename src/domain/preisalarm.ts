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
 *
 * Die Ausloeser gelten nur, solange keine Meldung offen ist. Eine offene folgt
 * dem Preis des Kanals: Jeder tiefere ersetzt sie, und ist der gemeldete Preis
 * weg, entfaellt sie (Entscheidung vom 06.11.2026, "wenn weg, dann weg") -
 * ausser bei einer Grenz-Meldung, solange der Preis weiter unter der Grenze
 * liegt: Dann stimmt sie noch und zeigt den neuen Preis.
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
	offen: Partial<Record<AlarmKanal, { id: number; art: AlarmArt; preisCents: number; vorherCents: number }>>;
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

/** Der gemeldete Preis ist weg: Die offene Meldung mit dieser Id entfaellt. */
export type AlarmEntfaellt = { entfaellt: number };

export type AlarmAusgang = AlarmSchreiben | AlarmEntfaellt;

export const istEntfallen = (a: AlarmAusgang): a is AlarmEntfaellt => "entfaellt" in a;

const REIHEN_JE_KANAL: Record<AlarmKanal, readonly AlarmReihe[]> = {
	gebraucht: ["haendler", "markt"],
	store: ["store"],
};

/** `YYYY-MM-DD HH:MM:SS` (UTC, wie SQLite `datetime('now')`) als Millisekunden. */
const ms = (am: string): number => Date.parse(`${am.replace(" ", "T")}Z`);

/**
 * Was die Preise eines Laufs an den Meldungen aendern.
 *
 * `kanal` ist der Kanal des Schritts, der die Preise liefert. Gehoert das
 * Release zum anderen Kanal, meldet dieser Schritt nichts - ein Release mit
 * Disc meldet nicht ueber den Store.
 *
 * `neu` ist alles, was der Lauf im Kanal gefunden hat: Leer heisst "kein
 * Preis mehr da" - das darf nur ein Aufrufer sagen, der wirklich gefragt hat.
 *
 * Gibt null zurueck, wenn nichts zu schreiben ist.
 */
export function alarmPruefen(
	lage: AlarmLage,
	kanal: AlarmKanal,
	neu: readonly NeuerPreis[],
	jetzt: Date,
): AlarmAusgang | null {
	const eigene = neu.filter((n) => REIHEN_JE_KANAL[kanal].includes(n.reihe));
	const offen = lage.offen[kanal];
	const aktuell = eigene.length === 0 ? null : eigene.reduce((a, b) => (b.preisCents < a.preisCents ? b : a));
	if (aktuell === null) return offen ? { entfaellt: offen.id } : null;
	if (alarmKanal(lage.disc, lage.kaufVerworfen, lage.hatGebrauchtreihe) !== kanal) {
		return offen && aktuell.preisCents > offen.preisCents ? { entfaellt: offen.id } : null;
	}

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
		const tiefster = aktuell;
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

	// Der tiefste Preis traegt die Meldung; bei Gleichstand das Allzeittief,
	// weil es mehr sagt als "unter deiner Grenze".
	const wahl =
		kandidaten.length === 0
			? null
			: kandidaten.reduce((a, b) =>
					b.preisCents < a.preisCents || (b.preisCents === a.preisCents && b.art === "tief" && a.art !== "tief") ? b : a,
				);

	if (!offen) return wahl ? { ...wahl, releaseId: lage.releaseId, kanal, ersetzt: null } : null;

	// Hoechstens eine offene Meldung, und sie folgt dem Preis.
	if (aktuell.preisCents === offen.preisCents) return null;
	const folgen = (art: AlarmArt, vorherCents: number): AlarmSchreiben => ({
		art,
		reihe: aktuell.reihe,
		preisCents: aktuell.preisCents,
		vorherCents,
		ebayItemId: aktuell.ebayItemId,
		releaseId: lage.releaseId,
		kanal,
		ersetzt: offen.id,
	});
	if (aktuell.preisCents < offen.preisCents) {
		// Ob der neue Preis selbst ausgeloest haette, spielt keine Rolle: Auch
		// fuenf Prozent tiefer ist der bessere Preis.
		return wahl?.preisCents === aktuell.preisCents ? { ...wahl, releaseId: lage.releaseId, kanal, ersetzt: offen.id } : folgen(offen.art, offen.vorherCents);
	}
	if (offen.art === "grenze" && grenze !== null && aktuell.preisCents < grenze) return folgen("grenze", grenze);
	return { entfaellt: offen.id };
}
