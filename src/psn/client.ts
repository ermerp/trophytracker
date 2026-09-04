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
const TROPHY_BASIS = "https://m.np.playstation.com/api/trophy/v1";

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
		refreshLaeuftAbUm: inZukunft(daten.refresh_token_expires_in ?? 60 * 24 * 3600),
	};
}

function basicAuth(): string {
	return `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`;
}

export function erstellePsnClient(hole: FetchFn = fetch) {
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
	};
}

export type PsnClient = ReturnType<typeof erstellePsnClient>;
