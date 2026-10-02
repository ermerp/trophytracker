import type { Repositories } from "../db";
import type { AngebotJeKanal } from "../db/markt";
import { EbayAuthError, EbayKonfigError, EbayRateError, meldungFuer, type EbayClient } from "../ebay/client";
import { guenstigstesGeprueft, type MarktKanal } from "../domain/markt";
import { vorbereiten } from "../domain/scan-titel";

/**
 * Gebrauchtpreise und Disc-Nachweis aus eBay (Abschnitt 7.3, Stufe 20).
 *
 * Laeuft im Wartungsfenster, nicht im PSN-Fenster: Der Schritt fasst Sony
 * nicht an, und das PSN-Fenster traegt seit 19b sieben Schritte.
 *
 * Die Portion ist nicht nach Dauer geschnitten, sondern nach der Zahl der
 * Fremdanfragen: Der Free Tier erlaubt **50 fetch je Aufruf** (CLAUDE.md).
 * Zwei Abfragen je Release - Haendler und breiter Markt - ergeben rechnerisch
 * 25; zehn lassen Luft fuer die anderen Schritte des Fensters.
 *
 * Einen Fortschrittsschluessel in `app_setting` braucht der Schritt NICHT:
 * Der Stand steht je Zeile in `release.markt_geprueft_am`. Damit gibt es den
 * Fehlerfall aus 18e hier gar nicht - ein abgebrochener Lauf laesst die
 * ungeprueften Releases einfach ungestempelt, und der naechste Aufruf nimmt
 * sie wieder. Erfolg und Fehler koennen keine gemeinsame Marke hinterlassen,
 * weil es keine gibt.
 */

/**
 * Releases je Aufruf. Zwei Fremdanfragen je Release (Haendler, Markt).
 *
 * Zwanzig, nicht vierundzwanzig: Vierzig von fuenfzig erlaubten Fremdanfragen
 * lassen zehn Reserve. Laeuft das eBay-Token mitten in der Portion ab, kommen
 * eine Token-Anfrage und ein zweiter Versuch dazu - mit vierundzwanzig
 * Releases waeren das einundfuenfzig und damit eine zu viel.
 */
export const RELEASES_JE_AUFRUF = 20;

export type MarktErgebnis = {
	status: "erfolg" | "fehler";
	geprueft: number;
	mitPreis: number;
	discBelegt: number;
	ohneAngebot: number;
	nochOffen: number;
	weiter: boolean;
	meldung?: string;
};

export async function marktSchritt(
	repos: Repositories,
	ebay: EbayClient,
	n = RELEASES_JE_AUFRUF,
): Promise<MarktErgebnis> {
	if (!ebay.konfiguriert()) {
		return leer({ status: "fehler", meldung: new EbayKonfigError("eBay-Zugangsdaten sind nicht hinterlegt.").message });
	}
	const ziele = await repos.markt.zuPruefen(n);
	if (ziele.length === 0) return leer({ status: "erfolg" });

	// Die Sammlung EINMAL zerlegen, nicht je Angebot: 479 Spiele x 20
	// Angebote x 10 Releases waeren sonst Zehntausende Zerlegungen in einem
	// Aufruf (CPU-Grenze, CLAUDE.md).
	const sammlung = vorbereiten(await repos.games.alleTitel());

	let geprueft = 0;
	let mitPreis = 0;
	let discBelegt = 0;
	let ohneAngebot = 0;
	for (const ziel of ziele) {
		let rohangebote = 0;
		const angebote: AngebotJeKanal = {};
		try {
			for (const kanal of ["haendler", "markt"] as const satisfies readonly MarktKanal[]) {
				const roh = await ebay.angeboteZuTitel(ziel.titel, ziel.plattform, kanal);
				// Nur der breite Kanal zaehlt als "kennt eBay ueberhaupt etwas":
				// Der Haendlerkanal ist eine Teilmenge und wuerde doppelt zaehlen.
				if (kanal === "markt") rohangebote = roh.length;
				angebote[kanal] = guenstigstesGeprueft(
					roh,
					{ gameId: ziel.gameId, titel: ziel.titel, plattform: ziel.plattform },
					sammlung,
				);
			}
		} catch (fehler) {
			// Ratenlimit oder Zugang: Der Lauf endet sauber, das Geprueffte
			// bleibt stehen, der Rest ist morgen wieder fällig.
			if (fehler instanceof EbayRateError || fehler instanceof EbayAuthError) {
				const offen = await repos.markt.offeneAnzahl();
				return { status: "fehler", geprueft, mitPreis, discBelegt, ohneAngebot, nochOffen: offen, weiter: false, meldung: meldungFuer(fehler) };
			}
			// Ein einzelner Fehlschlag darf die Portion nicht kosten: Dieses
			// Release bleibt ungestempelt und kommt beim naechsten Aufruf wieder.
			continue;
		}

		const { discBelegt: belegt, preisCents } = await repos.markt.ergebnisSchreiben(ziel, angebote, rohangebote);
		geprueft++;
		if (preisCents !== null) mitPreis++;
		if (belegt) discBelegt++;
		if (rohangebote === 0) ohneAngebot++;
	}

	// `weiter` kommt aus der Portionsgroesse, nicht aus einem Zaehler: Eine
	// volle Portion heisst, dass wahrscheinlich mehr wartet - eine halbe, dass
	// der Bestand durch ist. Das kostet nichts, und der naechste Aufruf
	// korrigiert sich ohnehin selbst.
	const offen = await repos.markt.offeneAnzahl();
	return { status: "erfolg", geprueft, mitPreis, discBelegt, ohneAngebot, nochOffen: offen, weiter: ziele.length === n };
}

function leer(teil: { status: "erfolg" | "fehler"; meldung?: string }): MarktErgebnis {
	return { geprueft: 0, mitPreis: 0, discBelegt: 0, ohneAngebot: 0, nochOffen: 0, weiter: false, ...teil };
}
