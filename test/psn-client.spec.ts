import { describe, it, expect } from "vitest";
import { Geheimnis } from "../src/domain/secret";
import { erstellePsnClient, PsnAbrufError, PsnAuthError } from "../src/psn/client";
import { TOKEN_ANTWORT, fakeFetch, jsonAntwort, redirectAntwort, trophySeite } from "./psn-fake";

const NPSSO = new Geheimnis("npsso-testwert");
const REFRESH = new Geheimnis("refresh-testwert");
const ACCESS = new Geheimnis("access-testwert");

describe("tokenAusRefresh", () => {
	it("liefert eine Sitzung mit Geheimnissen", async () => {
		const { fetch } = fakeFetch([[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)]]);

		const sitzung = await erstellePsnClient(fetch).tokenAusRefresh(REFRESH);

		expect(sitzung.accessToken.offenlegen()).toBe("access-token-xyz");
		expect(sitzung.refreshToken.offenlegen()).toBe("refresh-token-xyz");
		expect(new Date(sitzung.refreshLaeuftAbUm).getTime()).toBeGreaterThan(Date.now());
	});

	it("schickt grant_type=refresh_token", async () => {
		const { fetch, aufrufe } = fakeFetch([[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)]]);

		await erstellePsnClient(fetch).tokenAusRefresh(REFRESH);

		expect(String(aufrufe[0].init?.body)).toContain("grant_type=refresh_token");
	});

	it("meldet PsnAuthError bei abgelehntem Refresh-Token", async () => {
		const { fetch } = fakeFetch([
			[/oauth\/token/, () => jsonAntwort({ error: "invalid_grant" }, 400)],
		]);

		await expect(erstellePsnClient(fetch).tokenAusRefresh(REFRESH)).rejects.toThrow(
			PsnAuthError,
		);
	});
});

describe("tokenAusNpsso", () => {
	it("tauscht NPSSO ueber den Code gegen eine Sitzung", async () => {
		const { fetch, aufrufe } = fakeFetch([
			[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
			[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
		]);

		const sitzung = await erstellePsnClient(fetch).tokenAusNpsso(NPSSO);

		expect(sitzung.refreshToken.offenlegen()).toBe("refresh-token-xyz");
		expect(aufrufe[0].init?.headers).toMatchObject({ Cookie: "npsso=npsso-testwert" });
		expect(String(aufrufe[1].init?.body)).toContain("grant_type=authorization_code");
	});

	it("folgt dem Redirect nicht", async () => {
		const { fetch, aufrufe } = fakeFetch([
			[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
			[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
		]);

		await erstellePsnClient(fetch).tokenAusNpsso(NPSSO);

		expect(aufrufe[0].init?.redirect).toBe("manual");
	});

	it("meldet ein abgelaufenes NPSSO, wenn kein Location-Header kommt", async () => {
		const { fetch } = fakeFetch([
			[/oauth\/authorize/, () => new Response(null, { status: 200 })],
		]);

		await expect(erstellePsnClient(fetch).tokenAusNpsso(NPSSO)).rejects.toThrow(
			/abgelaufen/,
		);
	});

	it("nennt den Zugriffscode nicht in der Fehlermeldung", async () => {
		const { fetch } = fakeFetch([
			[
				/oauth\/authorize/,
				() =>
					new Response(null, {
						status: 302,
						headers: { location: "com.scee.psxandroid.scecompcall://redirect/?fehler=1" },
					}),
			],
		]);

		await expect(erstellePsnClient(fetch).tokenAusNpsso(NPSSO)).rejects.toThrow(PsnAuthError);
	});
});

describe("holeTrophyTitlesSeite", () => {
	it("liefert den Rohtext unveraendert", async () => {
		const roh = trophySeite(0, 250);
		const { fetch } = fakeFetch([[/trophyTitles/, () => new Response(roh)]]);

		const ergebnis = await erstellePsnClient(fetch).holeTrophyTitlesSeite(ACCESS, 0, 100);

		expect(ergebnis.roh).toBe(roh);
		expect(ergebnis.pfad).toBe("/users/me/trophyTitles?limit=100&offset=0");
	});

	it("setzt den Bearer-Header", async () => {
		const { fetch, aufrufe } = fakeFetch([[/trophyTitles/, () => new Response("{}")]]);

		await erstellePsnClient(fetch).holeTrophyTitlesSeite(ACCESS, 0, 100);

		expect(aufrufe[0].init?.headers).toMatchObject({
			Authorization: "Bearer access-testwert",
		});
	});

	it("meldet PsnAuthError bei 401", async () => {
		const { fetch } = fakeFetch([[/trophyTitles/, () => new Response(null, { status: 401 })]]);

		await expect(
			erstellePsnClient(fetch).holeTrophyTitlesSeite(ACCESS, 0, 100),
		).rejects.toThrow(PsnAuthError);
	});

	it("meldet PsnAbrufError bei 500", async () => {
		const { fetch } = fakeFetch([[/trophyTitles/, () => new Response(null, { status: 500 })]]);

		await expect(
			erstellePsnClient(fetch).holeTrophyTitlesSeite(ACCESS, 0, 100),
		).rejects.toThrow(PsnAbrufError);
	});
});
