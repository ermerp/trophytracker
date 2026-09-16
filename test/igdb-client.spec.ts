import { describe, expect, it } from "vitest";
import { IGDB_FELDER } from "../src/domain/igdb";
import {
	ABSTAND_MS,
	IgdbAbrufError,
	IgdbAuthError,
	IgdbKonfigError,
	IgdbRateError,
	erstelleIgdbClient,
	zugangAus,
} from "../src/igdb/client";
import { fakeIgdb, spielRoh, ZUGANG } from "./igdb-fake";
import { fakeFetch, jsonAntwort } from "./psn-fake";

describe("IGDB-Client", () => {
	it("holt das Twitch-Token vor der ersten Anfrage und nutzt es danach wieder", async () => {
		const { client, aufrufe } = fakeIgdb([[spielRoh()]]);
		await client.suche("Bloodborne");
		await client.suche("Bloodborne");

		const token = aufrufe.filter((a) => a.url.includes("id.twitch.tv"));
		expect(token).toHaveLength(1);
		expect(token[0].url).toContain("grant_type=client_credentials");
		expect(token[0].url).toContain("client_secret=client-secret-test");

		const suchen = aufrufe.filter((a) => a.url.includes("api.igdb.com"));
		expect(suchen).toHaveLength(2);
		const kopf = suchen[0].init?.headers as Record<string, string>;
		expect(kopf["Client-ID"]).toBe("client-id-test");
		expect(kopf.Authorization).toBe("Bearer twitch-token-xyz");
	});

	it("baut die Apicalypse-Anfrage mit Plattform- und Typfilter", async () => {
		const { client, aufrufe } = fakeIgdb([[]]);
		await client.suche('Say "Hi"');
		await client.suche("Mit Limit", { limit: 5 });
		await client.nameEnthaelt('That*s "You"!');
		await client.nameExakt("THE FINALS");
		const bodies = aufrufe.filter((a) => a.url.includes("api.igdb.com")).map((a) => String(a.init?.body));
		expect(bodies[0]).toBe(
			`search "Say \\"Hi\\""; fields ${IGDB_FELDER}; where platforms = (9,46,48,165,167,390) & game_type != (5,12,14); limit 30;`,
		);
		// Jede Suche traegt den Plattformfilter - auch die Rueckfaelle (16.09.2026).
		expect(bodies[1]).toBe(`search "Mit Limit"; fields ${IGDB_FELDER}; where platforms = (9,46,48,165,167,390) & game_type != (5,12,14); limit 5;`);
		expect(bodies[2]).toBe(`fields ${IGDB_FELDER}; where name ~ *"Thats \\"You\\"!"* & platforms = (9,46,48,165,167,390) & game_type != (5,12,14); limit 30;`);
		expect(bodies[3]).toBe(`fields ${IGDB_FELDER}; where name ~ "THE FINALS" & platforms = (9,46,48,165,167,390) & game_type != (5,12,14); limit 10;`);
	});

	it("fragt nach IDs in einer Anfrage, bereinigt und begrenzt auf 50", async () => {
		const { client, aufrufe } = fakeIgdb([[]]);
		await client.nachIds([3, 3, -1, 0, 2.5, 7]);
		const body = String(aufrufe.find((a) => a.url.includes("api.igdb.com"))?.init?.body);
		expect(body).toBe(`fields ${IGDB_FELDER}; where id = (3,7); limit 2;`);

		expect(await client.nachIds([])).toEqual([]);
		expect(await client.suche("   ")).toEqual([]);
	});

	it("haelt zwischen zwei Anfragen Abstand", async () => {
		const { client, gewartet } = fakeIgdb([[]]);
		await client.suche("a");
		await client.suche("b");
		expect(gewartet).toHaveLength(1);
		expect(gewartet[0]).toBeGreaterThan(0);
		expect(gewartet[0]).toBeLessThanOrEqual(ABSTAND_MS);
	});

	it("erneuert das Token bei 401 genau einmal", async () => {
		const { client, aufrufe } = fakeIgdb([new Response("", { status: 401 }), [spielRoh()]]);
		expect(await client.suche("x")).toHaveLength(1);
		expect(aufrufe.filter((a) => a.url.includes("id.twitch.tv"))).toHaveLength(2);

		const dauerhaft = fakeIgdb([new Response("", { status: 401 })]);
		await expect(dauerhaft.client.suche("x")).rejects.toBeInstanceOf(IgdbAuthError);
	});

	it("meldet Ratenlimit und andere Fehler als eigene Typen", async () => {
		await expect(fakeIgdb([new Response("", { status: 429 })]).client.suche("x")).rejects.toBeInstanceOf(IgdbRateError);
		await expect(fakeIgdb([new Response("kaputt", { status: 500 })]).client.suche("x")).rejects.toBeInstanceOf(IgdbAbrufError);
		await expect(fakeIgdb([jsonAntwort({ nicht: "array" })]).client.suche("x")).rejects.toBeInstanceOf(IgdbAbrufError);
	});

	it("gibt keinen Fremdtext weiter, wenn Twitch die Zugangsdaten ablehnt", async () => {
		const { client } = fakeIgdb([[]], {
			token: () => jsonAntwort({ message: "invalid client GEHEIM-IM-FEHLERTEXT" }, 403),
		});
		await expect(client.suche("x")).rejects.toThrow(/Twitch hat die IGDB-Zugangsdaten abgelehnt \(403\)\./);
	});

	it("ohne Zugangsdaten: konfiguriert() ist false, Anfragen scheitern typisiert", async () => {
		const client = erstelleIgdbClient(null, fakeFetch([]).fetch);
		expect(client.konfiguriert()).toBe(false);
		await expect(client.suche("x")).rejects.toBeInstanceOf(IgdbKonfigError);
		expect(fakeIgdb([[]]).client.konfiguriert()).toBe(true);
	});

	it("zugangAus liest beide Werte oder nichts", () => {
		expect(zugangAus({})).toBeNull();
		expect(zugangAus({ IGDB_CLIENT_ID: "a" })).toBeNull();
		const z = zugangAus({ IGDB_CLIENT_ID: "a", IGDB_CLIENT_SECRET: "b" });
		expect(z?.clientId).toBe("a");
		expect(String(z?.clientSecret)).toBe("[redaktiert]");
		expect(ZUGANG.clientSecret.offenlegen()).toBe("client-secret-test");
	});
});
