import { Hono } from "hono";
import { meldungFuer } from "../psn/store";
import { OHNE_WEBSTORE, PRODUKT_ID, STORE_BEFUNDE, storeAdresse, type StoreErgebnis } from "../domain/store";
import { storeConceptIds } from "../domain/igdb";
import { STORE_LAGE_HOECHSTENS, type Rueckbefund, type StoreRueckmeldung } from "../db/store";
import { einesPruefen, storeActionZeile, STORE_JE_POST, type StoreActionErgebnis } from "../sync/store";
import { liesJson } from "./validierung";
import type { AppEnv } from "../types";

/**
 * Die Meldungen eines Laufs der Store-Action, als Code uebergeben (Stufe
 * 20j) - wie `MARKT_MELDUNG`: Fremdtext koennte ein Geheimnis zitieren.
 */
const STORE_MELDUNG = {
	app: "Die Anwendung hat eine Portion nicht angenommen.",
} as const;

const ganz = (w: unknown, bis: number): w is number => typeof w === "number" && Number.isInteger(w) && w >= 0 && w <= bis;

/** Ein Preis aus dem Koerper - oder null, wenn er nicht danach aussieht. */
function preisAus(roh: unknown): StoreErgebnis | null {
	if (roh === null || typeof roh !== "object") return null;
	const p = roh as Record<string, unknown>;
	if (typeof p.produktId !== "string" || !PRODUKT_ID.test(p.produktId)) return null;
	if (p.produktName !== null && (typeof p.produktName !== "string" || p.produktName.length > 300)) return null;
	// Bis 1 000 Euro - was darueber liegt, ist kein Spielpreis, sondern ein Lesefehler.
	if (!ganz(p.preisCents, 100_000) || !ganz(p.grundpreisCents, 100_000)) return null;
	if (typeof p.waehrung !== "string" || !/^[A-Z]{3}$/.test(p.waehrung)) return null;
	if (typeof p.istSale !== "boolean" || typeof p.imPlusKatalog !== "boolean") return null;
	return {
		produktId: p.produktId,
		produktName: p.produktName,
		preisCents: p.preisCents,
		grundpreisCents: p.grundpreisCents,
		waehrung: p.waehrung,
		istSale: p.istSale,
		imPlusKatalog: p.imPlusKatalog,
	};
}

/** Eine Rueckmeldung aus `ergebnisse` - oder null. `unlesbar` stempelt nicht und kommt nie an. */
function rueckmeldungAus(roh: unknown): StoreRueckmeldung | null {
	if (roh === null || typeof roh !== "object") return null;
	const e = roh as Record<string, unknown>;
	if (typeof e.releaseId !== "number" || !Number.isInteger(e.releaseId) || e.releaseId <= 0) return null;
	if ("preis" in e) {
		const preis = preisAus(e.preis);
		return preis ? { releaseId: e.releaseId, preis } : null;
	}
	const befund = e.befund;
	if (typeof befund !== "string" || befund === "preis" || befund === "unlesbar") return null;
	if (!(STORE_BEFUNDE as readonly string[]).includes(befund)) return null;
	if (typeof e.nurKatalog !== "boolean") return null;
	return { releaseId: e.releaseId, befund: befund as Rueckbefund, nurKatalog: e.nurKatalog };
}

/**
 * PSN Store-Preise (Abschnitt 7.4, Stufe 21).
 *
 * Eigene Datei neben `markt.ts`: dieselbe Familie, andere Quelle. **Keine
 * Zugangsdaten und deshalb kein 503-Pfad** - der Store antwortet ohne
 * Anmeldung, und ein abgelaufenes NPSSO betrifft ihn nicht.
 *
 * Der Nachtlauf ist seit 20j eine GitHub Action und schreibt ueber die
 * Routen unten; der Portions-Knopf ist mit dem Schritt im Worker entfallen
 * (Entscheidung des Nutzers vom 22.10.2026). Von Hand bleibt der Einzelabruf.
 */
export const storeRoutes = new Hono<AppEnv>()
	/**
	 * Die Lage fuer einen Lauf der Store-Action (Stufe 20j): alle faelligen
	 * Releases, in EINEM D1-Aufruf mit EINER Abfrage. Bewusst nur das - keine
	 * Sammlung, kein Schreiben, keine Fremdanfrage: Die Lage der Markt-Action
	 * brauchte an langsamen Standorten 18-19 ms, und gemessen kostet dort das
	 * Umwandeln der zurueckgegebenen D1-Zeilen (16.2).
	 *
	 * Maschinen-Endpunkt wie `/api/sync/markt/lage`: Access steht vor dem
	 * Worker, die Action kommt mit dem Service Token `github-store` (15.3).
	 */
	.get("/store/lage", async (c) => {
		return c.json({ ziele: await c.var.repos.store.zuPruefen(STORE_LAGE_HOECHSTENS) });
	})

	/**
	 * Concept-Ids aus IGDB fuer die Releases der Lage (Stufe 20j). Im Worker,
	 * weil die IGDB-Zugangsdaten nur hier leben (7.6). Wer eine braucht, liest
	 * die Route selbst - dieselbe Regel wie im Schritt (`nochOhneConcept`, ohne
	 * PS3 und Vita, ohne Produkt-Id). Die Antwort nennt je Spiel die
	 * gefundene Id; ohne IGDB 503 - die Action fragt dann mit dem, was da ist.
	 */
	.post("/store/concepts", async (c) => {
		const ids = (await liesJson(c))?.releaseIds;
		if (!Array.isArray(ids) || ids.length > STORE_LAGE_HOECHSTENS || !ids.every((id) => ganz(id, Number.MAX_SAFE_INTEGER) && id > 0)) {
			return c.json({ fehler: `Feld 'releaseIds' muss bis zu ${STORE_LAGE_HOECHSTENS} Release-Ids haben.` }, 400);
		}
		const ziele = await c.var.repos.store.einige([...new Set(ids as number[])]);
		const offen = c.var.repos.store
			.nochOhneConcept(ziele)
			.filter((z) => !OHNE_WEBSTORE.includes(z.plattform) && z.produktId === null);
		if (offen.length === 0) return c.json({ concepts: [] });
		if (!c.var.igdb.konfiguriert()) return c.json({ fehler: "IGDB-Zugangsdaten sind nicht hinterlegt." }, 503);
		try {
			const roh = await c.var.igdb.storeNachIds(offen.map((z) => z.igdbId).filter((id): id is number => id !== null));
			const treffer = storeConceptIds(roh);
			await c.var.repos.store.conceptSetzen(
				treffer,
				offen.map((z) => ({ gameId: z.gameId, igdbId: z.igdbId })),
			);
			const concepts = [...new Map(offen.flatMap((z) => {
				const id = z.igdbId === null ? undefined : treffer.get(z.igdbId);
				return id === undefined ? [] : [[z.gameId, id] as const];
			}))].map(([gameId, conceptId]) => ({ gameId, conceptId }));
			return c.json({ concepts });
		} catch {
			// Ein IGDB-Ausfall kostet den Lauf nicht - dieselbe Linie wie im Schritt.
			return c.json({ fehler: "IGDB hat nicht geantwortet." }, 502);
		}
	})

	/**
	 * Die Rueckmeldungen einer Portion schreiben (Stufe 20j) - EIN Lese- und
	 * EIN Schreib-Batch, gleich wie viele Releases. Hoechstens STORE_JE_POST,
	 * damit die Anweisungen unter den 50 je Aufruf bleiben. Eine unbekannte
	 * Release-Id wird uebergangen und gezaehlt, nicht angelegt; Preis und
	 * Produkt-Id werden streng geprueft, Fremdtext gibt es nur als Produktname.
	 */
	.post("/store/ergebnisse", async (c) => {
		const liste = (await liesJson(c))?.ergebnisse;
		if (!Array.isArray(liste) || liste.length === 0 || liste.length > STORE_JE_POST) {
			return c.json({ fehler: `Feld 'ergebnisse' muss 1 bis ${STORE_JE_POST} Einträge haben.` }, 400);
		}
		const gelesen = liste.map(rueckmeldungAus);
		const kaputt = gelesen.findIndex((e) => e === null);
		if (kaputt >= 0) return c.json({ fehler: `Eintrag ${kaputt + 1} ist kein gültiges Ergebnis.` }, 400);
		const rueckmeldungen = gelesen as StoreRueckmeldung[];

		const vorhanden = await c.var.repos.store.vorhandene([...new Set(rueckmeldungen.map((r) => r.releaseId))]);
		const schreiben = rueckmeldungen.filter((r) => vorhanden.has(r.releaseId));
		const geschrieben = await c.var.repos.store.rueckmeldungenSchreiben(schreiben);
		const preise = schreiben.flatMap((r) => ("preis" in r ? [r.preis] : []));
		return c.json({
			geprueft: schreiben.length,
			mitPreis: preise.length,
			imAngebot: preise.filter((p) => p.istSale).length,
			imPlusKatalog: preise.filter((p) => p.imPlusKatalog).length,
			zugeordnet: geschrieben.filter((g) => g.neuZugeordnet).length,
			ohneTreffer: schreiben.length - preise.length,
			unbekannt: rueckmeldungen.length - schreiben.length,
		});
	})

	/**
	 * Beginn und Ausgang eines Laufs der Store-Action (Stufe 20j), wie bei
	 * der Markt-Action: Der Beginn steht VOR der Arbeit unter eigenem Bereich
	 * (`store_begonnen`), der Ausgang als Bereich `store` mit Verlaufszeile.
	 *
	 * `store_geprueft` haelt den letzten Lauf fest, nach dem der Store auf dem
	 * Stand war: einer, der etwas geprueft hat, ODER einer ohne Meldung, nach
	 * dem nichts faellig ist. Das zweite liest die Route selbst. Ohne es
	 * meldete die Warnung jeden Abend nach einem Probelauf am Nachmittag: Er
	 * stempelt alles, die Laeufe am Abend finden nichts, und der naechste
	 * pruefende kommt erst nach ueber 30 Stunden (Entscheidung vom 22.10.2026).
	 */
	.post("/store/ausgang", async (c) => {
		const koerper = await liesJson(c);
		const am = new Date().toISOString().slice(0, 16).replace("T", " ");
		if (koerper?.art === "begonnen") {
			await c.var.repos.sync.standVermerken("store_begonnen", { am, getan: "store", meldung: false });
			return c.json({ am });
		}
		const felder = ["geprueft", "mitPreis", "imAngebot", "imPlusKatalog", "zugeordnet", "ohneTreffer"] as const;
		const fehler = koerper?.fehler;
		if (
			koerper?.art !== "ende" ||
			!felder.every((k) => ganz(koerper[k], 1_000_000)) ||
			(fehler !== undefined && !(typeof fehler === "string" && fehler in STORE_MELDUNG))
		) {
			return c.json({ fehler: "Erwartet: art 'begonnen' oder 'ende' mit sechs Zahlen und optional einem Fehlercode." }, 400);
		}
		const zahl = (k: (typeof felder)[number]) => koerper[k] as number;
		const meldung = typeof fehler === "string" ? STORE_MELDUNG[fehler as keyof typeof STORE_MELDUNG] : undefined;
		const lageNachher = await c.var.repos.store.ausgangLage();
		const ergebnis: StoreActionErgebnis = {
			status: meldung ? "fehler" : "erfolg",
			geprueft: zahl("geprueft"),
			mitPreis: zahl("mitPreis"),
			imAngebot: zahl("imAngebot"),
			imPlusKatalog: zahl("imPlusKatalog"),
			zugeordnet: zahl("zugeordnet"),
			ohneTreffer: zahl("ohneTreffer"),
			nochOffen: lageNachher.faellig,
			...(meldung ? { meldung } : {}),
		};
		const aufStand = ergebnis.geprueft > 0 || (!meldung && ergebnis.nochOffen === 0);
		// Das Sicherheitsnetz, unabhaengig von der Auswahl: Seit wann ist das
		// am laengsten ungepruefte Ziel auf dem Stand? Daran haengt `store_leer`
		// auch dann, wenn die Auswahl selbst kaputt ist und "nichts faellig" sagt.
		const { aeltester } = lageNachher;
		const wert = {
			am,
			getan: "store",
			meldung: meldung !== undefined,
			offen: ergebnis.nochOffen,
			geprueft: ergebnis.geprueft,
			...(aeltester ? { aeltester } : {}),
		};
		await c.var.repos.sync.cronAusgangVermerken(am, storeActionZeile(ergebnis), undefined, {
			fakt: [{ bereich: "store", wert }, ...(aufStand ? [{ bereich: "store_geprueft", wert }] : [])],
		});
		return c.json(ergebnis);
	})

	/**
	 * EIN Release jetzt pruefen, mit oder ohne eingefuegte Adresse
	 * (Nachtrag 21d).
	 *
	 * Zwei Dinge in einem Aufruf, weil sie zusammengehoeren: Die Adresse wird
	 * gespeichert, und sofort danach steht der Preis da. Ohne das zweite
	 * waere die Nachpflegeliste unbrauchbar - die Tagesfrist liesse den
	 * Eintrag bis zum naechsten Morgen stumm.
	 *
	 * Die Adresse ist die aus dem Browser kopierte Store-Adresse, Produkt
	 * oder Concept, oder die blosse Id. Was sich nicht als eine von beiden
	 * lesen laesst, wird mit `400` abgewiesen statt geraten: An der Id haengt
	 * der Preis, und ein falscher waere schlimmer als keiner.
	 */
	.post("/store/:releaseId{[0-9]+}", async (c) => {
		const releaseId = Number(c.req.param("releaseId"));
		const koerper = await c.req.json<{ adresse?: unknown }>().catch(() => ({}) as { adresse?: unknown });

		if (koerper.adresse !== undefined) {
			if (typeof koerper.adresse !== "string") {
				return c.json({ fehler: "adresse muss Text sein." }, 400);
			}
			const adresse = storeAdresse(koerper.adresse);
			if (adresse === null) {
				return c.json({ fehler: "Das ist keine Store-Adresse. Erwartet wird der Link zu einer Produkt- oder Concept-Seite." }, 400);
			}
			const ziel = await c.var.repos.store.eines(releaseId);
			if (ziel === null) return c.json({ fehler: "Release nicht gefunden." }, 404);
			if (adresse.art === "produkt") {
				// Ueber den Weg von Hand, damit die Zuordnung mit Quelle
				// 'nutzer' im Protokoll steht (8.5) - sie ist seine Entscheidung.
				await c.var.repos.games.releaseAendern(releaseId, { psnProductId: adresse.id });
			} else {
				await c.var.repos.store.conceptVonHand(ziel.gameId, adresse.id);
			}
		}

		try {
			const ergebnis = await einesPruefen(c.var.repos, c.var.store, c.var.igdb, releaseId);
			if (ergebnis === null) return c.json({ fehler: "Release nicht gefunden." }, 404);
			return c.json(ergebnis, ergebnis.status === "fehler" ? 502 : 200);
		} catch (fehler) {
			return c.json({ fehler: meldungFuer(fehler) }, 502);
		}
	})

	/**
	 * Die Eintraege, bei denen Nachpflege etwas bringt - fuer die Liste in
	 * den Einstellungen und die Zeile an der Glocke.
	 */
	.get("/store/offen", async (c) => {
		return c.json({ eintraege: await c.var.repos.store.ohneZuordnung() });
	})

	/** Wie weit der Zuschnitt gefragt ist - fuer die Einstellungen. */
	.get("/store", async (c) => {
		return c.json(await c.var.repos.store.stand());
	});
