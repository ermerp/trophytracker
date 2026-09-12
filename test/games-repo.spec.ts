import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";
import { normalisiereSeite } from "../src/domain/normalize";
import { ordneAutomatischZu } from "../src/sync/zuordnung";
import { fakeSeite, fakeTitel } from "./trophy-fixtures";

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);

async function leeren() {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM trophy_progress"),
		env.DB.prepare("DELETE FROM release"),
		env.DB.prepare("DELETE FROM game"),
	]);
}

/** Legt Trophaeenlisten an, wie sie nach Stufe 3 vorliegen. */
async function listen(...titel: Array<{ name: string; platform: string; nr: number }>) {
	const eintraege = titel.map((t) =>
		fakeTitel(t.nr, { trophyTitleName: t.name, trophyTitlePlatform: t.platform }),
	);
	await repos().trophies.upsertSeite(normalisiereSeite(fakeSeite(eintraege)).titel);
	return eintraege.map((e) => e.npCommunicationId);
}

beforeEach(leeren);

describe("gruppeAnlegen", () => {
	it("legt ein Spiel mit drei Releases an und verknuepft die Listen", async () => {
		const [a, b, c] = await listen(
			{ name: "Grand Theft Auto V", platform: "PS3", nr: 1 },
			{ name: "Grand Theft Auto V", platform: "PS4", nr: 2 },
			{ name: "Grand Theft Auto V", platform: "PS5", nr: 3 },
		);

		const ergebnis = await repos().games.gruppeAnlegen("Grand Theft Auto V", [
			{ npCommunicationId: a, plattform: "PS3" },
			{ npCommunicationId: b, plattform: "PS4" },
			{ npCommunicationId: c, plattform: "PS5" },
		]);

		expect(ergebnis.releaseIds).toHaveLength(3);
		expect(ergebnis.uebersprungen).toEqual([]);

		const zahlen = await env.DB.prepare(
			"SELECT (SELECT COUNT(*) FROM game) AS spiele, (SELECT COUNT(*) FROM release) AS rel, " +
				"(SELECT COUNT(*) FROM trophy_progress WHERE release_id IS NULL) AS offen",
		).first<{ spiele: number; rel: number; offen: number }>();

		expect(zahlen).toEqual({ spiele: 1, rel: 3, offen: 0 });
	});

	it("setzt sort_title auf den Titelschluessel", async () => {
		const [a] = await listen({ name: "Kingdom Come: Deliverance", platform: "PS4", nr: 1 });
		await repos().games.gruppeAnlegen("Kingdom Come: Deliverance", [
			{ npCommunicationId: a, plattform: "PS4" },
		]);

		const g = await env.DB.prepare("SELECT title, sort_title FROM game").first<{
			title: string;
			sort_title: string;
		}>();
		expect(g).toEqual({
			title: "Kingdom Come: Deliverance",
			sort_title: "kingdom come deliverance",
		});
	});

	it("vermerkt die Zuordnung als manuell", async () => {
		const [a] = await listen({ name: "Bloodborne", platform: "PS4", nr: 1 });
		await repos().games.gruppeAnlegen("Bloodborne", [
			{ npCommunicationId: a, plattform: "PS4" },
		]);

		const t = await env.DB.prepare(
			"SELECT matched_source, matched_at FROM trophy_progress",
		).first<{ matched_source: string; matched_at: string }>();
		expect(t?.matched_source).toBe("manuell");
		expect(t?.matched_at).not.toBeNull();
	});

	// Die nicht verhandelbare Regel: Eine einmal getroffene Zuordnung wird
	// von keinem Prozess ueberschrieben - auch nicht von diesem.
	it("ueberschreibt eine bestehende Zuordnung nicht", async () => {
		const [a] = await listen({ name: "Bloodborne", platform: "PS4", nr: 1 });
		const erste = await repos().games.gruppeAnlegen("Bloodborne", [
			{ npCommunicationId: a, plattform: "PS4" },
		]);

		const zweite = await repos().games.gruppeAnlegen("Bloodborne falsch", [
			{ npCommunicationId: a, plattform: "PS5" },
		]);

		expect(zweite.uebersprungen).toEqual([a]);
		const t = await env.DB.prepare("SELECT release_id FROM trophy_progress").first<{
			release_id: number;
		}>();
		expect(t?.release_id).toBe(erste.releaseIds[0]);
	});

	it("nimmt PSVITA als Plattform an", async () => {
		const [a] = await listen({ name: "Persona 4 Golden", platform: "PSVITA", nr: 1 });
		await repos().games.gruppeAnlegen("Persona 4 Golden", [
			{ npCommunicationId: a, plattform: "PSVITA" },
		]);

		const r = await env.DB.prepare("SELECT platform FROM release").first<{ platform: string }>();
		expect(r?.platform).toBe("PSVITA");
	});

	it("weist eine leere Gruppe zurueck", async () => {
		await expect(repos().games.gruppeAnlegen("Leer", [])).rejects.toThrow();
	});
});

describe("ordneAutomatischZu", () => {
	it("ordnet zu, wenn es genau einen Treffer gibt", async () => {
		// Spiel existiert bereits mit PS5-Release ohne Liste
		const [alt] = await listen({ name: "Elden Ring", platform: "PS4", nr: 1 });
		const { releaseIds } = await repos().games.gruppeAnlegen("Elden Ring", [
			{ npCommunicationId: alt, plattform: "PS4" },
		]);
		await env.DB.prepare("INSERT INTO release (game_id, platform) VALUES ((SELECT game_id FROM release WHERE id = ?), 'PS5')")
			.bind(releaseIds[0])
			.run();

		// Neue Liste desselben Spiels auf PS5
		await listen({ name: "Elden Ring", platform: "PS5", nr: 2 });

		const ergebnis = await ordneAutomatischZu(repos());

		expect(ergebnis.zugeordnet).toBe(1);
		expect(await repos().games.anzahlUnzugeordnet()).toBe(0);
	});

	it("ordnet nichts zu, wenn das Release schon eine Liste traegt", async () => {
		const [a] = await listen({ name: "Elden Ring", platform: "PS4", nr: 1 });
		await repos().games.gruppeAnlegen("Elden Ring", [
			{ npCommunicationId: a, plattform: "PS4" },
		]);
		// Zweite Liste, gleiche Plattform - das Release ist belegt
		await listen({ name: "Elden Ring", platform: "PS4", nr: 2 });

		expect((await ordneAutomatischZu(repos())).zugeordnet).toBe(0);
	});

	it("ordnet nichts zu, wenn die Plattform nicht passt", async () => {
		const [a] = await listen({ name: "Elden Ring", platform: "PS4", nr: 1 });
		await repos().games.gruppeAnlegen("Elden Ring", [
			{ npCommunicationId: a, plattform: "PS4" },
		]);
		await listen({ name: "Elden Ring", platform: "PS3", nr: 2 });

		expect((await ordneAutomatischZu(repos())).zugeordnet).toBe(0);
	});

	it("ordnet beim Erstlauf nichts zu - es gibt keine Spiele", async () => {
		await listen({ name: "Bloodborne", platform: "PS4", nr: 1 });
		expect((await ordneAutomatischZu(repos())).zugeordnet).toBe(0);
	});
});
