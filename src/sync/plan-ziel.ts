import type { Repositories } from "../db";
import type { PlanZiel } from "../db/plan";
import { heuteIso, metadatenAus, normalisiereTrefferliste, type IgdbKandidat } from "../domain/igdb";
import { neuestePlattform, type Plattform } from "../domain/titel";
import type { IgdbClient } from "../igdb/client";

/**
 * Plattform eines Wunsches: eine der vier, keine (null) oder "auto" - dann
 * die neueste, die der IGDB-Eintrag beziehungsweise die Releases des Spiels
 * nennen (Abschnitt 5, Entscheidung des Nutzers vom 15.09.2026). Ein Spiel
 * soll in der Regel eine Plattform bekommen; "ohne" bleibt waehlbar.
 */
export type PlattformWahl = Plattform | null | "auto";

/** Neueste Plattform aus den Releases eines Spiels, sonst aus dem IGDB-Eintrag. */
async function automatischePlattform(
	repos: Repositories,
	gameId: number,
	kandidat: IgdbKandidat | null,
): Promise<Plattform | null> {
	const releases = await repos.games.releasesVon(gameId);
	return neuestePlattform(releases.map((r) => r.platform)) ?? (kandidat ? neuestePlattform(kandidat.plattformen) : null);
}

async function zielFuer(repos: Repositories, gameId: number, plattform: Plattform | null): Promise<PlanZiel> {
	return plattform !== null ? { releaseId: await repos.games.releaseFuerPlattform(gameId, plattform) } : { gameId };
}

/** Ziel an einem vorhandenen Spiel, mit aufgeloester Plattformwahl. */
export async function zielAmSpiel(repos: Repositories, gameId: number, wahl: PlattformWahl): Promise<PlanZiel> {
	const plattform = wahl === "auto" ? await automatischePlattform(repos, gameId, null) : wahl;
	return zielFuer(repos, gameId, plattform);
}

/**
 * Ziel eines Plan-Eintrags aus einem IGDB-Treffer (Abschnitt 5, seit Stufe 10).
 *
 * Ein Spiel mit dieser IGDB-Id wird wiederverwendet; sonst entsteht eines
 * ohne Release (Abschnitt 3) mit den IGDB-Metadaten. Eine Plattform haengt
 * den Eintrag an das Release dieser Plattform, das bei Bedarf entsteht.
 *
 * Drei Aufrufer: POST /api/plans, der Wunschlisten-Import (8.2) und die
 * Nachpflege in "Ohne Zuordnung" (8.3).
 */
export async function zielAusKandidat(
	repos: Repositories,
	kandidat: IgdbKandidat,
	wahl: PlattformWahl,
): Promise<{ ziel: PlanZiel; spielAngelegt: boolean }> {
	let gameId = await repos.games.spielNachIgdbId(kandidat.igdbId);
	let spielAngelegt = false;
	if (gameId === null) {
		gameId = await repos.games.spielOhneRelease(kandidat.name);
		await repos.igdb.verknuepfen(gameId, metadatenAus(kandidat, heuteIso()), "manuell");
		spielAngelegt = true;
	}
	const plattform = wahl === "auto" ? await automatischePlattform(repos, gameId, kandidat) : wahl;
	return { ziel: await zielFuer(repos, gameId, plattform), spielAngelegt };
}

/**
 * Dasselbe ueber die IGDB-Id: Existiert das Spiel schon, kostet das keine
 * IGDB-Anfrage - ausser bei "auto" ohne eigene Releases, dann liefert der
 * IGDB-Eintrag die Plattformen. Kennt IGDB die Id nicht, kommt null zurueck.
 * IGDB-Fehler werden durchgereicht.
 */
export async function zielAusIgdbId(
	repos: Repositories,
	igdb: IgdbClient,
	igdbId: number,
	wahl: PlattformWahl,
): Promise<{ ziel: PlanZiel; spielAngelegt: boolean; kandidat: IgdbKandidat | null } | null> {
	const vorhanden = await repos.games.spielNachIgdbId(igdbId);
	if (vorhanden !== null) {
		let plattform = wahl === "auto" ? await automatischePlattform(repos, vorhanden, null) : wahl;
		let kandidat: IgdbKandidat | null = null;
		if (wahl === "auto" && plattform === null) {
			// Spiel ohne Release: die Plattformen kennt nur der IGDB-Eintrag.
			kandidat = normalisiereTrefferliste(await igdb.nachIds([igdbId]))[0] ?? null;
			if (kandidat) plattform = neuestePlattform(kandidat.plattformen);
		}
		return { ziel: await zielFuer(repos, vorhanden, plattform), spielAngelegt: false, kandidat };
	}
	const kandidat = normalisiereTrefferliste(await igdb.nachIds([igdbId]))[0] ?? null;
	if (!kandidat) return null;
	return { ...(await zielAusKandidat(repos, kandidat, wahl)), kandidat };
}
