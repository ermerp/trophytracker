import { env, createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("Health-Route", () => {
	it("antwortet mit Status ok (unit)", async () => {
		const request = new IncomingRequest("http://example.com/api/health");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ status: "ok" });
	});

	it("antwortet mit Status ok (integration)", async () => {
		const response = await SELF.fetch("https://example.com/api/health");

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ status: "ok" });
	});

	it("hat einen Cron-Einstieg, der ohne NPSSO durchlaeuft (Stufe 18)", async () => {
		// Nur die Verdrahtung: Die Schrittfolge prueft test/cron.spec.ts.
		const ctx = createExecutionContext();
		await worker.scheduled({ scheduledTime: Date.now(), cron: "*/5 3-5 * * *", noRetry() {} }, env, ctx);
		await waitOnExecutionContext(ctx);
		const laeufe = await env.DB.prepare("SELECT COUNT(*) AS n FROM psn_sync_run").first<{ n: number }>();
		expect(laeufe?.n).toBe(0);
	});

	it("liefert 404 für unbekannte API-Pfade", async () => {
		const response = await SELF.fetch("https://example.com/api/gibtesnicht");

		expect(response.status).toBe(404);
	});
});
