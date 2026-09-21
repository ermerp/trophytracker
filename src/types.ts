import type { Repositories } from "./db";
import type { EbayClient } from "./ebay/client";
import type { UpcitemdbClient } from "./ean/upcitemdb";
import type { IgdbClient } from "./igdb/client";
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
		igdb: IgdbClient;
		ebay: EbayClient;
		upc: UpcitemdbClient;
	};
};
