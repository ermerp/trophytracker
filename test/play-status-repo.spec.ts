import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);

async function leeren() {
	await env.DB.batch(
		["review_queue", "play_status", "trophy_progress", "release", "game"].map((t) =>
			env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
}

async function release(id: number, pct: number | null): Promise<number> {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)")
		.bind(id, `Spiel ${id}`, `spiel ${id}`)
		.run();
	await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, ?, 'PS4')").bind(id, id).run();
	if (pct !== null) {
		await env.DB.prepare(
			"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, " +
				"progress_pct, defined_bronze, earned_bronze, defined_platinum, earned_platinum, synced_at, release_id) " +
				"VALUES (?, 'trophy', ?, 'PS4', ?, 10, 4, 1, ?, '2026-01-01', ?)",
		)
			.bind(`NPWR${id}`, `Spiel ${id}`, pct, pct >= 100 ? 1 : 0, id)
			.run();
	}
	return id;
}

const status = async (id: number) =>
	(await env.DB.prepare("SELECT status FROM play_status WHERE release_id = ?").bind(id).first<{ status: string }>())
		?.status ?? null;

beforeEach(leeren);

describe("vorbelegen (Abschnitt 4.2)", () => {
	it("legt fuer Listen mit Fortschritt eine Zeile an, fuer 0 % keine", async () => {
		await release(1, 100);
		await release(2, 45);
		await release(3, 0);
		await release(4, null);

		expect(await repos().playStatus.vorbelegen()).toBe(2);
		expect(await status(1)).toBe("komplettiert");
		expect(await status(2)).toBe("am_spielen");
		expect(await status(3)).toBeNull();
		expect(await status(4)).toBeNull();
	});

	it("ersetzt 'nicht_gespielt', sobald Fortschritt da ist", async () => {
		await release(1, 30);
		await env.DB.prepare("INSERT INTO play_status (release_id, status) VALUES (1, 'nicht_gespielt')").run();

		expect(await repos().playStatus.vorbelegen()).toBe(1);
		expect(await status(1)).toBe("am_spielen");
	});

	it("laesst jeden anderen Status stehen - auch 'am_spielen' bei 100 %", async () => {
		await release(1, 100);
		await release(2, 100);
		await release(3, 60);
		await env.DB.batch([
			env.DB.prepare("INSERT INTO play_status (release_id, status) VALUES (1, 'abgebrochen')"),
			env.DB.prepare("INSERT INTO play_status (release_id, status) VALUES (2, 'am_spielen')"),
			env.DB.prepare("INSERT INTO play_status (release_id, status) VALUES (3, 'durchgespielt')"),
		]);

		expect(await repos().playStatus.vorbelegen()).toBe(0);
		expect(await status(1)).toBe("abgebrochen");
		expect(await status(2)).toBe("am_spielen");
		expect(await status(3)).toBe("durchgespielt");
	});

	it("ist idempotent", async () => {
		await release(1, 50);
		expect(await repos().playStatus.vorbelegen()).toBe(1);
		expect(await repos().playStatus.vorbelegen()).toBe(0);
	});

	it("ignoriert Listen ohne Release", async () => {
		await env.DB.prepare(
			"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, progress_pct, synced_at) " +
				"VALUES ('NPWR9', 'trophy', 'Offen', 'PS4', 80, '2026-01-01')",
		).run();
		expect(await repos().playStatus.vorbelegen()).toBe(0);
	});
});

describe("setzen", () => {
	it("legt an, aktualisiert und gibt die Zeile zurueck", async () => {
		await release(1, 45);
		const erste = await repos().playStatus.setzen(1, { status: "pausiert", rating: 7, notes: "spaeter" });
		expect(erste).toMatchObject({ release_id: 1, status: "pausiert", rating: 7, notes: "spaeter", started_at: null });

		const zweite = await repos().playStatus.setzen(1, { status: "durchgespielt", startedAt: "2024-01-02", finishedAt: "2024-03-04" });
		expect(zweite).toMatchObject({ status: "durchgespielt", started_at: "2024-01-02", finished_at: "2024-03-04", rating: null, notes: null });
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM play_status").first()).toEqual({ n: 1 });
	});

	it("gilt als Durchsicht: stempelt reviewed_* und raeumt die Pruefliste (8.1)", async () => {
		await release(1, 45);
		await env.DB.prepare("INSERT INTO review_queue (release_id, reason) VALUES (1, 'erstimport')").run();

		await repos().playStatus.setzen(1, { status: "abgebrochen" });

		const t = await env.DB.prepare(
			"SELECT reviewed_earned_total, reviewed_defined_total, reviewed_at FROM trophy_progress WHERE release_id = 1",
		).first<{ reviewed_earned_total: number; reviewed_defined_total: number; reviewed_at: string | null }>();
		// Fixture: earned 4 Bronze, defined 10 Bronze + 1 Platin
		expect(t).toMatchObject({ reviewed_earned_total: 4, reviewed_defined_total: 11 });
		expect(t?.reviewed_at).not.toBeNull();
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM review_queue").first()).toEqual({ n: 0 });
	});

	it("funktioniert auch ohne Trophaeenliste", async () => {
		await release(1, null);
		expect(await repos().playStatus.setzen(1, { status: "nicht_gespielt" })).toMatchObject({ status: "nicht_gespielt" });
	});

	it("meldet ein unbekanntes Release", async () => {
		expect(await repos().playStatus.setzen(999, { status: "am_spielen" })).toBeNull();
	});

	it("ueberlebt eine anschliessende Vorbelegung", async () => {
		await release(1, 100);
		await repos().playStatus.setzen(1, { status: "abgebrochen" });
		await repos().playStatus.vorbelegen();
		expect(await status(1)).toBe("abgebrochen");
	});
});

describe("abweichungen", () => {
	it("liefert Ids fuer den Link ins Spieldetail", async () => {
		await release(1, 5);
		await repos().playStatus.setzen(1, { status: "durchgespielt" });
		expect(await repos().playStatus.abweichungen()).toEqual([
			{ game_id: 1, release_id: 1, title: "Spiel 1", platform: "PS4", progress_pct: 5, status: "durchgespielt" },
		]);
	});
});
