import type { Repositories } from "../db";
import type { PlanZiel } from "../db/plan";
import type { EreignisQuelle } from "../domain/ereignis";
import { heuteIso, metadatenAus, normalisiereTrefferliste, type IgdbKandidat } from "../domain/igdb";
import { neuestePlattform, type Plattform } from "../domain/titel";
import type { IgdbClient } from "../igdb/client";

/**
 * Plattform eines Eintrags: eine der vier oder "auto" - dann die neueste, die
 * der IGDB-Eintrag beziehungsweise die Releases des Spiels nennen (Abschnitt 5,
 * Entscheidung des Nutzers vom 15.09.2026).
 *
 * SEIT STUFE 19D OHNE null: Ein Eintrag haengt immer an einem Release, weil
 * erst die Plattform ueber Luecke, Kauf und Preis entscheidet (Entscheidung des
 * Nutzers vom 27.09.2026). Das `null` aus diesem Typ zu entfernen war der
 * eigentliche Umbau - der Compiler hat danach jede Stelle gezeigt, die "ohne"
 * noch durchliess.
 */
export type PlattformWahl = Plattform | "auto";

/**
 * "auto" hat keine Plattform gefunden.
 *
 * Das ist der Fall, der 19d beinahe ausgehebelt haette: `automatischePlattform`
 * gibt null zurueck, wenn ein Spiel weder Releases noch einen IGDB-Kandidaten
 * mit Plattform hat, und daraus entstand stillschweigend ein Eintrag am Spiel -
 * ohne Plattform, ueber genau die Tuer, die als Ausnahme gedacht war. Jetzt
 * ist es ein Fehler, den die Routen als 400 beantworten.
 */
export class KeinePlattformError extends Error {
	constructor() {
		super("Zu diesem Spiel ist keine Plattform bekannt. Bitte eine der vier waehlen.");
	}
}

/** Neueste Plattform aus den Releases eines Spiels, sonst aus dem IGDB-Eintrag. */
async function automatischePlattform(
	repos: Repositories,
	gameId: number,
	kandidat: IgdbKandidat | null,
): Promise<Plattform | null> {
	const releases = await repos.games.releasesVon(gameId);
	return neuestePlattform(releases.map((r) => r.platform)) ?? (kandidat ? neuestePlattform(kandidat.plattformen) : null);
}

/**
 * Das Release zur Plattform, das bei Bedarf entsteht. Seit 19d gibt es keinen
 * Zweig mehr, der ein Ziel am Spiel zurueckgibt.
 */
async function zielFuer(repos: Repositories, gameId: number, plattform: Plattform, quelle: EreignisQuelle): Promise<PlanZiel> {
	return { releaseId: await repos.games.releaseFuerPlattform(gameId, plattform, quelle) };
}

/** Loest "auto" auf und wirft, wenn dabei keine Plattform herauskommt. */
async function aufgeloest(
	repos: Repositories,
	gameId: number,
	wahl: PlattformWahl,
	kandidat: IgdbKandidat | null,
): Promise<Plattform> {
	if (wahl !== "auto") return wahl;
	const plattform = await automatischePlattform(repos, gameId, kandidat);
	if (plattform === null) throw new KeinePlattformError();
	return plattform;
}

/** Ziel an einem vorhandenen Spiel, mit aufgeloester Plattformwahl. */
export async function zielAmSpiel(
	repos: Repositories,
	gameId: number,
	wahl: PlattformWahl,
	quelle: EreignisQuelle = "nutzer",
): Promise<PlanZiel> {
	return zielFuer(repos, gameId, await aufgeloest(repos, gameId, wahl, null), quelle);
}

/**
 * Ziel eines Plan-Eintrags aus einem IGDB-Treffer (Abschnitt 5, seit Stufe 10).
 *
 * Ein Spiel mit dieser IGDB-Id wird wiederverwendet; sonst entsteht eines
 * ohne Release (Abschnitt 3) mit den IGDB-Metadaten. Eine Plattform haengt
 * den Eintrag an das Release dieser Plattform, das bei Bedarf entsteht.
 *
 * Drei Aufrufer: POST /api/plans, der Wunschlisten-Import (8.2) und die
 * Nachpflege in "Ohne Zuordnung" (8.3). `quelle` steht im Protokoll (8.5):
 * 'import', wenn der Wunschlisten-Import Spiel und Release anlegt.
 */
export async function zielAusKandidat(
	repos: Repositories,
	kandidat: IgdbKandidat,
	wahl: PlattformWahl,
	quelle: EreignisQuelle = "nutzer",
): Promise<{ ziel: PlanZiel; spielAngelegt: boolean }> {
	let gameId = await repos.games.spielNachIgdbId(kandidat.igdbId);
	let spielAngelegt = false;
	if (gameId === null) {
		gameId = await repos.games.spielOhneRelease(kandidat.name, quelle);
		await repos.igdb.verknuepfen(gameId, metadatenAus(kandidat, heuteIso()), "manuell", quelle);
		spielAngelegt = true;
	}
	const plattform = await aufgeloest(repos, gameId, wahl, kandidat);
	return { ziel: await zielFuer(repos, gameId, plattform, quelle), spielAngelegt };
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
	quelle: EreignisQuelle = "nutzer",
): Promise<{ ziel: PlanZiel; spielAngelegt: boolean; kandidat: IgdbKandidat | null } | null> {
	const vorhanden = await repos.games.spielNachIgdbId(igdbId);
	if (vorhanden !== null) {
		let kandidat: IgdbKandidat | null = null;
		let plattform = wahl === "auto" ? await automatischePlattform(repos, vorhanden, null) : wahl;
		if (plattform === null) {
			// Spiel ohne Release: die Plattformen kennt nur der IGDB-Eintrag.
			kandidat = normalisiereTrefferliste(await igdb.nachIds([igdbId]))[0] ?? null;
			if (kandidat) plattform = neuestePlattform(kandidat.plattformen);
		}
		if (plattform === null) throw new KeinePlattformError();
		return { ziel: await zielFuer(repos, vorhanden, plattform, quelle), spielAngelegt: false, kandidat };
	}
	const kandidat = normalisiereTrefferliste(await igdb.nachIds([igdbId]))[0] ?? null;
	if (!kandidat) return null;
	return { ...(await zielAusKandidat(repos, kandidat, wahl, quelle)), kandidat };
}
