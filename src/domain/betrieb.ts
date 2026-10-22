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
export type AusgangFakt = { am: string; getan: string; meldung: boolean; offen?: number; geprueft?: number };

/** Der Stand unter `cron_stand` - wie `CronStand` in src/db/sync.ts. */
export type StandFakt = {
	psn?: AusgangFakt;
	wartung?: AusgangFakt;
	/** Die Markt-Action (Stufe 20i): ihr letzter Ausgang und, getrennt, ihr letzter Beginn. */
	markt?: AusgangFakt;
	markt_begonnen?: AusgangFakt;
	/**
	 * Der letzte Lauf der Markt-Action, der etwas geprueft hat (Nachtrag
	 * 20i-b). Eigener Bereich, weil der letzte Ausgang an einem normalen Tag
	 * der Rueckfall um 08:17 ist - und der prueft dann nichts.
	 */
	markt_geprueft?: AusgangFakt;
	/** Die Store-Action (Stufe 20j), wie die Markt-Action. */
	store?: AusgangFakt;
	store_begonnen?: AusgangFakt;
	/**
	 * Der letzte Lauf der Store-Action, nach dem der Store auf dem Stand war:
	 * etwas geprueft, oder ohne Meldung und danach nichts faellig (20j).
	 */
	store_geprueft?: AusgangFakt;
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
	"markt_leer",
	"store_leer",
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
/**
 * Dasselbe fuer die Store-Action (Entscheidung des Nutzers vom 22.10.2026):
 * Normalabstand plus groesste beobachtete Verspaetung, 24 h + 5 h 30 (7.3),
 * aufgerundet. 26 reichten nicht: Der Rueckfall liegt nur zwei Stunden nach
 * dem Hauptlauf, und zwischen einem puenktlichen Rueckfall um 22:47 und dem
 * maximal verspaeteten Hauptlauf am naechsten Abend liegen 27 h 30.
 */
export const ACTION_STILL_NACH_STUNDEN = 30;

/** Ab wann ein Bereich als still gilt - die Store-Action mit ihrer eigenen Schwelle. */
const STILL_NACH: Record<"psn" | "wartung" | "markt" | "store", number> = {
	psn: STILL_NACH_STUNDEN,
	wartung: STILL_NACH_STUNDEN,
	markt: STILL_NACH_STUNDEN,
	store: ACTION_STILL_NACH_STUNDEN,
};
/** Vorlauf vor dem erwarteten Ende des Zugangs: zur Kenntnis / rot. */
export const ZUGANG_KENNTNIS_TAGE = 14;
export const ZUGANG_ROT_TAGE = 3;
/** Die Sicherung laeuft woechentlich; acht Tage, nicht sieben (14.2). */
export const SICHERUNG_ROT_NACH_TAGEN = 8;
/** Wie lange ein Hinweis auf eine Nacht stehen bleibt. */
const HINWEIS_STUNDEN = 24;

/**
 * "Nicht fertig geworden" ist seit 20i scharf. Bis dahin schloss das
 * Wartungsfenster mit der Marktfrist von 24 Stunden jede Nacht mit Rest
 * (`offen=18` am 18.10.2026); seit der Markt eine Action ist und die
 * Fristen unter 21 Stunden liegen (Store 20, Markt seit 20i-b 12), ist ein
 * Rest wieder ein Befund (16.2).
 */
export const FENSTERREGEL_SCHARF = true;

/**
 * Ende der beiden Cron-Fenster in UTC-Stunden (wrangler.jsonc: 3-5 und 6-8).
 * Markt- und Store-Action haben kein Fenster: Ihr Rest zaehlt ab ihrem Ausgang.
 */
const FENSTERENDE_STUNDE: Record<string, number> = { psn: 6, wartung: 9 };

/**
 * Ein begonnener Lauf der Markt-Action ohne Ausgang, nach so vielen Stunden.
 * Ein Lauf dauert Minuten (431 Releases, 2 Anfragen je Release zu ~0,3 s).
 */
export const MARKT_OHNE_AUSGANG_STUNDEN = 1;

/** Die Bereiche, im Satz als Subjekt und als Ort. */
const BEREICH: Record<string, { wer: string; wo: string }> = {
	psn: { wer: "Das PSN-Fenster", wo: "im PSN-Fenster" },
	wartung: { wer: "Die Wartung", wo: "in der Wartung" },
	markt: { wer: "Die Gebrauchtpreis-Action", wo: "der Gebrauchtpreis-Action" },
	store: { wer: "Die Store-Preis-Action", wo: "der Store-Preis-Action" },
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

const tagFormat = new Intl.DateTimeFormat("en-CA", { timeZone: BERLIN, year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * Der Kalendertag in Ortszeit als fortlaufende Zahl - die Differenz zweier
 * Ortstage sind die Tage, die der Nutzer im Kalender zaehlt. Bis zum Nachtrag
 * vom 19.10.2026 stand hier `Math.floor` ueber Stunden: Am 19.10. hiess der
 * 24.10. "in 4 Tagen", und rot wurde es einen Tag zu frueh.
 */
function ortstag(d: Date): number {
	const teile = Object.fromEntries(tagFormat.formatToParts(d).map((t) => [t.type, t.value]));
	return Date.UTC(Number(teile.year), Number(teile.month) - 1, Number(teile.day)) / TAG_MS;
}

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
	/** Kalendertage bis zum Ende in Ortszeit (19.10. bis 24.10. sind 5); negativ, wenn es schon vorbei ist. */
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
	const tage = ortstag(ende) - ortstag(jetzt);
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
	const bereiche = ["psn", "wartung", "markt", "store"] as const;
	if ((["psn", "wartung"] as const).every((b) => !f.stand[b])) {
		raus.push({
			art: "automatik_still",
			stufe: "rot",
			text: "Die Automatik hat noch keinen Lauf vermerkt.",
			ziel: "einstellungen",
			zielText: "Verlauf",
		});
	} else {
		// Die Markt-Action zaehlt mit (Stufe 20i): Ein Lauf, der jede Nacht
		// nach dem Beginn stirbt, laesst ihren Ausgang altern - der Beginn
		// steht unter eigenem Bereich und zaehlt hier nicht.
		for (const b of bereiche) {
			const fakt = f.stand[b];
			const stunden = fakt ? alterStunden(fakt.am) : Number.POSITIVE_INFINITY;
			if (stunden <= STILL_NACH[b]) continue;
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

	// Ein Lauf einer Action, der begonnen und keinen Ausgang hat (Markt 20i,
	// Store 20j). Ein Store-Lauf dauert ebenfalls Minuten - dieselbe Stunde.
	for (const b of ["markt", "store"] as const) {
		const begonnen = f.stand[`${b}_begonnen`];
		const ausgang = f.stand[b];
		if (
			begonnen &&
			(!ausgang || ausgang.am < begonnen.am) &&
			alterStunden(begonnen.am) > MARKT_OHNE_AUSGANG_STUNDEN &&
			alterStunden(begonnen.am) <= HINWEIS_STUNDEN
		) {
			const am = zeitAus(begonnen.am);
			raus.push({
				art: "ohne_ausgang",
				stufe: "kenntnis",
				text: `Der Lauf ${BEREICH[b].wo}${am ? ` von ${uhrzeit(am)}` : ""} ist ohne Ausgang geblieben.`,
				ziel: "einstellungen",
				zielText: "Verlauf",
			});
		}
	}

	// Die Markt-Action laeuft, prueft aber nichts (Nachtrag 20i-b). Ein
	// einzelner leerer Lauf ist normal - der Rueckfall um 08:17 findet nach
	// einem puenktlichen Lauf nichts. Erst wenn seit ueber 26 Stunden kein
	// Lauf etwas geprueft hat, muesste die Auswahl etwas enthalten haben:
	// Bei zwoelf Stunden Frist ist nach einem Tag jedes Release faellig.
	// Ein Ausgang ohne `geprueft` (vor 20i-b) sagt nichts und schweigt.
	const markt = f.stand.markt;
	if (markt?.geprueft === 0 && !markt.meldung) {
		const zuletzt = f.stand.markt_geprueft;
		const stunden = zuletzt ? alterStunden(zuletzt.am) : Number.POSITIVE_INFINITY;
		if (stunden > STILL_NACH_STUNDEN) {
			const am = zuletzt ? zeitAus(zuletzt.am) : null;
			raus.push({
				art: "markt_leer",
				stufe: "kenntnis",
				text: am
					? `${BEREICH.markt.wer} läuft, hat aber seit ${Math.floor(stunden)} Stunden kein Release geprüft, zuletzt am ${datum(am)} um ${uhrzeit(am)}.`
					: `${BEREICH.markt.wer} läuft, hat aber noch kein Release geprüft.`,
				ziel: "einstellungen",
				zielText: "Verlauf",
			});
		}
	}

	// Die Store-Action laeuft, ist aber nicht auf dem Stand (Stufe 20j) -
	// wie oben, mit ihrer eigenen Schwelle. `store_geprueft` setzt auch ein
	// leerer Lauf, nach dem nichts faellig ist: Nach einem Probelauf am
	// Nachmittag finden die Laeufe am Abend nichts, und das ist kein Befund.
	const storeAusgang = f.stand.store;
	if (storeAusgang?.geprueft === 0 && !storeAusgang.meldung) {
		const zuletzt = f.stand.store_geprueft;
		const stunden = zuletzt ? alterStunden(zuletzt.am) : Number.POSITIVE_INFINITY;
		if (stunden > ACTION_STILL_NACH_STUNDEN) {
			const am = zuletzt ? zeitAus(zuletzt.am) : null;
			raus.push({
				art: "store_leer",
				stufe: "kenntnis",
				text: am
					? `${BEREICH.store.wer} läuft, ist aber seit ${Math.floor(stunden)} Stunden nicht auf dem Stand, zuletzt am ${datum(am)} um ${uhrzeit(am)}.`
					: `${BEREICH.store.wer} läuft, hat aber noch kein Release geprüft.`,
				ziel: "einstellungen",
				zielText: "Verlauf",
			});
		}
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
	for (const b of ["psn", "wartung", "markt", "store"] as const) {
		const fakt = stand[b];
		if (!fakt || !fakt.offen) continue;
		const am = zeitAus(fakt.am);
		if (!am) continue;
		const ende =
			b === "markt" || b === "store"
				? am.getTime()
				: Date.UTC(am.getUTCFullYear(), am.getUTCMonth(), am.getUTCDate(), FENSTERENDE_STUNDE[b]);
		if (jetzt.getTime() < ende || jetzt.getTime() - ende > HINWEIS_STUNDEN * STUNDE_MS) continue;
		raus.push({
			art: "fenster_offen",
			stufe: "kenntnis",
			text: `${SCHRITT[fakt.getan] ?? fakt.getan}: ${fakt.offen} ${fakt.offen === 1 ? "Eintrag blieb" : "Einträge blieben"} ${b === "markt" || b === "store" ? "nach dem Lauf" : "bei Fensterschluss"} offen.`,
			ziel: "einstellungen",
			zielText: "Verlauf",
		});
	}
	return raus;
}
