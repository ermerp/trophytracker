import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";
import { normalisiereSeite } from "../src/domain/normalize";
import { fakeSeite, fakeTitel } from "./trophy-fixtures";

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);

async function leeren() {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM trophy_progress"),
		env.DB.prepare("DELETE FROM release"),
		env.DB.prepare("DELETE FROM game"),
	]);
}

/** Legt ein Release an, damit release_id gesetzt werden kann. */
async function release(id: number, plattform = "PS4") {
	await env.DB.batch([
		env.DB.prepare("INSERT INTO game (id,title,sort_title) VALUES (?,?,?)").bind(
			id,
			`Spiel ${id}`,
			`spiel ${id}`,
		),
		env.DB.prepare("INSERT INTO release (id,game_id,platform) VALUES (?,?,?)").bind(
			id,
			id,
			plattform,
		),
	]);
}

const seite = (titel: Parameters<typeof fakeSeite>[0]) => normalisiereSeite(fakeSeite(titel)).titel;

beforeEach(leeren);

describe("upsertSeite", () => {
	it("schreibt neue Titel", async () => {
		const anzahl = await repos().trophies.upsertSeite(seite([fakeTitel(1), fakeTitel(2)]));

		expect(anzahl).toBe(2);
		expect(await repos().trophies.anzahl()).toBe(2);
	});

	it("aktualisiert statt zu verdoppeln", async () => {
		await repos().trophies.upsertSeite(seite([fakeTitel(1, { progress: 40 })]));
		await repos().trophies.upsertSeite(seite([fakeTitel(1, { progress: 80 })]));

		expect(await repos().trophies.anzahl()).toBe(1);
		const zeile = await env.DB.prepare(
			"SELECT progress_pct FROM trophy_progress",
		).first<{ progress_pct: number }>();
		expect(zeile?.progress_pct).toBe(80);
	});

	// Die nicht verhandelbare Regel aus CLAUDE.md: Fremddaten und eigene
	// Bewertung werden nie vermischt. Ein einmal gesetztes release_id wird von
	// keinem automatischen Prozess ueberschrieben.
	it("laesst release_id unangetastet", async () => {
		await release(42);
		await repos().trophies.upsertSeite(seite([fakeTitel(1)]));
		await env.DB.prepare("UPDATE trophy_progress SET release_id = 42").run();

		await repos().trophies.upsertSeite(seite([fakeTitel(1, { progress: 99 })]));

		const zeile = await env.DB.prepare(
			"SELECT release_id, progress_pct FROM trophy_progress",
		).first<{ release_id: number | null; progress_pct: number }>();

		expect(zeile?.release_id).toBe(42);
		expect(zeile?.progress_pct).toBe(99);
	});

	it("laesst den Referenzstand der Pruefliste unangetastet", async () => {
		await repos().trophies.upsertSeite(seite([fakeTitel(1)]));
		await env.DB.prepare(
			"UPDATE trophy_progress SET reviewed_earned_total = 20, " +
				"reviewed_defined_total = 42, reviewed_at = '2026-01-01'",
		).run();

		await repos().trophies.upsertSeite(
			seite([
				fakeTitel(1, {
					earnedTrophies: { bronze: 30, silver: 8, gold: 3, platinum: 1 },
					progress: 100,
				}),
			]),
		);

		const zeile = await env.DB.prepare(
			"SELECT reviewed_earned_total, reviewed_defined_total, reviewed_at, earned_bronze FROM trophy_progress",
		).first<{
			reviewed_earned_total: number;
			reviewed_defined_total: number;
			reviewed_at: string;
			earned_bronze: number;
		}>();

		// Referenzstand steht, Fremddaten sind neu
		expect(zeile?.reviewed_earned_total).toBe(20);
		expect(zeile?.reviewed_defined_total).toBe(42);
		expect(zeile?.reviewed_at).toBe("2026-01-01");
		expect(zeile?.earned_bronze).toBe(30);
	});

	it("nimmt eine Vita-Zuordnung an - Vita ist seit Migration 0003 erlaubt", async () => {
		await release(7, "PSVITA");
		await repos().trophies.upsertSeite(seite([fakeTitel(1)]));
		await env.DB.prepare("UPDATE trophy_progress SET release_id = 7").run();

		const zeile = await env.DB.prepare(
			"SELECT r.platform FROM trophy_progress t JOIN release r ON r.id = t.release_id",
		).first<{ platform: string }>();
		expect(zeile?.platform).toBe("PSVITA");
	});

	it("kommt mit einer leeren Seite zurecht", async () => {
		expect(await repos().trophies.upsertSeite([])).toBe(0);
	});
});

describe("liste", () => {
	beforeEach(async () => {
		await repos().trophies.upsertSeite(
			seite([
				fakeTitel(1, { trophyTitleName: "Zulu", progress: 10, lastUpdatedDateTime: "2020-01-01T00:00:00Z" }),
				fakeTitel(2, { trophyTitleName: "Alpha", progress: 100, lastUpdatedDateTime: "2026-01-01T00:00:00Z" }),
				fakeTitel(3, {
					trophyTitleName: "Mike",
					progress: 50,
					lastUpdatedDateTime: "2023-01-01T00:00:00Z",
					earnedTrophies: { bronze: 1, silver: 0, gold: 0, platinum: 1 },
				}),
			]),
		);
	});

	it("sortiert nach zuletzt gespielt", async () => {
		const { zeilen } = await repos().trophies.liste({
			limit: 10, offset: 0, sortierung: "zuletzt", nurPlatin: false,
		});
		expect(zeilen.map((z) => z.title_name)).toEqual(["Alpha", "Mike", "Zulu"]);
	});

	it("sortiert nach Fortschritt", async () => {
		const { zeilen } = await repos().trophies.liste({
			limit: 10, offset: 0, sortierung: "fortschritt", nurPlatin: false,
		});
		expect(zeilen.map((z) => z.progress_pct)).toEqual([100, 50, 10]);
	});

	it("sortiert nach Titel", async () => {
		const { zeilen } = await repos().trophies.liste({
			limit: 10, offset: 0, sortierung: "titel", nurPlatin: false,
		});
		expect(zeilen.map((z) => z.title_name)).toEqual(["Alpha", "Mike", "Zulu"]);
	});

	it("filtert auf erspieltes Platin", async () => {
		const { zeilen, gesamt } = await repos().trophies.liste({
			limit: 10, offset: 0, sortierung: "titel", nurPlatin: true,
		});
		expect(gesamt).toBe(1);
		expect(zeilen[0].title_name).toBe("Mike");
	});

	it("blaettert und meldet die Gesamtzahl", async () => {
		const { zeilen, gesamt } = await repos().trophies.liste({
			limit: 2, offset: 2, sortierung: "titel", nurPlatin: false,
		});
		expect(gesamt).toBe(3);
		expect(zeilen).toHaveLength(1);
	});
});
