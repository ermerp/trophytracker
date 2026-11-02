#!/usr/bin/env node
/**
 * Baut backup.json aus einem D1-Dump, ohne den Worker (Abschnitt 14.2).
 *
 *   node scripts/json-aus-dump.mjs export/backup.sql export/backup.json
 *
 * Bis zum 02.11.2026 holte die Sicherungs-Action die Datei ueber
 * `GET /api/export/backup.json` - ein Aufruf mit 212 bis 321 ms CPU gegen die
 * 10-ms-Grenze, von der Laufzeit bis dahin geduldet. Der Dump liegt in der
 * Action ohnehin vor; dieselbe Datei entsteht daraus in einer Sekunde.
 *
 * Dasselbe Format wie die Route, nicht ein aehnliches: dieselbe Tabellenliste
 * und Sortierung (`src/db/export-tabellen.ts`, beide Wege lesen sie), derselbe
 * Schemastand aus `d1_migrations`. Geprueft am 02.11.2026 gegen die Route,
 * mit erfundenen Daten und mit dem Bestand der Produktion: gleich bis auf
 * `exportiertAm`, Zeile fuer Zeile, Wert fuer Wert, Typ fuer Typ.
 *
 * Eingespielt wird wie bei einer Wiederherstellung (`dump-ordnen.mjs`):
 * Schema vor Daten, Fremdschluesselpruefung waehrend des Imports aus. Die
 * Datenbank lebt nur im Speicher.
 *
 * Ausgabe sind nur Zahlen. Ein Dump traegt die vollstaendige Sammlung, und
 * dieses Repository ist oeffentlich.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fuerWiederherstellungOrdnen } from "./dump-ordnen.mjs";
import { EXPORT_ORDNUNG, EXPORT_TABELLEN } from "../src/db/export-tabellen.ts";

const [quelle, ziel] = process.argv.slice(2);
if (!quelle || !ziel) {
	console.error("Aufruf: node scripts/json-aus-dump.mjs <backup.sql> <backup.json>");
	process.exit(2);
}

const { sql, zahlen } = fuerWiederherstellungOrdnen(readFileSync(quelle, "utf8"));
if (zahlen.tabellen === 0) {
	console.error("::error::Keine CREATE-TABLE-Anweisung gefunden - ist das ein D1-Dump?");
	process.exit(1);
}

const db = new DatabaseSync(":memory:");
db.exec(sql);

const tabellen = {};
for (const t of EXPORT_TABELLEN) {
	// Wie die Route: SELECT * nimmt jede Spalte mit, auch kuenftige. Die Zeilen
	// kommen aus node:sqlite ohne Prototyp und werden zu gewoehnlichen Objekten.
	tabellen[t] = db
		.prepare(`SELECT * FROM ${t} ORDER BY ${EXPORT_ORDNUNG[t] ?? "rowid"}`)
		.all()
		.map((z) => ({ ...z }));
}
const schemaVersion = db.prepare("SELECT MAX(name) AS name FROM d1_migrations").get()?.name ?? null;

const json = JSON.stringify({ exportiertAm: new Date().toISOString(), schemaVersion, tabellen });
writeFileSync(ziel, json, "utf8");

console.log(`Gelesen:     ${quelle} (${zahlen.datenzeilen} INSERT)`);
console.log(`Geschrieben: ${ziel} (${json.length} Zeichen, ${EXPORT_TABELLEN.length} Tabellen)`);
