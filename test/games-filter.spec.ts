import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

/**
 * Filter auf GET /api/games (Abschnitt 12).
 *
 * Semantik: Ein Spiel erscheint, wenn mindestens ein Release alle
 * Release-Filter zugleich erfuellt.
 */

const B = "https://example.com";
const hole = async (pfad: string) => (await SELF.fetch(`${B}${pfad}`)).json() as Promise<any>;
const titel = async (abfrage: string) =>
	((await hole(`/api/games?${abfrage}`)).spiele as Array<{ titel: string }>).map((s) => s.titel);

async function leeren() {
	await env.DB.batch(
		["physical_copy", "digital_entitlement", "trophy_progress", "release", "game"].map((t) =>
			env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
}

let naechsteId = 1;

type ReleaseSpec = {
	platform: string;
	disc?: "ja" | "nein" | "unbekannt";
	exemplare?: number;
	digital?: string[];
	/** null = keine Trophaeenliste */
	trophaeen?: { pct: number; platinDefiniert?: boolean; platin?: boolean; zuletzt?: string } | null;
};

async function spiel(name: string, releases: ReleaseSpec[]): Promise<number> {
	const gameId = naechsteId++;
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)")
		.bind(gameId, name, name.toLowerCase())
		.run();

	for (const r of releases) {
		const releaseId = naechsteId++;
		await env.DB.prepare(
			"INSERT INTO release (id, game_id, platform, physical_release_status) VALUES (?, ?, ?, ?)",
		)
			.bind(releaseId, gameId, r.platform, r.disc ?? "unbekannt")
			.run();
		for (let i = 0; i < (r.exemplare ?? 0); i++) {
			await env.DB.prepare("INSERT INTO physical_copy (release_id) VALUES (?)").bind(releaseId).run();
		}
		for (const q of r.digital ?? []) {
			await env.DB.prepare("INSERT INTO digital_entitlement (release_id, source) VALUES (?, ?)")
				.bind(releaseId, q)
				.run();
		}
		if (r.trophaeen) {
			const t = r.trophaeen;
			await env.DB.prepare(
				"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, " +
					"icon_url, progress_pct, defined_platinum, earned_platinum, last_played_at, synced_at, release_id) " +
					"VALUES (?, 'trophy', ?, ?, ?, ?, ?, ?, ?, '2026-01-01', ?)",
			)
				.bind(
					`NPWR${releaseId}`,
					name,
					r.platform,
					`https://beispiel.invalid/${releaseId}.png`,
					t.pct,
					t.platinDefiniert === false ? 0 : 1,
					t.platin ? 1 : 0,
					t.zuletzt ?? null,
					releaseId,
				)
				.run();
		}
	}
	return gameId;
}

beforeEach(async () => {
	await leeren();
	naechsteId = 1;
});

describe("GET /api/games – Filter", () => {
	beforeEach(async () => {
		// Bloodborne: PS4, Disc im Regal, Platin erspielt, zuletzt 2024
		await spiel("Bloodborne", [
			{ platform: "PS4", exemplare: 1, disc: "ja", trophaeen: { pct: 100, platin: true, zuletzt: "2024-06-01T00:00:00Z" } },
		]);
		// Journey: PS3 digital (Plus), PS4 nie angefasst; kein Platin vorgesehen
		await spiel("Journey", [
			{ platform: "PS3", digital: ["plus"], trophaeen: { pct: 40, platinDefiniert: false, zuletzt: "2013-01-01T00:00:00Z" } },
			{ platform: "PS4", trophaeen: { pct: 0, platinDefiniert: false } },
		]);
		// GTA V: PS4-Disc UND PS5 digital gekauft, PS5 gespielt ohne Platin
		await spiel("Grand Theft Auto V", [
			{ platform: "PS4", exemplare: 1, trophaeen: { pct: 20, zuletzt: "2020-01-01T00:00:00Z" } },
			{ platform: "PS5", digital: ["kauf"], trophaeen: { pct: 60, zuletzt: "2025-12-24T00:00:00Z" } },
		]);
		// Regalleiche: zwei PS3-Discs, nie gestartet, keine Trophaeenliste
		await spiel("Ico", [{ platform: "PS3", exemplare: 2, trophaeen: null }]);
		// Nur digital, Disc existiert laut Status nicht
		await spiel("Journey Collector", [{ platform: "PS4", disc: "nein", digital: ["kauf", "plus"], trophaeen: { pct: 5 } }]);
	});

	it("ohne Filter: alle, nach Sortiertitel", async () => {
		const a = await hole("/api/games");
		expect(a.gesamt).toBe(5);
		expect(a.spiele.map((s: any) => s.titel)).toEqual([
			"Bloodborne", "Grand Theft Auto V", "Ico", "Journey", "Journey Collector",
		]);
	});

	it("platform", async () => {
		expect(await titel("platform=PS5")).toEqual(["Grand Theft Auto V"]);
		expect(await titel("platform=PS3")).toEqual(["Ico", "Journey"]);
	});

	it("owned", async () => {
		expect(await titel("owned=physisch")).toEqual(["Bloodborne", "Grand Theft Auto V", "Ico"]);
		expect(await titel("owned=digital")).toEqual(["Grand Theft Auto V", "Journey", "Journey Collector"]);
		// 'beide' verlangt beides am selben Release - GTA V hat es auf getrennten
		expect(await titel("owned=beide")).toEqual([]);
		// 'keins': mindestens ein Release ohne jeden Besitz
		expect(await titel("owned=keins")).toEqual(["Journey"]);
	});

	it("played", async () => {
		expect(await titel("played=nein")).toEqual(["Ico", "Journey"]);
		expect(await titel("played=ja")).toEqual(["Bloodborne", "Grand Theft Auto V", "Journey", "Journey Collector"]);
	});

	it("platinum ist dreiwertig", async () => {
		expect(await titel("platinum=ja")).toEqual(["Bloodborne"]);
		expect(await titel("platinum=nein")).toEqual(["Grand Theft Auto V", "Journey Collector"]);
		// Ico hat keine Liste, Journey keine Platin-Trophaee: beide "nicht verfuegbar"
		expect(await titel("platinum=nichtverfuegbar")).toEqual(["Ico", "Journey"]);
	});

	it("physicalAvailable", async () => {
		expect(await titel("physicalAvailable=ja")).toEqual(["Bloodborne"]);
		expect(await titel("physicalAvailable=nein")).toEqual(["Journey Collector"]);
		expect(await titel("physicalAvailable=unbekannt")).toEqual(["Grand Theft Auto V", "Ico", "Journey"]);
	});

	it("search sucht im Titel, unabhaengig von Gross- und Kleinschreibung", async () => {
		expect(await titel("search=JOURN")).toEqual(["Journey", "Journey Collector"]);
		expect(await titel("search=xyz")).toEqual([]);
	});

	it("search uebergeht Apostrophe, gerade und typografische (19.09.2026)", async () => {
		await spiel("Assassin's Creed II", [{ platform: "PS3", trophaeen: { pct: 10 } }]);
		await spiel("Marvel\u2019s Spider-Man", [{ platform: "PS4", trophaeen: { pct: 10 } }]);
		expect(await titel("search=assassins")).toEqual(["Assassin's Creed II"]);
		expect(await titel("search=assassin's")).toEqual(["Assassin's Creed II"]);
		expect(await titel("search=marvels")).toEqual(["Marvel\u2019s Spider-Man"]);
		expect(await titel("search=marvel%E2%80%99s")).toEqual(["Marvel\u2019s Spider-Man"]);
	});

	it("kombiniert Filter auf Release-Ebene", async () => {
		// GTA V hat eine PS4-Disc, aber die PS5 ist digital
		expect(await titel("platform=PS5&owned=physisch")).toEqual([]);
		expect(await titel("platform=PS4&owned=physisch")).toEqual(["Bloodborne", "Grand Theft Auto V"]);
		expect(await titel("owned=digital&played=ja&platinum=nein")).toEqual(["Grand Theft Auto V", "Journey Collector"]);
	});

	it("ignoriert unbekannte Filterwerte statt 400", async () => {
		const antwort = await SELF.fetch(`${B}/api/games?owned=egal&platform=XBOX`);
		expect(antwort.status).toBe(200);
		expect((await antwort.json() as any).gesamt).toBe(5);
	});

	it("sort=zuletzt: zuletzt gespielt zuerst, nie gespielte am Ende", async () => {
		expect(await titel("sort=zuletzt")).toEqual([
			"Grand Theft Auto V", "Bloodborne", "Journey", "Ico", "Journey Collector",
		]);
	});

	it("blaettert und zaehlt gesamt ueber alle Seiten", async () => {
		const a = await hole("/api/games?limit=2&offset=2");
		expect(a.gesamt).toBe(5);
		expect(a.spiele.map((s: any) => s.titel)).toEqual(["Ico", "Journey"]);
	});

	it("liefert je Release Besitz, Fortschritt und Platin dreiwertig", async () => {
		const a = await hole("/api/games?search=Grand");
		const gta = a.spiele[0];
		expect(gta.bild).toMatch(/\.png$/);
		expect(gta.zuletztGespielt).toBe("2025-12-24T00:00:00Z");
		expect(gta.releases).toEqual([
			expect.objectContaining({ plattform: "PS4", exemplare: 1, digital: [], fortschritt: 20, platin: "offen" }),
			expect.objectContaining({
				plattform: "PS5",
				exemplare: 0,
				// Seit Stufe 18c nennt die Antwort auch die Herkunft: Nur eigene
				// Eintraege bekommen in der Oberflaeche ein Loeschkreuz.
				digital: [{ quelle: "kauf", herkunft: "nutzer" }],
				fortschritt: 60,
			}),
		]);

		const ico = (await hole("/api/games?search=Ico")).spiele[0];
		expect(ico.bild).toBeNull();
		expect(ico.releases[0]).toMatchObject({ exemplare: 2, fortschritt: null, platin: null });

		const journey = (await hole("/api/games?search=Journey&platform=PS3")).spiele[0];
		expect(journey.releases[0]).toMatchObject({
			plattform: "PS3",
			platin: "nicht_verfuegbar",
			digital: [{ quelle: "plus", herkunft: "nutzer" }],
		});
	});
});
