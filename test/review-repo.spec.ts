import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);

async function leeren() {
	await env.DB.batch(
		["plan_entry", "review_queue", "play_status", "trophy_progress", "release", "game"].map((t) =>
			env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
}

async function release(id: number, pct: number | null, reviewed = false): Promise<number> {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)")
		.bind(id, `Spiel ${id}`, `spiel ${id}`)
		.run();
	await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, ?, 'PS4')").bind(id, id).run();
	if (pct !== null) {
		await env.DB.prepare(
			"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, " +
				"progress_pct, defined_bronze, earned_bronze, defined_platinum, earned_platinum, synced_at, release_id, reviewed_at) " +
				"VALUES (?, 'trophy', ?, 'PS4', ?, 10, 4, 1, ?, '2026-01-01', ?, ?)",
		)
			.bind(`NPWR${id}`, `Spiel ${id}`, pct, pct >= 100 ? 1 : 0, id, reviewed ? "2026-01-02" : null)
			.run();
	}
	return id;
}

const status = async (id: number) =>
	(await env.DB.prepare("SELECT status FROM play_status WHERE release_id = ?").bind(id).first<{ status: string }>())
		?.status ?? null;
const offen = async () =>
	(await env.DB.prepare("SELECT COUNT(*) AS n FROM review_queue").first<{ n: number }>())?.n ?? 0;

beforeEach(leeren);

describe("einreihen", () => {
	it("legt 100 % nicht vor, sondern stempelt es als durchgesehen", async () => {
		await release(1, 100);
		await release(2, 95);

		const e = await repos().review.einreihen();
		expect(e).toEqual({ eingereiht: 1, alsKomplettGestempelt: 1 });

		const { results } = await env.DB.prepare("SELECT release_id FROM review_queue").all();
		expect(results).toEqual([{ release_id: 2 }]);

		// Der Stempel ist der Referenzpunkt fuer die Aenderungserkennung.
		const t = await env.DB.prepare(
			"SELECT reviewed_earned_total, reviewed_defined_total, reviewed_at FROM trophy_progress WHERE release_id = 1",
		).first<{ reviewed_earned_total: number; reviewed_defined_total: number; reviewed_at: string | null }>();
		expect(t).toMatchObject({ reviewed_earned_total: 5, reviewed_defined_total: 11 });
		expect(t?.reviewed_at).not.toBeNull();

		// play_status bleibt unberuehrt - dort steht die Vorbelegung.
		expect(await status(1)).toBeNull();
	});

	it("legt einen 100-%-Titel auch beim zweiten Lauf nicht vor", async () => {
		await release(1, 100);
		await repos().review.einreihen();
		expect(await repos().review.einreihen()).toEqual({ eingereiht: 0, alsKomplettGestempelt: 0 });
		expect(await offen()).toBe(0);
	});

	it("reiht zugeordnete, nie durchgesehene Listen als erstimport ein", async () => {
		await release(1, 45);
		await release(2, 0);
		await release(3, 100, true); // schon durchgesehen
		await release(4, null); // keine Liste
		await env.DB.prepare(
			"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, progress_pct, synced_at) " +
				"VALUES ('NPWR9', 'trophy', 'Offen', 'PS4', 80, '2026-01-01')",
		).run(); // nicht zugeordnet

		expect(await repos().review.einreihen()).toMatchObject({ eingereiht: 2 });
		const { results } = await env.DB.prepare("SELECT release_id, reason FROM review_queue ORDER BY release_id").all();
		expect(results).toEqual([
			{ release_id: 1, reason: "erstimport" },
			{ release_id: 2, reason: "erstimport" },
		]);
	});

	it("ist idempotent", async () => {
		await release(1, 45);
		expect(await repos().review.einreihen()).toMatchObject({ eingereiht: 1 });
		expect(await repos().review.einreihen()).toMatchObject({ eingereiht: 0 });
	});

	it("laesst ein manuell bewertetes Release aus", async () => {
		await release(1, 45);
		await repos().playStatus.setzen(1, { status: "abgebrochen" });
		expect(await repos().review.einreihen()).toMatchObject({ eingereiht: 0 });
	});
});

describe("entscheiden", () => {
	async function offenerFall(pct = 45) {
		const r = await release(1, pct);
		await repos().playStatus.vorbelegen();
		await repos().review.einreihen();
		return r;
	}

	it.each([
		["durchgespielt", "durchgespielt"],
		["abgebrochen", "abgebrochen"],
		["spiele_gerade", "am_spielen"],
		["ueberspringen", "unentschieden"],
	] as const)("%s setzt den Status, stempelt und entfernt den Eintrag", async (aktion, erwartet) => {
		const r = await offenerFall();
		const e = await repos().review.entscheiden(r, aktion);

		expect(e).toEqual({ status: erwartet, planAngelegt: false });
		expect(await status(r)).toBe(erwartet);
		expect(await offen()).toBe(0);
		const t = await env.DB.prepare("SELECT reviewed_earned_total, reviewed_at FROM trophy_progress WHERE release_id = ?")
			.bind(r)
			.first<{ reviewed_earned_total: number; reviewed_at: string | null }>();
		expect(t?.reviewed_earned_total).toBe(4);
		expect(t?.reviewed_at).not.toBeNull();
	});

	it("'unveraendert' laesst den Status stehen, stempelt aber", async () => {
		const r = await offenerFall(100);
		expect(await status(r)).toBe("komplettiert");

		// 100 % wird nicht mehr eingereiht; den Eintrag hier von Hand
		// anlegen, wie ihn Stufe 13 bei einer DLC-Aenderung erzeugen wuerde.
		await env.DB.prepare("INSERT OR IGNORE INTO review_queue (release_id, reason) VALUES (?, 'erstimport')")
			.bind(r)
			.run();

		const e = await repos().review.entscheiden(r, "unveraendert");
		expect(e).toEqual({ status: "komplettiert", planAngelegt: false });
		expect(await status(r)).toBe("komplettiert");
		expect(await offen()).toBe(0);
		expect(await repos().review.einreihen()).toMatchObject({ eingereiht: 0 });
	});

	it.each([["auf_todo", "todo"], ["ins_backlog", "backlog"]] as const)(
		"%s setzt pausiert und legt genau einen plan_entry an",
		async (aktion, kind) => {
			const r = await offenerFall();
			const e = await repos().review.entscheiden(r, aktion);
			expect(e).toEqual({ status: "pausiert", planAngelegt: true });

			const { results } = await env.DB.prepare("SELECT kind, origin, status FROM plan_entry WHERE release_id = ?")
				.bind(r)
				.all();
			expect(results).toEqual([{ kind, origin: "triage", status: "offen" }]);

			// Zweite Runde (wieder eingereiht) legt keinen zweiten offenen Eintrag an.
			await env.DB.prepare("INSERT INTO review_queue (release_id, reason) VALUES (?, 'erstimport')").bind(r).run();
			expect(await repos().review.entscheiden(r, aktion)).toEqual({ status: "pausiert", planAngelegt: false });
			expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM plan_entry").first()).toEqual({ n: 1 });
		},
	);

	it("laesst Notiz, Bewertung und Datum stehen", async () => {
		const r = await offenerFall();
		await repos().playStatus.setzen(r, { status: "am_spielen", rating: 8, notes: "toll", startedAt: "2024-01-01" });
		await env.DB.prepare("INSERT INTO review_queue (release_id, reason) VALUES (?, 'erstimport')").bind(r).run();

		await repos().review.entscheiden(r, "durchgespielt");

		expect(await repos().playStatus.fuerRelease(r)).toMatchObject({
			status: "durchgespielt",
			rating: 8,
			notes: "toll",
			started_at: "2024-01-01",
		});
	});

	it("meldet null, wenn nichts offen ist", async () => {
		await release(1, 45);
		expect(await repos().review.entscheiden(1, "durchgespielt")).toBeNull();
	});
});

describe("fortschritt", () => {
	it("zaehlt offen, erledigt, gesamt und unentschieden", async () => {
		await release(1, 45);
		await release(2, 60);
		await release(3, 100, true);
		await repos().playStatus.vorbelegen();
		await repos().review.einreihen();
		await repos().review.entscheiden(2, "ueberspringen");

		expect(await repos().review.fortschritt()).toEqual({ offen: 1, erledigt: 2, gesamt: 3, unentschieden: 1 });
	});
});
