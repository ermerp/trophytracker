import { createExecutionContext, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { ACCESS_RESTZEIT_MS } from "../src/db/credentials";
import { Geheimnis } from "../src/domain/secret";
import { createScheduled } from "../src/index";
import { erstellePsnClient } from "../src/psn/client";
import { CRON_PSN } from "../src/sync/cron";
import { psnSitzung, syncSchritt } from "../src/sync/run";
import { zaehlendeDb } from "./d1-zaehler";
import { fakeIgdb } from "./igdb-fake";
import { TOKEN_ANTWORT, fakeFetch, jsonAntwort, redirectAntwort, trophySeite } from "./psn-fake";

/**
 * Nachtrag 18q (Abschnitt 7.1): Das Access Token wird wiederverwendet, statt in
 * jedem arbeitenden PSN-Aufruf erneuert zu werden. Lehnt Sony ein
 * WIEDERVERWENDETES Token ab, wird genau einmal erneuert und der Abruf
 * wiederholt - sonst stuende die PSN-Automatik still ('abgelaufen'), obwohl
 * der Refresh-Token lebt.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const HEUTE = new Date().toISOString().slice(0, 10);
const GESTERN = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

const tokenAufrufe = (aufrufe: Array<{ url: string }>) => aufrufe.filter((a) => /oauth\/token/.test(a.url)).length;

/** Ein PSN-Fake, dessen Trophaeenseiten beim ersten Abruf mit `erstStatus` antworten koennen. */
function psnMit(erstStatus?: number) {
	let erster = true;
	const { fetch, aufrufe } = fakeFetch([
		[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
		[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
		[
			/trophyTitles/,
			() => {
				if (erstStatus && erster) {
					erster = false;
					return new Response("nein", { status: erstStatus });
				}
				return new Response(trophySeite(0, 20));
			},
		],
	]);
	return { psn: erstellePsnClient(fetch), aufrufe };
}

const zugang = () =>
	env.DB.prepare("SELECT status, access_ciphertext, access_expires_at FROM psn_credentials WHERE id = 1").first<{
		status: string;
		access_ciphertext: string | null;
		access_expires_at: string | null;
	}>();

beforeEach(async () => {
	await env.DB.batch([
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

describe("Access Token wiederverwenden (Nachtrag 18q)", () => {
	it("holt das Token einmal und nimmt es im naechsten Aufruf wieder, verschluesselt gespeichert", async () => {
		const { psn, aufrufe } = psnMit();
		const erstes = await psnSitzung(repos(), psn).token();
		expect(tokenAufrufe(aufrufe)).toBe(1);

		const z = await zugang();
		expect(z?.access_ciphertext).not.toBeNull();
		// Chiffrat, nie Klartext in D1.
		expect(z?.access_ciphertext).not.toContain(TOKEN_ANTWORT.access_token);

		// Ein neuer Aufruf (neue Sitzung, Zeile frisch gelesen): kein Token-Abruf.
		const zweites = await psnSitzung(repos(), psn).token();
		expect(tokenAufrufe(aufrufe)).toBe(1);
		expect(zweites.offenlegen()).toBe(erstes.offenlegen());
	});

	it("erneuert, wenn das gespeicherte Token weniger als die Restzeit gilt", async () => {
		const { psn, aufrufe } = psnMit();
		await psnSitzung(repos(), psn).token();
		const knapp = new Date(Date.now() + ACCESS_RESTZEIT_MS - 60_000).toISOString();
		await env.DB.prepare("UPDATE psn_credentials SET access_expires_at = ? WHERE id = 1").bind(knapp).run();

		await psnSitzung(repos(), psn).token();
		expect(tokenAufrufe(aufrufe)).toBe(2);
	});

	it("erneuert genau einmal, wenn Sony ein wiederverwendetes Token ablehnt, und der Zugang bleibt ok", async () => {
		// Ein frueherer Aufruf hat ein gueltiges Token abgelegt; der Sync beginnt
		// erst jetzt, sein erster Abruf trifft also das gespeicherte Token.
		await psnSitzung(repos(), psnMit().psn).token();

		const { psn, aufrufe } = psnMit(401);
		const e = await syncSchritt(repos(), psn);

		expect(e.status).not.toBe("fehler");
		expect(tokenAufrufe(aufrufe)).toBe(1);
		// Die Seite zweimal: abgelehnt mit dem alten, angenommen mit dem neuen Token.
		const seiten = aufrufe.filter((a) => /trophyTitles/.test(a.url));
		expect(seiten).toHaveLength(2);
		const bearer = (a: { init?: RequestInit }) => new Headers(a.init?.headers).get("Authorization");
		expect(bearer(seiten[0])).toBe(bearer(seiten[1]));
		expect((await zugang())?.status).toBe("ok");
	});

	it("tauscht nach der Erneuerung auch in spaeteren Abrufen desselben Aufrufs das abgelehnte Token", async () => {
		await psnSitzung(repos(), psnMit().psn).token();
		const { psn, aufrufe } = psnMit(401);
		const sitzung = psnSitzung(repos(), psn);
		const alt = await sitzung.token();
		await sitzung.psn.holeTrophyTitlesSeite(alt, 0, 100);
		await sitzung.psn.holeTrophyTitlesSeite(alt, 100, 100);

		expect(tokenAufrufe(aufrufe)).toBe(1);
		expect(aufrufe.filter((a) => /trophyTitles/.test(a.url))).toHaveLength(3);
	});

	it("wiederholt nicht, wenn ein FRISCH geholtes Token abgelehnt wird - wie bisher 'abgelaufen'", async () => {
		const { psn, aufrufe } = psnMit(401);
		const e = await syncSchritt(repos(), psn);

		expect(e.status).toBe("fehler");
		expect(tokenAufrufe(aufrufe)).toBe(1);
		expect(aufrufe.filter((a) => /trophyTitles/.test(a.url))).toHaveLength(1);
		expect((await zugang())?.status).toBe("abgelaufen");
	});

	it("ein neues Refresh-Token allein verwirft das gespeicherte Access Token", async () => {
		await psnSitzung(repos(), psnMit().psn).token();
		expect((await zugang())?.access_ciphertext).not.toBeNull();
		await repos().credentials.refreshTokenSpeichern(new Geheimnis("anderes"), new Date(Date.now() + 86_400_000).toISOString());
		expect((await zugang())?.access_ciphertext).toBeNull();
	});
});

describe("D1-Aufrufe eines arbeitenden PSN-Aufrufs (Nachtrag 18q)", () => {
	/**
	 * Gemessen wird der ECHTE Einstieg, wie in test/lesekosten.spec.ts: Lage,
	 * Sitzung, Schritt, Ausgang. Vor 18q waren es fuer die Spitze sechs
	 * (gezaehlt am 08.11.2026, 16.2): die Zugangszeile ein zweites Mal gelesen
	 * und das Token in jedem Aufruf erneuert und zurueckgeschrieben.
	 */
	it("die Spitze braucht mit gespeichertem Token vier, mit Erneuerung fuenf", async () => {
		// Der Sync von heute ist durch, die Spielzeit ist faellig (Spitze).
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO psn_sync_run (started_at, finished_at, status, next_offset, started_by) VALUES (datetime('now'), datetime('now'), 'erfolg', 0, 'cron')",
			),
			env.DB.prepare("INSERT OR REPLACE INTO app_setting (key, value) VALUES ('psn_spielzeit_runde', ?)").bind(
				JSON.stringify({ vollAm: GESTERN, release: 1e9, spitzeAm: GESTERN }),
			),
		]);
		const titel = Array.from({ length: 25 }, (_, k) => ({
			titleId: `CUSA${String(k + 1).padStart(5, "0")}_00`,
			name: `Spiel ${k}`,
			category: "ps4_game",
			playDuration: "PT3H",
			playCount: 1,
			lastPlayedDateTime: new Date(Date.now() - (k + 3) * 86_400_000).toISOString(),
		}));
		const { fetch, aufrufe } = fakeFetch([
			[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
			[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
			[/gamelist\/v2/, () => jsonAntwort({ totalItemCount: 379, titles: titel })],
		]);
		const aufruf = async () => {
			const zaehler = zaehlendeDb(env.DB);
			await createScheduled(
				() => erstellePsnClient(fetch),
				() => fakeIgdb([[]], { zugang: null }).client,
			)({ scheduledTime: Date.now(), cron: CRON_PSN, noRetry() {} }, { ...env, DB: zaehler.db }, createExecutionContext());
			await env.DB.prepare("DELETE FROM app_setting WHERE key = 'psn_spielzeit_stand'").run();
			return zaehler.aufrufe();
		};

		// Ohne gespeichertes Token (erster Aufruf nach dem Eintragen): erneuern.
		expect(await aufruf()).toBe(5);
		expect(tokenAufrufe(aufrufe)).toBe(1);
		// Danach: das gespeicherte Token.
		expect(await aufruf()).toBe(4);
		expect(tokenAufrufe(aufrufe)).toBe(1);
		expect(aufrufe.filter((a) => /gamelist/.test(a.url))).toHaveLength(2);
	});
});
