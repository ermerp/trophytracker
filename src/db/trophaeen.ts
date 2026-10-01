import type { GruppeZeile, TrophaeeZeile } from "../domain/trophaee";

/** Eine Liste, die der Fuellschritt als Naechstes holen soll. */
export type ZuFuellen = { npCommunicationId: string; npServiceName: string };

/** Eine Trophaee, wie die Anzeige sie liest. */
export type TrophaeeAnzeige = {
	trophy_id: number;
	grade: string;
	name: string;
	detail: string | null;
	icon_url: string | null;
	hidden: number;
	group_id: string;
	earned: number;
	earned_at: string | null;
	earned_rate: number | null;
	progress_target: number | null;
	progress_value: number | null;
};

/**
 * Die Summe aller acht Zaehler einer Liste. Dieselbe Formel im Stempel und in
 * der Auswahl - sie steht deshalb genau einmal hier.
 */
const ZAEHLERSUMME =
	"(earned_bronze + earned_silver + earned_gold + earned_platinum + " +
	"defined_bronze + defined_silver + defined_gold + defined_platinum)";

/**
 * Hoechstens sechs Trophaeen je INSERT: D1 erlaubt 100 gebundene Werte je
 * Statement, und eine Trophaee braucht fuenfzehn (Abschnitt 2). Sechs sind
 * 90 - die groesste Liste der Sammlung (128 Trophaeen) wird damit zu 22
 * Statements in einem Batch.
 */
const JE_INSERT = 6;

/** Eine Zeile des Dashboard-Feeds aus erspielten Trophäen (8.5). */
export type FeedTrophaeen = {
	spielId: number | null;
	titel: string | null;
	plattform: string;
	zeitpunkt: string;
	anzahl: number;
	gold: number;
	silber: number;
	bronze: number;
	/** Gesetzt, wenn die Zeile ein einzelnes Platin ist. */
	platin: string | null;
};

/** Trophäen je Jahr, für das Dashboard. */
export type JahrZeile = { jahr: string; anzahl: number };

/**
 * Das Fenster des Feeds. Als Text im Statement, nicht als Bind - ein
 * Datums-Modifier gehört nicht an einen gebundenen Wert (Abschnitt 2).
 */
const FEED_FENSTER = "-30 days";

/** Dieselben drei JOINs für jede Feed-Abfrage. */
const FEED_HERKUNFT =
	"FROM trophy t " +
	"JOIN trophy_progress tp ON tp.np_communication_id = t.np_communication_id " +
	"JOIN release r ON r.id = tp.release_id " +
	"LEFT JOIN game g ON g.id = r.game_id ";

/**
 * Einzeltrophaeen (Stufe 19b, Abschnitt 7.7).
 *
 * Schreibt immer die ganze Liste auf einmal: erst loeschen, dann einfuegen,
 * dann stempeln - in EINEM Batch. Damit gibt es keinen Zwischenstand, in dem
 * eine Liste halb gefuellt waere, und der Stempel kommt nie ohne die Zeilen,
 * zu denen er gehoert.
 *
 * Kein `game_event` (Entscheidung des Nutzers vom 01.10.2026): Eine erspielte
 * Trophaee ist kein Schreibvorgang eines Nutzers, und 11 168 Zeilen Fremddaten
 * im Protokoll widersprechen "der Sync protokolliert nur Erkanntes" (8.5). Der
 * Dashboard-Feed liest sie stattdessen direkt aus dieser Tabelle.
 */
export class TrophaeenRepository {
	constructor(private readonly db: D1Database) {}

	/**
	 * Die naechsten Listen, die geholt werden muessen.
	 *
	 * Zwei Faelle, und beide stehen in derselben Zeile - es braucht keine
	 * zweite Abfrage und keine Absprache mit der Aenderungserkennung:
	 *
	 *   1. `trophies_synced_at IS NULL` - noch nie geholt (Erstbefuellung).
	 *   2. Die Zaehlersumme weicht vom Stempel ab - seit dem letzten Holen ist
	 *      eine Trophaee dazugekommen oder erspielt worden (7.7, "danach nur
	 *      bei Aenderung").
	 *
	 * Sortiert nach Id, damit die Reihenfolge ueber Aufrufe hinweg stabil ist
	 * und ein Abbruch genau dort weitermacht, wo er aufgehoert hat.
	 */
	async naechsteZumFuellen(limit: number): Promise<ZuFuellen[]> {
		const { results } = await this.db
			.prepare(
				"SELECT np_communication_id, np_service_name FROM trophy_progress " +
					`WHERE trophies_synced_at IS NULL OR trophies_synced_sum <> ${ZAEHLERSUMME} ` +
					"ORDER BY np_communication_id LIMIT ?",
			)
			.bind(limit)
			.all<{ np_communication_id: string; np_service_name: string }>();
		return results.map((r) => ({
			npCommunicationId: r.np_communication_id,
			npServiceName: r.np_service_name,
		}));
	}

	/**
	 * Nur die Zahl der offenen Listen - ohne `COUNT(*) FROM trophy`.
	 *
	 * **Die teure Zeile aus `fuellstand` gehoert nicht in jeden Seitenaufruf.**
	 * Der Feed fragt bei jedem Oeffnen des Dashboards, ob die Erstbefuellung
	 * durch ist; mit `fuellstand` las er dafuer die ganze Trophaeentabelle mit,
	 * 18 355 Zeilen je Aufruf. Am 01.10.2026 standen deshalb 4,16 von 5 Mio.
	 * gelesenen Zeilen auf der Uhr (Hinweis des Nutzers). Diese Abfrage liest
	 * `trophy_progress`, also 431 Zeilen.
	 *
	 * Die Lehre ist dieselbe wie am 28.09.2026: Gemessen war die ABFRAGE des
	 * Feeds (183 Zeilen), nicht die ROUTE - und die Route machte noch eine
	 * zweite.
	 */
	async offeneListen(): Promise<{ offen: number; gesamt: number }> {
		const zeile = await this.db
			.prepare(
				"SELECT COUNT(*) AS gesamt, " +
					`SUM(trophies_synced_at IS NULL OR trophies_synced_sum <> ${ZAEHLERSUMME}) AS offen ` +
					"FROM trophy_progress",
			)
			.first<{ gesamt: number; offen: number | null }>();
		return { offen: zeile?.offen ?? 0, gesamt: zeile?.gesamt ?? 0 };
	}

	/**
	 * Wie viele Listen noch offen sind, wie viele es gibt, und wie viele
	 * Trophaeen schon gespeichert sind. `gespeichert` heisst bewusst nicht
	 * `trophaeen`: Im Ergebnis einer Portion steht unter diesem Namen die
	 * Zahl der gerade GESCHRIEBENEN, und zwei verschiedene Zahlen unter einem
	 * Namen sind ein Fehler, der in der Oberflaeche landet.
	 *
	 * **Nur fuer die Einstellungen und den Portionsknopf**, nicht fuer Seiten,
	 * die oft geoeffnet werden: `COUNT(*) FROM trophy` liest den ganzen
	 * Bestand. Wer nur wissen will, ob noch etwas offen ist, nimmt
	 * `offeneListen`.
	 */
	async fuellstand(): Promise<{ offen: number; gesamt: number; gespeichert: number }> {
		const zeile = await this.db
			.prepare(
				"SELECT COUNT(*) AS gesamt, " +
					`SUM(trophies_synced_at IS NULL OR trophies_synced_sum <> ${ZAEHLERSUMME}) AS offen ` +
					"FROM trophy_progress",
			)
			.first<{ gesamt: number; offen: number | null }>();
		const anzahl = await this.db.prepare("SELECT COUNT(*) AS n FROM trophy").first<{ n: number }>();
		return { offen: zeile?.offen ?? 0, gesamt: zeile?.gesamt ?? 0, gespeichert: anzahl?.n ?? 0 };
	}

	/**
	 * Eine Liste vollstaendig schreiben. `zeilen` leer ist erlaubt und heisst
	 * "PSN kennt diese Liste nicht mehr" - dann wird trotzdem gestempelt,
	 * sonst waehlt der naechste Aufruf dieselbe Liste wieder (Migration 0027).
	 */
	async schreibeListe(
		npCommunicationId: string,
		zeilen: TrophaeeZeile[],
		gruppen: GruppeZeile[],
	): Promise<number> {
		const statements: D1PreparedStatement[] = [
			this.db.prepare("DELETE FROM trophy WHERE np_communication_id = ?").bind(npCommunicationId),
			this.db.prepare("DELETE FROM trophy_group WHERE np_communication_id = ?").bind(npCommunicationId),
		];

		for (let i = 0; i < zeilen.length; i += JE_INSERT) {
			const teil = zeilen.slice(i, i + JE_INSERT);
			const werte = teil.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(", ");
			statements.push(
				this.db
					.prepare(
						"INSERT INTO trophy (np_communication_id, trophy_id, grade, name, detail, icon_url, " +
							"hidden, group_id, earned, earned_at, earned_rate, progress_target, progress_value, " +
							`progress_rate, progressed_at) VALUES ${werte}`,
					)
					.bind(
						...teil.flatMap((z) => [
							npCommunicationId,
							z.trophyId,
							z.grade,
							z.name,
							z.detail,
							z.iconUrl,
							z.hidden,
							z.groupId,
							z.earned,
							z.earnedAt,
							z.earnedRate,
							z.progressTarget,
							z.progressValue,
							z.progressRate,
							z.progressedAt,
						]),
					),
			);
		}

		// Neun Werte je Gruppe, hoechstens elf Gruppen je Statement.
		for (let i = 0; i < gruppen.length; i += 11) {
			const teil = gruppen.slice(i, i + 11);
			const werte = teil.map(() => "(?,?,?,?,?,?,?,?,?)").join(", ");
			statements.push(
				this.db
					.prepare(
						"INSERT INTO trophy_group (np_communication_id, group_id, name, detail, icon_url, " +
							`defined_bronze, defined_silver, defined_gold, defined_platinum) VALUES ${werte}`,
					)
					.bind(
						...teil.flatMap((g) => [
							npCommunicationId,
							g.groupId,
							g.name,
							g.detail,
							g.iconUrl,
							g.bronze,
							g.silber,
							g.gold,
							g.platin,
						]),
					),
			);
		}

		// Der Stempel zuletzt, im selben Batch: Er kommt nie ohne die Zeilen.
		statements.push(
			this.db
				.prepare(
					"UPDATE trophy_progress SET trophies_synced_at = datetime('now'), " +
						`trophies_synced_sum = ${ZAEHLERSUMME} WHERE np_communication_id = ?`,
				)
				.bind(npCommunicationId),
		);

		await this.db.batch(statements);
		return zeilen.length;
	}

	/**
	 * Die Trophaeen EINES RELEASE.
	 *
	 * Nicht je Spiel: Die Trophaeenliste haengt bei Sony am Titel, und ein
	 * Spiel mit PS4- und PS5-Fassung hat zwei davon mit eigenem Fortschritt.
	 * Sie zusammenzuwerfen ergaebe einen Zaehler, den es nirgends gibt.
	 *
	 * Der Primaerschluessel beginnt mit `np_communication_id`, die Auswahl ist
	 * damit ein Bereich je Liste statt eines Scans ueber alle 18 355 Zeilen
	 * (Migration 0027). Sortiert wie Sony sie liefert - die Reihenfolge ist
	 * seine Entscheidung und wird uebernommen (13).
	 */
	async fuerRelease(releaseId: number): Promise<TrophaeeAnzeige[]> {
		const { results } = await this.db
			.prepare(
				"SELECT t.trophy_id, t.grade, t.name, t.detail, t.icon_url, t.hidden, t.group_id, " +
					"t.earned, t.earned_at, t.earned_rate, t.progress_target, t.progress_value " +
					"FROM trophy t " +
					"JOIN trophy_progress tp ON tp.np_communication_id = t.np_communication_id " +
					"WHERE tp.release_id = ? ORDER BY t.np_communication_id, t.trophy_id",
			)
			.bind(releaseId)
			.all<TrophaeeAnzeige>();
		return results;
	}

	/**
	 * Die Zeilen des Dashboard-Feeds aus erspielten Trophaeen (8.5).
	 *
	 * Zwei Abfragen in einem Batch, weil Platin eine eigene Zeile bekommt und
	 * in der Sammelzeile desselben Tages NICHT mitzaehlt: Ein Platin ist der
	 * Abschluss, keine Position in einer Liste (Entscheidung des Nutzers vom
	 * 01.10.2026).
	 *
	 * **Das Fenster zaehlt das Erspielt-Datum, nicht den Abrufzeitpunkt.**
	 * Sonst stuenden beim ersten Fuellen 11 168 Trophaeen aus fuenfzehn Jahren
	 * als "neu" im Feed. Der zweite Schutz liegt beim Aufrufer: Solange die
	 * Erstbefuellung laeuft, fragt er gar nicht erst - sie geht Liste fuer
	 * Liste statt nach Datum, und der Feed wuechse sonst nach hinten.
	 *
	 * Der Zeitpunkt einer Sammelzeile ist das SPAETESTE earned_at ihres Tages,
	 * damit sie sich richtig zwischen die Ereignisse sortiert.
	 */
	async feed(limit: number): Promise<FeedTrophaeen[]> {
		const [sammel, platin] = await this.db.batch<FeedTrophaeen>([
			this.db
				.prepare(
					"SELECT r.game_id AS spielId, g.title AS titel, r.platform AS plattform, " +
						"MAX(t.earned_at) AS zeitpunkt, COUNT(*) AS anzahl, " +
						"SUM(t.grade = 'gold') AS gold, SUM(t.grade = 'silber') AS silber, " +
						"SUM(t.grade = 'bronze') AS bronze, NULL AS platin " +
						FEED_HERKUNFT +
						"WHERE t.earned = 1 AND t.grade <> 'platin' " +
						`AND t.earned_at >= datetime('now', '${FEED_FENSTER}') ` +
						"GROUP BY r.game_id, date(t.earned_at) ORDER BY zeitpunkt DESC LIMIT ?",
				)
				.bind(limit),
			this.db
				.prepare(
					"SELECT r.game_id AS spielId, g.title AS titel, r.platform AS plattform, " +
						"t.earned_at AS zeitpunkt, 1 AS anzahl, 0 AS gold, 0 AS silber, 0 AS bronze, " +
						"t.name AS platin " +
						FEED_HERKUNFT +
						"WHERE t.earned = 1 AND t.grade = 'platin' " +
						`AND t.earned_at >= datetime('now', '${FEED_FENSTER}') ` +
						"ORDER BY t.earned_at DESC LIMIT ?",
				)
				.bind(limit),
		]);
		return [...(sammel.results ?? []), ...(platin.results ?? [])];
	}

	/**
	 * Trophaeen je Jahr aus dem Erspiel-Datum (Dashboard, Stufe 19b).
	 *
	 * **Liest den ganzen Bestand - 18 060 Zeilen bei 430 Listen**, und ein
	 * Indexhinweis aendert daran nichts (beides gemessen am 01.10.2026). Diese
	 * Abfrage laeuft deshalb NICHT bei jedem Aufruf des Dashboards, sondern
	 * einmal je Nacht im Wartungsfenster; das Ergebnis liegt in `app_setting`.
	 */
	async jahre(): Promise<JahrZeile[]> {
		const { results } = await this.db
			.prepare(
				"SELECT strftime('%Y', earned_at) AS jahr, COUNT(*) AS anzahl FROM trophy " +
					"WHERE earned = 1 AND earned_at IS NOT NULL GROUP BY jahr ORDER BY jahr",
			)
			.all<JahrZeile>();
		return results;
	}

	/**
	 * Die Trophaeen EINES Jahres - die einzige Zahl, die sich noch aendern
	 * kann (Vorschlag des Nutzers vom 01.10.2026).
	 *
	 * Vergangene Jahre sind abgeschlossene Tatsachen und stehen im Zwischen-
	 * speicher; das laufende Jahr wird live gezaehlt. Ueber den Teilindex ist
	 * das ein Bereich ab dem 1. Januar statt eines Laufs ueber den Bestand.
	 */
	async jahrAnzahl(jahr: number): Promise<number> {
		const zeile = await this.db
			.prepare(
				"SELECT COUNT(*) AS n FROM trophy WHERE earned = 1 " +
					"AND earned_at >= ? AND earned_at < ?",
			)
			.bind(`${jahr}-01-01`, `${jahr + 1}-01-01`)
			.first<{ n: number }>();
		return zeile?.n ?? 0;
	}

	/** Die Gruppen eines Release; leer, wo es keine DLC gibt. */
	async gruppenFuerRelease(releaseId: number): Promise<{ group_id: string; name: string }[]> {
		const { results } = await this.db
			.prepare(
				"SELECT g.group_id, g.name FROM trophy_group g " +
					"JOIN trophy_progress tp ON tp.np_communication_id = g.np_communication_id " +
					// Das Hauptspiel zuerst: Sony nennt es "default", und alphabetisch
					// stuende "001" davor. Danach die DLC in ihrer eigenen Reihenfolge.
					"WHERE tp.release_id = ? ORDER BY g.np_communication_id, (g.group_id <> 'default'), g.group_id",
			)
			.bind(releaseId)
			.all<{ group_id: string; name: string }>();
		return results;
	}
}
