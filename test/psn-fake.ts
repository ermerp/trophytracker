/** Aufgezeichnete Antwortformen der PSN-Schnittstelle. Kein Test geht ins Netz. */

export const TOKEN_ANTWORT = {
	access_token: "access-token-xyz",
	refresh_token: "refresh-token-xyz",
	expires_in: 3600,
	refresh_token_expires_in: 5184000,
	id_token: "id",
	scope: "psn:mobile.v2.core psn:clientapp",
	token_type: "bearer",
};

export function trophySeite(offset: number, total: number, limit = 100): string {
	const anzahl = Math.max(0, Math.min(limit, total - offset));
	return JSON.stringify({
		trophyTitles: Array.from({ length: anzahl }, (_, i) => ({
			npCommunicationId: `NPWR${offset + i}`,
			trophyTitleName: `Spiel ${offset + i}`,
			progress: 50,
		})),
		totalItemCount: total,
		offset,
		limit,
	});
}

export type Aufruf = { url: string; init?: RequestInit };

/**
 * Baut ein fetch, das nach URL-Muster antwortet, und protokolliert die Aufrufe.
 */
export function fakeFetch(
	regeln: Array<[RegExp, () => Response]>,
): { fetch: typeof fetch; aufrufe: Aufruf[] } {
	const aufrufe: Aufruf[] = [];

	const fn = (async (eingabe: RequestInfo | URL, init?: RequestInit) => {
		const url = String(eingabe);
		aufrufe.push({ url, init });

		for (const [muster, antwort] of regeln) {
			if (muster.test(url)) return antwort();
		}
		return new Response("nicht gefunden", { status: 404 });
	}) as unknown as typeof fetch;

	return { fetch: fn, aufrufe };
}

export const jsonAntwort = (koerper: unknown, status = 200) =>
	new Response(JSON.stringify(koerper), {
		status,
		headers: { "content-type": "application/json" },
	});

export const redirectAntwort = (code: string) =>
	new Response(null, {
		status: 302,
		headers: {
			location: `com.scee.psxandroid.scecompcall://redirect/?code=${code}&cid=x`,
		},
	});
