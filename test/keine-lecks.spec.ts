import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createApp } from "../src/index";
import { createRepositories } from "../src/db";
import { Geheimnis } from "../src/domain/secret";
import { erstellePsnClient } from "../src/psn/client";
import { TOKEN_ANTWORT, fakeFetch, jsonAntwort, redirectAntwort, trophySeite } from "./psn-fake";

/**
 * Dichtheitspruefung.
 *
 * Weder NPSSO noch Refresh- oder Access Token duerfen jemals in einer
 * API-Antwort oder im Log auftauchen - auch nicht gekuerzt. Der Test faehrt
 * jede Route an, auch in den Fehlerfaellen, und sucht in allen Ausgaben nach
 * Markierungswerten.
 */

const MARKIERUNGEN = {
	npsso: "MARKIERUNG-NPSSO-7f3a91",
	refresh: "MARKIERUNG-REFRESH-2b8c04",
	access: "MARKIERUNG-ACCESS-e51d67",
};

const ALLE = Object.values(MARKIERUNGEN);

/** Prueft auch auf Teilzeichenketten ab acht Zeichen. */
function istDicht(text: string): { dicht: boolean; fund?: string } {
	for (const wert of ALLE) {
		if (text.includes(wert)) return { dicht: false, fund: wert };
		for (let laenge = wert.length; laenge >= 8; laenge--) {
			if (text.includes(wert.slice(0, laenge))) {
				return { dicht: false, fund: wert.slice(0, laenge) };
			}
		}
	}
	return { dicht: true };
}

const markiertesToken = {
	...TOKEN_ANTWORT,
	access_token: MARKIERUNGEN.access,
	refresh_token: MARKIERUNGEN.refresh,
};

function psnMarkiert() {
	return erstellePsnClient(
		fakeFetch([
			[/oauth\/authorize/, () => redirectAntwort("v3.code-markierung")],
			[/oauth\/token/, () => jsonAntwort(markiertesToken)],
			[/trophyTitles/, () => new Response(trophySeite(0, 5))],
		]).fetch,
	);
}

/** PSN-Client, der ueberall scheitert - fuer die Fehlerpfade. */
function psnKaputt() {
	return erstellePsnClient(
		fakeFetch([
			[/oauth\/authorize/, () => new Response(null, { status: 403 })],
			[/oauth\/token/, () => jsonAntwort({ error: "invalid_grant" }, 400)],
			[/trophyTitles/, () => new Response(null, { status: 500 })],
		]).fetch,
	);
}

let ausgabe: string[] = [];

beforeEach(async () => {
	ausgabe = [];
	for (const stufe of ["log", "info", "warn", "error", "debug"] as const) {
		vi.spyOn(console, stufe).mockImplementation((...args: unknown[]) => {
			ausgabe.push(args.map((a) => String(a)).join(" "));
		});
	}
	await env.DB.batch([
		env.DB.prepare("DELETE FROM psn_raw_response"),
		env.DB.prepare("DELETE FROM psn_sync_run"),
		env.DB.prepare("DELETE FROM psn_credentials"),
	]);
});

afterEach(() => vi.restoreAllMocks());

/** Ruft eine Route auf und gibt den Antworttext zurueck. */
async function ruf(
	app: ReturnType<typeof createApp>,
	pfad: string,
	init?: RequestInit,
): Promise<string> {
	const antwort = await app.request(pfad, init, env);
	return antwort.text();
}

describe("Dichtheitsprüfung", () => {
	it("erkennt eine Markierung ueberhaupt - Gegenprobe", () => {
		expect(istDicht(`etwas ${MARKIERUNGEN.npsso} hier`).dicht).toBe(false);
		expect(istDicht(`Anfang ${MARKIERUNGEN.refresh.slice(0, 10)} Rest`).dicht).toBe(false);
		expect(istDicht("voellig harmloser Text").dicht).toBe(true);
	});

	it("gibt auf keiner Route ein Geheimnis heraus - Erfolgspfad", async () => {
		const app = createApp(psnMarkiert);

		const antworten = [
			await ruf(app, "/api/settings/npsso", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ npsso: MARKIERUNGEN.npsso }),
			}),
			await ruf(app, "/api/sync", { method: "POST" }),
			await ruf(app, "/api/sync/status"),
			await ruf(app, "/api/settings/weights"),
			await ruf(app, "/api/health"),
			await ruf(app, "/api/games?owned=physisch&search=x"),
			await ruf(app, "/api/games/1"),
			await ruf(app, "/api/physical-copies"),
			await ruf(app, "/api/physical-copies", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ releaseId: 1, zustand: "gut" }),
			}),
			await ruf(app, "/api/digital-entitlements", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ releaseId: 1, quelle: "kauf" }),
			}),
			await ruf(app, "/api/releases/1", { method: "DELETE" }),
			await ruf(app, "/api/releases/1/play-status", {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ status: "am_spielen" }),
			}),
			await ruf(app, "/api/deviations"),
			await ruf(app, "/api/review/queue"),
			await ruf(app, "/api/review/progress"),
			await ruf(app, "/api/review/1/decide", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ aktion: "unveraendert" }),
			}),
			await ruf(app, "/api/export/backup.json"),
			await ruf(app, "/api/export/sammlung.csv"),
			await ruf(app, "/api/export/trophaeen.csv"),
			await ruf(app, "/api/backup/status"),
			await ruf(app, "/api/backup/vermerk", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ zeitpunkt: "2026-09-14T03:17:00Z", commit: "abc1234" }),
			}),
		];

		for (const text of antworten) {
			expect(istDicht(text), `Leck in: ${text.slice(0, 200)}`).toMatchObject({ dicht: true });
		}
	});

	it("gibt auf keiner Route ein Geheimnis heraus - Fehlerpfade", async () => {
		// Erst gueltig hinterlegen, dann alles scheitern lassen
		await createRepositories(env.DB, env.NPSSO_KEY).credentials.npssoSpeichern(
			new Geheimnis(MARKIERUNGEN.npsso),
		);
		const app = createApp(psnKaputt);

		const antworten = [
			await ruf(app, "/api/settings/npsso", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ npsso: MARKIERUNGEN.npsso }),
			}),
			await ruf(app, "/api/sync", { method: "POST" }),
			await ruf(app, "/api/sync/status"),
			await ruf(app, "/api/settings/npsso", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "kaputt",
			}),
			await ruf(app, "/api/export/backup.json"),
			await ruf(app, "/api/export/quatsch.csv"),
			await ruf(app, "/api/backup/vermerk", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "kaputt",
			}),
		];

		for (const text of antworten) {
			expect(istDicht(text), `Leck in: ${text.slice(0, 200)}`).toMatchObject({ dicht: true });
		}
	});

	it("protokolliert kein Geheimnis", async () => {
		const app = createApp(psnMarkiert);
		await ruf(app, "/api/settings/npsso", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ npsso: MARKIERUNGEN.npsso }),
		});
		await ruf(app, "/api/sync", { method: "POST" });

		const kaputt = createApp(psnKaputt);
		await ruf(kaputt, "/api/sync", { method: "POST" });

		expect(istDicht(ausgabe.join("\n"))).toMatchObject({ dicht: true });
	});

	/**
	 * Inhaltlich dasselbe wie `wrangler d1 export`, nur ohne Wrangler: jede
	 * Tabelle der Datenbank vollstaendig gelesen und serialisiert. Was hier
	 * nicht auftaucht, steht auch im Dump nicht - und der Dump landet ab
	 * Stufe 8 woechentlich im privaten Backup-Repo (Abschnitt 14.2).
	 *
	 * Bewusst ueber sqlite_master statt ueber eine Liste: Eine Tabelle, die
	 * eine kuenftige Migration anlegt, ist damit automatisch mitgeprueft.
	 */
	it("legt in KEINER Tabelle der Datenbank Klartext ab", async () => {
		const app = createApp(psnMarkiert);
		await ruf(app, "/api/settings/npsso", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ npsso: MARKIERUNGEN.npsso }),
		});
		await ruf(app, "/api/sync", { method: "POST" });

		const { results: tabellen } = await env.DB.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' " +
				"AND name NOT LIKE '_cf_%' ORDER BY name",
		).all<{ name: string }>();
		expect(tabellen.length).toBeGreaterThan(10);

		for (const { name } of tabellen) {
			const { results } = await env.DB.prepare(`SELECT * FROM ${name}`).all();
			expect(istDicht(JSON.stringify(results)), `Leck in Tabelle ${name}`).toMatchObject({
				dicht: true,
			});
		}
	});

	it("gibt in backup.json kein Geheimnis heraus", async () => {
		const app = createApp(psnMarkiert);
		await ruf(app, "/api/settings/npsso", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ npsso: MARKIERUNGEN.npsso }),
		});
		await ruf(app, "/api/sync", { method: "POST" });

		const sicherung = await ruf(app, "/api/export/backup.json");
		expect(istDicht(sicherung)).toMatchObject({ dicht: true });
		// Gegenprobe: Die Chiffrate sind gar nicht erst dabei.
		expect(sicherung).not.toContain("npsso_ciphertext");
		expect(sicherung).not.toContain("psn_raw_response");
	});

	it("speichert ein ungueltiges NPSSO nicht", async () => {
		const repos = createRepositories(env.DB, env.NPSSO_KEY);
		await repos.credentials.npssoSpeichern(new Geheimnis("bestehender-wert"));

		const app = createApp(psnKaputt);
		const antwort = await app.request(
			"/api/settings/npsso",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ npsso: MARKIERUNGEN.npsso }),
			},
			env,
		);

		expect(antwort.status).toBe(400);
		expect((await repos.credentials.npsso())?.offenlegen()).toBe("bestehender-wert");
	});
});
