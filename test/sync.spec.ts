import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";
import { Geheimnis } from "../src/domain/secret";
import { erstellePsnClient } from "../src/psn/client";
import { SEITENGROESSE, SEITEN_JE_AUFRUF } from "../src/domain/trophy-pages";
import { syncSchritt } from "../src/sync/run";
import { TOKEN_ANTWORT, fakeFetch, jsonAntwort, redirectAntwort, trophySeite } from "./psn-fake";

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);

async function leeren() {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM psn_raw_response"),
		env.DB.prepare("DELETE FROM psn_sync_run"),
		env.DB.prepare("DELETE FROM psn_credentials"),
	]);
}

/** PSN-Client, der eine Sammlung der Groesse `total` ausliefert. */
function psnMit(total: number) {
	const { fetch, aufrufe } = fakeFetch([
		[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
		[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
		[
			/trophyTitles/,
			// Offset aus der URL des letzten Aufrufs ziehen
			() => {
				const letzte = aufrufe[aufrufe.length - 1].url;
				const offset = Number(new URL(letzte).searchParams.get("offset") ?? 0);
				return new Response(trophySeite(offset, total));
			},
		],
	]);
	return { psn: erstellePsnClient(fetch), aufrufe };
}

beforeEach(leeren);

describe("syncSchritt", () => {
	it("meldet einen Fehler, wenn kein NPSSO hinterlegt ist", async () => {
		const { psn } = psnMit(10);
		const ergebnis = await syncSchritt(repos(), psn);

		expect(ergebnis.status).toBe("fehler");
		expect(ergebnis.meldung).toMatch(/kein NPSSO/i);
	});

	it("holt eine kleine Sammlung in einem Aufruf ab", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		const { psn } = psnMit(50);

		const ergebnis = await syncSchritt(repos(), psn);

		expect(ergebnis).toMatchObject({ status: "erfolg", weiter: false, titlesSeen: 50 });
	});

	it("teilt eine grosse Sammlung ueber mehrere Aufrufe auf", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));

		// Bewusst aus den Konstanten abgeleitet: Die Seitengrenze wird nach
		// CPU-Messungen nachjustiert, der Test soll das ueberleben.
		const TITEL = 450;
		const seiten = Math.ceil(TITEL / SEITENGROESSE);
		const aufrufe = Math.ceil(seiten / SEITEN_JE_AUFRUF);

		for (let i = 1; i < aufrufe; i++) {
			const zwischenstand = await syncSchritt(repos(), psnMit(TITEL).psn);
			expect(zwischenstand).toMatchObject({
				status: "laufend",
				weiter: true,
				seitenGeholt: SEITEN_JE_AUFRUF,
			});
		}

		const letzter = await syncSchritt(repos(), psnMit(TITEL).psn);
		expect(letzter).toMatchObject({ status: "erfolg", weiter: false, titlesSeen: TITEL });

		const { results } = await env.DB.prepare(
			"SELECT endpoint FROM psn_raw_response ORDER BY id",
		).all<{ endpoint: string }>();

		expect(results).toHaveLength(seiten);
		expect(results[0].endpoint).toContain("offset=0");
		expect(results[seiten - 1].endpoint).toContain(`offset=${(seiten - 1) * SEITENGROESSE}`);
	});

	it("legt die Rohantwort unveraendert ab", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		await syncSchritt(repos(), psnMit(20).psn);

		const zeile = await env.DB.prepare("SELECT payload FROM psn_raw_response").first<{
			payload: string;
		}>();
		expect(zeile?.payload).toBe(trophySeite(0, 20));
	});

	it("schreibt KEINE Token-Antwort in die Rohdaten", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		await syncSchritt(repos(), psnMit(20).psn);

		const { results } = await env.DB.prepare(
			"SELECT payload FROM psn_raw_response",
		).all<{ payload: string }>();

		for (const zeile of results) {
			expect(zeile.payload).not.toContain("refresh_token");
			expect(zeile.payload).not.toContain("access_token");
		}
	});

	it("nutzt beim zweiten Lauf den Refresh-Token statt des NPSSO", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		await syncSchritt(repos(), psnMit(20).psn);

		const { psn, aufrufe } = psnMit(20);
		await syncSchritt(repos(), psn);

		expect(aufrufe.some((a) => a.url.includes("authorize"))).toBe(false);
		expect(String(aufrufe[0].init?.body)).toContain("grant_type=refresh_token");
	});

	it("faellt auf das NPSSO zurueck, wenn der Refresh-Token abgelehnt wird", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		await syncSchritt(repos(), psnMit(20).psn);

		let ersterTokenAufruf = true;
		const { fetch, aufrufe } = fakeFetch([
			[/oauth\/authorize/, () => redirectAntwort("v3.neu")],
			[
				/oauth\/token/,
				() => {
					if (ersterTokenAufruf) {
						ersterTokenAufruf = false;
						return jsonAntwort({ error: "invalid_grant" }, 400);
					}
					return jsonAntwort(TOKEN_ANTWORT);
				},
			],
			[/trophyTitles/, () => new Response(trophySeite(0, 20))],
		]);

		const ergebnis = await syncSchritt(repos(), erstellePsnClient(fetch));

		expect(ergebnis.status).toBe("erfolg");
		expect(aufrufe.some((a) => a.url.includes("authorize"))).toBe(true);
	});

	it("setzt bei abgelaufenem Zugang den Status, ohne Daten anzutasten", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		await syncSchritt(repos(), psnMit(20).psn);
		const vorher = await env.DB.prepare("SELECT COUNT(*) AS n FROM psn_raw_response").first<{
			n: number;
		}>();

		const { fetch } = fakeFetch([
			[/oauth\/token/, () => jsonAntwort({ error: "invalid_grant" }, 400)],
			[/oauth\/authorize/, () => new Response(null, { status: 200 })],
		]);
		const ergebnis = await syncSchritt(repos(), erstellePsnClient(fetch));

		expect(ergebnis.status).toBe("fehler");
		expect((await repos().credentials.anzeige()).status).toBe("abgelaufen");

		const nachher = await env.DB.prepare("SELECT COUNT(*) AS n FROM psn_raw_response").first<{
			n: number;
		}>();
		expect(nachher?.n).toBe(vorher?.n);
	});

	it("vermerkt den Erfolg in den Zugangsdaten", async () => {
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
		await syncSchritt(repos(), psnMit(20).psn);

		const anzeige = await repos().credentials.anzeige();
		expect(anzeige.status).toBe("ok");
		expect(anzeige.letzterErfolgAm).not.toBeNull();
	});
});
