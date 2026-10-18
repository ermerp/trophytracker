import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { Geheimnis } from "../src/domain/secret";
import { createApp } from "../src/index";
import { zaehlendeDb } from "./d1-zaehler";

/**
 * GET /api/betrieb/warnungen (Stufe 18m) gegen die lokale D1: die Fakten aus
 * den echten Tabellen, ein D1-Aufruf, und dieselbe Rechnung fuer das Ende des
 * Zugangs, die die Einstellungen lesen. Die Regeln selbst prueft
 * test/betrieb.spec.ts ohne Datenbank.
 */

type Antwort = {
	warnungen: Array<{ art: string; stufe: string; text: string; ziel?: string }>;
	zugangsende: { am: string; quelle: string; lebensdauerTage: number | null; stufe: string | null } | null;
};

const jetztUtc = (minusStunden = 0) =>
	new Date(Date.now() - minusStunden * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

async function hole(db: D1Database = env.DB): Promise<Antwort> {
	const antwort = await createApp().request("/api/betrieb/warnungen", undefined, { ...env, DB: db });
	expect(antwort.status).toBe(200);
	return antwort.json();
}

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM app_setting"),
		env.DB.prepare("DELETE FROM psn_sync_run"),
		env.DB.prepare("DELETE FROM psn_zugang"),
		env.DB.prepare("DELETE FROM psn_credentials"),
	]);
});

/** Ein ruhiger Stand: beide Bereiche vor einer Stunde, Sicherung frisch. */
async function ruhig() {
	await env.DB.prepare("INSERT INTO app_setting (key, value) VALUES ('cron_stand', ?), ('backup_letzter_erfolg_am', ?)")
		.bind(
			JSON.stringify({
				psn: { am: jetztUtc(1), getan: "store", meldung: false, offen: 0 },
				wartung: { am: jetztUtc(1), getan: "markt", meldung: false, offen: 3 },
			}),
			new Date().toISOString(),
		)
		.run();
}

describe("GET /api/betrieb/warnungen (Stufe 18m)", () => {
	it("liefert an einem ruhigen Tag keine Warnung - in einem D1-Aufruf", async () => {
		await ruhig();
		const zaehler = zaehlendeDb(env.DB);
		const a = await hole(zaehler.db);
		expect(a.warnungen).toEqual([]);
		expect(a.zugangsende).toBeNull();
		expect(zaehler.aufrufe()).toBe(1);
	});

	it("meldet die drei Warnungen, die bis 18m das Frontend zusammensetzte", async () => {
		// Kein Stand, keine Sicherung, abgelaufener Zugang mit gescheitertem Nachtlauf.
		const r = createRepositories(env.DB, env.NPSSO_KEY);
		await r.credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		await r.credentials.statusSetzen("abgelaufen");
		await env.DB.prepare(
			"INSERT INTO psn_sync_run (started_at, finished_at, status, next_offset, started_by, error_message) " +
				"VALUES (datetime('now', '-1 hours'), datetime('now', '-1 hours'), 'fehler', 0, 'cron', 'Der PlayStation-Zugang ist abgelaufen.')",
		).run();
		const a = await hole();
		expect(a.warnungen.map((w) => `${w.art}:${w.stufe}`)).toEqual([
			"automatik_still:rot",
			"zugang_abgelaufen:rot",
			"sicherung:rot",
		]);
		expect(a.warnungen.every((w) => w.ziel === "einstellungen")).toBe(true);
	});

	it("rechnet das Ende des Zugangs mit der kuerzesten gemessenen Lebensdauer", async () => {
		await ruhig();
		// Zwei gestorbene Zugaenge, 25 und 40 Kalendertage - der kuerzere zaehlt.
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO psn_zugang (eingetragen_am, gestorben_am) VALUES ('2026-09-04 18:02:33', '2026-09-29 03:00:38')",
			),
			env.DB.prepare(
				"INSERT INTO psn_zugang (eingetragen_am, gestorben_am) VALUES ('2026-06-01 10:00:00', '2026-07-11 03:00:00')",
			),
		]);
		const r = createRepositories(env.DB, env.NPSSO_KEY);
		await r.credentials.npssoSpeichern(new Geheimnis("npsso-test"), "2099-01-01T00:00:00.000Z");
		// Eingetragen vor 20 Tagen: Ende in 5 Tagen, also zur Kenntnis.
		await env.DB.prepare("UPDATE psn_credentials SET npsso_stored_at = datetime('now', '-20 days')").run();

		const a = await hole();
		expect(a.zugangsende).toMatchObject({ quelle: "gemessen", lebensdauerTage: 25, stufe: "kenntnis" });
		expect(a.warnungen.map((w) => `${w.art}:${w.stufe}`)).toEqual(["zugang_endet:kenntnis"]);
		expect(a.warnungen[0].text).toMatch(/^Der PlayStation-Zugang hält vermutlich bis um den \d{2}\.\d{2}\. \(in (4|5) Tagen\) – der bisher kürzeste hielt 25 Tage, Sony nennt den 01\.01\.$/);
	});

	it("liest zwei Nacht-Syncs des Crons, Handlaeufe dazwischen zaehlen nicht", async () => {
		await ruhig();
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO psn_sync_run (started_at, status, next_offset, started_by, error_message) VALUES (datetime('now', '-25 hours'), 'fehler', 0, 'cron', 'Der PSN-Abruf ist fehlgeschlagen.')",
			),
			env.DB.prepare(
				"INSERT INTO psn_sync_run (started_at, status, next_offset, started_by) VALUES (datetime('now', '-10 hours'), 'erfolg', 0, 'nutzer')",
			),
			env.DB.prepare(
				"INSERT INTO psn_sync_run (started_at, status, next_offset, started_by, error_message) VALUES (datetime('now', '-1 hours'), 'fehler', 0, 'cron', 'Der PSN-Abruf ist fehlgeschlagen.')",
			),
		]);
		const a = await hole();
		const sync = a.warnungen.filter((w) => w.art === "sync_gescheitert");
		// Genau 24 Stunden auseinander - immer zwei aufeinanderfolgende UTC-Tage.
		expect(sync.map((w) => w.stufe)).toEqual(["rot"]);
		expect(sync[0].text).toMatch(/gescheitert: Der PSN-Abruf ist fehlgeschlagen\.$/);
	});
});
