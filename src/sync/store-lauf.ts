import type { ZuPruefen } from "../db/store";
import type { StoreRueckmeldung } from "../db/store";
import type { StoreClient } from "../psn/store";
import { AppAbgelehnt, json, type AppAufruf } from "./markt-lauf";
import { pruefeZiel, STORE_JE_POST, type StoreActionErgebnis } from "./store";

/**
 * Ein Lauf der Store-Action (Stufe 20j, Abschnitt 7.4) - nach dem Muster der
 * Markt-Action (`marktLauf`, 20i).
 *
 * Laeuft in Node (scripts/store-action.ts), nicht im Worker: Im Cron kostete
 * ein Aufruf zu zehn Releases 29-103 ms CPU (16.2). Gefragt wird hier, ohne
 * CPU-Grenze; die Datenbank sieht der Lauf nie - er liest und schreibt
 * ausschliesslich ueber die Routen des Workers, und dort liegen die Regeln
 * (Schreiben nur in src/db/, Protokoll im selben Batch).
 *
 * Reihenfolge, und warum:
 * 1. Beginn vermerken - VOR der Arbeit, damit ein Lauf, der stirbt, eine
 *    Spur hinterlaesst (10.1).
 * 2. Lage holen: alle faelligen Releases.
 * 3. Concept-Ids fuer die, denen eine fehlt - ueber den Worker, weil die
 *    IGDB-Zugangsdaten dort leben. Antwortet er nicht, geht es mit dem
 *    weiter, was da ist (wie bisher im Schritt).
 * 4. Je Release den Store fragen (`pruefeZiel`, derselbe Weg wie der
 *    Einzelabruf im Worker), je STORE_JE_POST EIN POST.
 * 5. Ausgang vermerken - auch nach einem Fehler, mit einem Code statt Text.
 *
 * Das Log der Action ist oeffentlich: Der Lauf gibt nur Zahlen zurueck.
 */

type Zahlen = Pick<StoreActionErgebnis, "geprueft" | "mitPreis" | "imAngebot" | "imPlusKatalog" | "zugeordnet" | "ohneTreffer">;

export type StoreLaufErgebnis = StoreActionErgebnis & {
	/** Releases, deren Abruf einzeln scheiterte oder unlesbar war - morgen wieder faellig. */
	uebersprungen: number;
	/** Wie viele POSTs an die Schreibroute gingen - fuer die CPU-Messung je POST. */
	portionen: number;
	/** Anfragen an den Store - fuer den Vergleich mit dem Probelauf vom 19.10.2026. */
	anfragen: number;
};

export async function storeLauf(
	app: AppAufruf,
	store: StoreClient,
	optionen: { jePost?: number } = {},
): Promise<StoreLaufErgebnis> {
	const jePost = optionen.jePost ?? STORE_JE_POST;
	const zahlen: Zahlen = { geprueft: 0, mitPreis: 0, imAngebot: 0, imPlusKatalog: 0, zugeordnet: 0, ohneTreffer: 0 };
	let uebersprungen = 0;
	let portionen = 0;
	let anfragen = 0;
	let fehler: "app" | undefined;

	const schreiben = async (portion: StoreRueckmeldung[]) => {
		if (portion.length === 0) return;
		const g = await json<Zahlen>(app, "/api/sync/store/ergebnisse", { ergebnisse: portion });
		portionen++;
		for (const k of Object.keys(zahlen) as (keyof Zahlen)[]) zahlen[k] += g[k];
	};

	await json(app, "/api/sync/store/ausgang", { art: "begonnen" });
	try {
		const { ziele } = await json<{ ziele: ZuPruefen[] }>(app, "/api/sync/store/lage");

		// Wer eine Concept-Id braucht, entscheidet die Route - hier nur die
		// Kandidaten ohne beide Ids, damit ein Lauf ohne Bedarf nicht fragt.
		const ohneId = ziele.filter((z) => z.conceptId === null && z.produktId === null);
		if (ohneId.length > 0) {
			try {
				const { concepts } = await json<{ concepts: Array<{ gameId: number; conceptId: string }> }>(
					app,
					"/api/sync/store/concepts",
					{ releaseIds: ohneId.map((z) => z.releaseId) },
				);
				const je = new Map(concepts.map((c) => [c.gameId, c.conceptId]));
				for (const z of ziele) z.conceptId = je.get(z.gameId) ?? z.conceptId;
			} catch (f) {
				// Ohne IGDB (503) oder bei einem Ausfall (502): weiter mit dem, was da ist.
				if (!(f instanceof AppAbgelehnt)) throw f;
			}
		}

		// Dieselbe Concept-Seite nicht zweimal - ein Concept deckt alle
		// Fassungen eines Spiels ab (Cross-Gen). Gilt nur fuer diesen Lauf.
		const conceptPuffer = new Map<string, Awaited<ReturnType<StoreClient["holeConcept"]>>>();
		let portion: StoreRueckmeldung[] = [];
		for (const ziel of ziele) {
			const aus = await pruefeZiel(store, ziel, conceptPuffer);
			anfragen += aus.anfragen;
			if (aus.art === "abruffehler" || (aus.art === "befund" && aus.befund === "unlesbar")) {
				uebersprungen++;
				continue;
			}
			portion.push(
				aus.art === "preis"
					? { releaseId: ziel.releaseId, preis: aus.ergebnis }
					: { releaseId: ziel.releaseId, befund: aus.befund as Exclude<typeof aus.befund, "preis" | "unlesbar">, nurKatalog: aus.nurKatalog },
			);
			if (portion.length >= jePost) {
				await schreiben(portion);
				portion = [];
			}
		}
		await schreiben(portion);
	} catch {
		// Auch ein Netzfehler zur Anwendung endet mit einem vermerkten Ausgang,
		// nicht mit einem stillen Abbruch. Ein unerwarteter Fehler im Abgleich
		// ebenso - die Meldung bleibt ein Code.
		fehler = "app";
	}

	const ausgang = await json<StoreActionErgebnis>(app, "/api/sync/store/ausgang", {
		art: "ende",
		...zahlen,
		...(fehler ? { fehler } : {}),
	});
	return { ...ausgang, uebersprungen, portionen, anfragen };
}
