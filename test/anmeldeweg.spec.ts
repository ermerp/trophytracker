import { createExecutionContext, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { verdichte } from "../src/db/sync";
import { Geheimnis } from "../src/domain/secret";
import { createScheduled } from "../src/index";
import { erstellePsnClient } from "../src/psn/client";
import { CRON_PSN } from "../src/sync/cron";
import { psnSitzung, type Anmeldung } from "../src/sync/run";
import { fakeIgdb } from "./igdb-fake";
import { TOKEN_ANTWORT, fakeFetch, jsonAntwort, redirectAntwort, trophaeenRegeln, trophySeite } from "./psn-fake";

/**
 * Nachtrag 18q-c (Abschnitt 7.1): Die Logzeile des Crons sagt, wie sich der
 * Aufruf bei Sony angemeldet hat. Geprueft wird der echte Einstieg samt
 * vermerkter Verlaufszeile - der Melder muss jeden Schritt erreichen.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const HEUTE = new Date().toISOString().slice(0, 10);
const IN_ZEHN_TAGEN = () => new Date(Date.now() + 10 * 86_400_000).toISOString();

type Vorgabe = {
	refresh?: () => Response;
	authorize?: () => Response;
	/** Der erste Datenabruf antwortet mit 401. */
	erst401?: boolean;
	seite?: () => Response;
};

/** PSN, das Erneuerung und NPSSO-Tausch getrennt beantworten kann. */
function psnMit(v: Vorgabe = {}) {
	let abgelehnt = !v.erst401;
	const daten = (antwort: () => Response) => () => {
		if (abgelehnt) return antwort();
		abgelehnt = true;
		return new Response("nein", { status: 401 });
	};
	const { fetch, aufrufe } = fakeFetch([
		[/oauth\/authorize/, v.authorize ?? (() => redirectAntwort("v3.abc"))],
		[
			/oauth\/token/,
			() => {
				const erneuern = String(aufrufe[aufrufe.length - 1].init?.body).includes("grant_type=refresh_token");
				return erneuern && v.refresh ? v.refresh() : jsonAntwort(TOKEN_ANTWORT);
			},
		],
		[/trophyTitles/, daten(v.seite ?? (() => new Response(trophySeite(0, 20))))],
		[/gamelist\/v2/, daten(() => jsonAntwort({ totalItemCount: 0, titles: [] }))],
		[
			/graphql/,
			daten(() => jsonAntwort({ data: { purchasedTitlesRetrieve: { games: [], pageInfo: { totalCount: 0 } } } })),
		],
		...trophaeenRegeln().map(([m, a]): [RegExp, () => Response] => [m, daten(a)]),
	]);
	return { psn: erstellePsnClient(fetch), aufrufe };
}

const abgelehnt = (status: number) => () => jsonAntwort({ error: "invalid_grant" }, status);
const npssoTot = () => new Response(null, { status: 403 });

/** Ein Aufruf ueber den echten Einstieg; zurueck kommt die juengste Verlaufszeile ohne Zeit. */
async function aufruf(psn: ReturnType<typeof psnMit>["psn"]): Promise<string> {
	await createScheduled(
		() => psn,
		() => fakeIgdb([[]], { zugang: null }).client,
	)({ scheduledTime: Date.now(), cron: CRON_PSN, noRetry() {} }, env, createExecutionContext());
	return (await repos().sync.cronVerlauf())[0].replace(/^\S+ \S+ /, "");
}

const refreshAblegen = () => repos().credentials.refreshTokenSpeichern(new Geheimnis("refresh-test"), IN_ZEHN_TAGEN());
const accessAblegen = () =>
	repos().credentials.sitzungSpeichern({
		accessToken: new Geheimnis("access-alt"),
		refreshToken: new Geheimnis("refresh-test"),
		accessLaeuftAbUm: new Date(Date.now() + 3_600_000).toISOString(),
		refreshLaeuftAbUm: IN_ZEHN_TAGEN(),
	});

type Schritt = "spielzeit" | "besitz" | "trophaeen" | "level";

/** Alles vor diesem Schritt der PSN-Kette ist heute schon getan. */
async function nurNoch(schritt: Schritt) {
	const setting = env.DB.prepare("INSERT INTO app_setting (key, value) VALUES (?, ?)");
	const anweisungen = [
		env.DB.prepare(
			"INSERT INTO psn_sync_run (started_at, finished_at, status, next_offset, started_by) VALUES (datetime('now'), datetime('now'), 'erfolg', 0, 'cron')",
		),
	];
	if (schritt !== "spielzeit") anweisungen.push(setting.bind("psn_spielzeit_stand", `${HEUTE}:-1`));
	if (schritt !== "spielzeit" && schritt !== "besitz") {
		anweisungen.push(setting.bind("psn_besitz_stand", JSON.stringify({ fertigAm: HEUTE })));
	}
	if (schritt === "trophaeen") {
		anweisungen.push(
			env.DB.prepare(
				"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, progress_pct, synced_at) " +
					"VALUES ('NPWR00001_00', 'trophy', 'Erfunden', 'PS4', 10, datetime('now'))",
			),
		);
	}
	await env.DB.batch(anweisungen);
}

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM psn_raw_response"),
		env.DB.prepare("DELETE FROM psn_sync_run"),
		env.DB.prepare("DELETE FROM psn_credentials"),
		env.DB.prepare("DELETE FROM psn_zugang"),
		env.DB.prepare("DELETE FROM trophy_progress"),
		env.DB.prepare(
			"DELETE FROM app_setting WHERE key IN ('cron_verlauf', 'cron_stand', 'psn_spielzeit_stand', 'psn_spielzeit_runde', 'psn_besitz_stand', 'trophaeen_level')",
		),
		env.DB.prepare("DELETE FROM app_setting WHERE key >= 'cron_begonnen' AND key < 'cron_begonnen;'"),
	]);
	await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
});

describe("Anmeldeweg in der Logzeile (Nachtrag 18q-c)", () => {
	it("Erneuerung gelingt: anmeldung=refresh, gleich hinter dem Bereich", async () => {
		await refreshAblegen();
		expect(await aufruf(psnMit().psn)).toBe(
			"cron: sync bereich=psn anmeldung=refresh sync=laufend/normalisierung offset=0",
		);
	});

	it("Refresh-Token abgelehnt: Rueckfall mit dem Status des Token-Endpunkts", async () => {
		await refreshAblegen();
		expect(await aufruf(psnMit({ refresh: abgelehnt(400) }).psn)).toBe(
			"cron: sync bereich=psn anmeldung=npsso grund=400 sync=laufend/normalisierung offset=0",
		);
	});

	it("2xx ohne Token ist ebenfalls ein Rueckfall, ohne Status", async () => {
		await refreshAblegen();
		expect(await aufruf(psnMit({ refresh: () => jsonAntwort({}) }).psn)).toContain(" anmeldung=npsso grund=leer ");
	});

	it("kein oder ein abgelaufener Refresh-Token: grund=ohne", async () => {
		expect(await aufruf(psnMit().psn)).toContain(" anmeldung=npsso grund=ohne ");

		await env.DB.prepare("DELETE FROM psn_sync_run").run();
		await repos().credentials.refreshTokenSpeichern(new Geheimnis("alt"), new Date(Date.now() - 1000).toISOString());
		expect(await aufruf(psnMit().psn)).toContain(" anmeldung=npsso grund=ohne ");
	});

	it("Wiederverwendung: kein Feld und keine Anmeldung", async () => {
		await accessAblegen();
		const { psn, aufrufe } = psnMit();
		expect(await aufruf(psn)).toBe("cron: sync bereich=psn sync=laufend/normalisierung offset=0");
		expect(aufrufe.filter((a) => /oauth/.test(a.url))).toHaveLength(0);
	});

	it("ein Aufruf, der Sony gar nicht braucht, hat kein Feld", async () => {
		await nurNoch("level");
		await env.DB.prepare("INSERT INTO app_setting (key, value) VALUES ('trophaeen_level', ?)")
			.bind(JSON.stringify({ level: 1, punkte: 0, bisNaechstes: 1, prozent: 0, standAm: HEUTE }))
			.run();
		expect(await aufruf(psnMit().psn)).toBe("cron: nichts bereich=psn");
	});

	it("401 auf ein wiederverwendetes Token: die eine Wiederholung meldet ihren Weg", async () => {
		await accessAblegen();
		expect(await aufruf(psnMit({ erst401: true }).psn)).toBe(
			"cron: sync bereich=psn anmeldung=refresh sync=laufend/normalisierung offset=0",
		);

		await env.DB.prepare("DELETE FROM psn_sync_run").run();
		await accessAblegen();
		expect(await aufruf(psnMit({ erst401: true, refresh: abgelehnt(400) }).psn)).toContain(
			" anmeldung=npsso grund=400 ",
		);
	});

	it("alles abgelehnt: gescheitert, mit dem Grund der Erneuerung - im Fehlerpfad des Syncs", async () => {
		await refreshAblegen();
		expect(await aufruf(psnMit({ refresh: abgelehnt(400), authorize: npssoTot }).psn)).toMatch(
			/^cron: sync bereich=psn anmeldung=gescheitert grund=400 sync=fehler\/abruf offset=0 meldung="PSN hat keinen/,
		);
	});

	it("ohne Refresh-Token und mit totem NPSSO: gescheitert grund=ohne", async () => {
		expect(await aufruf(psnMit({ authorize: npssoTot }).psn)).toContain(" anmeldung=gescheitert grund=ohne ");
	});

	it("ein Netzfehler bei der Erneuerung ist gescheitert und versucht wie bisher kein NPSSO", async () => {
		await refreshAblegen();
		const { psn, aufrufe } = psnMit({
			refresh: () => {
				throw new TypeError("Netz weg");
			},
		});
		expect(await aufruf(psn)).toContain(" anmeldung=gescheitert grund=fehler ");
		expect(aufrufe.filter((a) => /authorize/.test(a.url))).toHaveLength(0);
	});

	it.each(["spielzeit", "besitz", "trophaeen", "level"] as const)(
		"%s erbt das Feld: Erneuerung, 401-Wiederholung und Scheitern im catch der Kette",
		async (schritt) => {
			const beginnen = async () => {
				await env.DB.batch([
					env.DB.prepare("DELETE FROM psn_sync_run"),
					env.DB.prepare("DELETE FROM trophy_progress"),
					env.DB.prepare("DELETE FROM app_setting"),
				]);
				await nurNoch(schritt);
			};
			await beginnen();
			await refreshAblegen();
			expect(await aufruf(psnMit().psn)).toMatch(new RegExp(`^cron: ${schritt} bereich=psn anmeldung=refresh `));

			await beginnen();
			await accessAblegen();
			expect(await aufruf(psnMit({ erst401: true, refresh: abgelehnt(403) }).psn)).toMatch(
				new RegExp(`^cron: ${schritt} bereich=psn anmeldung=npsso grund=403 `),
			);

			await beginnen();
			await refreshAblegen();
			expect(await aufruf(psnMit({ refresh: abgelehnt(400), authorize: npssoTot }).psn)).toBe(
				'cron: nichts bereich=psn anmeldung=gescheitert grund=400 meldung="Der PSN-Abruf ist fehlgeschlagen."',
			);
		},
	);

	it("scheitert die 401-Wiederholung in einem Schritt, der seinen Fehler selbst meldet, steht beides da", async () => {
		await nurNoch("spielzeit");
		await accessAblegen();
		const zeile = await aufruf(psnMit({ erst401: true, refresh: abgelehnt(400), authorize: npssoTot }).psn);
		expect(zeile).toMatch(/^cron: spielzeit bereich=psn anmeldung=gescheitert grund=400 spielzeit=fehler .*meldung="/);
	});

	it("der Melder gehoert dem einen Aufruf - der naechste erbt nichts", async () => {
		await refreshAblegen();
		const { psn } = psnMit();
		expect(await aufruf(psn)).toContain("anmeldung=refresh");
		await env.DB.prepare("DELETE FROM psn_sync_run").run();
		expect(await aufruf(psn)).not.toContain("anmeldung=");
	});

	it("ohne Melder (Knopf) bleibt alles, wie es war", async () => {
		const gemeldet: Anmeldung[] = [];
		const { psn } = psnMit({ authorize: npssoTot });
		await expect(psnSitzung(repos(), psn).token()).rejects.toThrow("PSN hat keinen Zugriffscode geliefert.");
		await expect(psnSitzung(repos(), psn, undefined, (a) => gemeldet.push(a)).token()).rejects.toThrow(
			"PSN hat keinen Zugriffscode geliefert.",
		);
		expect(gemeldet).toEqual([{ weg: "gescheitert", grund: "ohne" }]);
	});
});

describe("Verdichtung mit Anmeldung (Nachtrag 18q-c)", () => {
	const reihe = async (zeilen: string[]) => {
		for (const [i, zeile] of zeilen.entries()) {
			await repos().sync.cronAusgangVermerken(`2026-11-28 00:${String(i * 5).padStart(2, "0")}`, zeile);
		}
		return repos().sync.cronVerlauf();
	};
	const sync = (offset: number, anmeldung = "") => `cron: sync bereich=psn ${anmeldung}sync=laufend/abruf offset=${offset}`;

	it("eine Anmeldung mitten in der Reihe bleibt als eigene Zeile stehen, die Spannen links und rechts stimmen", async () => {
		expect(await reihe([sync(0), sync(100), sync(200, "anmeldung=refresh "), sync(300), sync(400)])).toEqual([
			"2026-11-28 00:15–00:20 cron: sync ×2 bereich=psn sync=laufend/abruf offset=300→400",
			"2026-11-28 00:10 cron: sync bereich=psn anmeldung=refresh sync=laufend/abruf offset=200",
			"2026-11-28 00:00–00:05 cron: sync ×2 bereich=psn sync=laufend/abruf offset=0→100",
		]);
	});

	it("nur derselbe Weg mit demselben Grund wird gezaehlt, nie eine Spanne daraus", async () => {
		const npsso = (grund: string) => `anmeldung=npsso grund=${grund} `;
		expect(
			await reihe([sync(0, npsso("ohne")), sync(100, npsso("403")), sync(200, npsso("ohne")), sync(300, npsso("ohne"))]),
		).toEqual([
			"2026-11-28 00:10–00:15 cron: sync ×2 bereich=psn anmeldung=npsso grund=ohne sync=laufend/abruf offset=200→300",
			"2026-11-28 00:05 cron: sync bereich=psn anmeldung=npsso grund=403 sync=laufend/abruf offset=100",
			"2026-11-28 00:00 cron: sync bereich=psn anmeldung=npsso grund=ohne sync=laufend/abruf offset=0",
		]);
		// Gleicher Grund, anderer Weg: gleiche Feldfolge, trotzdem getrennt.
		expect(
			verdichte(`2026-11-28 00:00 ${sync(0, npsso("400"))}`, `2026-11-28 00:05 ${sync(0, "anmeldung=gescheitert grund=400 ")}`),
		).toBeNull();
	});
});
