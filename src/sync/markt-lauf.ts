import type { ZuPruefen } from "../db/markt";
import { EbayAuthError, EbayKonfigError, EbayRateError, type EbayClient } from "../ebay/client";
import { vorbereiten } from "../domain/scan-titel";
import { angeboteFuer, MARKT_JE_POST, type MarktErgebnis } from "./markt";

/**
 * Ein Lauf der Markt-Action (Stufe 20i, Abschnitt 7.3).
 *
 * Laeuft in Node (scripts/markt-action.ts), nicht im Worker: Gefragt und
 * abgeglichen wird hier, ohne CPU-Grenze. Die Datenbank sieht der Lauf nie -
 * er liest und schreibt ausschliesslich ueber die Routen des Workers, und
 * dort liegen die Regeln (Schreiben nur in src/db/, Protokoll im selben
 * Batch, die Disc-Fassung aus der Datenbank). Kein zweiter Zugriffsweg
 * (Entscheidung des Nutzers vom 19.10.2026, Weg A).
 *
 * Reihenfolge, und warum:
 * 1. Beginn vermerken - VOR der Arbeit, damit ein Lauf, der stirbt, eine
 *    Spur hinterlaesst (10.1).
 * 2. Lage holen: alle faelligen Releases, Sammlung, Sperrliste.
 * 3. Je Portion von MARKT_JE_POST erst eBay fragen, dann EIN POST.
 * 4. Ausgang vermerken - auch nach einem Fehler, mit einem Code statt Text.
 *
 * Das Log der Action ist oeffentlich (das Repository ist es): Der Lauf gibt
 * nur Zahlen zurueck, nie Titel, Ids oder Preise.
 */

/** Ein Aufruf der Anwendung: Pfad relativ zur Wurzel, wie `fetch`. */
export type AppAufruf = (pfad: string, init?: RequestInit) => Promise<Response>;

/** Die Anwendung hat eine Anfrage nicht angenommen - Status, kein Text. */
export class AppAbgelehnt extends Error {
	constructor(readonly status: number) {
		super(`Die Anwendung antwortete mit ${status}.`);
	}
}

type Lage = {
	ziele: ZuPruefen[];
	sammlung: Array<{ spielId: number; titel: string }>;
	verworfen: Array<{ releaseId: number; itemIds: string[] }>;
};

type Fehlercode = "ratenlimit" | "zugang" | "konfig" | "app";

export type MarktLaufErgebnis = MarktErgebnis & {
	/** Releases, deren eBay-Abfrage einzeln scheiterte - morgen wieder faellig. */
	uebersprungen: number;
	/** Wie viele POSTs an die Schreibroute gingen - fuer die CPU-Messung je POST. */
	portionen: number;
};

/** Ein Aufruf der Anwendung mit JSON hin und zurueck - auch fuer die Store-Action (Stufe 20j). */
export async function json<T>(app: AppAufruf, pfad: string, koerper?: unknown): Promise<T> {
	const antwort = await app(
		pfad,
		koerper === undefined
			? undefined
			: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(koerper) },
	);
	if (antwort.status !== 200) throw new AppAbgelehnt(antwort.status);
	return (await antwort.json()) as T;
}

export async function marktLauf(
	app: AppAufruf,
	ebay: EbayClient,
	optionen: { jePost?: number } = {},
): Promise<MarktLaufErgebnis> {
	const jePost = optionen.jePost ?? MARKT_JE_POST;
	const zahlen = { geprueft: 0, mitPreis: 0, discBelegt: 0, ohneAngebot: 0 };
	let uebersprungen = 0;
	let portionen = 0;
	let fehler: Fehlercode | undefined;

	await json(app, "/api/sync/markt/ausgang", { art: "begonnen" });
	try {
		if (!ebay.konfiguriert()) throw new EbayKonfigError("eBay-Zugangsdaten sind nicht hinterlegt.");
		const lage = await json<Lage>(app, "/api/sync/markt/lage");
		// Die Sammlung EINMAL zerlegen, nicht je Angebot (CLAUDE.md).
		const sammlung = vorbereiten(lage.sammlung);
		const sperre = new Map(lage.verworfen.map((v) => [v.releaseId, new Set(v.itemIds)]));

		for (let i = 0; i < lage.ziele.length && fehler === undefined; i += jePost) {
			const portion = [];
			for (const ziel of lage.ziele.slice(i, i + jePost)) {
				try {
					const { angebote, rohangebote } = await angeboteFuer(ebay, ziel, sammlung, sperre.get(ziel.releaseId));
					portion.push({ releaseId: ziel.releaseId, angebote, rohangebote });
				} catch (f) {
					if (f instanceof EbayRateError) fehler = "ratenlimit";
					else if (f instanceof EbayAuthError) fehler = "zugang";
					else if (f instanceof EbayKonfigError) fehler = "konfig";
					else {
						// Ein einzelner Fehlschlag kostet nicht den Lauf: Das Release
						// bleibt ungestempelt und ist morgen wieder faellig.
						uebersprungen++;
						continue;
					}
					break;
				}
			}
			// Was vor einem Ratenlimit schon gefragt ist, wird noch geschrieben.
			if (portion.length === 0) continue;
			const g = await json<typeof zahlen>(app, "/api/sync/markt/ergebnisse", { ergebnisse: portion });
			portionen++;
			zahlen.geprueft += g.geprueft;
			zahlen.mitPreis += g.mitPreis;
			zahlen.discBelegt += g.discBelegt;
			zahlen.ohneAngebot += g.ohneAngebot;
		}
	} catch (f) {
		// Auch ein Netzfehler zur Anwendung endet mit einem vermerkten Ausgang,
		// nicht mit einem stillen Abbruch.
		fehler = f instanceof EbayKonfigError ? "konfig" : "app";
	}

	const ausgang = await json<MarktErgebnis>(app, "/api/sync/markt/ausgang", {
		art: "ende",
		...zahlen,
		...(fehler ? { fehler } : {}),
	});
	return { ...ausgang, uebersprungen, portionen };
}
