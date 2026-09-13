import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);

async function leeren() {
	await env.DB.batch(
		["physical_copy", "digital_entitlement", "trophy_progress", "release", "game"].map((t) =>
			env.DB.prepare(`DELETE FROM ${t}`),
		),
	);
}

/** Spiel mit einem Release; gibt die release_id zurueck. */
async function release(
	id: number,
	optionen: { physisch?: "ja" | "nein" | "unbekannt"; quelle?: string | null } = {},
): Promise<number> {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)")
		.bind(id, `Spiel ${id}`, `spiel ${id}`)
		.run();
	await env.DB.prepare(
		"INSERT INTO release (id, game_id, platform, physical_release_status, physical_source) " +
			"VALUES (?, ?, 'PS4', ?, ?)",
	)
		.bind(id, id, optionen.physisch ?? "unbekannt", optionen.quelle ?? null)
		.run();
	return id;
}

async function releaseZeile(id: number) {
	return env.DB.prepare(
		"SELECT physical_release_status AS status, physical_source AS quelle, " +
			"physical_release_region AS region, physical_checked_at AS geprueft FROM release WHERE id = ?",
	)
		.bind(id)
		.first<{ status: string; quelle: string | null; region: string | null; geprueft: string | null }>();
}

beforeEach(leeren);

describe("addPhysicalCopy", () => {
	it("legt ein Exemplar mit Standardwerten an", async () => {
		const r = await release(1);
		const { id } = await repos().ownership.addPhysicalCopy(r);

		const z = await env.DB.prepare("SELECT * FROM physical_copy WHERE id = ?").bind(id).first();
		expect(z).toMatchObject({
			release_id: r,
			ean: null,
			condition: null,
			has_manual: 0,
			purchase_price_cents: null,
		});
	});

	it("uebernimmt alle Felder", async () => {
		const r = await release(1);
		const { id } = await repos().ownership.addPhysicalCopy(r, {
			ean: "0711719512905",
			condition: "sehr gut",
			hasManual: true,
			purchaseDate: "2024-05-01",
			purchasePriceCents: 1999,
			notes: "Flohmarkt",
		});

		const z = await env.DB.prepare("SELECT * FROM physical_copy WHERE id = ?").bind(id).first();
		expect(z).toMatchObject({
			ean: "0711719512905",
			condition: "sehr gut",
			has_manual: 1,
			purchase_date: "2024-05-01",
			purchase_price_cents: 1999,
			notes: "Flohmarkt",
		});
	});

	describe("Disc-Fassung (Abschnitt 3)", () => {
		it("setzt 'unbekannt' auf 'ja' mit Quelle 'manuell', Region bleibt NULL", async () => {
			const r = await release(1, { physisch: "unbekannt" });
			const ergebnis = await repos().ownership.addPhysicalCopy(r);

			expect(ergebnis.physischStatusGesetzt).toBe(true);
			const z = await releaseZeile(r);
			expect(z).toMatchObject({ status: "ja", quelle: "manuell", region: null });
			expect(z?.geprueft).not.toBeNull();
		});

		it("laesst ein 'nein' des Nutzers stehen", async () => {
			const r = await release(1, { physisch: "nein", quelle: "manuell" });
			const ergebnis = await repos().ownership.addPhysicalCopy(r);

			expect(ergebnis.physischStatusGesetzt).toBe(false);
			expect(await releaseZeile(r)).toMatchObject({ status: "nein", quelle: "manuell" });
		});

		it("ueberschreibt ein 'ja' aus dem Feed nicht", async () => {
			const r = await release(1, { physisch: "ja", quelle: "feed" });
			const ergebnis = await repos().ownership.addPhysicalCopy(r);

			expect(ergebnis.physischStatusGesetzt).toBe(false);
			expect(await releaseZeile(r)).toMatchObject({ status: "ja", quelle: "feed" });
		});

		it("setzt beim Loeschen nichts zurueck", async () => {
			const r = await release(1);
			const { id } = await repos().ownership.addPhysicalCopy(r);
			expect(await repos().ownership.deletePhysicalCopy(id)).toBe(true);

			expect(await releaseZeile(r)).toMatchObject({ status: "ja", quelle: "manuell" });
		});
	});
});

describe("updatePhysicalCopy", () => {
	it("aendert nur die uebergebenen Felder", async () => {
		const r = await release(1);
		const { id } = await repos().ownership.addPhysicalCopy(r, {
			condition: "gut",
			purchasePriceCents: 500,
		});

		expect(await repos().ownership.updatePhysicalCopy(id, { condition: "neu" })).toBe(true);

		const z = await env.DB.prepare("SELECT condition, purchase_price_cents FROM physical_copy WHERE id = ?")
			.bind(id)
			.first();
		expect(z).toEqual({ condition: "neu", purchase_price_cents: 500 });
	});

	it("kann ein Feld mit null leeren", async () => {
		const r = await release(1);
		const { id } = await repos().ownership.addPhysicalCopy(r, { notes: "x" });
		await repos().ownership.updatePhysicalCopy(id, { notes: null });

		const z = await env.DB.prepare("SELECT notes FROM physical_copy WHERE id = ?").bind(id).first();
		expect(z).toEqual({ notes: null });
	});

	it("meldet ein unbekanntes Exemplar", async () => {
		expect(await repos().ownership.updatePhysicalCopy(999, { condition: "neu" })).toBe(false);
		expect(await repos().ownership.updatePhysicalCopy(999, {})).toBe(false);
	});
});

describe("digital_entitlement", () => {
	it("legt eine Berechtigung an und lehnt dieselbe Quelle ein zweites Mal ab", async () => {
		const r = await release(1);
		const erste = await repos().ownership.addDigitalEntitlement(r, "kauf", "2023-01-05");
		expect(erste).not.toBeNull();

		expect(await repos().ownership.addDigitalEntitlement(r, "kauf")).toBeNull();
		expect(await repos().ownership.addDigitalEntitlement(r, "plus")).not.toBeNull();
	});

	it("fasst die Disc-Fassung nicht an", async () => {
		const r = await release(1);
		await repos().ownership.addDigitalEntitlement(r, "kauf");
		expect(await releaseZeile(r)).toMatchObject({ status: "unbekannt", quelle: null });
	});

	it("loescht", async () => {
		const r = await release(1);
		const e = await repos().ownership.addDigitalEntitlement(r, "trial");
		expect(await repos().ownership.deleteDigitalEntitlement(e!.id)).toBe(true);
		expect(await repos().ownership.deleteDigitalEntitlement(e!.id)).toBe(false);
	});
});

describe("copiesForGame", () => {
	it("liefert Exemplare und Berechtigungen aller Releases des Spiels", async () => {
		const r1 = await release(1);
		await env.DB.prepare("INSERT INTO release (id, game_id, platform) VALUES (2, 1, 'PS5')").run();
		const fremd = await release(3);

		await repos().ownership.addPhysicalCopy(r1);
		await repos().ownership.addPhysicalCopy(2);
		await repos().ownership.addDigitalEntitlement(2, "plus");
		await repos().ownership.addPhysicalCopy(fremd);

		const b = await repos().ownership.copiesForGame(1);
		expect(b.exemplare.map((e) => e.release_id)).toEqual([1, 2]);
		expect(b.digital.map((d) => d.release_id)).toEqual([2]);
	});
});

describe("listPhysicalCopies", () => {
	it("joint Titel und Plattform und blaettert", async () => {
		const r = await release(1);
		await repos().ownership.addPhysicalCopy(r);
		await repos().ownership.addPhysicalCopy(r);

		const l = await repos().ownership.listPhysicalCopies(1, 1);
		expect(l.gesamt).toBe(2);
		expect(l.zeilen).toHaveLength(1);
		expect(l.zeilen[0]).toMatchObject({ title: "Spiel 1", platform: "PS4" });
	});
});
