import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";
import { normalisiereSeite } from "../src/domain/normalize";
import { fakeSeite, fakeTitel } from "./trophy-fixtures";

/**
 * Aenderungsprotokoll (Abschnitt 8.5, Stufe 16) gegen die lokale D1.
 *
 * Geprueft wird, was Logik ist: Jeder Schreibpfad hinterlaesst genau ein
 * Ereignis mit Quelle und alt → neu, ein unveraenderter Wert keines, die
 * set-basierten Schreiber des Syncs protokollieren nur beim ersten Mal, und
 * das Protokoll ueberlebt das Loeschen von Spiel und Release.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const B = "https://example.com";

async function leeren() {
	await env.DB.batch(
		["game_event", "review_queue", "play_status", "plan_entry", "physical_copy", "digital_entitlement", "trophy_progress", "release", "game"].map(
			(t) => env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
}

async function release(id: number, pct: number | null = null, titel = `Spiel ${id}`): Promise<number> {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)").bind(id, titel, `spiel ${id}`).run();
	await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (?, ?, 'PS4')").bind(id, id).run();
	if (pct !== null) {
		await env.DB.prepare(
			"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, " +
				"progress_pct, defined_bronze, earned_bronze, defined_platinum, earned_platinum, synced_at, release_id) " +
				"VALUES (?, 'trophy', ?, 'PS4', ?, 10, ?, 1, ?, '2026-01-01', ?)",
		)
			.bind(`NPWR${id}`, titel, pct, Math.round(pct / 10), pct >= 100 ? 1 : 0, id)
			.run();
	}
	return id;
}

type Zeile = {
	source: string;
	game_id: number | null;
	release_id: number | null;
	label: string;
	kind: string;
	field: string | null;
	old_value: string | null;
	new_value: string | null;
	detail: string | null;
};

async function ereignisse(kind?: string): Promise<Zeile[]> {
	const { results } = await env.DB.prepare(
		"SELECT source, game_id, release_id, label, kind, field, old_value, new_value, detail FROM game_event " +
			"WHERE (? IS NULL OR kind = ?) ORDER BY id",
	)
		.bind(kind ?? null, kind ?? null)
		.all<Zeile>();
	return results;
}

beforeEach(leeren);

describe("Bewertung (nutzer)", () => {
	it("Status setzen schreibt ein Ereignis mit alt → neu, derselbe Wert keines", async () => {
		await release(1);
		await repos().playStatus.setzen(1, { status: "am_spielen" });
		await repos().playStatus.setzen(1, { status: "am_spielen" });
		await repos().playStatus.statusSetzen(1, "durchgespielt");

		const e = await ereignisse("status_geaendert");
		expect(e).toHaveLength(2);
		expect(e[0]).toMatchObject({ source: "nutzer", game_id: 1, release_id: 1, label: "Spiel 1 (PS4)", old_value: null, new_value: "am_spielen" });
		expect(e[1]).toMatchObject({ old_value: "am_spielen", new_value: "durchgespielt" });
	});

	it("jedes geaenderte Bewertungsfeld ist ein eigenes Ereignis", async () => {
		await release(1);
		await repos().playStatus.setzen(1, { status: "am_spielen", rating: 7 });
		await repos().playStatus.setzen(1, { status: "am_spielen", rating: 9, notes: "gut" });

		const e = await ereignisse("bewertung_geaendert");
		expect(e.map((z) => [z.field, z.old_value, z.new_value])).toEqual([
			["rating", null, "7"],
			["rating", "7", "9"],
			["notes", null, "gut"],
		]);
	});
});

describe("Sync (set-basiert, nur beim ersten Mal)", () => {
	it("vorbelegen protokolliert je vorbelegtem Release eines, ein zweiter Lauf keines", async () => {
		await release(1, 100);
		await release(2, 45);
		await release(3, 0);

		expect(await repos().playStatus.vorbelegen()).toBe(2);
		expect(await repos().playStatus.vorbelegen()).toBe(0);

		const e = await ereignisse("status_vorbelegt");
		expect(e).toHaveLength(2);
		expect(e[0]).toMatchObject({ source: "sync", release_id: 1, old_value: null, new_value: "komplettiert" });
		expect(e[1]).toMatchObject({ source: "sync", release_id: 2, new_value: "am_spielen" });
	});

	it("einreihen protokolliert neue_trophaeen einmal, nicht bei jedem Sync erneut", async () => {
		await release(1, 40);
		await env.DB.prepare("INSERT INTO play_status (release_id, status) VALUES (1, 'pausiert')").run();
		await env.DB.prepare(
			"UPDATE trophy_progress SET reviewed_at = '2026-01-01', reviewed_earned_total = 2, reviewed_defined_total = 11, reviewed_progress_pct = 20",
		).run();

		await repos().review.einreihen();
		await repos().review.einreihen();

		const e = await ereignisse("pruefliste_eingereiht");
		expect(e).toHaveLength(1);
		expect(e[0]).toMatchObject({ source: "sync", release_id: 1, field: "neue_trophaeen", detail: "20 % → 40 %, 2 neue Trophäen erspielt" });
	});

	it("eine erstmals gesehene Liste ist ein Ereignis ohne Spiel, die Zuordnung ein zweites", async () => {
		const { titel } = normalisiereSeite(fakeSeite([fakeTitel(1), fakeTitel(2)]));
		await repos().trophies.upsertSeite(titel);
		await repos().trophies.upsertSeite(titel);

		const neu = await ereignisse("liste_neu");
		expect(neu).toHaveLength(2);
		expect(neu[0]).toMatchObject({ source: "sync", game_id: null, release_id: null, label: "Testspiel 1 (PS4)", detail: "NPWR00001_00" });

		await release(7);
		await repos().games.listeZuordnen("NPWR00001_00", 7, "automatisch");
		await repos().games.listeZuordnen("NPWR00001_00", 7, "automatisch");
		const zu = await ereignisse("zugeordnet");
		expect(zu).toHaveLength(1);
		expect(zu[0]).toMatchObject({ source: "sync", game_id: 7, release_id: 7, new_value: "automatisch", detail: "Testspiel 1" });
	});
});

describe("Besitz und Listen", () => {
	it("Disc erfassen protokolliert Exemplar, Disc-Fassung und den erledigten Wunsch", async () => {
		await release(1);
		await repos().plan.anlegen("wunsch", { releaseId: 1 }, "manuell");

		const antwort = await SELF.fetch(`${B}/api/physical-copies`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ releaseId: 1, zustand: "gut" }),
		});
		expect(antwort.status).toBe(201);

		expect((await ereignisse()).map((z) => [z.kind, z.source, z.field, z.new_value, z.detail])).toEqual([
			["liste_eintrag_angelegt", "nutzer", "wunsch", "offen", "manuell"],
			["exemplar_angelegt", "nutzer", null, "gut", null],
			["release_geaendert", "nutzer", "physical_release_status", "ja", "durch Erfassen"],
			["liste_eintrag_erledigt", "nutzer", "wunsch", null, "besitz"],
		]);
	});

	it("die Kopplung protokolliert Umhaengen und Schliessen mit Anlass", async () => {
		await release(1);
		await repos().plan.anlegen("backlog", { releaseId: 1 }, "manuell");
		await repos().kopplung.eintragSicherstellen(1, "todo", "manuell");
		await repos().kopplung.eintraegeSchliessen(1);

		const e = await ereignisse();
		expect(e.map((z) => [z.kind, z.field, z.old_value, z.new_value, z.detail])).toEqual([
			["liste_eintrag_angelegt", "backlog", null, "offen", "manuell"],
			["liste_eintrag_geaendert", "kind", "backlog", "todo", "kopplung"],
			["liste_eintrag_erledigt", "todo", null, null, "kopplung"],
		]);
	});

	it("ein Wunsch ohne Spiel traegt den rohen Titel als Label", async () => {
		const id = await repos().plan.anlegen("wunsch", { titleRaw: "Unbekanntes Spiel" }, "import");
		await repos().plan.loeschen(id);
		const e = await ereignisse();
		expect(e[0]).toMatchObject({ source: "import", game_id: null, release_id: null, label: "Unbekanntes Spiel" });
		expect(e[1]).toMatchObject({ kind: "liste_eintrag_geloescht", label: "Unbekanntes Spiel" });
	});
});

describe("Loeschen", () => {
	it("Spiel loeschen laesst die Ereignisse stehen - ohne Spiel-Id, mit Label", async () => {
		await release(1, 45, "Ratchet & Clank");
		await repos().playStatus.setzen(1, { status: "am_spielen" });
		await repos().games.spielLoeschen(1);

		const e = await ereignisse();
		expect(e.map((z) => z.kind)).toEqual(["status_geaendert", "zuordnung_geloest", "spiel_geloescht"]);
		for (const z of e) {
			expect(z.game_id).toBeNull();
			expect(z.release_id).toBeNull();
			expect(z.label).toContain("Ratchet & Clank");
		}
	});

	it("Release loeschen protokolliert Freigabe und Loeschung vor dem DELETE", async () => {
		await release(1, 45);
		await repos().games.releaseLoeschen(1);
		const e = await ereignisse();
		expect(e.map((z) => [z.kind, z.label])).toEqual([
			["zuordnung_geloest", "Spiel 1 (PS4)"],
			["release_geloescht", "Spiel 1 (PS4)"],
			["spiel_geloescht", "Spiel 1"],
		]);
	});
});

describe("Lesen", () => {
	it("GET /api/games/:id/events liefert den Verlauf neueste zuerst, seitenweise ueber vor", async () => {
		await release(1);
		for (const s of ["am_spielen", "pausiert", "durchgespielt"] as const) await repos().playStatus.statusSetzen(1, s);

		const erste = (await (await SELF.fetch(`${B}/api/games/1/events?limit=2`)).json()) as {
			weiter: boolean;
			ereignisse: Array<{ id: number; text: string; quelle: string }>;
		};
		expect(erste.weiter).toBe(true);
		expect(erste.ereignisse.map((e) => e.text)).toEqual(["Status: pausiert → durchgespielt", "Status: am Spielen → pausiert"]);

		const zweite = (await (await SELF.fetch(`${B}/api/games/1/events?limit=2&vor=${erste.ereignisse[1].id}`)).json()) as typeof erste;
		expect(zweite.weiter).toBe(false);
		expect(zweite.ereignisse.map((e) => e.text)).toEqual(["Status: leer → am Spielen"]);

		expect((await SELF.fetch(`${B}/api/games/999/events`)).status).toBe(404);
	});

	it("GET /api/events filtert nach Quelle", async () => {
		await release(1, 45);
		await repos().playStatus.vorbelegen();
		await repos().playStatus.statusSetzen(1, "pausiert");

		const alle = (await (await SELF.fetch(`${B}/api/events`)).json()) as { ereignisse: Array<{ quelle: string }> };
		expect(alle.ereignisse.map((e) => e.quelle)).toEqual(["nutzer", "sync"]);
		const sync = (await (await SELF.fetch(`${B}/api/events?quelle=sync`)).json()) as typeof alle;
		expect(sync.ereignisse.map((e) => e.quelle)).toEqual(["sync"]);
	});
});
