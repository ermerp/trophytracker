import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { CryptoError, entschluesseln, verschluesseln } from "../src/domain/crypto";
import { Geheimnis } from "../src/domain/secret";

const KEY = env.NPSSO_KEY;
const ANDERER_KEY = "YW5kZXJlci1zY2hsdWVzc2VsLTMyLWJ5dGVzLWxhbmc=";

describe("Verschluesselung", () => {
	it("verschluesselt und entschluesselt verlustfrei", async () => {
		const daten = await verschluesseln(new Geheimnis("npsso-abc"), KEY);
		expect((await entschluesseln(daten, KEY)).offenlegen()).toBe("npsso-abc");
	});

	it("gibt den Klartext nicht im Chiffretext preis", async () => {
		const daten = await verschluesseln(new Geheimnis("npsso-abc"), KEY);
		expect(daten.chiffre).not.toContain("npsso-abc");
	});

	it("nutzt je Vorgang ein neues IV", async () => {
		const a = await verschluesseln(new Geheimnis("gleich"), KEY);
		const b = await verschluesseln(new Geheimnis("gleich"), KEY);

		expect(a.iv).not.toBe(b.iv);
		expect(a.chiffre).not.toBe(b.chiffre);
	});

	it("scheitert mit falschem Schluessel", async () => {
		const daten = await verschluesseln(new Geheimnis("npsso-abc"), KEY);
		await expect(entschluesseln(daten, ANDERER_KEY)).rejects.toThrow(CryptoError);
	});

	it("scheitert bei manipuliertem Chiffretext", async () => {
		const daten = await verschluesseln(new Geheimnis("npsso-abc"), KEY);
		const kaputt = { ...daten, chiffre: `A${daten.chiffre.slice(1)}` };

		await expect(entschluesseln(kaputt, KEY)).rejects.toThrow(CryptoError);
	});

	it("weist einen Schluessel falscher Laenge zurueck", async () => {
		await expect(verschluesseln(new Geheimnis("x"), btoa("zu kurz"))).rejects.toThrow(
			/32 Byte/,
		);
	});

	it("verraet in der Fehlermeldung nicht, was schiefging", async () => {
		const daten = await verschluesseln(new Geheimnis("npsso-abc"), KEY);
		await expect(entschluesseln(daten, ANDERER_KEY)).rejects.toThrow(
			/^Entschlüsselung fehlgeschlagen\.$/,
		);
	});
});
