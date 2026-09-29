import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";
import { Geheimnis } from "../src/domain/secret";

/**
 * Die Zeitreihe der Zugaenge (Stufe 19e, Migration 0026).
 *
 * Hier lauert der Fehler, den das Projekt schon zweimal hatte: zwei
 * Wahrheiten, die auseinanderlaufen koennen. `psn_credentials.status` und
 * `psn_zugang` muessen dasselbe erzaehlen, sonst steht in den Einstellungen
 * eine Lebensdauer, die es nie gab.
 *
 * Die Werte sind erfunden - ein echtes NPSSO kommt nicht ins Repository.
 */
const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const erfundenesNpsso = (zeichen: string) => new Geheimnis(zeichen.repeat(64).slice(0, 64));

async function zeilen() {
	const { results } = await env.DB.prepare(
		"SELECT id, angekuendigt_bis, letzter_erfolg_am, gestorben_am, ersetzt_am FROM psn_zugang ORDER BY id",
	).all<{ id: number; angekuendigt_bis: string | null; letzter_erfolg_am: string | null; gestorben_am: string | null; ersetzt_am: string | null }>();
	return results;
}

describe("Zugang: Lebensdauer aufzeichnen", () => {
	beforeEach(async () => {
		await env.DB.batch([
			env.DB.prepare("DELETE FROM psn_zugang"),
			env.DB.prepare("DELETE FROM psn_credentials"),
		]);
	});

	it("legt je NPSSO eine Zeile an und merkt sich Sonys Ankuendigung", async () => {
		await repos().credentials.npssoSpeichern(erfundenesNpsso("a"), "2026-11-28T11:42:06.000Z");
		expect(await zeilen()).toEqual([
			expect.objectContaining({ angekuendigt_bis: "2026-11-28T11:42:06.000Z", gestorben_am: null, ersetzt_am: null }),
		]);
		expect((await repos().credentials.anzeige()).npssoLaeuftAbUm).toBe("2026-11-28T11:42:06.000Z");
	});

	it("bleibt ohne Ankuendigung, wenn nur der blanke Wert eingefuegt wurde", async () => {
		await repos().credentials.npssoSpeichern(erfundenesNpsso("b"));
		expect((await zeilen())[0].angekuendigt_bis).toBeNull();
	});

	it("stempelt 'gestorben', wenn PSN den Zugang ablehnt", async () => {
		await repos().credentials.npssoSpeichern(erfundenesNpsso("c"));
		await repos().credentials.statusSetzen("abgelaufen");
		const [z] = await zeilen();
		expect(z.gestorben_am).toEqual(expect.any(String));
		expect(z.ersetzt_am).toBeNull();
	});

	it("stempelt bei 'fehler' NICHT - ein Fehlversuch ist kein Lebensende", async () => {
		await repos().credentials.npssoSpeichern(erfundenesNpsso("d"));
		await repos().credentials.statusSetzen("fehler");
		expect((await zeilen())[0].gestorben_am).toBeNull();
	});

	it("schliesst den Vorgaenger als 'ersetzt', wenn frueh erneuert wird", async () => {
		await repos().credentials.npssoSpeichern(erfundenesNpsso("e"));
		await repos().credentials.npssoSpeichern(erfundenesNpsso("f"));
		const alle = await zeilen();
		expect(alle).toHaveLength(2);
		// Nur der erste ist geschlossen, und zwar als ersetzt: Wie lange er
		// gehalten haette, weiss niemand - er zaehlt nicht als Messung.
		expect(alle[0].ersetzt_am).toEqual(expect.any(String));
		expect(alle[0].gestorben_am).toBeNull();
		expect(alle[1].ersetzt_am).toBeNull();
	});

	it("laesst einen gestorbenen Zugang in Ruhe, wenn danach ein neuer kommt", async () => {
		await repos().credentials.npssoSpeichern(erfundenesNpsso("g"));
		await repos().credentials.statusSetzen("abgelaufen");
		const gestorbenAm = (await zeilen())[0].gestorben_am;

		await repos().credentials.npssoSpeichern(erfundenesNpsso("h"));
		const alle = await zeilen();
		// Der Todeszeitpunkt bleibt stehen, und 'ersetzt' kommt nicht dazu -
		// sonst zaehlte dieselbe Zeile zweimal oder gar nicht.
		expect(alle[0].gestorben_am).toBe(gestorbenAm);
		expect(alle[0].ersetzt_am).toBeNull();
		expect(alle).toHaveLength(2);
	});

	it("haelt am offenen Zugang fest, bis wann er nachweislich lief", async () => {
		await repos().credentials.npssoSpeichern(erfundenesNpsso("i"));
		await repos().credentials.erfolgVermerken();
		expect((await zeilen())[0].letzter_erfolg_am).toEqual(expect.any(String));

		// Ein Erfolg nach dem Ende faellt nicht mehr auf den alten Zugang.
		await repos().credentials.statusSetzen("abgelaufen");
		const vorher = (await zeilen())[0].letzter_erfolg_am;
		await repos().credentials.npssoSpeichern(erfundenesNpsso("j"));
		await repos().credentials.erfolgVermerken();
		const alle = await zeilen();
		expect(alle[0].letzter_erfolg_am).toBe(vorher);
		expect(alle[1].letzter_erfolg_am).toEqual(expect.any(String));
	});
});
