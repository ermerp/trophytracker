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

/**
 * Die drei Abrufe zu den Einzeltrophaeen (Stufe 19b) und das Level.
 *
 * Nachgebaut, nicht kopiert (CLAUDE.md): Die Form stammt aus der Messung vom
 * 01.10.2026 - Zahlen als Text, `earnedDateTime` nur an erspielten,
 * `trophyProgressTargetValue` nur an einzelnen.
 */
export function trophaeenDefinitionen(anzahl: number, hatGruppen = false) {
	const stufen = ["platinum", "gold", "silver", "bronze"];
	return {
		totalItemCount: anzahl,
		hasTrophyGroups: hatGruppen,
		trophies: Array.from({ length: anzahl }, (_, i) => ({
			trophyId: i,
			trophyType: i === 0 ? "platinum" : stufen[(i % 3) + 1],
			trophyName: `Trophäe ${i}`,
			trophyDetail: `Tu etwas zum ${i}. Mal.`,
			trophyIconUrl: `https://beispiel.test/t${i}.png`,
			trophyHidden: i % 5 === 0,
			trophyGroupId: hatGruppen && i > anzahl - 3 ? "001" : "default",
			...(i === 2 ? { trophyProgressTargetValue: "20" } : {}),
		})),
	};
}

export function trophaeenStand(anzahl: number, erspielt: number) {
	return {
		trophies: Array.from({ length: anzahl }, (_, i) => ({
			trophyId: i,
			earned: i < erspielt,
			...(i < erspielt ? { earnedDateTime: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z` } : {}),
			trophyEarnedRate: String(((i * 7) % 90) + 1),
			...(i === 2 && i >= erspielt ? { progress: "15", progressRate: "75" } : {}),
		})),
	};
}

export const GRUPPEN_ANTWORT = {
	trophyGroups: [
		{ trophyGroupId: "default", trophyGroupName: "Hauptspiel", definedTrophies: { bronze: 5, silver: 2, gold: 1, platinum: 1 } },
		{ trophyGroupId: "001", trophyGroupName: "Zusatzinhalt", definedTrophies: { bronze: 2, silver: 0, gold: 0, platinum: 0 } },
	],
};

export const SUMMARY_ANTWORT = {
	trophyLevel: 514,
	trophyPoint: 310_380,
	trophyLevelBasePoint: 310_140,
	trophyLevelNextPoint: 311_940,
	progress: 13,
};

/**
 * Die Regeln fuer `fakeFetch`. Die Reihenfolge zaehlt: Der eigene Stand
 * steht unter `/users/me/...` und muss VOR den Definitionen geprueft werden,
 * sonst faengt deren Muster ihn mit ab.
 */
export function trophaeenRegeln(
	anzahl = 8,
	erspielt = 3,
	hatGruppen = false,
): Array<[RegExp, () => Response]> {
	return [
		[/users\/me\/npCommunicationIds\/.*\/trophies/, () => jsonAntwort(trophaeenStand(anzahl, erspielt))],
		[/npCommunicationIds\/.*\/trophyGroups\/all\/trophies/, () => jsonAntwort(trophaeenDefinitionen(anzahl, hatGruppen))],
		[/npCommunicationIds\/.*\/trophyGroups(\?|$)/, () => jsonAntwort(GRUPPEN_ANTWORT)],
		[/trophySummary/, () => jsonAntwort(SUMMARY_ANTWORT)],
	];
}
