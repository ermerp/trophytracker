import type { Repositories } from "../db";
import type { AngebotJeKanal, AngezeigtesAngebot, ZuPruefen } from "../db/markt";
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
	// Vom Lage-Batch des Cron gelesen (Stufe 18j), sonst selbst - dieselbe Auswahl.
	vorgelesen?: ZuPruefen[],
): Promise<MarktErgebnis> {
	if (!ebay.konfiguriert()) {
		return leer({ status: "fehler", meldung: new EbayKonfigError("eBay-Zugangsdaten sind nicht hinterlegt.").message });
	}
	const ziele = vorgelesen ?? (await repos.markt.zuPruefen(n));
	if (ziele.length === 0) return leer({ status: "erfolg" });

	const stand = await portion(repos, ebay, ziele);
	// `weiter` kommt aus der Portionsgroesse, nicht aus einem Zaehler: Eine
	// volle Portion heisst, dass wahrscheinlich mehr wartet - eine halbe, dass
	// der Bestand durch ist. Das kostet nichts, und der naechste Aufruf
	// korrigiert sich ohnehin selbst.
	const nochOffen = await repos.markt.faelligeAnzahl();
	return stand.meldung === undefined
		? { ...zahlen(stand), status: "erfolg", nochOffen, weiter: ziele.length === n }
		: { ...zahlen(stand), status: "fehler", nochOffen, weiter: false, meldung: stand.meldung };
}

/**
 * EIN Release jetzt fragen - der Neuabruf nach einem Verwerfen (Stufe 20h).
 *
 * DERSELBE Pfad wie im Cron, nicht ein zweiter: `portion` traegt den
 * Titelabgleich, die Sperrliste und `ergebnisSchreiben` samt Protokoll. Ein
 * eigener Weg wuerde die Nebenwirkungen des Schritts nicht erben - und "die
 * Nebenwirkung gehoert an den Schritt, nicht an seinen Auslöser" (CLAUDE.md).
 *
 * `nochOffen` bleibt 0 und `weiter` false: Beides beantwortet die Frage "wie
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
		weiter: false,
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
	// Die Sammlung EINMAL zerlegen, nicht je Angebot: 479 Spiele x 20
	// Angebote x 10 Releases waeren sonst Zehntausende Zerlegungen in einem
	// Aufruf (CPU-Grenze, CLAUDE.md).
	const sammlung = vorbereiten(await repos.games.alleTitel());
	// Und die Sperrliste EINMAL je Portion, nicht je Release - dieselbe
	// Begruendung: Der Bestand wird einmal vorbereitet, nicht je Eingabe
	// (Stufe 20h). Hoechstens 20 Binds, weit innerhalb der 100-Bind-Grenze.
	const verworfen = await repos.markt.verworfeneJeRelease(ziele.map((z) => z.releaseId));

	const stand: Portionsstand = { geprueft: 0, mitPreis: 0, discBelegt: 0, ohneAngebot: 0, preis: null };
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
					verworfen.get(ziel.releaseId),
				);
			}
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

		const { discBelegt, preis } = await repos.markt.ergebnisSchreiben(ziel, angebote, rohangebote);
		stand.geprueft++;
		stand.preis = preis;
		if (preis !== null) stand.mitPreis++;
		if (discBelegt) stand.discBelegt++;
		if (rohangebote === 0) stand.ohneAngebot++;
	}
	return stand;
}

function leer(teil: { status: "erfolg" | "fehler"; meldung?: string }): MarktErgebnis {
	return { geprueft: 0, mitPreis: 0, discBelegt: 0, ohneAngebot: 0, nochOffen: 0, weiter: false, ...teil };
}
