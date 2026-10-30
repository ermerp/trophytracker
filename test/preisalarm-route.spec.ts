import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index";
import { createRepositories } from "../src/db";
import { erstelleEbayClient } from "../src/ebay/client";
import { erstellePsnClient } from "../src/psn/client";
import { beschreibeEreignis, type Ereignis } from "../src/domain/ereignis";
import { MARKT_JE_POST } from "../src/sync/markt";
import { STORE_JE_POST } from "../src/sync/store";
import { fakeFetch } from "./psn-fake";
import { zaehlendeDb } from "./d1-zaehler";

/**
 * Preisalarm (Stufe 20g) gegen die lokale D1: die Meldungen aus den Preis-
 * Routen der Abendlaeufe, Verwerfen und Ruecknahme, die Glocke und die
 * Grenze am Release. Die Regeln selbst prueft `preisalarm.spec.ts` ohne D1.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const app = createApp(
	() => erstellePsnClient(fakeFetch([]).fetch),
	() => ({ konfiguriert: () => false }) as never,
	() => erstelleEbayClient(null),
);
const sende = (pfad: string, koerper: unknown, db: D1Database = env.DB, methode = "POST") =>
	app.request(pfad, { method: methode, headers: { "content-type": "application/json" }, body: JSON.stringify(koerper) }, { ...env, DB: db });
const hole = (pfad: string) => app.request(pfad, {}, env);

/** `YYYY-MM-DD HH:MM:SS` vor so vielen Tagen. */
const vor = (tage: number) => new Date(Date.now() - tage * 86_400_000).toISOString().slice(0, 19).replace("T", " ");

async function release(id: number, disc = "ja", absicht = true) {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)").bind(id, `Spiel ${id}`, `spiel ${id}`).run();
	await env.DB.prepare("INSERT INTO release (id, game_id, platform, physical_release_status) VALUES (?, ?, 'PS4', ?)")
		.bind(id, id, disc)
		.run();
	if (absicht) {
		await env.DB.prepare("INSERT INTO plan_entry (kind, release_id, game_id, origin) VALUES ('wunsch', ?, ?, 'manuell')").bind(id, id).run();
	}
}

/** Bisherige Punkte einer Reihe: [Tage vorher, Cent, Angebotskennung]. */
async function punkte(releaseId: number, reihe: "haendler" | "markt" | "store", p: Array<[number, number, string?]>) {
	for (const [tage, cents, item] of p) {
		await env.DB.prepare(
			"INSERT INTO price_snapshot (release_id, channel, kanal, source, price_cents, ebay_item_id, captured_at) VALUES (?, ?, ?, 'test', ?, ?, ?)",
		)
			.bind(releaseId, reihe === "store" ? "psn_store" : "gebraucht", reihe === "store" ? null : reihe, cents, item ?? null, vor(tage))
			.run();
	}
}

const urteil = (cents: number, itemId: string) => ({
	anbieter: "egal",
	angebot: { titel: "Spiel PS4", preisCents: cents, zustand: "Gut", verkaeufer: null, url: "https://www.ebay.de/itm/1", itemId },
});
const ergebnis = (releaseId: number, markt: number | null, haendler: number | null = null) => ({
	releaseId,
	rohangebote: 3,
	angebote: {
		...(haendler === null ? {} : { haendler: { preis: urteil(haendler, `22${releaseId}`), beleg: urteil(haendler, `22${releaseId}`) } }),
		...(markt === null ? {} : { markt: { preis: urteil(markt, `11${releaseId}${markt}`), beleg: urteil(markt, `11${releaseId}${markt}`) } }),
	},
});

const alarme = async () =>
	(
		await env.DB.prepare(
			"SELECT release_id, kanal, art, reihe, preis_cents, vorher_cents, ebay_item_id, quittiert_am IS NOT NULL AS quittiert, " +
				"entfallen_am IS NOT NULL AS entfallen FROM preis_alarm ORDER BY id",
		).all()
	).results;

beforeEach(async () => {
	for (const t of ["preis_alarm", "price_snapshot", "market_offer_verworfen", "market_offer", "game_event", "plan_entry", "release", "game"]) {
		await env.DB.prepare(`DELETE FROM ${t}`).run();
	}
});

describe("Preisalarm in der Markt-Route", () => {
	it("meldet ein Allzeittief einmal je Release mit dem tiefsten Preis aus beiden Reihen", async () => {
		await release(1);
		await punkte(1, "markt", [[40, 1226], [20, 1226]]);
		await punkte(1, "haendler", [[40, 1226], [20, 1226]]);
		const a = await sende("/api/sync/markt/ergebnisse", { ergebnisse: [ergebnis(1, 1050, 1084)] });
		expect(await a.json()).toMatchObject({ geprueft: 1, preisalarme: 1 });
		expect(await alarme()).toEqual([
			{ release_id: 1, kanal: "gebraucht", art: "tief", reihe: "markt", preis_cents: 1050, vorher_cents: 1226, ebay_item_id: "1111050", quittiert: 0, entfallen: 0 },
		]);
	});

	it("ein tieferer Preis aktualisiert die offene Meldung, ein gleicher laesst sie stehen", async () => {
		await release(1);
		await punkte(1, "markt", [[40, 1000], [20, 1000]]);
		await sende("/api/sync/markt/ergebnisse", { ergebnisse: [ergebnis(1, 850)] });
		await sende("/api/sync/markt/ergebnisse", { ergebnisse: [ergebnis(1, 850)] });
		expect(await alarme()).toHaveLength(1);
		await sende("/api/sync/markt/ergebnisse", { ergebnisse: [ergebnis(1, 700)] });
		expect(await alarme()).toMatchObject([{ preis_cents: 700, vorher_cents: 850 }]);
	});

	it("meldet nichts ohne offene Absicht und nichts auf einer zu jungen Reihe", async () => {
		await release(1, "ja", false);
		await punkte(1, "markt", [[40, 1000], [20, 1000]]);
		await release(2);
		await punkte(2, "markt", [[20, 1000], [10, 1000]]);
		const a = await sende("/api/sync/markt/ergebnisse", { ergebnisse: [ergebnis(1, 500), ergebnis(2, 500)] });
		expect(await a.json()).toMatchObject({ geprueft: 2, preisalarme: 0 });
		expect(await alarme()).toEqual([]);
	});

	it("bleibt im schlimmsten Fall - jedes Release meldet - unter 50 Anweisungen, in zwei D1-Aufrufen", async () => {
		// Sieben Anweisungen je Release wie bisher (beide Kanaele, beide
		// Verlaufspunkte, Disc-Beleg mit Protokoll, Stempel) und die Meldung.
		for (let i = 1; i <= MARKT_JE_POST; i++) {
			await release(i, "unbekannt");
			await punkte(i, "markt", [[40, 3000], [20, 3000]]);
		}
		const zaehler = zaehlendeDb(env.DB);
		const a = await sende(
			"/api/sync/markt/ergebnisse",
			{ ergebnisse: Array.from({ length: MARKT_JE_POST }, (_, i) => ergebnis(i + 1, 1000, 1100)) },
			zaehler.db,
		);
		expect(await a.json()).toMatchObject({ geprueft: MARKT_JE_POST, discBelegt: MARKT_JE_POST, preisalarme: MARKT_JE_POST });
		expect(zaehler.anweisungen()).toBeLessThanOrEqual(50);
		expect(zaehler.aufrufe()).toBe(2);
	});
});

describe("Preisalarm und das Verwerfen (20h)", () => {
	it("ein verworfenes Angebot laesst seine Meldung entfallen, die Ruecknahme stellt sie wieder her", async () => {
		await release(1);
		await punkte(1, "markt", [[40, 1000], [20, 1000]]);
		await sende("/api/sync/markt/ergebnisse", { ergebnisse: [ergebnis(1, 800)] });
		const r = repos();
		await r.markt.verwerfen(1, "111800", "Spiel PS4", 800);
		expect(await alarme()).toMatchObject([{ entfallen: 1 }]);
		expect((await (await hole("/api/preisalarme")).json()) as unknown).toEqual({ alarme: [] });

		// Der danach tiefste Punkt meldet nicht neu: Er steht schon da.
		await sende("/api/sync/markt/ergebnisse", { ergebnisse: [ergebnis(1, 1000)] });
		expect(await alarme()).toHaveLength(1);

		await r.markt.ruecknahme(1, "111800");
		expect(await alarme()).toMatchObject([{ entfallen: 0, preis_cents: 800 }]);
	});

	it("die Ruecknahme stellt nicht her, wenn inzwischen eine andere Meldung offen ist", async () => {
		await release(1);
		await punkte(1, "markt", [[60, 1000], [50, 1000]]);
		await sende("/api/sync/markt/ergebnisse", { ergebnisse: [ergebnis(1, 800)] });
		await repos().markt.verwerfen(1, "111800", "Spiel PS4", 800);
		await sende("/api/sync/markt/ergebnisse", { ergebnisse: [ergebnis(1, 600)] });
		expect(await repos().markt.ruecknahme(1, "111800")).toBe(true);
		expect(await alarme()).toMatchObject([{ entfallen: 1 }, { entfallen: 0, preis_cents: 600 }]);
	});
});

describe("Preisalarm in der Store-Route", () => {
	const preis = (cents: number) => ({
		releaseId: 1,
		preis: {
			produktId: "EP9000-CUSA00900_00-GHOSTOFTSUSHIMA0",
			produktName: "Spiel",
			preisCents: cents,
			grundpreisCents: cents,
			waehrung: "EUR",
			istSale: false,
			imPlusKatalog: false,
		},
	});

	it("meldet auf dem Store-Zweig bei Disc nein, nicht bei Disc ja", async () => {
		await release(1, "nein");
		await punkte(1, "store", [[40, 3999], [20, 3999]]);
		const a = await sende("/api/sync/store/ergebnisse", { ergebnisse: [preis(1999)] });
		expect(await a.json()).toMatchObject({ preisalarme: 1 });
		expect(await alarme()).toMatchObject([{ kanal: "store", reihe: "store", preis_cents: 1999, vorher_cents: 3999 }]);

		await env.DB.prepare("DELETE FROM preis_alarm").run();
		await env.DB.prepare("UPDATE release SET physical_release_status = 'ja'").run();
		await sende("/api/sync/store/ergebnisse", { ergebnisse: [preis(999)] });
		expect(await alarme()).toEqual([]);
	});

	it("bleibt mit einer vollen Portion, die ganz meldet, unter 50 Anweisungen", async () => {
		for (let i = 1; i <= STORE_JE_POST; i++) {
			await release(i, "nein");
			await punkte(i, "store", [[40, 3999], [20, 3999]]);
		}
		const zaehler = zaehlendeDb(env.DB);
		const a = await sende(
			"/api/sync/store/ergebnisse",
			{ ergebnisse: Array.from({ length: STORE_JE_POST }, (_, i) => ({ ...preis(999), releaseId: i + 1 })) },
			zaehler.db,
		);
		expect(await a.json()).toMatchObject({ preisalarme: STORE_JE_POST });
		expect(zaehler.anweisungen()).toBeLessThanOrEqual(50);
		expect(zaehler.aufrufe()).toBe(2);
	});
});

describe("Glocke: lesen und quittieren", () => {
	it("zeigt offene Meldungen mit Titel und Plattform, quittiert ueber die Id", async () => {
		await release(1);
		await punkte(1, "markt", [[40, 1000], [20, 1000]]);
		await sende("/api/sync/markt/ergebnisse", { ergebnisse: [ergebnis(1, 795)] });
		const { alarme: offen } = (await (await hole("/api/preisalarme")).json()) as { alarme: Array<Record<string, unknown>> };
		expect(offen).toMatchObject([{ releaseId: 1, gameId: 1, titel: "Spiel 1", plattform: "PS4", art: "tief", reihe: "markt", preisCents: 795, vorherCents: 1000 }]);

		const id = offen[0]!.id;
		expect((await sende(`/api/preisalarme/${id}/quittieren`, {})).status).toBe(200);
		expect((await sende(`/api/preisalarme/${id}/quittieren`, {})).status).toBe(404);
		expect((await (await hole("/api/preisalarme")).json()) as unknown).toEqual({ alarme: [] });
	});

	it("blendet eine Meldung aus, sobald keine Absicht mehr offen ist", async () => {
		await release(1);
		await punkte(1, "markt", [[40, 1000], [20, 1000]]);
		await sende("/api/sync/markt/ergebnisse", { ergebnisse: [ergebnis(1, 795)] });
		await env.DB.prepare("UPDATE plan_entry SET status = 'erledigt'").run();
		expect((await (await hole("/api/preisalarme")).json()) as unknown).toEqual({ alarme: [] });
	});
});

describe("Grenze am Release (PATCH /api/releases/:id)", () => {
	const grenze = async () =>
		await env.DB.prepare("SELECT preis_grenze_cents AS c, preis_grenze_am AS am FROM release WHERE id = 1").first<{ c: number | null; am: string | null }>();
	const ereignisse = async () =>
		(await env.DB.prepare("SELECT * FROM game_event WHERE kind = 'release_geaendert' ORDER BY id").all<Ereignis>()).results;

	it("setzt die Grenze mit Ereignis und Zeitpunkt", async () => {
		await release(1);
		const a = await sende("/api/releases/1", { preisGrenzeCents: 1000 }, env.DB, "PATCH");
		expect(await a.json()).toMatchObject({ preisGrenzeCents: 1000 });
		expect(await grenze()).toMatchObject({ c: 1000 });
		expect((await grenze())?.am).not.toBeNull();
		expect((await ereignisse()).map(beschreibeEreignis)).toEqual(["Preisalarm unter: leer → 10,00 €"]);
	});

	it("ein fehlender Schluessel laesst die Grenze stehen", async () => {
		await release(1);
		await sende("/api/releases/1", { preisGrenzeCents: 1000 }, env.DB, "PATCH");
		await sende("/api/releases/1", { discFassung: "nein" }, env.DB, "PATCH");
		expect(await grenze()).toMatchObject({ c: 1000 });
	});

	it("ein ausdrueckliches null leert sie, mit Ereignis", async () => {
		await release(1);
		await sende("/api/releases/1", { preisGrenzeCents: 1000 }, env.DB, "PATCH");
		await sende("/api/releases/1", { preisGrenzeCents: null }, env.DB, "PATCH");
		expect(await grenze()).toEqual({ c: null, am: null });
		expect((await ereignisse()).map(beschreibeEreignis)).toEqual(["Preisalarm unter: leer → 10,00 €", "Preisalarm unter: 10,00 € → leer"]);
	});

	it("dieselbe Grenze noch einmal: kein Ereignis, der Zeitpunkt bleibt", async () => {
		await release(1);
		await sende("/api/releases/1", { preisGrenzeCents: 1000 }, env.DB, "PATCH");
		await env.DB.prepare("UPDATE release SET preis_grenze_am = '2026-01-01 00:00:00'").run();
		await sende("/api/releases/1", { preisGrenzeCents: 1000 }, env.DB, "PATCH");
		expect(await grenze()).toEqual({ c: 1000, am: "2026-01-01 00:00:00" });
		expect(await ereignisse()).toHaveLength(1);
	});

	it("weist ab, was keine Grenze ist", async () => {
		await release(1);
		for (const g of [0, -5, 9.5, "10", 1_000_001]) {
			expect((await sende("/api/releases/1", { preisGrenzeCents: g }, env.DB, "PATCH")).status, String(g)).toBe(400);
		}
	});

	it("eine neue Grenze ueber dem aktuellen Preis meldet beim naechsten Lauf, danach nicht mehr", async () => {
		await release(1);
		await punkte(1, "markt", [[3, 795]]);
		await sende("/api/releases/1", { preisGrenzeCents: 1000 }, env.DB, "PATCH");
		await sende("/api/sync/markt/ergebnisse", { ergebnisse: [ergebnis(1, 790)] });
		expect(await alarme()).toMatchObject([{ art: "grenze", preis_cents: 790, vorher_cents: 1000 }]);
		const id = ((await (await hole("/api/preisalarme")).json()) as { alarme: Array<{ id: number }> }).alarme[0]!.id;
		await sende(`/api/preisalarme/${id}/quittieren`, {});
		await sende("/api/sync/markt/ergebnisse", { ergebnisse: [ergebnis(1, 785)] });
		expect(await alarme()).toHaveLength(1);
	});
});

describe("Spieldetail: Grenze und Kanal", () => {
	it("traegt die Grenze nur bei offener Absicht, mit dem Kanal zur Lesezeit", async () => {
		await release(1, "unbekannt");
		await release(2, "ja", false);
		await env.DB.prepare("UPDATE release SET game_id = 1 WHERE id = 2").run();
		await sende("/api/releases/1", { preisGrenzeCents: 1500 }, env.DB, "PATCH");
		const d = (await (await hole("/api/games/1")).json()) as { releases: Array<{ id: number; preisalarm: unknown }> };
		const r = new Map(d.releases.map((x) => [x.id, x.preisalarm]));
		expect(r.get(1)).toEqual({ grenzeCents: 1500, kanal: "store", aktuellCents: null });
		expect(r.get(2)).toBeNull();

		// Sobald eine Gebrauchtreihe besteht, gilt der Gebrauchtzweig.
		await punkte(1, "markt", [[1, 900]]);
		const e = (await (await hole("/api/games/1")).json()) as { releases: Array<{ id: number; preisalarm: { kanal: string } | null }> };
		expect(e.releases.find((x) => x.id === 1)?.preisalarm?.kanal).toBe("gebraucht");
	});
});
