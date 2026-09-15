import { anzeigeTitel, istErlaubtePlattform, titelSchluessel, type Plattform } from "./titel";

/**
 * Wunschlisten aus Textdateien lesen (Abschnitt 8.2).
 *
 * Reine Funktion, ohne Datenbank und ohne Netz testbar. Gegen die zwoelf
 * echten Dateien gemessen (14.09.2026): eine Datei je Jahr mit
 * Ueberschriften "-Januar" ... "-Dezember", eine Datei mit Abschnitten
 * "PS4" / "PS3", dazu die bereinigte Tabellenform (Tabulator-getrennt:
 * Datum, Titel, Plattform, Status, Original, Hinweis). Vier Dateien mit
 * BOM, alle mit CRLF; die Kodierung loest das Frontend vor dem Hochladen.
 *
 * Das Datum ist ungefaehr (Erscheinungsmonat, teils geschaetzt) und dient
 * nur dem Abgleich: Es entscheidet Gleichnamige und wird nie in plan_entry
 * geschrieben (Entscheidung des Nutzers vom 15.09.2026).
 */

export type WunschlistenForm = "jahresliste" | "plattformliste" | "tabelle" | "einfach";

export type WunschZeile = {
	/** Bereinigter Titel (anzeigeTitel), vom Nutzer spaeter aenderbar. */
	titel: string;
	/** Die Rohzeilen, aus denen der Titel entstand - mehrere bei Doppelungen. */
	originals: string[];
	plattform: Plattform | null;
	/** 'JJJJ' oder 'JJJJ-MM', null ohne Angabe. */
	listedAt: string | null;
};

export type WunschlistenErgebnis = {
	form: WunschlistenForm;
	zeilen: WunschZeile[];
	/** Zeilen, die als Ueberschrift gelesen wurden - zur Kontrolle in der Oberflaeche. */
	ueberschriften: string[];
	/** Rohzeilen, die wegen gleichem Schluessel in eine andere aufgingen. */
	zusammengefuehrt: number;
};

const MONATE = [
	"januar", "februar", "maerz", "april", "mai", "juni",
	"juli", "august", "september", "oktober", "november", "dezember",
];

/** Ueberschriften-Schreibweisen, die das Frontend hochlaedt: "PS4", "PS Vita", "PSVITA". */
const PLATTFORM_ZEILE = /^(ps ?3|ps ?4|ps ?5|ps ?vita|psvita|vita)$/i;

/** Aufzaehlungszeichen am Zeilenanfang: "- ", "* ", "• ", "1. ", "1) ". */
const AUFZAEHLUNG = /^(?:[-*•–]\s+|\d{1,2}[.)]\s+)/;

const TABELLENKOPF = /^datum\ttitel\tplattform/i;

function levenshtein(a: string, b: string): number {
	const zeile = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let vorher = zeile[0];
		zeile[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const alt = zeile[j];
			zeile[j] = Math.min(zeile[j] + 1, zeile[j - 1] + 1, vorher + (a[i - 1] === b[j - 1] ? 0 : 1));
			vorher = alt;
		}
	}
	return zeile[b.length];
}

/**
 * Monat aus einer Ueberschrift, 1-12, oder null. Schreibfehler bis
 * Editierdistanz 2 ("Oktiber", "Febuar") werden erkannt, sonst bleibt der
 * Monat unbekannt - die Zeile ist trotzdem eine Ueberschrift, kein Titel.
 */
export function monatAus(wort: string): number | null {
	const w = wort
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/ä/g, "ae")
		.replace(/[^a-z]/g, "");
	if (w === "") return null;
	let bestI = -1;
	let bestD = Number.POSITIVE_INFINITY;
	MONATE.forEach((m, i) => {
		const d = m.startsWith(w) && w.length >= 3 ? 0 : levenshtein(w, m);
		if (d <= 2 && d < bestD) {
			bestI = i;
			bestD = d;
		}
	});
	return bestI >= 0 ? bestI + 1 : null;
}

/**
 * Eine Zeile, die mit "-" beginnt und aus einem Wort besteht, ist eine
 * Monatsueberschrift - auch mit Tippfehler ("-Oktiber", "- August"). Ein
 * Titel wie "- Dying Light" (zwei Woerter) ist keine.
 */
function alsMonatsueberschrift(zeile: string): { monat: number | null } | null {
	const m = /^-\s*([^\s-]+)$/.exec(zeile);
	if (!m) return null;
	return { monat: monatAus(m[1]) };
}

function alsPlattform(zeile: string): Plattform | null {
	if (!PLATTFORM_ZEILE.test(zeile)) return null;
	const kurz = zeile.toUpperCase().replace(/\s+/g, "");
	const wert = kurz === "VITA" ? "PSVITA" : kurz;
	return istErlaubtePlattform(wert) ? wert : null;
}

function plattformAus(feld: string): Plattform | null {
	const wert = feld.trim().toUpperCase().replace(/\s+/g, "");
	if (wert === "") return null;
	const kurz = wert === "VITA" ? "PSVITA" : wert;
	return istErlaubtePlattform(kurz) ? kurz : null;
}

/** 'JJJJ' oder 'JJJJ-MM' aus einem Tabellenfeld, sonst null. */
function datumAus(feld: string): string | null {
	const m = /^(\d{4})(?:-(\d{2}))?/.exec(feld.trim());
	if (!m) return null;
	return m[2] ? `${m[1]}-${m[2]}` : m[1];
}

function monatText(jahr: number | null, monat: number | null): string | null {
	if (jahr === null) return null;
	return monat === null ? String(jahr) : `${jahr}-${String(monat).padStart(2, "0")}`;
}

/**
 * Doppelungen (10 von 332 in den echten Listen): derselbe Schluessel in
 * zwei Jahren ist meist eine Verschiebung und wird einmal uebernommen, mit
 * dem spaeteren Datum. Eine Plattform bleibt stehen, wenn eine der Zeilen
 * eine nennt. Verschiedene Schluessel ("Judgment", "Lost Judgment") bleiben
 * getrennt - das entscheidet der Nutzer in der Durchsicht.
 */
function zusammenfuehren(zeilen: WunschZeile[]): { zeilen: WunschZeile[]; zusammengefuehrt: number } {
	const nachSchluessel = new Map<string, WunschZeile>();
	let zusammengefuehrt = 0;
	for (const z of zeilen) {
		const schluessel = titelSchluessel(z.titel);
		const vorhanden = nachSchluessel.get(schluessel);
		if (!vorhanden) {
			nachSchluessel.set(schluessel, { ...z, originals: [...z.originals] });
			continue;
		}
		zusammengefuehrt++;
		vorhanden.originals.push(...z.originals);
		if (z.listedAt !== null && (vorhanden.listedAt === null || z.listedAt > vorhanden.listedAt)) {
			vorhanden.listedAt = z.listedAt;
			vorhanden.titel = z.titel;
		}
		if (vorhanden.plattform === null) vorhanden.plattform = z.plattform;
	}
	return { zeilen: [...nachSchluessel.values()], zusammengefuehrt };
}

/**
 * Text einer Wunschliste in Zeilen zerlegen. `jahr` kommt aus dem
 * Dateinamen (vom Nutzer korrigierbar) und gilt fuer Jahreslisten und
 * einfache Listen; die Tabellenform bringt ihr Datum selbst mit.
 */
export function parseWunschliste(text: string, optionen: { jahr?: number | null } = {}): WunschlistenErgebnis {
	const jahr = optionen.jahr ?? null;
	const roh = text
		.replace(/^﻿/, "")
		.split(/\r\n|\r|\n/)
		.map((z) => z.replace(/\s+$/, ""))
		.filter((z) => z.trim() !== "");

	if (roh.length > 0 && TABELLENKOPF.test(roh[0].trim())) {
		return parseTabelle(roh.slice(1));
	}

	let form: WunschlistenForm = "einfach";
	let monat: number | null = null;
	let plattform: Plattform | null = null;
	const ueberschriften: string[] = [];
	const zeilen: WunschZeile[] = [];

	for (const zeile of roh) {
		const z = zeile.trim();
		const monatsUeberschrift = alsMonatsueberschrift(z);
		if (monatsUeberschrift) {
			form = form === "einfach" ? "jahresliste" : form;
			monat = monatsUeberschrift.monat;
			ueberschriften.push(z);
			continue;
		}
		const p = alsPlattform(z);
		if (p) {
			form = form === "einfach" ? "plattformliste" : form;
			plattform = p;
			ueberschriften.push(z);
			continue;
		}
		const titel = anzeigeTitel(z.replace(AUFZAEHLUNG, ""));
		if (titel === "") continue;
		zeilen.push({ titel, originals: [z], plattform, listedAt: monatText(jahr, monat) });
	}

	const ergebnis = zusammenfuehren(zeilen);
	return { form, zeilen: ergebnis.zeilen, ueberschriften, zusammengefuehrt: ergebnis.zusammengefuehrt };
}

/**
 * Bereinigte Tabellenform: Datum, Titel, Plattform, dann Messspalten
 * (Status, Original, Hinweis), die absichtlich nicht gelesen werden - sie
 * waren Ergebnis der Messung, keine Entscheidung. Der Abgleich laeuft frisch.
 */
function parseTabelle(roh: string[]): WunschlistenErgebnis {
	const zeilen: WunschZeile[] = [];
	for (const zeile of roh) {
		const felder = zeile.split("\t");
		const titel = anzeigeTitel(felder[1] ?? "");
		if (titel === "") continue;
		zeilen.push({
			titel,
			originals: [zeile],
			plattform: plattformAus(felder[2] ?? ""),
			listedAt: datumAus(felder[0] ?? ""),
		});
	}
	const ergebnis = zusammenfuehren(zeilen);
	return { form: "tabelle", zeilen: ergebnis.zeilen, ueberschriften: [], zusammengefuehrt: ergebnis.zusammengefuehrt };
}

/** Jahr aus einem Dateinamen wie "2021.txt" oder "wunschliste-2021-03.txt". */
export function jahrAusDateiname(name: string | null | undefined): number | null {
	if (!name) return null;
	const m = /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(name);
	return m ? Number(m[1]) : null;
}
