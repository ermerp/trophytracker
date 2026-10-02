import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { titelSchluessel } from "../src/domain/titel";
import { erstelleIgdbClient } from "../src/igdb/client";
import { FREMDANFRAGEN_HOECHSTENS, storeSchritt } from "../src/sync/store";
import { conceptSeite, fakeStore, htmlAntwort, produktSeite } from "./store-fake";

/**
 * Store-Preise: Auswahl, Aufloesung und Schreibpfad (7.4, Stufe 21).
 *
 * Geprueft wird vor allem, was NICHT passiert: kein Preis fuer dauerhaft
 * Gekauftes, kein Stempel nach einer unlesbaren Seite, kein Verlaufseintrag
 * bei unveraendertem Preis und kein Ereignis, wenn die Produkt-Id gleich
 * bleibt.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);

/** Ein Spiel mit einem Release. Ohne Absicht taucht es im Zuschnitt nicht auf. */
async function spiel(
	id: number,
	titel: string,
	optionen: { plattform?: string; conceptId?: string | null; produktId?: string | null; disc?: string; igdbId?: number } = {},
) {
	await env.DB.prepare("INSERT INTO game (id, title, sort_title, igdb_id, store_concept_id) VALUES (?, ?, ?, ?, ?)")
		.bind(id, titel, titelSchluessel(titel), optionen.igdbId ?? null, optionen.conceptId ?? null)
		.run();
	await env.DB.prepare(
		"INSERT INTO release (id, game_id, platform, physical_release_status, psn_product_id) VALUES (?, ?, ?, ?, ?)",
	)
		.bind(id, id, optionen.plattform ?? "PS4", optionen.disc ?? "unbekannt", optionen.produktId ?? null)
		.run();
}

const absicht = async (releaseId: number, art = "wunsch", status = "offen") =>
	await env.DB.prepare(
		"INSERT INTO plan_entry (release_id, kind, status, origin, created_at) VALUES (?, ?, ?, 'manuell', datetime('now'))",
	)
		.bind(releaseId, art, status)
		.run();

const berechtigung = async (releaseId: number, quelle: string) =>
	await env.DB.prepare("INSERT INTO digital_entitlement (release_id, source, herkunft) VALUES (?, ?, 'psn')")
		.bind(releaseId, quelle)
		.run();

const stand = async (id: number) =>
	await env.DB.prepare(
		"SELECT psn_product_id AS produkt, store_produkt_name AS name, store_price_cents AS preis, " +
			"store_base_price_cents AS grund, store_is_sale AS sale, store_plus AS plus, store_befund AS befund, " +
			"store_geprueft_am AS wann FROM release WHERE id = ?",
	)
		.bind(id)
		.first<{
			produkt: string | null;
			name: string | null;
			preis: number | null;
			grund: number | null;
			sale: number;
			plus: number;
			befund: string | null;
			wann: string | null;
		}>();

const verlauf = async (releaseId: number) =>
	(
		await env.DB.prepare(
			"SELECT channel, kanal, source, price_cents, is_sale FROM price_snapshot WHERE release_id = ? ORDER BY id",
		)
			.bind(releaseId)
			.all()
	).results;

const ereignisse = async () =>
	(await env.DB.prepare("SELECT source, kind, field, old_value, new_value, detail FROM game_event ORDER BY id").all()).results;

/** Ein IGDB-Client, der nichts weiss - die Concept-Ids stehen dann schon in der Datenbank. */
const igdbOhne = () => erstelleIgdbClient(null);

/** Ein IGDB-Client, der zu einer igdb_id eine Concept-Id nennt. */
function igdbMit(jeId: Record<number, string | null>) {
	const hole = async (eingabe: RequestInfo | URL): Promise<Response> => {
		if (String(eingabe).includes("oauth2/token")) return Response.json({ access_token: "t", expires_in: 7200 });
		return Response.json(
			Object.entries(jeId).map(([id, concept]) => ({
				id: Number(id),
				external_games:
					concept === null
						? [{ uid: "123", external_game_source: 1, url: "https://store.steampowered.com/app/123" }]
						: [{ uid: concept, external_game_source: 36, url: `https://store.playstation.com/en-us/concept/${concept}` }],
			})),
		);
	};
	return erstelleIgdbClient({ clientId: "id", clientSecret: { offenlegen: () => "geheim" } as never }, hole as typeof fetch);
}

const fristAbgelaufen = async () =>
	await env.DB.prepare("UPDATE release SET store_geprueft_am = datetime('now', '-30 days')").run();

describe("Der Zuschnitt", () => {
	beforeEach(async () => {
		for (const t of ["price_snapshot", "digital_entitlement", "plan_entry", "game_event", "release", "game"]) {
			await env.DB.prepare(`DELETE FROM ${t}`).run();
		}
	});

	it("nimmt offene Absichten", async () => {
		await spiel(1, "Bloodborne");
		await absicht(1);
		expect((await repos().store.zuPruefen(10)).map((z) => z.releaseId)).toEqual([1]);
	});

	it("laesst ein Release ohne Absicht aus", async () => {
		await spiel(1, "Bloodborne");
		expect(await repos().store.zuPruefen(10)).toEqual([]);
	});

	it("nimmt 'nur digital' auch ohne Absicht", async () => {
		await spiel(1, "Journey", { disc: "nein" });
		expect((await repos().store.zuPruefen(10)).map((z) => z.releaseId)).toEqual([1]);
	});

	it("laesst aus, was dauerhaft gekauft ist - der Neupreis hilft dort nicht", async () => {
		// Entscheidung des Nutzers vom 02.10.2026.
		await spiel(1, "Bloodborne");
		await absicht(1);
		await berechtigung(1, "kauf");
		expect(await repos().store.zuPruefen(10)).toEqual([]);
	});

	it("nimmt einen PS-Plus-Titel trotzdem - geliehen ist nicht gekauft", async () => {
		await spiel(1, "Bloodborne");
		await absicht(1);
		await berechtigung(1, "plus");
		expect((await repos().store.zuPruefen(10)).map((z) => z.releaseId)).toEqual([1]);
	});

	it("fragt ein heute geprueftes Release nicht noch einmal", async () => {
		await spiel(1, "Bloodborne");
		await absicht(1);
		await repos().store.befundSchreiben(1, "delistet");
		expect(await repos().store.zuPruefen(10)).toEqual([]);
		await fristAbgelaufen();
		expect(await repos().store.zuPruefen(10)).toHaveLength(1);
	});

	it("laesst eine erledigte Absicht aus", async () => {
		await spiel(1, "Bloodborne");
		await absicht(1, "wunsch", "erledigt");
		expect(await repos().store.zuPruefen(10)).toEqual([]);
	});
});

describe("storeSchritt", () => {
	const PRODUKT = "EP9000-CUSA13323_00-GHOSTSHIP0000000";

	beforeEach(async () => {
		for (const t of ["price_snapshot", "digital_entitlement", "plan_entry", "game_event", "release", "game"]) {
			await env.DB.prepare(`DELETE FROM ${t}`).run();
		}
	});

	/** Store mit einer Concept-Seite und einer Produktseite. */
	function storeMit(preisCents: number, optionen: { grundCents?: number; plus?: boolean; name?: string } = {}) {
		const ctas = [
			...(optionen.plus
				? [{ typ: "UPSELL_PS_PLUS_GAME_CATALOG", produktId: PRODUKT, preisCents: 0, marke: ["PS_PLUS"] }]
				: []),
			{ typ: "ADD_TO_CART", produktId: PRODUKT, grundCents: optionen.grundCents ?? preisCents, preisCents },
		];
		return fakeStore([
			[/\/concept\//, () => htmlAntwort(conceptSeite("235227", [{ id: PRODUKT, name: optionen.name ?? "Ghost of Tsushima" }]))],
			[/\/product\//, () => htmlAntwort(produktSeite(PRODUKT, ctas, { name: optionen.name ?? "Ghost of Tsushima" }))],
		]);
	}

	it("loest ueber das Concept auf, schreibt den Preis und merkt sich die Produkt-Id", async () => {
		await spiel(1, "Ghost of Tsushima", { conceptId: "235227" });
		await absicht(1);
		const { client, aufrufe } = storeMit(1999);
		const e = await storeSchritt(repos(), client, igdbOhne());

		expect(e).toMatchObject({ status: "erfolg", geprueft: 1, mitPreis: 1, zugeordnet: 1, anfragen: 2 });
		expect(await stand(1)).toMatchObject({ produkt: PRODUKT, preis: 1999, grund: 1999, sale: 0, befund: "preis" });
		// Zwei Anfragen beim ersten Mal: Concept und Produkt.
		expect(aufrufe).toHaveLength(2);
	});

	it("braucht beim zweiten Mal nur noch eine Anfrage", async () => {
		await spiel(1, "Ghost of Tsushima", { conceptId: "235227", produktId: PRODUKT });
		await absicht(1);
		const { client, aufrufe } = storeMit(1999);
		await storeSchritt(repos(), client, igdbOhne());
		expect(aufrufe).toHaveLength(1);
	});

	it("protokolliert die Produkt-Id als Zuordnung, aber nicht den Preis", async () => {
		await spiel(1, "Ghost of Tsushima", { conceptId: "235227" });
		await absicht(1);
		await storeSchritt(repos(), storeMit(1999).client, igdbOhne());
		expect(await ereignisse()).toEqual([
			{
				source: "sync",
				kind: "release_geaendert",
				field: "psn_product_id",
				old_value: null,
				new_value: PRODUKT,
				detail: "store",
			},
		]);
	});

	it("schreibt kein zweites Ereignis, wenn die Produkt-Id gleich bleibt", async () => {
		await spiel(1, "Ghost of Tsushima", { conceptId: "235227" });
		await absicht(1);
		await storeSchritt(repos(), storeMit(1999).client, igdbOhne());
		await fristAbgelaufen();
		await storeSchritt(repos(), storeMit(1499).client, igdbOhne());
		expect(await ereignisse()).toHaveLength(1);
	});

	it("schreibt den Verlauf nur bei geaendertem Preis", async () => {
		await spiel(1, "Ghost of Tsushima", { conceptId: "235227" });
		await absicht(1);
		await storeSchritt(repos(), storeMit(1999).client, igdbOhne());
		await fristAbgelaufen();
		await storeSchritt(repos(), storeMit(1999).client, igdbOhne());
		expect(await verlauf(1)).toHaveLength(1);
		await fristAbgelaufen();
		await storeSchritt(repos(), storeMit(1499, { grundCents: 1999 }).client, igdbOhne());
		const reihe = await verlauf(1);
		expect(reihe).toHaveLength(2);
		// Eigener Kanal, und `kanal` bleibt leer: Der trennt haendler von markt
		// INNERHALB des Gebrauchtpreises (0030).
		expect(reihe[1]).toMatchObject({ channel: "psn_store", kanal: null, source: "psn", price_cents: 1499, is_sale: 1 });
	});

	it("merkt sich den PS-Plus-Katalog und nimmt trotzdem den Kaufpreis", async () => {
		await spiel(1, "Ghost of Tsushima", { conceptId: "235227" });
		await absicht(1);
		const e = await storeSchritt(repos(), storeMit(1999, { plus: true }).client, igdbOhne());
		expect(e).toMatchObject({ imPlusKatalog: 1, mitPreis: 1 });
		expect(await stand(1)).toMatchObject({ plus: 1, preis: 1999 });
	});

	it("holt eine fehlende Concept-Id bei IGDB - eine Anfrage fuer die ganze Portion", async () => {
		await spiel(1, "Ghost of Tsushima", { igdbId: 77 });
		await spiel(2, "Ghost of Tsushima", { igdbId: 78 });
		await absicht(1);
		await absicht(2);
		const e = await storeSchritt(repos(), storeMit(1999).client, igdbMit({ 77: "235227", 78: "235227" }));
		// 1 IGDB + 1 Concept (gepuffert, beide Spiele teilen es) + 2 Produkte
		expect(e.anfragen).toBe(4);
		expect(
			await env.DB.prepare("SELECT store_concept_id AS c, store_concept_am AS am FROM game ORDER BY id").all(),
		).toMatchObject({ results: [{ c: "235227" }, { c: "235227" }] });
	});

	it("stempelt auch ein Spiel, zu dem IGDB keinen Store-Eintrag kennt", async () => {
		// Ohne den Stempel fragte der Schritt es jede Nacht erneut.
		await spiel(1, "Ein unbekanntes Spiel", { igdbId: 77 });
		await absicht(1);
		const e = await storeSchritt(repos(), storeMit(1999).client, igdbMit({ 77: null }));
		expect(e).toMatchObject({ mitPreis: 0, ohneTreffer: 1 });
		expect(await stand(1)).toMatchObject({ befund: "ohne_id", preis: null });
		const g = await env.DB.prepare("SELECT store_concept_id AS c, store_concept_am AS am FROM game WHERE id = 1").first<{
			c: string | null;
			am: string | null;
		}>();
		expect(g?.c).toBeNull();
		expect(g?.am).not.toBeNull();
	});

	it("laeuft weiter, wenn IGDB ausfaellt", async () => {
		await spiel(1, "Ghost of Tsushima", { conceptId: "235227" });
		await absicht(1);
		const kaputt = erstelleIgdbClient({ clientId: "id", clientSecret: { offenlegen: () => "g" } as never }, (async () => {
			throw new Error("IGDB weg");
		}) as unknown as typeof fetch);
		const e = await storeSchritt(repos(), storeMit(1999).client, kaputt);
		expect(e.mitPreis).toBe(1);
	});

	it("merkt sich 'delistet' und raeumt einen alten Preis weg", async () => {
		await spiel(1, "HITMAN 2", { conceptId: "231840" });
		await absicht(1);
		await env.DB.prepare("UPDATE release SET store_price_cents = 999 WHERE id = 1").run();
		const { client } = fakeStore([
			[/\/concept\//, () => htmlAntwort(conceptSeite("231840", [], { standard: null, angekuendigt: true }))],
		]);
		await storeSchritt(repos(), client, igdbOhne());
		expect(await stand(1)).toMatchObject({ befund: "delistet", preis: null });
	});

	it("merkt sich 'fremd', wenn der Store kein Produkt dieser Plattform fuehrt", async () => {
		// Resident Evil 7 auf PS4: Das Concept fuehrt nur noch die PS5-Fassung
		// und eine Demo. Lieber "unbekannt" als der Preis eines anderen
		// Produkts.
		await spiel(1, "Resident Evil 7: Biohazard", { conceptId: "220037", plattform: "PS4" });
		await absicht(1);
		const { client } = fakeStore([
			[
				/\/concept\//,
				() =>
					htmlAntwort(
						conceptSeite("220037", [{ id: "EP0102-PPSA04401_00-BH70000000000001", name: "RESIDENT EVIL 7 biohazard" }]),
					),
			],
		]);
		const e = await storeSchritt(repos(), client, igdbOhne());
		expect(e).toMatchObject({ mitPreis: 0, ohneTreffer: 1 });
		expect(await stand(1)).toMatchObject({ befund: "fremd", preis: null });
	});

	it("holt dieselbe Concept-Seite nicht zweimal", async () => {
		// Cross-Gen: PS4- und PS5-Release eines Spiels teilen ein Concept.
		await spiel(1, "Ghost of Tsushima", { conceptId: "235227" });
		await absicht(1);
		await env.DB.prepare("INSERT INTO release (id, game_id, platform, physical_release_status) VALUES (2, 1, 'PS5', 'unbekannt')").run();
		await absicht(2);
		const { client, aufrufe } = storeMit(1999);
		await storeSchritt(repos(), client, igdbOhne());
		expect(aufrufe.filter((a) => String(a.url).includes("/concept/"))).toHaveLength(1);
	});

	it("stempelt nach einer unlesbaren Seite NICHT - morgen wieder faellig", async () => {
		await spiel(1, "Ghost of Tsushima", { conceptId: "235227" });
		await absicht(1);
		const { client } = fakeStore([[/\/concept\//, () => htmlAntwort("<html>nichts</html>")]]);
		const e = await storeSchritt(repos(), client, igdbOhne());
		expect(e.geprueft).toBe(0);
		expect(await stand(1)).toMatchObject({ befund: null, wann: null });
		expect(await repos().store.zuPruefen(10)).toHaveLength(1);
	});

	it("kostet ein Serverfehler an einem Release nicht die Portion", async () => {
		await spiel(1, "Erstes Spiel", { conceptId: "100" });
		await spiel(2, "Ghost of Tsushima", { conceptId: "235227" });
		await absicht(1);
		await absicht(2);
		const { client } = fakeStore([
			[/\/concept\/100/, () => htmlAntwort("kaputt", 500)],
			[/\/concept\//, () => htmlAntwort(conceptSeite("235227", [{ id: PRODUKT, name: "Ghost of Tsushima" }]))],
			[/\/product\//, () => htmlAntwort(produktSeite(PRODUKT, [{ typ: "ADD_TO_CART", produktId: PRODUKT }], { name: "Ghost of Tsushima" }))],
		]);
		const e = await storeSchritt(repos(), client, igdbOhne());
		expect(e.mitPreis).toBe(1);
		// Das gescheiterte Release bleibt ungestempelt.
		expect(await stand(1)).toMatchObject({ wann: null });
	});

	it("probiert den naechsten Kandidaten, wenn das Standardprodukt nicht kaeuflich ist", async () => {
		// Mass Effect: Andromeda - das Standardprodukt antwortet UNAVAILABLE.
		const tot = "EP0006-CUSA02491_00-MASSEFFECT400000";
		const lebt = "EP0006-CUSA02491_00-ME4RECRUITSTNDRD";
		await spiel(1, "Mass Effect: Andromeda", { conceptId: "227871" });
		await absicht(1);
		const { client } = fakeStore([
			[
				/\/concept\//,
				() =>
					htmlAntwort(
						conceptSeite(
							"227871",
							[
								{ id: tot, name: "Mass Effect: Andromeda" },
								{ id: lebt, name: "Mass Effect: Andromeda Standard Recruit" },
							],
							{ standard: tot },
						),
					),
			],
			[new RegExp(tot), () => htmlAntwort(produktSeite(tot, [{ typ: "UNAVAILABLE", produktId: tot, ohnePreis: true }]))],
			[new RegExp(lebt), () => htmlAntwort(produktSeite(lebt, [{ typ: "ADD_TO_CART", produktId: lebt, grundCents: 1999 }], { name: "Mass Effect: Andromeda Standard Recruit" }))],
		]);
		const e = await storeSchritt(repos(), client, igdbOhne());
		expect(e.mitPreis).toBe(1);
		expect(await stand(1)).toMatchObject({ produkt: lebt, preis: 1999, name: "Mass Effect: Andromeda Standard Recruit" });
	});

	it("bleibt unter den erlaubten Fremdanfragen", async () => {
		// Zehn Releases, jedes mit Concept und Produkt: 20 Anfragen, weit
		// unter der Grenze. Der Test haelt die Bilanz fest, nicht die Grenze.
		for (let i = 1; i <= 10; i++) {
			await spiel(i, "Ghost of Tsushima", { conceptId: "235227" });
			await absicht(i);
		}
		const e = await storeSchritt(repos(), storeMit(1999).client, igdbOhne());
		expect(e.geprueft).toBe(10);
		expect(e.anfragen).toBeLessThanOrEqual(FREMDANFRAGEN_HOECHSTENS);
	});
});
