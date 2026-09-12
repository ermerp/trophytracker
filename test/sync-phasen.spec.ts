import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";
import { Geheimnis } from "../src/domain/secret";
import { erstellePsnClient } from "../src/psn/client";
import { normalisierungWiederholen, syncSchritt } from "../src/sync/run";
import { TOKEN_ANTWORT, fakeFetch, jsonAntwort, redirectAntwort } from "./psn-fake";
import { fakeSeite, fakeTitel } from "./trophy-fixtures";

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const GESAMT = 250; // drei Seiten a 100

async function leeren() {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM trophy_progress"),
		env.DB.prepare("DELETE FROM psn_raw_response"),
		env.DB.prepare("DELETE FROM psn_sync_run"),
		env.DB.prepare("DELETE FROM psn_credentials"),
	]);
}

function psn() {
	const { fetch, aufrufe } = fakeFetch([
		[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
		[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
		[
			/trophyTitles/,
			() => {
				const offset = Number(
					new URL(aufrufe[aufrufe.length - 1].url).searchParams.get("offset") ?? 0,
				);
				const anzahl = Math.max(0, Math.min(100, GESAMT - offset));
				return new Response(
					fakeSeite(
						Array.from({ length: anzahl }, (_, i) => fakeTitel(offset + i)),
						GESAMT,
						offset,
					),
				);
			},
		],
	]);
	return { client: erstellePsnClient(fetch), aufrufe };
}

/** Ruft syncSchritt, bis nichts mehr offen ist. Gibt alle Ergebnisse zurueck. */
async function bisFertig(max = 30) {
	const schritte = [];
	for (let i = 0; i < max; i++) {
		const e = await syncSchritt(repos(), psn().client);
		schritte.push(e);
		if (!e.weiter) break;
	}
	return schritte;
}

beforeEach(async () => {
	await leeren();
	await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
});

describe("Phasenwechsel", () => {
	it("geht vom Abruf in die Normalisierung und dann auf Erfolg", async () => {
		const schritte = await bisFertig();

		expect(schritte[0].phase).toBe("abruf");
		expect(schritte.some((s) => s.phase === "normalisierung")).toBe(true);
		expect(schritte.at(-1)).toMatchObject({ status: "erfolg", weiter: false });
	});

	it("normalisiert erst, wenn alle Seiten geholt sind", async () => {
		// Erster Schritt holt Seite 1 - es darf noch nichts geschrieben sein.
		await syncSchritt(repos(), psn().client);
		expect(await repos().trophies.anzahl()).toBe(0);
	});

	it("schreibt am Ende alle Titel", async () => {
		await bisFertig();
		expect(await repos().trophies.anzahl()).toBe(GESAMT);
	});

	it("verarbeitet eine Rohantwort je Aufruf", async () => {
		const schritte = await bisFertig();
		const norm = schritte.filter((s) => s.phase === "normalisierung" && s.titelGeschrieben);

		expect(norm).toHaveLength(3);
		expect(norm.map((s) => s.titelGeschrieben)).toEqual([100, 100, 50]);
	});

	it("markiert jede Rohantwort als verarbeitet", async () => {
		await bisFertig();
		const offen = await env.DB.prepare(
			"SELECT COUNT(*) AS n FROM psn_raw_response WHERE normalized_at IS NULL",
		).first<{ n: number }>();
		expect(offen?.n).toBe(0);
	});
});

describe("normalisierungWiederholen", () => {
	it("laeuft ohne PSN-Zugriff und liefert dasselbe Ergebnis", async () => {
		await bisFertig();
		const vorher = await repos().trophies.anzahl();

		const wiederholung = await normalisierungWiederholen(repos());
		expect(wiederholung).toMatchObject({ seiten: 3 });

		// Ab hier darf kein einziger PSN-Aufruf mehr passieren.
		const { client, aufrufe } = psn();
		for (let i = 0; i < 10; i++) {
			const e = await syncSchritt(repos(), client);
			if (!e.weiter) break;
		}

		expect(aufrufe).toHaveLength(0);
		expect(await repos().trophies.anzahl()).toBe(vorher);
	});

	it("erzeugt keine Dubletten", async () => {
		await bisFertig();
		await normalisierungWiederholen(repos());
		await bisFertig();

		const zeile = await env.DB.prepare(
			"SELECT COUNT(*) AS gesamt, COUNT(DISTINCT np_communication_id) AS eindeutig FROM trophy_progress",
		).first<{ gesamt: number; eindeutig: number }>();

		expect(zeile?.gesamt).toBe(GESAMT);
		expect(zeile?.eindeutig).toBe(GESAMT);
	});

	it("meldet null, wenn es keinen abgeschlossenen Lauf gibt", async () => {
		expect(await normalisierungWiederholen(repos())).toBeNull();
	});
});
