import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// 16 Tabellen aus Migration 0001, dazu igdb_candidate aus Migration 0010
// und die drei Import-Tabellen aus Migration 0012.
const TABELLEN = [
	"app_setting", "digital_entitlement", "ean_mapping", "game", "igdb_candidate",
	"market_offer", "physical_copy", "plan_entry", "play_status", "price_snapshot",
	"psn_credentials", "psn_raw_response", "psn_sync_run", "release", "review_queue",
	"trophy_progress", "unresolved_scan", "wishlist_import", "wishlist_import_candidate",
	"wishlist_import_line",
];

const VIEWS = [
	"v_abweichungen", "v_backlog_kandidaten", "v_erscheint_bald", "v_kaufkandidaten",
	"v_luecken", "v_ohne_igdb", "v_review_offen",
];

async function namen(typ: "table" | "view"): Promise<string[]> {
	const { results } = await env.DB.prepare(
		"SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' " +
			"AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name <> 'd1_migrations' ORDER BY name",
	)
		.bind(typ)
		.all<{ name: string }>();
	return results.map((r) => r.name);
}

describe("Migration 0001", () => {
	it("legt genau die 20 Tabellen aus der Spezifikation an", async () => {
		expect(await namen("table")).toEqual(TABELLEN);
	});

	it("legt genau die 7 Views aus Abschnitt 11 an", async () => {
		expect(await namen("view")).toEqual(VIEWS);
	});

	it("hat seit Migration 0013 weder Gewichte noch eine Prioritaetsspalte", async () => {
		const { results } = await env.DB.prepare(
			"SELECT key FROM app_setting WHERE key LIKE 'w_%'",
		).all<{ key: string }>();
		expect(results).toEqual([]);

		const spalten = await env.DB.prepare("SELECT name FROM pragma_table_info('plan_entry') ORDER BY cid").all<{ name: string }>();
		expect(spalten.results.map((s) => s.name)).not.toContain("priority");
		expect(spalten.results.map((s) => s.name)).toContain("is_favorite");
	});

	it("legt keine psn_credentials-Zeile an - Abwesenheit heisst 'nicht eingerichtet'", async () => {
		const zeile = await env.DB.prepare("SELECT COUNT(*) AS n FROM psn_credentials").first<{
			n: number;
		}>();
		expect(zeile?.n).toBe(0);
	});

	it("haelt alle Views abfragbar", async () => {
		for (const view of VIEWS) {
			await expect(env.DB.prepare(`SELECT * FROM ${view} LIMIT 1`).all()).resolves.toBeDefined();
		}
	});

	it("verwendet in keiner View SELECT * - sonst wachsen Spalten lautlos mit", async () => {
		const { results } = await env.DB.prepare(
			"SELECT name, sql FROM sqlite_master WHERE type = 'view'",
		).all<{ name: string; sql: string }>();

		for (const view of results) {
			expect(view.sql, `${view.name} nutzt SELECT *`).not.toMatch(/SELECT\s+\*/i);
		}
	});
});

describe("Migration 0014", () => {
	// Die Datenmigration selbst laeuft im Setup auf leerer Tabelle; hier wird
	// ihr UPDATE aus der Datei gelesen und gegen einen Bestand wie den der
	// Produktion (To-Do aus der Triage, ohne Position) noch einmal ausgefuehrt.
	it("gibt offenen To-Do-Eintraegen ohne Position eine, hinter den vorhandenen", async () => {
		const datei = env.TEST_MIGRATIONS.find((m) => m.name.startsWith("0014"));
		expect(datei).toBeDefined();
		const update = datei!.queries.find((q) => q.trim().startsWith("UPDATE plan_entry SET position = neu.p"));
		expect(update).toBeDefined();

		await env.DB.batch(["plan_entry", "release", "game"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
		await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (1, 'x', 'x')").run();
		const einfuegen = env.DB.prepare("INSERT INTO plan_entry (id, kind, game_id, origin, status, position) VALUES (?, ?, 1, 'triage', ?, ?)");
		await env.DB.batch([
			einfuegen.bind(10, "todo", "offen", null),
			einfuegen.bind(11, "todo", "offen", 2),
			einfuegen.bind(12, "todo", "offen", null),
			einfuegen.bind(13, "todo", "erledigt", null),
			einfuegen.bind(14, "backlog", "offen", null),
		]);

		await env.DB.prepare(update!).run();

		const { results } = await env.DB.prepare("SELECT id, position FROM plan_entry ORDER BY id").all();
		expect(results).toEqual([
			{ id: 10, position: 3 },
			{ id: 11, position: 2 },
			{ id: 12, position: 4 },
			{ id: 13, position: null },
			{ id: 14, position: null },
		]);
		await env.DB.batch(["plan_entry", "game"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
	});
});
