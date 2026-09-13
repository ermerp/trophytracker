import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";
import { normalisiereSeite } from "../src/domain/normalize";
import { fakeSeite, fakeTitel } from "./trophy-fixtures";

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const B = "https://example.com";

const hole = async (pfad: string) => (await SELF.fetch(`${B}${pfad}`)).json() as Promise<any>;
const sende = (pfad: string, koerper: unknown) =>
	SELF.fetch(`${B}${pfad}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: typeof koerper === "string" ? koerper : JSON.stringify(koerper),
	});

async function listen(...t: Array<{ name: string; platform: string; nr: number }>) {
	const e = t.map((x) =>
		fakeTitel(x.nr, { trophyTitleName: x.name, trophyTitlePlatform: x.platform }),
	);
	await repos().trophies.upsertSeite(normalisiereSeite(fakeSeite(e)).titel);
	return e.map((x) => x.npCommunicationId);
}

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM play_status"),
		env.DB.prepare("DELETE FROM trophy_progress"),
		env.DB.prepare("DELETE FROM release"),
		env.DB.prepare("DELETE FROM game"),
	]);
});

describe("Vorbelegung nach der Zuordnung (4.2)", () => {
	it("gibt einer frisch angelegten Gruppe sofort ihren Status", async () => {
		const [a] = await listen({ name: "Bloodborne", platform: "PS4", nr: 1 });
		const antwort = await sende("/api/zuordnung/gruppe", {
			titel: "Bloodborne",
			releases: [{ npCommunicationId: a, plattform: "PS4" }],
		});
		const { releaseIds } = (await antwort.json()) as { releaseIds: number[] };

		// Fixture: 45 % → am_spielen
		const z = await env.DB.prepare("SELECT status FROM play_status WHERE release_id = ?").bind(releaseIds[0]).first();
		expect(z).toEqual({ status: "am_spielen" });
	});
});

describe("GET /api/zuordnung/offen", () => {
	it("gruppiert und schreibt nichts", async () => {
		await listen(
			{ name: "Grand Theft Auto V", platform: "PS3", nr: 1 },
			{ name: "Grand Theft Auto V", platform: "PS4", nr: 2 },
			{ name: "Bloodborne", platform: "PS4", nr: 3 },
		);

		const a = await hole("/api/zuordnung/offen");

		expect(a.gesamt).toBe(2);
		expect(a.listenOffen).toBe(3);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM game").first<{ n: number }>()).toEqual({
			n: 0,
		});
	});

	it("blaettert", async () => {
		await listen(
			{ name: "Alpha", platform: "PS4", nr: 1 },
			{ name: "Beta", platform: "PS4", nr: 2 },
			{ name: "Gamma", platform: "PS4", nr: 3 },
		);

		const a = await hole("/api/zuordnung/offen?limit=2&offset=1");
		expect(a.gesamt).toBe(3);
		expect(a.gruppen.map((g: any) => g.titel)).toEqual(["Beta", "Gamma"]);
	});
});

describe("POST /api/zuordnung/gruppe", () => {
	it("legt Spiel und Releases an", async () => {
		const [a, b] = await listen(
			{ name: "Grand Theft Auto V", platform: "PS4", nr: 1 },
			{ name: "Grand Theft Auto V", platform: "PS5", nr: 2 },
		);

		const antwort = await sende("/api/zuordnung/gruppe", {
			titel: "Grand Theft Auto V",
			releases: [
				{ npCommunicationId: a, plattform: "PS4" },
				{ npCommunicationId: b, plattform: "PS5" },
			],
		});

		expect(antwort.status).toBe(200);
		const daten = (await antwort.json()) as any;
		expect(daten.releaseIds).toHaveLength(2);
		expect(daten.nochOffen).toBe(0);
	});

	it("weist zwei Releases derselben Plattform ab", async () => {
		const [a, b] = await listen(
			{ name: "Call of Duty Modern Warfare", platform: "PS4", nr: 1 },
			{ name: "Call of Duty: Modern Warfare Remastered", platform: "PS4", nr: 2 },
		);

		const antwort = await sende("/api/zuordnung/gruppe", {
			titel: "Call of Duty Modern Warfare",
			releases: [
				{ npCommunicationId: a, plattform: "PS4" },
				{ npCommunicationId: b, plattform: "PS4" },
			],
		});

		expect(antwort.status).toBe(400);
		expect((await antwort.json()).fehler).toMatch(/dieselbe Plattform/);
	});

	it("weist eine unbekannte Plattform ab", async () => {
		const [a] = await listen({ name: "Halo", platform: "PS4", nr: 1 });
		const antwort = await sende("/api/zuordnung/gruppe", {
			titel: "Halo",
			releases: [{ npCommunicationId: a, plattform: "XBOX" }],
		});
		expect(antwort.status).toBe(400);
	});

	it.each([
		["leeren Titel", { titel: "  ", releases: [{ npCommunicationId: "x", plattform: "PS4" }] }],
		["fehlende Releases", { titel: "Spiel", releases: [] }],
	])("weist %s ab", async (_name, koerper) => {
		expect((await sende("/api/zuordnung/gruppe", koerper)).status).toBe(400);
	});

	it("weist ungueltiges JSON ab", async () => {
		expect((await sende("/api/zuordnung/gruppe", "kaputt")).status).toBe(400);
	});
});

describe("POST /api/zuordnung/liste/:npCommId", () => {
	it("ordnet einem bestehenden Release zu", async () => {
		const [a, b] = await listen(
			{ name: "Elden Ring", platform: "PS4", nr: 1 },
			{ name: "Elden Ring", platform: "PS5", nr: 2 },
		);
		const { releaseIds } = await repos().games.gruppeAnlegen("Elden Ring", [
			{ npCommunicationId: a, plattform: "PS4" },
		]);
		const neu = await env.DB.prepare(
			"INSERT INTO release (game_id, platform) VALUES ((SELECT game_id FROM release WHERE id = ?), 'PS5') RETURNING id",
		)
			.bind(releaseIds[0])
			.first<{ id: number }>();

		const antwort = await sende(`/api/zuordnung/liste/${b}`, { releaseId: neu!.id });

		expect(antwort.status).toBe(200);
		expect((await antwort.json()).nochOffen).toBe(0);
	});

	it("lehnt ein bereits belegtes Release ab", async () => {
		const [a, b] = await listen(
			{ name: "Elden Ring", platform: "PS4", nr: 1 },
			{ name: "Anderes Spiel", platform: "PS4", nr: 2 },
		);
		const { releaseIds } = await repos().games.gruppeAnlegen("Elden Ring", [
			{ npCommunicationId: a, plattform: "PS4" },
		]);

		const antwort = await sende(`/api/zuordnung/liste/${b}`, { releaseId: releaseIds[0] });
		expect(antwort.status).toBe(409);
	});
});

describe("GET /api/games", () => {
	it("listet Spiele mit Release-Anzahl", async () => {
		const [a, b] = await listen(
			{ name: "Grand Theft Auto V", platform: "PS4", nr: 1 },
			{ name: "Grand Theft Auto V", platform: "PS5", nr: 2 },
		);
		await repos().games.gruppeAnlegen("Grand Theft Auto V", [
			{ npCommunicationId: a, plattform: "PS4" },
			{ npCommunicationId: b, plattform: "PS5" },
		]);

		const a2 = await hole("/api/games");
		expect(a2.gesamt).toBe(1);
		expect(a2.spiele[0].titel).toBe("Grand Theft Auto V");
		expect(a2.spiele[0].releases.map((r: any) => r.plattform)).toEqual(["PS4", "PS5"]);
		expect(a2.spiele[0].releases[0]).toMatchObject({ exemplare: 0, digital: [], discFassung: "unbekannt" });
	});

	it("liefert das Detail mit Trophaeenstand", async () => {
		const [a] = await listen({ name: "Bloodborne", platform: "PS4", nr: 1 });
		const { gameId } = await repos().games.gruppeAnlegen("Bloodborne", [
			{ npCommunicationId: a, plattform: "PS4" },
		]);

		const detail = await hole(`/api/games/${gameId}`);
		expect(detail.titel).toBe("Bloodborne");
		expect(detail.releases[0]).toMatchObject({ plattform: "PS4", exemplare: [], digital: [] });
		expect(detail.releases[0].trophaeen).toMatchObject({ fortschritt: 45, platin: "offen" });
	});

	it("meldet 404 fuer ein unbekanntes Spiel", async () => {
		expect((await SELF.fetch(`${B}/api/games/9999`)).status).toBe(404);
	});
});
