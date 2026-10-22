import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import roh from "../.github/workflows/store.yml?raw";
import { createApp } from "../src/index";
import { createRepositories } from "../src/db";
import { titelSchluessel } from "../src/domain/titel";
import { erstelleEbayClient } from "../src/ebay/client";
import { erstelleIgdbClient, type IgdbClient } from "../src/igdb/client";
import { erstellePsnClient } from "../src/psn/client";
import type { StoreClient } from "../src/psn/store";
import { STORE_JE_POST } from "../src/sync/store";
import { storeLauf } from "../src/sync/store-lauf";
import { zaehlendeDb } from "./d1-zaehler";
import { fakeFetch } from "./psn-fake";
import { conceptSeite, fakeStore, htmlAntwort, produktSeite } from "./store-fake";

/**
 * Die Store-Action (Stufe 20j, Abschnitt 7.4) - nach dem Muster der
 * Markt-Action. Gemessen wird der ganze Weg: der Lauf gegen die ECHTEN Routen
 * des Workers, denn seit der Schritt eine Action ist, schreibt er nur noch
 * dort.
 */

/** Ohne Kommentare - die Datei erklaert die Regel selbst und nennt dabei `pull_request`. */
const workflow = roh.replace(/^[ \t]*#.*\n/gm, "");

describe("Workflow der Store-Action (Stufe 20j)", () => {
	it("startet nur ueber schedule und workflow_dispatch", () => {
		const block = /^on:\n((?:[ \t]+.*\n|\s*\n)*)/m.exec(workflow)?.[1] ?? "";
		const ausloeser = [...block.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
		expect(ausloeser).toEqual(["schedule", "workflow_dispatch"]);
		expect(workflow).not.toMatch(/pull_request/);
	});

	it("laeuft um 20:47 mit Rueckfall um 22:47 UTC (Entscheidung vom 22.10.2026)", () => {
		expect([...workflow.matchAll(/cron: "([^"]+)"/g)].map((m) => m[1])).toEqual(["47 20 * * *", "47 22 * * *"]);
	});

	it("gibt dem Token nur Leserechte am Repository und kennt nur das Service Token als Secret", () => {
		expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
		expect([...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1])).toEqual([
			"STORE_ACCESS_CLIENT_ID",
			"STORE_ACCESS_CLIENT_SECRET",
		]);
	});
});

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const PRODUKT = "EP9000-CUSA13323_00-GHOSTSHIP0000000";

async function spiel(
	id: number,
	titel: string,
	optionen: { plattform?: string; conceptId?: string | null; produktId?: string | null; igdbId?: number } = {},
) {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title, igdb_id, store_concept_id) VALUES (?, ?, ?, ?, ?)")
		.bind(id, titel, titelSchluessel(titel), optionen.igdbId ?? null, optionen.conceptId ?? null)
		.run();
	await env.DB.prepare("INSERT INTO release (id, game_id, platform, physical_release_status, psn_product_id) VALUES (?, ?, ?, 'unbekannt', ?)")
		.bind(id, id, optionen.plattform ?? "PS4", optionen.produktId ?? null)
		.run();
	await env.DB.prepare(
		"INSERT INTO plan_entry (release_id, kind, status, origin, created_at) VALUES (?, 'wunsch', 'offen', 'manuell', datetime('now'))",
	)
		.bind(id)
		.run();
}

const stand = async (id: number) =>
	await env.DB.prepare(
		"SELECT psn_product_id AS produkt, store_price_cents AS preis, store_befund AS befund, store_geprueft_am AS wann FROM release WHERE id = ?",
	)
		.bind(id)
		.first<{ produkt: string | null; preis: number | null; befund: string | null; wann: string | null }>();

const cronStand = async () => (await repos().sync.cronStand()) as Record<string, { getan: string; meldung: boolean; offen?: number; geprueft?: number }>;

/** Ein Store mit einer Concept-Seite und einer kaeuflichen Produktseite. */
const storeMitPreis = (cents = 1999) =>
	fakeStore([
		[/\/concept\//, () => htmlAntwort(conceptSeite("235227", [{ id: PRODUKT, name: "Ghost of Tsushima" }]))],
		[/\/product\//, () => htmlAntwort(produktSeite(PRODUKT, [{ typ: "ADD_TO_CART", produktId: PRODUKT, grundCents: cents, preisCents: cents }], { name: "Ghost of Tsushima" }))],
	]);

function igdbMit(jeId: Record<number, string>): IgdbClient {
	const hole = async (eingabe: RequestInfo | URL): Promise<Response> => {
		if (String(eingabe).includes("oauth2/token")) return Response.json({ access_token: "t", expires_in: 7200 });
		return Response.json(
			Object.entries(jeId).map(([id, concept]) => ({
				id: Number(id),
				external_games: [{ uid: concept, external_game_source: 36, url: `https://store.playstation.com/en-us/concept/${concept}` }],
			})),
		);
	};
	return erstelleIgdbClient({ clientId: "id", clientSecret: { offenlegen: () => "geheim" } as never }, hole as typeof fetch);
}

const app = (igdb: IgdbClient = erstelleIgdbClient(null), db = env.DB) => {
	const a = createApp(
		() => erstellePsnClient(fakeFetch([]).fetch),
		() => igdb,
		() => erstelleEbayClient(null),
	);
	return (pfad: string, init?: RequestInit) => Promise.resolve(a.request(pfad, init, { ...env, DB: db }));
};

const lauf = (store: StoreClient, igdb?: IgdbClient, jePost?: number) => storeLauf(app(igdb), store, { jePost });

const sende = (pfad: string, koerper: unknown, db = env.DB) =>
	app(undefined, db)(pfad, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(koerper) });

beforeEach(async () => {
	for (const t of ["price_snapshot", "digital_entitlement", "plan_entry", "game_event", "release", "game", "app_setting"]) {
		await env.DB.prepare(`DELETE FROM ${t}`).run();
	}
});

describe("Lauf der Store-Action (Stufe 20j)", () => {
	it("prueft alle Faelligen in Portionen, schreibt Preis samt Protokoll und vermerkt den Ausgang", async () => {
		for (let i = 1; i <= 7; i++) await spiel(i, `Ghost of Tsushima ${i}`, { conceptId: "235227" });
		const e = await lauf(storeMitPreis(1999).client, undefined, 3);
		expect(e).toMatchObject({ status: "erfolg", geprueft: 7, mitPreis: 7, zugeordnet: 7, nochOffen: 0, portionen: 3, uebersprungen: 0 });
		// Das Concept wird je Lauf nur einmal geholt, jedes Produkt einmal je Release.
		expect(e.anfragen).toBe(8);
		expect(await stand(1)).toMatchObject({ produkt: PRODUKT, preis: 1999, befund: "preis" });
		const protokoll = await env.DB.prepare("SELECT COUNT(*) AS n FROM game_event WHERE kind = 'release_geaendert' AND detail = 'store'").first<{ n: number }>();
		expect(protokoll?.n).toBe(7);

		const s = await cronStand();
		expect(s.store_begonnen).toMatchObject({ getan: "store", meldung: false });
		expect(s.store).toMatchObject({ getan: "store", meldung: false, offen: 0, geprueft: 7 });
		expect(s.store_geprueft).toEqual(s.store);
		expect((await repos().sync.cronVerlauf())[0]).toMatch(
			/ cron: store bereich=action store=erfolg geprueft=7 preis=7 angebot=0 plus=0 zugeordnet=7 offen=0$/,
		);
	});

	it("findet beim Rueckfall nichts - die Frist ist zwoelf Stunden", async () => {
		await spiel(1, "Ghost of Tsushima", { conceptId: "235227" });
		await lauf(storeMitPreis().client);
		const store = storeMitPreis();
		const e = await lauf(store.client);
		expect(e).toMatchObject({ geprueft: 0, nochOffen: 0 });
		expect(store.aufrufe).toHaveLength(0);
		await env.DB.prepare("UPDATE release SET store_geprueft_am = datetime('now', '-13 hours')").run();
		expect(await lauf(storeMitPreis().client)).toMatchObject({ geprueft: 1 });
	});

	it("holt fehlende Concept-Ids ueber den Worker - die IGDB-Zugangsdaten bleiben dort", async () => {
		await spiel(1, "Ghost of Tsushima", { igdbId: 77 });
		const e = await lauf(storeMitPreis().client, igdbMit({ 77: "235227" }));
		expect(e).toMatchObject({ geprueft: 1, mitPreis: 1 });
		const g = await env.DB.prepare("SELECT store_concept_id AS c FROM game WHERE id = 1").first<{ c: string }>();
		expect(g?.c).toBe("235227");
	});

	it("laeuft ohne IGDB mit dem weiter, was da ist", async () => {
		await spiel(1, "Ghost of Tsushima", { igdbId: 77 });
		await spiel(2, "Bloodborne", { conceptId: "235227" });
		const e = await lauf(storeMitPreis().client);
		expect(e).toMatchObject({ status: "erfolg", geprueft: 2, mitPreis: 1, ohneTreffer: 1 });
		expect(await stand(1)).toMatchObject({ befund: "ohne_id" });
	});

	it("fragt PS3 und Vita nicht und laesst einen Abruffehler faellig, statt ihn zu stempeln", async () => {
		await spiel(1, "Killzone 2", { plattform: "PS3", conceptId: "1" });
		await spiel(2, "Ghost of Tsushima", { conceptId: "235227" });
		const store = fakeStore([[/store\.playstation\.com/, () => htmlAntwort("", 500)]]);
		const e = await lauf(store.client);
		expect(e).toMatchObject({ geprueft: 1, ohneTreffer: 1, uebersprungen: 1, nochOffen: 1 });
		expect(store.aufrufe.every((a) => !a.url.includes("1"))).toBe(true);
		expect(await stand(1)).toMatchObject({ befund: "plattform" });
		expect((await stand(2))?.wann).toBeNull();
		// Der Rest steht im Ausgang - daran haengt die Warnung "nach dem Lauf offen".
		expect((await cronStand()).store).toMatchObject({ offen: 1, geprueft: 1 });
	});

	it("vermerkt einen Ausgang, auch wenn die Anwendung eine Portion ablehnt", async () => {
		await spiel(1, "Ghost of Tsushima", { conceptId: "235227" });
		const echt = app();
		const ablehnend = (pfad: string, init?: RequestInit) =>
			pfad.endsWith("/ergebnisse") ? Promise.resolve(new Response("", { status: 500 })) : echt(pfad, init);
		const e = await storeLauf(ablehnend, storeMitPreis().client);
		expect(e).toMatchObject({ status: "fehler", geprueft: 0, nochOffen: 1, meldung: "Die Anwendung hat eine Portion nicht angenommen." });
		expect((await cronStand()).store).toMatchObject({ meldung: true });
	});
});

describe("Routen der Store-Action (Stufe 20j)", () => {
	const preis = (cents = 1999) => ({
		produktId: PRODUKT,
		produktName: "Ghost of Tsushima",
		preisCents: cents,
		grundpreisCents: cents,
		waehrung: "EUR",
		istSale: false,
		imPlusKatalog: false,
	});

	it("weist ab, was keine Rueckmeldung ist - und mehr als eine Portion", async () => {
		const kaputt = [
			{ ergebnisse: [] },
			{ ergebnisse: Array.from({ length: STORE_JE_POST + 1 }, (_, i) => ({ releaseId: i + 1, preis: preis() })) },
			{ ergebnisse: [{ releaseId: 1, preis: { ...preis(), produktId: "irgendwas" } }] },
			{ ergebnisse: [{ releaseId: 1, preis: { ...preis(), preisCents: -5 } }] },
			{ ergebnisse: [{ releaseId: 1, preis: { ...preis(), preisCents: 1_000_001 } }] },
			{ ergebnisse: [{ releaseId: 1, preis: { ...preis(), waehrung: "euro" } }] },
			{ ergebnisse: [{ releaseId: 1, befund: "unlesbar", nurKatalog: false }] },
			{ ergebnisse: [{ releaseId: 1, befund: "preis", nurKatalog: false }] },
			{ ergebnisse: [{ releaseId: 1, befund: "erfunden", nurKatalog: false }] },
			{ ergebnisse: [{ releaseId: 1, befund: "delistet" }] },
			{ ergebnisse: [{ releaseId: 0, befund: "delistet", nurKatalog: false }] },
		];
		for (const k of kaputt) expect((await sende("/api/sync/store/ergebnisse", k)).status, JSON.stringify(k).slice(0, 90)).toBe(400);
	});

	it("uebergeht eine unbekannte Release-Id und zaehlt sie, statt sie anzulegen", async () => {
		await spiel(1, "Ghost of Tsushima");
		const a = await sende("/api/sync/store/ergebnisse", {
			ergebnisse: [{ releaseId: 1, preis: preis() }, { releaseId: 99, befund: "delistet", nurKatalog: false }],
		});
		expect(await a.json()).toMatchObject({ geprueft: 1, mitPreis: 1, zugeordnet: 1, unbekannt: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM release").first<{ n: number }>()).toEqual({ n: 1 });
	});

	it("bleibt mit einer vollen Portion Preise unter 50 Anweisungen, in zwei D1-Aufrufen", async () => {
		for (let i = 1; i <= STORE_JE_POST; i++) await spiel(i, `Spiel ${i}`);
		const zaehler = zaehlendeDb(env.DB);
		const a = await sende(
			"/api/sync/store/ergebnisse",
			{ ergebnisse: Array.from({ length: STORE_JE_POST }, (_, i) => ({ releaseId: i + 1, preis: preis() })) },
			zaehler.db,
		);
		expect(await a.json()).toMatchObject({ geprueft: STORE_JE_POST, mitPreis: STORE_JE_POST });
		expect(zaehler.anweisungen()).toBeLessThanOrEqual(50);
		expect(zaehler.aufrufe()).toBe(2);
	});

	it("liest die Lage in einem D1-Aufruf mit einer Abfrage", async () => {
		await spiel(1, "Ghost of Tsushima");
		const zaehler = zaehlendeDb(env.DB);
		const a = await app(undefined, zaehler.db)("/api/sync/store/lage");
		expect(((await a.json()) as { ziele: unknown[] }).ziele).toHaveLength(1);
		expect(zaehler.aufrufe()).toBe(1);
		expect(zaehler.anweisungen()).toBe(1);
	});

	describe("store_geprueft - wann der Store auf dem Stand ist", () => {
		const ende = (geprueft: number, fehler?: string) =>
			sende("/api/sync/store/ausgang", {
				art: "ende",
				geprueft,
				mitPreis: geprueft,
				imAngebot: 0,
				imPlusKatalog: 0,
				zugeordnet: 0,
				ohneTreffer: 0,
				...(fehler ? { fehler } : {}),
			});

		it("setzt ihn bei einem leeren Lauf, nach dem nichts faellig ist - die Abendlaeufe nach einem Probelauf", async () => {
			await spiel(1, "Ghost of Tsushima");
			await env.DB.prepare("UPDATE release SET store_geprueft_am = datetime('now', '-1 hours')").run();
			await ende(0);
			expect((await cronStand()).store_geprueft).toMatchObject({ geprueft: 0, offen: 0 });
		});

		it("setzt ihn nicht, wenn nach einem leeren Lauf etwas faellig ist", async () => {
			await spiel(1, "Ghost of Tsushima");
			await ende(0);
			expect((await cronStand()).store).toMatchObject({ geprueft: 0, offen: 1 });
			expect((await cronStand()).store_geprueft).toBeUndefined();
		});

		it("setzt ihn nicht nach einem gescheiterten Lauf, auch wenn nichts faellig ist", async () => {
			await ende(0, "app");
			expect((await cronStand()).store).toMatchObject({ meldung: true });
			expect((await cronStand()).store_geprueft).toBeUndefined();
		});

		it("meldet ein seit ueber 30 Stunden faelliges Ziel, auch wenn die Auswahl 'nichts faellig' sagt (Sicherheitsnetz)", async () => {
			// Der Fall, gegen den das Netz steht: Ein Ziel ist seit 43 Stunden
			// ungeprueft, und ein Lauf endet leer. Mit heiler Auswahl ist es
			// faellig; mit einer kaputten (immer 0) setzte die Route
			// store_geprueft - die Warnung muss trotzdem kommen, ueber den
			// aeltesten Stempel aus einer eigenen Abfrage.
			await spiel(1, "Ghost of Tsushima");
			await env.DB.prepare("UPDATE release SET store_geprueft_am = datetime('now', '-43 hours')").run();
			await ende(0);
			expect((await cronStand()).store?.aeltester).toBeTruthy();
			const w = (await (await app()("/api/betrieb/warnungen")).json()) as { warnungen: Array<{ art: string; text: string }> };
			expect(w.warnungen.filter((x) => x.art === "store_leer").map((x) => x.text)).toEqual([
				expect.stringMatching(/^Die Store-Preis-Action läuft, aber ein Release wurde seit 43 Stunden nicht geprüft/),
			]);
		});

		it("zaehlt ein Ziel ohne Stempel ab dem Anlegen der Absicht - ein neuer Wunsch warnt nicht", async () => {
			await spiel(1, "Ghost of Tsushima");
			await ende(0);
			const w = (await (await app()("/api/betrieb/warnungen")).json()) as { warnungen: Array<{ art: string; text: string }> };
			expect(w.warnungen.map((x) => x.text).filter((t) => t.includes("seit") && t.includes("nicht geprüft"))).toEqual([]);
		});

		it("weist Fremdtext als Fehler ab - er koennte ein Geheimnis zitieren", async () => {
			expect((await ende(0, "Token abc123 abgelehnt")).status).toBe(400);
		});
	});
});
