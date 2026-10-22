import { createExecutionContext, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import type { CronLage } from "../src/db/cron-lage";
import { MARKEN_HOECHSTENS } from "../src/db/sync";
import { ZU_FUELLEN_SQL } from "../src/db/trophaeen";
import { Geheimnis } from "../src/domain/secret";
import { createScheduled } from "../src/index";
import { erstellePsnClient } from "../src/psn/client";
import { CRON_PSN, CRON_WARTUNG, cronSchritt, entscheide, lageLesen } from "../src/sync/cron";
import { zaehlendeDb } from "./d1-zaehler";
import { fakeIgdb } from "./igdb-fake";
import { fakeFetch } from "./psn-fake";

/**
 * Stufe 18j: ein Lese- und ein Schreib-Batch je Cron-Aufruf (10.1).
 *
 * Gezaehlt werden D1-AUFRUFE, nicht Zeilen: In 18h kostete ein Aufruf rund
 * 0,7 ms CPU, eine Anweisung im Batch ein Zwanzigstel davon. Der Leerlauf
 * brauchte zehn (Wartung) bzw. rund fuenfzehn (PSN) Aufrufe.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const HEUTE = new Date().toISOString().slice(0, 10);
const psnStumm = () => erstellePsnClient(fakeFetch([]).fetch);
const igdbOhne = () => fakeIgdb([[]], { zugang: null }).client;

const marken = async () =>
	(
		await env.DB.prepare(
			"SELECT key, value FROM app_setting WHERE key >= 'cron_begonnen' AND key < 'cron_begonnen;' ORDER BY key",
		).all<{ key: string; value: string }>()
	).results;

/** Ein Aufruf durch den echten Einstieg, mit zaehlender D1. Gibt die Zahl der D1-Aufrufe zurueck. */
async function aufrufZaehlen(cron: string): Promise<number> {
	const zaehler = zaehlendeDb(env.DB);
	const ereignis = { scheduledTime: Date.now(), cron, noRetry() {} };
	await createScheduled(psnStumm, () => igdbOhne())(
		ereignis,
		{ ...env, DB: zaehler.db },
		createExecutionContext(),
	);
	return zaehler.aufrufe();
}

/** Alles getan, wie gegen 04:10 einer echten Nacht: Zugang da, Sync von heute, alle Staende von heute. */
async function psnAllesGetan() {
	const r = repos();
	await r.credentials.npssoSpeichern(new Geheimnis("npsso-test"));
	await r.credentials.refreshTokenSpeichern(
		new Geheimnis("refresh-test"),
		new Date(Date.now() + 30 * 86_400_000).toISOString(),
	);
	await env.DB.prepare(
		"INSERT INTO psn_sync_run (started_at, finished_at, status, next_offset, started_by) VALUES (datetime('now'), datetime('now'), 'erfolg', 0, 'cron')",
	).run();
	const setting = env.DB.prepare("INSERT INTO app_setting (key, value) VALUES (?, ?)");
	await env.DB.batch([
		setting.bind("psn_spielzeit_stand", `${HEUTE}:-1`),
		setting.bind("psn_besitz_stand", JSON.stringify({ fertigAm: HEUTE })),
		setting.bind(
			"trophaeen_level",
			JSON.stringify({ level: 514, punkte: 1, bisNaechstes: 1, prozent: 1, standAm: HEUTE }),
		),
	]);
}

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM game_event"),
		env.DB.prepare(
			"DELETE FROM app_setting WHERE key IN ('cron_verlauf', 'cron_stand', 'trophaeen_jahre', 'trophaeen_level', 'psn_spielzeit_stand', 'psn_besitz_stand')",
		),
		env.DB.prepare("DELETE FROM app_setting WHERE key >= 'cron_begonnen' AND key < 'cron_begonnen;'"),
		env.DB.prepare("DELETE FROM psn_raw_response"),
		env.DB.prepare("DELETE FROM psn_sync_run"),
		env.DB.prepare("DELETE FROM psn_credentials"),
		env.DB.prepare("DELETE FROM trophy_progress"),
		env.DB.prepare("DELETE FROM plan_entry"),
		env.DB.prepare("DELETE FROM release"),
		env.DB.prepare("DELETE FROM game"),
	]);
});

describe("ein Leerlauf sind zwei D1-Aufrufe (Stufe 18j)", () => {
	it("in der Wartung: der Lage-Batch und der Ausgang", async () => {
		await env.DB.prepare("INSERT INTO app_setting (key, value) VALUES ('trophaeen_jahre', ?)")
			.bind(JSON.stringify({ standAm: HEUTE, jahre: [] }))
			.run();

		expect(await aufrufZaehlen(CRON_WARTUNG)).toBe(2);
		expect((await repos().sync.cronVerlauf())[0]).toMatch(/ cron: nichts bereich=wartung$/);
	});

	it("im PSN-Fenster mit eingerichtetem Zugang - auch die Schritte hinter der Zugangspruefung", async () => {
		// Mit Zugang: Ohne ihn kaeme der Aufruf gar nicht bis Spielzeit,
		// Kaufliste, Einzeltrophaeen und Level - genau die Luecke, durch die die
		// Lesekosten-Messung bis 18j den PSN-Leerlauf unterschaetzte.
		await psnAllesGetan();

		expect(await aufrufZaehlen(CRON_PSN)).toBe(2);
		expect((await repos().sync.cronVerlauf())[0]).toMatch(/ cron: nichts bereich=psn$/);
	});

	it("ein toter Vorgaenger kostet keinen Aufruf mehr", async () => {
		await env.DB.prepare("INSERT INTO app_setting (key, value) VALUES ('trophaeen_jahre', ?)")
			.bind(JSON.stringify({ standAm: HEUTE, jahre: [] }))
			.run();
		await repos().sync.cronBeginnen(new Date(Date.now() - 5 * 60_000), "wartung");

		expect(await aufrufZaehlen(CRON_WARTUNG)).toBe(2);
		const verlauf = await repos().sync.cronVerlauf();
		expect(verlauf[1]).toMatch(/ cron: ohne_ausgang bereich=wartung$/);
		expect(await marken()).toEqual([]);
	});
});

describe("Marken als eine Zeile je Aufruf (Stufe 18j)", () => {
	const um = (minuten: number) => new Date(Date.parse("2026-10-16T06:30:00Z") + minuten * 60_000);

	it("ueber MARKEN_HOECHSTENS hinaus faellt die aelteste weg - und die naechste Meldung sagt es", async () => {
		const r = repos();
		const setting = env.DB.prepare("INSERT INTO app_setting (key, value) VALUES (?, ?)");
		const alte = Array.from({ length: MARKEN_HOECHSTENS }, (_, i) => {
			const am = new Date(um(0).getTime() - (MARKEN_HOECHSTENS - i) * 5 * 60_000).toISOString();
			return setting.bind(`cron_begonnen:${am}:wartung`, JSON.stringify({ am, bereich: "wartung" }));
		});
		for (let i = 0; i < alte.length; i += 50) await env.DB.batch(alte.slice(i, i + 50));

		// Dieser Aufruf kappt und stirbt dann selbst.
		await r.sync.cronBeginnen(um(0), "wartung");
		expect(await marken()).toHaveLength(MARKEN_HOECHSTENS);

		const m = await r.sync.cronBeginnen(um(5), "wartung");
		expect(m.verwaist?.anzahl).toBe(MARKEN_HOECHSTENS);
		expect(m.verwaist?.gekappt).toBe(true);
		await r.sync.cronAusgangVermerken("2026-10-16 06:35", "cron: nichts bereich=wartung", m);

		expect((await r.sync.cronVerlauf())[1]).toMatch(/ cron: ohne_ausgang ×200 bereich=wartung gekappt=ja$/);
		expect(await marken()).toEqual([]);
	});

	it("eine Marke aelter als einen Tag wird gemeldet, nicht still entfernt", async () => {
		const r = repos();
		await r.sync.cronBeginnen(new Date(um(0).getTime() - 2 * 86_400_000), "psn");
		const m = await r.sync.cronBeginnen(um(0), "wartung");
		await r.sync.cronAusgangVermerken("2026-10-16 06:30", "cron: nichts bereich=wartung", m);

		expect((await r.sync.cronVerlauf())[1]).toBe("2026-10-14 06:30 cron: ohne_ausgang bereich=psn");
		expect(await marken()).toEqual([]);
	});

	it("liest die Marke im alten Format mit ihrer Kette - der Aufruf des alten Workers beim Deploy", async () => {
		const r = repos();
		const alt = {
			am: um(10).toISOString(),
			bereich: "wartung",
			verwaist: { anzahl: 2, von: "2026-10-16 06:30", bis: "2026-10-16 06:35", bereich: "wartung" },
		};
		await env.DB.prepare("INSERT INTO app_setting (key, value) VALUES ('cron_begonnen', ?)")
			.bind(JSON.stringify(alt))
			.run();

		const m = await r.sync.cronBeginnen(um(15), "wartung");
		await r.sync.cronAusgangVermerken("2026-10-16 06:45", "cron: nichts bereich=wartung", m);

		expect((await r.sync.cronVerlauf())[1]).toBe("2026-10-16 06:30–06:40 cron: ohne_ausgang ×3 bereich=wartung");
		expect(await marken()).toEqual([]);
	});

	it("eine junge Marke eines laufenden Aufrufs bleibt stehen, auch wenn eine Kette gemeldet wird", async () => {
		const r = repos();
		await r.sync.cronBeginnen(um(0), "wartung"); // tot
		const laufend = await r.sync.cronBeginnen(um(5), "wartung"); // laeuft noch
		const m = await r.sync.cronBeginnen(um(6), "wartung");
		expect(m.verwaist?.anzahl).toBe(1);
		await r.sync.cronAusgangVermerken("2026-10-16 06:36", "cron: nichts bereich=wartung", m);

		expect((await marken()).map((z) => z.key)).toEqual([laufend.schluessel]);
	});
});

describe("cron_stand: die Fakten fuer die Betriebswarnungen (Stufe 18j)", () => {
	it("der Ausgang legt seinen Bereich ab, ohne den anderen anzufassen", async () => {
		await aufrufZaehlen(CRON_PSN);
		await aufrufZaehlen(CRON_WARTUNG);

		const stand = await repos().sync.cronStand();
		expect(stand.psn?.getan).toBe("nichts");
		expect(stand.psn?.meldung).toBe(false);
		expect(stand.wartung?.getan).toBe("nichts");
		expect(stand.ohneAusgang).toBeUndefined();
	});

	it("eine gemeldete Kette steht als Zahlen da, nicht nur als Text", async () => {
		await repos().sync.cronBeginnen(new Date(Date.now() - 10 * 60_000), "wartung");
		await repos().sync.cronBeginnen(new Date(Date.now() - 5 * 60_000), "wartung");
		await aufrufZaehlen(CRON_WARTUNG);

		const { ohneAusgang } = await repos().sync.cronStand();
		expect(ohneAusgang?.anzahl).toBe(2);
		expect(ohneAusgang?.bereich).toBe("wartung");
		expect(ohneAusgang?.gemeldetAm).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
	});

	it("ein unlesbarer Stand wird ersetzt und reisst die Verlaufszeile nicht mit", async () => {
		await env.DB.prepare("INSERT INTO app_setting (key, value) VALUES ('cron_stand', 'kaputt{')").run();
		await aufrufZaehlen(CRON_WARTUNG);

		expect((await repos().sync.cronVerlauf())[0]).toMatch(/ cron: nichts bereich=wartung$/);
		expect((await repos().sync.cronStand()).wartung?.getan).toBe("nichts");
	});

	it("der Markt ist kein Cron-Schritt mehr: ein faelliges Release bleibt der Action (20i)", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (1, 'Erfunden', 'erfunden')"),
			env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (1, 1, 'PS4')"),
			env.DB.prepare("INSERT INTO plan_entry (kind, release_id, origin, status) VALUES ('wunsch', 1, 'manuell', 'offen')"),
			env.DB.prepare("INSERT INTO app_setting (key, value) VALUES ('trophaeen_jahre', ?)").bind(
				JSON.stringify({ standAm: HEUTE, jahre: [] }),
			),
		]);
		await createScheduled(psnStumm, () => igdbOhne())(
			{ scheduledTime: Date.now(), cron: CRON_WARTUNG, noRetry() {} },
			env,
			createExecutionContext(),
		);

		const { wartung } = await repos().sync.cronStand();
		expect(wartung?.getan).toBe("nichts");
		// Faellig ist es trotzdem - fuer die Action, nicht fuer den Cron.
		expect(await repos().markt.zuPruefen(20)).toHaveLength(1);
	});
});

describe("entscheide: die Reihenfolge als reine Funktion (Stufe 18j)", () => {
	const zugang = { eingerichtet: true, status: "ok" as const, npssoHinterlegtAm: null, npssoLaeuftAbUm: null, refreshLaeuftAbUm: null, letzterErfolgAm: null };
	const lauf = { id: 1, started_at: HEUTE, finished_at: HEUTE, status: "erfolg" as const, error_message: null, titles_seen: 1, next_offset: 0, phase: "normalisierung" as const, started_by: "cron" as const, failed_attempts: 0 };
	const lage = (psn: Partial<NonNullable<CronLage["psn"]>> = {}, einstellungen: Record<string, string> = {}): CronLage => ({
		verlauf: [],
		einstellungen: new Map(Object.entries(einstellungen)),
		psn: { abgebrochen: 0, laufend: null, heutige: [lauf], zugang, naechsteListe: null, ...psn },
	});
	const k = { heute: HEUTE, igdbKonfiguriert: true };
	const fertig = {
		psn_spielzeit_stand: `${HEUTE}:-1`,
		psn_besitz_stand: JSON.stringify({ fertigAm: HEUTE }),
		trophaeen_level: JSON.stringify({ standAm: HEUTE }),
	};

	it.each<[string, CronLage, string[]]>([
		["ein laufender Lauf - und sonst nichts", lage({ laufend: { ...lauf, status: "laufend" } }), ["sync"]],
		["kein Lauf von heute", lage({ heutige: [] }), ["sync_starten"]],
		// Seit 20j laeuft der Store als Action: ohne Zugang hat das PSN-Fenster nichts mehr zu tun.
		["ohne Zugang kein neuer Lauf - und seit 20j auch kein Store", lage({ heutige: [], zugang: { ...zugang, eingerichtet: false } }), []],
		["nach dem Sync die ganze PSN-Kette", lage(), ["spielzeit", "besitz", "level"]],
		["alles getan", lage({}, fertig), []],
		["eine Liste offen", lage({ naechsteListe: { npCommunicationId: "NPWR0", npServiceName: "trophy" } }, fertig), ["trophaeen"]],
		["eine laufende Kaufliste trotz Frist", lage({}, { ...fertig, psn_besitz_stand: JSON.stringify({ fertigAm: HEUTE, start: 100 }) }), ["besitz"]],
	])("%s", (_, l, erwartet) => {
		expect(entscheide(l, k)).toEqual(erwartet);
	});

	it("die Wartung: Jahre zuerst, ohne Zugangsdaten nichts von IGDB - der Markt laeuft als Action (20i)", () => {
		const w: CronLage = {
			verlauf: [],
			einstellungen: new Map(),
			wartung: { erschienen: 0, geloescht: 0, zumAuffrischen: [{ id: 1, igdb_id: 1 }], zurDisc: [{ id: 1, igdb_id: 1 }] },
		};
		expect(entscheide(w, k)).toEqual(["jahre", "igdb_auffrischen", "igdb_physisch"]);
		expect(entscheide(w, { ...k, igdbKonfiguriert: false })).toEqual(["jahre"]);
	});
});

describe("Knopf und Cron sehen dieselbe Auswahl (Stufe 18j, Vorgabe des Nutzers)", () => {
	it("IGDB und Einzeltrophaeen: der Lage-Batch liefert, was die Repository-Methode liefert", async () => {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO game (id, title, sort_title, igdb_id) VALUES (1, 'Erfunden A', 'erfunden a', 101), (2, 'Erfunden B', 'erfunden b', 102)",
			),
			env.DB.prepare(
				"INSERT INTO release (id, game_id, platform, physical_release_status) VALUES (1, 1, 'PS4', 'unbekannt'), (2, 2, 'PS5', 'nein')",
			),
			env.DB.prepare("INSERT INTO plan_entry (kind, release_id, origin, status) VALUES ('wunsch', 1, 'manuell', 'offen')"),
			env.DB.prepare(
				"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, progress_pct, synced_at) " +
					"VALUES ('NPWR00002_00', 'trophy', 'B', 'PS5', 0, datetime('now')), ('NPWR00001_00', 'trophy', 'A', 'PS4', 0, datetime('now'))",
			),
		]);
		const r = repos();
		const lage = await lageLesen(r, "alles", HEUTE);

		expect(lage.wartung?.zumAuffrischen).toEqual(await r.igdb.zumAuffrischen(50, 7));
		expect(lage.wartung?.zurDisc).toEqual(await r.igdb.zurDiscPruefung(50));
		expect(lage.psn?.naechsteListe).toEqual((await r.trophaeen.naechsteZumFuellen(1))[0]);
		// Und die Auswahlen sind nicht leer - sonst bewiese der Vergleich nichts.
		expect(lage.psn?.naechsteListe?.npCommunicationId).toBe("NPWR00001_00");
	});
});

describe("naechsteZumFuellen ohne OR (Migration 0034)", () => {
	it("findet beide Faelle, sortiert und ohne Doppel - und nicht, was aktuell ist", async () => {
		const zeile = (id: string, gestempelt: string | null, summe: number | null, bronze: number) =>
			env.DB.prepare(
				"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, progress_pct, synced_at, " +
					"earned_bronze, trophies_synced_at, trophies_synced_sum) VALUES (?, 'trophy', ?, 'PS4', 0, datetime('now'), ?, ?, ?)",
			).bind(id, id, bronze, gestempelt, summe);
		await env.DB.batch([
			zeile("NPWR00003_00", null, null, 1), // nie geholt
			zeile("NPWR00001_00", "2026-10-01", 1, 2), // seither eine Trophaee dazu
			zeile("NPWR00002_00", "2026-10-01", 2, 2), // aktuell
			zeile("NPWR00004_00", null, 9, 1), // nie geholt, Summe zufaellig abweichend: einmal, nicht zweimal
		]);

		const liste = await repos().trophaeen.naechsteZumFuellen(10);
		expect(liste.map((l) => l.npCommunicationId)).toEqual(["NPWR00001_00", "NPWR00003_00", "NPWR00004_00"]);
	});

	it("trifft beide Teilindizes - im Leerlauf liest sie die Tabelle nicht", async () => {
		const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${ZU_FUELLEN_SQL}`).bind(1).all<{ detail: string }>();
		const plan = results.map((z) => z.detail).join(" | ");
		expect(plan).toContain("idx_trophy_progress_nie_geholt");
		expect(plan).toContain("idx_trophy_progress_geaendert");
	});
});

describe("die Daueraufgaben im Lage-Batch", () => {
	it("das PSN-Fenster gibt nichts frei und raeumt nicht auf, die Wartung bricht keinen Haenger ab", async () => {
		const psn = await lageLesen(repos(), "psn", HEUTE);
		expect(psn.wartung).toBeUndefined();
		const wartung = await lageLesen(repos(), "wartung", HEUTE);
		expect(wartung.psn).toBeUndefined();
	});

	it("ein Aufruf ohne Lage liest sie selbst - so rufen ihn Tests und nichts sonst", async () => {
		// Ohne Trophaeen gibt es keine Jahre - der Schritt faellt durch.
		const e = await cronSchritt(repos(), psnStumm(), igdbOhne(), { bereich: "wartung", heute: HEUTE });
		expect(e.getan).toBe("nichts");
	});
});
