import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll } from "vitest";

// Einmal je Testdatei: Schema aus migrations/ anwenden.
beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
