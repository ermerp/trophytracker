import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Migrationen einlesen und als Binding hereinreichen. Der Setup-File wendet
// sie je Testlauf an, damit die Tests gegen dasselbe Schema laufen wie
// Produktion - und nicht gegen eine handgepflegte Kopie.
const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				bindings: { TEST_MIGRATIONS: migrations },
			},
		}),
	],
	test: {
		setupFiles: ["./test/setup-migrations.ts"],
	},
});
