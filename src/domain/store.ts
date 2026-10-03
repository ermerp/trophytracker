import type { Plattform } from "./titel";
import { titelSchluessel } from "./titel";

/**
 * Die Auswertung der PlayStation-Store-Seiten (Abschnitt 7.4, Stufe 21).
 *
 * Reine Funktionen, ohne Netz und ohne Datenbank testbar. Der Abruf selbst
 * steht in src/psn/store.ts.
 *
 * **Warum die Seite und nicht GraphQL** (gemessen am 02.10.2026): Sonys
 * GraphQL-Endpunkt ist unauthentifiziert erreichbar, fuehrt aber eine
 * Allowlist - ein unbekannter Hash *und* ein mitgesendeter Query-Text
 * antworten beide mit 400 "Query not whitelisted". Die Hashes sind
 * Pruefsummen ueber den Query-Text aus Sonys Bundle und rotieren mit jedem
 * Store-Deploy. Die Produktseite dagegen liefert den Preis serverseitig
 * gerendert mit, ohne Anmeldung und ohne User-Agent, und die robots.txt des
 * Store sperrt genau zwei Pfade (/chihiro-api/, /event/batch) - die
 * Produktseite ist nicht darunter, anders als die Suche bei rebuy, medimops
 * und Geizhals (7.3).
 */

/**
 * Ein Preis, so wie der Store ihn an einem Kaufknopf nennt. Werte in Cent.
 */
export type StorePreis = {
	preisCents: number;
	grundpreisCents: number;
	waehrung: string;
	istSale: boolean;
};

/** Was zu einem Release am Ende in der Datenbank steht. */
export type StoreErgebnis = StorePreis & {
	produktId: string;
	produktName: string | null;
	imPlusKatalog: boolean;
};

/**
 * Warum kein Preis da ist. Unterscheidbar und nicht als Boolean (Abschnitt 3)
 * - "IGDB kennt das Spiel nicht" und "Sony verkauft es nicht mehr" sind
 * verschiedene Befunde, und nur der zweite ist eine Aussage ueber den Titel.
 */
export const STORE_BEFUNDE = ["preis", "ohne_id", "delistet", "ohne_kauf", "fremd", "unlesbar", "plattform"] as const;
export type StoreBefund = (typeof STORE_BEFUNDE)[number];

/**
 * Sonys Titel-Id nennt die Plattform in ihrem Praefix, und die Produkt-Id
 * traegt sie in der Mitte: EP9000-**CUSA13323_00**-GHOSTSHIP0000000.
 *
 * Das ist der einzige verlaessliche Weg, auf einer Concept-Seite das Produkt
 * der richtigen Plattform zu finden: Die Eintraege der Nebenprodukte tragen
 * nur `id` und `name`, keine Plattformangabe.
 */
export const PLATTFORM_PRAEFIX: Record<Plattform, readonly string[]> = {
	PS5: ["PPSA"],
	PS4: ["CUSA"],
	PS3: ["BLES", "BLUS", "BCES", "BCUS", "NPEB", "NPUB", "NPHB", "NPEA"],
	PSVITA: ["PCSB", "PCSE", "PCSF", "PCSA", "VLES", "VCES"],
};

/**
 * Knopftypen, die ein Kauf sind. `UPSELL_*` ist keiner - und `UNAVAILABLE`
 * heisst "gibt es, ist aber nicht kaeuflich" (gemessen an Mass Effect:
 * Andromeda).
 */
const KAUF_TYPEN = new Set(["ADD_TO_CART", "BUY_NOW", "PRE_ORDER"]);

/** Der Knopf, der die Mitgliedschaft im PS-Plus-Katalog anzeigt. */
const PLUS_KATALOG = "UPSELL_PS_PLUS_GAME_CATALOG";

/** Ein Kaufknopf, so weit wir ihn anfassen. */
export type CtaRoh = {
	type?: string;
	price?: {
		basePriceValue?: number;
		discountedValue?: number;
		currencyCode?: string;
		serviceBranding?: string[];
	} | null;
};

/** Der `cache` eines env-Blocks, so weit wir ihn anfassen. */
export type CacheRoh = Record<string, unknown>;

/**
 * Die Bloecke einer Store-Seite: `<script id="env:…" type="application/json">`.
 *
 * Eine Seite traegt ZWOELF BIS VIERZEHN davon, einen je Oberflaechenbaustein
 * (gemessen am 02.10.2026). Der Aufrufer sucht sich den richtigen heraus -
 * `preisBlock` und `conceptBlock` wissen, welcher das ist.
 */
const BLOCK_ANFANG = '<script id="env:[^"]*" type="application/json">';

/**
 * Der naechste vollstaendige Block ab `ab`, oder `null`.
 *
 * Gibt `ende` mit zurueck, damit ein Aufrufer, der die Seite als Strom liest,
 * weiss, wo er weitersuchen muss - und wann er abbrechen darf.
 */
export function naechsterBlock(text: string, ab = 0): { daten: unknown; anfang: number; ende: number } | null {
	// Der Ausdruck entsteht je Aufruf: Ein geteiltes `lastIndex` am Modul
	// waere Zustand zwischen zwei Abrufen, und davon haette niemand etwas.
	const suche = new RegExp(BLOCK_ANFANG, "g");
	suche.lastIndex = ab;
	const treffer = suche.exec(text);
	if (!treffer) return null;
	const inhaltAb = treffer.index + treffer[0].length;
	const ende = text.indexOf("</script>", inhaltAb);
	// Noch nicht vollstaendig geladen: Der Aufrufer liest weiter.
	if (ende < 0) return null;
	try {
		return { daten: JSON.parse(text.slice(inhaltAb, ende)), anfang: treffer.index, ende: ende + 9 };
	} catch {
		// Ein Block, der kein JSON ist, ist nicht unser Block.
		return { daten: null, anfang: treffer.index, ende: ende + 9 };
	}
}

function cacheVon(daten: unknown): CacheRoh | null {
	const c = (daten as { cache?: unknown } | null)?.cache;
	return c && typeof c === "object" ? (c as CacheRoh) : null;
}

/**
 * Ist das der Block mit den Kaufknoepfen dieses Produkts?
 *
 * Es genuegt NICHT, nach irgendeinem `GameCTA:` zu suchen: Mehrere Bausteine
 * einer Seite tragen einen `ADD_TO_CART`, und nur einer davon fuehrt den
 * Preis mit. Bei Horizon Forbidden West hat der Block bei Byte 50 111 einen
 * Knopf ohne Preis und der bei 62 420 denselben Knopf mit Preis - wer den
 * ersten nimmt, bekommt nichts (gemessen am 02.10.2026).
 */
export function istPreisBlock(daten: unknown, produktId: string): CacheRoh | null {
	const c = cacheVon(daten);
	if (!c || !c[`Product:${produktId}`]) return null;
	const hatPreis = Object.entries(c).some(
		([k, v]) =>
			k.startsWith("GameCTA:") &&
			k.includes(produktId) &&
			typeof (v as CtaRoh)?.price?.basePriceValue === "number",
	);
	return hatPreis ? c : null;
}

/** Der Concept-Eintrag eines Blocks - der mit der Produktliste, nicht der mit dem Namen. */
export function istConceptBlock(daten: unknown): { cache: CacheRoh; concept: ConceptRoh } | null {
	const c = cacheVon(daten);
	if (!c) return null;
	const schluessel = Object.keys(c).find((k) => k.startsWith("Concept:"));
	if (!schluessel) return null;
	const concept = c[schluessel] as ConceptRoh;
	return concept && "products" in concept ? { cache: c, concept } : null;
}

export type ConceptRoh = {
	defaultProduct?: { __ref?: string } | null;
	products?: { __ref?: string }[] | null;
	isAnnounce?: boolean;
};

/** Ein Produkt, so wie die Concept-Seite es nennt. */
export type ProduktRoh = { id: string; name: string | null };

/**
 * Die Produkte eines Concepts, in der Reihenfolge, in der sie gefragt werden.
 *
 * Drei Regeln, jede an den echten 79 Releases gemessen (02.10.2026):
 *
 * 1. **Titelschluessel zuerst.** `titelSchluessel` ist genau dafuer da und
 *    traegt die Editionszusaetze bereits weg. 42 von 57 Treffern kommen so
 *    zustande, und er verwirft zugleich die Demos: "Kitchen [demo]" hat mit
 *    "resident evil 7 biohazard" nichts zu tun.
 * 2. **Dann Sonys Standardprodukt.** Es steht als `defaultProduct` am
 *    Concept und ist Sonys eigene Wahl - sie traegt 15 weitere Treffer, auch
 *    dort, wo der Name uebersetzt ist ("Mittelerde: Schatten des Krieges").
 * 3. **Ein Rueckfall nur bei verwandtem Namen.** Ohne diese Schranke nahm
 *    der Rueckfall fuer Resident Evil 7 das Produkt "Kitchen [demo]" fuer
 *    0,25 EUR. Verwandt heisst: ein Schluessel steckt im anderen.
 *
 * Alles andere bleibt ungefragt. Lieber "unbekannt" als der Preis eines
 * fremden Produkts - dieselbe Linie wie beim Titelabgleich in 7.3.
 *
 * **Innerhalb der Treffergruppe gewinnt der KUERZESTE Name, nicht Sonys
 * Standardprodukt** (Nachtrag 21c). Das war im ersten Entwurf umgekehrt und
 * kostete bei *Outcast: Second Contact* den Faktor 3,3: Das Concept fuehrt
 * "Outcast - Second Contact" fuer 14,99 EUR und "Outcast - Second Contact
 * Deluxe Edition" fuer 49,99 EUR, Sonys Standard ist die Deluxe - und weil
 * `titelSchluessel` "deluxe edition" wegtraegt, haben BEIDE denselben
 * Schluessel. Wer schon weiss, dass alle Kandidaten dasselbe Spiel sind,
 * braucht Sonys Vorschlag nicht mehr: Dann ist der schlichteste Name das
 * Basisspiel. Umgekehrt bleibt der Standard die beste Auskunft, wo der Name
 * NICHT passt - dort gibt es keinen Titelbeleg.
 *
 * Der Fall faellt nur auf, wenn der Zusatz in der Abkuerzungsliste von
 * `titelSchluessel` steht: "SnowRunner - 5-Year Anniversary Edition" wird zu
 * "snowrunner 5 year anniversary" und landet gar nicht erst in der Gruppe.
 * Gemessen am 03.10.2026 ueber alle 57 Treffer: genau ein Fall.
 */
export function produktReihe(
	produkte: readonly ProduktRoh[],
	spielTitel: string,
	plattform: Plattform,
	standardId: string | null,
): ProduktRoh[] {
	const praefixe = PLATTFORM_PRAEFIX[plattform] ?? [];
	const kandidaten = produkte.filter((p) => praefixe.some((pre) => p.id.includes(`-${pre}`)));
	const schluessel = titelSchluessel(spielTitel);
	const gleich = kandidaten.filter((p) => p.name !== null && titelSchluessel(p.name) === schluessel);
	const verwandt = (p: ProduktRoh) => {
		if (p.name === null) return false;
		const k = titelSchluessel(p.name);
		return k !== "" && (k.includes(schluessel) || schluessel.includes(k));
	};
	const rest = kandidaten.filter((p) => !gleich.includes(p) && (p.id === standardId || verwandt(p)));
	const laenge = (p: ProduktRoh) => p.name?.length ?? 0;
	const standardZuerst = (p: ProduktRoh) => (p.id === standardId ? -1 : 0);
	// In der Treffergruppe ist der schlichteste Name das Basisspiel; Sonys
	// Standardprodukt entscheidet dort nur bei gleicher Laenge.
	const kuerzesterZuerst = (a: ProduktRoh, b: ProduktRoh) =>
		laenge(a) - laenge(b) || standardZuerst(a) - standardZuerst(b);
	// Ausserhalb gibt es keinen Titelbeleg - dort ist Sonys Wahl die beste.
	const standardVorn = (a: ProduktRoh, b: ProduktRoh) =>
		standardZuerst(a) - standardZuerst(b) || laenge(a) - laenge(b);
	return [...gleich].sort(kuerzesterZuerst).concat([...rest].sort(standardVorn));
}

/** Die Produktliste eines Concept-Blocks, mit den Namen aus demselben Cache. */
export function produkteAus(cache: CacheRoh, concept: ConceptRoh): ProduktRoh[] {
	return (concept.products ?? [])
		.map((p) => p.__ref?.slice("Product:".length))
		.filter((id): id is string => typeof id === "string" && id.length > 0)
		.map((id) => ({ id, name: (cache[`Product:${id}`] as { name?: string } | undefined)?.name ?? null }));
}

/** Sonys Standardprodukt eines Concepts, falls es eines nennt. */
export function standardProdukt(concept: ConceptRoh): string | null {
	return concept.defaultProduct?.__ref?.slice("Product:".length) ?? null;
}

/**
 * Die Kaufknoepfe, die zu DIESEM Produkt gehoeren.
 *
 * Der Schluessel eines Knopfs traegt die Sku-Id und darin die Produkt-Id:
 * `GameCTA:ADD_TO_CART:ADD_TO_CART:EP9000-PPSA01521_00-FORBIDDENWESTPS5-E005:OUTRIGHT`.
 * Danach wird gefiltert, und das ist nicht Vorsicht: Eine Produktseite traegt
 * weiter unten einen Baustein mit den anderen FASSUNGEN des Spiels, samt
 * ihren Knoepfen und Preisen (bei Horizon Forbidden West drei Stueck). Ohne
 * den Filter koennte der Preis einer Complete Edition am Basisspiel landen.
 */
export function ctasAus(cache: CacheRoh, produktId: string): CtaRoh[] {
	return Object.entries(cache)
		.filter(([k]) => k.startsWith("GameCTA:") && k.includes(produktId))
		.map(([, v]) => v as CtaRoh);
}

/**
 * Der Kaufpreis aus den Knoepfen einer Produktseite.
 *
 * **Nicht `activeCtaId`** - das war der erste Entwurf und er war falsch: Der
 * aktive Knopf ist bei Abo-Titeln die PS-Plus-Werbung. Baldur's Gate 3 kam
 * so mit 0,00 EUR heraus, obwohl der Kauf 48,99 EUR kostet (gemessen am
 * 02.10.2026, 17 von 57 Titeln betroffen). Gesucht ist der Knopf, der
 * wirklich kauft: ein Kauftyp mit `serviceBranding` = NONE.
 */
export function kaufpreisAus(ctas: readonly CtaRoh[]): StorePreis | null {
	const kauf = ctas.find(
		(c) =>
			KAUF_TYPEN.has(c.type ?? "") &&
			(c.price?.serviceBranding ?? []).includes("NONE") &&
			typeof c.price?.discountedValue === "number" &&
			typeof c.price?.basePriceValue === "number",
	);
	if (!kauf?.price) return null;
	const preisCents = kauf.price.discountedValue as number;
	const grundpreisCents = kauf.price.basePriceValue as number;
	return {
		preisCents,
		grundpreisCents,
		waehrung: kauf.price.currencyCode ?? "EUR",
		istSale: preisCents < grundpreisCents,
	};
}

/**
 * Plattformen, fuer die der Web-Store keine Produktseiten mehr fuehrt
 * (Nachtrag 21d, gemessen am 03.10.2026).
 *
 * PS3 und Vita sind nur noch an der Konsole erreichbar. Gemessen auf drei
 * Wegen, alle mit demselben Ergebnis:
 *
 * - Von 30 reinen PS3-Spielen der Sammlung haben **2** ueberhaupt eine
 *   Concept-Id bei IGDB, und **keine** der beiden Concept-Seiten fuehrt ein
 *   Produkt mit PS3-Praefix - nur PS4- und PS5-Fassungen.
 * - Bei Vita dasselbe: 2 von 20 mit Concept-Id, **0** mit Vita-Produkt.
 * - Drei echte, dokumentierte PS3-Produkt-Ids direkt abgerufen
 *   (`EP9000-NPEA00412_00-MOVEFITBUND00001` und zwei weitere): **alle 302**,
 *   in `de-de` wie in `en-us`.
 *
 * Fuer diese Plattformen fragt der Schritt deshalb gar nicht erst - weder
 * IGDB noch den Store. Der Preis bleibt "unbekannt", und das ist hier keine
 * Luecke, sondern die Auskunft (Abschnitt 3).
 */
export const OHNE_WEBSTORE: readonly Plattform[] = ["PS3", "PSVITA"];

/**
 * Eine eingefuegte Store-Adresse auswerten (Nachtrag 21d).
 *
 * Erlaubt ist, was beim Nachtragen von Hand tatsaechlich anfaellt: die aus
 * dem Browser kopierte Adresse einer Produkt- oder Concept-Seite, in jeder
 * Sprachfassung, oder die blosse Id. Mehr nicht - wer hier raet, traegt den
 * Preis eines fremden Spiels ein.
 *
 * Die beiden Formen tun Verschiedenes: Eine **Produkt**-Id haengt am Release
 * und gilt fuer genau eine Plattform. Eine **Concept**-Id haengt am Spiel,
 * und der normale Weg loest daraus die Fassungen je Plattform auf - bei
 * einem Cross-Gen-Titel genuegt also ein Eintrag fuer beide Releases.
 */
export type StoreAdresse = { art: "produkt"; id: string } | { art: "concept"; id: string };

/** Produkt-Ids sehen aus wie EP9000-CUSA13323_00-GHOSTSHIP0000000. */
const PRODUKT_ID = /^[A-Z]{2}\d{4}-[A-Z]{4}\d{5}_\d{2}-[A-Za-z0-9_]{16}$/;

export function storeAdresse(eingabe: string): StoreAdresse | null {
	const text = eingabe.trim();
	if (text === "") return null;

	// Aus einer Adresse den letzten Pfadteil nehmen - Sprachfassung, Fragezeichen
	// und Anker sind egal.
	const ausUrl = /store\.playstation\.com\/[^/]+\/(product|concept)\/([^/?#]+)/i.exec(text);
	if (ausUrl) {
		const art = ausUrl[1].toLowerCase() === "concept" ? "concept" : "produkt";
		const id = decodeURIComponent(ausUrl[2]);
		if (art === "concept") return /^\d+$/.test(id) ? { art, id } : null;
		return PRODUKT_ID.test(id) ? { art: "produkt", id } : null;
	}

	// Blosse Id: Ziffern sind ein Concept, das lange Muster ein Produkt.
	if (/^\d+$/.test(text)) return { art: "concept", id: text };
	if (PRODUKT_ID.test(text)) return { art: "produkt", id: text };
	return null;
}

/**
 * Liegt der Titel im PS-Plus-Katalog?
 *
 * Nur `UPSELL_PS_PLUS_GAME_CATALOG` zaehlt. Ein PS-Plus-PROBESPIEL
 * (`UPSELL_PS_PLUS_TRIAL`, `UPSELL_PS_PLUS_FULL_GAME_TRIAL`) ist keine
 * Mitgliedschaft im Katalog, und `isTiedToSubscription` taugt nicht als
 * Unterscheidung: Bei Mass Effect: Andromeda stand es am Probe-Knopf auf
 * `false` (gemessen am 02.10.2026). Der Typ ist der Unterschied.
 */
export function imPlusKatalog(ctas: readonly CtaRoh[]): boolean {
	return ctas.some((c) => c.type === PLUS_KATALOG);
}
