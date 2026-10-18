/**
 * Betriebswarnungen (Stufe 18m, Abschnitt 16.2).
 *
 * **Die Fakten schreibt der Cron, das Urteil entsteht hier, beim Lesen.**
 * Nichts davon wird gespeichert: Eine Warnung verschwindet von selbst, sobald
 * ihre Fakten sie nicht mehr tragen, und ein ganz ausgefallener Cron faellt
 * gerade deshalb auf - er schreibt nichts mehr, und das Alter seines letzten
 * Ausgangs waechst.
 *
 * Zwei Stufen (Entscheidungen des Nutzers vom 18.10.2026):
 * - `rot`: Handlungsbedarf. Block auf der Seite und oben in der Tafel.
 * - `kenntnis`: zur Kenntnis. Nur hinter der Glocke, still.
 *
 * Rein, ohne D1 und ohne Uhr: `jetzt` kommt von aussen, damit die Grenzen
 * (26 Stunden, 14 und 3 Tage) im Test genau zu treffen sind.
 */

/**
 * Was die Regeln vom Zugang brauchen - strukturell dasselbe wie
 * `CredentialAnzeige` (src/db/credentials.ts), ohne dass die Domain die
 * Datenbankschicht kennt.
 */
export type ZugangFakt = {
	eingerichtet: boolean;
	status: string | null;
	npssoHinterlegtAm: string | null;
	npssoLaeuftAbUm: string | null;
};

/** Der letzte Ausgang eines Bereichs - wie `CronFakt` in src/db/sync.ts. */
export type AusgangFakt = { am: string; getan: string; meldung: boolean; offen?: number };

/** Der Stand unter `cron_stand` - wie `CronStand` in src/db/sync.ts. */
export type StandFakt = {
	psn?: AusgangFakt;
	wartung?: AusgangFakt;
	ohneAusgang?: { anzahl: number; von: string; bis: string; bereich: string; gekappt?: boolean; gemeldetAm: string };
};

export type BetriebStufe = "rot" | "kenntnis";

/** Jede Art hat einen Satz und einen festen Platz in der Reihenfolge. */
export const BETRIEB_ARTEN = [
	"automatik_still",
	"zugang_abgelaufen",
	"zugang_endet",
	"sync_gescheitert",
	"sicherung",
	"ohne_ausgang",
	"meldung",
	"kaufliste",
	"fenster_offen",
] as const;
export type BetriebArt = (typeof BETRIEB_ARTEN)[number];

/** Wohin ein Verweis fuehrt - die Oberflaeche macht daraus einen Link. */
export type BetriebZiel = "einstellungen";

export type Betriebswarnung = {
	art: BetriebArt;
	stufe: BetriebStufe;
	/** Der Satz fuer die Oberflaeche - nur feste Texte, Zahlen und Daten. */
	text: string;
	ziel?: BetriebZiel;
	zielText?: string;
};

/** Ein Nacht-Sync des Crons, neueste zuerst. */
export type CronSyncLauf = {
	status: "laufend" | "erfolg" | "fehler";
	/** UTC, wie D1 es schreibt: "YYYY-MM-DD HH:MM:SS". */
	gestartetAm: string;
	/** Schon bereinigt (meldungFuer) - nie ein Fremdtext. */
	meldung: string | null;
};

export type BetriebFakten = {
	jetzt: Date;
	stand: StandFakt;
	zugang: ZugangFakt;
	/** Kuerzeste gemessene Lebensdauer eines Zugangs in Tagen (psn_zugang), oder null. */
	lebensdauerTage: number | null;
	/** Die juengsten Nacht-Syncs, neueste zuerst (zwei reichen). */
	syncLaeufe: CronSyncLauf[];
	/** Letzte erfolgreiche Sicherung (ISO), oder null fuer "noch nie". */
	sicherungAm: string | null;
	/** `fehlerAm` der Kaufliste (YYYY-MM-DD), oder null. */
	kauflisteFehlerAm: string | null;
};

/** Ohne vermerkten Ausgang laenger als das, und der Bereich gilt als still (Entscheidung vom 18.10.2026). */
export const STILL_NACH_STUNDEN = 26;
/** Vorlauf vor dem erwarteten Ende des Zugangs: zur Kenntnis / rot. */
export const ZUGANG_KENNTNIS_TAGE = 14;
export const ZUGANG_ROT_TAGE = 3;
/** Die Sicherung laeuft woechentlich; acht Tage, nicht sieben (14.2). */
export const SICHERUNG_ROT_NACH_TAGEN = 8;
/** Wie lange ein Hinweis auf eine Nacht stehen bleibt. */
const HINWEIS_STUNDEN = 24;

/**
 * "Bis Fensterende nicht fertig" ruht bis 20i: Mit der Marktfrist von 24
 * Stunden schliesst das Wartungsfenster jede Nacht mit Rest (`offen=18` am
 * 18.10.2026). Gebaut und getestet, aber erst nach 20i scharf (16.2).
 */
export const FENSTERREGEL_SCHARF = false;

/** Ende der beiden Cron-Fenster in UTC-Stunden (wrangler.jsonc: 3-5 und 6-8). */
const FENSTERENDE_STUNDE: Record<string, number> = { psn: 6, wartung: 9 };

/** Die beiden Bereiche, im Satz als Subjekt und als Ort. */
const BEREICH: Record<string, { wer: string; wo: string }> = {
	psn: { wer: "Das PSN-Fenster", wo: "im PSN-Fenster" },
	wartung: { wer: "Die Wartung", wo: "in der Wartung" },
};

/** Was ein Aufruf getan hat, so wie es in der Oberflaeche heisst. */
const SCHRITT: Record<string, string> = {
	sync: "Abruf",
	spielzeit: "Spielzeit",
	besitz: "Kaufliste",
	trophaeen: "Einzeltrophäen",
	level: "Level",
	store: "Store-Preise",
	jahre: "Trophäen je Jahr",
	igdb_auffrischen: "IGDB-Auffrischen",
	igdb_physisch: "Disc-Fassungen",
	markt: "Gebrauchtpreise",
	nichts: "Leerlauf",
	abgebrochen: "Abbruch",
};

const TAG_MS = 86_400_000;
const STUNDE_MS = 3_600_000;

/** UTC-Zeit aus D1 ("YYYY-MM-DD HH:MM[:SS]") oder ISO. */
export function zeitAus(wert: string): Date | null {
	const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(wert) ? wert : `${wert.replace(" ", "T")}Z`;
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? null : d;
}

const BERLIN = "Europe/Berlin";
const datumFormat = new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN, day: "2-digit", month: "2-digit" });
const zeitFormat = new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN, hour: "2-digit", minute: "2-digit" });

/** "24.10." - Ortszeit des Nutzers, nicht UTC. */
export const datum = (d: Date) => `${datumFormat.format(d)}`;
/** "06:30" - Ortszeit. */
export const uhrzeit = (d: Date) => zeitFormat.format(d);

/** Das erwartete Ende des Zugangs - fuer die Warnung und die Einstellungen dieselbe Rechnung. */
export type Zugangsende = {
	am: string;
	/** Woher das Ende kommt: Sonys Ankuendigung oder die kuerzeste gemessene Lebensdauer. */
	quelle: "sony" | "gemessen";
	/** Sonys Ankuendigung, falls bekannt - auch wenn sie nicht das fruehere Ende ist. */
	sonyAm: string | null;
	lebensdauerTage: number | null;
	/** Ganze Tage bis zum Ende, abgerundet; negativ, wenn es schon vorbei ist. */
	tage: number;
	stufe: BetriebStufe | null;
};

/**
 * Das fruehere von Sonys Ankuendigung und "eingetragen + kuerzeste gemessene
 * Lebensdauer" (Entscheidung des Nutzers vom 18.10.2026). Sony kuendigte
 * rund 60 Tage an, gehalten hat der erste Zugang 25 (7.1) - nach Sonys Datum
 * allein kaeme die Warnung Wochen zu spaet.
 *
 * Gerechnet in Kalendertagen ab dem Eintragungsdatum, wie die Lebensdauer
 * selbst gemessen ist: eingetragen am 29.09., 25 Tage, Ende um den 24.10.
 */
export function zugangsende(
	zugang: ZugangFakt,
	lebensdauerTage: number | null,
	jetzt: Date,
): Zugangsende | null {
	if (!zugang.eingerichtet || zugang.status === "abgelaufen") return null;
	const sony = zugang.npssoLaeuftAbUm ? zeitAus(zugang.npssoLaeuftAbUm) : null;
	const eingetragen = zugang.npssoHinterlegtAm ? zeitAus(zugang.npssoHinterlegtAm) : null;
	let gemessen: Date | null = null;
	if (eingetragen && lebensdauerTage !== null) {
		const tag = Date.UTC(eingetragen.getUTCFullYear(), eingetragen.getUTCMonth(), eingetragen.getUTCDate());
		gemessen = new Date(tag + lebensdauerTage * TAG_MS);
	}
	const ende = sony && gemessen ? (gemessen < sony ? gemessen : sony) : (gemessen ?? sony);
	if (!ende) return null;
	const tage = Math.floor((ende.getTime() - jetzt.getTime()) / TAG_MS);
	const stufe = tage <= ZUGANG_ROT_TAGE ? "rot" : tage <= ZUGANG_KENNTNIS_TAGE ? "kenntnis" : null;
	return {
		am: ende.toISOString(),
		quelle: ende === gemessen ? "gemessen" : "sony",
		sonyAm: sony ? sony.toISOString() : null,
		lebensdauerTage,
		tage,
		stufe,
	};
}

function inTagen(tage: number): string {
	if (tage < 0) return "schon überschritten";
	if (tage === 0) return "heute";
	if (tage === 1) return "morgen";
	return `in ${tage} Tagen`;
}

/** Ein Punkt ans Ende - aber keiner hinter "28.11.", das schon einen traegt. */
const satz = (text: string) => (text.endsWith(".") ? text : `${text}.`);

/** Ein UTC-Datum (YYYY-MM-DD) um einen Tag verschoben. */
function tagDavor(isoDatum: string): string {
	return new Date(Date.parse(`${isoDatum}T00:00:00Z`) - TAG_MS).toISOString().slice(0, 10);
}

/**
 * Alle Warnungen, die die Fakten tragen - Rot zuerst, dann zur Kenntnis, je
 * in der Reihenfolge von `BETRIEB_ARTEN`.
 */
export function urteile(f: BetriebFakten): Betriebswarnung[] {
	const raus: Betriebswarnung[] = [];
	const alterStunden = (wert: string) => {
		const d = zeitAus(wert);
		return d ? (f.jetzt.getTime() - d.getTime()) / STUNDE_MS : Number.POSITIVE_INFINITY;
	};

	// --- Die Automatik selbst ------------------------------------------------
	// Ein Bereich ohne Ausgang seit ueber 26 Stunden. Fehlt der Stand ganz,
	// hat der Cron seit 18j nie etwas vermerkt - das ist dasselbe Schweigen.
	const bereiche = ["psn", "wartung"] as const;
	if (bereiche.every((b) => !f.stand[b])) {
		raus.push({
			art: "automatik_still",
			stufe: "rot",
			text: "Die Automatik hat noch keinen Lauf vermerkt.",
			ziel: "einstellungen",
			zielText: "Verlauf",
		});
	} else {
		for (const b of bereiche) {
			const fakt = f.stand[b];
			const stunden = fakt ? alterStunden(fakt.am) : Number.POSITIVE_INFINITY;
			if (stunden <= STILL_NACH_STUNDEN) continue;
			const zuletzt = fakt ? zeitAus(fakt.am) : null;
			raus.push({
				art: "automatik_still",
				stufe: "rot",
				text: zuletzt
					? `${BEREICH[b].wer} ist seit ${Math.floor(stunden)} Stunden nicht gelaufen, zuletzt am ${datum(zuletzt)} um ${uhrzeit(zuletzt)}.`
					: `${BEREICH[b].wer} hat noch keinen Lauf vermerkt.`,
				ziel: "einstellungen",
				zielText: "Verlauf",
			});
		}
	}

	// --- Der Zugang ----------------------------------------------------------
	// Abgelaufen oder von PSN abgelehnt: sofort rot, unabhaengig davon, wie
	// viele Naechte der Sync daran gescheitert ist (Entscheidung vom 18.10.2026).
	const zugangWeg = f.zugang.eingerichtet && f.zugang.status === "abgelaufen";
	if (zugangWeg) {
		raus.push({
			art: "zugang_abgelaufen",
			stufe: "rot",
			text: "Der PlayStation-Zugang ist abgelaufen – der nächtliche Abruf steht still.",
			ziel: "einstellungen",
			zielText: "Neues NPSSO eintragen",
		});
	}
	const ende = zugangsende(f.zugang, f.lebensdauerTage, f.jetzt);
	if (ende?.stufe) {
		const am = new Date(ende.am);
		const sony = ende.sonyAm ? new Date(ende.sonyAm) : null;
		const text =
			ende.quelle === "gemessen"
				? satz(
						`Der PlayStation-Zugang hält vermutlich bis um den ${datum(am)} (${inTagen(ende.tage)}) – der bisher kürzeste hielt ${ende.lebensdauerTage} Tage${sony ? `, Sony nennt den ${datum(sony)}` : ""}`,
					)
				: `Der PlayStation-Zugang läuft laut Sony am ${datum(am)} ab (${inTagen(ende.tage)}).`;
		raus.push({ art: "zugang_endet", stufe: ende.stufe, text, ziel: "einstellungen", zielText: "Neues NPSSO eintragen" });
	}

	// --- Der Nacht-Sync ------------------------------------------------------
	// Eine gescheiterte Nacht ist zur Kenntnis, zwei hintereinander sind rot.
	// Liegt es am Zugang, sagt das schon die Regel darueber.
	const [letzter, davor] = f.syncLaeufe;
	let syncGemeldet = false;
	if (!zugangWeg && letzter?.status === "fehler" && alterStunden(letzter.gestartetAm) <= HINWEIS_STUNDEN) {
		const tag = letzter.gestartetAm.slice(0, 10);
		const zweite = davor?.status === "fehler" && davor.gestartetAm.slice(0, 10) === tagDavor(tag);
		const grund = letzter.meldung ? `: ${letzter.meldung}` : ".";
		raus.push({
			art: "sync_gescheitert",
			stufe: zweite ? "rot" : "kenntnis",
			text: zweite
				? `Der nächtliche Abruf ist in zwei Nächten hintereinander gescheitert${grund}`
				: `Der nächtliche Abruf ist in der letzten Nacht gescheitert${grund}`,
			ziel: "einstellungen",
			zielText: "Einstellungen",
		});
		syncGemeldet = true;
	}

	// --- Die Sicherung -------------------------------------------------------
	if (f.sicherungAm === null) {
		raus.push({
			art: "sicherung",
			stufe: "rot",
			text: "Noch keine Sicherung – die Daten liegen nur bei Cloudflare.",
			ziel: "einstellungen",
			zielText: "Einstellungen",
		});
	} else {
		const tage = Math.floor(alterStunden(f.sicherungAm) / 24);
		if (tage > SICHERUNG_ROT_NACH_TAGEN) {
			raus.push({
				art: "sicherung",
				stufe: "rot",
				text: `Die letzte Sicherung ist ${tage} Tage alt.`,
				ziel: "einstellungen",
				zielText: "Einstellungen",
			});
		}
	}

	// --- Zur Kenntnis: was in der Nacht schiefging -----------------------------
	const kette = f.stand.ohneAusgang;
	if (kette && alterStunden(kette.gemeldetAm) <= HINWEIS_STUNDEN) {
		const von = zeitAus(kette.von);
		const bis = zeitAus(kette.bis);
		const wo = kette.bereich
			.split("→")
			.map((b) => BEREICH[b]?.wo ?? b)
			.join(" und ");
		const spanne = von && bis ? (kette.anzahl > 1 ? ` (${uhrzeit(von)}–${uhrzeit(bis)})` : ` (${uhrzeit(von)})`) : "";
		const anzahl = kette.anzahl === 1 ? "Ein Aufruf" : `${kette.gekappt ? "Mindestens " : ""}${kette.anzahl} Aufrufe`;
		raus.push({
			art: "ohne_ausgang",
			stufe: "kenntnis",
			text: `${anzahl} ${wo} ${kette.anzahl === 1 ? "ist" : "sind"} ohne Ausgang geblieben${spanne}.`,
			ziel: "einstellungen",
			zielText: "Verlauf",
		});
	}

	for (const b of bereiche) {
		const fakt = f.stand[b];
		if (!fakt?.meldung || alterStunden(fakt.am) > HINWEIS_STUNDEN) continue;
		// Den gescheiterten Sync sagt schon die Regel oben.
		if (fakt.getan === "sync" && syncGemeldet) continue;
		const am = zeitAus(fakt.am);
		raus.push({
			art: "meldung",
			stufe: "kenntnis",
			text: `Der letzte Aufruf ${BEREICH[b].wo} (${SCHRITT[fakt.getan] ?? fakt.getan}) endete mit einer Meldung${am ? `, ${uhrzeit(am)}` : ""}.`,
			ziel: "einstellungen",
			zielText: "Verlauf",
		});
	}

	const heute = f.jetzt.toISOString().slice(0, 10);
	if (f.kauflisteFehlerAm && (f.kauflisteFehlerAm === heute || f.kauflisteFehlerAm === tagDavor(heute))) {
		raus.push({
			art: "kaufliste",
			stufe: "kenntnis",
			text: "Die Kaufliste ist beim letzten Abruf gescheitert; der nächste Lauf versucht es erneut.",
			ziel: "einstellungen",
			zielText: "Einstellungen",
		});
	}

	if (FENSTERREGEL_SCHARF) raus.push(...fensterOffen(f.stand, f.jetzt));

	const rang = (w: Betriebswarnung) => (w.stufe === "rot" ? 0 : 1) * 100 + BETRIEB_ARTEN.indexOf(w.art);
	return raus.sort((a, b) => rang(a) - rang(b));
}

/**
 * Ein Schritt mit Rest, nachdem sein Fenster in dieser Nacht geschlossen hat.
 * Waehrend des Fensters ist ein Rest normal - der naechste Aufruf macht weiter.
 * Exportiert, damit der Test sie pruefen kann, solange sie ruht.
 */
export function fensterOffen(stand: StandFakt, jetzt: Date): Betriebswarnung[] {
	const raus: Betriebswarnung[] = [];
	for (const b of ["psn", "wartung"] as const) {
		const fakt = stand[b];
		if (!fakt || !fakt.offen) continue;
		const am = zeitAus(fakt.am);
		if (!am) continue;
		const ende = Date.UTC(am.getUTCFullYear(), am.getUTCMonth(), am.getUTCDate(), FENSTERENDE_STUNDE[b]);
		if (jetzt.getTime() < ende || jetzt.getTime() - ende > HINWEIS_STUNDEN * STUNDE_MS) continue;
		raus.push({
			art: "fenster_offen",
			stufe: "kenntnis",
			text: `${SCHRITT[fakt.getan] ?? fakt.getan}: ${fakt.offen} ${fakt.offen === 1 ? "Eintrag blieb" : "Einträge blieben"} bei Fensterschluss offen.`,
			ziel: "einstellungen",
			zielText: "Verlauf",
		});
	}
	return raus;
}
