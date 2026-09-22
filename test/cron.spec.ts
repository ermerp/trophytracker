import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { haengerMeldung } from "../src/db/sync";
import { Geheimnis } from "../src/domain/secret";
import { erstellePsnClient } from "../src/psn/client";
import { AUFFRISCH_FRIST_TAGE, cronLogzeile, cronSchritt, HAENGT_NACH_STUNDEN } from "../src/sync/cron";
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

		expect((await cronSchritt(repos(), psnMit(10).psn, igdbOhne())).getan).toBe("nichts");
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
		expect((await cronSchritt(repos(), psnMit(10).psn, igdbOhne())).getan).toBe("nichts");

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

	it("hebt die letzten fuenf Ausgaenge auf, neueste zuerst", async () => {
		// Der letzte Aufruf einer Nacht lautet fast immer "nichts"; ohne Verlauf
		// waere die geleistete Arbeit nicht zu sehen (22.09.2026).
		const r = repos();
		for (const zeile of ["A", "B", "C", "D", "E", "F"]) await r.sync.cronAusgangVermerken(zeile);

		expect(await r.sync.cronVerlauf()).toEqual(["F", "E", "D", "C", "B"]);
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
});
