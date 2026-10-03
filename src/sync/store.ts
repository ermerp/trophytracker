import type { Repositories } from "../db";
import type { ZuPruefen } from "../db/store";
import { storeConceptIds } from "../domain/igdb";
import { OHNE_WEBSTORE, produktReihe, type StoreBefund } from "../domain/store";
import type { IgdbClient } from "../igdb/client";
import { StoreAbrufError, type StoreClient } from "../psn/store";

/**
 * PSN Store-Preise (Abschnitt 7.4, Stufe 21).
 *
 * Laeuft im PSN-Fenster, aber ausserhalb der Zugangspruefung: Es ist Sonys
 * Schnittstelle, sie braucht aber **kein Token**. Ein abgelaufenes NPSSO
 * legt den Trophaeen-Sync still, nicht die Preise.
 *
 * Die Portion ist nach der Zahl der FREMDANFRAGEN geschnitten, nicht nach
 * Dauer (CLAUDE.md: 50 je Aufruf auf dem Free Tier). Ein Release kostet beim
 * ersten Mal bis zu vier Anfragen - eine Concept-Seite und bis zu drei
 * Produktseiten -, danach genau eine. Weil der erste Lauf und der
 * Dauerbetrieb damit weit auseinanderliegen, zaehlt der Schritt seine
 * Anfragen selbst und hoert auf, bevor die naechste Runde sie ueberziehen
 * koennte. Das ist verlaesslicher als eine Portionsgroesse, die den
 * schlimmsten Fall erraten muss.
 */

/** Releases je Aufruf, wenn die Anfragen reichen. */
export const RELEASES_JE_AUFRUF = 10;

/**
 * Hoechstzahl eigener Fremdanfragen je Aufruf. Vierzig von fuenfzig - die
 * zehn Reserve sind dieselbe Vorsicht wie in Stufe 20e.
 */
export const FREMDANFRAGEN_HOECHSTENS = 40;

/**
 * Wie viele Produktseiten je Release hoechstens gefragt werden.
 *
 * Drei, weil Sonys Standardprodukt nicht immer kaeuflich ist: Bei Mass
 * Effect: Andromeda antwortet es mit `UNAVAILABLE`, und der naechste
 * Kandidat traegt den Preis (gemessen am 02.10.2026).
 */
export const PRODUKTE_JE_RELEASE = 3;

export type StoreSchrittErgebnis = {
	status: "erfolg" | "fehler";
	geprueft: number;
	mitPreis: number;
	imAngebot: number;
	imPlusKatalog: number;
	/** Releases, die in diesem Lauf erstmals eine Produkt-Id bekamen. */
	zugeordnet: number;
	ohneTreffer: number;
	nochOffen: number;
	anfragen: number;
	weiter: boolean;
	meldung?: string;
};

export async function storeSchritt(
	repos: Repositories,
	store: StoreClient,
	igdb: IgdbClient,
	n = RELEASES_JE_AUFRUF,
): Promise<StoreSchrittErgebnis> {
	return portion(repos, store, igdb, await repos.store.zuPruefen(n), n);
}

/**
 * EIN Release jetzt pruefen - ohne Frist, ohne Zuschnitt (Nachtrag 21d).
 *
 * Derselbe Weg wie im Nachtlauf, nur mit einer einelementigen Portion: Wer
 * von Hand eine Adresse eintraegt, soll den Preis sofort sehen. Zwei Eingaenge
 * auf dieselbe Maschinerie - damit kann die Auswahlregel nicht auseinander
 * laufen.
 *
 * `null` heisst: Dieses Release gibt es nicht.
 */
export async function einesPruefen(
	repos: Repositories,
	store: StoreClient,
	igdb: IgdbClient,
	releaseId: number,
): Promise<StoreSchrittErgebnis | null> {
	const ziel = await repos.store.eines(releaseId);
	if (ziel === null) return null;
	return portion(repos, store, igdb, [ziel], 1);
}

async function portion(
	repos: Repositories,
	store: StoreClient,
	igdb: IgdbClient,
	ziele: ZuPruefen[],
	n: number,
): Promise<StoreSchrittErgebnis> {
	if (ziele.length === 0) return leer({ status: "erfolg" });

	let anfragen = 0;

	// Die Concept-Ids fuer die ganze Portion in EINER IGDB-Anfrage, nicht je
	// Release. Ohne IGDB-Zugang laeuft der Schritt mit dem, was schon da ist.
	// PS3 und Vita bleiben aussen vor - fuer sie fuehrt der Web-Store nichts,
	// also waere schon die IGDB-Frage vergebliche Arbeit (21d).
	// Wer schon eine Produkt-Id hat, braucht keine Concept-Id - die ist nur
	// der Weg dorthin. Gefragt wird deshalb nur, wenn mindestens ein Ziel
	// wirklich eine braucht: Beim Einzelabruf mit eingefuegter Produktadresse
	// spart das die halbe Wartezeit, im Nachtlauf aendert es nichts, weil dort
	// ohnehin fast immer eines ohne Id dabei ist.
	const offen = repos.store
		.nochOhneConcept(ziele)
		.filter((z) => !OHNE_WEBSTORE.includes(z.plattform) && z.produktId === null);
	if (offen.length > 0 && igdb.konfiguriert()) {
		try {
			const roh = await igdb.storeNachIds(offen.map((z) => z.igdbId).filter((id): id is number => id !== null));
			anfragen++;
			const treffer = storeConceptIds(roh);
			await repos.store.conceptSetzen(
				treffer,
				offen.map((z) => ({ gameId: z.gameId, igdbId: z.igdbId })),
			);
			for (const z of ziele) {
				const neu = z.igdbId === null ? undefined : treffer.get(z.igdbId);
				if (neu !== undefined) z.conceptId = neu;
			}
		} catch {
			// Ein IGDB-Ausfall darf die Portion nicht kosten: Was schon eine
			// Concept-Id hat, wird trotzdem gefragt. Dieselbe Linie wie 18b.
		}
	}

	// Dieselbe Concept-Seite nicht zweimal: Ein Concept deckt alle Fassungen
	// eines Spiels ab, und bei einem Cross-Gen-Titel stehen PS4- und
	// PS5-Release beide in der Portion (Horizon Forbidden West). Der Puffer
	// gilt nur fuer diesen Aufruf - zwischen zwei Naechten soll nichts
	// veralten.
	const conceptPuffer = new Map<string, Awaited<ReturnType<StoreClient["holeConcept"]>>>();

	let geprueft = 0;
	let mitPreis = 0;
	let imAngebot = 0;
	let imPlusKatalog = 0;
	let zugeordnet = 0;
	let ohneTreffer = 0;

	for (const ziel of ziele) {
		// PS3 und Vita: Befund ohne einen einzigen Abruf (21d). Der Web-Store
		// fuehrt fuer sie keine Produktseiten mehr - dreifach gemessen am
		// 03.10.2026 (OHNE_WEBSTORE). Hier zu fragen waere Verkehr fuer eine
		// Antwort, die feststeht. Steht vor der Budgetpruefung, weil dieser
		// Fall nichts kostet.
		if (OHNE_WEBSTORE.includes(ziel.plattform)) {
			await repos.store.befundSchreiben(ziel.releaseId, "plattform");
			geprueft++;
			ohneTreffer++;
			continue;
		}

		// Aufhoeren, bevor die naechste Runde das Budget ueberzieht. Die
		// uebrigen Releases bleiben ungestempelt und kommen beim naechsten
		// Aufruf wieder.
		if (anfragen + 1 + PRODUKTE_JE_RELEASE > FREMDANFRAGEN_HOECHSTENS) break;

		let befund: StoreBefund = "unlesbar";
		try {
			// 1. Eine bekannte Produkt-Id ist der billige Weg: eine Anfrage.
			if (ziel.produktId !== null) {
				const ergebnis = await store.holePreis(ziel.produktId);
				anfragen++;
				if (ergebnis) {
					const { neuZugeordnet } = await repos.store.preisSchreiben(ziel, ergebnis);
					geprueft++;
					mitPreis++;
					if (ergebnis.istSale) imAngebot++;
					if (ergebnis.imPlusKatalog) imPlusKatalog++;
					if (neuZugeordnet) zugeordnet++;
					continue;
				}
				// Die gespeicherte Id traegt keinen Kaufknopf mehr. Mit einer
				// Concept-Id laesst sich das aufloesen, ohne sie nicht.
				befund = "ohne_kauf";
			}

			// 2. Sonst ueber das Concept aufloesen.
			if (ziel.conceptId === null) {
				befund = ziel.produktId === null ? "ohne_id" : befund;
			} else {
				let stand = conceptPuffer.get(ziel.conceptId);
				if (stand === undefined) {
					stand = await store.holeConcept(ziel.conceptId);
					anfragen++;
					conceptPuffer.set(ziel.conceptId, stand);
				}
				if (stand === null) befund = "unlesbar";
				else if (stand.ohneProdukt) befund = "delistet";
				else {
					const reihe = produktReihe(stand.produkte, ziel.titel, ziel.plattform, stand.standardId);
					befund = reihe.length === 0 ? "fremd" : "ohne_kauf";
					for (const produkt of reihe.slice(0, PRODUKTE_JE_RELEASE)) {
						if (anfragen >= FREMDANFRAGEN_HOECHSTENS) break;
						const ergebnis = await store.holePreis(produkt.id);
						anfragen++;
						if (!ergebnis) continue;
						const { neuZugeordnet } = await repos.store.preisSchreiben(ziel, ergebnis);
						geprueft++;
						mitPreis++;
						if (ergebnis.istSale) imAngebot++;
						if (ergebnis.imPlusKatalog) imPlusKatalog++;
						if (neuZugeordnet) zugeordnet++;
						befund = "preis";
						break;
					}
					if (befund === "preis") continue;
				}
			}
		} catch (fehler) {
			if (fehler instanceof StoreAbrufError) {
				// Ein einzelner Fehlschlag darf die Portion nicht kosten:
				// ungestempelt, morgen wieder faellig (wie Stufe 20).
				continue;
			}
			throw fehler;
		}

		await repos.store.befundSchreiben(ziel.releaseId, befund);
		if (befund !== "unlesbar") {
			geprueft++;
			ohneTreffer++;
		}
	}

	const nochOffen = await repos.store.offeneAnzahl();
	// `weiter` kommt aus der Portionsgroesse, nicht aus einem Zaehler - wie
	// in Stufe 20e. Eine volle Portion heisst, dass wahrscheinlich mehr
	// wartet; der naechste Aufruf korrigiert sich ohnehin selbst.
	return {
		status: "erfolg",
		geprueft,
		mitPreis,
		imAngebot,
		imPlusKatalog,
		zugeordnet,
		ohneTreffer,
		nochOffen,
		anfragen,
		weiter: ziele.length === n,
	};
}

function leer(teil: { status: "erfolg" | "fehler"; meldung?: string }): StoreSchrittErgebnis {
	return {
		geprueft: 0,
		mitPreis: 0,
		imAngebot: 0,
		imPlusKatalog: 0,
		zugeordnet: 0,
		ohneTreffer: 0,
		nochOffen: 0,
		anfragen: 0,
		weiter: false,
		...teil,
	};
}

export type { ZuPruefen };
