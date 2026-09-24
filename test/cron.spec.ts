import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { haengerMeldung } from "../src/db/sync";
import { Geheimnis } from "../src/domain/secret";
import { erstellePsnClient } from "../src/psn/client";
import {
	AUFFRISCH_FRIST_TAGE,
	cronLogzeile,
	cronSchritt,
	cronWirkungslos,
	HAENGT_NACH_STUNDEN,
	ROHANTWORTEN_LAEUFE,
} from "../src/sync/cron";
import { fakeIgdb, spielRoh } from "./igdb-fake";
import { TOKEN_ANTWORT, fakeFetch, jsonAntwort, redirectAntwort, trophySeite } from "./psn-fake";

/**
 * Die naechtliche Automatik (Stufe 18, Abschnitt 10.1) gegen die lokale D1,
 * mit nachgebauten PSN- und IGDB-Antworten. Geprueft wird die Schrittfolge:
 * genau eine schwere Arbeit je Aufruf, ein Cron-Versuch je Nacht, Haenger
 * werden abgebrochen statt jede Nacht wiedergefunden.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const HEUTE = new Date().toISOString().slice(0, 10);
const MORGEN = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function psnMit(total: number) {
	const { fetch, aufrufe } = fakeFetch([
		[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
		[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
		// Die PSN-Zusatzabrufe aus Stufe 18c antworten leer: Dieser Fake
		// dreht sich um den Sync, nicht um Spielzeit und Besitz.
		[/gamelist\/v2/, () => jsonAntwort({ totalItemCount: 0, titles: [] })],
		[
			/graphql/,
			() => jsonAntwort({ data: { purchasedTitlesRetrieve: { games: [], pageInfo: { totalCount: 0 } } } }),
		],
		[
			/trophyTitles/,
			() => {
				const letzte = aufrufe[aufrufe.length - 1].url;
				const offset = Number(new URL(letzte).searchParams.get("offset") ?? 0);
				return new Response(trophySeite(offset, total));
			},
		],
	]);
	return { psn: erstellePsnClient(fetch), aufrufe };
}

/** PSN, dessen Anmeldung klappt, aber die Trophaeenliste mit 500 antwortet - ein Abruf scheitert, ohne dass der Zugang 'abgelaufen' wird. */
const psnKaputt = () =>
	erstellePsnClient(
		fakeFetch([
			[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
			[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
			[/trophyTitles/, () => new Response("weg", { status: 500 })],
		]).fetch,
	);
const psnStumm = () => erstellePsnClient(fakeFetch([]).fetch);
const igdbOhne = () => fakeIgdb([[]], { zugang: null }).client;

const laeufe = async () =>
	(await env.DB.prepare("SELECT id, status, phase, started_by, error_message FROM psn_sync_run ORDER BY id").all()).results;

async function spielMitIgdb(id: number, igdbId: number, syncedAt: string | null) {
	await env.DB.batch([
		env.DB.prepare("INSERT INTO game (id, title, sort_title, igdb_id, igdb_synced_at) VALUES (?, ?, ?, ?, ?)").bind(
			id,
			`Spiel ${id}`,
			`spiel ${id}`,
			igdbId,
			syncedAt,
		),
		env.DB.prepare("INSERT INTO release (game_id, platform, physical_release_status, physical_checked_at) VALUES (?, 'PS4', 'ja', datetime('now'))").bind(id),
	]);
}

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM game_event"),
		// Der Verlauf lebt in app_setting und ueberdauert sonst den Test.
		env.DB.prepare("DELETE FROM app_setting WHERE key IN ('cron_verlauf', 'psn_spielzeit_stand', 'psn_besitz_stand')"),
		env.DB.prepare("DELETE FROM psn_raw_response"),
		env.DB.prepare("DELETE FROM psn_sync_run"),
		env.DB.prepare("DELETE FROM psn_credentials"),
		env.DB.prepare("DELETE FROM trophy_progress"),
		env.DB.prepare("DELETE FROM release"),
		env.DB.prepare("DELETE FROM game"),
	]);
});

describe("cronSchritt", () => {
	it("legt ohne NPSSO keinen Lauf an, gibt aber Erschienene frei und frischt IGDB auf", async () => {
		await spielMitIgdb(1, 11, null);
		await env.DB.prepare("UPDATE game SET release_status = 'angekuendigt', release_date = '2020-01-01' WHERE id = 1").run();

		const e = await cronSchritt(repos(), psnStumm(), fakeIgdb([[spielRoh({ id: 11 })]]).client);

		expect(e).toMatchObject({ getan: "igdb_auffrischen", erschienen: 1, abgebrochen: 0 });
		expect(e.auffrischen).toMatchObject({ status: "erfolg", angefragt: 1, aktualisiert: 1 });
		expect(await laeufe()).toEqual([]);
		expect((await env.DB.prepare("SELECT release_status FROM game WHERE id = 1").first())?.release_status).toBe("erschienen");
	});

	it("faehrt einen Sync ueber mehrere Aufrufe bis zum Erfolg, als Lauf des Cron mit Quelle sync im Protokoll", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		const { psn } = psnMit(150);

		const schritte = [];
		for (let i = 0; i < 20; i++) {
			const e = await cronSchritt(repos(), psn, igdbOhne());
			schritte.push(e);
			if (e.getan === "nichts") break;
		}

		// 2 Seiten holen, 2 auswerten, 1 Abschluss - danach die beiden
		// PSN-Zusatzabrufe (Stufe 18c, hier leer), dann ist nichts mehr zu tun.
		expect(schritte.map((s) => s.getan)).toEqual([
			"sync", "sync", "sync", "sync", "sync", "spielzeit", "besitz", "nichts",
		]);
		expect(schritte[4].sync).toMatchObject({ status: "erfolg", titlesSeen: 150 });
		expect(await laeufe()).toEqual([expect.objectContaining({ status: "erfolg", started_by: "cron" })]);
		expect(await repos().trophies.anzahl()).toBe(150);

		// Und die Zeilen, die davon im Verlauf stehen: Jeder Aufruf muss sich
		// vom vorigen unterscheiden, sonst ist am Morgen nicht zu sehen, ob der
		// Lauf vorankam (Befund vom 24.09.2026). Frueher lauteten die beiden
		// Normalisierungsaufrufe beide "offset=0".
		const zeilen = schritte.map(cronLogzeile);
		expect(zeilen.slice(0, 5)).toEqual([
			"cron: sync erschienen=0 sync=laufend/abruf offset=100",
			"cron: sync erschienen=0 sync=laufend/normalisierung offset=100",
			"cron: sync erschienen=0 sync=laufend/normalisierung offen=1",
			"cron: sync erschienen=0 sync=laufend/normalisierung offen=0",
			// eingereiht=0, obwohl 150 Titel neu sind: Ohne zugeordnetes
			// Release gibt es nichts durchzusehen (8.1).
			"cron: sync erschienen=0 sync=erfolg/normalisierung offen=0 titel=150 eingereiht=0",
		]);
		expect(new Set(zeilen).size).toBe(zeilen.length);
	});

	it("startet je Nacht nur einen eigenen Lauf - am naechsten Tag wieder einen", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		const { psn } = psnMit(10);
		for (let i = 0; i < 5; i++) await cronSchritt(repos(), psn, igdbOhne());
		expect(await laeufe()).toHaveLength(1);

		expect((await cronSchritt(repos(), psn, igdbOhne(), HEUTE)).getan).toBe("nichts");
		expect(await laeufe()).toHaveLength(1);

		expect((await cronSchritt(repos(), psn, igdbOhne(), MORGEN)).getan).toBe("sync");
		expect(await laeufe()).toHaveLength(2);
	});

	it("wiederholt einen fehlgeschlagenen Cron-Lauf in derselben Nacht nicht", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		const e = await cronSchritt(repos(), psnKaputt(), igdbOhne());
		expect(e.sync).toMatchObject({ status: "fehler" });
		expect(await laeufe()).toEqual([expect.objectContaining({ status: "fehler", started_by: "cron" })]);
		// Kein Auth-Fehler: Der Zugang bleibt 'fehler', nicht 'abgelaufen' - die
		// Sperre kommt hier allein aus der Regel "ein Cron-Versuch je Nacht".
		expect((await repos().credentials.anzeige()).status).toBe("fehler");

		// Kein zweiter Lauf: Der naechste Aufruf geht weiter in der Reihenfolge
		// (hier Spielzeit), statt den Sync zu wiederholen.
		expect((await cronSchritt(repos(), psnMit(10).psn, igdbOhne())).getan).not.toBe("sync");
		expect(await laeufe()).toHaveLength(1);
	});

	it("legt bei abgelaufenem Zugang gar keinen Lauf an", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		await repos().credentials.statusSetzen("abgelaufen");

		expect((await cronSchritt(repos(), psnMit(10).psn, igdbOhne())).getan).toBe("nichts");
		expect(await laeufe()).toEqual([]);

		// Ein neues NPSSO setzt 'ok' - dann laeuft es wieder.
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-neu"));
		expect((await cronSchritt(repos(), psnMit(10).psn, igdbOhne())).getan).toBe("sync");
	});

	it("ein erfolgreicher Handabruf von heute ersetzt den Nachtlauf, ein fehlgeschlagener nicht", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		await env.DB.prepare(
			"INSERT INTO psn_sync_run (started_at, finished_at, status, next_offset, started_by) VALUES (datetime('now'), datetime('now'), 'erfolg', 0, 'nutzer')",
		).run();
		expect((await cronSchritt(repos(), psnMit(10).psn, igdbOhne())).getan).not.toBe("sync");

		await env.DB.prepare("UPDATE psn_sync_run SET status = 'fehler'").run();
		expect((await cronSchritt(repos(), psnMit(10).psn, igdbOhne())).getan).toBe("sync");
		expect(await laeufe()).toEqual([
			expect.objectContaining({ status: "fehler", started_by: "nutzer" }),
			expect.objectContaining({ started_by: "cron" }),
		]);
	});

	describe("haengengebliebener Lauf (Ergaenzung des Nutzers vom 19.09.2026)", () => {
		const alterLauf = (stundenAlt: number, startedBy = "nutzer") =>
			env.DB.prepare(
				"INSERT INTO psn_sync_run (id, started_at, status, next_offset, phase, started_by) VALUES (1, datetime('now', ?), 'laufend', 0, 'abruf', ?)",
			)
				.bind(`-${stundenAlt} hours`, startedBy)
				.run();

		it("wird nach einem Fenster ohne Fortschritt abgebrochen und blockiert den Nachtlauf nicht", async () => {
			await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
			await alterLauf(HAENGT_NACH_STUNDEN + 2);

			const e = await cronSchritt(repos(), psnMit(10).psn, igdbOhne());

			expect(e).toMatchObject({ getan: "sync", abgebrochen: 1 });
			const alle = await laeufe();
			expect(alle[0]).toMatchObject({ id: 1, status: "fehler", error_message: haengerMeldung(HAENGT_NACH_STUNDEN) });
			expect(alle[1]).toMatchObject({ status: "laufend", started_by: "cron" });
		});

		it("wird fortgesetzt, wenn eine Rohantwort juenger als das Fenster ist", async () => {
			await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
			await alterLauf(HAENGT_NACH_STUNDEN + 2);
			await env.DB.prepare(
				"INSERT INTO psn_raw_response (sync_run_id, endpoint, payload, fetched_at) VALUES (1, '/x', ?, datetime('now', '-10 minutes'))",
			)
				.bind(trophySeite(0, 10))
				.run();

			const e = await cronSchritt(repos(), psnMit(10).psn, igdbOhne());

			expect(e).toMatchObject({ getan: "sync", abgebrochen: 0 });
			expect(await laeufe()).toEqual([expect.objectContaining({ id: 1, started_by: "nutzer" })]);
		});

		it("wird fortgesetzt, wenn eine Normalisierung juenger als das Fenster ist", async () => {
			await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
			await alterLauf(HAENGT_NACH_STUNDEN + 2);
			await env.DB.batch([
				env.DB.prepare("UPDATE psn_sync_run SET phase = 'normalisierung' WHERE id = 1"),
				env.DB.prepare(
					"INSERT INTO psn_raw_response (sync_run_id, endpoint, payload, fetched_at, normalized_at) " +
						"VALUES (1, '/x', ?, datetime('now', '-5 hours'), datetime('now', '-10 minutes'))",
				).bind(trophySeite(0, 10)),
			]);

			const e = await cronSchritt(repos(), psnStumm(), igdbOhne());

			// Nichts mehr offen: Der Aufruf schliesst den alten Lauf ab.
			expect(e).toMatchObject({ getan: "sync", abgebrochen: 0 });
			expect(e.sync).toMatchObject({ status: "erfolg" });
			expect(await laeufe()).toEqual([expect.objectContaining({ id: 1, status: "erfolg", started_by: "nutzer" })]);
		});

		it("ein abgebrochener Handlauf von heute verhindert den Nachtlauf nicht", async () => {
			await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
			// Ein Handlauf ohne Fortschritt seit mehr als einem Fenster. Ob sein
			// Start noch auf heute faellt, haengt von der Uhrzeit des Testlaufs
			// ab - die Regel muss in beiden Faellen einen Cron-Lauf zulassen.
			await alterLauf(HAENGT_NACH_STUNDEN + 1, "nutzer");

			const e = await cronSchritt(repos(), psnMit(10).psn, igdbOhne());
			expect(e).toMatchObject({ getan: "sync", abgebrochen: 1 });
			expect((await laeufe()).at(-1)).toMatchObject({ started_by: "cron", status: "laufend" });
		});
	});

	it("frischt nur Spiele auf, deren Stand aelter als die Frist ist, und ruht sonst", async () => {
		await spielMitIgdb(1, 11, "2020-01-01 00:00:00");
		await spielMitIgdb(2, 12, null);
		await env.DB.prepare("UPDATE game SET igdb_synced_at = datetime('now') WHERE id = 2").run();

		const { client, aufrufe } = fakeIgdb([[spielRoh({ id: 11 })]]);
		const e = await cronSchritt(repos(), psnStumm(), client);
		expect(e).toMatchObject({ getan: "igdb_auffrischen" });
		expect(e.auffrischen).toMatchObject({ angefragt: 1, aktualisiert: 1 });
		expect(String(aufrufe.at(-1)?.init?.body)).toContain("where id = (11)");

		// Beide frisch: nichts faellig, auch die Disc-Fassungen sind gestempelt.
		expect((await cronSchritt(repos(), psnStumm(), client)).getan).toBe("nichts");
		expect(AUFFRISCH_FRIST_TAGE).toBe(7);
	});

	it("stempelt Spiele, die IGDB nicht zurueckgibt - sonst dreht sich der Schritt im Kreis", async () => {
		// Gesehen am 21.09.2026: Der naechtliche Auffrisch-Schritt waehlte
		// zwei Naechte lang dieselben Spiele und kam nie voran.
		await spielMitIgdb(1, 11, "2020-01-01 00:00:00");
		await spielMitIgdb(2, 12, "2020-01-01 00:00:00");

		// IGDB liefert nur eines der beiden zurueck.
		const e = await cronSchritt(repos(), psnStumm(), fakeIgdb([[spielRoh({ id: 11 })]]).client);
		expect(e.auffrischen).toMatchObject({ angefragt: 2, aktualisiert: 1, ohneAntwort: 1 });

		// Beide trage jetzt einen frischen Stempel - der naechste Aufruf hat nichts mehr zu tun.
		const offen = await env.DB.prepare(
			"SELECT COUNT(*) AS n FROM game WHERE igdb_id IS NOT NULL AND (igdb_synced_at IS NULL OR igdb_synced_at < datetime('now','-7 days'))",
		).first<{ n: number }>();
		expect(offen?.n).toBe(0);
	});

	it("meldet einen IGDB-Ausfall, statt den Aufruf zu reissen", async () => {
		await spielMitIgdb(1, 11, null);
		const kaputt = fakeIgdb([new Response("weg", { status: 500 })]).client;

		const e = await cronSchritt(repos(), psnStumm(), kaputt);

		// Der Schritt faengt den Fehler selbst; der Aufruf laeuft zu Ende und
		// sagt in der Logzeile, was los war.
		expect(e.getan).toBe("igdb_auffrischen");
		expect(e.auffrischen).toMatchObject({ status: "fehler", aktualisiert: 0 });
		expect(cronLogzeile(e)).toContain('meldung="Der IGDB-Abruf ist fehlgeschlagen."');
	});

	it("hebt die Ausgaenge mit Zeitstempel auf, neueste zuerst", async () => {
		// Der letzte Aufruf einer Nacht lautet fast immer "nichts"; ohne Verlauf
		// waere die geleistete Arbeit nicht zu sehen (22.09.2026).
		const r = repos();
		for (const [i, zeile] of ["A", "B", "C"].entries()) {
			await r.sync.cronAusgangVermerken(`2026-09-23 03:0${i}`, zeile);
		}

		expect(await r.sync.cronVerlauf()).toEqual([
			"2026-09-23 03:02 C",
			"2026-09-23 03:01 B",
			"2026-09-23 03:00 A",
		]);
	});

	it("verdichtet aufeinanderfolgende Leerlaufaufrufe zu einer Zeile", async () => {
		// Das Cron-Fenster hat 36 Aufrufe, die Arbeit ist gegen 04:10 getan.
		// Ohne Verdichtung stuenden am Morgen nur leere Zeilen im Verlauf und
		// die Nacht waere unsichtbar - der Befund vom 23.09.2026.
		const r = repos();
		await r.sync.cronAusgangVermerken("2026-09-23 04:11", "cron: igdb_auffrischen angefragt=50 aktualisiert=49");
		for (const minute of ["16", "21", "26"]) {
			await r.sync.cronAusgangVermerken(`2026-09-23 04:${minute}`, "cron: nichts erschienen=0", true);
		}

		expect(await r.sync.cronVerlauf()).toEqual([
			"2026-09-23 04:16–04:26 cron: nichts ×3",
			"2026-09-23 04:11 cron: igdb_auffrischen angefragt=50 aktualisiert=49",
		]);
	});

	it("nennt keinen Zeitraum, wenn beide Aufrufe in dieselbe Minute fallen", async () => {
		const r = repos();
		await r.sync.cronAusgangVermerken("2026-09-23 15:28", "cron: nichts erschienen=0", true);
		await r.sync.cronAusgangVermerken("2026-09-23 15:28", "cron: nichts erschienen=0", true);

		expect(await r.sync.cronVerlauf()).toEqual(["2026-09-23 15:28 cron: nichts ×2"]);

		// Und die verdichtete Zeile laesst sich weiter verdichten.
		await r.sync.cronAusgangVermerken("2026-09-23 15:33", "cron: nichts erschienen=0", true);
		expect(await r.sync.cronVerlauf()).toEqual(["2026-09-23 15:28–15:33 cron: nichts ×3"]);
	});

	it("verdichtet nicht ueber eine wirksame Zeile hinweg", async () => {
		const r = repos();
		await r.sync.cronAusgangVermerken("2026-09-23 04:06", "cron: nichts erschienen=0", true);
		await r.sync.cronAusgangVermerken("2026-09-23 04:11", "cron: aufraeumen erschienen=0 geloescht=30");
		await r.sync.cronAusgangVermerken("2026-09-23 04:16", "cron: nichts erschienen=0", true);

		const verlauf = await r.sync.cronVerlauf();
		expect(verlauf).toHaveLength(3);
		expect(verlauf[2]).toBe("2026-09-23 04:06 cron: nichts erschienen=0");
	});

	it("ein Fehler ist kein Leerlauf und bleibt stehen", async () => {
		expect(cronWirkungslos({ getan: "nichts", erschienen: 0, abgebrochen: 0 })).toBe(true);
		expect(cronWirkungslos({ getan: "nichts", erschienen: 0, abgebrochen: 0, meldung: "Der PSN-Abruf ist fehlgeschlagen." })).toBe(false);
		expect(cronWirkungslos({ getan: "nichts", erschienen: 1, abgebrochen: 0 })).toBe(false);
		expect(cronWirkungslos({ getan: "aufraeumen", erschienen: 0, abgebrochen: 0, geloescht: 5 })).toBe(false);
	});

	/**
	 * Rohantworten alter Laeufe (Stufe 18d). Am 23.09.2026 waren 2,31 von 3,26
	 * MB der Datenbank Rohantworten - fuenf Seiten je Nacht, immer dieselben
	 * Titel, und nichts loeschte sie je.
	 */
	async function lauf(status: string, seiten: number, normalisiert: boolean): Promise<number> {
		const { results } = await env.DB.prepare(
			"INSERT INTO psn_sync_run (started_at, status, next_offset) VALUES (datetime('now'), ?, 0) RETURNING id",
		)
			.bind(status)
			.all<{ id: number }>();
		const id = results[0].id;
		for (let i = 0; i < seiten; i++) {
			await env.DB.prepare(
				"INSERT INTO psn_raw_response (sync_run_id, endpoint, payload, fetched_at, normalized_at) " +
					"VALUES (?, ?, '[]', datetime('now'), ?)",
			)
				.bind(id, `/trophyTitles?offset=${i * 100}`, normalisiert ? "2026-09-23 03:30:00" : null)
				.run();
		}
		return id;
	}

	const seitenJeLauf = async () =>
		(
			await env.DB.prepare(
				"SELECT sync_run_id, COUNT(*) AS n FROM psn_raw_response GROUP BY sync_run_id ORDER BY sync_run_id",
			).all<{ sync_run_id: number; n: number }>()
		).results;

	it("raeumt Rohantworten alter Laeufe ab und behaelt die juengsten", async () => {
		const alt1 = await lauf("erfolg", 5, true);
		const alt2 = await lauf("erfolg", 5, true);
		const behalten: number[] = [];
		for (let i = 0; i < ROHANTWORTEN_LAEUFE; i++) behalten.push(await lauf("erfolg", 5, true));

		expect(await repos().sync.rohantwortenAufraeumen(ROHANTWORTEN_LAEUFE)).toBe(10);
		const uebrig = (await seitenJeLauf()).map((z) => z.sync_run_id);
		expect(uebrig).toEqual(behalten);
		expect(uebrig).not.toContain(alt1);
		expect(uebrig).not.toContain(alt2);
		// Die Laeufe selbst bleiben stehen - nur ihre Rohantworten gehen.
		expect(await laeufe()).toHaveLength(ROHANTWORTEN_LAEUFE + 2);
	});

	it("behaelt Nichtnormalisiertes unabhaengig vom Alter", async () => {
		// Unerledigte Arbeit, kein Archiv: Die Normalisierung laeuft ohne PSN
		// erneut - aber nur, solange ihre Vorlage noch da ist (Abschnitt 7.1).
		const offen = await lauf("fehler", 3, false);
		for (let i = 0; i < ROHANTWORTEN_LAEUFE; i++) await lauf("erfolg", 5, true);

		expect(await repos().sync.rohantwortenAufraeumen(ROHANTWORTEN_LAEUFE)).toBe(0);
		expect((await seitenJeLauf()).map((z) => z.sync_run_id)).toContain(offen);
	});

	it("der Cron raeumt auf, wenn sonst nichts zu tun ist - und nur dann", async () => {
		for (let i = 0; i < ROHANTWORTEN_LAEUFE + 1; i++) await lauf("erfolg", 5, true);

		const e = await cronSchritt(repos(), psnStumm(), igdbOhne());
		expect(e.getan).toBe("aufraeumen");
		expect(e.geloescht).toBe(5);
		expect(cronLogzeile(e)).toContain("geloescht=5");

		// Nichts mehr zu loeschen: Der naechste Aufruf faellt auf "nichts".
		expect((await cronSchritt(repos(), psnStumm(), igdbOhne())).getan).toBe("nichts");
	});

	it("die Logzeile nennt nur Zahlen und feste Texte", () => {
		const zeile = cronLogzeile({
			getan: "sync",
			erschienen: 2,
			abgebrochen: 1,
			sync: { status: "fehler", phase: "abruf", offset: 100, seitenGeholt: 0, titlesSeen: null, weiter: false, meldung: "Der Abruf ist fehlgeschlagen." },
		});
		expect(zeile).toBe('cron: sync erschienen=2 abgebrochen=1 sync=fehler/abruf offset=100 meldung="Der Abruf ist fehlgeschlagen."');
	});

	it("nennt in der Normalisierung die offenen Seiten statt des stehenden Offsets", () => {
		// Der Offset ist in dieser Phase fest 0. In der Nacht zum 24.09.2026
		// standen fuenf gleichlautende Zeilen "laufend/normalisierung offset=0"
		// im Verlauf - ein Schritt, der immer an derselben Seite scheitert,
		// haette genau dieselben geschrieben.
		const zeilen = [4, 3].map((offen) =>
			cronLogzeile({
				getan: "sync",
				erschienen: 0,
				sync: { status: "laufend", phase: "normalisierung", offset: 0, seitenGeholt: 0, titlesSeen: 431, offeneSeiten: offen, weiter: true },
			}),
		);

		expect(zeilen[0]).toBe("cron: sync erschienen=0 sync=laufend/normalisierung offen=4");
		expect(zeilen[1]).toBe("cron: sync erschienen=0 sync=laufend/normalisierung offen=3");
		expect(zeilen[0]).not.toEqual(zeilen[1]);
	});

	it("nennt beim Uebergang in die Normalisierung noch den Offset des Abrufs", () => {
		// Diesen Aufruf schreibt der Abruf, nicht die Normalisierung: Er hat
		// die letzte Seite geholt und die Phase umgestellt. `offeneSeiten` ist
		// hier unbekannt, der Offset dagegen die Zahl, die sich bewegt hat.
		const zeile = cronLogzeile({
			getan: "sync",
			erschienen: 0,
			sync: { status: "laufend", phase: "normalisierung", offset: 400, seitenGeholt: 1, titlesSeen: 431, weiter: true },
		});

		expect(zeile).toBe("cron: sync erschienen=0 sync=laufend/normalisierung offset=400");
	});

	it("nennt bei der Spielzeit den ganzen Trichter, nicht nur Anfang und Ende", () => {
		// `geholt` ist die Seite von Sony, `zugeordnet` zaehlt erst nach dem
		// Plattformfilter. Ohne die mittlere Zahl las sich die Zeile als 83
		// nicht zugeordnete Spiele - es waren die Streaming-Apps (24.09.2026).
		const zeile = cronLogzeile({
			getan: "spielzeit",
			erschienen: 0,
			spielzeit: { status: "erfolg", geholt: 200, geschrieben: 160, zugeordnet: 117, weiter: true },
		});

		expect(zeile).toBe("cron: spielzeit erschienen=0 spielzeit=erfolg geholt=200 geschrieben=160 zugeordnet=117");
	});
});
