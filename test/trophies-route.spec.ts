import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";
import { normalisiereSeite } from "../src/domain/normalize";
import { fakeSeite, fakeTitel } from "./trophy-fixtures";

type Antwort = {
	gesamt: number;
	limit: number;
	offset: number;
	sortierung: string;
	titel: Array<{
		titel: string;
		plattform: string;
		platin: string;
		fortschritt: number;
		zugeordnet: boolean;
	}>;
};

const hole = async (pfad: string) =>
	(await SELF.fetch(`https://example.com${pfad}`)).json() as Promise<Antwort>;

beforeEach(async () => {
	await env.DB.prepare("DELETE FROM trophy_progress").run();

	const titel = normalisiereSeite(
		fakeSeite([
			fakeTitel(1, { trophyTitleName: "Ohne Platin",
				definedTrophies: { bronze: 10, silver: 0, gold: 0, platinum: 0 },
				earnedTrophies: { bronze: 10, silver: 0, gold: 0, platinum: 0 }, progress: 100 }),
			fakeTitel(2, { trophyTitleName: "Platin offen", progress: 40 }),
			fakeTitel(3, { trophyTitleName: "Platin erspielt",
				earnedTrophies: { bronze: 30, silver: 8, gold: 3, platinum: 1 }, progress: 100 }),
			fakeTitel(4, { trophyTitleName: "Cross Gen", trophyTitlePlatform: "PS3,PSVITA,PS4" }),
		]),
	).titel;
	await createRepositories(env.DB, env.NPSSO_KEY).trophies.upsertSeite(titel);
});

describe("GET /api/trophies", () => {
	it("liefert alle Titel mit Gesamtzahl", async () => {
		const antwort = await hole("/api/trophies");
		expect(antwort.gesamt).toBe(4);
		expect(antwort.titel).toHaveLength(4);
	});

	// Abschnitt 4.1: dreiwertig, nicht Boolean. Bei 93 von 431 echten Titeln
	// waere "offen" schlicht falsch.
	it("unterscheidet Platin dreiwertig", async () => {
		const nach = Object.fromEntries(
			(await hole("/api/trophies?sortierung=titel")).titel.map((t) => [t.titel, t.platin]),
		);

		expect(nach["Ohne Platin"]).toBe("nicht_verfuegbar");
		expect(nach["Platin offen"]).toBe("offen");
		expect(nach["Platin erspielt"]).toBe("erspielt");
	});

	it("gibt kommagetrennte Plattformen unveraendert weiter", async () => {
		const eintrag = (await hole("/api/trophies?sortierung=titel")).titel.find(
			(t) => t.titel === "Cross Gen",
		);
		expect(eintrag?.plattform).toBe("PS3,PSVITA,PS4");
	});

	it("filtert auf erspieltes Platin", async () => {
		const antwort = await hole("/api/trophies?nurPlatin=true");
		expect(antwort.gesamt).toBe(1);
		expect(antwort.titel[0].titel).toBe("Platin erspielt");
	});

	it("blaettert", async () => {
		const antwort = await hole("/api/trophies?limit=2&offset=2&sortierung=titel");
		expect(antwort).toMatchObject({ gesamt: 4, limit: 2, offset: 2 });
		expect(antwort.titel).toHaveLength(2);
	});

	it("faellt bei unbekannter Sortierung auf 'zuletzt' zurueck", async () => {
		expect((await hole("/api/trophies?sortierung=; DROP TABLE")).sortierung).toBe("zuletzt");
	});

	it("deckelt limit und weist negative Werte ab", async () => {
		expect((await hole("/api/trophies?limit=9999")).limit).toBe(200);
		expect((await hole("/api/trophies?offset=-5")).offset).toBe(0);
	});

	it("meldet, dass noch keine Zuordnung besteht", async () => {
		// release_id ist bis Stufe 4 ueberall NULL.
		const antwort = await hole("/api/trophies");
		expect(antwort.titel.every((t) => t.zugeordnet === false)).toBe(true);
	});
});
