import type { TrophyEintrag } from "../domain/gruppen";
import { titelSchluessel, type Plattform } from "../domain/titel";

export type ZuOrdnenderRelease = {
	npCommunicationId: string;
	plattform: Plattform;
};

export type GruppeErgebnis = {
	gameId: number;
	releaseIds: number[];
	/** Listen, die schon zugeordnet waren und deshalb uebersprungen wurden. */
	uebersprungen: string[];
};

/**
 * Sieht der Titel nach einer von Sony gekuerzten Bezeichnung aus?
 *
 * Erste Fassung pruefte nur "zwei bis drei Grossbuchstaben am Anfang" und
 * markierte damit auch "THE FINALS" und "ACE COMBAT INFINITY" - komplett
 * grossgeschriebene Titel, also Schreibweise statt Abkuerzung.
 *
 * Zusaetzliche Bedingung: Der Titel muss Kleinbuchstaben enthalten. Dann
 * sticht das Kuerzel heraus ("AC Brotherhood"), statt Teil einer
 * durchgaengigen Grossschreibung zu sein.
 *
 * Preis: Vollstaendig grossgeschriebene Abkuerzungen wie "GTA IV" fallen
 * heraus. Das ist der bewusste Tausch - drei falsche Treffer gegen einen
 * verpassten, und Rauschen macht einen Filter nutzlos.
 */
function wirktAbgekuerzt(titel: string): boolean {
	return /^[A-Z]{2,3}\s/.test(titel) && /[a-z]/.test(titel);
}

export type UebersichtZeile = {
	game_id: number;
	title: string;
	release_id: number;
	platform: string;
	np_communication_id: string | null;
	title_name: string | null;
	progress_pct: number | null;
	defined_bronze: number | null;
	defined_silver: number | null;
	defined_gold: number | null;
	defined_platinum: number | null;
	earned_platinum: number | null;
	releases_im_spiel: number;
	struktur?: string | null;
	strukturWeichtAb?: boolean;
	ohneListe?: boolean;
	titelWirktAbgekuerzt?: boolean;
};

export type SpielZeile = {
	id: number;
	title: string;
	sort_title: string;
	cover_url: string | null;
	releases: number;
};

/**
 * Spiele und Releases.
 *
 * Der Kern ist gruppeAnlegen: Aus einer bestaetigten Gruppe entsteht ein
 * `game` mit je einem `release` pro Trophaeenliste - so beschreibt es
 * Abschnitt 3 am Beispiel GTA V.
 */
export class GamesRepository {
	constructor(private readonly db: D1Database) {}

	/** Alle noch nicht zugeordneten Trophaeenlisten, als Rohdaten fuer die Gruppierung. */
	async unzugeordnet(): Promise<TrophyEintrag[]> {
		const { results } = await this.db
			.prepare(
				"SELECT np_communication_id, title_name, platform, progress_pct, " +
					"defined_bronze, defined_silver, defined_gold, defined_platinum, " +
					"earned_platinum, icon_url " +
					"FROM trophy_progress WHERE release_id IS NULL",
			)
			.all<TrophyEintrag>();
		return results;
	}

	async anzahlUnzugeordnet(): Promise<number> {
		const z = await this.db
			.prepare("SELECT COUNT(*) AS n FROM trophy_progress WHERE release_id IS NULL")
			.first<{ n: number }>();
		return z?.n ?? 0;
	}

	/**
	 * Legt ein Spiel mit seinen Releases an und verknuepft die Trophaeenlisten.
	 *
	 * Alles in einem Batch: Eine halb angelegte Gruppe waere beim naechsten
	 * Aufruf nicht als solche erkennbar.
	 *
	 * Die Verknuepfung setzt release_id nur, wenn es NULL ist. Die Regel aus
	 * CLAUDE.md gilt auch hier: Eine einmal getroffene Zuordnung ueberschreibt
	 * kein Prozess - auch dieser nicht.
	 */
	async gruppeAnlegen(
		titel: string,
		releases: ZuOrdnenderRelease[],
	): Promise<GruppeErgebnis> {
		if (releases.length === 0) throw new Error("Eine Gruppe braucht mindestens ein Release.");

		const spiel = await this.db
			.prepare(
				"INSERT INTO game (title, sort_title) VALUES (?, ?) RETURNING id",
			)
			.bind(titel, titelSchluessel(titel))
			.first<{ id: number }>();
		if (!spiel) throw new Error("Spiel konnte nicht angelegt werden.");

		const releaseIds: number[] = [];
		const uebersprungen: string[] = [];

		for (const r of releases) {
			const angelegt = await this.db
				.prepare("INSERT INTO release (game_id, platform) VALUES (?, ?) RETURNING id")
				.bind(spiel.id, r.plattform)
				.first<{ id: number }>();
			if (!angelegt) throw new Error("Release konnte nicht angelegt werden.");
			releaseIds.push(angelegt.id);

			const ergebnis = await this.db
				.prepare(
					"UPDATE trophy_progress SET release_id = ?, matched_at = datetime('now'), " +
						"matched_source = 'manuell' " +
						"WHERE np_communication_id = ? AND release_id IS NULL",
				)
				.bind(angelegt.id, r.npCommunicationId)
				.run();

			if ((ergebnis.meta.changes ?? 0) === 0) uebersprungen.push(r.npCommunicationId);
		}

		return { gameId: spiel.id, releaseIds, uebersprungen };
	}

	/** Eine einzelne Liste einem bestehenden Release zuordnen. */
	async listeZuordnen(
		npCommunicationId: string,
		releaseId: number,
		quelle: "automatisch" | "manuell",
	): Promise<boolean> {
		const ergebnis = await this.db
			.prepare(
				"UPDATE trophy_progress SET release_id = ?, matched_at = datetime('now'), " +
					"matched_source = ? WHERE np_communication_id = ? AND release_id IS NULL",
			)
			.bind(releaseId, quelle, npCommunicationId)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	/**
	 * Kandidaten fuer die automatische Zuordnung.
	 *
	 * Liefert je Titelschluessel und Plattform die Releases. Der Aufrufer
	 * ordnet nur zu, wenn es genau einen Treffer gibt (Abschnitt 7.2).
	 */
	async releasesNachSchluessel(
		schluessel: string,
	): Promise<Array<{ id: number; platform: string }>> {
		const { results } = await this.db
			.prepare(
				"SELECT r.id, r.platform FROM release r JOIN game g ON g.id = r.game_id " +
					"WHERE g.sort_title = ?",
			)
			.bind(schluessel)
			.all<{ id: number; platform: string }>();
		return results;
	}

	/** Titel aendern. sort_title wird neu abgeleitet. */
	async umbenennen(id: number, titel: string): Promise<boolean> {
		const ergebnis = await this.db
			.prepare("UPDATE game SET title = ?, sort_title = ? WHERE id = ?")
			.bind(titel, titelSchluessel(titel), id)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	/**
	 * Loest ein Release aus seinem Spiel heraus in ein neues Spiel.
	 *
	 * Die einzige Stelle, die eine bestehende Zuordnung anfasst - und sie tut
	 * es auf ausdrueckliche Anweisung des Nutzers. Die Regel "kein
	 * automatischer Prozess ueberschreibt eine Zuordnung" bleibt unberuehrt.
	 *
	 * trophy_progress.release_id aendert sich NICHT: Die Troph
aeenliste haengt
	 * am Release, und das Release wandert mitsamt Liste.
	 */
	async releaseAbtrennen(
		releaseId: number,
		neuerTitel: string,
	): Promise<{ gameId: number; altesSpielGeloescht: boolean } | null> {
		const release = await this.db
			.prepare("SELECT id, game_id FROM release WHERE id = ?")
			.bind(releaseId)
			.first<{ id: number; game_id: number }>();
		if (!release) return null;

		const altesSpiel = release.game_id;

		const neu = await this.db
			.prepare("INSERT INTO game (title, sort_title) VALUES (?, ?) RETURNING id")
			.bind(neuerTitel, titelSchluessel(neuerTitel))
			.first<{ id: number }>();
		if (!neu) throw new Error("Neues Spiel konnte nicht angelegt werden.");

		await this.db
			.prepare("UPDATE release SET game_id = ? WHERE id = ?")
			.bind(neu.id, releaseId)
			.run();

		// Ein Spiel ohne Releases hat keinen Zweck mehr.
		const rest = await this.db
			.prepare("SELECT COUNT(*) AS n FROM release WHERE game_id = ?")
			.bind(altesSpiel)
			.first<{ n: number }>();

		const leer = (rest?.n ?? 0) === 0;
		if (leer) {
			await this.db.prepare("DELETE FROM game WHERE id = ?").bind(altesSpiel).run();
		}

		return { gameId: neu.id, altesSpielGeloescht: leer };
	}

	/**
	 * Alle Zuordnungen als Tabelle, eine Zeile je Release.
	 *
	 * Serverseitig gefiltert und geblaettert - 431 Zeilen auf einmal wuerden
	 * das 10-ms-Budget belasten, und die Auffaelligkeits-Erkennung braucht
	 * ohnehin einen Blick ueber alle Releases eines Spiels.
	 */
	async uebersicht(optionen: {
		filter: "alle" | "mehrfach" | "auffaellig";
		suche: string;
		limit: number;
		offset: number;
	}): Promise<{ zeilen: UebersichtZeile[]; gesamt: number }> {
		const { results } = await this.db
			.prepare(
				`SELECT g.id AS game_id, g.title, r.id AS release_id, r.platform,
				        t.np_communication_id, t.title_name, t.progress_pct,
				        t.defined_bronze, t.defined_silver, t.defined_gold, t.defined_platinum,
				        t.earned_platinum,
				        (SELECT COUNT(*) FROM release r2 WHERE r2.game_id = g.id) AS releases_im_spiel
				 FROM game g
				 JOIN release r ON r.game_id = g.id
				 LEFT JOIN trophy_progress t ON t.release_id = r.id
				 ORDER BY g.sort_title, r.platform`,
			)
			.all<UebersichtZeile & { releases_im_spiel: number }>();

		// Struktur je Spiel sammeln, um Abweichungen zu erkennen.
		const strukturenJeSpiel = new Map<number, Set<string>>();
		for (const z of results) {
			const s = `${z.defined_bronze}/${z.defined_silver}/${z.defined_gold}/${z.defined_platinum}`;
			const vorhanden = strukturenJeSpiel.get(z.game_id);
			if (vorhanden) vorhanden.add(s);
			else strukturenJeSpiel.set(z.game_id, new Set([s]));
		}

		const angereichert = results.map((z) => ({
			...z,
			struktur:
				z.np_communication_id === null
					? null
					: `${z.defined_bronze}/${z.defined_silver}/${z.defined_gold}/${z.defined_platinum}`,
			strukturWeichtAb: (strukturenJeSpiel.get(z.game_id)?.size ?? 1) > 1,
			ohneListe: z.np_communication_id === null,
			titelWirktAbgekuerzt: wirktAbgekuerzt(z.title),
		}));

		const suche = optionen.suche.trim().toLowerCase();
		const gefiltert = angereichert.filter((z) => {
			if (suche && !z.title.toLowerCase().includes(suche)) return false;
			if (optionen.filter === "mehrfach") return z.releases_im_spiel > 1;
			if (optionen.filter === "auffaellig") {
				return z.strukturWeichtAb || z.ohneListe || z.titelWirktAbgekuerzt;
			}
			return true;
		});

		return {
			zeilen: gefiltert.slice(optionen.offset, optionen.offset + optionen.limit),
			gesamt: gefiltert.length,
		};
	}

	async spieleListe(limit: number, offset: number): Promise<{ zeilen: SpielZeile[]; gesamt: number }> {
		const gesamt = await this.db.prepare("SELECT COUNT(*) AS n FROM game").first<{ n: number }>();
		const { results } = await this.db
			.prepare(
				"SELECT g.id, g.title, g.sort_title, g.cover_url, " +
					"(SELECT COUNT(*) FROM release r WHERE r.game_id = g.id) AS releases " +
					"FROM game g ORDER BY g.sort_title LIMIT ? OFFSET ?",
			)
			.bind(limit, offset)
			.all<SpielZeile>();
		return { zeilen: results, gesamt: gesamt?.n ?? 0 };
	}

	async spielDetail(id: number) {
		const spiel = await this.db.prepare("SELECT * FROM game WHERE id = ?").bind(id).first();
		if (!spiel) return null;

		const { results: releases } = await this.db
			.prepare(
				"SELECT r.id, r.platform, r.edition, r.region, r.physical_release_status, " +
					"t.np_communication_id, t.title_name, t.platform AS trophy_platform, " +
					"t.progress_pct, t.defined_platinum, t.earned_platinum " +
					"FROM release r LEFT JOIN trophy_progress t ON t.release_id = r.id " +
					"WHERE r.game_id = ? ORDER BY r.platform",
			)
			.bind(id)
			.all();

		return { spiel, releases };
	}
}
