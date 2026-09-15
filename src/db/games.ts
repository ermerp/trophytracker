import type { TrophyEintrag } from "../domain/gruppen";
import type { PlayStatus } from "../domain/play-status";
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
	sort_title: string;
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
	schluesselVeraltet?: boolean;
};

export const BESITZ_FILTER = ["physisch", "digital", "beide", "keins"] as const;
export const JA_NEIN = ["ja", "nein"] as const;
export const PLATIN_FILTER = ["ja", "nein", "nichtverfuegbar"] as const;
export const DISC_FILTER = ["ja", "nein", "unbekannt"] as const;
export const SORTIERUNGEN = ["titel", "zuletzt"] as const;

/**
 * Filter auf GET /api/games (Abschnitt 12).
 *
 * Semantik: Ein Spiel erscheint, wenn mindestens ein Release alle
 * Release-Filter zugleich erfuellt. `platform=PS4&owned=physisch` heisst also
 * "hat eine PS4-Disc", nicht "hat irgendeine Disc und irgendein PS4-Release".
 */
export type SpieleFilter = {
	platform?: Plattform;
	owned?: (typeof BESITZ_FILTER)[number];
	played?: (typeof JA_NEIN)[number];
	platinum?: (typeof PLATIN_FILTER)[number];
	/** Fehlende Zeile zaehlt fuer den Filter als 'nicht_gespielt' (wie in v_backlog_kandidaten). */
	playStatus?: PlayStatus;
	physicalAvailable?: (typeof DISC_FILTER)[number];
	search?: string;
	sort: (typeof SORTIERUNGEN)[number];
	limit: number;
	offset: number;
};

export type SpielZeile = {
	id: number;
	title: string;
	sort_title: string;
	cover_url: string | null;
	/** Trophaeensymbol als Rueckfall, wenn IGDB kein Cover liefert oder die Zuordnung fehlt. */
	icon_url: string | null;
	critic_score: number | null;
	zuletzt_gespielt: string | null;
};

export type ReleaseZeile = {
	id: number;
	game_id: number;
	platform: string;
	physical_release_status: "ja" | "nein" | "unbekannt";
	progress_pct: number | null;
	defined_platinum: number | null;
	earned_platinum: number | null;
	last_played_at: string | null;
	/** null = keine Zeile. Wird so ausgegeben, nicht als 'nicht_gespielt' verkleidet. */
	play_status: PlayStatus | null;
	exemplare: number;
	/** Kommagetrennte Quellen, z. B. "kauf,plus" - oder null. */
	digital: string | null;
};

export type SpielDetail = {
	spiel: {
		id: number;
		title: string;
		sort_title: string;
		cover_url: string | null;
		igdb_id: number | null;
		igdb_slug: string | null;
		igdb_matched_at: string | null;
		igdb_matched_source: "automatisch" | "manuell" | null;
		igdb_checked_at: string | null;
		igdb_declined_at: string | null;
		igdb_synced_at: string | null;
		release_date: string | null;
		release_status: "erschienen" | "angekuendigt" | "unbekannt";
		critic_score: number | null;
		critic_score_count: number | null;
		critic_source: string | null;
		critic_updated_at: string | null;
		created_at: string;
	};
	releases: Array<{
		id: number;
		platform: string;
		edition: string | null;
		region: string | null;
		physical_release_status: "ja" | "nein" | "unbekannt";
		physical_source: string | null;
		np_communication_id: string | null;
		title_name: string | null;
		icon_url: string | null;
		progress_pct: number | null;
		defined_bronze: number | null;
		defined_silver: number | null;
		defined_gold: number | null;
		defined_platinum: number | null;
		earned_bronze: number | null;
		earned_silver: number | null;
		earned_gold: number | null;
		earned_platinum: number | null;
		last_played_at: string | null;
	}>;
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

	/**
	 * Rechnet sort_title fuer alle Spiele neu aus dem Titel aus.
	 *
	 * sort_title ist abgeleitete Information. Aendert sich die Regel in
	 * titelSchluessel - und das ist bereits zweimal passiert -, veralten die
	 * gespeicherten Werte still. Folge: Die automatische Zuordnung sucht ueber
	 * sort_title und findet dann zu viele oder zu wenige Kandidaten.
	 *
	 * Nach jeder Aenderung an der Normalisierung aufrufen.
	 */
	async sortierschluesselNeuBerechnen(): Promise<{ geprueft: number; geaendert: number }> {
		const { results } = await this.db
			.prepare("SELECT id, title, sort_title FROM game")
			.all<{ id: number; title: string; sort_title: string }>();

		const zuAendern = results
			.map((g) => ({ id: g.id, neu: titelSchluessel(g.title), alt: g.sort_title }))
			.filter((g) => g.neu !== g.alt);

		if (zuAendern.length > 0) {
			const anweisung = this.db.prepare("UPDATE game SET sort_title = ? WHERE id = ?");
			await this.db.batch(zuAendern.map((g) => anweisung.bind(g.neu, g.id)));
		}

		return { geprueft: results.length, geaendert: zuAendern.length };
	}

	/**
	 * Titel aendern. sort_title wird neu abgeleitet.
	 *
	 * Ein Spiel ohne IGDB-Verknuepfung, das der Nutzer nicht abgelehnt hat,
	 * verliert seinen Suchstempel: Der neue Titel ist meist genau die
	 * Korrektur, mit der IGDB den Eintrag findet (Abschnitt 7.6).
	 */
	async umbenennen(id: number, titel: string): Promise<boolean> {
		const ergebnis = await this.db
			.prepare(
				"UPDATE game SET title = ?, sort_title = ?, " +
					"igdb_checked_at = CASE WHEN igdb_id IS NULL AND igdb_declined_at IS NULL THEN NULL ELSE igdb_checked_at END " +
					"WHERE id = ?",
			)
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

		const leer = await this.leeresSpielLoeschen(altesSpiel);
		return { gameId: neu.id, altesSpielGeloescht: leer };
	}

	/**
	 * Ein Spiel ohne Releases hat keinen Zweck mehr - ausser es traegt eine
	 * Absicht (Stufe 10): Ein Wunsch aus der IGDB-Suche haengt am Spiel und
	 * hat nie ein Release gehabt. Wer probeweise eines anlegt und wieder
	 * entfernt, darf den Wunsch nicht per CASCADE verlieren. Seit Stufe 12
	 * zaehlt jeder Eintrag, nicht nur ein offener: Ein erledigter oder
	 * verworfener ist Historie und haelt das Spiel (Entscheidung des Nutzers
	 * vom 15.09.2026, Abschnitt 5). Gibt zurueck, ob geloescht wurde.
	 */
	private async leeresSpielLoeschen(gameId: number): Promise<boolean> {
		const ergebnis = await this.db
			.prepare(
				"DELETE FROM game WHERE id = ? " +
					"AND NOT EXISTS (SELECT 1 FROM release WHERE game_id = game.id) " +
					"AND NOT EXISTS (SELECT 1 FROM plan_entry WHERE game_id = game.id)",
			)
			.bind(gameId)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	/**
	 * Waisen nach dem Loeschen eines Eintrags (Stufe 12, Abschnitt 5): Ein
	 * Release, das nur fuer einen Wunsch entstanden ist - ohne Trophaeenliste,
	 * Exemplar, Berechtigung, Bewertung und anderen Eintrag - geht mit, danach
	 * das leere Spiel. Ein Index-Lookup je Bedingung, alles auf
	 * Fremdschluesseln (Migration 0008). Ein Release aus PSN, mit Besitz oder
	 * mit gepflegtem Physisch-Status (Stufe 14) bleibt immer stehen; ein von
	 * Hand angelegtes ohne all das ist nur ein Titel und geht mit.
	 */
	async waiseAufraeumen(
		gameId: number | null,
		releaseId: number | null,
	): Promise<{ releaseGeloescht: boolean; spielGeloescht: boolean }> {
		let releaseGeloescht = false;
		if (releaseId !== null) {
			const ergebnis = await this.db
				.prepare(
					"DELETE FROM release WHERE id = ? AND physical_release_status = 'unbekannt' " +
						"AND NOT EXISTS (SELECT 1 FROM trophy_progress WHERE release_id = release.id) " +
						"AND NOT EXISTS (SELECT 1 FROM physical_copy WHERE release_id = release.id) " +
						"AND NOT EXISTS (SELECT 1 FROM digital_entitlement WHERE release_id = release.id) " +
						"AND NOT EXISTS (SELECT 1 FROM play_status WHERE release_id = release.id) " +
						"AND NOT EXISTS (SELECT 1 FROM plan_entry WHERE release_id = release.id)",
				)
				.bind(releaseId)
				.run();
			releaseGeloescht = (ergebnis.meta.changes ?? 0) > 0;
		}
		const spielGeloescht = gameId !== null && (await this.leeresSpielLoeschen(gameId));
		return { releaseGeloescht, spielGeloescht };
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
				`SELECT g.id AS game_id, g.title, g.sort_title, r.id AS release_id, r.platform,
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
			schluesselVeraltet: titelSchluessel(z.title) !== z.sort_title,
		}));

		const suche = optionen.suche.trim().toLowerCase();
		const gefiltert = angereichert.filter((z) => {
			if (suche && !z.title.toLowerCase().includes(suche)) return false;
			if (optionen.filter === "mehrfach") return z.releases_im_spiel > 1;
			if (optionen.filter === "auffaellig") {
				return (
					z.strukturWeichtAb || z.ohneListe || z.titelWirktAbgekuerzt || z.schluesselVeraltet
				);
			}
			return true;
		});

		return {
			zeilen: gefiltert.slice(optionen.offset, optionen.offset + optionen.limit),
			gesamt: gefiltert.length,
		};
	}

	/**
	 * Ein Release, das nur ein Wunsch traegt, gehoert nicht zur Sammlung
	 * (Abschnitt 3, Stufe 10): keine Trophaeenliste, kein Exemplar, keine
	 * digitale Berechtigung, aber ein offener Wunsch. Es erscheint, sobald
	 * Besitz oder Fortschritt dazukommt. Drei Index-Lookups je Release.
	 */
	private static readonly NUR_WUNSCH =
		"(t.release_id IS NULL " +
		"AND NOT EXISTS (SELECT 1 FROM physical_copy p0 WHERE p0.release_id = r.id) " +
		"AND NOT EXISTS (SELECT 1 FROM digital_entitlement d0 WHERE d0.release_id = r.id) " +
		"AND EXISTS (SELECT 1 FROM plan_entry pe0 WHERE pe0.release_id = r.id AND pe0.kind = 'wunsch' AND pe0.status = 'offen'))";

	/**
	 * Gefilterte Spieleliste fuer die Sammlungsansicht.
	 *
	 * Die Bedingungen kommen aus festen Textbausteinen, Nutzerwerte gehen
	 * ausschliesslich als Bindings hinein. Zwei Abfragen: erst die Seite der
	 * Spiele, dann die Releases dieser Spiele. Kein Rechnen im Worker.
	 * Releases nur aus Wunsch (NUR_WUNSCH) bleiben in beiden aussen vor.
	 */
	async spieleListe(filter: SpieleFilter): Promise<{
		zeilen: SpielZeile[];
		releases: ReleaseZeile[];
		gesamt: number;
	}> {
		const bedingungen: string[] = [`NOT ${GamesRepository.NUR_WUNSCH}`];
		const werte: unknown[] = [];

		if (filter.platform) {
			bedingungen.push("r.platform = ?");
			werte.push(filter.platform);
		}
		const physisch = "EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id)";
		const digital = "EXISTS (SELECT 1 FROM digital_entitlement d WHERE d.release_id = r.id)";
		switch (filter.owned) {
			case "physisch": bedingungen.push(physisch); break;
			case "digital": bedingungen.push(digital); break;
			case "beide": bedingungen.push(physisch, digital); break;
			case "keins": bedingungen.push(`NOT ${physisch}`, `NOT ${digital}`); break;
		}
		if (filter.played === "ja") bedingungen.push("COALESCE(t.progress_pct, 0) > 0");
		if (filter.played === "nein") bedingungen.push("COALESCE(t.progress_pct, 0) = 0");
		switch (filter.platinum) {
			case "ja": bedingungen.push("t.defined_platinum > 0 AND t.earned_platinum > 0"); break;
			case "nein": bedingungen.push("t.defined_platinum > 0 AND t.earned_platinum = 0"); break;
			case "nichtverfuegbar": bedingungen.push("COALESCE(t.defined_platinum, 0) = 0"); break;
		}
		if (filter.physicalAvailable) {
			bedingungen.push("r.physical_release_status = ?");
			werte.push(filter.physicalAvailable);
		}
		if (filter.playStatus) {
			bedingungen.push("COALESCE(ps.status, 'nicht_gespielt') = ?");
			werte.push(filter.playStatus);
		}

		const releaseBedingung =
			bedingungen.length === 0 ? "" : " AND " + bedingungen.map((b) => `(${b})`).join(" AND ");
		const woher =
			"FROM game g WHERE EXISTS (SELECT 1 FROM release r " +
			"LEFT JOIN trophy_progress t ON t.release_id = r.id " +
			"LEFT JOIN play_status ps ON ps.release_id = r.id " +
			`WHERE r.game_id = g.id${releaseBedingung})`;

		const suche = (filter.search ?? "").trim().toLowerCase();
		const sucheBedingung = suche ? " AND instr(lower(g.title), ?) > 0" : "";
		if (suche) werte.push(suche);

		const zuletzt =
			"(SELECT MAX(t2.last_played_at) FROM trophy_progress t2 JOIN release r2 " +
			"ON r2.id = t2.release_id WHERE r2.game_id = g.id)";
		const sortierung =
			filter.sort === "zuletzt"
				? `${zuletzt} IS NULL, ${zuletzt} DESC, g.sort_title`
				: "g.sort_title";

		const [zaehlung, seite] = await this.db.batch([
			this.db.prepare(`SELECT COUNT(*) AS n ${woher}${sucheBedingung}`).bind(...werte),
			this.db
				.prepare(
					`SELECT g.id, g.title, g.sort_title, g.cover_url, g.critic_score,
					        (SELECT t3.icon_url FROM trophy_progress t3 JOIN release r3 ON r3.id = t3.release_id
					          WHERE r3.game_id = g.id AND t3.icon_url IS NOT NULL ORDER BY r3.platform DESC LIMIT 1) AS icon_url,
					        ${zuletzt} AS zuletzt_gespielt
					 ${woher}${sucheBedingung}
					 ORDER BY ${sortierung} LIMIT ? OFFSET ?`,
				)
				.bind(...werte, filter.limit, filter.offset),
		]);

		const zeilen = seite.results as SpielZeile[];
		const gesamt = (zaehlung.results[0] as { n: number } | undefined)?.n ?? 0;
		if (zeilen.length === 0) return { zeilen, releases: [], gesamt };

		const ids = zeilen.map((z) => z.id);
		const { results: releases } = await this.db
			.prepare(
				`SELECT r.id, r.game_id, r.platform, r.physical_release_status,
				        t.progress_pct, t.defined_platinum, t.earned_platinum, t.last_played_at,
				        ps.status AS play_status,
				        (SELECT COUNT(*) FROM physical_copy p WHERE p.release_id = r.id) AS exemplare,
				        (SELECT GROUP_CONCAT(d.source) FROM digital_entitlement d WHERE d.release_id = r.id) AS digital
				 FROM release r LEFT JOIN trophy_progress t ON t.release_id = r.id
				 LEFT JOIN play_status ps ON ps.release_id = r.id
				 WHERE r.game_id IN (${ids.map(() => "?").join(",")}) AND NOT ${GamesRepository.NUR_WUNSCH}
				 ORDER BY r.game_id, r.platform`,
			)
			.bind(...ids)
			.all<ReleaseZeile>();

		return { zeilen, releases, gesamt };
	}

	async spielDetail(id: number): Promise<SpielDetail | null> {
		const spiel = await this.db
			.prepare(
				"SELECT id, title, sort_title, cover_url, igdb_id, igdb_slug, igdb_matched_at, igdb_matched_source, " +
					"igdb_checked_at, igdb_declined_at, igdb_synced_at, release_date, release_status, " +
					"critic_score, critic_score_count, critic_source, critic_updated_at, created_at FROM game WHERE id = ?",
			)
			.bind(id)
			.first<SpielDetail["spiel"]>();
		if (!spiel) return null;

		const { results: releases } = await this.db
			.prepare(
				"SELECT r.id, r.platform, r.edition, r.region, r.physical_release_status, r.physical_source, " +
					"t.np_communication_id, t.title_name, t.icon_url, t.progress_pct, " +
					"t.defined_bronze, t.defined_silver, t.defined_gold, t.defined_platinum, " +
					"t.earned_bronze, t.earned_silver, t.earned_gold, t.earned_platinum, t.last_played_at " +
					"FROM release r LEFT JOIN trophy_progress t ON t.release_id = r.id " +
					"WHERE r.game_id = ? ORDER BY r.platform",
			)
			.bind(id)
			.all<SpielDetail["releases"][number]>();

		return { spiel, releases };
	}

	/**
	 * Spiel von Hand anlegen - ohne Trophaeenliste.
	 *
	 * Der Fall, den die Zuordnung nicht abdeckt: eine Disc im Regal, die nie
	 * gestartet wurde. Dublettenpruefung macht die Route ueber
	 * releasesNachSchluessel, damit sie dem Nutzer Kandidaten zeigen kann.
	 */
	async spielAnlegen(titel: string, plattform: Plattform): Promise<{ gameId: number; releaseId: number }> {
		const spiel = await this.db
			.prepare("INSERT INTO game (title, sort_title) VALUES (?, ?) RETURNING id")
			.bind(titel, titelSchluessel(titel))
			.first<{ id: number }>();
		if (!spiel) throw new Error("Spiel konnte nicht angelegt werden.");

		const release = await this.db
			.prepare("INSERT INTO release (game_id, platform) VALUES (?, ?) RETURNING id")
			.bind(spiel.id, plattform)
			.first<{ id: number }>();
		if (!release) throw new Error("Release konnte nicht angelegt werden.");

		return { gameId: spiel.id, releaseId: release.id };
	}

	/**
	 * Spiel aus einem IGDB-Treffer anlegen - ohne Release (Stufe 10).
	 *
	 * Ein Wunsch braucht weder Release noch Plattform (8.4); eine geratene
	 * Plattform waere eine Behauptung, die der Nutzer nie aufgestellt hat.
	 * Das Spiel erscheint deshalb nicht in der Sammlung (spieleListe verlangt
	 * ein Release), wohl aber im Spieldetail. Die IGDB-Metadaten schreibt der
	 * Aufrufer ueber IgdbRepository.verknuepfen.
	 */
	async spielOhneRelease(titel: string): Promise<number> {
		const spiel = await this.db
			.prepare("INSERT INTO game (title, sort_title) VALUES (?, ?) RETURNING id")
			.bind(titel, titelSchluessel(titel))
			.first<{ id: number }>();
		if (!spiel) throw new Error("Spiel konnte nicht angelegt werden.");
		return spiel.id;
	}

	/** Spiel mit dieser IGDB-Id, damit ein Wunsch ein vorhandenes Spiel wiederverwendet. */
	async spielNachIgdbId(igdbId: number): Promise<number | null> {
		const r = await this.db.prepare("SELECT id FROM game WHERE igdb_id = ?").bind(igdbId).first<{ id: number }>();
		return r?.id ?? null;
	}

	/** Releases eines Spiels, fuer die Release-Wahl beim Wunschlisten-Import (8.2). */
	async releasesVon(gameId: number): Promise<Array<{ id: number; platform: string }>> {
		const { results } = await this.db
			.prepare("SELECT id, platform FROM release WHERE game_id = ? ORDER BY id")
			.bind(gameId)
			.all<{ id: number; platform: string }>();
		return results;
	}

	async spielExistiert(id: number): Promise<boolean> {
		const r = await this.db.prepare("SELECT 1 AS x FROM game WHERE id = ?").bind(id).first();
		return r !== null;
	}

	/** Spiele mit gleichem Titelschluessel, fuer die Dublettenwarnung beim Anlegen. */
	async spieleNachSchluessel(
		schluessel: string,
	): Promise<Array<{ id: number; title: string; plattformen: string }>> {
		const { results } = await this.db
			.prepare(
				"SELECT g.id, g.title, " +
					"(SELECT GROUP_CONCAT(r.platform) FROM release r WHERE r.game_id = g.id) AS plattformen " +
					"FROM game g WHERE g.sort_title = ? ORDER BY g.id",
			)
			.bind(schluessel)
			.all<{ id: number; title: string; plattformen: string }>();
		return results;
	}

	/**
	 * Release zu einem bestehenden Spiel hinzufuegen.
	 *
	 * Die Belegung wird von Hand geprueft: UNIQUE (game_id, platform, edition,
	 * region) greift bei NULL in edition und region nicht, weil SQLite NULLs
	 * in UNIQUE-Constraints als verschieden behandelt.
	 */
	async releaseAnlegen(
		gameId: number,
		plattform: Plattform,
	): Promise<{ releaseId: number } | "spiel_fehlt" | "belegt"> {
		const spiel = await this.db.prepare("SELECT 1 AS x FROM game WHERE id = ?").bind(gameId).first();
		if (!spiel) return "spiel_fehlt";

		const belegt = await this.db
			.prepare(
				"SELECT 1 AS x FROM release WHERE game_id = ? AND platform = ? " +
					"AND edition IS NULL AND region IS NULL",
			)
			.bind(gameId, plattform)
			.first();
		if (belegt) return "belegt";

		const r = await this.db
			.prepare("INSERT INTO release (game_id, platform) VALUES (?, ?) RETURNING id")
			.bind(gameId, plattform)
			.first<{ id: number }>();
		if (!r) throw new Error("Release konnte nicht angelegt werden.");
		return { releaseId: r.id };
	}

	/**
	 * Release fuer eine Plattform - vorhanden oder neu (Stufe 10). Ein Wunsch
	 * mit gewaehlter Plattform haengt an einem Release; fehlt es, entsteht es
	 * hier, ohne Besitz und ohne Trophaeenliste (siehe NUR_WUNSCH).
	 */
	async releaseFuerPlattform(gameId: number, plattform: Plattform): Promise<number> {
		const vorhanden = await this.db
			.prepare(
				"SELECT id FROM release WHERE game_id = ? AND platform = ? " +
					"AND edition IS NULL AND region IS NULL ORDER BY id LIMIT 1",
			)
			.bind(gameId, plattform)
			.first<{ id: number }>();
		if (vorhanden) return vorhanden.id;
		const r = await this.db
			.prepare("INSERT INTO release (game_id, platform) VALUES (?, ?) RETURNING id")
			.bind(gameId, plattform)
			.first<{ id: number }>();
		if (!r) throw new Error("Release konnte nicht angelegt werden.");
		return r.id;
	}

	/**
	 * Release loeschen.
	 *
	 * Die Trophaeenliste bleibt erhalten und faellt per ON DELETE SET NULL in
	 * die Zuordnung zurueck. Herkunft der alten Zuordnung wird geloescht, sonst
	 * truege eine offene Liste eine matched_source. Exemplare kaskadieren.
	 * Ein Spiel ohne Releases wird mit entfernt, wie bei releaseAbtrennen -
	 * es sei denn, eine Absicht haengt daran (leeresSpielLoeschen).
	 */
	async releaseLoeschen(
		releaseId: number,
	): Promise<{ spielGeloescht: boolean; listeFreigegeben: boolean } | null> {
		const release = await this.db
			.prepare("SELECT game_id FROM release WHERE id = ?")
			.bind(releaseId)
			.first<{ game_id: number }>();
		if (!release) return null;

		const [freigabe] = await this.db.batch([
			this.db
				.prepare(
					"UPDATE trophy_progress SET release_id = NULL, matched_at = NULL, matched_source = NULL " +
						"WHERE release_id = ?",
				)
				.bind(releaseId),
			this.db.prepare("DELETE FROM release WHERE id = ?").bind(releaseId),
		]);

		const leer = await this.leeresSpielLoeschen(release.game_id);
		return { spielGeloescht: leer, listeFreigegeben: (freigabe.meta.changes ?? 0) > 0 };
	}

	/** Spiel samt Releases loeschen; Trophaeenlisten fallen in die Zuordnung zurueck. */
	async spielLoeschen(id: number): Promise<{ listenFreigegeben: number } | null> {
		const spiel = await this.db.prepare("SELECT 1 AS x FROM game WHERE id = ?").bind(id).first();
		if (!spiel) return null;

		const [freigabe] = await this.db.batch([
			this.db
				.prepare(
					"UPDATE trophy_progress SET release_id = NULL, matched_at = NULL, matched_source = NULL " +
						"WHERE release_id IN (SELECT id FROM release WHERE game_id = ?)",
				)
				.bind(id),
			this.db.prepare("DELETE FROM game WHERE id = ?").bind(id),
		]);
		return { listenFreigegeben: freigabe.meta.changes ?? 0 };
	}
}
