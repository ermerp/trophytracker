import type { Repositories } from "./db";

/**
 * Gemeinsamer Hono-Typ fuer alle Route-Module: Bindings aus wrangler.jsonc,
 * dazu die Repositories, die eine Middleware je Anfrage bereitstellt.
 */
export type AppEnv = {
	Bindings: Env;
	Variables: { repos: Repositories };
};
