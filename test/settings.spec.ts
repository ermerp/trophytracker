import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createRepositories } from "../src/db";
import { DEFAULT_WEIGHTS } from "../src/domain/weights";

const URL = "https://example.com/api/settings/weights";

async function zuruecksetzen() {
	await createRepositories(env.DB).settings.setWeights(DEFAULT_WEIGHTS);
}

beforeEach(zuruecksetzen);

describe("SettingsRepository", () => {
	it("liest die vorbelegten Gewichte", async () => {
		expect(await createRepositories(env.DB).settings.getWeights()).toEqual(DEFAULT_WEIGHTS);
	});

	it("schreibt und liest zurueck", async () => {
		const repos = createRepositories(env.DB);
		const neu = { w_critic: 0.4, w_priority: 0.4, w_favorite: 0.2, w_price: 0.1 };

		await repos.settings.setWeights(neu);
		expect(await repos.settings.getWeights()).toEqual(neu);
	});

	it("ergaenzt einen fehlenden Schluessel aus der Vorbelegung", async () => {
		// Ein neuer Faktor aus einer kuenftigen Migration darf die
		// Rangberechnung nicht lahmlegen.
		await env.DB.prepare("DELETE FROM app_setting WHERE key = 'w_price'").run();

		const gewichte = await createRepositories(env.DB).settings.getWeights();
		expect(gewichte.w_price).toBe(DEFAULT_WEIGHTS.w_price);
	});
});

describe("GET/PUT /api/settings/weights", () => {
	it("liefert die aktuellen Gewichte", async () => {
		const antwort = await SELF.fetch(URL);

		expect(antwort.status).toBe(200);
		expect(await antwort.json()).toEqual(DEFAULT_WEIGHTS);
	});

	it("uebernimmt eine gueltige Gewichtung dauerhaft", async () => {
		const neu = { w_critic: 0.6, w_priority: 0.2, w_favorite: 0.2, w_price: 0 };

		const put = await SELF.fetch(URL, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(neu),
		});
		expect(put.status).toBe(200);

		expect(await (await SELF.fetch(URL)).json()).toEqual(neu);
	});

	it("weist einen Wert ausserhalb von 0..1 mit 400 zurueck", async () => {
		const antwort = await SELF.fetch(URL, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...DEFAULT_WEIGHTS, w_critic: 5 }),
		});

		expect(antwort.status).toBe(400);
		expect(await antwort.json()).toMatchObject({ fehler: expect.stringContaining("w_critic") });
	});

	it("laesst bei ungueltiger Eingabe den gespeicherten Stand unangetastet", async () => {
		await SELF.fetch(URL, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ w_critic: 5 }),
		});

		expect(await (await SELF.fetch(URL)).json()).toEqual(DEFAULT_WEIGHTS);
	});

	it("weist ungueltiges JSON mit 400 zurueck", async () => {
		const antwort = await SELF.fetch(URL, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: "kein json",
		});

		expect(antwort.status).toBe(400);
	});
});
