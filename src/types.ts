import type { Repositories } from "./db";
import type { PsnClient } from "./psn/client";

/**
 * Gemeinsamer Hono-Typ fuer alle Route-Module: Bindings aus wrangler.jsonc,
 * dazu die je Anfrage bereitgestellten Abhaengigkeiten.
 */
export type AppEnv = {
	Bindings: Env;
	Variables: {
		repos: Repositories;
		psn: PsnClient;
	};
};
