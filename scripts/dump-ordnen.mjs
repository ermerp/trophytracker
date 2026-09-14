/**
 * Einen D1-Dump in eine Reihenfolge bringen, die sich einspielen laesst.
 *
 * Der Anlass ist gemessen, nicht vermutet (Wiederherstellungsprobe vom
 * 14.09.2026): `wrangler d1 execute --file=backup.sql` scheitert gegen eine
 * frische Datenbank mit
 *
 *   no such table: main.release
 *
 * `d1 export` schreibt die Tabellen in der Reihenfolge von `sqlite_master`.
 * Migration 0003 hat `release` neu aufgebaut (`release_neu` anlegen, alte
 * Tabelle droppen, umbenennen) - dadurch steht ihr Eintrag dort ganz hinten.
 * Im Dump entsteht `release` also erst in Zeile 1515, waehrend schon in
 * Zeile 467 `INSERT INTO "physical_copy"` laeuft und die Tabelle fuer die
 * Fremdschluesselpruefung braucht. Neun Tabellen verweisen auf `release`.
 *
 * Jeder kuenftige Tabellen-Neuaufbau erzeugt dasselbe Problem erneut. Deshalb
 * ein Skript und keine Anleitung: Der Ernstfall ist der schlechteste Moment,
 * sich eine Reihenfolge zusammenzusuchen.
 *
 * Die Loesung hat zwei Teile:
 *
 * 1. **Schema vor Daten.** Alle CREATE TABLE zuerst. Ein Fremdschluessel auf
 *    eine noch nicht existierende Tabelle ist beim Anlegen erlaubt - SQLite
 *    loest ihn erst beim Zugriff auf.
 * 2. **Fremdschluesselpruefung waehrend des Imports aus.** Die INSERTs stehen
 *    weiter in Dump-Reihenfolge, also Kinder vor Eltern. Statt sie
 *    topologisch zu sortieren - was bei jedem Schemawandel nachgezogen werden
 *    muesste - wird die Pruefung abgeschaltet und **nach** dem Import mit
 *    `PRAGMA foreign_key_check` nachgeholt. Das prueft dasselbe, aber am
 *    fertigen Bestand und in einem Schritt.
 *
 * Indizes und Views kommen zum Schluss: Sie stehen auf Tabellen, die dann
 * alle existieren, und ein Index ueber leere Tabellen aufzubauen und
 * anschliessend zu fuellen ist langsamer als andersherum.
 */

/** Zustand des Tokenizers ausserhalb von Text, Zeilen- und Blockkommentar. */
const CODE = 0;
const TEXT = 1;
const ZEILENKOMMENTAR = 2;
const BLOCKKOMMENTAR = 3;

/**
 * Zerlegt SQL in einzelne Anweisungen.
 *
 * Ein naives Trennen an ';' reicht nicht: Semikolons stehen auch in
 * Spieltiteln. Der Tokenizer kennt deshalb Textwerte ('...', mit '' als
 * maskiertem Hochkomma), Zeilenkommentare (--) und Blockkommentare.
 */
export function anweisungenZerlegen(sql) {
	const anweisungen = [];
	let zustand = CODE;
	let anfang = 0;

	for (let i = 0; i < sql.length; i++) {
		const z = sql[i];

		if (zustand === TEXT) {
			// '' ist ein maskiertes Hochkomma und beendet den Text nicht.
			if (z === "'") {
				if (sql[i + 1] === "'") i++;
				else zustand = CODE;
			}
			continue;
		}
		if (zustand === ZEILENKOMMENTAR) {
			if (z === "\n") zustand = CODE;
			continue;
		}
		if (zustand === BLOCKKOMMENTAR) {
			if (z === "*" && sql[i + 1] === "/") {
				i++;
				zustand = CODE;
			}
			continue;
		}

		if (z === "'") zustand = TEXT;
		else if (z === "-" && sql[i + 1] === "-") zustand = ZEILENKOMMENTAR;
		else if (z === "/" && sql[i + 1] === "*") zustand = BLOCKKOMMENTAR;
		else if (z === ";") {
			const anweisung = sql.slice(anfang, i + 1).trim();
			if (anweisung !== "") anweisungen.push(anweisung);
			anfang = i + 1;
		}
	}

	const rest = sql.slice(anfang).trim();
	if (rest !== "") anweisungen.push(rest);
	return anweisungen;
}

/** Erstes Schluesselwort einer Anweisung, ohne fuehrende Kommentare. */
function art(anweisung) {
	const ohneKommentare = anweisung
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/--[^\n]*/g, " ")
		.trim()
		.toUpperCase();

	if (ohneKommentare.startsWith("PRAGMA")) return "pragma";
	if (/^CREATE\s+(TABLE|VIRTUAL\s+TABLE)/.test(ohneKommentare)) return "tabelle";
	if (/^(INSERT|REPLACE)\b/.test(ohneKommentare)) return "daten";
	return "rest";
}

/**
 * Ordnet einen Dump fuer das Einspielen und gibt SQL plus Kennzahlen zurueck.
 *
 * Die Kennzahlen gehen ins Log des Wiederherstellungslaufs - nur Zahlen, nie
 * Inhalt: Ein Dump traegt die vollstaendige Sammlung.
 */
export function fuerWiederherstellungOrdnen(sql) {
	const gruppen = { pragma: [], tabelle: [], daten: [], rest: [] };
	const anweisungen = anweisungenZerlegen(sql);
	for (const a of anweisungen) gruppen[art(a)].push(a);

	const geordnet = [
		"PRAGMA foreign_keys=OFF;",
		...gruppen.pragma,
		...gruppen.tabelle,
		...gruppen.daten,
		...gruppen.rest,
	];

	return {
		sql: `${geordnet.join("\n")}\n`,
		zahlen: {
			anweisungen: anweisungen.length,
			pragmas: gruppen.pragma.length,
			tabellen: gruppen.tabelle.length,
			datenzeilen: gruppen.daten.length,
			indizesUndViews: gruppen.rest.length,
		},
	};
}
