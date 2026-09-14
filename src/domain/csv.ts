/**
 * CSV fuer Excel im deutschen Gebietsschema (Abschnitt 14.4).
 *
 * Pur und ohne Datenbank: Trennzeichen, Maskierung und Zahlenformat sind
 * Logik, die sich ohne D1 pruefen laesst.
 *
 * Drei Festlegungen, alle wegen Excel:
 * - **Semikolon** als Trennzeichen. Im deutschen Gebietsschema ist das Komma
 *   das Dezimaltrennzeichen; mit Komma als Feldtrenner zerfaellt "12,99" in
 *   zwei Spalten.
 * - **BOM** am Anfang. Ohne sie liest Excel die Datei als Windows-1252, und
 *   aus "Ragnarök" wird "RagnarÃ¶k".
 * - **CRLF** als Zeilenende, wie es RFC 4180 vorsieht.
 *
 * Ein **leeres Feld bedeutet "unbekannt"** - nie "0", nie "-". Das ist die
 * CSV-Entsprechung der Darstellungsregel aus Abschnitt 13: Ein fehlender
 * Preis als "0" waere eine Aussage, die die Daten nicht hergeben. Werte, die
 * tatsaechlich "unbekannt" *sind* (physical_release_status), stehen dagegen
 * als Wort "unbekannt" in der Spalte.
 */

/** Byte Order Mark. Excel erkennt UTF-8 nur mit ihr. */
export const BOM = "﻿";

/** Felder werden nur maskiert, wenn es noetig ist - das haelt den Dump lesbar. */
function brauchtAnfuehrungszeichen(text: string): boolean {
	return text.includes(";") || text.includes('"') || text.includes("\n") || text.includes("\r");
}

/**
 * Ein Feld.
 *
 * null und undefined werden zum leeren Feld ("unbekannt"), boolean zu
 * "ja"/"nein". Zahlen gehen mit Punkt als Dezimaltrennzeichen heraus, weil
 * hier nur ganze Zahlen vorkommen; Geldbetraege laufen ueber euroAusCents.
 */
export function csvFeld(wert: unknown): string {
	if (wert === null || wert === undefined) return "";
	if (typeof wert === "boolean") return wert ? "ja" : "nein";

	const text = String(wert);
	if (!brauchtAnfuehrungszeichen(text)) return text;
	return `"${text.replaceAll('"', '""')}"`;
}

export function csvZeile(werte: unknown[]): string {
	return werte.map(csvFeld).join(";");
}

/** Kopfzeile plus Datenzeilen, mit BOM und CRLF. */
export function csvDokument(kopf: string[], zeilen: unknown[][]): string {
	return BOM + [csvZeile(kopf), ...zeilen.map(csvZeile)].map((z) => `${z}\r\n`).join("");
}

/**
 * Cent in deutschen Dezimaltext. null bleibt leer - ein unbekannter Preis
 * darf nicht als 0 erscheinen (Abschnitt 13).
 *
 * Ohne Tausenderpunkt und ohne Waehrungszeichen: Excel soll die Spalte als
 * Zahl lesen koennen, nicht als Text.
 */
export function euroAusCents(cents: number | null | undefined): string {
	if (cents === null || cents === undefined) return "";
	const vorzeichen = cents < 0 ? "-" : "";
	const betrag = Math.abs(cents);
	return `${vorzeichen}${Math.trunc(betrag / 100)},${String(betrag % 100).padStart(2, "0")}`;
}
