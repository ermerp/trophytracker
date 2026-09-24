import type { Repositories } from "../db";
import type { GespielterTitel } from "../db/besitz";
import { dauerInSekunden, plattformAusKategorie } from "../domain/psn-besitz";
import { titelSchluessel } from "../domain/titel";
import { PsnAuthError, type PsnClient } from "../psn/client";

/**
 * Spielzeit und digitaler Besitz aus PSN holen (Abschnitt 7.7, Stufe 18c).
 *
 * Beide Schritte holen EINE Seite je Aufruf und halten den Fortschritt in
 * app_setting - wie der Trophaeen-Sync, aus demselben Grund (10-ms-Grenze,
 * Abschnitt 2). Die Rohantworten werden NICHT abgelegt: klein und jederzeit
 * neu abrufbar, dieselbe Begruendung wie bei IGDB (ausdrueckliche Ausnahme,
 * Entscheidung des Nutzers vom 22.09.2026).
 *
 * Zugeordnet wird wie bei den Trophaeenlisten (`ordneAutomatischZu`): ueber
 * den Titelschluessel, und nur bei GENAU EINEM Release mit passender
 * Plattform. Alles andere bleibt liegen - importiert wird nichts.
 */

export const GESPIELTE_JE_SEITE = 200;
export const KAEUFE_JE_SEITE = 50;

export type SpielzeitErgebnis = {
	status: "erfolg" | "fehler";
	/** Titel der Seite, wie Sony sie liefert - VOR dem Plattformfilter. */
	geholt: number;
	/** Was den Filter ueberlebt hat und gespeichert wurde (PS4/PS5). */
	geschrieben: number;
	/** Teilmenge von `geschrieben`, die an genau einem Release haengt. */
	zugeordnet: number;
	weiter: boolean;
	meldung?: string;
};

export type BesitzErgebnis = {
	status: "erfolg" | "fehler";
	geholt: number;
	kauf: number;
	plus: number;
	/** Offene Kauf-/Wunscheintraege, die ein erkannter Kauf geschlossen hat (nur bei "nur digital"). */
	erledigt: number;
	entfallen: number;
	weiter: boolean;
	meldung?: string;
};

/**
 * Das eine Release zu einem PSN-Titel - oder null.
 *
 * Genau ein Kandidat mit passender Plattform, sonst nichts: Zwei Treffer
 * bedeuten, dass die Entscheidung dem Nutzer gehoert (Abschnitt 7).
 */
async function releaseZu(repos: Repositories, name: string, plattform: string): Promise<number | null> {
	const schluessel = titelSchluessel(name);
	if (!schluessel) return null;
	const kandidaten = await repos.games.releasesNachSchluessel(schluessel);
	const passend = kandidaten.filter((k) => k.platform === plattform);
	return passend.length === 1 ? passend[0].id : null;
}

/** Eine Seite gespielter Titel holen, zuordnen und schreiben. */
export async function spielzeitSchritt(
	repos: Repositories,
	psn: PsnClient,
	accessToken: Parameters<PsnClient["holeGespielteSeite"]>[0],
	offset: number,
): Promise<SpielzeitErgebnis> {
	try {
		const { gesamt, titel } = await psn.holeGespielteSeite(accessToken, offset, GESPIELTE_JE_SEITE);

		const gefiltert: GespielterTitel[] = [];
		let zugeordnet = 0;
		for (const t of titel) {
			// Streaming-Apps und Unbestimmtes fallen hier heraus, bevor
			// irgendetwas gespeichert wird.
			const plattform = plattformAusKategorie(t.category);
			if (!plattform || !t.titleId || !t.name) continue;

			const releaseId = await releaseZu(repos, t.name, plattform);
			if (releaseId !== null) zugeordnet++;
			gefiltert.push({
				titleId: t.titleId,
				name: t.name,
				platform: plattform,
				spielzeitSekunden: dauerInSekunden(t.playDuration),
				spielzahl: typeof t.playCount === "number" ? t.playCount : null,
				erstesSpielAm: t.firstPlayedDateTime ?? null,
				letztesSpielAm: t.lastPlayedDateTime ?? null,
				releaseId,
			});
		}

		// In Stuecken schreiben: D1 erlaubt 100 gebundene Werte je Statement,
		// und hier sind es acht je Titel.
		let geschrieben = 0;
		for (let i = 0; i < gefiltert.length; i += 12) {
			geschrieben += await repos.besitz.spielzeitSchreiben(gefiltert.slice(i, i + 12));
		}

		return {
			status: "erfolg",
			geholt: titel.length,
			geschrieben,
			zugeordnet,
			weiter: offset + titel.length < gesamt && titel.length > 0,
		};
	} catch (fehler) {
		return { status: "fehler", geholt: 0, geschrieben: 0, zugeordnet: 0, weiter: false, meldung: meldungFuer(fehler) };
	}
}

/**
 * Eine Seite der Kaufliste holen und in Berechtigungen uebersetzen.
 *
 * `gesehen` sammelt die Releases, die PSN in diesem Durchlauf als PS+ nennt.
 * Erst wenn ALLE Seiten geholt sind, raeumt der Aufrufer damit auf - ein
 * abgebrochener Lauf loescht nichts (7.7).
 */
export async function besitzSchritt(
	repos: Repositories,
	psn: PsnClient,
	accessToken: Parameters<PsnClient["holeKaeufeSeite"]>[0],
	start: number,
	gesehen: number[],
): Promise<BesitzErgebnis> {
	try {
		const { gesamt, eintraege } = await psn.holeKaeufeSeite(accessToken, start, KAEUFE_JE_SEITE);

		let kauf = 0;
		let plus = 0;
		let erledigt = 0;
		for (const e of eintraege) {
			if (!e.name || !e.platform) continue;
			const plattform = e.platform.trim().toUpperCase();
			const releaseId = await releaseZu(repos, e.name, plattform);
			if (releaseId === null) continue;

			if (e.subscriptionService === "PS_PLUS") {
				gesehen.push(releaseId);
				// Kauf schlaegt PS+: Wer gekauft hat, behaelt - da ist das Abo
				// gleichgueltig (Entscheidung des Nutzers vom 22.09.2026).
				if (await repos.besitz.hatKauf(releaseId)) continue;
				if (await repos.besitz.berechtigungErkennen(releaseId, "plus")) plus++;
			} else if (await repos.besitz.berechtigungErkennen(releaseId, "kauf")) {
				kauf++;
				// Ein erkannter Kauf erledigt offene Kauf- und Wunscheintraege
				// NUR, wenn es das Spiel ausschliesslich digital gibt. Sonst
				// koennte der Wunsch der Disc gelten (Entscheidung des Nutzers
				// vom 22.09.2026) - die Ausnahme zur Regel aus Abschnitt 5,
				// die beim Erfassen von Hand ohne Rueckfrage greift.
				if (await repos.besitz.nurDigital(releaseId)) {
					const offen = await repos.plan.offeneAmZiel(["kauf", "wunsch"], { releaseId });
					erledigt += await repos.plan.erledigen(
						offen.map((e) => e.id),
						"besitz",
					);
				}
			}
		}

		const weiter = start + eintraege.length < gesamt && eintraege.length > 0;
		// Nur am Ende eines vollstaendigen Durchlaufs aufraeumen.
		const entfallen = weiter ? 0 : await repos.besitz.plusAufraeumen(gesehen);

		return { status: "erfolg", geholt: eintraege.length, kauf, plus, erledigt, entfallen, weiter };
	} catch (fehler) {
		return { status: "fehler", geholt: 0, kauf: 0, plus: 0, erledigt: 0, entfallen: 0, weiter: false, meldung: meldungFuer(fehler) };
	}
}

/** Nur eigene Fehlertypen woertlich - kein Fremdtext, der ein Geheimnis zitieren koennte. */
function meldungFuer(fehler: unknown): string {
	if (fehler instanceof PsnAuthError) return fehler.message;
	return "Der PSN-Abruf ist fehlgeschlagen.";
}
