import { Geheimnis } from "../src/domain/secret";
import { erstelleEbayClient, type EbayClient, type EbayZugang } from "../src/ebay/client";
import { fakeFetch, jsonAntwort, type Aufruf } from "./psn-fake";

/**
 * Nachgebaute Antworten der eBay Browse API. Kein Test geht ins Netz, und
 * keine Zeile stammt aus einer echten Antwort - die Form ist die von
 * /buy/browse/v1/item_summary/search.
 */

export const EBAY_TOKEN = { access_token: "ebay-token-xyz", expires_in: 7200, token_type: "Application Access Token" };

export const ZUGANG: EbayZugang = { clientId: "ebay-client-id", clientSecret: new Geheimnis("ebay-cert-id") };

/**
 * Client mit vorgegebenen Angebotstiteln. `antworten` wird der Reihe nach
 * abgearbeitet; die letzte gilt fuer alle weiteren Aufrufe. Ein Eintrag kann
 * auch eine fertige Response sein, fuer die Fehlerpfade.
 */
export function fakeEbay(
	antworten: Array<string[] | Response>,
	optionen: { token?: () => Response; zugang?: EbayZugang | null } = {},
): { client: EbayClient; aufrufe: Aufruf[] } {
	let n = 0;
	const { fetch, aufrufe } = fakeFetch([
		[/identity\/v1\/oauth2\/token/, optionen.token ?? (() => jsonAntwort(EBAY_TOKEN))],
		[
			/buy\/browse\/v1\/item_summary\/search/,
			() => {
				const a = antworten[Math.min(n++, antworten.length - 1)];
				if (a instanceof Response) return a.clone();
				// `legacyItemId` gehoert dazu, nicht nur `itemId`: An ihr haengt
				// die Sperrliste aus Stufe 20h, und ohne sie waere jede
				// Testzeile kennungslos und der Filter nie wirklich geprueft.
				return jsonAntwort({
					total: a.length,
					itemSummaries: a.map((titel, i) => ({
						itemId: `v1|${1_000_000_000_00 + i}|0`,
						legacyItemId: String(1_000_000_000_00 + i),
						title: titel,
					})),
				});
			},
		],
	]);
	const client = erstelleEbayClient(optionen.zugang === undefined ? ZUGANG : optionen.zugang, fetch);
	return { client, aufrufe };
}
