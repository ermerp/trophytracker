import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";
import { normalisiereSeite } from "../src/domain/normalize";
import { fakeSeite, fakeTitel } from "./trophy-fixtures";

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const B = "https://example.com";

const hole = async (pfad: string) => (await SELF.fetch(`${B}${pfad}`)).json() as Promise<any>;
const sende = (methode: "POST" | "PATCH" | "DELETE", pfad: string, koerper?: unknown) =>
	SELF.fetch(`${B}${pfad}`, {
		method: methode,
		headers: { "content-type": "application/json" },
		body: koerper === undefined ? undefined : typeof koerper === "string" ? koerper : JSON.stringify(koerper),
	});

async function leeren() {
	await env.DB.batch(
		["plan_entry", "play_status", "physical_copy", "digital_entitlement", "trophy_progress", "release", "game"].map((t) =>
			env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
}

async function release(id = 1): Promise<number> {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)")
		.bind(id, `Spiel ${id}`, `spiel ${id}`)
		.run();
	await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, ?, 'PS4')")
		.bind(id, id)
		.run();
	return id;
}

beforeEach(leeren);

describe("POST /api/physical-copies", () => {
	it("legt ein Exemplar an und meldet die gesetzte Disc-Fassung", async () => {
		const r = await release();
		const antwort = await sende("POST", "/api/physical-copies", { releaseId: r });
		expect(antwort.status).toBe(201);
		expect(await antwort.json()).toMatchObject({ releaseId: r, physischStatusGesetzt: true });
	});

	it("uebersetzt die deutschen Felder", async () => {
		const r = await release();
		const antwort = await sende("POST", "/api/physical-copies", {
			releaseId: r,
			ean: "4012345678901",
			zustand: "gut",
			anleitung: true,
			kaufdatum: "2022-11-30",
			kaufpreisCents: 1250,
			notiz: "mit OVP",
		});
		expect(antwort.status).toBe(201);

		const z = await env.DB.prepare("SELECT * FROM physical_copy").first();
		expect(z).toMatchObject({
			ean: "4012345678901",
			condition: "gut",
			has_manual: 1,
			purchase_date: "2022-11-30",
			purchase_price_cents: 1250,
			notes: "mit OVP",
		});
	});

	it.each([
		[{ zustand: "wie neu" }, /Zustand/],
		[{ ean: "12" }, /EAN/],
		[{ kaufdatum: "30.11.2022" }, /Kaufdatum/],
		[{ kaufpreisCents: 12.5 }, /Kaufpreis/],
		[{ kaufpreisCents: -1 }, /Kaufpreis/],
		[{ anleitung: "ja" }, /anleitung/],
	])("lehnt %o ab", async (felder, meldung) => {
		const r = await release();
		const antwort = await sende("POST", "/api/physical-copies", { releaseId: r, ...felder });
		expect(antwort.status).toBe(400);
		expect((await antwort.json() as any).fehler).toMatch(meldung);
	});

	it("verlangt eine releaseId und meldet ein unbekanntes Release", async () => {
		expect((await sende("POST", "/api/physical-copies", {})).status).toBe(400);
		expect((await sende("POST", "/api/physical-copies", "kaputt")).status).toBe(400);
		expect((await sende("POST", "/api/physical-copies", { releaseId: 999 })).status).toBe(404);
	});
});

describe("Erfassen erledigt Kauf und Wunsch (Stufe 15, Abschnitt 5)", () => {
	const eintrag = (kind: string, ziel: { release?: number; game?: number }, status = "offen") =>
		env.DB.prepare("INSERT INTO plan_entry (kind, release_id, game_id, origin, status) VALUES (?, ?, ?, 'manuell', ?) RETURNING id")
			.bind(kind, ziel.release ?? null, ziel.game ?? null, status)
			.first<{ id: number }>();
	const status = async (id: number) => (await env.DB.prepare("SELECT status FROM plan_entry WHERE id = ?").bind(id).first<{ status: string }>())?.status;

	it("eine Disc erledigt offene Kauf- und Wunscheintraege am Release und am Spiel, nicht To-Do/Backlog oder andere Releases", async () => {
		const r = await release(1);
		await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (2, 1, 'PS5')").run();
		const kauf = await eintrag("kauf", { release: r });
		const wunsch = await eintrag("wunsch", { game: 1 });
		const anderes = await eintrag("wunsch", { release: 2 });
		const backlog = await eintrag("backlog", { release: r });
		const verworfen = await eintrag("kauf", { release: 2 }, "verworfen");

		const antwort = await sende("POST", "/api/physical-copies", { releaseId: r });
		expect(antwort.status).toBe(201);
		expect(await antwort.json()).toMatchObject({
			absichtenErledigt: [
				{ id: kauf!.id, art: "kauf", titel: "Spiel 1" },
				{ id: wunsch!.id, art: "wunsch", titel: "Spiel 1" },
			],
			aufListe: true,
		});
		expect(await status(kauf!.id)).toBe("erledigt");
		expect(await status(wunsch!.id)).toBe("erledigt");
		expect(await status(anderes!.id)).toBe("offen");
		expect(await status(backlog!.id)).toBe("offen");
		expect(await status(verworfen!.id)).toBe("verworfen");
	});

	it("eine digitale Berechtigung ebenso; ohne Eintraege bleibt die Liste leer und aufListe false", async () => {
		const r = await release(1);
		const leer = await (await sende("POST", "/api/digital-entitlements", { releaseId: r, quelle: "plus" })).json();
		expect(leer).toMatchObject({ absichtenErledigt: [], aufListe: false });

		const wunsch = await eintrag("wunsch", { release: r });
		const voll = await (await sende("POST", "/api/digital-entitlements", { releaseId: r, quelle: "kauf" })).json();
		expect(voll).toMatchObject({ absichtenErledigt: [{ id: wunsch!.id, art: "wunsch", titel: "Spiel 1" }], aufListe: false });
		expect(await status(wunsch!.id)).toBe("erledigt");
	});
});

describe("PATCH und DELETE /api/physical-copies/:id", () => {
	it("aendert einzelne Felder und leert mit null", async () => {
		const r = await release();
		const { id } = await repos().ownership.addPhysicalCopy(r, { condition: "neu", notes: "x" });

		const antwort = await sende("PATCH", `/api/physical-copies/${id}`, { zustand: "gut", notiz: null });
		expect(antwort.status).toBe(200);

		const z = await env.DB.prepare("SELECT condition, notes FROM physical_copy WHERE id = ?").bind(id).first();
		expect(z).toEqual({ condition: "gut", notes: null });
	});

	it("meldet 404 fuer ein unbekanntes Exemplar", async () => {
		expect((await sende("PATCH", "/api/physical-copies/999", { zustand: "gut" })).status).toBe(404);
		expect((await sende("DELETE", "/api/physical-copies/999")).status).toBe(404);
	});

	it("loescht", async () => {
		const r = await release();
		const { id } = await repos().ownership.addPhysicalCopy(r);
		expect((await sende("DELETE", `/api/physical-copies/${id}`)).status).toBe(200);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM physical_copy").first()).toEqual({ n: 0 });
	});
});

describe("GET /api/physical-copies", () => {
	it("listet mit Titel und Plattform", async () => {
		const r = await release();
		await repos().ownership.addPhysicalCopy(r, { condition: "akzeptabel" });
		const a = await hole("/api/physical-copies");
		expect(a.gesamt).toBe(1);
		expect(a.exemplare[0]).toMatchObject({ titel: "Spiel 1", plattform: "PS4", zustand: "akzeptabel" });
	});
});

describe("/api/digital-entitlements", () => {
	it("legt an, lehnt die Dublette mit 409 ab und loescht", async () => {
		const r = await release();
		const erste = await sende("POST", "/api/digital-entitlements", { releaseId: r, quelle: "plus", erworbenAm: "2021-03-01" });
		expect(erste.status).toBe(201);
		const { id } = (await erste.json()) as { id: number };

		expect((await sende("POST", "/api/digital-entitlements", { releaseId: r, quelle: "plus" })).status).toBe(409);
		expect((await sende("DELETE", `/api/digital-entitlements/${id}`)).status).toBe(200);
		expect((await sende("DELETE", `/api/digital-entitlements/${id}`)).status).toBe(404);
	});

	it("prueft Quelle, Datum und Release", async () => {
		const r = await release();
		expect((await sende("POST", "/api/digital-entitlements", { releaseId: r, quelle: "geschenk" })).status).toBe(400);
		expect((await sende("POST", "/api/digital-entitlements", { releaseId: r, quelle: "kauf", erworbenAm: "gestern" })).status).toBe(400);
		expect((await sende("POST", "/api/digital-entitlements", { releaseId: 999, quelle: "kauf" })).status).toBe(404);
	});
});

describe("POST /api/games – von Hand anlegen", () => {
	it("legt Spiel und Release an", async () => {
		const antwort = await sende("POST", "/api/games", { titel: "Ico", plattform: "PS3" });
		expect(antwort.status).toBe(201);
		const a = (await antwort.json()) as any;

		const detail = await hole(`/api/games/${a.spielId}`);
		expect(detail.titel).toBe("Ico");
		expect(detail.releases).toEqual([expect.objectContaining({ id: a.releaseId, plattform: "PS3", trophaeen: null })]);
	});

	it("warnt mit 409 und Kandidaten, wenn der Titelschluessel schon vergeben ist", async () => {
		await sende("POST", "/api/games", { titel: "Bloodborne", plattform: "PS4" });

		const antwort = await sende("POST", "/api/games", { titel: "Bloodborne: Game of the Year Edition", plattform: "PS4" });
		expect(antwort.status).toBe(409);
		const a = (await antwort.json()) as any;
		expect(a.kandidaten).toEqual([expect.objectContaining({ titel: "Bloodborne", plattformen: ["PS4"] })]);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM game").first()).toEqual({ n: 1 });
	});

	it("legt mit `trotzdem` ein zweites Spiel an", async () => {
		await sende("POST", "/api/games", { titel: "Bloodborne", plattform: "PS4" });
		const antwort = await sende("POST", "/api/games", { titel: "Bloodborne", plattform: "PS5", trotzdem: true });
		expect(antwort.status).toBe(201);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM game").first()).toEqual({ n: 2 });
	});

	it("prueft Titel und Plattform", async () => {
		expect((await sende("POST", "/api/games", { titel: " ", plattform: "PS4" })).status).toBe(400);
		expect((await sende("POST", "/api/games", { titel: "X", plattform: "XBOX" })).status).toBe(400);
	});
});

describe("POST /api/releases", () => {
	it("haengt ein Release an ein bestehendes Spiel und lehnt die Dublette ab", async () => {
		const gameId = await release();
		const antwort = await sende("POST", "/api/releases", { spielId: gameId, plattform: "PS5" });
		expect(antwort.status).toBe(201);

		expect((await sende("POST", "/api/releases", { spielId: gameId, plattform: "PS5" })).status).toBe(409);
		expect((await sende("POST", "/api/releases", { spielId: gameId, plattform: "PS4" })).status).toBe(409);
		expect((await sende("POST", "/api/releases", { spielId: 999, plattform: "PS5" })).status).toBe(404);
	});
});

describe("DELETE /api/releases/:id und /api/games/:id", () => {
	async function zugeordnetesSpiel() {
		const e = fakeTitel(7, { trophyTitleName: "Bloodborne", trophyTitlePlatform: "PS4" });
		await repos().trophies.upsertSeite(normalisiereSeite(fakeSeite([e])).titel);
		const g = await repos().games.gruppeAnlegen("Bloodborne", [
			{ npCommunicationId: e.npCommunicationId, plattform: "PS4" },
		]);
		return { gameId: g.gameId, releaseId: g.releaseIds[0], npCommId: e.npCommunicationId };
	}

	it("gibt die Trophaeenliste frei, nimmt Exemplare mit und loescht ein leeres Spiel", async () => {
		const { gameId, releaseId, npCommId } = await zugeordnetesSpiel();
		await repos().ownership.addPhysicalCopy(releaseId);

		const antwort = await sende("DELETE", `/api/releases/${releaseId}`);
		expect(antwort.status).toBe(200);
		expect(await antwort.json()).toMatchObject({ spielGeloescht: true, listeFreigegeben: true });

		const t = await env.DB.prepare(
			"SELECT release_id, matched_source, matched_at FROM trophy_progress WHERE np_communication_id = ?",
		).bind(npCommId).first();
		expect(t).toEqual({ release_id: null, matched_source: null, matched_at: null });
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM physical_copy").first()).toEqual({ n: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM game WHERE id = ?").bind(gameId).first()).toEqual({ n: 0 });
	});

	it("behaelt das Spiel, wenn ein Release uebrig bleibt", async () => {
		const { gameId, releaseId } = await zugeordnetesSpiel();
		await repos().games.releaseAnlegen(gameId, "PS5");

		const a = await (await sende("DELETE", `/api/releases/${releaseId}`)).json();
		expect(a).toMatchObject({ spielGeloescht: false });
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM game WHERE id = ?").bind(gameId).first()).toEqual({ n: 1 });
	});

	it("DELETE /api/games/:id loescht alles und zaehlt freigegebene Listen", async () => {
		const { gameId, npCommId } = await zugeordnetesSpiel();
		const antwort = await sende("DELETE", `/api/games/${gameId}`);
		expect(await antwort.json()).toMatchObject({ geloescht: true, listenFreigegeben: 1 });

		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM release").first()).toEqual({ n: 0 });
		const t = await env.DB.prepare("SELECT release_id FROM trophy_progress WHERE np_communication_id = ?").bind(npCommId).first();
		expect(t).toEqual({ release_id: null });
		expect((await sende("DELETE", "/api/games/999")).status).toBe(404);
		expect((await sende("DELETE", "/api/releases/999")).status).toBe(404);
	});
});

describe("Von PSN erkannte Berechtigungen (Stufe 18c)", () => {
	it("laesst sich nicht von Hand loeschen - der naechste Lauf legte sie wieder an", async () => {
		const r = await release();
		await env.DB.prepare(
			"INSERT INTO digital_entitlement (id, release_id, source, herkunft) VALUES (999, ?, 'kauf', 'psn')",
		)
			.bind(r)
			.run();

		const antwort = await sende("DELETE", "/api/digital-entitlements/999");

		expect(antwort.status).toBe(404);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM digital_entitlement WHERE id = 999").first()).toEqual({ n: 1 });
	});
});
