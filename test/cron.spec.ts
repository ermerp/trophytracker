import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { haengerMeldung } from "../src/db/sync";
import { erstelleEbayClient } from "../src/ebay/client";
import { Geheimnis } from "../src/domain/secret";
import { erstellePsnClient } from "../src/psn/client";
import {
	AUFFRISCH_FRIST_TAGE,
	bereichFuerAusdruck,
	besitzLauf,
	besitzStand,
	CRON_PSN,
	CRON_WARTUNG,
	cronLogzeile,
	cronSchritt,
	HAENGT_NACH_STUNDEN,
	ROHANTWORTEN_LAEUFE,
} from "../src/sync/cron";
import { FEHLVERSUCHE_HOECHSTENS } from "../src/sync/run";
import { fakeIgdb, spielRoh } from "./igdb-fake";
import { TOKEN_ANTWORT, fakeFetch, jsonAntwort, redirectAntwort, trophaeenRegeln, trophySeite } from "./psn-fake";

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
		// Die Einzeltrophaeen aus Stufe 19b: Ohne sie fiele jeder Abruf auf
		// den 404 des Fakes und saehe aus wie "PSN kennt die Liste nicht".
		...trophaeenRegeln(),
	]);
	return { psn: erstellePsnClient(fetch), aufrufe };
}

/**
 * Wie psnMit, aber die Seiten in `aussetzer` antworten beim ERSTEN Versuch
 * mit 500 - der Fall aus der Nacht zum 27.09.2026 (Stufe 18e).
 */
function psnMitAussetzer(total: number, aussetzer: number[]) {
	const offen = new Set(aussetzer);
	const { fetch, aufrufe } = fakeFetch([
		[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
		[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
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
				return offen.delete(offset) ? new Response("weg", { status: 500 }) : new Response(trophySeite(offset, total));
			},
		],
	]);
	return { psn: erstellePsnClient(fetch), aufrufe };
}

/**
 * PSN, dessen ZWEITE Spielzeit-Seite die ersten `aussetzer` Male mit 403
 * antwortet - der Fall aus der Nacht zum 01.10.2026 (Stufe 18f). Der Sync
 * selbst laeuft sauber durch, nur `gamelist/v2` stolpert.
 */
function psnMitSpielzeitAussetzer(aussetzer: number) {
	let gestolpert = 0;
	const { fetch, aufrufe } = fakeFetch([
		[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
		[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
		[
			/gamelist\/v2/,
			() => {
				const letzte = aufrufe[aufrufe.length - 1].url;
				const offset = Number(new URL(letzte).searchParams.get("offset") ?? 0);
				// Zwei Seiten wie in der Produktion: 200 und 179 von 379. Die
				// Titel muessen echt sein, sonst endet die Blaetterung nach der
				// ersten Seite (`weiter` verlangt titel.length > 0).
				const seite = (n: number) =>
					jsonAntwort({
						totalItemCount: 379,
						titles: Array.from({ length: n }, (_, i) => ({
							titleId: `CUSA${offset + i}`,
							name: `Erfundenes Spiel ${offset + i}`,
							category: "ps4_game",
							playDuration: "PT1H30M",
						})),
					});
				if (offset === 0) return seite(200);
				if (gestolpert < aussetzer) {
					gestolpert++;
					return new Response("nein", { status: 403 });
				}
				return seite(179);
			},
		],
		[
			/graphql/,
			() => jsonAntwort({ data: { purchasedTitlesRetrieve: { games: [], pageInfo: { totalCount: 0 } } } }),
		],
		[/trophyTitles/, () => new Response(trophySeite(0, 0))],
	]);
	return { psn: erstellePsnClient(fetch), aufrufe };
}

/** PSN, das nur die Kaufliste verweigert - fuer den stummen Fehler aus 18c. */
const psnOhneKaufliste = (status: number) =>
	erstellePsnClient(
		fakeFetch([
			[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
			[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
			[/graphql/, () => new Response("weg", { status })],
		]).fetch,
	);

/** PSN mit leerer Kaufliste - ein vollstaendiger Durchlauf in einem Aufruf. */
const psnLeereKaufliste = () =>
	erstellePsnClient(
		fakeFetch([
			[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
			[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
			[
				/graphql/,
				() => jsonAntwort({ data: { purchasedTitlesRetrieve: { games: [], pageInfo: { totalCount: 0 } } } }),
			],
		]).fetch,
	);

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
/** Ohne eBay-Zugangsdaten bleibt der Marktschritt stumm (Stufe 20). */
const ebayOhne = () => erstelleEbayClient(null);

const laeufe = async () =>
	(await env.DB.prepare("SELECT id, status, phase, started_by, error_message FROM psn_sync_run ORDER BY id").all()).results;

/** Fehlversuche des juengsten Laufs (Migration 0024). */
const fehlversuche = async () =>
	(await env.DB.prepare("SELECT failed_attempts FROM psn_sync_run ORDER BY id DESC LIMIT 1").first<{ failed_attempts: number }>())
		?.failed_attempts ?? 0;

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

		const e = await cronSchritt(repos(), psnStumm(), fakeIgdb([[spielRoh({ id: 11 })]]).client, ebayOhne());

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
			const e = await cronSchritt(repos(), psn, igdbOhne(), ebayOhne());
			schritte.push(e);
			if (e.getan === "nichts" || e.getan === "trophaeen") break;
		}

		// 2 Seiten holen, 2 auswerten, 1 Abschluss - danach die beiden
		// PSN-Zusatzabrufe (Stufe 18c, hier leer) und dann die Einzeltrophaeen
		// (Stufe 19b), eine Liste je Aufruf. Geprueft wird der Anfang: Dass
		// der Fuellschritt 150-mal laeuft, ist Sache seines eigenen Tests.
		expect(schritte.slice(0, 8).map((s) => s.getan)).toEqual([
			"sync", "sync", "sync", "sync", "sync", "spielzeit", "besitz", "trophaeen",
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
			"cron: sync sync=laufend/abruf offset=100",
			"cron: sync sync=laufend/normalisierung offset=100",
			"cron: sync sync=laufend/normalisierung offen=1",
			"cron: sync sync=laufend/normalisierung offen=0",
			// eingereiht=0, obwohl 150 Titel neu sind: Ohne zugeordnetes
			// Release gibt es nichts durchzusehen (8.1).
			"cron: sync sync=erfolg/normalisierung offen=0 titel=150 eingereiht=0",
		]);
		expect(new Set(zeilen).size).toBe(zeilen.length);
	});

	it("startet je Nacht nur einen eigenen Lauf - am naechsten Tag wieder einen", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		const { psn } = psnMit(10);
		for (let i = 0; i < 5; i++) await cronSchritt(repos(), psn, igdbOhne(), ebayOhne());
		expect(await laeufe()).toHaveLength(1);

		// Kein ZWEITER Lauf heute. Was der Aufruf stattdessen tut, ist offen -
		// seit Stufe 19b fuellt er Einzeltrophaeen. Geprueft wird deshalb, dass
		// er keinen Sync startet, nicht dass er nichts tut.
		expect((await cronSchritt(repos(), psn, igdbOhne(), ebayOhne(), { heute: HEUTE })).getan).not.toBe("sync");
		expect(await laeufe()).toHaveLength(1);

		expect((await cronSchritt(repos(), psn, igdbOhne(), ebayOhne(), { heute: MORGEN })).getan).toBe("sync");
		expect(await laeufe()).toHaveLength(2);
	});

	it("holt eine gescheiterte Seite im naechsten Aufruf erneut, statt die Nacht zu verlieren", async () => {
		// Die Nacht zum 27.09.2026: Die dritte von fuenf Seiten antwortete mit
		// einem Fehler, der Lauf ging auf 'fehler', und weil schon ein
		// Cron-Lauf von heute existierte, taten die restlichen 29 Aufrufe des
		// Fensters nichts - 431 Titel blieben einen Tag alt (Stufe 18e).
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		const { psn } = psnMitAussetzer(250, [100]);

		expect((await cronSchritt(repos(), psn, igdbOhne(), ebayOhne())).sync).toMatchObject({ status: "laufend", offset: 100 });

		const e = await cronSchritt(repos(), psn, igdbOhne(), ebayOhne());
		expect(e.sync).toMatchObject({
			status: "laufend",
			fehlversuche: 1,
			// Der Statuscode steht jetzt in der Meldung: Vorher lautete sie
			// einheitlich "Der Abruf ist fehlgeschlagen.", und am Morgen war
			// nicht zu unterscheiden, was PSN geantwortet hatte.
			meldung: "Trophäenabruf antwortete mit 500.",
		});
		// Der Lauf lebt - und der Zugang gilt weiter als in Ordnung, solange
		// es weitergeht.
		expect(await laeufe()).toEqual([expect.objectContaining({ status: "laufend", started_by: "cron" })]);
		expect((await repos().credentials.anzeige()).status).toBe("ok");
		expect(cronLogzeile(e)).toContain(`versuch=1/${FEHLVERSUCHE_HOECHSTENS}`);

		// Weiter bis zum Erfolg: dieselbe Seite, derselbe Lauf.
		for (let i = 0; i < 7; i++) await cronSchritt(repos(), psn, igdbOhne(), ebayOhne());
		expect(await laeufe()).toEqual([expect.objectContaining({ status: "erfolg" })]);
		expect(await repos().trophies.anzahl()).toBe(250);
		// Und der Fehlerzaehler ist mit dem Fortschritt verschwunden.
		expect(await fehlversuche()).toBe(0);
	});

	it("gibt nach drei Fehlversuchen auf und wiederholt den Lauf in derselben Nacht nicht", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		const psn = psnKaputt();

		for (let versuch = 1; versuch <= FEHLVERSUCHE_HOECHSTENS; versuch++) {
			const e = await cronSchritt(repos(), psn, igdbOhne(), ebayOhne());
			expect(e.sync).toMatchObject({ fehlversuche: versuch });
			expect(e.sync?.status).toBe(versuch < FEHLVERSUCHE_HOECHSTENS ? "laufend" : "fehler");
		}

		expect(await laeufe()).toEqual([expect.objectContaining({ status: "fehler", started_by: "cron" })]);
		// Kein Auth-Fehler: Der Zugang steht auf 'fehler', nicht 'abgelaufen'.
		expect((await repos().credentials.anzeige()).status).toBe("fehler");

		// Kein zweiter Lauf: Der naechste Aufruf geht weiter in der Reihenfolge
		// (hier Spielzeit), statt den Sync zu wiederholen.
		expect((await cronSchritt(repos(), psnMit(10).psn, igdbOhne(), ebayOhne())).getan).not.toBe("sync");
		expect(await laeufe()).toHaveLength(1);
	});

	it("gibt bei abgelehntem Token sofort auf - ein Token wird in fuenf Minuten nicht gueltig", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		const psn = erstellePsnClient(
			fakeFetch([
				[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
				[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
				[/trophyTitles/, () => new Response("nein", { status: 401 })],
			]).fetch,
		);

		const e = await cronSchritt(repos(), psn, igdbOhne(), ebayOhne());
		expect(e.sync).toMatchObject({ status: "fehler" });
		expect(e.sync?.fehlversuche).toBeUndefined();
		expect(await laeufe()).toEqual([expect.objectContaining({ status: "fehler" })]);
		expect((await repos().credentials.anzeige()).status).toBe("abgelaufen");
	});

	it("legt bei abgelaufenem Zugang gar keinen Lauf an", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		await repos().credentials.statusSetzen("abgelaufen");

		expect((await cronSchritt(repos(), psnMit(10).psn, igdbOhne(), ebayOhne())).getan).toBe("nichts");
		expect(await laeufe()).toEqual([]);

		// Ein neues NPSSO setzt 'ok' - dann laeuft es wieder.
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-neu"));
		expect((await cronSchritt(repos(), psnMit(10).psn, igdbOhne(), ebayOhne())).getan).toBe("sync");
	});

	it("ein erfolgreicher Handabruf von heute ersetzt den Nachtlauf, ein fehlgeschlagener nicht", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		await env.DB.prepare(
			"INSERT INTO psn_sync_run (started_at, finished_at, status, next_offset, started_by) VALUES (datetime('now'), datetime('now'), 'erfolg', 0, 'nutzer')",
		).run();
		expect((await cronSchritt(repos(), psnMit(10).psn, igdbOhne(), ebayOhne())).getan).not.toBe("sync");

		await env.DB.prepare("UPDATE psn_sync_run SET status = 'fehler'").run();
		expect((await cronSchritt(repos(), psnMit(10).psn, igdbOhne(), ebayOhne())).getan).toBe("sync");
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

			const e = await cronSchritt(repos(), psnMit(10).psn, igdbOhne(), ebayOhne());

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

			const e = await cronSchritt(repos(), psnMit(10).psn, igdbOhne(), ebayOhne());

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

			const e = await cronSchritt(repos(), psnStumm(), igdbOhne(), ebayOhne());

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

			const e = await cronSchritt(repos(), psnMit(10).psn, igdbOhne(), ebayOhne());
			expect(e).toMatchObject({ getan: "sync", abgebrochen: 1 });
			expect((await laeufe()).at(-1)).toMatchObject({ started_by: "cron", status: "laufend" });
		});
	});

	it("frischt nur Spiele auf, deren Stand aelter als die Frist ist, und ruht sonst", async () => {
		await spielMitIgdb(1, 11, "2020-01-01 00:00:00");
		await spielMitIgdb(2, 12, null);
		await env.DB.prepare("UPDATE game SET igdb_synced_at = datetime('now') WHERE id = 2").run();

		const { client, aufrufe } = fakeIgdb([[spielRoh({ id: 11 })]]);
		const e = await cronSchritt(repos(), psnStumm(), client, ebayOhne());
		expect(e).toMatchObject({ getan: "igdb_auffrischen" });
		expect(e.auffrischen).toMatchObject({ angefragt: 1, aktualisiert: 1 });
		expect(String(aufrufe.at(-1)?.init?.body)).toContain("where id = (11)");

		// Beide frisch: nichts faellig, auch die Disc-Fassungen sind gestempelt.
		expect((await cronSchritt(repos(), psnStumm(), client, ebayOhne())).getan).toBe("nichts");
		expect(AUFFRISCH_FRIST_TAGE).toBe(7);
	});

	it("stempelt Spiele, die IGDB nicht zurueckgibt - sonst dreht sich der Schritt im Kreis", async () => {
		// Gesehen am 21.09.2026: Der naechtliche Auffrisch-Schritt waehlte
		// zwei Naechte lang dieselben Spiele und kam nie voran.
		await spielMitIgdb(1, 11, "2020-01-01 00:00:00");
		await spielMitIgdb(2, 12, "2020-01-01 00:00:00");

		// IGDB liefert nur eines der beiden zurueck.
		const e = await cronSchritt(repos(), psnStumm(), fakeIgdb([[spielRoh({ id: 11 })]]).client, ebayOhne());
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

		const e = await cronSchritt(repos(), psnStumm(), kaputt, ebayOhne());

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
			await r.sync.cronAusgangVermerken(`2026-09-23 04:${minute}`, "cron: nichts");
		}

		expect(await r.sync.cronVerlauf()).toEqual([
			"2026-09-23 04:16–04:26 cron: nichts ×3",
			"2026-09-23 04:11 cron: igdb_auffrischen angefragt=50 aktualisiert=49",
		]);
	});

	it("nennt keinen Zeitraum, wenn beide Aufrufe in dieselbe Minute fallen", async () => {
		const r = repos();
		await r.sync.cronAusgangVermerken("2026-09-23 15:28", "cron: nichts");
		await r.sync.cronAusgangVermerken("2026-09-23 15:28", "cron: nichts");

		expect(await r.sync.cronVerlauf()).toEqual(["2026-09-23 15:28 cron: nichts ×2"]);

		// Und die verdichtete Zeile laesst sich weiter verdichten.
		await r.sync.cronAusgangVermerken("2026-09-23 15:33", "cron: nichts");
		expect(await r.sync.cronVerlauf()).toEqual(["2026-09-23 15:28–15:33 cron: nichts ×3"]);
	});

	it("verdichtet nicht ueber eine wirksame Zeile hinweg", async () => {
		const r = repos();
		await r.sync.cronAusgangVermerken("2026-09-23 04:06", "cron: nichts");
		await r.sync.cronAusgangVermerken("2026-09-23 04:11", "cron: aufraeumen geloescht=30");
		await r.sync.cronAusgangVermerken("2026-09-23 04:16", "cron: nichts");

		const verlauf = await r.sync.cronVerlauf();
		expect(verlauf).toHaveLength(3);
		expect(verlauf[2]).toBe("2026-09-23 04:06 cron: nichts");
	});

	it("ein Fehler ist kein Leerlauf und bleibt stehen", async () => {
		// Seit Stufe 18e ist die Regel nicht mehr an einem eigenen
		// "wirkungslos" festgemacht, sondern an der Zeile selbst: Was eine
		// `meldung=` traegt, wird nie verdichtet.
		const r = repos();
		await r.sync.cronAusgangVermerken("2026-09-23 04:06", "cron: nichts");
		await r.sync.cronAusgangVermerken("2026-09-23 04:11", 'cron: nichts meldung="Der PSN-Abruf ist fehlgeschlagen."');
		await r.sync.cronAusgangVermerken("2026-09-23 04:16", "cron: nichts");

		expect(await r.sync.cronVerlauf()).toEqual([
			"2026-09-23 04:16 cron: nichts",
			'2026-09-23 04:11 cron: nichts meldung="Der PSN-Abruf ist fehlgeschlagen."',
			"2026-09-23 04:06 cron: nichts",
		]);
	});

	it("verdichtet gleichartige Arbeit mit Fortschritt als Spanne", async () => {
		// Der Kern von Stufe 18e: Zwanzig Eintraege fassten eine Nacht mit
		// Kaufliste nicht - einunddreissig Aufrufe, und die aeltesten elf (die
		// Sync-Zeilen) fielen weg (Rechnung vom 24.09.2026).
		const r = repos();
		for (const [i, offset] of [0, 100, 200, 300, 400].entries()) {
			await r.sync.cronAusgangVermerken(`2026-09-27 03:0${i}`, `cron: sync bereich=psn sync=laufend/abruf offset=${offset}`);
		}

		expect(await r.sync.cronVerlauf()).toEqual([
			"2026-09-27 03:00–03:04 cron: sync ×5 bereich=psn sync=laufend/abruf offset=0→400",
		]);
	});

	it("verdichtet nicht, wenn die Felder wechseln - und nicht ueber die Arbeit hinweg", async () => {
		const r = repos();
		await r.sync.cronAusgangVermerken("2026-09-27 03:00", "cron: sync sync=laufend/abruf offset=400");
		// Andere Feldfolge (offen statt offset): eigene Zeile, genau dort, wo
		// auch ein Mensch trennen wuerde.
		await r.sync.cronAusgangVermerken("2026-09-27 03:05", "cron: sync sync=laufend/normalisierung offen=4");
		await r.sync.cronAusgangVermerken("2026-09-27 03:10", "cron: sync sync=laufend/normalisierung offen=3");
		await r.sync.cronAusgangVermerken("2026-09-27 03:15", "cron: spielzeit spielzeit=erfolg geholt=200");

		expect(await r.sync.cronVerlauf()).toEqual([
			"2026-09-27 03:15 cron: spielzeit spielzeit=erfolg geholt=200",
			"2026-09-27 03:05–03:10 cron: sync ×2 sync=laufend/normalisierung offen=4→3",
			"2026-09-27 03:00 cron: sync sync=laufend/abruf offset=400",
		]);
	});

	it("verdichtet nicht ueber die Fenstergrenze hinweg", async () => {
		// Sonst stuende am Morgen "nichts ×36 bereich=psn→wartung" da, und von
		// keinem der beiden Fenster waere zu sehen, ob es gelaufen ist.
		const r = repos();
		await r.sync.cronAusgangVermerken("2026-09-28 05:55", "cron: nichts bereich=psn");
		await r.sync.cronAusgangVermerken("2026-09-28 06:00", "cron: nichts bereich=wartung");
		await r.sync.cronAusgangVermerken("2026-09-28 06:05", "cron: nichts bereich=wartung");

		expect(await r.sync.cronVerlauf()).toEqual([
			"2026-09-28 06:00–06:05 cron: nichts ×2 bereich=wartung",
			"2026-09-28 05:55 cron: nichts bereich=psn",
		]);
	});

	it("zeigt eine Seite, die dreimal an derselben Stelle scheitert, als Stillstand", async () => {
		// Die Lehre aus 18d: Was die Zeile nennt, muss sich bewegen. Ein
		// unveraenderter Offset bei ×3 ist genau das Signal.
		const r = repos();
		for (const minute of ["00", "05", "10"]) {
			await r.sync.cronAusgangVermerken(`2026-09-27 03:${minute}`, "cron: sync sync=laufend/abruf offset=200");
		}

		expect(await r.sync.cronVerlauf()).toEqual(["2026-09-27 03:00–03:10 cron: sync ×3 sync=laufend/abruf offset=200"]);
	});

	describe("zwei Fenster (Stufe 18e)", () => {
		it("die Ausdruecke im Code und in wrangler.jsonc sagen dasselbe", () => {
			// wrangler.jsonc laesst sich hier nicht importieren (Kommentare im
			// JSON), deshalb stehen die Werte woertlich da. Ein Auseinanderlaufen
			// ist nicht still: Ein unbekannter Ausdruck bekommt 'alles' und tut
			// zu viel, statt eine Haelfte der Automatik ausfallen zu lassen.
			expect(CRON_PSN).toBe("*/5 3-5 * * *");
			expect(CRON_WARTUNG).toBe("*/5 6-7 * * *");
			expect(bereichFuerAusdruck(CRON_PSN)).toBe("psn");
			expect(bereichFuerAusdruck(CRON_WARTUNG)).toBe("wartung");
			expect(bereichFuerAusdruck("*/5 * * * *")).toBe("alles");
			expect(bereichFuerAusdruck(undefined)).toBe("alles");
		});

		it("das PSN-Fenster raeumt nicht auf und gibt nichts frei", async () => {
			await spielMitIgdb(1, 11, null);
			await env.DB.prepare("UPDATE game SET release_status = 'angekuendigt', release_date = '2020-01-01' WHERE id = 1").run();
			for (let i = 0; i < ROHANTWORTEN_LAEUFE + 1; i++) await lauf("erfolg", 5, true);

			const e = await cronSchritt(repos(), psnStumm(), fakeIgdb([[spielRoh({ id: 11 })]]).client, ebayOhne(), { bereich: "psn" });
			expect(e).toMatchObject({ getan: "nichts", erschienen: 0, bereich: "psn" });
			expect(cronLogzeile(e)).toBe("cron: nichts bereich=psn");
			// Nichts geloescht, nichts freigegeben, nichts aufgefrischt.
			expect(await seitenJeLauf()).toHaveLength(ROHANTWORTEN_LAEUFE + 1);
			expect(
				(await env.DB.prepare("SELECT release_status FROM game WHERE id = 1").first<{ release_status: string }>())
					?.release_status,
			).toBe("angekuendigt");
		});

		it("das Wartungsfenster legt keinen Sync-Lauf an", async () => {
			await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
			await spielMitIgdb(1, 11, null);
			await env.DB.prepare("UPDATE game SET release_status = 'angekuendigt', release_date = '2020-01-01' WHERE id = 1").run();

			const e = await cronSchritt(repos(), psnMit(10).psn, igdbOhne(), ebayOhne(), { bereich: "wartung" });
			expect(e).toMatchObject({ getan: "nichts", erschienen: 1, bereich: "wartung" });
			expect(cronLogzeile(e)).toBe("cron: nichts bereich=wartung erschienen=1");
			// Der Sync ist faellig - aber nicht in diesem Fenster.
			expect(await laeufe()).toEqual([]);
		});

		it("ohne Bereich tut ein Aufruf beides - so laeuft es lokal und im Test", async () => {
			await spielMitIgdb(1, 11, null);
			await env.DB.prepare("UPDATE game SET release_status = 'angekuendigt', release_date = '2020-01-01' WHERE id = 1").run();

			const e = await cronSchritt(repos(), psnStumm(), igdbOhne(), ebayOhne());
			expect(e).toMatchObject({ erschienen: 1, bereich: "alles" });
			// 'alles' steht nicht in der Zeile: Es ist kein Fenster.
			expect(cronLogzeile(e)).not.toContain("bereich=");
		});
	});

	// 20 s statt der voreingestellten 5: Dieser eine Test spielt **sechzig
	// Cron-Aufrufe** gegen die lokale D1 durch - beide Fenster einer ganzen
	// Nacht -, waehrend jeder andere Test hier einen einzelnen Aufruf prueft.
	// Lokal braucht er 546 ms, im GitHub-Runner lief er am 27.09.2026 in die
	// 5-s-Grenze und riss einen Deploy, dessen Aenderung eine einzige
	// Textzeile im Frontend war (die ganze Datei brauchte dort 13 s statt 3).
	// Die Grenze schuetzt hier vor einer Endlosschleife, nicht vor Langsamkeit
	// - dafuer ist sie mit reichlich Luft immer noch scharf.
	it("eine ganze Nacht passt in den Verlauf - der Zweck der Verdichtung", { timeout: 20_000 }, async () => {
		// Die Probe auf Stufe 18e: Vorher waren es einunddreissig Zeilen, und
		// die zwanzig aufgehobenen zeigten die Sync-Aufrufe nicht mehr. Hier
		// laeuft eine vollstaendige Nacht durch - beide Fenster, jeder Aufruf
		// mit seiner Zeile wie in src/index.ts.
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		const { psn } = psnMit(431);
		const r = repos();
		let aufrufe = 0;

		const nacht = async (bereich: "psn" | "wartung", stunde: number, anzahl: number) => {
			for (let i = 0; i < anzahl; i++) {
				const e = await cronSchritt(r, psn, igdbOhne(), ebayOhne(), { bereich });
				const minute = String((i * 5) % 60).padStart(2, "0");
				const h = String(stunde + Math.floor((i * 5) / 60)).padStart(2, "0");
				await r.sync.cronAusgangVermerken(`2026-09-28 ${h}:${minute}`, cronLogzeile(e));
				aufrufe++;
			}
		};

		await nacht("psn", 3, 36);
		await nacht("wartung", 6, 24);

		const verlauf = await r.sync.cronVerlauf();
		console.info(`${aufrufe} Aufrufe ergeben ${verlauf.length} Zeilen:\n` + verlauf.join("\n"));

		// Sechzig Aufrufe, eine Handvoll Zeilen - und die Sync-Zeilen sind
		// noch da, statt aus dem Verlauf gedraengt zu sein.
		expect(aufrufe).toBe(60);
		expect(verlauf.length).toBeLessThanOrEqual(10);
		expect(verlauf.join("\n")).toContain("cron: sync ×");
		// Der erste geloggte Aufruf hat Seite 0 schon geholt und meldet 100.
		expect(verlauf.join("\n")).toContain("offset=100→400");
		expect(await repos().trophies.anzahl()).toBe(431);
	});

	describe("Spielzeit: Wiederholung nach einem Abrufsfehler (Stufe 18f)", () => {
		/**
		 * Der Fall aus der Nacht zum 01.10.2026: Die erste Seite kam durch, die
		 * zweite bekam 403. Bis Stufe 18f schrieb der Schritt daraufhin `-1` -
		 * der Tag war erledigt, 179 von 379 Titeln blieben ohne frische
		 * Spielzeit, und 20 Aufrufe des Fensters liefen leer.
		 */
		beforeEach(async () => {
			await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		});

		async function stand() {
			const z = await env.DB.prepare(
				"SELECT value FROM app_setting WHERE key = 'psn_spielzeit_stand'",
			).first<{ value: string }>();
			return z?.value ?? null;
		}

		/**
		 * Einen erledigten Sync fuer diesen Tag voraussetzen, damit der Schritt
		 * sofort an die Spielzeit kommt. Ohne das startet `syncFaellig` in
		 * jedem Aufruf einen neuen Lauf, sobald `heute` hinter der Uhr der
		 * Datenbank liegt - und die Spielzeit kaeme nie dran.
		 */
		async function syncSchonErledigt(heute: string) {
			await env.DB.prepare(
				"INSERT INTO psn_sync_run (started_at, finished_at, status, titles_seen) VALUES (?, ?, 'erfolg', 0)",
			)
				.bind(`${heute} 03:00:00`, `${heute} 03:50:00`)
				.run();
		}

		it("holt dieselbe Seite erneut, statt den Tag zu beenden", async () => {
			const { psn } = psnMitSpielzeitAussetzer(1);
			const heute = "2026-10-01";
			await syncSchonErledigt(heute);

			const erste = await cronSchritt(repos(), psn, igdbOhne(), ebayOhne(), { heute, bereich: "psn" });
			expect(erste).toMatchObject({ getan: "spielzeit", spielzeit: { status: "erfolg", geholt: 200 } });
			expect(await stand()).toBe(`${heute}:200`);

			const gescheitert = await cronSchritt(repos(), psn, igdbOhne(), ebayOhne(), { heute, bereich: "psn" });
			expect(gescheitert.spielzeit).toMatchObject({ status: "fehler", versuche: 1 });
			// Der Offset bleibt stehen: Der naechste Aufruf holt dieselbe Seite.
			expect(await stand()).toBe(`${heute}:200:1`);

			const nachgeholt = await cronSchritt(repos(), psn, igdbOhne(), ebayOhne(), { heute, bereich: "psn" });
			expect(nachgeholt.spielzeit).toMatchObject({ status: "erfolg", geholt: 179 });
			// Fortschritt setzt den Zaehler zurueck; der Tag ist sauber durch.
			expect(await stand()).toBe(`${heute}:-1`);
		});

		it("gibt nach drei Anlaeufen auf und laesst den Tag ruhen", async () => {
			const { psn } = psnMitSpielzeitAussetzer(99);
			const heute = "2026-10-01";
			await syncSchonErledigt(heute);

			await cronSchritt(repos(), psn, igdbOhne(), ebayOhne(), { heute, bereich: "psn" });
			const versuche: Array<number | undefined> = [];
			for (let i = 0; i < 5; i++) {
				const e = await cronSchritt(repos(), psn, igdbOhne(), ebayOhne(), { heute, bereich: "psn" });
				if (e.getan === "spielzeit") versuche.push(e.spielzeit?.versuche);
			}

			// Genau drei Anlaeufe an derselben Seite, dann ruht der Tag.
			expect(versuche).toEqual([1, 2, FEHLVERSUCHE_HOECHSTENS]);
			expect(await stand()).toBe(`${heute}:-1`);
		});

		it("liest einen alten Stand ohne Versuchszaehler weiter", async () => {
			const heute = "2026-10-01";
			await syncSchonErledigt(heute);
			// So steht er seit der Nacht zum 01.10.2026 in der Produktion.
			await repos().sync.fortschrittSetzenWert("psn_spielzeit_stand", `${heute}:-1`);
			const { psn } = psnMitSpielzeitAussetzer(0);

			const e = await cronSchritt(repos(), psn, igdbOhne(), ebayOhne(), { heute, bereich: "psn" });
			expect(e.getan).not.toBe("spielzeit");
		});
	});

	describe("Kaufliste (7.7, Nachbesserung in Stufe 18e)", () => {
		beforeEach(async () => {
			await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		});

		it("ein Fehler ist kein 'fertig' und ruht nicht sieben Tage", async () => {
			// Der Befund vom 27.09.2026: `digital_entitlement` hielt keine
			// einzige Zeile mit herkunft='psn', obwohl `psn_besitz_stand` auf
			// {"fertigAm":"2026-09-23"} stand. Beide Ausgaenge schrieben
			// dieselbe Marke - ein auf der ersten Seite gescheiterter Lauf sah
			// aus wie ein vollstaendiger und legte den Schritt fuer sieben Tage
			// still.
			const e = await besitzLauf(repos(), psnOhneKaufliste(403), "2026-09-27");
			expect(e).toMatchObject({ status: "fehler", meldung: "Abruf der Kaufliste antwortete mit 403." });
			expect(await besitzStand(repos())).toEqual({ fehlerAm: "2026-09-27" });

			// Am naechsten Abend wird es erneut versucht, nicht erst in einer Woche.
			expect(await besitzLauf(repos(), psnOhneKaufliste(403), "2026-09-28")).not.toBeNull();
		});

		it("ein geglueckter Abruf raeumt ein altes fehler am Zugang weg - auch von Hand", async () => {
			// Am 27.09.2026 holte der Knopf "Kaufliste jetzt abrufen" 210
			// Berechtigungen, und in den Einstellungen stand weiter "Fehler
			// beim letzten Versuch": Das Wegraeumen hing am Cron statt am
			// Schritt.
			await repos().credentials.statusSetzen("fehler");
			await besitzLauf(repos(), psnLeereKaufliste(), "2026-09-27", { erzwingen: true });
			expect((await repos().credentials.anzeige()).status).toBe("ok");

			// 'abgelaufen' raeumt nur ein neues NPSSO weg, kein Abruf.
			await repos().credentials.statusSetzen("abgelaufen");
			await besitzLauf(repos(), psnLeereKaufliste(), "2026-09-28", { erzwingen: true });
			expect((await repos().credentials.anzeige()).status).toBe("abgelaufen");
		});

		it("ein vollstaendiger Lauf ruht die Frist ab - und weicht dem Knopf", async () => {
			const psn = psnLeereKaufliste();
			expect(await besitzLauf(repos(), psn, "2026-09-27")).toMatchObject({ status: "erfolg", weiter: false });
			expect(await besitzStand(repos())).toEqual({ fertigAm: "2026-09-27" });

			expect(await besitzLauf(repos(), psn, "2026-09-28")).toBeNull();
			// "Kaufliste jetzt abrufen" wartet nicht bis zum naechsten Termin.
			expect(await besitzLauf(repos(), psn, "2026-09-28", { erzwingen: true })).not.toBeNull();
		});
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

	it("behaelt Nichtnormalisiertes eines laufenden Laufs unabhaengig vom Alter", async () => {
		// Unerledigte Arbeit, kein Archiv: Die Normalisierung laeuft ohne PSN
		// erneut - aber nur, solange ihre Vorlage noch da ist (Abschnitt 7.1).
		const offen = await lauf("laufend", 3, false);
		for (let i = 0; i < ROHANTWORTEN_LAEUFE; i++) await lauf("erfolg", 5, true);

		expect(await repos().sync.rohantwortenAufraeumen(ROHANTWORTEN_LAEUFE)).toBe(0);
		expect((await seitenJeLauf()).map((z) => z.sync_run_id)).toContain(offen);
	});

	it("raeumt die Waisen eines gescheiterten Laufs weg - aber erst mit dem Fenster", async () => {
		// Der Befund vom 24.09.2026, eingetreten in der Nacht zum 27.09.2026:
		// Lauf 13 scheiterte bei Offset 200, und seine zwei geholten Seiten
		// (117 KiB) wurden nie normalisiert und nie geloescht - jede Sicherung
		// trug sie mit. Sie bleiben, solange der Lauf unter den juengsten
		// dreien ist: Solange sind sie das Beweisstueck zum Fehler.
		const waise = await lauf("fehler", 2, false);
		for (let i = 0; i < ROHANTWORTEN_LAEUFE - 1; i++) await lauf("erfolg", 5, true);

		expect(await repos().sync.rohantwortenAufraeumen(ROHANTWORTEN_LAEUFE)).toBe(0);
		expect((await seitenJeLauf()).map((z) => z.sync_run_id)).toContain(waise);

		// Ein Lauf mehr, und die Waisen fallen aus dem Fenster.
		await lauf("erfolg", 5, true);
		expect(await repos().sync.rohantwortenAufraeumen(ROHANTWORTEN_LAEUFE)).toBe(2);
		expect((await seitenJeLauf()).map((z) => z.sync_run_id)).not.toContain(waise);
	});

	it("der Cron raeumt auf, wenn sonst nichts zu tun ist - und nur dann", async () => {
		for (let i = 0; i < ROHANTWORTEN_LAEUFE + 1; i++) await lauf("erfolg", 5, true);

		const e = await cronSchritt(repos(), psnStumm(), igdbOhne(), ebayOhne());
		expect(e.getan).toBe("aufraeumen");
		expect(e.geloescht).toBe(5);
		expect(cronLogzeile(e)).toContain("geloescht=5");

		// Nichts mehr zu loeschen: Der naechste Aufruf faellt auf "nichts".
		expect((await cronSchritt(repos(), psnStumm(), igdbOhne(), ebayOhne())).getan).toBe("nichts");
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

		expect(zeilen[0]).toBe("cron: sync sync=laufend/normalisierung offen=4");
		expect(zeilen[1]).toBe("cron: sync sync=laufend/normalisierung offen=3");
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

		expect(zeile).toBe("cron: sync sync=laufend/normalisierung offset=400");
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

		expect(zeile).toBe("cron: spielzeit spielzeit=erfolg geholt=200 geschrieben=160 zugeordnet=117");
	});

	it("nennt den Fehlversuch der Spielzeit als Zahl (Stufe 18f)", () => {
		const zeile = cronLogzeile({
			getan: "spielzeit",
			erschienen: 0,
			abgebrochen: 0,
			spielzeit: {
				status: "fehler",
				geholt: 0,
				geschrieben: 0,
				zugeordnet: 0,
				weiter: false,
				versuche: 2,
				meldung: "Abruf der Spielzeiten antwortete mit 403.",
			},
		});

		expect(zeile).toBe(
			'cron: spielzeit spielzeit=fehler geholt=0 geschrieben=0 zugeordnet=0 versuch=2/3 ' +
				'meldung="Abruf der Spielzeiten antwortete mit 403."',
		);
	});
});
