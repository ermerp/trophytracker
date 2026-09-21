import { Geheimnis } from "../domain/secret";

/**
 * Anbindung an die eBay Browse API (Abschnitt 9.2, Stufe 17c).
 *
 * Zweck ist eine einzige Frage: Welche Titel tragen Angebote zu diesem
 * Barcode? Daraus entsteht ein *Vorschlag*, nie eine Zuordnung - das
 * entscheidet der Nutzer (Abschnitt 7, kein vollautomatisches Matching).
 *
 * Offizielle Schnittstelle, Zugang ueber einen Developer-Account:
 * App ID und Cert ID ergeben per Client-Credentials ein Application-Token.
 * Wie bei IGDB (7.6) lebt das Token im Speicher der Worker-Instanz, nie in
 * D1: Es rotiert nicht und ist jederzeit neu erzeugbar.
 *
 * Warum die Abfrage anders als bei upcitemdb im Worker laufen darf: Gemessen
 * am 21.09.2026 antwortet eBay in rund 0,3 Sekunden und erlaubt 5 000
 * Abfragen am Tag, ohne zu drosseln. Wartezeit auf das Netz zaehlt nicht
 * gegen die 10-ms-CPU-Grenze - nur eigenes Rechnen tut das. upcitemdb blockt
 * dagegen nach je sechs Abfragen 90 Sekunden und bleibt deshalb im
 * naechtlichen Job (9.3).
 */

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const API_BASIS = "https://api.ebay.com/buy/browse/v1";
const SCOPE = "https://api.ebay.com/oauth/api_scope";

/** Deutscher Marktplatz: Die Discs des Nutzers sind PAL-Ware. */
const MARKTPLATZ = "EBAY_DE";

/**
 * Wie viele Angebote je Code gelesen werden. Zehn genuegen fuer die
 * Mehrheitsregel (`mehrheitstreffer`) und halten die Antwort klein.
 */
export const ANGEBOTE_JE_CODE = 10;

/** Zugangsdaten fehlen - die Anwendung laeuft ohne eBay weiter. */
export class EbayKonfigError extends Error {}
/** eBay hat die Zugangsdaten abgelehnt oder das Token nicht erneuert. */
export class EbayAuthError extends Error {}
/** Tageskontingent erschoepft; der naechtliche Job holt es nach. */
export class EbayRateError extends Error {}
/** Alles andere. */
export class EbayAbrufError extends Error {}

export type FetchFn = typeof fetch;
export type EbayZugang = { clientId: string; clientSecret: Geheimnis };

export function zugangAus(env: { EBAY_CLIENT_ID?: string; EBAY_CLIENT_SECRET?: string }): EbayZugang | null {
	if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) return null;
	return { clientId: env.EBAY_CLIENT_ID, clientSecret: new Geheimnis(env.EBAY_CLIENT_SECRET) };
}

/**
 * Wertet die Token-Antwort aus. Der Token wird nur als Geheimnis
 * weitergereicht; Fehlermeldungen sind feste Texte, kein Fremdtext - eine
 * fremde Meldung koennte die Zugangsdaten zitieren.
 */
async function alsToken(antwort: Response): Promise<{ token: Geheimnis; laeuftAbUm: number }> {
	if (!antwort.ok) {
		throw new EbayAuthError(`eBay hat die Zugangsdaten abgelehnt (${antwort.status}).`);
	}
	const daten = (await antwort.json()) as { access_token?: string; expires_in?: number };
	if (!daten.access_token) throw new EbayAuthError("eBay-Antwort ohne Token.");
	// Fuenf Minuten Luft, damit ein Token nicht mitten in einer Abfrage stirbt.
	const sekunden = Math.max(60, (daten.expires_in ?? 7200) - 300);
	return { token: new Geheimnis(daten.access_token), laeuftAbUm: Date.now() + sekunden * 1000 };
}

export function erstelleEbayClient(
	zugang: EbayZugang | null,
	hole: FetchFn = fetch,
	jetzt: () => number = Date.now,
) {
	let token: { token: Geheimnis; laeuftAbUm: number } | null = null;

	function zugangOderFehler(): EbayZugang {
		if (!zugang) throw new EbayKonfigError("eBay-Zugangsdaten sind nicht hinterlegt.");
		return zugang;
	}

	async function tokenBesorgen(erzwingen = false): Promise<Geheimnis> {
		const z = zugangOderFehler();
		if (!erzwingen && token && token.laeuftAbUm > jetzt()) return token.token;

		const basic = btoa(`${z.clientId}:${z.clientSecret.offenlegen()}`);
		token = await alsToken(
			await hole(TOKEN_URL, {
				method: "POST",
				headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
				body: `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
			}),
		);
		return token.token;
	}

	return {
		/** Sind Zugangsdaten hinterlegt? Fuer die Anzeige, nie die Werte. */
		konfiguriert(): boolean {
			return zugang !== null;
		},

		/**
		 * Angebotstitel zu einer GTIN, hoechstens ANGEBOTE_JE_CODE.
		 * Eine leere Liste heisst "eBay kennt den Code nicht" - kein Fehler.
		 * Bei 401 wird das Token genau einmal erneuert.
		 */
		async titelZuGtin(gtin: string, zweiterVersuch = false): Promise<string[]> {
			const t = await tokenBesorgen(zweiterVersuch);
			const antwort = await hole(
				`${API_BASIS}/item_summary/search?gtin=${encodeURIComponent(gtin)}&limit=${ANGEBOTE_JE_CODE}`,
				{
					headers: {
						Authorization: `Bearer ${t.offenlegen()}`,
						"X-EBAY-C-MARKETPLACE-ID": MARKTPLATZ,
						Accept: "application/json",
					},
				},
			);

			if (antwort.status === 401 && !zweiterVersuch) return this.titelZuGtin(gtin, true);
			if (antwort.status === 401 || antwort.status === 403) throw new EbayAuthError("eBay hat das Token abgelehnt.");
			if (antwort.status === 429) throw new EbayRateError("Das eBay-Tageskontingent ist erschöpft.");
			// 204 heisst: kein Angebot zu dieser GTIN.
			if (antwort.status === 204) return [];
			if (!antwort.ok) throw new EbayAbrufError(`eBay antwortete mit ${antwort.status}.`);

			const daten = (await antwort.json()) as { itemSummaries?: Array<{ title?: unknown }> };
			return (daten.itemSummaries ?? [])
				.map((i) => i.title)
				.filter((t): t is string => typeof t === "string" && t.trim() !== "");
		},
	};
}

export type EbayClient = ReturnType<typeof erstelleEbayClient>;

/**
 * Nur eigene Fehlertypen werden woertlich uebernommen; alles andere wird auf
 * einen festen Text abgebildet, damit kein Fremdtext durchrutscht.
 */
export function meldungFuer(fehler: unknown): string {
	if (fehler instanceof EbayKonfigError || fehler instanceof EbayAuthError || fehler instanceof EbayRateError) {
		return fehler.message;
	}
	return "Die eBay-Abfrage ist fehlgeschlagen.";
}
