import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

/**
 * Barcode-Erfassung (Abschnitt 9, Stufe 17): Aufloesungskette, offene Scans,
 * Zuordnen mit Disc + Mapping + Protokoll + erledigten Absichten.
 */

const B = "https://example.com";
const EAN = "4006381333931"; // gueltige Pruefziffer
const EAN2 = "5021290067479";

const hole = async (pfad: string) => (await SELF.fetch(`${B}${pfad}`)).json() as Promise<any>;
const sende = (methode: "POST" | "DELETE", pfad: string, koerper?: unknown) =>
	SELF.fetch(`${B}${pfad}`, {
		method: methode,
		headers: { "content-type": "application/json" },
		body: koerper === undefined ? undefined : typeof koerper === "string" ? koerper : JSON.stringify(koerper),
	});
const scan = (ean: unknown) => sende("POST", "/api/scan", { ean });

async function leeren() {
	await env.DB.batch(
		["game_event", "ean_mapping", "unresolved_scan", "market_offer", "plan_entry", "physical_copy", "release", "game"].map((t) =>
			env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
}

async function release(id = 1, plattform = "PS4"): Promise<number> {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title, cover_url) VALUES (?, ?, ?, ?)")
		.bind(id, `Spiel ${id}`, `spiel ${id}`, `https://bilder/${id}.jpg`)
		.run();
	await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, ?, ?)").bind(id, id, plattform).run();
	return id;
}

const offene = () => env.DB.prepare("SELECT ean, scan_count FROM unresolved_scan ORDER BY ean").all().then((r) => r.results);
const mappings = () => env.DB.prepare("SELECT ean, release_id, source FROM ean_mapping ORDER BY ean").all().then((r) => r.results);

beforeEach(leeren);

describe("POST /api/scan", () => {
	it.each([
		[undefined, /8 bis 14/],
		["12", /8 bis 14/],
		["40123A5678901", /8 bis 14/],
		["4006381333913", /Prüfziffer/],
	])("lehnt %o ab", async (ean, meldung) => {
		const a = await scan(ean);
		expect(a.status).toBe(400);
		expect((await a.json() as any).fehler).toMatch(meldung);
		expect(await offene()).toEqual([]);
	});

	it("haelt einen unbekannten Code als offenen Scan fest und zaehlt hoch", async () => {
		expect(await (await scan(EAN)).json()).toEqual({ ean: EAN, treffer: "keiner", scans: 1 });
		expect(await (await scan(` ${EAN} `)).json()).toEqual({ ean: EAN, treffer: "keiner", scans: 2 });
		expect(await offene()).toEqual([{ ean: EAN, scan_count: 2 }]);
	});

	it("zaehlt mit zaehlen: false nicht hoch (Oeffnen aus den Einstellungen)", async () => {
		expect(await (await sende("POST", "/api/scan", { ean: EAN, zaehlen: false })).json()).toEqual({ ean: EAN, treffer: "keiner", scans: 0 });
		expect(await offene()).toEqual([]);
		await scan(EAN);
		expect(await (await sende("POST", "/api/scan", { ean: EAN, zaehlen: false })).json()).toEqual({ ean: EAN, treffer: "keiner", scans: 1 });
		expect(await offene()).toEqual([{ ean: EAN, scan_count: 1 }]);
	});

	it("trifft ein Mapping mit Titel, Cover und Exemplaren, ohne offenen Scan", async () => {
		const r = await release();
		await env.DB.prepare("INSERT INTO ean_mapping (ean, release_id) VALUES (?, ?)").bind(EAN, r).run();
		await env.DB.prepare("INSERT INTO physical_copy (release_id, ean) VALUES (?, ?)").bind(r, EAN).run();
		expect(await (await scan(EAN)).json()).toEqual({
			ean: EAN,
			treffer: "mapping",
			release: { releaseId: r, spielId: 1, titel: "Spiel 1", plattform: "PS4", bild: "https://bilder/1.jpg", exemplare: 1 },
			scans: 0,
		});
		expect(await offene()).toEqual([]);
	});

	it("nennt ein Haendlerangebot als Vorschlag (Stufe 2 der Kette)", async () => {
		await env.DB.prepare(
			"INSERT INTO market_offer (source, source_product_id, ean, title_raw, platform_raw, imported_at) VALUES ('rebuy', 'x1', ?, 'Fallout 4', 'PS4', datetime('now'))",
		).bind(EAN).run();
		expect(await (await scan(EAN)).json()).toEqual({ ean: EAN, treffer: "angebot", angebot: { titel: "Fallout 4", plattform: "PS4" }, scans: 1 });
	});
});

describe("POST /api/scan/:ean/assign", () => {
	const eintrag = (kind: string, ziel: { release?: number; game?: number }) =>
		env.DB.prepare("INSERT INTO plan_entry (kind, release_id, game_id, origin, status) VALUES (?, ?, ?, 'manuell', 'offen') RETURNING id")
			.bind(kind, ziel.release ?? null, ziel.game ?? null)
			.first<{ id: number }>();

	it("legt Disc und Mapping an, erledigt den offenen Scan und Kauf/Wunsch, protokolliert 'scan'", async () => {
		const r = await release();
		const kauf = await eintrag("kauf", { release: r });
		const wunsch = await eintrag("wunsch", { game: 1 });
		await scan(EAN);

		const a = await sende("POST", `/api/scan/${EAN}/assign`, { releaseId: r });
		expect(a.status).toBe(201);
		expect(await a.json()).toMatchObject({
			ean: EAN,
			releaseId: r,
			physischStatusGesetzt: true,
			spiel: { spielId: 1, titel: "Spiel 1", plattform: "PS4" },
			absichtenErledigt: [
				{ id: kauf!.id, art: "kauf" },
				{ id: wunsch!.id, art: "wunsch" },
			],
			aufListe: false,
		});

		expect(await env.DB.prepare("SELECT release_id, ean FROM physical_copy").all().then((x) => x.results)).toEqual([{ release_id: r, ean: EAN }]);
		expect(await mappings()).toEqual([{ ean: EAN, release_id: r, source: "manuell" }]);
		expect(await offene()).toEqual([]);
		const ereignis = await env.DB.prepare("SELECT kind, detail, source FROM game_event WHERE kind = 'exemplar_angelegt'").first();
		expect(ereignis).toEqual({ kind: "exemplar_angelegt", detail: "scan", source: "nutzer" });
		const texte = ((await hole("/api/games/1/events")).ereignisse as Array<{ text: string }>).map((e) => e.text);
		expect(texte).toContain("Disc erfasst (per Barcode)");
	});

	it("legt ueber spielId + plattform das Release an, wenn es fehlt, und verwendet ein vorhandenes", async () => {
		await release(1, "PS4");
		const a = await sende("POST", `/api/scan/${EAN}/assign`, { spielId: 1, plattform: "PS5" });
		expect(a.status).toBe(201);
		const { releaseId } = (await a.json()) as any;
		expect(releaseId).not.toBe(1);
		expect(await env.DB.prepare("SELECT platform FROM release WHERE id = ?").bind(releaseId).first()).toEqual({ platform: "PS5" });
		expect(await env.DB.prepare("SELECT detail FROM game_event WHERE kind = 'release_angelegt'").first()).toEqual({ detail: "scan" });

		const b = await sende("POST", `/api/scan/${EAN2}/assign`, { spielId: 1, plattform: "PS4" });
		expect(((await b.json()) as any).releaseId).toBe(1);
	});

	it("ueberschreibt ein Mapping beim erneuten Zuordnen (Korrektur) und legt ein weiteres Exemplar an", async () => {
		await release(1);
		await release(2);
		await sende("POST", `/api/scan/${EAN}/assign`, { releaseId: 1 });
		await sende("POST", `/api/scan/${EAN}/assign`, { releaseId: 2 });
		expect(await mappings()).toEqual([{ ean: EAN, release_id: 2, source: "manuell" }]);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM physical_copy").first()).toEqual({ n: 2 });
	});

	it("prueft Eingaben und Ziele", async () => {
		await release(1);
		expect((await sende("POST", `/api/scan/${EAN}/assign`, {})).status).toBe(400);
		expect((await sende("POST", `/api/scan/${EAN}/assign`, { releaseId: 1, spielId: 1, plattform: "PS4" })).status).toBe(400);
		expect((await sende("POST", `/api/scan/${EAN}/assign`, { releaseId: 999 })).status).toBe(404);
		expect((await sende("POST", `/api/scan/${EAN}/assign`, { spielId: 999, plattform: "PS4" })).status).toBe(404);
		expect((await sende("POST", `/api/scan/${EAN}/assign`, { spielId: 1, plattform: "PC" })).status).toBe(400);
		expect((await sende("POST", `/api/scan/${EAN}/assign`, "kaputt")).status).toBe(400);
		expect((await sende("POST", `/api/scan/12/assign`, { releaseId: 1 })).status).toBe(400);
		expect(await mappings()).toEqual([]);
	});
});

describe("Titelvorschlag und Abgleich (Stufe 17b)", () => {
	const vorschlag = (ean: string, koerper: unknown) => sende("POST", `/api/scan/${ean}/vorschlag`, koerper);

	it("haelt einen Vorschlag fest und zeigt den Sammlungstreffer", async () => {
		await release(1); // "Spiel 1" (PS4)
		await scan(EAN);
		expect((await vorschlag(EAN, { titel: "Ps3 Game - Spiel 1 [German Version]", quelle: "upcitemdb" })).status).toBe(200);

		const a = await hole("/api/scan/unresolved");
		expect(a).toMatchObject({ anzahl: 1, ungeprueft: 0, eindeutig: 1 });
		expect(a.scans[0]).toMatchObject({
			ean: EAN,
			titel: "Ps3 Game - Spiel 1 [German Version]",
			quelle: "upcitemdb",
			eindeutig: true,
			kandidaten: [{ spielId: 1, titel: "Spiel 1", releases: [{ releaseId: 1, plattform: "PS4" }] }],
		});
		expect(a.scans[0].geprueftAm).toBeTruthy();
	});

	it("vermerkt auch, dass die Quelle den Code nicht kennt", async () => {
		await scan(EAN);
		expect((await vorschlag(EAN, { titel: null })).status).toBe(200);
		const a = await hole("/api/scan/unresolved");
		expect(a.scans[0]).toMatchObject({ titel: null, quelle: null, eindeutig: false, kandidaten: [] });
		expect(a.scans[0].geprueftAm).toBeTruthy();
		expect(a.ungeprueft).toBe(0);
	});

	it("nennt dem Job nur Codes, die noch keine Quelle gesehen hat", async () => {
		await scan(EAN);
		await scan(EAN2);
		expect((await hole("/api/scan/ungeprueft")).eans.sort()).toEqual([EAN, EAN2].sort());
		await vorschlag(EAN, { titel: null });
		expect((await hole("/api/scan/ungeprueft")).eans).toEqual([EAN2]);
	});

	it("prueft die Eingaben und meldet einen unbekannten Code", async () => {
		await scan(EAN);
		expect((await vorschlag(EAN, { titel: 42 })).status).toBe(400);
		expect((await vorschlag(EAN, { titel: "x" })).status).toBe(400); // ohne quelle
		expect((await vorschlag(EAN2, { titel: null })).status).toBe(404);
		expect((await vorschlag("12", { titel: null })).status).toBe(400);
	});

	it("laesst einen mehrdeutigen Treffer nicht als eindeutig durchgehen", async () => {
		await release(1); // Spiel 1
		await release(2); // Spiel 2
		await scan(EAN);
		await vorschlag(EAN, { titel: "Sammlung: Spiel 1 und Spiel 2", quelle: "upcitemdb" });
		const a = await hole("/api/scan/unresolved");
		expect(a.scans[0].eindeutig).toBe(false);
		expect(a.scans[0].kandidaten).toHaveLength(2);
		expect(a.eindeutig).toBe(0);
	});
});

describe("offene Scans und Mapping loesen", () => {
	it("listet offene Scans neueste zuerst und verwirft einzelne", async () => {
		await env.DB.prepare("INSERT INTO unresolved_scan (ean, scan_count, first_seen_at, last_seen_at) VALUES (?, 3, '2026-09-01 10:00:00', '2026-09-02 10:00:00')").bind(EAN).run();
		await env.DB.prepare("INSERT INTO unresolved_scan (ean, scan_count, first_seen_at, last_seen_at) VALUES (?, 1, '2026-09-03 10:00:00', '2026-09-03 10:00:00')").bind(EAN2).run();
		const liste = await hole("/api/scan/unresolved");
		expect(liste).toMatchObject({ anzahl: 2, ungeprueft: 2, eindeutig: 0 });
		expect(liste.scans.map((s: any) => [s.ean, s.scans, s.zuerstAm, s.zuletztAm])).toEqual([
			[EAN2, 1, "2026-09-03 10:00:00", "2026-09-03 10:00:00"],
			[EAN, 3, "2026-09-01 10:00:00", "2026-09-02 10:00:00"],
		]);
		expect((await sende("DELETE", `/api/scan/unresolved/${EAN}`)).status).toBe(200);
		expect((await sende("DELETE", `/api/scan/unresolved/${EAN}`)).status).toBe(404);
		expect((await sende("DELETE", `/api/scan/unresolved/12`)).status).toBe(400);
		expect(await hole("/api/scan/unresolved")).toMatchObject({ anzahl: 1 });
	});

	it("loest ein Mapping, die Disc bleibt", async () => {
		const r = await release();
		await sende("POST", `/api/scan/${EAN}/assign`, { releaseId: r });
		expect((await sende("DELETE", `/api/scan/${EAN}`)).status).toBe(200);
		expect((await sende("DELETE", `/api/scan/${EAN}`)).status).toBe(404);
		expect(await mappings()).toEqual([]);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM physical_copy").first()).toEqual({ n: 1 });
		expect(await (await scan(EAN)).json()).toMatchObject({ treffer: "keiner", scans: 1 });
	});
});
