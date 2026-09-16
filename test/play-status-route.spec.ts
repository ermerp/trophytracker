import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const B = "https://example.com";
const hole = async (pfad: string) => (await SELF.fetch(`${B}${pfad}`)).json() as Promise<any>;
const setze = (id: number, koerper: unknown) =>
	SELF.fetch(`${B}/api/releases/${id}/play-status`, {
		method: "PUT",
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

async function release(id: number, pct: number | null = null): Promise<number> {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)")
		.bind(id, `Spiel ${id}`, `spiel ${id}`)
		.run();
	await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, ?, 'PS4')").bind(id, id).run();
	if (pct !== null) {
		await env.DB.prepare(
			"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, " +
				"progress_pct, defined_platinum, synced_at, release_id) VALUES (?, 'trophy', ?, 'PS4', ?, 1, '2026-01-01', ?)",
		)
			.bind(`NPWR${id}`, `Spiel ${id}`, pct, id)
			.run();
	}
	return id;
}

beforeEach(leeren);

describe("PUT /api/releases/:id/play-status", () => {
	it("setzt die Bewertung und antwortet in deutscher Feldform", async () => {
		const r = await release(1, 40);
		const antwort = await setze(r, {
			status: "pausiert",
			begonnenAm: "2024-05-01",
			bewertung: 8,
			notiz: "  gutes Spiel ",
		});
		expect(antwort.status).toBe(200);
		expect(await antwort.json()).toMatchObject({
			releaseId: r,
			status: "pausiert",
			begonnenAm: "2024-05-01",
			beendetAm: null,
			bewertung: 8,
			notiz: "gutes Spiel",
		});
	});

	it("leert Felder mit null oder Weglassen", async () => {
		const r = await release(1);
		await setze(r, { status: "am_spielen", bewertung: 5, notiz: "x" });
		const a = await (await setze(r, { status: "am_spielen", bewertung: null })).json();
		expect(a).toMatchObject({ bewertung: null, notiz: null });
	});

	it.each([
		[{ status: "fertig" }, /Status/],
		[{ status: "am_spielen", bewertung: 11 }, /Bewertung/],
		[{ status: "am_spielen", bewertung: 2.5 }, /Bewertung/],
		[{ status: "am_spielen", begonnenAm: "1.5.2024" }, /begonnenAm/],
		[{ status: "am_spielen", beendetAm: "morgen" }, /beendetAm/],
		[{}, /Status/],
	])("lehnt %o ab", async (koerper, meldung) => {
		const r = await release(1);
		const antwort = await setze(r, koerper);
		expect(antwort.status).toBe(400);
		expect((await antwort.json() as any).fehler).toMatch(meldung);
	});

	it("meldet ungueltiges JSON und unbekannte Releases", async () => {
		expect((await setze(1, "kaputt")).status).toBe(400);
		expect((await setze(999, { status: "am_spielen" })).status).toBe(404);
	});
});

describe("GET /api/deviations", () => {
	it("listet Abweichungen mit Ids", async () => {
		const r = await release(1, 30);
		await repos().playStatus.setzen(r, { status: "nicht_gespielt" });
		await release(2, 100);
		await repos().playStatus.setzen(2, { status: "komplettiert" });

		const a = await hole("/api/deviations");
		expect(a.gesamt).toBe(1);
		expect(a.abweichungen[0]).toEqual({
			spielId: 1, releaseId: 1, titel: "Spiel 1", plattform: "PS4", fortschritt: 30, status: "nicht_gespielt",
		});
	});
});

describe("Status in Liste und Detail", () => {
	it("filtert nach playStatus; fehlende Zeile zaehlt als nicht_gespielt", async () => {
		await release(1, 100);
		await repos().playStatus.setzen(1, { status: "komplettiert" });
		await release(2, 0);

		const komplett = await hole("/api/games?playStatus=komplettiert");
		expect(komplett.spiele.map((s: any) => s.titel)).toEqual(["Spiel 1"]);
		expect(komplett.spiele[0].releases[0].status).toBe("komplettiert");

		const nie = await hole("/api/games?playStatus=nicht_gespielt");
		expect(nie.spiele.map((s: any) => s.titel)).toEqual(["Spiel 2"]);
		// In der Ausgabe bleibt die fehlende Zeile null - nicht als Aussage verkleidet.
		expect(nie.spiele[0].releases[0].status).toBeNull();

		expect((await hole("/api/games?playStatus=egal")).gesamt).toBe(2);
	});

	it("liefert die Bewertung im Detail, null ohne Zeile", async () => {
		await release(1, 50);
		await repos().playStatus.setzen(1, { status: "am_spielen", rating: 6 });
		await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (11, 1, 'PS5')").run();

		const d = await hole("/api/games/1");
		expect(d.releases[0].bewertung).toMatchObject({ status: "am_spielen", bewertung: 6 });
		expect(d.releases[1].bewertung).toBeNull();
	});
});

describe("Kopplung von Bewertung und Liste (5.5)", () => {
	const eintraege = (id: number) =>
		env.DB.prepare("SELECT kind, status, origin, position FROM plan_entry WHERE release_id = ? ORDER BY id").bind(id).all().then((r) => r.results);

	it("am_spielen legt einen To-Do-Eintrag an, pausiert haengt ihn ins Backlog, durchgespielt schliesst ihn", async () => {
		const r = await release(1, 10);
		let a = await (await setze(r, { status: "am_spielen", bewertung: 8, notiz: "gut" })).json();
		expect(a).toMatchObject({ status: "am_spielen", eintragAngelegt: true, eintraegeErledigt: 0 });
		expect(await eintraege(r)).toEqual([{ kind: "todo", status: "offen", origin: "manuell", position: 1 }]);

		a = await (await setze(r, { status: "pausiert", bewertung: 8, notiz: "gut" })).json();
		expect(a).toMatchObject({ eintragAngelegt: false, eintraegeErledigt: 0 });
		expect(await eintraege(r)).toEqual([{ kind: "backlog", status: "offen", origin: "manuell", position: null }]);

		a = await (await setze(r, { status: "durchgespielt", bewertung: 8, notiz: "gut" })).json();
		expect(a).toMatchObject({ eintragAngelegt: false, eintraegeErledigt: 1 });
		expect(await eintraege(r)).toMatchObject([{ kind: "backlog", status: "erledigt" }]);

		// nicht_gespielt und unentschieden ruehren die Liste nicht an.
		await setze(r, { status: "unentschieden" });
		expect(await eintraege(r)).toHaveLength(1);
	});

	it("PATCH setzt nur den Status, laesst Datum, Bewertung und Notiz stehen und koppelt ebenso", async () => {
		const r = await release(1, 10);
		await setze(r, { status: "am_spielen", bewertung: 7, notiz: "n", begonnenAm: "2026-01-02" });
		const p = await SELF.fetch(`${B}/api/releases/${r}/play-status`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ status: "abgebrochen" }),
		});
		expect(p.status).toBe(200);
		expect(await p.json()).toMatchObject({ status: "abgebrochen", bewertung: 7, notiz: "n", begonnenAm: "2026-01-02", eintraegeErledigt: 1 });
		expect(await eintraege(r)).toMatchObject([{ kind: "todo", status: "erledigt" }]);

		const kaputt = await SELF.fetch(`${B}/api/releases/${r}/play-status`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ status: "weg" }),
		});
		expect(kaputt.status).toBe(400);
		expect((await SELF.fetch(`${B}/api/releases/999/play-status`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ status: "pausiert" }),
		})).status).toBe(404);
	});
});
