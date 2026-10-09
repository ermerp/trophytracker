import type { D1Migration } from "@cloudflare/vitest-plugin";

/**
 * Die Umgebung der Tests.
 *
 * `cloudflare:test` typt sein `env` als `Cloudflare.Env`. Die frueher hier
 * augmentierte Schnittstelle `ProvidedEnv` war die API von
 * `@cloudflare/vitest-pool-workers` 0.x und kommt im Nachfolger
 * `@cloudflare/vitest-plugin` 1.x nicht mehr vor - die Deklaration war
 * seitdem funktionslos, und `env.TEST_MIGRATIONS` ungetypt.
 *
 * Anders als im Worker sind diese Werte in Tests **immer** gesetzt: Beide
 * reicht vitest.config.mts als Miniflare-Binding herein. Deshalb stehen sie
 * hier ohne `?`, waehrend die Geheimnisse des Workers in src/env.d.ts
 * optional sind.
 */
declare global {
	namespace Cloudflare {
		interface Env {
			/** Aus `readD1Migrations`, vom Setup-File je Testlauf angewendet. */
			TEST_MIGRATIONS: D1Migration[];
			/** Fester, absichtlich nutzloser Testschluessel aus vitest.config.mts. */
			NPSSO_KEY: string;
		}
	}
}
