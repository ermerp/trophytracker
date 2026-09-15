import type { Repositories } from "../db";
import type { PlanZiel } from "../db/plan";
import type { Abgleichergebnis, ImportZeile } from "../db/wunschliste";
import { eindeutigerTreffer, normalisiereTrefferliste, ordneKandidaten, type IgdbKandidat } from "../domain/igdb";
import { istErlaubtePlattform, titelSchluessel, type Plattform } from "../domain/titel";
import { IgdbRateError, type IgdbClient } from "../igdb/client";
import { KANDIDATEN_JE_SPIEL, kandidatenSuchen, meldungFuer } from "./igdb";
import { zielAusKandidat } from "./plan-ziel";

/**
 * Wunschlisten-Import in begrenzten Schritten (Abschnitt 8.2).
 *
 * Dasselbe Muster wie der IGDB-Abgleich (sync/igdb.ts): Ein Aufruf
 * bearbeitet hoechstens ZEILEN_JE_AUFRUF Zeilen, der Fortschritt steht in
 * wishlist_import_line.checked_at, die Oberflaeche ruft, solange `weiter`
 * zurueckkommt. Ein Ratenlimit von IGDB beendet den Schritt sauber.
 */

export const ZEILEN_JE_AUFRUF = 8;
export const UEBERNAHME_JE_AUFRUF = 25;

export type ImportAbgleichErgebnis = {
	status: "erfolg" | "laufend" | "fehler";
	geprueft: number;
	sammlung: number;
	eindeutig: number;
	mehrdeutig: number;
	ohneTreffer: number;
	nochOffen: number;
	weiter: boolean;
	meldung?: string;
};

function jahrAus(listedAt: string | null): number | null {
	if (!listedAt) return null;
	const jahr = Number(listedAt.slice(0, 4));
	return Number.isInteger(jahr) ? jahr : null;
}

function plattformDerZeile(z: ImportZeile): Plattform | null {
	return z.platform !== null && istErlaubtePlattform(z.platform) ? z.platform : null;
}

/**
 * Sammlungstreffer: Genau ein Spiel mit gleichem Schluessel - oder bei
 * mehreren das eine, dessen Releases die Plattform der Liste tragen.
 * Das Release steht hier nur, wenn es schon existiert (Anzeige und
 * Duplikatpruefung); die Uebernahme legt es bei genannter Plattform an.
 * Ohne Plattform zaehlt das einzige Release, sonst haengt der Wunsch am
 * Spiel - eine geratene Plattform waere eine Aussage, die nie getroffen
 * wurde (Abschnitt 5).
 */
async function sammlungstreffer(
	repos: Repositories,
	schluessel: string,
	plattform: Plattform | null,
): Promise<{ gameId: number; releaseId: number | null } | null> {
	const spiele = await repos.games.spieleNachSchluessel(schluessel);
	if (spiele.length === 0) return null;
	let spiel = spiele.length === 1 ? spiele[0] : null;
	if (!spiel && plattform !== null) {
		const passend = spiele.filter((s) => (s.plattformen ?? "").split(",").includes(plattform));
		spiel = passend.length === 1 ? passend[0] : null;
	}
	if (!spiel) return null;

	const releases = await repos.games.releasesVon(spiel.id);
	if (plattform !== null) {
		const release = releases.find((r) => r.platform === plattform);
		return { gameId: spiel.id, releaseId: release?.id ?? null };
	}
	return { gameId: spiel.id, releaseId: releases.length === 1 ? releases[0].id : null };
}

/** Am Ziel haengt schon ein offener Wunsch (409-Regel aus Abschnitt 5) → 'schon_vorhanden'. */
async function entscheidungFuer(
	repos: Repositories,
	ziel: PlanZiel,
): Promise<Abgleichergebnis["decision"]> {
	return (await repos.plan.offenerEintrag("wunsch", ziel)) === null ? "offen" : "schon_vorhanden";
}

export async function importAbgleichSchritt(
	repos: Repositories,
	igdb: IgdbClient,
	importId: number,
	n = ZEILEN_JE_AUFRUF,
): Promise<ImportAbgleichErgebnis> {
	const zeilen = await repos.wishlistImport.naechsteOffen(importId, n);
	const zaehler = { geprueft: 0, sammlung: 0, eindeutig: 0, mehrdeutig: 0, ohneTreffer: 0 };

	try {
		for (const zeile of zeilen) {
			const schluessel = titelSchluessel(zeile.title);
			const plattform = plattformDerZeile(zeile);

			const inSammlung = await sammlungstreffer(repos, schluessel, plattform);
			if (inSammlung) {
				const ziel: PlanZiel = inSammlung.releaseId !== null ? { releaseId: inSammlung.releaseId } : { gameId: inSammlung.gameId };
				await repos.wishlistImport.ergebnisSetzen(
					zeile.id,
					{
						matchKind: "sammlung",
						gameId: inSammlung.gameId,
						releaseId: inSammlung.releaseId,
						igdbId: null,
						searchPath: null,
						decision: await entscheidungFuer(repos, ziel),
					},
					[],
				);
				zaehler.sammlung++;
				zaehler.geprueft++;
				continue;
			}

			const { kandidaten, begriff, weg } = await kandidatenSuchen(igdb, zeile.title);
			const suchSchluessel = titelSchluessel(begriff);
			const plattformen = plattform !== null ? [plattform] : [];
			const treffer = eindeutigerTreffer(suchSchluessel, plattformen, kandidaten, jahrAus(zeile.listed_at));
			const geordnet = ordneKandidaten(suchSchluessel, plattformen, kandidaten).slice(0, KANDIDATEN_JE_SPIEL);

			if (treffer) {
				const vorhanden = await repos.games.spielNachIgdbId(treffer.igdbId);
				let ergebnis: Abgleichergebnis;
				if (vorhanden !== null) {
					// Das Spiel gibt es schon (etwa aus einem frueheren Wunsch) -
					// wiederverwenden statt ein zweites mit derselben IGDB-Id anzulegen.
					const releases = await repos.games.releasesVon(vorhanden);
					const release = plattform !== null ? releases.find((r) => r.platform === plattform) : undefined;
					const ziel: PlanZiel = release ? { releaseId: release.id } : { gameId: vorhanden };
					ergebnis = {
						matchKind: "vorhanden",
						gameId: vorhanden,
						releaseId: release?.id ?? null,
						igdbId: treffer.igdbId,
						searchPath: weg,
						decision: await entscheidungFuer(repos, ziel),
					};
				} else {
					ergebnis = { matchKind: "eindeutig", gameId: null, releaseId: null, igdbId: treffer.igdbId, searchPath: weg, decision: "offen" };
				}
				await repos.wishlistImport.ergebnisSetzen(zeile.id, ergebnis, geordnet);
				zaehler.eindeutig++;
			} else {
				await repos.wishlistImport.ergebnisSetzen(
					zeile.id,
					{
						matchKind: kandidaten.length === 0 ? "ohne_treffer" : "mehrdeutig",
						gameId: null,
						releaseId: null,
						igdbId: null,
						searchPath: weg,
						decision: "offen",
					},
					geordnet,
				);
				if (kandidaten.length === 0) zaehler.ohneTreffer++;
				else zaehler.mehrdeutig++;
			}
			zaehler.geprueft++;
		}
	} catch (fehler) {
		const nochOffen = (await repos.wishlistImport.lauf(importId))?.zaehler.ungeprueft ?? 0;
		if (fehler instanceof IgdbRateError) {
			return { status: "laufend", ...zaehler, nochOffen, weiter: true, meldung: fehler.message };
		}
		return { status: "fehler", ...zaehler, nochOffen, weiter: false, meldung: meldungFuer(fehler) };
	}

	const nochOffen = (await repos.wishlistImport.lauf(importId))?.zaehler.ungeprueft ?? 0;
	return { status: nochOffen > 0 ? "laufend" : "erfolg", ...zaehler, nochOffen, weiter: nochOffen > 0 };
}

export type ImportUebernahmeErgebnis = {
	status: "erfolg" | "fehler";
	uebernommen: number;
	spieleAngelegt: number;
	nochOffen: number;
	weiter: boolean;
	meldung?: string;
};

/**
 * Blockuebernahme der klaren Zeilen (Sammlung, vorhanden, eindeutig) - ein
 * Knopf fuer rund 220 von 318 Zeilen. Die IGDB-Eintraege der eindeutigen
 * Zeilen kommen in einer Anfrage (Muster igdbAuffrischSchritt); je Zeile
 * entsteht ein plan_entry mit origin 'import'. Zeilen, deren Ziel schon
 * einen offenen Wunsch traegt, sind vorher als 'schon_vorhanden' markiert
 * und nicht mehr dabei.
 */
export async function importUebernahmeSchritt(
	repos: Repositories,
	igdb: IgdbClient,
	importId: number,
	n = UEBERNAHME_JE_AUFRUF,
): Promise<ImportUebernahmeErgebnis> {
	const zeilen = await repos.wishlistImport.zuUebernehmen(importId, n);
	let uebernommen = 0;
	let spieleAngelegt = 0;

	try {
		const igdbIds = [...new Set(zeilen.filter((z) => z.match_kind === "eindeutig" && z.igdb_id !== null).map((z) => z.igdb_id as number))];
		const nachId = new Map<number, IgdbKandidat>();
		if (igdbIds.length > 0) {
			for (const k of normalisiereTrefferliste(await igdb.nachIds(igdbIds))) nachId.set(k.igdbId, k);
		}

		for (const zeile of zeilen) {
			const plattform = plattformDerZeile(zeile);
			let ziel: PlanZiel;
			if (zeile.match_kind === "eindeutig") {
				const kandidat = zeile.igdb_id !== null ? nachId.get(zeile.igdb_id) : undefined;
				if (!kandidat) {
					// IGDB kennt den Eintrag nicht mehr - zurueck in die Durchsicht statt raten.
					await repos.wishlistImport.ergebnisSetzen(
						zeile.id,
						{ matchKind: "ohne_treffer", gameId: null, releaseId: null, igdbId: null, searchPath: zeile.search_path, decision: "offen" },
						[],
					);
					continue;
				}
				const e = await zielAusKandidat(repos, kandidat, plattform);
				ziel = e.ziel;
				if (e.spielAngelegt) spieleAngelegt++;
			} else if (zeile.game_id !== null) {
				// Nennt die Liste eine Plattform, haengt der Wunsch am Release dieser
				// Plattform - es entsteht bei Bedarf, wie beim IGDB-Treffer. Ohne
				// Plattform am einzigen Release, sonst am Spiel.
				if (plattform !== null) ziel = { releaseId: await repos.games.releaseFuerPlattform(zeile.game_id, plattform) };
				else if (zeile.release_id !== null) ziel = { releaseId: zeile.release_id };
				else ziel = { gameId: zeile.game_id };
			} else {
				continue;
			}

			// Zwischen Abgleich und Uebernahme kann ein Wunsch von Hand entstanden sein.
			if ((await repos.plan.offenerEintrag("wunsch", ziel)) !== null) {
				await repos.wishlistImport.entscheiden(zeile.id, "schon_vorhanden");
				continue;
			}
			const planId = await repos.plan.anlegen("wunsch", ziel, "import");
			await repos.wishlistImport.entscheiden(zeile.id, "uebernommen", planId);
			uebernommen++;
		}
	} catch (fehler) {
		const nochOffen = (await repos.wishlistImport.lauf(importId))?.zaehler.klar ?? 0;
		return { status: "fehler", uebernommen, spieleAngelegt, nochOffen, weiter: false, meldung: meldungFuer(fehler) };
	}

	const nochOffen = (await repos.wishlistImport.lauf(importId))?.zaehler.klar ?? 0;
	return { status: "erfolg", uebernommen, spieleAngelegt, nochOffen, weiter: nochOffen > 0 };
}
