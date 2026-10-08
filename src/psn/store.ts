import {
	ctasAus,
	imPlusKatalog,
	istConceptBlock,
	istPreisBlock,
	kaufpreisAus,
	naechsterBlock,
	produkteAus,
	standardProdukt,
	type ProduktRoh,
	type StoreErgebnis,
} from "../domain/store";

/**
 * Anbindung an den PlayStation Store (Abschnitt 7.4, Stufe 21).
 *
 * Eigene Datei und nicht in `psn/client.ts`, obwohl beides Sony ist: anderer
 * Host, **kein Token**, kein `Geheimnis` im Spiel. Ein abgelaufenes NPSSO
 * darf die Store-Preise nicht stilllegen, und der Store-Abruf darf im
 * Gegenzug nie den Trophaeen-Sync gefaehrden.
 *
 * Keine Rohablage (Regel in CLAUDE.md): Der Abruf ist klein, die
 * Normalisierung ist Feldkopieren, und jede Seite ist jederzeit wiederholbar
 * - alle drei Merkmale, die eine Rohablage rechtfertigen, fehlen.
 *
 * **Warum die Seite als Strom gelesen wird.** Eine Produktseite ist 380 KB
 * bis 1 MB gross, aber der gesuchte Block liegt bei rund 60 KB - 6 bis 14 %
 * der Seite (gemessen am 02.10.2026 an fuenf Seiten: 56 975, 58 749, 64 290,
 * 64 668 und 57 718 Byte). Die ganze Seite zu lesen und zu parsen waere
 * gegen die 10-ms-CPU-Grenze unvernuenftig; der Block selbst ist 3,2 bis
 * 7,1 KB. Also lesen wir Stueck fuer Stueck, pruefen jeden vollstaendigen
 * Block und brechen ab, sobald der richtige da ist. Ein `Range`-Kopf hilft
 * nicht - Sony beantwortet ihn mit der vollen Seite (gemessen).
 */

const BASIS = "https://store.playstation.com/de-de";

/**
 * Nach so vielen gelesenen Bytes gibt der Abruf auf.
 *
 * Gemessen liegt der Block bei hoechstens 65 KB; 256 KB ist das Netz gegen
 * eine Seite, die Sony umbaut, nicht gegen die gemessene. Ohne diese Grenze
 * wuerde aus einem Umbau stillschweigend ein 1-MB-Parse je Release.
 */
const HOECHSTENS_BYTES = 256 * 1024;

/** Zeitgrenze je Seite - wie beim eBay-Client (Stufe 19b: ein haengender Abruf kostete einen Cron-Aufruf). */
const ZEITGRENZE_MS = 10_000;

/** Der Aufrufer entscheidet, wie darauf reagiert wird - siehe src/sync/store.ts. */
export class StoreAbrufError extends Error {}

export type FetchFn = typeof fetch;

/** Was eine Concept-Seite ueber die Fassungen eines Spiels sagt. */
export type ConceptStand = {
	produkte: ProduktRoh[];
	standardId: string | null;
	/** Nur angekuendigt oder delistet: Der Store fuehrt kein Produkt. */
	ohneProdukt: boolean;
};

export function erstelleStoreClient(hole: FetchFn = fetch) {
	/**
	 * Eine Seite lesen und den ersten Block zurueckgeben, den `pruefen`
	 * annimmt. `null` heisst "nicht gefunden" - und zwar fuer alle
	 * harmlosen Gruende zugleich: 302 (der Store kennt das Produkt nicht),
	 * Seite ohne den Block, Obergrenze erreicht.
	 *
	 * Ein 302 kostet nichts: Er wird am Status erkannt, ohne den Koerper
	 * anzufassen.
	 */
	async function ersterBlock<T>(
		pfad: string,
		pruefen: (daten: unknown) => T | null,
	): Promise<{ art: "treffer"; wert: T } | { art: "fehlt" } | { art: "unlesbar" }> {
		let antwort: Response;
		try {
			antwort = await hole(`${BASIS}${pfad}`, {
				// Kein `redirect: "follow"`: Eine unbekannte Produkt-Id leitet auf
				// die Startseite oder eine Fehlerseite um, und die wollen wir
				// nicht herunterladen, nur erkennen.
				redirect: "manual",
				signal: AbortSignal.timeout(ZEITGRENZE_MS),
			});
		} catch (fehler) {
			throw new StoreAbrufError("Der Store war nicht erreichbar.");
		}
		// 301/302 heisst "diese Seite gibt es nicht" - kein Fehler, eine Antwort.
		// Und ausdruecklich etwas ANDERES als eine Seite, die wir nicht lesen
		// konnten: Das eine ist endgueltig, das andere einen Versuch wert
		// (Nachtrag 21e).
		if (antwort.status >= 300 && antwort.status < 400) return { art: "fehlt" };
		if (!antwort.ok) throw new StoreAbrufError(`Der Store antwortete mit ${antwort.status}.`);
		if (!antwort.body) return { art: "unlesbar" };

		const leser = antwort.body.getReader();
		const zerleger = new TextDecoder();
		let puffer = "";
		let ab = 0;
		let gelesen = 0;
		try {
			for (;;) {
				const { done, value } = await leser.read();
				if (value) {
					gelesen += value.byteLength;
					puffer += zerleger.decode(value, { stream: true });
				}
				for (;;) {
					const block = naechsterBlock(puffer, ab);
					if (!block) break;
					ab = block.ende;
					const treffer = pruefen(block.daten);
					if (treffer !== null) return { art: "treffer", wert: treffer };
				}
				if (done) return { art: "unlesbar" };
				if (gelesen > HOECHSTENS_BYTES) return { art: "unlesbar" };
			}
		} finally {
			// Der Rest der Seite interessiert nicht mehr - das ist der ganze Sinn.
			await leser.cancel().catch(() => undefined);
		}
	}

	return {
		/**
		 * Die Fassungen eines Spiels. Die Concept-Id kommt aus IGDB
		 * (`external_games`, Quelle 36) und ist regionsunabhaengig - nur die
		 * Sprache in der Adresse entscheidet ueber Preis und Waehrung.
		 *
		 * `ohneProdukt` trennt zwei Faelle, die beide "kein Preis" bedeuten
		 * und trotzdem verschieden sind: ein delisteter Titel (`products`
		 * leer, die Seite schreibt "Angekuendigt") und eine Seite, die wir
		 * nicht lesen konnten. Nur der erste ist eine Aussage ueber das Spiel.
		 */
		async holeConcept(conceptId: string): Promise<ConceptStand | "fehlt" | null> {
			const aus = await ersterBlock(`/concept/${encodeURIComponent(conceptId)}`, (daten) => {
				const block = istConceptBlock(daten);
				if (!block) return null;
				const produkte = produkteAus(block.cache, block.concept);
				return {
					produkte,
					standardId: standardProdukt(block.concept),
					ohneProdukt: produkte.length === 0,
				} satisfies ConceptStand;
			});
			return aus.art === "treffer" ? aus.wert : aus.art === "fehlt" ? "fehlt" : null;
		},

		/**
		 * Der Kaufpreis eines Produkts. `null` heisst "kein Kaufknopf" - das
		 * Produkt existiert, ist aber nicht kaeuflich (`UNAVAILABLE`), oder
		 * die Id stimmt nicht mehr.
		 */
		async holePreis(produktId: string): Promise<StoreErgebnis | "nur_katalog" | null> {
			const aus = await ersterBlock<StoreErgebnis | "nur_katalog">(
				`/product/${encodeURIComponent(produktId)}`,
				(daten) => {
					const cache = istPreisBlock(daten, produktId);
					if (!cache) return null;
					const ctas = ctasAus(cache, produktId);
					const preis = kaufpreisAus(ctas);
					// Kein Kaufknopf, aber ein Katalog-Knopf: Das Spiel ist nicht
					// einzeln zu kaufen, liegt aber im PS-Plus-Katalog - und das
					// ist fuer die Kaufentscheidung die wichtigere Auskunft als
					// "kein Preis" (Nachtrag 21e, gesehen an Shadow of the Tomb
					// Raider). Ohne diesen Zweig fiel sie unter den Tisch.
					if (!preis) return imPlusKatalog(ctas) ? "nur_katalog" : null;
					const name = (cache[`Product:${produktId}`] as { name?: string } | undefined)?.name ?? null;
					return { ...preis, produktId, produktName: name, imPlusKatalog: imPlusKatalog(ctas) } satisfies StoreErgebnis;
				},
			);
			return aus.art === "treffer" ? aus.wert : null;
		},
	};
}

export type StoreClient = ReturnType<typeof erstelleStoreClient>;

/** Eine Meldung, die gefahrlos in eine Antwort darf - nie Fremdtext. */
export function meldungFuer(fehler: unknown): string {
	if (fehler instanceof StoreAbrufError) return fehler.message;
	return "Der Store-Abruf ist fehlgeschlagen.";
}
