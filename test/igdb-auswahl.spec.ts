import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import type { Baustein } from "../src/db/baustein";

/**
 * Die Auswahlen fuers Auffrischen und die Disc-Pruefung laufen seit Stufe 18s
 * ueber Teilindizes. Auswahl UND Reihenfolge sind dieselben wie vorher: Die
 * alten Abfragen stehen hier ausgeschrieben als Referenz, sonst nirgends.
 */
const ALT = {
	auffrischen:
		"SELECT id, igdb_id FROM game WHERE igdb_id IS NOT NULL AND (igdb_synced_at IS NULL OR igdb_synced_at < datetime('now', '-7 days')) " +
		"ORDER BY igdb_synced_at IS NOT NULL, igdb_synced_at, id LIMIT ?",
	ohneFrist: "SELECT id, igdb_id FROM game WHERE igdb_id IS NOT NULL ORDER BY igdb_synced_at IS NOT NULL, igdb_synced_at, id LIMIT ?",
	vor:
		"SELECT id, igdb_id FROM game WHERE igdb_id IS NOT NULL AND (igdb_synced_at IS NULL OR igdb_synced_at < ?) " +
		"ORDER BY igdb_synced_at IS NOT NULL, igdb_synced_at, id LIMIT ?",
	offen: "SELECT COUNT(*) AS n FROM game WHERE igdb_id IS NOT NULL AND (igdb_synced_at IS NULL OR igdb_synced_at < ?)",
	disc:
		"SELECT g.id, g.igdb_id FROM game g WHERE g.igdb_id IS NOT NULL AND EXISTS (SELECT 1 FROM release r WHERE r.game_id = g.id " +
		"AND r.physical_release_status = 'unbekannt' " +
		"AND (r.physical_checked_at IS NULL OR r.physical_checked_at < datetime('now', '-30 days'))) ORDER BY g.id LIMIT ?",
	discOffen:
		"SELECT COUNT(*) AS n FROM game g WHERE g.igdb_id IS NOT NULL AND EXISTS (SELECT 1 FROM release r WHERE r.game_id = g.id " +
		"AND r.physical_release_status = 'unbekannt' " +
		"AND (r.physical_checked_at IS NULL OR r.physical_checked_at < datetime('now', '-30 days')))",
};

const repos = () => createRepositories(env.DB, env.NPSSO_KEY).igdb;

/**
 * Alt und neu in einem Batch, im selben Augenblick: `datetime('now')` gilt je
 * Anweisung, und faellt ein Sekundenwechsel dazwischen, wird wiederholt.
 */
async function gleichzeitig(alt: D1PreparedStatement, neu: Baustein<unknown>) {
	const uhr = env.DB.prepare("SELECT datetime('now') AS jetzt");
	for (let versuch = 0; versuch < 10; versuch++) {
		const [vorher, a, n, nachher] = await env.DB.batch<any>([uhr, alt, neu.anweisungen[0]!, uhr]);
		if (vorher!.results[0].jetzt === nachher!.results[0].jetzt) return { alt: a!.results, neu: n!.results };
	}
	throw new Error("kein Durchlauf ohne Sekundenwechsel");
}

/** Alter in Sekunden -> Stempel; `null` heisst nie. */
const stempel = (sekunden: number | null) => (sekunden === null ? null : `-${sekunden} seconds`);

/**
 * 240 Spiele: jedes sechste nie gestempelt, jedes fuenfte auf demselben
 * Stempel wie andere (Gleichstand), 21 im Sekundenraster um die Grenze -
 * eines davon liegt in jedem Augenblick genau darauf -, der Rest alt und jung
 * durcheinander, nie in der Reihenfolge der Ids. Jedes siebte ohne IGDB.
 */
function alter(i: number, fristTage: number): number | null {
	const frist = fristTage * 86_400;
	if (i % 6 === 0) return null;
	if (i % 5 === 0) return frist + 5_000;
	if (i <= 60) return frist - 10 + (i % 21);
	return i % 2 === 0 ? frist + ((i * 37) % 101) * 600 : ((i * 37) % 101) * 600;
}

beforeEach(async () => {
	await env.DB.batch(["release", "game"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
	const spiel = env.DB.prepare(
		"INSERT INTO game (id, title, sort_title, igdb_id, igdb_synced_at) VALUES (?, 'x', 'x', ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', ?) END)",
	);
	const release = env.DB.prepare(
		"INSERT INTO release (game_id, platform, physical_release_status, physical_checked_at) VALUES (?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', ?) END)",
	);
	const anweisungen: D1PreparedStatement[] = [];
	for (let i = 1; i <= 240; i++) {
		const s = stempel(alter(i, 7));
		anweisungen.push(spiel.bind(i, i % 7 === 0 ? null : 1_000 + i, s, s ?? ""));
		const d = stempel(alter(i, 30));
		const art = i % 4 === 0 ? "ja" : i % 11 === 0 ? "nein" : "unbekannt";
		anweisungen.push(release.bind(i, "PS4", art, d, d ?? ""));
		// Zweites Release: mal gleichfalls faellig, mal jung, mal nie geprueft.
		if (i % 3 === 0) {
			const z = stempel(alter(i + 1, 30));
			anweisungen.push(release.bind(i, "PS5", i % 2 === 0 ? "unbekannt" : "ja", z, z ?? ""));
		}
	}
	await env.DB.batch(anweisungen);
});

const GRENZEN = [1, 3, 33, 50, 100, 1_000];

describe("Auswahlen auf Index: gleich wie vorher (Stufe 18s)", () => {
	it("Auffrischen mit Frist", async () => {
		for (const n of GRENZEN) {
			const e = await gleichzeitig(env.DB.prepare(ALT.auffrischen).bind(n), repos().zumAuffrischenBaustein(n, 7));
			expect(e.neu, `LIMIT ${n}`).toEqual(e.alt);
		}
		// Der Bestand prueft wirklich: mehr als eine Portion faellig, und nicht alles.
		const alle = await repos().zumAuffrischen(1_000, 7);
		expect(alle.length).toBeGreaterThan(100);
		expect(alle.length).toBeLessThan(200);
	});

	it("Auffrischen ohne Frist", async () => {
		for (const n of GRENZEN) {
			const e = await gleichzeitig(env.DB.prepare(ALT.ohneFrist).bind(n), repos().zumAuffrischenBaustein(n));
			expect(e.neu, `LIMIT ${n}`).toEqual(e.alt);
		}
	});

	it("Durchgang von Hand: Auswahl und Rest, auch genau auf der Grenze", async () => {
		const grenzen = (
			await env.DB.prepare("SELECT DISTINCT igdb_synced_at AS s FROM game WHERE igdb_synced_at IS NOT NULL ORDER BY s").all<{ s: string }>()
		).results.map((z) => z.s);
		expect(grenzen.length).toBeGreaterThan(20);
		for (const seit of [grenzen[0]!, grenzen[10]!, grenzen[Math.floor(grenzen.length / 2)]!, grenzen.at(-1)!, "2099-01-01 00:00:00"]) {
			for (const n of [3, 50, 1_000]) {
				const alt = await env.DB.prepare(ALT.vor).bind(seit, n).all();
				expect(await repos().zumAuffrischenVor(seit, n), `${seit} LIMIT ${n}`).toEqual(alt.results);
			}
			const alt = await env.DB.prepare(ALT.offen).bind(seit).first<{ n: number }>();
			expect(await repos().auffrischOffen(seit), seit).toBe(alt!.n);
		}
	});

	it("Disc-Pruefung: Auswahl und Zaehlung", async () => {
		for (const n of GRENZEN) {
			const e = await gleichzeitig(env.DB.prepare(ALT.disc).bind(n), repos().zurDiscPruefungBaustein(n));
			expect(e.neu, `LIMIT ${n}`).toEqual(e.alt);
		}
		const alle = await repos().zurDiscPruefung(1_000);
		expect(alle.length).toBeGreaterThan(60);
		expect(alle.length).toBeLessThan(180);
		// Fern jeder Sekunde: Die Zaehlung laeuft als eigene Abfrage.
		await env.DB.prepare("UPDATE release SET physical_checked_at = datetime('now', '-40 days') WHERE physical_checked_at < datetime('now', '-29 days')").run();
		const alt = await env.DB.prepare(ALT.discOffen).first<{ n: number }>();
		expect((await repos().discZaehlung()).discOffen).toBe(alt!.n);
	});

	it("nichts faellig: beide leer", async () => {
		await env.DB.batch([
			env.DB.prepare("UPDATE game SET igdb_synced_at = datetime('now') WHERE igdb_id IS NOT NULL"),
			env.DB.prepare("UPDATE release SET physical_checked_at = datetime('now') WHERE physical_release_status = 'unbekannt'"),
		]);
		expect(await repos().zumAuffrischen(50, 7)).toEqual([]);
		expect(await repos().zurDiscPruefung(50)).toEqual([]);
	});
});

describe("Auswahlen auf Index: der Plan (Stufe 18s)", () => {
	/** Der Plan der Abfrage, die das Repository stellt - mitgehoert, nicht abgeschrieben. */
	async function plan(f: (r: ReturnType<typeof repos>) => unknown): Promise<string> {
		let sql = "";
		const db = new Proxy(env.DB, {
			get(ziel, name) {
				if (name === "prepare") return (text: string) => ((sql = text), ziel.prepare(text));
				const wert = Reflect.get(ziel, name, ziel);
				return typeof wert === "function" ? wert.bind(ziel) : wert;
			},
		});
		await f(createRepositories(db, env.NPSSO_KEY).igdb);
		const anweisung = env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`);
		const { results } = await (sql.includes("?") ? anweisung.bind(50) : anweisung).all<{ detail: string }>();
		return results.map((z) => z.detail).join(" | ");
	}
	const treffer = (text: string, teil: string) => text.split(teil).length - 1;

	it("Auffrischen: zwei Lookups im Teilindex aus 0036, kein Scan ueber game", async () => {
		const text = await plan((r) => r.zumAuffrischenBaustein(50, 7));
		expect(treffer(text, "SEARCH game USING INDEX idx_game_auffrisch_stempel")).toBe(2);
		expect(text).not.toContain("SCAN game");
	});

	it("Disc: zwei Lookups im Teilindex aus 0039, kein Scan ueber game oder release", async () => {
		for (const f of [
			(r: ReturnType<typeof repos>) => r.zurDiscPruefungBaustein(50),
			(r: ReturnType<typeof repos>) => r.discZaehlung(),
		]) {
			const text = await plan(f);
			expect(treffer(text, "SEARCH release USING COVERING INDEX idx_release_disc_offen")).toBe(2);
			expect(text).not.toContain("SCAN g");
		}
		expect(await plan((r) => r.zurDiscPruefungBaustein(50))).not.toContain("SCAN release");
	});
});
