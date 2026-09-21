/**
 * upcitemdb als Rueckfall hinter eBay (Abschnitt 9.2, Stufe 17d).
 *
 * Die freie Schnittstelle braucht keine Zugangsdaten, drosselt aber hart:
 * gemessen am 18.09.2026 kam HTTP 429 nach jeweils sechs Abfragen mit rund
 * 90 Sekunden Pause, bei 100 Abfragen am Tag. Bis Stufe 17c holte deshalb
 * ein naechtlicher Job die Titel; seit der Scanner live aufloest, ist das
 * kein eigener Job mehr wert: Gefragt wird nur, wenn eBay den Code NICHT
 * kennt - also selten -, und dann genau einmal. Eine Drosselung ist kein
 * Fehler, sondern schlicht "kein Titel"; die Disc liegt in der Hand, der
 * Nutzer sucht dann von Hand.
 */

export type FetchFn = typeof fetch;

const ENDPUNKT = "https://api.upcitemdb.com/prod/trial/lookup";
const ZEITGRENZE_MS = 8000;

export function erstelleUpcitemdbClient(hole: FetchFn = fetch) {
	return {
		/**
		 * Der Titel zu einer GTIN, oder null. Wirft nie: Jeder Fehler - Netz,
		 * Drosselung, unerwartete Form - bedeutet "kein Titel". Diese Quelle
		 * ist der Rueckfall; sie darf das Scannen nicht aufhalten.
		 */
		async titelZuGtin(gtin: string): Promise<string | null> {
			try {
				const antwort = await hole(`${ENDPUNKT}?upc=${encodeURIComponent(gtin)}`, {
					signal: AbortSignal.timeout(ZEITGRENZE_MS),
				});
				if (!antwort.ok) return null;
				const daten = (await antwort.json()) as { items?: Array<{ title?: unknown }> };
				const titel = daten.items?.[0]?.title;
				return typeof titel === "string" && titel.trim() !== "" ? titel.trim() : null;
			} catch {
				return null;
			}
		},
	};
}

export type UpcitemdbClient = ReturnType<typeof erstelleUpcitemdbClient>;
