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
