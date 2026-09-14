import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const B = "https://example.com";
const hole = async (pfad: string) => (await SELF.fetch(`${B}${pfad}`)).json() as Promise<any>;
const entscheide = (id: number | string, koerper: unknown) =>
	SELF.fetch(`${B}/api/review/${id}/decide`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: typeof koerper === "string" ? koerper : JSON.stringify(koerper),
	});

async function leeren() {
	await env.DB.batch(
		["plan_entry", "review_queue", "play_status", "trophy_progress", "release", "game"].map((t) =>
			env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
}

async function release(id: number, pct: number): Promise<number> {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title, cover_url) VALUES (?, ?, ?, NULL)")
		.bind(id, `Spiel ${id}`, `spiel ${id}`)
		.run();
	await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, ?, 'PS4')").bind(id, id).run();
	await env.DB.prepare(
		"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, icon_url, " +
			"progress_pct, defined_bronze, earned_bronze, defined_platinum, earned_platinum, last_played_at, synced_at, release_id) " +
			"VALUES (?, 'trophy', ?, 'PS4', ?, ?, 20, 9, 1, ?, '2025-01-01T00:00:00Z', '2026-01-01', ?)",
	)
		.bind(`NPWR${id}`, `Spiel ${id}`, `https://beispiel.invalid/${id}.png`, pct, pct >= 100 ? 1 : 0, id)
		.run();
	return id;
}

beforeEach(async () => {
	await leeren();
	await release(1, 30);
	await release(2, 95);
	await release(3, 75);
	// 100 % kommt nicht in die Warteschlange (8.1), zaehlt aber bei "gesamt" mit.
	await release(4, 100);
	await repos().playStatus.vorbelegen();
	await repos().review.einreihen();
});

describe("GET /api/review/queue", () => {
	it("liefert den hoechsten Fortschritt zuerst, einen je Bildschirm", async () => {
		const a = await hole("/api/review/queue");
		expect(a.gesamtOffen).toBe(3);
		expect(a.eintraege).toHaveLength(1);
		expect(a.eintraege[0]).toMatchObject({
			releaseId: 2,
			spielId: 2,
			titel: "Spiel 2",
			plattform: "PS4",
			grund: "erstimport",
			grundText: "Zum ersten Mal gesehen",
			bild: "https://beispiel.invalid/2.png",
			fortschritt: 95,
			platin: "offen",
			erspielt: { bronze: 9, silber: 0, gold: 0, platin: 0 },
			definiert: { bronze: 20, silber: 0, gold: 0, platin: 1 },
			zuletztGespielt: "2025-01-01T00:00:00Z",
			aktuellerStatus: "am_spielen",
		});
	});

	it("laesst einen 100-%-Titel aus - er ist komplettiert, da ist nichts zu entscheiden", async () => {
		const a = await hole("/api/review/queue?limit=10");
		expect(a.eintraege.map((e: any) => e.releaseId)).not.toContain(4);
		expect(await hole("/api/review/progress")).toMatchObject({ offen: 3, erledigt: 1, gesamt: 4 });
	});

	it("blaettert", async () => {
		const a = await hole("/api/review/queue?limit=2&offset=1");
		expect(a.eintraege.map((e: any) => e.releaseId)).toEqual([3, 1]);
	});
});

describe("GET /api/review/progress", () => {
	it("zaehlt", async () => {
		expect(await hole("/api/review/progress")).toEqual({ offen: 3, erledigt: 1, gesamt: 4, unentschieden: 0 });
	});
});

describe("POST /api/review/:releaseId/decide", () => {
	it("entscheidet und meldet, wie viele noch offen sind", async () => {
		const antwort = await entscheide(2, { aktion: "unveraendert" });
		expect(antwort.status).toBe(200);
		expect(await antwort.json()).toEqual({
			releaseId: 2,
			aktion: "unveraendert",
			status: "am_spielen",
			planAngelegt: false,
			nochOffen: 2,
		});

		expect((await hole("/api/review/queue")).eintraege[0].releaseId).toBe(3);
	});

	it("ueberspringen macht das Spiel ueber den Filter auffindbar", async () => {
		await entscheide(1, { aktion: "ueberspringen" });
		expect(await hole("/api/review/progress")).toMatchObject({ offen: 2, unentschieden: 1 });
		const s = await hole("/api/games?playStatus=unentschieden");
		expect(s.spiele.map((x: any) => x.titel)).toEqual(["Spiel 1"]);
	});

	it("prueft Aktion, JSON und Eintrag", async () => {
		expect((await entscheide(1, { aktion: "loeschen" })).status).toBe(400);
		expect((await entscheide(1, "kaputt")).status).toBe(400);
		expect((await entscheide("x", { aktion: "durchgespielt" })).status).toBe(400);
		expect((await entscheide(999, { aktion: "durchgespielt" })).status).toBe(404);
		await entscheide(1, { aktion: "durchgespielt" });
		expect((await entscheide(1, { aktion: "durchgespielt" })).status).toBe(404);
	});

	it("ein im Spieldetail gesetzter Status entfernt den Eintrag ebenfalls", async () => {
		await SELF.fetch(`${B}/api/releases/3/play-status`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ status: "abgebrochen" }),
		});
		expect((await hole("/api/review/progress")).offen).toBe(2);
	});
});
