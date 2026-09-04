import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const TABELLEN = [
	"app_setting", "digital_entitlement", "ean_mapping", "game", "market_offer",
	"physical_copy", "plan_entry", "play_status", "price_snapshot", "psn_credentials",
	"psn_raw_response", "psn_sync_run", "release", "review_queue", "trophy_progress",
	"unresolved_scan",
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
	it("legt genau die 16 Tabellen aus der Spezifikation an", async () => {
		expect(await namen("table")).toEqual(TABELLEN);
	});

	it("legt genau die 7 Views aus Abschnitt 11 an", async () => {
		expect(await namen("view")).toEqual(VIEWS);
	});

	it("belegt die Gewichte der Rangformel vor", async () => {
		const { results } = await env.DB.prepare(
			"SELECT key, value FROM app_setting ORDER BY key",
		).all<{ key: string; value: string }>();

		expect(results).toEqual([
			{ key: "w_critic", value: "0.5" },
			{ key: "w_favorite", value: "0.2" },
			{ key: "w_price", value: "0" },
			{ key: "w_priority", value: "0.3" },
		]);
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
