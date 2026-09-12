import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";
import { normalisiereSeite } from "../src/domain/normalize";
import { fakeSeite, fakeTitel } from "./trophy-fixtures";

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const hole = async (p: string) => (await SELF.fetch(`https://example.com${p}`)).json() as Promise<any>;

type Struktur = { b: number; s: number; g: number; p: number };

async function spielMit(
	titel: string,
	releases: Array<{ plattform: string; struktur: Struktur; nr: number }>,
) {
	const eintraege = releases.map((r) =>
		fakeTitel(r.nr, {
			trophyTitleName: titel,
			trophyTitlePlatform: r.plattform,
			definedTrophies: {
				bronze: r.struktur.b,
				silver: r.struktur.s,
				gold: r.struktur.g,
				platinum: r.struktur.p,
			},
		}),
	);
	await repos().trophies.upsertSeite(normalisiereSeite(fakeSeite(eintraege)).titel);
	return repos().games.gruppeAnlegen(
		titel,
		eintraege.map((e, i) => ({
			npCommunicationId: e.npCommunicationId,
			plattform: releases[i].plattform as "PS3" | "PS4" | "PS5" | "PSVITA",
		})),
	);
}

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM trophy_progress"),
		env.DB.prepare("DELETE FROM release"),
		env.DB.prepare("DELETE FROM game"),
	]);
});

describe("GET /api/games/uebersicht", () => {
	it("liefert eine Zeile je Release", async () => {
		await spielMit("Grand Theft Auto V", [
			{ plattform: "PS4", struktur: { b: 59, s: 15, g: 3, p: 1 }, nr: 1 },
			{ plattform: "PS5", struktur: { b: 59, s: 15, g: 3, p: 1 }, nr: 2 },
		]);

		const a = await hole("/api/games/uebersicht?filter=alle");
		expect(a.gesamt).toBe(2);
		expect(a.zeilen.map((z: any) => z.plattform).sort()).toEqual(["PS4", "PS5"]);
		expect(a.zeilen[0].struktur).toBe("59/15/3/1");
	});

	it("erkennt abweichende Trophaeenstruktur als auffaellig", async () => {
		await spielMit("Shadow of the Colossus", [
			{ plattform: "PS3", struktur: { b: 18, s: 6, g: 6, p: 1 }, nr: 1 },
			{ plattform: "PS4", struktur: { b: 25, s: 7, g: 5, p: 1 }, nr: 2 },
		]);
		await spielMit("The Witcher 3", [
			{ plattform: "PS4", struktur: { b: 68, s: 8, g: 2, p: 1 }, nr: 3 },
			{ plattform: "PS5", struktur: { b: 68, s: 8, g: 2, p: 1 }, nr: 4 },
		]);

		const a = await hole("/api/games/uebersicht?filter=auffaellig");

		expect(a.gesamt).toBe(2);
		expect(a.zeilen.every((z: any) => z.titel === "Shadow of the Colossus")).toBe(true);
		expect(a.zeilen.every((z: any) => z.strukturWeichtAb)).toBe(true);
	});

	it("erkennt abgekuerzte Titel als auffaellig", async () => {
		await spielMit("AC Brotherhood", [
			{ plattform: "PS3", struktur: { b: 30, s: 8, g: 3, p: 1 }, nr: 1 },
		]);

		const a = await hole("/api/games/uebersicht?filter=auffaellig");
		expect(a.zeilen[0].titelWirktAbgekuerzt).toBe(true);
	});

	it("filtert auf Mehrfach-Releases", async () => {
		await spielMit("Bloodborne", [
			{ plattform: "PS4", struktur: { b: 30, s: 8, g: 3, p: 1 }, nr: 1 },
		]);
		await spielMit("Journey", [
			{ plattform: "PS3", struktur: { b: 11, s: 2, g: 1, p: 0 }, nr: 2 },
			{ plattform: "PS4", struktur: { b: 11, s: 2, g: 1, p: 0 }, nr: 3 },
		]);

		const a = await hole("/api/games/uebersicht?filter=mehrfach");
		expect(a.gesamt).toBe(2);
		expect(a.zeilen.every((z: any) => z.titel === "Journey")).toBe(true);
	});

	it("sucht nach Titel", async () => {
		await spielMit("Bloodborne", [
			{ plattform: "PS4", struktur: { b: 30, s: 8, g: 3, p: 1 }, nr: 1 },
		]);
		await spielMit("Journey", [
			{ plattform: "PS3", struktur: { b: 11, s: 2, g: 1, p: 0 }, nr: 2 },
		]);

		const a = await hole("/api/games/uebersicht?filter=alle&suche=blood");
		expect(a.gesamt).toBe(1);
		expect(a.zeilen[0].titel).toBe("Bloodborne");
	});

	it("faellt bei unbekanntem Filter auf 'auffaellig' zurueck", async () => {
		expect((await hole("/api/games/uebersicht?filter=boese")).filter).toBe("auffaellig");
	});
});

describe("PATCH /api/games/:id", () => {
	it("benennt um und leitet sort_title neu ab", async () => {
		const { gameId } = await spielMit("AC Brotherhood", [
			{ plattform: "PS3", struktur: { b: 30, s: 8, g: 3, p: 1 }, nr: 1 },
		]);

		const antwort = await SELF.fetch(`https://example.com/api/games/${gameId}`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ titel: "Assassin's Creed: Brotherhood" }),
		});

		expect(antwort.status).toBe(200);
		const g = await env.DB.prepare("SELECT title, sort_title FROM game").first<any>();
		expect(g.title).toBe("Assassin's Creed: Brotherhood");
		expect(g.sort_title).toBe("assassins creed brotherhood");
	});

	it("meldet 404 fuer ein unbekanntes Spiel", async () => {
		const a = await SELF.fetch("https://example.com/api/games/9999", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ titel: "Egal" }),
		});
		expect(a.status).toBe(404);
	});
});

describe("POST /api/games/release/:id/abtrennen", () => {
	const abtrennen = (releaseId: number, titel: unknown) =>
		SELF.fetch(`https://example.com/api/games/release/${releaseId}/abtrennen`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ titel }),
		});

	it("loest ein Release in ein neues Spiel und erhaelt die Trophaeenliste", async () => {
		const { releaseIds } = await spielMit("Shadow of the Colossus", [
			{ plattform: "PS3", struktur: { b: 18, s: 6, g: 6, p: 1 }, nr: 1 },
			{ plattform: "PS4", struktur: { b: 25, s: 7, g: 5, p: 1 }, nr: 2 },
		]);

		const antwort = await abtrennen(releaseIds[1], "Shadow of the Colossus (2018)");
		expect(antwort.status).toBe(200);
		expect((await antwort.json()).altesSpielGeloescht).toBe(false);

		const zahlen = await env.DB.prepare(
			"SELECT (SELECT COUNT(*) FROM game) AS spiele, (SELECT COUNT(*) FROM release) AS rel, " +
				"(SELECT COUNT(*) FROM trophy_progress WHERE release_id IS NULL) AS offen",
		).first<any>();
		expect(zahlen).toEqual({ spiele: 2, rel: 2, offen: 0 });

		// Die Liste haengt weiterhin am selben Release
		const zeile = await env.DB.prepare(
			"SELECT g.title FROM game g JOIN release r ON r.game_id = g.id " +
				"JOIN trophy_progress t ON t.release_id = r.id WHERE r.id = ?",
		)
			.bind(releaseIds[1])
			.first<any>();
		expect(zeile.title).toBe("Shadow of the Colossus (2018)");
	});

	it("loescht ein leer gewordenes Spiel", async () => {
		const { releaseIds } = await spielMit("Einzelstueck", [
			{ plattform: "PS4", struktur: { b: 30, s: 8, g: 3, p: 1 }, nr: 1 },
		]);

		const antwort = await abtrennen(releaseIds[0], "Neuer Name");
		expect((await antwort.json()).altesSpielGeloescht).toBe(true);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM game").first<any>()).toEqual({ n: 1 });
	});

	it("weist einen leeren Titel ab", async () => {
		const { releaseIds } = await spielMit("Spiel", [
			{ plattform: "PS4", struktur: { b: 30, s: 8, g: 3, p: 1 }, nr: 1 },
		]);
		expect((await abtrennen(releaseIds[0], "  ")).status).toBe(400);
	});

	it("meldet 404 fuer ein unbekanntes Release", async () => {
		expect((await abtrennen(9999, "Egal")).status).toBe(404);
	});
});

describe("Abkuerzungs-Erkennung", () => {
	const anlegen = (titel: string) =>
		spielMit(titel, [{ plattform: "PS4", struktur: { b: 30, s: 8, g: 3, p: 1 }, nr: 1 }]);

	it.each(["AC Brotherhood", "AC Revelations"])("markiert %s", async (titel) => {
		await anlegen(titel);
		const a = await hole("/api/games/uebersicht?filter=alle");
		expect(a.zeilen[0].titelWirktAbgekuerzt).toBe(true);
	});

	// Komplett grossgeschriebene Titel sind Schreibweise, keine Abkuerzung.
	it.each(["THE FINALS", "ACE COMBAT INFINITY", "GTA IV"])(
		"markiert %s nicht",
		async (titel) => {
			await anlegen(titel);
			const a = await hole("/api/games/uebersicht?filter=alle");
			expect(a.zeilen[0].titelWirktAbgekuerzt).toBe(false);
		},
	);
});

describe("Sortierschluessel neu berechnen", () => {
	it("erkennt einen veralteten Schluessel und korrigiert ihn", async () => {
		const { gameId } = await spielMit("Alan Wake Remastered", [
			{ plattform: "PS4", struktur: { b: 30, s: 8, g: 3, p: 1 }, nr: 1 },
		]);
		// Zustand nachstellen, wie ihn die aeltere Normalisierung hinterliess
		await env.DB.prepare("UPDATE game SET sort_title = 'alan wake' WHERE id = ?")
			.bind(gameId)
			.run();

		const vorher = await hole("/api/games/uebersicht?filter=auffaellig");
		expect(vorher.zeilen[0].schluesselVeraltet).toBe(true);

		const antwort = await SELF.fetch(
			"https://example.com/api/games/schluessel-neu-berechnen",
			{ method: "POST" },
		);
		expect(await antwort.json()).toMatchObject({ geaendert: 1 });

		const g = await env.DB.prepare("SELECT sort_title FROM game WHERE id = ?")
			.bind(gameId)
			.first<{ sort_title: string }>();
		expect(g?.sort_title).toBe("alan wake remastered");
	});

	it("aendert nichts, wenn alle Schluessel stimmen", async () => {
		await spielMit("Bloodborne", [
			{ plattform: "PS4", struktur: { b: 30, s: 8, g: 3, p: 1 }, nr: 1 },
		]);
		const antwort = await SELF.fetch(
			"https://example.com/api/games/schluessel-neu-berechnen",
			{ method: "POST" },
		);
		expect(await antwort.json()).toMatchObject({ geaendert: 0 });
	});
});
