import type { Repositories } from "../db";
import type { AngebotJeKanal, AngezeigtesAngebot, ZuPruefen } from "../db/markt";
import { EbayAuthError, EbayKonfigError, EbayRateError, meldungFuer, type EbayClient } from "../ebay/client";
import { guenstigstesGeprueft, type MarktKanal } from "../domain/markt";
import { vorbereiten, type SammlungsSpiel, type VorbereitetesSpiel } from "../domain/scan-titel";

/**
 * Gebrauchtpreise und Disc-Nachweis aus eBay (Abschnitt 7.3, Stufe 20).
 *
 * Seit Stufe 20i laeuft der Schritt als GitHub Action und nicht mehr im
 * Cron: Kein einzelnes Release blieb unter 10 ms CPU, und 431 Aufrufe passten
 * in keinen Takt (16.2). Die Action fragt eBay und gleicht ab, in Node ohne
 * CPU-Grenze (`marktLauf`, src/sync/markt-lauf.ts); geschrieben wird nur ueber
 * die Routen des Workers, mit denselben Anweisungen wie zuvor.
 *
 * Einen Fortschrittsschluessel in `app_setting` braucht der Schritt NICHT:
 * Der Stand steht je Zeile in `release.markt_geprueft_am`. Ein abgebrochener
 * Lauf laesst die ungeprueften Releases ungestempelt, und der naechste nimmt
 * sie wieder.
 */

/**
 * Releases je POST der Action an die Schreibroute (Stufe 20i).
 *
 * Gezaehlt wird nicht die Arbeit, sondern die Anweisungen: D1 dokumentiert 50
 * Abfragen je Aufruf des Workers, jede Anweisung eines Batches zaehlt. Je
 * Release sind es hoechstens sieben (`MarktRepository.ergebnisseSchreiben`),
 * dazu die eine Abfrage nach den Releases: 6 x 7 + 1 = 43. Startwert, nach dem
 * ersten Lauf an der gemessenen CPU je POST angepasst (Entscheidung des
 * Nutzers vom 19.10.2026); nach oben begrenzt durch die 50.
 */
export const MARKT_JE_POST = 6;

export type MarktErgebnis = {
	status: "erfolg" | "fehler";
	geprueft: number;
	mitPreis: number;
	discBelegt: number;
	ohneAngebot: number;
	nochOffen: number;
	meldung?: string;
};

/**
 * Die Angebote zu EINEM Release holen und abgleichen - ohne zu schreiben.
 * Derselbe Weg fuer die Action (in Node, ohne CPU-Grenze) und fuer den
 * Neuabruf im Worker (20h). Ratenlimit und Zugang werfen; der Aufrufer
 * entscheidet, ob der Lauf endet.
 */
export async function angeboteFuer<T extends SammlungsSpiel>(
	ebay: EbayClient,
	ziel: Pick<ZuPruefen, "gameId" | "titel" | "plattform">,
	sammlung: readonly VorbereitetesSpiel<T>[],
	verworfen?: ReadonlySet<string>,
): Promise<{ angebote: AngebotJeKanal; rohangebote: number }> {
	let rohangebote = 0;
	const angebote: AngebotJeKanal = {};
	for (const kanal of ["haendler", "markt"] as const satisfies readonly MarktKanal[]) {
		const roh = await ebay.angeboteZuTitel(ziel.titel, ziel.plattform, kanal);
		// Nur der breite Kanal zaehlt als "kennt eBay ueberhaupt etwas":
		// Der Haendlerkanal ist eine Teilmenge und wuerde doppelt zaehlen.
		if (kanal === "markt") rohangebote = roh.length;
		angebote[kanal] = guenstigstesGeprueft(
			roh,
			{ gameId: ziel.gameId, titel: ziel.titel, plattform: ziel.plattform },
			sammlung,
			verworfen,
		);
	}
	return { angebote, rohangebote };
}

/**
 * Die Verlaufszeile eines Laufs - nur Zahlen und feste Texte, wie die des
 * Cron (`cronLogzeile`). Vier Zahlen, weil sie vier Dinge sagen: `geprueft`
 * ist die Menge, `preis` was einen Titelabgleich ueberstanden hat, `disc` die
 * Statuswechsel unbekannt -> ja, `ohneAngebot` die Releases, zu denen eBay in
 * der Plattform-Kategorie NICHTS kennt (7.3).
 */
export function marktZeile(e: MarktErgebnis): string {
	const teile = [
		"cron: markt bereich=action",
		`markt=${e.status}`,
		`geprueft=${e.geprueft}`,
		`preis=${e.mitPreis}`,
		`disc=${e.discBelegt}`,
		`ohneAngebot=${e.ohneAngebot}`,
		`offen=${e.nochOffen}`,
	];
	if (e.meldung) teile.push(`meldung="${e.meldung}"`);
	return teile.join(" ");
}

/**
 * EIN Release jetzt fragen - der Neuabruf nach einem Verwerfen (Stufe 20h).
 *
 * DERSELBE Pfad wie in der Action, nicht ein zweiter: `angeboteFuer` traegt
 * den Titelabgleich und die Sperrliste, `ergebnisSchreiben` dieselben
 * Anweisungen samt Protokoll wie `ergebnisseSchreiben`. Ein
 * eigener Weg wuerde die Nebenwirkungen des Schritts nicht erben - und "die
 * Nebenwirkung gehoert an den Schritt, nicht an seinen Auslöser" (CLAUDE.md).
 *
 * `nochOffen` bleibt 0: Er beantwortet die Frage "wie
 * weit ist der Bestand", und die stellt hier niemand. Der Zaehler haette
 * 430 Zeilen gelesen, um sie nicht zu beantworten.
 *
 * null heisst: Release nicht gefunden.
 */
export async function einesPruefen(
	repos: Repositories,
	ebay: EbayClient,
	releaseId: number,
): Promise<(MarktErgebnis & { preis: AngezeigtesAngebot | null }) | null> {
	if (!ebay.konfiguriert()) {
		return {
			...leer({ status: "fehler", meldung: new EbayKonfigError("eBay-Zugangsdaten sind nicht hinterlegt.").message }),
			preis: null,
		};
	}
	const ziel = await repos.markt.eines(releaseId);
	if (ziel === null) return null;
	const stand = await portion(repos, ebay, [ziel]);
	return {
		...zahlen(stand),
		status: stand.meldung === undefined ? "erfolg" : "fehler",
		nochOffen: 0,
		...(stand.meldung === undefined ? {} : { meldung: stand.meldung }),
		preis: stand.preis,
	};
}

/** Was eine Portion erreicht hat; `meldung` gesetzt heisst: Ratenlimit oder Zugang. */
type Portionsstand = {
	geprueft: number;
	mitPreis: number;
	discBelegt: number;
	ohneAngebot: number;
	/** Das zuletzt geschriebene Angebot - fuer die Antwort des Einzelabrufs. */
	preis: AngezeigtesAngebot | null;
	meldung?: string;
};

const zahlen = (s: Portionsstand) => ({
	geprueft: s.geprueft,
	mitPreis: s.mitPreis,
	discBelegt: s.discBelegt,
	ohneAngebot: s.ohneAngebot,
});

async function portion(repos: Repositories, ebay: EbayClient, ziele: readonly ZuPruefen[]): Promise<Portionsstand> {
	// Die Sammlung EINMAL zerlegen, nicht je Angebot (CPU-Grenze, CLAUDE.md).
	const sammlung = vorbereiten(await repos.games.alleTitel());
	const verworfen = await repos.markt.verworfeneJeRelease(ziele.map((z) => z.releaseId));

	const stand: Portionsstand = { geprueft: 0, mitPreis: 0, discBelegt: 0, ohneAngebot: 0, preis: null };
	for (const ziel of ziele) {
		let gefunden: Awaited<ReturnType<typeof angeboteFuer>>;
		try {
			gefunden = await angeboteFuer(ebay, ziel, sammlung, verworfen.get(ziel.releaseId));
		} catch (fehler) {
			// Ratenlimit oder Zugang: Der Lauf endet sauber, das Geprueffte
			// bleibt stehen, der Rest ist morgen wieder fällig.
			if (fehler instanceof EbayRateError || fehler instanceof EbayAuthError) {
				return { ...stand, meldung: meldungFuer(fehler) };
			}
			// Ein einzelner Fehlschlag darf die Portion nicht kosten: Dieses
			// Release bleibt ungestempelt und kommt beim naechsten Aufruf wieder.
			continue;
		}

		const { discBelegt, preis } = await repos.markt.ergebnisSchreiben(ziel, gefunden.angebote, gefunden.rohangebote);
		stand.geprueft++;
		stand.preis = preis;
		if (preis !== null) stand.mitPreis++;
		if (discBelegt) stand.discBelegt++;
		if (gefunden.rohangebote === 0) stand.ohneAngebot++;
	}
	return stand;
}

function leer(teil: { status: "erfolg" | "fehler"; meldung?: string }): MarktErgebnis {
	return { geprueft: 0, mitPreis: 0, discBelegt: 0, ohneAngebot: 0, nochOffen: 0, ...teil };
}
