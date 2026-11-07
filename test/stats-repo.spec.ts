import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { NUR_WUNSCH } from "../src/db/stats";

/**
 * Stufe 19a: die Kennzahlen des Dashboards gegen die lokale D1, mit
 * nachgebauten Zeilen (nie echte PSN-Daten, CLAUDE.md).
 *
 * Geprueft wird vor allem, was sich still verschieben kann: dass eine
 * Plattform ohne Release als 0 erscheint statt zu fehlen, dass ein Release,
 * das nur einen Wunsch traegt, nirgends mitzaehlt, und dass die
 * Trophaeensumme auch die noch nicht zugeordneten Listen enthaelt.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const B = "https://example.com";

async function leeren() {
	await env.DB.batch(
		["plan_entry", "play_status", "physical_copy", "digital_entitlement", "trophy_progress", "release", "game"].map(
			(t) => env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
}

async function spiel(id: number, plattform: string) {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)")
		.bind(id, `Spiel ${id}`, `spiel ${id}`)
		.run();
	await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, ?, ?)")
		.bind(id, id, plattform)
		.run();
}

async function liste(
	releaseId: number | null,
	werte: { bronze?: number; silber?: number; gold?: number; platin?: number; erspieltPlatin?: number; zuletzt?: string } = {},
) {
	const w = { bronze: 10, silber: 4, gold: 2, platin: 1, erspieltPlatin: 0, ...werte };
	await env.DB.prepare(
		"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, " +
			"defined_bronze, earned_bronze, defined_silver, earned_silver, defined_gold, earned_gold, " +
			"defined_platinum, earned_platinum, progress_pct, last_played_at, synced_at, release_id) " +
			"VALUES (?, 'trophy', 'x', 'PS4', ?, ?, ?, ?, ?, ?, ?, ?, 50, ?, '2026-01-01', ?)",
	)
		.bind(
			`NPWR${releaseId ?? "frei"}`,
			w.bronze, w.bronze, w.silber, w.silber, w.gold, w.gold,
			w.platin, w.erspieltPlatin, werte.zuletzt ?? null, releaseId,
		)
		.run();

	/*
	 * Seit Stufe 19b kommt "letztes Platin" aus `trophy.earned_at`, nicht mehr
	 * aus `last_played_at` der Liste: Der Zeitpunkt des Platins steht jetzt da,
	 * und die Ueberschrift darf sagen, was sie meint. Der Zaehler allein genuegt
	 * dem Test deshalb nicht mehr - es braucht die Zeile.
	 */
	if (w.erspieltPlatin > 0) {
		await env.DB.prepare(
			"INSERT INTO trophy (np_communication_id, trophy_id, grade, name, earned, earned_at) " +
				"VALUES (?, 0, 'platin', 'Alles erreicht', 1, ?)",
		)
			.bind(`NPWR${releaseId ?? "frei"}`, werte.zuletzt ?? "2026-01-01T00:00:00Z")
			.run();
	}
}

describe("Kennzahlen fuers Dashboard (Stufe 19a)", () => {
	beforeEach(leeren);

	it("nennt jede der vier Plattformen, auch ohne Release", async () => {
		await spiel(1, "PS4");
		await liste(1);

		const k = await repos().stats.kennzahlen();
		expect(Object.keys(k.plattformen).sort()).toEqual(["PS3", "PS4", "PS5", "PSVITA"]);
		expect(k.plattformen.PS4.releases).toBe(1);
		// Kein Release - aber eine Zeile mit Nullen, damit die Kachel nicht fehlt.
		expect(k.plattformen.PS3).toMatchObject({ releases: 0, spiele: 0, platin: 0, disc: 0 });
	});

	it("laesst Releases aussen vor, die nur einen Wunsch tragen", async () => {
		await spiel(1, "PS4");
		await liste(1);
		await spiel(2, "PS5"); // nur Wunsch, keine Liste, kein Besitz
		await env.DB.prepare(
			"INSERT INTO plan_entry (kind, release_id, status, origin) VALUES ('wunsch', 2, 'offen', 'manuell')",
		).run();

		const k = await repos().stats.kennzahlen();
		expect(k.releases).toBe(1);
		expect(k.spiele).toBe(1);
		expect(k.plattformen.PS5.releases).toBe(0);
	});

	/**
	 * Die Bedingung steht zweimal im Code: hier und als
	 * GamesRepository.NUR_WUNSCH. Laufen sie auseinander, zaehlt das
	 * Dashboard eine andere Sammlung als die Sammlungsansicht - dieser Test
	 * faellt dann.
	 */
	it("zaehlt dieselbe Sammlung wie /api/games", async () => {
		await spiel(1, "PS4");
		await liste(1);
		await spiel(2, "PS5");
		await env.DB.prepare(
			"INSERT INTO plan_entry (kind, release_id, status, origin) VALUES ('wunsch', 2, 'offen', 'manuell')",
		).run();
		await spiel(3, "PS3");
		await env.DB.prepare("INSERT INTO physical_copy (release_id, condition) VALUES (3, 'gut')").run();

		const k = await repos().stats.kennzahlen();
		const antwort = await SELF.fetch(`${B}/api/games?limit=100`);
		const daten = (await antwort.json()) as { gesamt: number };
		expect(k.spiele).toBe(daten.gesamt);
	});

	it("zaehlt ein Release ohne play_status als nicht gespielt", async () => {
		await spiel(1, "PS4");
		await liste(1);
		await spiel(2, "PS4");
		await liste(2);
		await env.DB.prepare("INSERT INTO play_status (release_id, status) VALUES (2, 'komplettiert')").run();

		const k = await repos().stats.kennzahlen();
		expect(k.status.nicht_gespielt).toBe(1);
		expect(k.status.komplettiert).toBe(1);
		// Alle sieben Werte stehen da, auch die mit 0.
		expect(Object.keys(k.status)).toHaveLength(7);
		expect(k.status.unentschieden).toBe(0);
	});

	/**
	 * Die Summe soll der Zahl bei PSN entsprechen (Entscheidung des Nutzers
	 * vom 24.09.2026) - eine nicht zugeordnete Liste traegt ihre erspielten
	 * Trophaeen trotzdem.
	 */
	it("summiert auch Listen ohne Zuordnung mit", async () => {
		await spiel(1, "PS4");
		await liste(1, { bronze: 10, silber: 4, gold: 2, platin: 1, erspieltPlatin: 1 });
		await liste(null, { bronze: 5, silber: 0, gold: 0, platin: 0 });

		const k = await repos().stats.kennzahlen();
		expect(k.trophaeen.listen).toBe(2);
		expect(k.trophaeen.ohne_zuordnung).toBe(1);
		expect(k.trophaeen.erspielt_bronze).toBe(15);
		// Platin dreiwertig: eine der beiden Listen kennt ueberhaupt ein Platin.
		expect(k.trophaeen.platin_moeglich).toBe(1);
		expect(k.trophaeen.platin_erspielt).toBe(1);
	});

	it("nennt das zuletzt ERSPIELTE Platin, mit seinem Zeitpunkt (Stufe 19b)", async () => {
		await spiel(1, "PS4");
		await liste(1, { erspieltPlatin: 1, zuletzt: "2026-01-05T00:00:00Z" });
		await spiel(2, "PS5");
		await liste(2, { erspieltPlatin: 1, zuletzt: "2026-03-09T00:00:00Z" });
		await spiel(3, "PS3");
		await liste(3, { erspieltPlatin: 0, zuletzt: "2026-08-01T00:00:00Z" }); // kein Platin

		const k = await repos().stats.kennzahlen();
		expect(k.letztesPlatin?.game_id).toBe(2);
		expect(k.letztesPlatin?.erspielt_am).toBe("2026-03-09T00:00:00Z");
		expect(k.letztesPlatin?.platin_name).toBe("Alles erreicht");
	});

	/**
	 * Stufe 24: "davon … PS Plus" in der Box "Digital". Gezaehlt wird ein
	 * Release, dessen digitale Berechtigungen ALLE aus dem Abo stammen. Wer
	 * dasselbe Spiel auch gekauft hat, besitzt es - das zaehlt nicht mit.
	 */
	it("zaehlt digital nur ueber PS Plus, nicht gekauft und Plus zugleich (Stufe 24)", async () => {
		await spiel(1, "PS4"); // nur Plus
		await spiel(2, "PS4"); // gekauft
		await spiel(3, "PS4"); // Plus und gekauft
		await spiel(4, "PS4"); // nur Disc
		const recht = env.DB.prepare("INSERT INTO digital_entitlement (release_id, source) VALUES (?, ?)");
		await env.DB.batch([recht.bind(1, "plus"), recht.bind(2, "kauf"), recht.bind(3, "plus"), recht.bind(3, "kauf")]);
		await env.DB.prepare("INSERT INTO physical_copy (release_id, condition) VALUES (4, 'gut')").run();

		const k = await repos().stats.kennzahlen();
		expect(k.plattformen.PS4.digital).toBe(3);
		expect(k.plattformen.PS4.nur_plus).toBe(1);
	});

	/**
	 * Stufe 24: die zuletzt erspielte Trophaee, gleich welcher Stufe - auch
	 * aus einer Liste ohne Zuordnung. Dann steht der Rohtitel von Sony da und
	 * keine Spiel-Id, statt dass die Trophaee fehlt.
	 */
	it("nennt die zuletzt erspielte Trophaee jeder Stufe, auch ohne Zuordnung (Stufe 24)", async () => {
		await spiel(1, "PS5");
		await liste(1, { erspieltPlatin: 1, zuletzt: "2026-03-01T00:00:00Z" });
		await liste(null);
		const trophaee = env.DB.prepare(
			"INSERT INTO trophy (np_communication_id, trophy_id, grade, name, earned, earned_at, earned_rate) VALUES (?, ?, ?, ?, ?, ?, ?)",
		);
		await env.DB.batch([
			trophaee.bind("NPWR1", 5, "bronze", "Spaeter", 1, "2026-04-01T00:00:00Z", 18.5),
			// Nicht erspielt, aber mit Datum - darf nicht zaehlen.
			trophaee.bind("NPWR1", 6, "gold", "Offen", 0, "2026-09-01T00:00:00Z", 3.1),
		]);

		let k = await repos().stats.kennzahlen();
		expect(k.letzteTrophaee).toMatchObject({ name: "Spaeter", grade: "bronze", earned_rate: 18.5, game_id: 1, platform: "PS5", title: "Spiel 1" });

		await trophaee.bind("NPWRfrei", 1, "silber", "Ohne Spiel", 1, "2026-05-01T00:00:00Z", null).run();
		k = await repos().stats.kennzahlen();
		expect(k.letzteTrophaee).toMatchObject({ name: "Ohne Spiel", game_id: null, platform: null, title: "x" });

		const d = (await (await SELF.fetch(`${B}/api/stats`)).json()) as any;
		// Unbekannte Seltenheit bleibt null, nie 0 (Abschnitt 3).
		expect(d.letzteTrophaee).toMatchObject({ name: "Ohne Spiel", stufe: "silber", spielId: null, seltenheit: null });
	});

	it("kommt mit einer leeren Datenbank aus", async () => {
		const k = await repos().stats.kennzahlen();
		expect(k.spiele).toBe(0);
		expect(k.releases).toBe(0);
		expect(k.letztesPlatin).toBeNull();
		expect(k.trophaeen.listen).toBe(0);

		const antwort = await SELF.fetch(`${B}/api/stats`);
		expect(antwort.status).toBe(200);
		const daten = (await antwort.json()) as any;
		// Keine NaN, keine null in den Summen - die Oberflaeche zeigt 0.
		expect(daten.trophaeen.erspielt).toBe(0);
		expect(daten.trophaeen.definiert).toBe(0);
		expect(daten.plattformen).toHaveLength(4);
		expect(daten.letztesPlatin).toBeNull();
		expect(daten.letzteTrophaee).toBeNull();
	});

	it("liefert die Route in der Form aus Abschnitt 12", async () => {
		await spiel(1, "PS4");
		await liste(1, { erspieltPlatin: 1, zuletzt: "2026-02-02T00:00:00Z" });
		await env.DB.prepare("INSERT INTO physical_copy (release_id, condition) VALUES (1, 'gut')").run();
		await env.DB.prepare(
			"INSERT INTO plan_entry (kind, release_id, status, origin) VALUES ('backlog', 1, 'offen', 'manuell')",
		).run();

		const antwort = await SELF.fetch(`${B}/api/stats`);
		expect(antwort.status).toBe(200);
		const d = (await antwort.json()) as any;
		expect(d.spiele).toBe(1);
		expect(d.releases).toBe(1);
		// Die neueste Plattform zuerst (Stufe 24, Entscheidung vom 07.11.2026).
		expect(d.plattformen.map((p: any) => p.plattform)).toEqual(["PS5", "PS4", "PS3", "PSVITA"]);
		expect(d.plattformen[1]).toMatchObject({ plattform: "PS4", releases: 1, disc: 1, platin: 1, platinMoeglich: 1, nurPlus: 0 });
		expect(d.listen).toEqual({ backlog: 1, todo: 0 });
		// Platin steht oben (Wertigkeit, Abschnitt 13).
		expect(d.trophaeen.stufen.map((s: any) => s.stufe)).toEqual(["platin", "gold", "silber", "bronze"]);
		expect(d.letztesPlatin).toMatchObject({ spielId: 1, plattform: "PS4", platin: 1 });
	});

	/**
	 * D1 erlaubt hoechstens fuenf Terme in einem zusammengesetzten SELECT
	 * (gemessen am 24.09.2026 gegen Produktion und lokale D1). Eine
	 * Kennzahlenabfrage als eine grosse UNION-Tabelle waere der naheliegende
	 * Weg und scheitert - der Test benennt den Grund, damit niemand es erneut
	 * versucht.
	 */
	it("haelt fest, warum die Zaehler kein UNION ALL sind", async () => {
		const fuenf = "SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5";
		await expect(env.DB.prepare(fuenf).all()).resolves.toBeTruthy();
		await expect(env.DB.prepare(`${fuenf} UNION ALL SELECT 6`).all()).rejects.toThrow(/compound SELECT/i);
		// Und keine der Kennzahlenabfragen benutzt eines.
		expect(NUR_WUNSCH).not.toMatch(/UNION/i);
	});
});
