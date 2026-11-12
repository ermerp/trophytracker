import { createExecutionContext, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { Geheimnis } from "../src/domain/secret";
import { createScheduled } from "../src/index";
import { erstellePsnClient } from "../src/psn/client";
import { CRON_PSN } from "../src/sync/cron";
import { ordneAutomatischZu } from "../src/sync/zuordnung";
import { zaehlendeDb } from "./d1-zaehler";
import { fakeIgdb } from "./igdb-fake";
import { TOKEN_ANTWORT, fakeFetch, jsonAntwort, redirectAntwort } from "./psn-fake";
import { fakeSeite, fakeTitel } from "./trophy-fixtures";

/**
 * Stufe 18p (16.2): Die PSN-Schritte buendeln ihre D1-Aufrufe. Gezaehlt wird
 * der ECHTE Einstieg - Lage, Sitzung, Schritt, Ausgang -, wie in
 * test/lesekosten.spec.ts. Vor 18q/18p (gezaehlt am 08.11.2026): Abruf 7,
 * Normalisierung 7 mit 104 Anweisungen im Batch, Abschluss 12, Kaufliste 7.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const GESAMT = 250; // drei Seiten zu 100

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM review_queue"),
		env.DB.prepare("DELETE FROM play_status"),
		env.DB.prepare("DELETE FROM game_event"),
		env.DB.prepare("DELETE FROM trophy_progress"),
		env.DB.prepare("DELETE FROM release"),
		env.DB.prepare("DELETE FROM game"),
		env.DB.prepare("DELETE FROM psn_raw_response"),
		env.DB.prepare("DELETE FROM psn_sync_run"),
		env.DB.prepare("DELETE FROM psn_credentials"),
		env.DB.prepare("DELETE FROM psn_zugang"),
		env.DB.prepare(
			"DELETE FROM app_setting WHERE key IN ('cron_verlauf', 'cron_stand', 'psn_spielzeit_stand', 'psn_spielzeit_runde', 'psn_besitz_stand', 'trophaeen_level')",
		),
		env.DB.prepare("DELETE FROM app_setting WHERE key >= 'cron_begonnen' AND key < 'cron_begonnen;'"),
	]);
	await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
});

function psnFake() {
	const { fetch, aufrufe } = fakeFetch([
		[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
		[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
		[
			/trophyTitles/,
			() => {
				const offset = Number(new URL(aufrufe[aufrufe.length - 1].url).searchParams.get("offset") ?? 0);
				const anzahl = Math.max(0, Math.min(100, GESAMT - offset));
				return new Response(fakeSeite(Array.from({ length: anzahl }, (_, i) => fakeTitel(offset + i)), GESAMT, offset));
			},
		],
		[
			/graphql/,
			() =>
				jsonAntwort({
					data: {
						purchasedTitlesRetrieve: {
							games: Array.from({ length: 50 }, (_, k) => ({ name: `Kauf ${k}`, platform: "PS4", subscriptionService: "NONE" })),
							pageInfo: { totalCount: 734 },
						},
					},
				}),
		],
	]);
	return { fetch, aufrufe };
}

/** Ein Cron-Aufruf im PSN-Fenster: D1-Aufrufe und die Logzeile. */
async function aufruf(fetch: typeof globalThis.fetch) {
	const zaehler = zaehlendeDb(env.DB);
	const zeilen: string[] = [];
	const orig = console.log;
	console.log = (...a: unknown[]) => zeilen.push(a.join(" "));
	try {
		await createScheduled(
			() => erstellePsnClient(fetch),
			() => fakeIgdb([[]], { zugang: null }).client,
		)({ scheduledTime: Date.now(), cron: CRON_PSN, noRetry() {} }, { ...env, DB: zaehler.db }, createExecutionContext());
	} finally {
		console.log = orig;
	}
	return { aufrufe: zaehler.aufrufe(), anweisungen: zaehler.anweisungen(), zeile: zeilen.find((z) => z.startsWith("cron:")) ?? "" };
}

describe("D1-Aufrufe der Sync-Schritte (Stufe 18p)", () => {
	it("Abruf 3 (Lauf anlegen 4, mit Token-Erneuerung 5), Normalisierung 4, Abschluss 4 - mit offenen Listen 5", async () => {
		const sync = async (vorAbschluss?: () => Promise<unknown>) => {
			const { fetch } = psnFake();
			const laeufe: Array<Awaited<ReturnType<typeof aufruf>>> = [];
			for (let i = 0; i < 8; i++) {
				if (vorAbschluss && /offen=0/.test(laeufe.at(-1)?.zeile ?? "")) await vorAbschluss();
				const r = await aufruf(fetch);
				laeufe.push(r);
				if (/sync=erfolg/.test(r.zeile)) break;
			}
			return laeufe;
		};
		// Erster Lauf: Alle 250 Listen sind neu und ohne Spiel - der Abschluss
		// fragt die Kandidaten in EINER Abfrage, ein Aufruf mehr.
		const mitOffenen = await sync();
		expect(mitOffenen.at(-1)?.aufrufe).toBe(5);
		// Zweiter Lauf am selben Tag ohne offene Listen - der Fall der
		// Produktion (12.11.2026: 0 von 431 ohne Zuordnung).
		await env.DB.prepare("DELETE FROM psn_sync_run").run();
		const laeufe = await sync(() => env.DB.prepare("DELETE FROM trophy_progress WHERE release_id IS NULL").run());
		const art = (r: { zeile: string }) =>
			/sync=erfolg/.test(r.zeile) ? "abschluss" : /normalisierung offen/.test(r.zeile) ? "normalisierung" : "abruf";
		expect(laeufe.map((r) => `${art(r)}:${r.aufrufe}`)).toEqual([
			// Lauf anlegen (und im ersten Lauf das Token holen).
			"abruf:4",
			"abruf:3",
			// Die letzte Seite wechselt in die Normalisierung - auch ein Abruf.
			"abruf:3",
			"normalisierung:4",
			"normalisierung:4",
			"normalisierung:4",
			"abschluss:4",
		]);
		// Kein Aufruf schickt mehr als 50 Anweisungen (D1, Free Tier, CLAUDE.md).
		// Vor 18p hatte allein der Schreib-Batch einer Seite 104.
		for (const r of laeufe) expect(r.anweisungen).toBeLessThanOrEqual(50);
	});

	it("die Kaufliste braucht mit gespeichertem Token vier", async () => {
		// Der Sync von heute ist durch, die Spielzeit erledigt: Faellig ist die Kaufliste.
		const heute = new Date().toISOString().slice(0, 10);
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO psn_sync_run (started_at, finished_at, status, next_offset, started_by) VALUES (datetime('now'), datetime('now'), 'erfolg', 0, 'cron')",
			),
			env.DB.prepare("INSERT INTO app_setting (key, value) VALUES ('psn_spielzeit_stand', ?)").bind(`${heute}:-1`),
		]);
		const { fetch } = psnFake();
		const erster = await aufruf(fetch);
		const zweiter = await aufruf(fetch);
		expect(erster.zeile).toMatch(/^cron: besitz .*geholt=50/);
		expect(zweiter.zeile).toMatch(/^cron: besitz .*geholt=50/);
		// Erster mit Token-Erneuerung, zweiter mit gespeichertem Token.
		expect([erster.aufrufe, zweiter.aufrufe]).toEqual([5, 4]);
		const stand = await repos().sync.fortschritt("psn_besitz_stand");
		expect(JSON.parse(stand ?? "{}")).toMatchObject({ start: 100 });
	});
});

describe("automatische Zuordnung, gebuendelt (Stufe 18p)", () => {
	it("ordnet zwei Listen fuer dasselbe Release nicht beide zu - die zweite sieht die erste als belegt", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (1, 'Testspiel 7', 'testspiel 7')"),
			env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (1, 1, 'PS4')"),
			env.DB.prepare(
				"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, progress_pct, synced_at) VALUES " +
					"('NPWR00001_00', 'trophy', 'Testspiel 7', 'PS4', 10, datetime('now')), " +
					"('NPWR00002_00', 'trophy', 'Testspiel 7', 'PS4', 20, datetime('now'))",
			),
		]);
		const e = await ordneAutomatischZu(repos());
		expect(e).toEqual({ geprueft: 2, zugeordnet: 1, offen: 1 });
		const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM trophy_progress WHERE release_id = 1").first<{ n: number }>();
		expect(n?.n).toBe(1);
	});

	it("laesst ein Release stehen, das schon vor dem Lauf eine Liste trug", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (1, 'Testspiel 7', 'testspiel 7')"),
			env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (1, 1, 'PS4')"),
			env.DB.prepare(
				"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, progress_pct, synced_at, release_id) VALUES " +
					"('NPWR00001_00', 'trophy', 'Alt', 'PS4', 10, datetime('now'), 1), " +
					"('NPWR00002_00', 'trophy', 'Testspiel 7', 'PS4', 20, datetime('now'), NULL)",
			),
		]);
		expect(await ordneAutomatischZu(repos())).toEqual({ geprueft: 1, zugeordnet: 0, offen: 1 });
	});
});
