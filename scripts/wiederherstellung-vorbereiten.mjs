#!/usr/bin/env node
/**
 * Macht aus einem D1-Dump eine Datei, die sich einspielen laesst.
 *
 *   node scripts/wiederherstellung-vorbereiten.mjs backup.sql restore.sql
 *
 * Warum das noetig ist, steht in scripts/dump-ordnen.mjs. Kurz: `d1 export`
 * schreibt die Tabellen in sqlite_master-Reihenfolge, und nach einem
 * Tabellen-Neuaufbau (Migration 0003) steht `release` dort hinter allen
 * Tabellen, die auf sie verweisen.
 *
 * Der vollstaendige Ablauf steht in der README unter "Wiederherstellung" -
 * einschliesslich des PRAGMA foreign_key_check danach, das hier bewusst
 * NICHT mit erledigt wird: Es gehoert an die fertige Datenbank, nicht an die
 * Datei.
 *
 * Ausgabe sind nur Zahlen. Ein Dump traegt die vollstaendige Sammlung, und
 * dieses Repository ist oeffentlich.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fuerWiederherstellungOrdnen } from "./dump-ordnen.mjs";

const [quelle, ziel] = process.argv.slice(2);
if (!quelle || !ziel) {
	console.error("Aufruf: node scripts/wiederherstellung-vorbereiten.mjs <backup.sql> <ziel.sql>");
	process.exit(2);
}

const roh = readFileSync(quelle, "utf8");
const { sql, zahlen } = fuerWiederherstellungOrdnen(roh);

if (zahlen.tabellen === 0) {
	console.error("::error::Keine CREATE-TABLE-Anweisung gefunden - ist das ein D1-Dump?");
	process.exit(1);
}

writeFileSync(ziel, sql, "utf8");

console.log(`Gelesen:     ${quelle} (${roh.length} Byte)`);
console.log(`Anweisungen: ${zahlen.anweisungen}`);
console.log(`  PRAGMA:            ${zahlen.pragmas}`);
console.log(`  CREATE TABLE:      ${zahlen.tabellen}`);
console.log(`  INSERT:            ${zahlen.datenzeilen}`);
console.log(`  Indizes und Views: ${zahlen.indizesUndViews}`);
console.log(`Geschrieben: ${ziel} (${sql.length} Byte)`);
