import { describe, it, expect } from "vitest";
// @ts-expect-error - reines JS-Modul ohne Typdeklaration, bewusst ausserhalb von src/
import { anweisungenZerlegen, fuerWiederherstellungOrdnen } from "../scripts/dump-ordnen.mjs";

/**
 * Umordnen eines D1-Dumps fuer die Wiederherstellung.
 *
 * Der Anlass ist gemessen: Am 14.09.2026 scheiterte die erste
 * Wiederherstellungsprobe mit "no such table: main.release", weil `d1 export`
 * die Tabellen in sqlite_master-Reihenfolge schreibt und `release` seit dem
 * Neuaufbau in Migration 0003 dort hinter allen Tabellen steht, die auf sie
 * verweisen.
 *
 * Diese Logik muss genau dann funktionieren, wenn sie gebraucht wird - also
 * an einem Tag, an dem die Produktionsdatenbank weg ist. Deshalb geprueft,
 * und nicht nur einmal von Hand ausprobiert.
 */

const zerlegt = (sql: string): string[] => anweisungenZerlegen(sql) as string[];

describe("anweisungenZerlegen", () => {
	it("trennt an Semikolons", () => {
		expect(zerlegt("SELECT 1; SELECT 2;")).toEqual(["SELECT 1;", "SELECT 2;"]);
	});

	it("laesst ein Semikolon im Textwert stehen", () => {
		expect(zerlegt("INSERT INTO g VALUES('Ratchet; Clank');SELECT 1;")).toEqual([
			"INSERT INTO g VALUES('Ratchet; Clank');",
			"SELECT 1;",
		]);
	});

	it("kommt mit einem maskierten Hochkomma zurecht", () => {
		// "Assassin's Creed" steht als 'Assassin''s Creed' im Dump. Wer hier
		// nur Hochkommata zaehlt, verliert ab dieser Zeile den Takt.
		expect(zerlegt("INSERT INTO g VALUES('Assassin''s Creed; II');SELECT 1;")).toEqual([
			"INSERT INTO g VALUES('Assassin''s Creed; II');",
			"SELECT 1;",
		]);
	});

	it("ignoriert Semikolons in Kommentaren", () => {
		expect(zerlegt("SELECT 1; -- hier; steht; nichts\nSELECT 2;")).toEqual([
			"SELECT 1;",
			"-- hier; steht; nichts\nSELECT 2;",
		]);
		expect(zerlegt("SELECT 1;/* a; b */SELECT 2;")).toEqual(["SELECT 1;", "/* a; b */SELECT 2;"]);
	});

	it("haelt mehrzeilige Anweisungen zusammen", () => {
		const sql = "CREATE TABLE g (\n  id INTEGER,\n  titel TEXT\n);\nSELECT 1;";
		expect(zerlegt(sql)).toHaveLength(2);
		expect(zerlegt(sql)[0]).toContain("titel TEXT");
	});

	it("nimmt eine Anweisung ohne abschliessendes Semikolon mit", () => {
		expect(zerlegt("SELECT 1;\nSELECT 2")).toEqual(["SELECT 1;", "SELECT 2"]);
	});

	it("liefert bei leerer Eingabe nichts", () => {
		expect(zerlegt("")).toEqual([]);
		expect(zerlegt("\n\n  \n")).toEqual([]);
	});
});

/**
 * Ein Dump in der Reihenfolge, die D1 tatsaechlich liefert: `physical_copy`
 * mit ihren Daten VOR `release`, auf die sie verweist.
 */
const DUMP = [
	"PRAGMA defer_foreign_keys=TRUE;",
	"CREATE TABLE game (id INTEGER PRIMARY KEY, title TEXT);",
	`INSERT INTO "game" VALUES(1,'Bloodborne');`,
	"CREATE TABLE physical_copy (id INTEGER PRIMARY KEY, release_id INTEGER REFERENCES release(id));",
	`INSERT INTO "physical_copy" VALUES(1,1);`,
	`CREATE TABLE IF NOT EXISTS "release" (id INTEGER PRIMARY KEY, game_id INTEGER REFERENCES game(id));`,
	`INSERT INTO "release" VALUES(1,1);`,
	"CREATE INDEX idx_release_game ON release(game_id);",
	"CREATE VIEW v_luecken AS SELECT id FROM release;",
].join("\n");

describe("fuerWiederherstellungOrdnen", () => {
	const { sql, zahlen } = fuerWiederherstellungOrdnen(DUMP) as {
		sql: string;
		zahlen: Record<string, number>;
	};
	const zeilen = sql.trimEnd().split("\n");
	const stelle = (teil: string) => zeilen.findIndex((z) => z.includes(teil));

	it("schaltet die Fremdschluesselpruefung als Erstes ab", () => {
		expect(zeilen[0]).toBe("PRAGMA foreign_keys=OFF;");
	});

	it("legt jede Tabelle an, bevor die erste Zeile geschrieben wird", () => {
		const letzteTabelle = Math.max(stelle("CREATE TABLE game"), stelle('"release" (id'));
		const ersterInsert = Math.min(stelle('INSERT INTO "game"'), stelle('INSERT INTO "physical_copy"'));
		expect(letzteTabelle).toBeLessThan(ersterInsert);
	});

	it("legt release an, bevor physical_copy gefuellt wird - der Fall vom 14.09.2026", () => {
		expect(stelle('"release" (id')).toBeLessThan(stelle('INSERT INTO "physical_copy"'));
	});

	it("baut Indizes und Views erst nach den Daten", () => {
		const letzterInsert = Math.max(...zeilen.map((z, i) => (z.startsWith("INSERT") ? i : -1)));
		expect(stelle("CREATE INDEX")).toBeGreaterThan(letzterInsert);
		expect(stelle("CREATE VIEW")).toBeGreaterThan(letzterInsert);
	});

	it("behaelt das PRAGMA aus dem Dump", () => {
		expect(sql).toContain("PRAGMA defer_foreign_keys=TRUE;");
	});

	it("verliert keine Anweisung", () => {
		expect(zahlen).toMatchObject({
			anweisungen: 9,
			pragmas: 1,
			tabellen: 3,
			datenzeilen: 3,
			indizesUndViews: 2,
		});
		// Jede Anweisung des Originals steht auch im Ergebnis.
		for (const a of zerlegt(DUMP)) expect(sql).toContain(a);
	});
});
