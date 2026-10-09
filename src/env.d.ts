/**
 * Die Bindings des Workers (Abschnitt 15.3).
 *
 * `wrangler types` erzeugt aus `wrangler.jsonc` die Binding-Haelfte und legt
 * sie als `CfBindings` ab (`npm run cf-typegen`, `--env-interface`). Die
 * Geheimnis-Haelfte steht hier von Hand, und zwar **optional** - aus zwei
 * Gruenden:
 *
 * 1. Sie ist wahr. Produktiv sind das Cloudflare Secrets, die Wrangler nie
 *    sieht; jeder Lesepfad im Code prueft deshalb auf Abwesenheit
 *    (`if (!c.env.NPSSO_KEY)` in src/index.ts, `zugangAus` in src/igdb und
 *    src/ebay nehmen die Felder schon als optional). Ein erzeugtes
 *    `NPSSO_KEY: string` behauptete das Gegenteil und liesse einen Zugriff
 *    ohne Pruefung durchgehen.
 * 2. Sie ist ortsunabhaengig. Wrangler las die Namen aus `.dev.vars`, die in
 *    der GitHub Action nicht liegt - dort entstand ein `Env` mit nur `DB` und
 *    `ASSETS`, und `tsc` meldete sechs Fehler in src/index.ts. Gemessen am
 *    09.10.2026: mit und ohne `.dev.vars` je 0 Fehler.
 *
 * Nicht hier stehen `CF_ACCESS_CLIENT_ID` und `CF_ACCESS_CLIENT_SECRET`: Das
 * sind die Zugangsdaten des Betreibers fuer die Pruefaufrufe gegen die
 * Produktion (15.3), der Worker liest sie nie. In `.dev.vars` gehoeren sie,
 * in `Env` nicht.
 *
 * Kommt ein Secret dazu, kommt es hier dazu - zusammen mit
 * `npx wrangler secret put`, `.dev.vars.example` und dem README.
 */
type WorkerGeheimnisse = {
	/** Schluessel, mit dem die Repositories NPSSO und Refresh-Token in D1 verschluesseln. */
	NPSSO_KEY?: string;
	IGDB_CLIENT_ID?: string;
	IGDB_CLIENT_SECRET?: string;
	EBAY_CLIENT_ID?: string;
	EBAY_CLIENT_SECRET?: string;
};

/**
 * `Omit` statt eines Schnitts: Steht `.dev.vars` daneben, traegt `CfBindings`
 * dieselben Namen als `string`, und ein Schnitt ergaebe `string & undefined`.
 */
type Env = Omit<CfBindings, keyof WorkerGeheimnisse> & WorkerGeheimnisse;
