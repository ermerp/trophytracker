import { erstelleStoreClient, type StoreClient } from "../src/psn/store";
import { fakeFetch, type Aufruf } from "./psn-fake";

/**
 * Nachgebaute Seiten des PlayStation Store.
 *
 * Kein Test geht ins Netz, und keine Zeile stammt aus einer echten Antwort -
 * die FORM ist die gemessene (Abschnitt 7.4): ein
 * `<script id="env:…" type="application/json">`-Block mit `{args, cache}`,
 * darin `Concept:`, `Product:` und `GameCTA:`.
 */

/** Ein Kaufknopf, wie der Store ihn nennt. */
export type FakeCta = {
	typ: string;
	produktId: string;
	sku?: string;
	grundCents?: number;
	preisCents?: number;
	marke?: string[];
	/** Ohne Preis - so sieht der Knopf des zweiten Bausteins derselben Seite aus. */
	ohnePreis?: boolean;
};

function ctaEintrag(cta: FakeCta): [string, unknown] {
	const sku = cta.sku ?? `${cta.produktId}-E001`;
	const schluessel = `GameCTA:${cta.typ}:${cta.typ}:${sku}:OUTRIGHT`;
	if (cta.ohnePreis) return [schluessel, { id: schluessel, __typename: "GameCTA", type: cta.typ }];
	const grund = cta.grundCents ?? 1999;
	const preis = cta.preisCents ?? grund;
	return [
		schluessel,
		{
			id: schluessel,
			__typename: "GameCTA",
			type: cta.typ,
			price: {
				__typename: "Price",
				basePriceValue: grund,
				discountedValue: preis,
				currencyCode: "EUR",
				serviceBranding: cta.marke ?? ["NONE"],
				endTime: null,
				campaignId: null,
				isFree: false,
			},
		},
	];
}

/** Ein `env:`-Block, so wie die Seite ihn traegt. */
export function block(args: Record<string, string>, cache: Record<string, unknown>): string {
	return `<script id="env:${Math.random().toString(16).slice(2)}" type="application/json">${JSON.stringify({
		args,
		overrides: { theme: "dark", locale: "de-de" },
		cache,
		translations: {},
	})}</script>`;
}

/**
 * Eine Produktseite. `vorspann` ist Fuellmaterial - die echte Seite traegt
 * den Block erst nach rund 57 KB, und der Stromleser muss ihn trotzdem
 * finden.
 */
export function produktSeite(
	produktId: string,
	ctas: FakeCta[],
	optionen: { name?: string; vorspann?: number; vorblock?: boolean } = {},
): string {
	const fuellung = "<div>x</div>".repeat(Math.floor((optionen.vorspann ?? 0) / 12));
	// Der erste Baustein traegt denselben Knopf OHNE Preis - genau die Falle
	// aus der Messung vom 02.10.2026 (Horizon Forbidden West).
	const vor = optionen.vorblock
		? block(
				{ productId: produktId },
				Object.fromEntries([
					[`Product:${produktId}`, { id: produktId, __typename: "Product", name: optionen.name ?? "Spiel" }],
					ctaEintrag({ typ: "ADD_TO_CART", produktId, ohnePreis: true }),
				]),
			)
		: "";
	return (
		`<!doctype html><html><body>${fuellung}${vor}` +
		block(
			{ productId: produktId },
			Object.fromEntries([
				[`Product:${produktId}`, { id: produktId, __typename: "Product", name: optionen.name ?? "Spiel" }],
				...ctas.map(ctaEintrag),
			]),
		) +
		"</body></html>"
	);
}

/** Eine Concept-Seite mit ihrer Produktliste. */
export function conceptSeite(
	conceptId: string,
	produkte: { id: string; name: string | null }[],
	optionen: { standard?: string | null; angekuendigt?: boolean; vorspann?: number } = {},
): string {
	const fuellung = "<div>x</div>".repeat(Math.floor((optionen.vorspann ?? 0) / 12));
	const cache: Record<string, unknown> = {
		[`Concept:${conceptId}`]: {
			id: conceptId,
			__typename: "Concept",
			defaultProduct: optionen.standard === null ? null : { __ref: `Product:${optionen.standard ?? produkte[0]?.id}` },
			isAnnounce: optionen.angekuendigt === true,
			products: produkte.map((p) => ({ __ref: `Product:${p.id}` })),
		},
	};
	for (const p of produkte) cache[`Product:${p.id}`] = { id: p.id, __typename: "Product", name: p.name };
	// Ein Baustein VOR dem richtigen, der nur den Namen traegt - die echte
	// Seite hat zwoelf bis vierzehn davon.
	return (
		`<!doctype html><html><body>${fuellung}` +
		block({ conceptId }, { [`Concept:${conceptId}`]: { id: conceptId, __typename: "Concept" } }) +
		block({ conceptId }, cache) +
		"</body></html>"
	);
}

export function htmlAntwort(text: string, status = 200): Response {
	return new Response(status >= 300 && status < 400 ? null : text, {
		status,
		headers: status >= 300 && status < 400 ? { location: "/" } : { "content-type": "text/html; charset=utf-8" },
	});
}

/**
 * Client mit vorgegebenen Seiten, nach Pfadmuster. Der letzte Eintrag gilt
 * fuer alle weiteren Aufrufe desselben Musters.
 */
export function fakeStore(seiten: Array<[RegExp, () => Response]>): { client: StoreClient; aufrufe: Aufruf[] } {
	const { fetch, aufrufe } = fakeFetch(seiten);
	return { client: erstelleStoreClient(fetch), aufrufe };
}

/** Ein Store, der auf jede Anfrage mit 302 antwortet - "kennt der Store nicht". */
export function storeOhne(): StoreClient {
	return fakeStore([[/store\.playstation\.com/, () => htmlAntwort("", 302)]]).client;
}
