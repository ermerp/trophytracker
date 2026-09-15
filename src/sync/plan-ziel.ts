import type { Repositories } from "../db";
import type { PlanZiel } from "../db/plan";
import { heuteIso, metadatenAus, normalisiereTrefferliste, type IgdbKandidat } from "../domain/igdb";
import type { Plattform } from "../domain/titel";
import type { IgdbClient } from "../igdb/client";

/**
 * Ziel eines Plan-Eintrags aus einem IGDB-Treffer (Abschnitt 5, seit Stufe 10).
 *
 * Ein Spiel mit dieser IGDB-Id wird wiederverwendet; sonst entsteht eines
 * ohne Release (Abschnitt 3) mit den IGDB-Metadaten. Eine Plattform haengt
 * den Eintrag an das Release dieser Plattform, das bei Bedarf entsteht -
 * nur auf ausdrueckliche Wahl, nie vorbelegt.
 *
 * Drei Aufrufer: POST /api/plans, der Wunschlisten-Import (8.2) und die
 * Nachpflege in "Ohne Zuordnung" (8.3).
 */
export async function zielAusKandidat(
	repos: Repositories,
	kandidat: IgdbKandidat,
	plattform: Plattform | null,
): Promise<{ ziel: PlanZiel; spielAngelegt: boolean }> {
	let gameId = await repos.games.spielNachIgdbId(kandidat.igdbId);
	let spielAngelegt = false;
	if (gameId === null) {
		gameId = await repos.games.spielOhneRelease(kandidat.name);
		await repos.igdb.verknuepfen(gameId, metadatenAus(kandidat, heuteIso()), "manuell");
		spielAngelegt = true;
	}
	const ziel: PlanZiel =
		plattform !== null ? { releaseId: await repos.games.releaseFuerPlattform(gameId, plattform) } : { gameId };
	return { ziel, spielAngelegt };
}

/**
 * Dasselbe ueber die IGDB-Id: Existiert das Spiel schon, kostet das keine
 * IGDB-Anfrage. Sonst wird der Eintrag nach Id geholt; kennt IGDB ihn
 * nicht, kommt null zurueck. IGDB-Fehler werden durchgereicht.
 */
export async function zielAusIgdbId(
	repos: Repositories,
	igdb: IgdbClient,
	igdbId: number,
	plattform: Plattform | null,
): Promise<{ ziel: PlanZiel; spielAngelegt: boolean; kandidat: IgdbKandidat | null } | null> {
	const vorhanden = await repos.games.spielNachIgdbId(igdbId);
	if (vorhanden !== null) {
		const ziel: PlanZiel =
			plattform !== null ? { releaseId: await repos.games.releaseFuerPlattform(vorhanden, plattform) } : { gameId: vorhanden };
		return { ziel, spielAngelegt: false, kandidat: null };
	}
	const kandidat = normalisiereTrefferliste(await igdb.nachIds([igdbId]))[0] ?? null;
	if (!kandidat) return null;
	return { ...(await zielAusKandidat(repos, kandidat, plattform)), kandidat };
}
