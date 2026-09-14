import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { EXPORT_TABELLEN, NICHT_EXPORTIERT } from "../src/db/export";
import { BOM } from "../src/domain/csv";

/**
 * Export- und Backup-Routen (Abschnitt 14).
 *
 * Der wichtigste Fall steht ganz oben: Die Tabellenliste in backup.json muss
 * vollstaendig sein. Eine Tabelle, die eine kuenftige Migration anlegt und
 * die niemand in EXPORT_TABELLEN eintraegt, faehrt sonst jahrelang
 * ungesichert mit - und faellt erst beim Wiederherstellen auf.
 */

const B = "https://example.com";
const hole = (pfad: string) => SELF.fetch(`${B}${pfad}`);
const sende = (pfad: string, koerper: unknown) =>
	SELF.fetch(`${B}${pfad}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: typeof koerper === "string" ? koerper : JSON.stringify(koerper),
	});

async function leeren() {
	await env.DB.batch(
		[
			"review_queue",
			"play_status",
			"physical_copy",
			"digital_entitlement",
			"plan_entry",
			"trophy_progress",
			"release",
			"game",
		].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
	);
	await env.DB.prepare("DELETE FROM app_setting WHERE key LIKE 'backup_%'").run();
}

/** Ein Spiel mit Release, Trophaeenliste, Besitz und Bewertung. */
async function bestand(titel = "God of War Ragnarök") {
	await env.DB.batch([
		env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (1, ?, 'god of war ragnarok')").bind(titel),
		env.DB.prepare("INSERT INTO release (id, game_id, platform, physical_release_status) VALUES (1, 1, 'PS5', 'unbekannt')"),
		env.DB.prepare(
			"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, " +
				"defined_bronze, defined_silver, defined_gold, defined_platinum, " +
				"earned_bronze, earned_silver, earned_gold, earned_platinum, " +
				"progress_pct, last_played_at, synced_at, release_id) " +
				"VALUES ('NPWR1', 'trophy', ?, 'PS5', 20, 5, 3, 1, 20, 5, 3, 1, 100, '2025-03-01T10:00:00Z', '2026-01-01', 1)",
		).bind(titel),
		env.DB.prepare("INSERT INTO play_status (release_id, status, rating) VALUES (1, 'komplettiert', 9)"),
		env.DB.prepare("INSERT INTO physical_copy (release_id) VALUES (1)"),
		env.DB.prepare("INSERT INTO digital_entitlement (release_id, source) VALUES (1, 'plus')"),
	]);
}

beforeEach(leeren);

describe("GET /api/export/backup.json", () => {
	it("kennt jede Tabelle der Datenbank - entweder exportiert oder bewusst ausgenommen", async () => {
		const { results } = await env.DB.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' " +
				"AND name NOT LIKE '_cf_%' ORDER BY name",
		).all<{ name: string }>();

		const bekannt = new Set<string>([...EXPORT_TABELLEN, ...NICHT_EXPORTIERT]);
		const unbekannt = results.map((z) => z.name).filter((n) => !bekannt.has(n));
		expect(unbekannt, "neue Tabelle weder in EXPORT_TABELLEN noch in NICHT_EXPORTIERT").toEqual([]);
	});

	it("liefert alle 14 Fachtabellen", async () => {
		const antwort = await hole("/api/export/backup.json");
		expect(antwort.status).toBe(200);
		const daten = (await antwort.json()) as { tabellen: Record<string, unknown[]> };
		expect(Object.keys(daten.tabellen).sort()).toEqual([...EXPORT_TABELLEN].sort());
	});

	it("enthaelt weder Zugangsdaten noch Rohantworten", async () => {
		const text = await (await hole("/api/export/backup.json")).text();
		expect(text).not.toContain("psn_credentials");
		expect(text).not.toContain("psn_raw_response");
		expect(text).not.toContain("npsso_ciphertext");
		expect(text).not.toContain("payload");
	});

	it("nennt Zeitpunkt und Schemastand und wird als Datei angeboten", async () => {
		const antwort = await hole("/api/export/backup.json");
		expect(antwort.headers.get("content-disposition")).toContain("attachment");
		const daten = (await antwort.json()) as { exportiertAm: string; schemaVersion: string | null };
		expect(Date.parse(daten.exportiertAm)).not.toBeNaN();
		expect(daten.schemaVersion).toMatch(/^\d{4}_/);
	});

	it("gibt die Zeilen der Fachtabellen tatsaechlich heraus", async () => {
		await bestand();
		const daten = (await (await hole("/api/export/backup.json")).json()) as {
			tabellen: Record<string, Record<string, unknown>[]>;
		};
		expect(daten.tabellen.game).toHaveLength(1);
		expect(daten.tabellen.game[0]).toMatchObject({ title: "God of War Ragnarök" });
		expect(daten.tabellen.trophy_progress[0]).toMatchObject({ np_communication_id: "NPWR1" });
	});
});

describe("GET /api/export/:liste.csv", () => {
	it("kennt alle sieben Listen", async () => {
		for (const liste of ["sammlung", "wunsch", "todo", "backlog", "kauf", "luecken", "trophaeen"]) {
			const antwort = await hole(`/api/export/${liste}.csv`);
			expect(antwort.status, liste).toBe(200);
			expect(antwort.headers.get("content-type")).toBe("text/csv; charset=utf-8");
			expect(antwort.headers.get("content-disposition")).toContain(`${liste}.csv`);
		}
	});

	it("antwortet auf eine unbekannte Liste mit 404", async () => {
		expect((await hole("/api/export/quatsch.csv")).status).toBe(404);
		expect((await hole("/api/export/quatsch")).status).toBe(404);
	});

	// Auf den Bytes geprueft, nicht auf dem Text: Response.text() dekodiert
	// als UTF-8 und schluckt die BOM dabei. Excel sieht die Bytes.
	it("beginnt mit der BOM - sonst liest Excel Windows-1252", async () => {
		const bytes = new Uint8Array(await (await hole("/api/export/sammlung.csv")).arrayBuffer());
		expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
		expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).startsWith(BOM)).toBe(true);
	});

	it("schreibt die deutsche Kopfzeile", async () => {
		const text = await (await hole("/api/export/sammlung.csv")).text();
		expect(text.split("\r\n")[0]).toBe(
			"Titel;Plattform;Disc-Fassung;Exemplare;Digital;Fortschritt %;Platin;Status;Bewertung;Zuletzt gespielt",
		);
	});

	it("traegt Umlaute, Besitz, Status und dreiwertige Werte", async () => {
		await bestand();
		const text = await (await hole("/api/export/sammlung.csv")).text();
		const zeile = text.split("\r\n")[1];
		expect(zeile).toBe(
			"God of War Ragnarök;PS5;unbekannt;1;PS Plus;100;erspielt;komplettiert;9;2025-03-01T10:00:00Z",
		);
	});

	it("maskiert ein Semikolon im Titel", async () => {
		await bestand("Ratchet & Clank; Nexus");
		const text = await (await hole("/api/export/sammlung.csv")).text();
		expect(text.split("\r\n")[1]).toContain('"Ratchet & Clank; Nexus"');
	});

	it("schreibt fehlende Werte leer, nie als 0", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (2, 'Ohne Liste', 'ohne liste')"),
			env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (2, 2, 'PS3')"),
		]);
		const text = await (await hole("/api/export/sammlung.csv")).text();
		expect(text.split("\r\n")[1]).toBe("Ohne Liste;PS3;unbekannt;0;;;;;;");
	});

	it("gibt die Trophaeenliste mit Zuordnungskennzeichen aus", async () => {
		await bestand();
		const text = await (await hole("/api/export/trophaeen.csv")).text();
		const [kopf, zeile] = text.split("\r\n");
		expect(kopf.endsWith("Zuletzt gespielt;Zugeordnet")).toBe(true);
		expect(zeile).toBe(
			"God of War Ragnarök;PS5;God of War Ragnarök;100;20;20;5;5;3;3;1;1;2025-03-01T10:00:00Z;ja",
		);
	});
});

describe("Backup-Vermerk", () => {
	it("meldet zunaechst, dass nie gesichert wurde", async () => {
		const daten = await (await hole("/api/backup/status")).json();
		expect(daten).toEqual({ letzterErfolgAm: null, letzterCommit: null, tageSeit: null });
	});

	it("speichert Zeitpunkt und Commit und rechnet das Alter aus", async () => {
		const vorTagen = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
		const antwort = await sende("/api/backup/vermerk", { zeitpunkt: vorTagen, commit: "abc1234" });
		expect(antwort.status).toBe(200);

		const daten = (await (await hole("/api/backup/status")).json()) as { tageSeit: number };
		expect(daten).toMatchObject({ letzterErfolgAm: vorTagen, letzterCommit: "abc1234" });
		expect(daten.tageSeit).toBe(3);
	});

	it("nimmt einen Lauf ohne Commit an und behaelt den vorigen Hash", async () => {
		await sende("/api/backup/vermerk", { zeitpunkt: "2026-09-01T03:17:00Z", commit: "abc1234" });
		await sende("/api/backup/vermerk", { zeitpunkt: "2026-09-08T03:17:00Z" });

		const daten = await (await hole("/api/backup/status")).json();
		expect(daten).toMatchObject({
			letzterErfolgAm: "2026-09-08T03:17:00Z",
			letzterCommit: "abc1234",
		});
	});

	it("weist einen unbrauchbaren Zeitpunkt ab", async () => {
		expect((await sende("/api/backup/vermerk", { zeitpunkt: "vorgestern" })).status).toBe(400);
		expect((await sende("/api/backup/vermerk", {})).status).toBe(400);
		expect((await sende("/api/backup/vermerk", "kaputt")).status).toBe(400);
	});

	it("landet in app_setting und damit im Export", async () => {
		await sende("/api/backup/vermerk", { zeitpunkt: "2026-09-14T03:17:00Z", commit: "deadbee" });
		const daten = (await (await hole("/api/export/backup.json")).json()) as {
			tabellen: { app_setting: Array<{ key: string; value: string }> };
		};
		expect(daten.tabellen.app_setting).toContainEqual({
			key: "backup_letzter_erfolg_am",
			value: "2026-09-14T03:17:00Z",
		});
	});
});
