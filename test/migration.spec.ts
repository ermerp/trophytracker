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

describe("Migration 0015", () => {
	// Dieselbe Probe wie fuer 0014: die drei Statements aus der Datei gegen
	// einen Bestand wie den der Produktion vor der Kopplung (5.5).
	it("gleicht To-Do an am_spielen an und legt Eintraege fuer am_spielen und pausiert nach", async () => {
		const datei = env.TEST_MIGRATIONS.find((m) => m.name.startsWith("0015"));
		expect(datei).toBeDefined();
		const statements = datei!.queries.map((q) => q.trim()).filter((q) => /^(UPDATE|INSERT)/.test(q));
		expect(statements).toHaveLength(4);

		await env.DB.batch(["plan_entry", "play_status", "release", "game"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
		await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (1, 'x', 'x')").run();
		const release = env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, 1, 'PS4')");
		const status = env.DB.prepare("INSERT INTO play_status (release_id, status) VALUES (?, ?)");
		const eintrag = env.DB.prepare("INSERT INTO plan_entry (kind, release_id, origin, status, position) VALUES (?, ?, 'triage', ?, ?)");
		await env.DB.batch([
			...[1, 2, 3, 4, 5, 6].map((id) => release.bind(id)),
			status.bind(1, "pausiert"), eintrag.bind("todo", 1, "offen", 1), // To-Do, bisher pausiert → am_spielen
			status.bind(2, "am_spielen"), // am_spielen ohne Eintrag → To-Do ans Ende
			status.bind(3, "pausiert"), // pausiert ohne Eintrag → Backlog
			status.bind(4, "pausiert"), eintrag.bind("backlog", 4, "offen", null), // Backlog, bleibt
			status.bind(5, "am_spielen"), eintrag.bind("todo", 5, "erledigt", null), // erledigter Eintrag zaehlt nicht → neuer To-Do
			status.bind(6, "durchgespielt"), eintrag.bind("backlog", 6, "offen", null), // durchgespielt → Eintrag erledigt
		]);

		for (const sql of statements) await env.DB.prepare(sql).run();

		const { results: stati } = await env.DB.prepare("SELECT release_id, status FROM play_status ORDER BY release_id").all();
		expect(stati).toEqual([
			{ release_id: 1, status: "am_spielen" },
			{ release_id: 2, status: "am_spielen" },
			{ release_id: 3, status: "pausiert" },
			{ release_id: 4, status: "pausiert" },
			{ release_id: 5, status: "am_spielen" },
			{ release_id: 6, status: "durchgespielt" },
		]);
		const { results: offen } = await env.DB
			.prepare("SELECT release_id, kind, position FROM plan_entry WHERE status = 'offen' ORDER BY release_id")
			.all();
		expect(offen).toEqual([
			{ release_id: 1, kind: "todo", position: 1 },
			{ release_id: 2, kind: "todo", position: 2 },
			{ release_id: 3, kind: "backlog", position: null },
			{ release_id: 4, kind: "backlog", position: null },
			{ release_id: 5, kind: "todo", position: 3 },
		]);
		expect(await env.DB.prepare("SELECT status, resolved_at IS NOT NULL AS r FROM plan_entry WHERE release_id = 6").first()).toEqual({ status: "erledigt", r: 1 });
		await env.DB.batch(["plan_entry", "play_status", "release", "game"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
	});
});

describe("Migration 0016", () => {
	// Dieselbe Probe: das UPDATE aus der Datei gegen einen Bestand mit
	// gestempelten und ungestempelten Listen.
	it("gibt gestempelten Listen den aktuellen Prozentwert als Referenz, ungestempelte bleiben NULL", async () => {
		const datei = env.TEST_MIGRATIONS.find((m) => m.name.startsWith("0016"));
		expect(datei).toBeDefined();
		const update = datei!.queries.find((q) => q.trim().startsWith("UPDATE trophy_progress"));
		expect(update).toBeDefined();

		await env.DB.prepare("DELETE FROM trophy_progress").run();
		const liste = env.DB.prepare(
			"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, progress_pct, synced_at, reviewed_at, reviewed_progress_pct) " +
				"VALUES (?, 'trophy', ?, 'PS4', ?, '2026-01-01', ?, ?)",
		);
		await env.DB.batch([
			liste.bind("NPWR1", "gestempelt", 78, "2026-01-02", null),
			liste.bind("NPWR2", "ungestempelt", 45, null, null),
			liste.bind("NPWR3", "schon befuellt", 90, "2026-01-02", 60),
		]);

		const { meta } = await env.DB.prepare(update!).run();
		expect(meta.changes).toBe(1);

		const { results } = await env.DB.prepare(
			"SELECT np_communication_id AS id, reviewed_progress_pct AS pct FROM trophy_progress ORDER BY id",
		).all();
		expect(results).toEqual([
			{ id: "NPWR1", pct: 78 },
			{ id: "NPWR2", pct: null },
			{ id: "NPWR3", pct: 60 },
		]);
		await env.DB.prepare("DELETE FROM trophy_progress").run();
	});
});
