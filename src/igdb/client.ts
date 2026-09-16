import {
	IGDB_FELDER,
	IGDB_FELDER_PHYSISCH,
	IGDB_PLATTFORM_IDS,
	NIE_EIN_SPIEL,
	apicalypseText,
	type IgdbPhysischRoh,
	type IgdbSpielRoh,
} from "../domain/igdb";
import { Geheimnis } from "../domain/secret";

/**
 * Anbindung an IGDB (Abschnitt 7.6).
 *
 * Offizielle Schnittstelle, Zugang ueber eine Twitch-Anwendung: Client-ID
 * und Client-Secret ergeben per Client-Credentials ein App-Token, das rund
 * 60 Tage gilt. Das Token liegt hier im Closure, nicht in D1: Es rotiert
 * nicht, ist an die Client-ID gebunden und jederzeit neu erzeugbar. Ein
 * neues Isolate holt es sich einfach wieder.
 *
 * Client-Secret und Token laufen als Geheimnis. Die Antwort des
 * Token-Endpunkts wird nie protokolliert oder gespeichert.
 *
 * IGDB erlaubt vier Anfragen je Sekunde. Der Client haelt zwischen zwei
 * Anfragen mindestens ABSTAND_MS Abstand - Wartezeit zaehlt nicht als CPU.
 */

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const API_BASIS = "https://api.igdb.com/v4";

export const ABSTAND_MS = 260;

/** Zugangsdaten fehlen - die Anwendung laeuft ohne IGDB weiter. */
export class IgdbKonfigError extends Error {}
/** Twitch hat die Zugangsdaten abgelehnt oder das Token nicht erneuert. */
export class IgdbAuthError extends Error {}
/** Ratenlimit erreicht; der Aufrufer wiederholt spaeter. */
export class IgdbRateError extends Error {}
/** Alles andere. */
export class IgdbAbrufError extends Error {}

export type FetchFn = typeof fetch;
export type WarteFn = (ms: number) => Promise<void>;

export type IgdbZugang = { clientId: string; clientSecret: Geheimnis };

export function zugangAus(env: { IGDB_CLIENT_ID?: string; IGDB_CLIENT_SECRET?: string }): IgdbZugang | null {
	if (!env.IGDB_CLIENT_ID || !env.IGDB_CLIENT_SECRET) return null;
	return { clientId: env.IGDB_CLIENT_ID, clientSecret: new Geheimnis(env.IGDB_CLIENT_SECRET) };
}

const schlafen: WarteFn = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wertet die Token-Antwort aus. Der Token selbst wird nur als Geheimnis
 * weitergereicht; Fehlermeldungen sind feste Texte, kein Fremdtext.
 */
async function alsToken(antwort: Response): Promise<{ token: Geheimnis; laeuftAbUm: number }> {
	if (!antwort.ok) {
		throw new IgdbAuthError(`Twitch hat die IGDB-Zugangsdaten abgelehnt (${antwort.status}).`);
	}
	const daten = (await antwort.json()) as { access_token?: string; expires_in?: number };
	if (!daten.access_token) throw new IgdbAuthError("Twitch-Antwort ohne Token.");
	// Eine Stunde Luft vor dem Ablauf, damit ein Token nicht mitten im Abgleich stirbt.
	const sekunden = Math.max(60, (daten.expires_in ?? 3600) - 3600);
	return { token: new Geheimnis(daten.access_token), laeuftAbUm: Date.now() + sekunden * 1000 };
}

export function erstelleIgdbClient(
	zugang: IgdbZugang | null,
	hole: FetchFn = fetch,
	warte: WarteFn = schlafen,
	jetzt: () => number = Date.now,
) {
	let token: { token: Geheimnis; laeuftAbUm: number } | null = null;
	let letzteAnfrage = 0;

	function zugangOderFehler(): IgdbZugang {
		if (!zugang) throw new IgdbKonfigError("IGDB-Zugangsdaten sind nicht hinterlegt.");
		return zugang;
	}

	async function tokenBesorgen(erzwingen = false): Promise<Geheimnis> {
		const z = zugangOderFehler();
		if (!erzwingen && token && token.laeuftAbUm > jetzt()) return token.token;

		const abfrage = new URLSearchParams({
			client_id: z.clientId,
			client_secret: z.clientSecret.offenlegen(),
			grant_type: "client_credentials",
		});
		token = await alsToken(await hole(`${TOKEN_URL}?${abfrage}`, { method: "POST" }));
		return token.token;
	}

	async function bremsen(): Promise<void> {
		const seit = jetzt() - letzteAnfrage;
		if (letzteAnfrage > 0 && seit < ABSTAND_MS) await warte(ABSTAND_MS - seit);
		letzteAnfrage = jetzt();
	}

	/**
	 * Eine Apicalypse-Anfrage an /games. Bei 401 wird das Token genau einmal
	 * erneuert und die Anfrage wiederholt.
	 */
	async function abfrage<T = IgdbSpielRoh>(koerper: string, zweiterVersuch = false): Promise<T[]> {
		const z = zugangOderFehler();
		const t = await tokenBesorgen(zweiterVersuch);
		await bremsen();

		const antwort = await hole(`${API_BASIS}/games`, {
			method: "POST",
			headers: {
				"Client-ID": z.clientId,
				Authorization: `Bearer ${t.offenlegen()}`,
				Accept: "application/json",
			},
			body: koerper,
		});

		if (antwort.status === 401 && !zweiterVersuch) return abfrage<T>(koerper, true);
		if (antwort.status === 401) throw new IgdbAuthError("IGDB hat das Token abgelehnt.");
		if (antwort.status === 429) throw new IgdbRateError("IGDB-Ratenlimit erreicht.");
		if (!antwort.ok) throw new IgdbAbrufError(`IGDB antwortete mit ${antwort.status}.`);

		const daten: unknown = await antwort.json();
		if (!Array.isArray(daten)) throw new IgdbAbrufError("IGDB-Antwort hat eine unerwartete Form.");
		return daten as T[];
	}

	const filter = `platforms = (${IGDB_PLATTFORM_IDS.join(",")}) & game_type != (${NIE_EIN_SPIEL.join(",")})`;

	return {
		/** Sind Zugangsdaten hinterlegt? Fuer die Anzeige, nie die Werte. */
		konfiguriert(): boolean {
			return zugang !== null;
		},

		/**
		 * Volltextsuche. Mods, Forks und Updates fallen schon hier heraus
		 * (siehe NIE_EIN_SPIEL), ebenso alles ohne PlayStation-Plattform -
		 * jede Suche, auch die Rueckfaelle (Entscheidung des Nutzers vom
		 * 16.09.2026: Eintraege ohne Plattformangabe sind keine Treffer).
		 *
		 * 30 Treffer statt 10: Bei DLC-reichen Titeln steht das Hauptspiel
		 * sonst gar nicht im Ergebnis (Batman: Arkham Knight an Position 13,
		 * For Honor an 23). Die Reihenfolge stellt ordneKandidaten her.
		 */
		async suche(begriff: string, optionen: { limit?: number } = {}): Promise<IgdbSpielRoh[]> {
			const text = apicalypseText(begriff);
			if (text === "") return [];
			return abfrage(`search "${text}"; fields ${IGDB_FELDER}; where ${filter}; limit ${optionen.limit ?? 30};`);
		},

		/**
		 * Exakter Name, Gross-/Kleinschreibung egal. IGDBs Volltextsuche
		 * uebergeht "THE FINALS" (liefert Final Fantasy) - die exakte Abfrage
		 * findet es. Ergaenzt die Volltextsuche, wenn kein Kandidat den
		 * Schluessel trifft.
		 */
		async nameExakt(text: string, limit = 10): Promise<IgdbSpielRoh[]> {
			const sauber = apicalypseText(text).replace(/\*/g, "");
			if (sauber === "") return [];
			return abfrage(`fields ${IGDB_FELDER}; where name ~ "${sauber}" & ${filter}; limit ${limit};`);
		},

		/**
		 * Teilstringsuche ueber den Namen - ein anderer Weg als die
		 * Volltextsuche und der einzige, der "That's You!" oder "We Were Here
		 * Too" findet. Nur als Rueckfall, weil sie kein Ranking kennt.
		 */
		async nameEnthaelt(text: string, limit = 30): Promise<IgdbSpielRoh[]> {
			const sauber = apicalypseText(text).replace(/\*/g, "");
			if (sauber === "") return [];
			return abfrage(`fields ${IGDB_FELDER}; where name ~ *"${sauber}"* & ${filter}; limit ${limit};`);
		},

		/** Bis zu 50 Spiele nach ID - eine Anfrage fuer das Auffrischen. */
		async nachIds(ids: readonly number[]): Promise<IgdbSpielRoh[]> {
			const sauber = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);
			if (sauber.length === 0) return [];
			return abfrage(`fields ${IGDB_FELDER}; where id = (${sauber.join(",")}); limit ${sauber.length};`);
		},

		/**
		 * Haendlereintraege (external_games) fuer bis zu 50 Spiele nach ID -
		 * eine Anfrage fuer die Disc-Fassung (7.6, Stufe 14). Ohne
		 * Plattformfilter: Die Spiele sind bereits verknuepft und geprueft.
		 */
		async physischNachIds(ids: readonly number[]): Promise<IgdbPhysischRoh[]> {
			const sauber = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);
			if (sauber.length === 0) return [];
			return abfrage<IgdbPhysischRoh>(
				`fields ${IGDB_FELDER_PHYSISCH}; where id = (${sauber.join(",")}); limit ${sauber.length};`,
			);
		},
	};
}

export type IgdbClient = ReturnType<typeof erstelleIgdbClient>;
