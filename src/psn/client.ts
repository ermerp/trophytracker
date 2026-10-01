import type { DefinitionRoh, GruppeRoh, StandRoh } from "../domain/trophaee";
import { Geheimnis } from "../domain/secret";

/**
 * Anbindung an die inoffizielle PSN-Schnittstelle.
 *
 * Bewusst ohne das Paket psn-api: Es nutzt ausschliesslich globales fetch ohne
 * Injektionsmoeglichkeit, und fuer den Rohabruf muessten wir es ohnehin
 * umgehen - getUserTitles wuerde parsen, wir brauchen aber den unveraenderten
 * Text (Abschnitt 7.1). Uebrig blieben drei Auth-Aufrufe; die hier selbst zu
 * halten macht sie ohne Netz testbar und spart eine Abhaengigkeit auf eine
 * inoffizielle Schnittstelle.
 *
 * Die Parameter sind aus psn-api v2.18.1 uebernommen und entsprechen dem,
 * was die PlayStation-App verwendet.
 */

const AUTH_BASIS = "https://ca.account.sony.com/api/authz/v3/oauth";
const GAMELIST_BASIS = "https://m.np.playstation.com/api/gamelist/v2";
const KAUFLISTE_BASIS = "https://web.np.playstation.com/api/graphql/v1/op";

/**
 * Sonys persistierte GraphQL-Abfrage fuer die Kaufliste. Der Hash gehoert
 * zur Abfrage, nicht zum Konto - er identifiziert die gespeicherte Query auf
 * Sonys Seite. Bricht sie weg, antwortet der Endpunkt mit einem Fehler, und
 * der Schritt meldet das wie jeden anderen Abrufsfehler (Abschnitt 7.7).
 */
const KAUFLISTE_HASH = "2c045408b0a4d0264bb5a3edfed4efd49fb4749cf8d216be9043768adff905e2";

const TROPHY_BASIS = "https://m.np.playstation.com/api/trophy/v1";

/**
 * Eine Liste in einem Zug: Die groesste der Sammlung hat 128 Trophaeen,
 * `limit=200` liefert sie vollstaendig (gemessen am 01.10.2026). Eine
 * Blaetterung gibt es deshalb nicht.
 */
export const TROPHAEEN_PRO_SEITE = 200;

const CLIENT_ID = "09515159-7237-4370-9b40-3806e67c0891";
const CLIENT_SECRET = "ucPjka5tntB2KqsP";
const REDIRECT_URI = "com.scee.psxandroid.scecompcall://redirect";
const SCOPE = "psn:mobile.v2.core psn:clientapp";

/** Der Aufrufer entscheidet, wie darauf reagiert wird - siehe src/sync. */
export class PsnAuthError extends Error {}
export class PsnAbrufError extends Error {}

export type Sitzung = {
	accessToken: Geheimnis;
	refreshToken: Geheimnis;
	accessLaeuftAbUm: string;
	refreshLaeuftAbUm: string;
};

export type FetchFn = typeof fetch;

function inZukunft(sekunden: number): string {
	return new Date(Date.now() + sekunden * 1000).toISOString();
}

/**
 * Wertet die Token-Antwort aus.
 *
 * Diese Antwort wird NIE roh gespeichert oder protokolliert - sie enthaelt
 * den Refresh-Token im Klartext.
 */
async function alsSitzung(antwort: Response): Promise<Sitzung> {
	if (!antwort.ok) {
		throw new PsnAuthError(`Token-Endpunkt antwortete mit ${antwort.status}.`);
	}
	const daten = (await antwort.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
		refresh_token_expires_in?: number;
	};
	if (!daten.access_token || !daten.refresh_token) {
		throw new PsnAuthError("Token-Antwort ohne Access- oder Refresh-Token.");
	}
	return {
		accessToken: new Geheimnis(daten.access_token),
		refreshToken: new Geheimnis(daten.refresh_token),
		accessLaeuftAbUm: inZukunft(daten.expires_in ?? 3600),
		// PSN liefert refresh_token_expires_in mit; gemessen sind das 10 Tage.
		// Der Rueckfall ist bewusst kurz: Lieber einmal unnoetig ueber das
		// NPSSO gehen, als einen laengst toten Token fuer gueltig zu halten.
		refreshLaeuftAbUm: inZukunft(daten.refresh_token_expires_in ?? 3600),
	};
}

function basicAuth(): string {
	return `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`;
}

export function erstellePsnClient(hole: FetchFn = fetch) {
	/**
	 * Ein JSON-Abruf gegen die Trophaeen-API. `null` heisst 404 - "diese
	 * Liste gibt es dort nicht" ist kein Fehler, sondern eine Antwort.
	 */
	async function trophyJson(accessToken: Geheimnis, pfad: string): Promise<unknown | null> {
		const antwort = await hole(`${TROPHY_BASIS}${pfad}`, {
			headers: { Authorization: `Bearer ${accessToken.offenlegen()}` },
		});
		if (antwort.status === 401) throw new PsnAuthError("PSN hat den Access Token abgelehnt.");
		if (antwort.status === 404) return null;
		if (!antwort.ok) throw new PsnAbrufError(`Trophäenabruf antwortete mit ${antwort.status}.`);
		return antwort.json();
	}

	async function tokenAnfrage(felder: Record<string, string>): Promise<Sitzung> {
		const antwort = await hole(`${AUTH_BASIS}/token`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Authorization: basicAuth(),
			},
			body: new URLSearchParams({ ...felder, token_format: "jwt" }).toString(),
		});
		return alsSitzung(antwort);
	}

	return {
		/** Der uebliche Weg. Fasst das NPSSO nicht an. */
		async tokenAusRefresh(refresh: Geheimnis): Promise<Sitzung> {
			return tokenAnfrage({
				refresh_token: refresh.offenlegen(),
				grant_type: "refresh_token",
				scope: SCOPE,
			});
		},

		/** Rueckfall, wenn kein oder kein gueltiger Refresh-Token vorliegt. */
		async tokenAusNpsso(npsso: Geheimnis): Promise<Sitzung> {
			const abfrage = new URLSearchParams({
				access_type: "offline",
				client_id: CLIENT_ID,
				redirect_uri: REDIRECT_URI,
				response_type: "code",
				scope: SCOPE,
			});

			const antwort = await hole(`${AUTH_BASIS}/authorize?${abfrage}`, {
				headers: { Cookie: `npsso=${npsso.offenlegen()}` },
				redirect: "manual",
			});

			const ziel = antwort.headers.get("location");
			if (!ziel || !ziel.includes("?code=")) {
				// Der Code aus dem Location-Header wird nicht in die Meldung
				// uebernommen - er ist gegen einen Token eintauschbar.
				throw new PsnAuthError(
					"PSN hat keinen Zugriffscode geliefert. Das NPSSO ist vermutlich abgelaufen.",
				);
			}

			const code = new URLSearchParams(ziel.split("redirect/")[1]).get("code");
			if (!code) throw new PsnAuthError("Zugriffscode konnte nicht gelesen werden.");

			return tokenAnfrage({
				code,
				redirect_uri: REDIRECT_URI,
				grant_type: "authorization_code",
			});
		},

		/**
		 * Eine Seite der Trophaeenliste als UNVERAENDERTER Text.
		 * Nicht parsen: Der Rohtext wandert direkt in psn_raw_response.
		 */
		async holeTrophyTitlesSeite(
			accessToken: Geheimnis,
			offset: number,
			limit: number,
		): Promise<{ pfad: string; roh: string }> {
			const pfad = `/users/me/trophyTitles?limit=${limit}&offset=${offset}`;
			const antwort = await hole(`${TROPHY_BASIS}${pfad}`, {
				headers: { Authorization: `Bearer ${accessToken.offenlegen()}` },
			});

			if (antwort.status === 401) {
				throw new PsnAuthError("PSN hat den Access Token abgelehnt.");
			}
			if (!antwort.ok) {
				throw new PsnAbrufError(`Trophäenabruf antwortete mit ${antwort.status}.`);
			}
			return { pfad, roh: await antwort.text() };
		},

		/**
		 * Die drei Abrufe zu den Einzeltrophaeen einer Liste (7.7, Stufe 19b).
		 *
		 * **`npServiceName` ist Pflicht, und zwar bei jedem der drei** - auch
		 * bei 'trophy', wo er wie ein Vorgabewert aussieht. Ohne ihn antwortet
		 * PSN mit 404 (gemessen am 01.10.2026). Der Wert steht in
		 * `trophy_progress.np_service_name` und wird durchgereicht, nie
		 * geraten.
		 *
		 * `limit=200` holt jede Liste in einem Zug: Die groesste Liste der
		 * Sammlung hat 128 Trophaeen, und `totalItemCount` wird gegen die
		 * gelieferte Zahl geprueft, damit ein Teilergebnis auffaellt.
		 *
		 * Nicht roh abgelegt: Je Liste ein eigener, jederzeit wiederholbarer
		 * Abruf, und die Normalisierung ist Feldkopieren - damit fehlen alle
		 * drei Merkmale, die eine Rohablage rechtfertigen (7.1).
		 *
		 * **404 ist kein Fehler, sondern "gibt es nicht".** Ein delisteter
		 * Titel kann aus der Trophaeen-API verschwinden, waehrend er in
		 * `trophy_progress` steht. Ein Fehler wuerde den Fuellschritt an
		 * dieser Liste festhalten; `null` laesst ihn sie stempeln und
		 * weitergehen (Migration 0027).
		 */
		async holeTrophaeen(
			accessToken: Geheimnis,
			npCommunicationId: string,
			npServiceName: string,
		): Promise<{ definitionen: DefinitionRoh[]; gesamt: number; hatGruppen: boolean } | null> {
			const antwort = await trophyJson(
				accessToken,
				`/npCommunicationIds/${npCommunicationId}/trophyGroups/all/trophies` +
					`?npServiceName=${npServiceName}&limit=${TROPHAEEN_PRO_SEITE}`,
			);
			if (antwort === null) return null;
			const j = antwort as { trophies?: DefinitionRoh[]; totalItemCount?: number; hasTrophyGroups?: boolean };
			return {
				definitionen: j.trophies ?? [],
				gesamt: j.totalItemCount ?? (j.trophies ?? []).length,
				hatGruppen: j.hasTrophyGroups === true,
			};
		},

		async holeTrophaeenStand(
			accessToken: Geheimnis,
			npCommunicationId: string,
			npServiceName: string,
		): Promise<StandRoh[] | null> {
			const antwort = await trophyJson(
				accessToken,
				`/users/me/npCommunicationIds/${npCommunicationId}/trophyGroups/all/trophies` +
					`?npServiceName=${npServiceName}&limit=${TROPHAEEN_PRO_SEITE}`,
			);
			if (antwort === null) return null;
			return (antwort as { trophies?: StandRoh[] }).trophies ?? [];
		},

		/**
		 * Nur fuer die rund 18 % der Listen, deren Definitionen
		 * `hasTrophyGroups` sagen - die Zugehoerigkeit jeder Trophaee steht
		 * schon in den Definitionen und kostet keinen eigenen Abruf.
		 */
		async holeTrophaeenGruppen(
			accessToken: Geheimnis,
			npCommunicationId: string,
			npServiceName: string,
		): Promise<GruppeRoh[] | null> {
			const antwort = await trophyJson(
				accessToken,
				`/npCommunicationIds/${npCommunicationId}/trophyGroups?npServiceName=${npServiceName}`,
			);
			if (antwort === null) return null;
			return (antwort as { trophyGroups?: GruppeRoh[] }).trophyGroups ?? [];
		},

		/**
		 * Das Trophaeen-Level des Kontos (7.7, Stufe 19b).
		 *
		 * Ein einzelner Abruf je Lauf. Die Zaehler je Stufe kommen NICHT von
		 * hier, sondern als Summe ueber `trophy_progress` (Entscheidung des
		 * Nutzers vom 24.09.2026) - gemessen am 01.10.2026 nennen beide
		 * dieselbe Zahl, 11 168.
		 */
		async holeTrophySummary(accessToken: Geheimnis): Promise<TrophySummaryRoh | null> {
			const antwort = await trophyJson(accessToken, "/users/me/trophySummary");
			return antwort === null ? null : (antwort as TrophySummaryRoh);
		},

		/**
		 * Eine Seite der gespielten Titel mit Spielzeit (7.7, Stufe 18c).
		 *
		 * Anders als die Trophaeenseiten wird hier direkt geparst: Die
		 * Antwort wird NICHT roh abgelegt - klein und jederzeit neu abrufbar,
		 * dieselbe Begruendung wie bei IGDB. Rohablage gibt es nur, wo
		 * teurer Abruf, komplexe Normalisierung und einzige Aufzeichnung
		 * zusammentreffen; das ist allein der Sync (Entscheidung des
		 * Nutzers vom 22.09.2026, Maßstab geschaerft am 01.10.2026).
		 */
		async holeGespielteSeite(
			accessToken: Geheimnis,
			offset: number,
			limit: number,
		): Promise<{ gesamt: number; titel: GespielterTitelRoh[] }> {
			const antwort = await hole(`${GAMELIST_BASIS}/users/me/titles?limit=${limit}&offset=${offset}`, {
				headers: { Authorization: `Bearer ${accessToken.offenlegen()}` },
			});
			if (antwort.status === 401) throw new PsnAuthError("PSN hat den Access Token abgelehnt.");
			if (!antwort.ok) throw new PsnAbrufError(`Abruf der Spielzeiten antwortete mit ${antwort.status}.`);

			const daten = (await antwort.json()) as { totalItemCount?: number; titles?: GespielterTitelRoh[] };
			return { gesamt: daten.totalItemCount ?? 0, titel: daten.titles ?? [] };
		},

		/**
		 * Eine Seite der Kaufliste (7.7, Stufe 18c). `subscriptionService`
		 * je Eintrag unterscheidet Kauf von PS+ - gemessen 117 zu 613.
		 *
		 * Der Filter `subscriptionService: "NONE"` grenzt die ABFRAGE ein,
		 * nicht die Antwort: Sie enthaelt beide Arten, und das Feld je
		 * Eintrag ist massgeblich.
		 */
		async holeKaeufeSeite(
			accessToken: Geheimnis,
			start: number,
			size: number,
		): Promise<{ gesamt: number; eintraege: KaufRoh[] }> {
			const variablen = encodeURIComponent(
				JSON.stringify({ isActive: true, platform: ["ps3", "ps4", "ps5"], start, size, subscriptionService: "NONE" }),
			);
			const erweiterung = encodeURIComponent(
				JSON.stringify({ persistedQuery: { version: 1, sha256Hash: KAUFLISTE_HASH } }),
			);
			const antwort = await hole(
				`${KAUFLISTE_BASIS}?operationName=getPurchasedGameList&variables=${variablen}&extensions=${erweiterung}`,
				{ headers: { Authorization: `Bearer ${accessToken.offenlegen()}`, "content-type": "application/json" } },
			);
			if (antwort.status === 401) throw new PsnAuthError("PSN hat den Access Token abgelehnt.");
			if (!antwort.ok) throw new PsnAbrufError(`Abruf der Kaufliste antwortete mit ${antwort.status}.`);

			const daten = (await antwort.json()) as {
				data?: { purchasedTitlesRetrieve?: { games?: KaufRoh[]; pageInfo?: { totalCount?: number } } };
			};
			const bereich = daten.data?.purchasedTitlesRetrieve;
			if (!bereich) throw new PsnAbrufError("Die Kaufliste hat eine unerwartete Form.");
			return { gesamt: bereich.pageInfo?.totalCount ?? 0, eintraege: bereich.games ?? [] };
		},
	};
}

export type PsnClient = ReturnType<typeof erstellePsnClient>;

/** Ein gespielter Titel, so wie gamelist/v2 ihn liefert (nur die gebrauchten Felder). */
export type GespielterTitelRoh = {
	titleId?: string;
	name?: string;
	category?: string;
	playDuration?: string;
	playCount?: number;
	firstPlayedDateTime?: string;
	lastPlayedDateTime?: string;
};

/** Ein Eintrag der Kaufliste (nur die gebrauchten Felder). */
export type KaufRoh = {
	titleId?: string;
	name?: string;
	platform?: string;
	subscriptionService?: string;
};

/** Was `/users/me/trophySummary` liefert, so weit wir es anfassen. */
export type TrophySummaryRoh = {
	trophyLevel?: number;
	trophyPoint?: number;
	trophyLevelBasePoint?: number;
	trophyLevelNextPoint?: number;
	progress?: number;
};
