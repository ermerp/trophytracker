import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

/** Leert alle Datentabellen, damit jeder Test von einem bekannten Stand startet. */
async function leeren() {
	await env.DB.batch(
		[
			"plan_entry", "review_queue", "play_status", "trophy_progress",
			"physical_copy", "digital_entitlement", "market_offer", "release", "game",
		].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
	);
}

/** Legt ein Spiel mit genau einem Release an und gibt die release_id zurueck. */
async function spiel(
	id: number,
	titel: string,
	optionen: { physisch?: "ja" | "nein" | "unbekannt"; igdb?: number | null } = {},
): Promise<number> {
	await env.DB.prepare(
		"INSERT INTO game (id, title, sort_title, igdb_id) VALUES (?, ?, ?, ?)",
	)
		.bind(id, titel, titel.toLowerCase(), optionen.igdb ?? null)
		.run();
	await env.DB.prepare(
		"INSERT INTO release (id, game_id, platform, physical_release_status) VALUES (?, ?, 'PS4', ?)",
	)
		.bind(id, id, optionen.physisch ?? "unbekannt")
		.run();
	return id;
}

async function trophaeen(releaseId: number, pct: number, platin = false) {
	await env.DB.prepare(
		"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, " +
			"progress_pct, defined_platinum, earned_platinum, synced_at, release_id) " +
			"VALUES (?, 'trophy', 'x', 'PS4', ?, ?, ?, '2026-01-01', ?)",
	)
		.bind(`NPWR${releaseId}`, pct, platin ? 1 : 0, platin ? 1 : 0, releaseId)
		.run();
}

const zaehle = async (view: string) =>
	(await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${view}`).first<{ n: number }>())?.n ?? -1;

beforeEach(leeren);

describe("v_backlog_kandidaten", () => {
	// Regression zu einem Operator-Vorrang-Fehler in Abschnitt 11 der
	// Spezifikation: Ohne Klammern um das OR band das AND staerker, und die
	// Bedingung wurde als "physical OR (digital AND alles-uebrige)" gelesen.
	// Damit galt jedes Release mit einer Disc als Kandidat.
	it("zaehlt ein unangetastetes Spiel im Besitz", async () => {
		const r = await spiel(1, "Sekiro");
		await env.DB.prepare("INSERT INTO physical_copy (release_id) VALUES (?)").bind(r).run();

		expect(await zaehle("v_backlog_kandidaten")).toBe(1);
	});

	it("schliesst ein durchgespieltes Spiel im Regal aus", async () => {
		const r = await spiel(1, "Bloodborne");
		await env.DB.prepare("INSERT INTO physical_copy (release_id) VALUES (?)").bind(r).run();
		await trophaeen(r, 100, true);
		await env.DB.prepare("INSERT INTO play_status (release_id, status) VALUES (?, 'komplettiert')")
			.bind(r)
			.run();

		expect(await zaehle("v_backlog_kandidaten")).toBe(0);
	});

	it("schliesst ein Spiel im Regal aus, das schon auf einer Liste steht", async () => {
		const r = await spiel(1, "Nioh");
		await env.DB.prepare("INSERT INTO physical_copy (release_id) VALUES (?)").bind(r).run();
		await env.DB.prepare(
			"INSERT INTO plan_entry (kind, release_id, status) VALUES ('backlog', ?, 'offen')",
		)
			.bind(r)
			.run();

		expect(await zaehle("v_backlog_kandidaten")).toBe(0);
	});

	it("schliesst ein angespieltes Spiel im Regal aus", async () => {
		const r = await spiel(1, "Ghost of Tsushima");
		await env.DB.prepare("INSERT INTO physical_copy (release_id) VALUES (?)").bind(r).run();
		await trophaeen(r, 12);

		expect(await zaehle("v_backlog_kandidaten")).toBe(0);
	});

	it("zaehlt auch rein digitalen Besitz", async () => {
		const r = await spiel(1, "Returnal");
		await env.DB.prepare(
			"INSERT INTO digital_entitlement (release_id, source) VALUES (?, 'kauf')",
		)
			.bind(r)
			.run();

		expect(await zaehle("v_backlog_kandidaten")).toBe(1);
	});

	it("zaehlt nichts, was gar nicht im Besitz ist", async () => {
		await spiel(1, "Elden Ring");
		expect(await zaehle("v_backlog_kandidaten")).toBe(0);
	});
});

describe("v_luecken", () => {
	it("zeigt digital gespielte Titel, deren Disc existiert", async () => {
		const r = await spiel(1, "Persona 5", { physisch: "ja" });
		await trophaeen(r, 40);

		const zeile = await env.DB.prepare("SELECT title, hat_platin FROM v_luecken").first();
		expect(zeile).toMatchObject({ title: "Persona 5", hat_platin: 0 });
	});

	it("zeigt nichts, solange der Physisch-Status unbekannt ist", async () => {
		// Fehlende Daten duerfen nie als "gibt es nicht" gelten - aber auch
		// nicht als Luecke behauptet werden.
		const r = await spiel(1, "Nier", { physisch: "unbekannt" });
		await trophaeen(r, 40);

		expect(await zaehle("v_luecken")).toBe(0);
	});

	it("zeigt nichts, wenn die Disc bereits im Regal steht", async () => {
		const r = await spiel(1, "Demon's Souls", { physisch: "ja" });
		await trophaeen(r, 40);
		await env.DB.prepare("INSERT INTO physical_copy (release_id) VALUES (?)").bind(r).run();

		expect(await zaehle("v_luecken")).toBe(0);
	});
});

describe("v_abweichungen", () => {
	it("meldet 'durchgespielt' bei sehr geringem Trophaeenfortschritt", async () => {
		const r = await spiel(1, "Yakuza");
		await trophaeen(r, 5);
		await env.DB.prepare("INSERT INTO play_status (release_id, status) VALUES (?, 'durchgespielt')")
			.bind(r)
			.run();

		expect(await zaehle("v_abweichungen")).toBe(1);
	});

	it("meldet 'nicht_gespielt' trotz Fortschritt", async () => {
		const r = await spiel(1, "Horizon");
		await trophaeen(r, 30);
		await env.DB.prepare("INSERT INTO play_status (release_id, status) VALUES (?, 'nicht_gespielt')")
			.bind(r)
			.run();

		expect(await zaehle("v_abweichungen")).toBe(1);
	});

	it("meldet nichts bei stimmigem Stand", async () => {
		const r = await spiel(1, "God of War");
		await trophaeen(r, 100, true);
		await env.DB.prepare("INSERT INTO play_status (release_id, status) VALUES (?, 'komplettiert')")
			.bind(r)
			.run();

		expect(await zaehle("v_abweichungen")).toBe(0);
	});
});

describe("v_ohne_igdb", () => {
	it("sammelt Spiele ohne IGDB-Zuordnung und Freitext-Eintraege", async () => {
		await spiel(1, "Unbekanntes Spiel", { igdb: null });
		await spiel(2, "Bekanntes Spiel", { igdb: 4711 });
		await env.DB.prepare(
			"INSERT INTO plan_entry (kind, title_raw, status) VALUES ('wunsch', 'Nur Text', 'offen')",
		).run();

		const { results } = await env.DB.prepare(
			"SELECT quelle, title FROM v_ohne_igdb ORDER BY quelle",
		).all<{ quelle: string; title: string }>();

		expect(results).toEqual([
			{ quelle: "plan_wunsch", title: "Nur Text" },
			{ quelle: "spiel", title: "Unbekanntes Spiel" },
		]);
	});
});
