import type { IgdbSpielRoh } from "../src/domain/igdb";
import { Geheimnis } from "../src/domain/secret";
import { erstelleIgdbClient, type IgdbClient, type IgdbZugang } from "../src/igdb/client";
import { fakeFetch, jsonAntwort, type Aufruf } from "./psn-fake";

/**
 * Nachgebaute IGDB-Antworten. Kein Test geht ins Netz, und keine der
 * Zahlen stammt aus einer echten Antwort - die Form ist die von
 * /v4/games mit IGDB_FELDER.
 */

export const TWITCH_TOKEN = { access_token: "twitch-token-xyz", expires_in: 5000000, token_type: "bearer" };

/** Ein Hauptspiel mit allem, was IGDB liefern kann. */
export function spielRoh(ueberschreiben: Partial<IgdbSpielRoh> = {}): IgdbSpielRoh {
	return {
		id: 1001,
		name: "Bloodborne",
		slug: "bloodborne",
		cover: { id: 5, image_id: "abc123" },
		first_release_date: 1427155200, // 2015-03-24
		aggregated_rating: 91.11,
		aggregated_rating_count: 18,
		platforms: [48],
		game_type: 0,
		...ueberschreiben,
	};
}

export const ZUGANG: IgdbZugang = { clientId: "client-id-test", clientSecret: new Geheimnis("client-secret-test") };

/**
 * Client mit vorgegebener Antwort auf /games. `antworten` wird der Reihe
 * nach abgearbeitet; die letzte gilt fuer alle weiteren Aufrufe.
 */
export function fakeIgdb(
	antworten: Array<IgdbSpielRoh[] | Response>,
	optionen: { token?: () => Response; zugang?: IgdbZugang | null } = {},
): { client: IgdbClient; aufrufe: Aufruf[]; gewartet: number[] } {
	let n = 0;
	const gewartet: number[] = [];
	const { fetch, aufrufe } = fakeFetch([
		[/id\.twitch\.tv/, optionen.token ?? (() => jsonAntwort(TWITCH_TOKEN))],
		[
			/api\.igdb\.com\/v4\/games/,
			() => {
				const a = antworten[Math.min(n++, antworten.length - 1)];
				return a instanceof Response ? a.clone() : jsonAntwort(a);
			},
		],
	]);
	const client = erstelleIgdbClient(
		optionen.zugang === undefined ? ZUGANG : optionen.zugang,
		fetch,
		async (ms) => {
			gewartet.push(ms);
		},
	);
	return { client, aufrufe, gewartet };
}
