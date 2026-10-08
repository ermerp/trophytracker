import { OHNE_WEBSTORE, type StoreBefund, type StoreErgebnis } from "../domain/store";
import type { Plattform } from "../domain/titel";
import type { EventRepository } from "./events";

/**
 * PSN Store-Preise (Abschnitt 7.4, Stufe 21).
 *
 * Der Gegenpart zu `MarktRepository`: dort der Gebrauchtpreis einer Disc,
 * hier der Neupreis der digitalen Fassung. Die beiden Kanaele duerfen nie zu
 * einem Wert verrechnet werden (Abschnitt 6) - deshalb steht der Store-Preis
 * in eigenen Spalten an `release` und nicht als Zeile in `market_offer`.
 *
 * Alles zu einem Release geht in EINEN Batch: Preis, Verlauf, die
 * Protokollzeile zur Produkt-Id und der Pruefstempel. Entweder kommt es
 * zusammen an oder zusammen nicht.
 */

/**
 * Nach so vielen Tagen wird ein Release erneut gefragt. Als Text im
 * Statement, nie als Bind.
 *
 * Taeglich, wie der Gebrauchtpreis seit 20e - und hier mit mehr Grund:
 * Store-Angebote laufen ab. Gemessen am 02.10.2026 standen 18 von 57 Titeln
 * gerade im Angebot, und ein Rabatt, den man zwei Tage spaeter erfaehrt, ist
 * keiner.
 */
export const STORE_FRIST_TAGE = 1;

/**
 * Nach so vielen Tagen wird IGDB erneut nach einer Concept-Id gefragt.
 *
 * Dreissig, nicht taeglich: Zu 13 der 79 Spiele kennt IGDB keinen
 * Store-Eintrag, und die jede Nacht erneut zu fragen waere eine Anfrage fuer
 * eine Antwort, die sich selten aendert. Ganz ruhen darf die Frage auch
 * nicht - IGDB waechst.
 */
export const CONCEPT_FRIST_TAGE = 30;

export type ZuPruefen = {
	releaseId: number;
	gameId: number;
	/** Fuer die IGDB-Anfrage: sie kennt Spiele nur unter ihrer eigenen Id. */
	igdbId: number | null;
	titel: string;
	plattform: Plattform;
	conceptId: string | null;
	conceptAm: string | null;
	produktId: string | null;
};

export class StoreRepository {
	constructor(
		private readonly db: D1Database,
		private readonly events: EventRepository,
	) {}

	/**
	 * Welche Releases gefragt werden - und ausdruecklich nicht alle.
	 *
	 * Der Zuschnitt aus 7.4, geschaerft durch eine Entscheidung des Nutzers
	 * vom 02.10.2026: offene Absichten und "nur digital"-Titel, **ohne** die
	 * Releases, zu denen eine digitale Berechtigung mit `source = 'kauf'`
	 * steht. Die besitzt er dauerhaft - der Neupreis hilft dort so wenig wie
	 * bei einer Luecke, wo der Titel ohnehin schon gespielt ist. `plus`
	 * schliesst dagegen nicht aus: Ein Katalogtitel ist geliehen, nicht
	 * gekauft, und kann morgen aus dem Katalog fallen.
	 *
	 * Ausgeschrieben und NICHT ueber `v_luecken` - dieselbe Messung wie bei
	 * `MarktRepository.zuPruefen` (0028): Die View rechnet fuer alle Zeilen
	 * die Preis-Unterabfragen aus, nur um Ids zu liefern.
	 *
	 * **Die Menge kommt als `UNION` zweier Index-Lookups, nicht als `OR`**
	 * (Nachtrag 21b, Migration 0032). Die erste Fassung schrieb
	 * `EXISTS(plan_entry …) OR physical_release_status = 'nein'` - und weil
	 * die zweite Haelfte keinen Index hatte, musste SQLite jede der 430
	 * Zeilen anfassen, auch wenn keine faellig war. Im Leerlauf las der
	 * Schritt damit 430 Zeilen, 36-mal je Nacht; die Nacht stieg von rund
	 * 54 000 auf 69 444. Das ist dieselbe Regel wie in Stufe 15 (kein `OR`
	 * ueber zwei Spalten) und wie beim Feed am 01.10.2026: Die Frage "ist
	 * etwas offen?" beantwortet die kleine Menge, nicht die grosse.
	 *
	 * Jetzt bildet eine CTE die Zielmenge - `plan_entry` liefert seine
	 * offenen Eintraege, der Teilindex `idx_release_nur_digital` die rein
	 * digitalen Releases -, und der Rest sind Lookups ueber den
	 * Primaerschluessel.
	 *
	 * Gemessen gegen 430 Releases mit 90 offenen Absichten:
	 *
	 * | Fassung | mit Arbeit | im Leerlauf | je Nacht |
	 * |---|---|---|---|
	 * | `OR` (erste) | 90 | 430 | 12 760 |
	 * | `IN` + `UNION` | 431 | 4 | 3 560 |
	 * | CTE (diese) | **341** | **4** | **2 840** |
	 *
	 * Die erste Fassung war mit Arbeit die billigste und im Leerlauf die
	 * teuerste - und der Leerlauf ueberwiegt: Der Schritt arbeitet an rund
	 * acht der 36 Aufrufe einer Nacht, in den uebrigen 28 stellt er nur fest,
	 * dass nichts zu tun ist.
	 */
	async zuPruefen(limit: number): Promise<ZuPruefen[]> {
		const { results } = await this.db
			.prepare(
				"WITH ziele(id) AS (SELECT pe.release_id FROM plan_entry pe WHERE pe.status = 'offen' AND pe.release_id IS NOT NULL " +
					"UNION SELECT id FROM release WHERE physical_release_status = 'nein') " +
					"SELECT r.id AS releaseId, r.game_id AS gameId, g.igdb_id AS igdbId, g.title AS titel, r.platform AS plattform, " +
					"g.store_concept_id AS conceptId, g.store_concept_am AS conceptAm, r.psn_product_id AS produktId " +
					"FROM ziele z JOIN release r ON r.id = z.id JOIN game g ON g.id = r.game_id " +
					`WHERE (r.store_geprueft_am IS NULL OR r.store_geprueft_am < datetime('now', '-${STORE_FRIST_TAGE} days')) ` +
					"AND NOT EXISTS (SELECT 1 FROM digital_entitlement d WHERE d.release_id = r.id AND d.source = 'kauf') " +
					"ORDER BY r.store_geprueft_am, r.id LIMIT ?",
			)
			.bind(limit)
			.all<ZuPruefen>();
		return results ?? [];
	}

	/** Welche Spiele der Portion noch keine Concept-Id haben oder eine alte Frage. */
	nochOhneConcept(ziele: readonly ZuPruefen[], heute: number = Date.now()): ZuPruefen[] {
		const grenze = heute - CONCEPT_FRIST_TAGE * 86_400_000;
		return ziele.filter((z) => {
			if (z.conceptId !== null) return false;
			if (z.conceptAm === null) return true;
			const gefragt = Date.parse(`${z.conceptAm.replace(" ", "T")}Z`);
			return Number.isNaN(gefragt) || gefragt < grenze;
		});
	}

	/**
	 * Die Antwort von IGDB festschreiben - auch die leere.
	 *
	 * Ein Spiel ohne Store-Eintrag bekommt `store_concept_am` ohne
	 * `store_concept_id`: Der Stempel ist die Antwort "gefragt, nichts da".
	 * Ohne ihn fragte der Schritt dieselben dreizehn Spiele jede Nacht
	 * erneut - derselbe Fehler, den Stufe 18d beim IGDB-Auffrischen behoben
	 * hat.
	 *
	 * Kein Ereignis: Die Concept-Id ist IGDB-Metadatum wie `cover_url` und
	 * wird wie dieses nicht protokolliert. Protokolliert wird, was daraus
	 * entsteht - die Produkt-Id am Release.
	 */
	async conceptSetzen(
		treffer: ReadonlyMap<number, string>,
		gefragt: readonly { gameId: number; igdbId: number | null }[],
	): Promise<number> {
		if (gefragt.length === 0) return 0;
		const einmal = new Map(gefragt.map((g) => [g.gameId, g.igdbId]));
		const anweisungen = [...einmal].map(([gameId, igdbId]) =>
			this.db
				.prepare("UPDATE game SET store_concept_id = ?, store_concept_am = datetime('now') WHERE id = ?")
				.bind(igdbId === null ? null : treffer.get(igdbId) ?? null, gameId),
		);
		await this.db.batch(anweisungen);
		return [...einmal.values()].filter((id) => id !== null && treffer.has(id)).length;
	}

	/**
	 * EIN Release, ohne Frist und ohne Zuschnitt (Nachtrag 21d).
	 *
	 * Der Weg fuer "jetzt sofort": Wer von Hand eine Adresse eintraegt, will
	 * den Preis sehen und nicht bis morgen warten - und ohne das waere die
	 * Nachpflegeliste unbrauchbar. Dieselbe Luecke war am 03.10.2026 schon
	 * einmal spuerbar, als sich der falsche Outcast-Preis nach der Korrektur
	 * nicht erneuern liess.
	 */
	async eines(releaseId: number): Promise<ZuPruefen | null> {
		return this.db
			.prepare(
				"SELECT r.id AS releaseId, r.game_id AS gameId, g.igdb_id AS igdbId, g.title AS titel, r.platform AS plattform, " +
					"g.store_concept_id AS conceptId, g.store_concept_am AS conceptAm, r.psn_product_id AS produktId " +
					"FROM release r JOIN game g ON g.id = r.game_id WHERE r.id = ?",
			)
			.bind(releaseId)
			.first<ZuPruefen>();
	}

	/**
	 * Eine von Hand eingetragene Concept-Id (Nachtrag 21d).
	 *
	 * Sie haengt am Spiel, nicht am Release - damit loest der normale Weg
	 * beide Fassungen eines Cross-Gen-Titels auf einmal auf. Der Stempel geht
	 * mit, sonst ueberschriebe die naechste IGDB-Runde den Handeintrag mit
	 * ihrem `null`.
	 *
	 * Kein Ereignis: Die Concept-Id ist ein Nachschlagewert wie `cover_url`,
	 * und was daraus entsteht - die Produkt-Id am Release - wird protokolliert.
	 */
	async conceptVonHand(gameId: number, conceptId: string): Promise<void> {
		await this.db
			.prepare("UPDATE game SET store_concept_id = ?, store_concept_am = datetime('now') WHERE id = ?")
			.bind(conceptId, gameId)
			.run();
	}

	/**
	 * Die Eintraege, bei denen Nachpflege ueberhaupt etwas bringt.
	 *
	 * Nur `ohne_id`: Dort fehlt die Zuordnung, und genau die laesst sich mit
	 * einer eingefuegten Adresse nachtragen. `delistet` und `plattform` sind
	 * Auskuenfte ueber das Spiel - da gibt es nichts einzufuegen -, und bei
	 * `fremd` fuehrt der Store fuer diese Plattform wirklich nichts. Eine
	 * Arbeitsliste mit unerledigbaren Posten wird nach zwei Wochen ignoriert;
	 * das war die Lehre aus den offenen Scans (Stufe 17d).
	 *
	 * **PS3 und Vita bleiben auch dann draussen, wenn an ihnen noch ein altes
	 * `ohne_id` steht.** Der Befund stammt dann aus einem Lauf vor 21d und
	 * wird beim naechsten korrigiert - bis dahin stuenden vier unloesbare
	 * Posten in der Liste. Die Plattform entscheidet, nicht der Stempel.
	 */
	async ohneZuordnung(): Promise<Array<{ releaseId: number; gameId: number; titel: string; plattform: Plattform }>> {
		const { results } = await this.db
			.prepare(
				"SELECT r.id AS releaseId, r.game_id AS gameId, g.title AS titel, r.platform AS plattform " +
					"FROM release r JOIN game g ON g.id = r.game_id " +
					`WHERE r.store_befund = 'ohne_id' AND r.platform NOT IN (${OHNE_WEBSTORE.map((p) => `'${p}'`).join(", ")}) ` +
					"ORDER BY g.title, r.platform",
			)
			.all<{ releaseId: number; gameId: number; titel: string; plattform: Plattform }>();
		return results ?? [];
	}

	/**
	 * Ein gefundener Preis. EIN Batch: Protokoll, Preis, Verlauf, Stempel.
	 *
	 * Die Protokollzeile steht VOR dem UPDATE und traegt dieselbe Bedingung
	 * (8.5) - so steht der alte Wert noch, und bei gleicher Produkt-Id
	 * entsteht gar kein Ereignis. Protokolliert wird nur die **Zuordnung**
	 * (die Produkt-Id), nie der Preis: Preise haben mit `price_snapshot`
	 * ihre eigene Historie, und ein Ereignis je Preisaenderung waere eine
	 * Flut - dieselbe Entscheidung wie bei den Trophaeen in 19b und den
	 * Gebrauchtpreisen in 20.
	 */
	async preisSchreiben(ziel: ZuPruefen, ergebnis: StoreErgebnis): Promise<{ neuZugeordnet: boolean }> {
		const anweisungen: D1PreparedStatement[] = [
			this.events.insertSelect(
				"SELECT 'sync', r.game_id, r.id, g.title || ' (' || r.platform || ')', 'release_geaendert', " +
					"'psn_product_id', r.psn_product_id, ?, 'store' " +
					"FROM release r JOIN game g ON g.id = r.game_id " +
					"WHERE r.id = ? AND (r.psn_product_id IS NULL OR r.psn_product_id <> ?)",
				ergebnis.produktId,
				ziel.releaseId,
				ergebnis.produktId,
			),
			this.db
				.prepare(
					"UPDATE release SET psn_product_id = ?, store_produkt_name = ?, store_price_cents = ?, " +
						"store_base_price_cents = ?, store_is_sale = ?, store_plus = ?, store_befund = 'preis', " +
						"store_geprueft_am = datetime('now') WHERE id = ?",
				)
				.bind(
					ergebnis.produktId,
					ergebnis.produktName,
					ergebnis.preisCents,
					ergebnis.grundpreisCents,
					ergebnis.istSale ? 1 : 0,
					ergebnis.imPlusKatalog ? 1 : 0,
					ziel.releaseId,
				),
			this.verlaufSchreiben(ziel.releaseId, ergebnis),
		];
		const ergebnisse = await this.db.batch(anweisungen);
		// Nur aus dem Protokoll-Statement, nie als Summe ueber den Batch -
		// sonst zaehlen Preis und Verlauf mit (der Fehler aus Stufe 16).
		return { neuZugeordnet: (ergebnisse[0]?.meta.changes ?? 0) > 0 };
	}

	/**
	 * Kein Preis - und warum.
	 *
	 * `imPlusKatalog` ueberlebt dabei: Ein Titel ohne Kaufknopf kann trotzdem
	 * im Katalog liegen, und das ist fuer die Kaufentscheidung die wichtigere
	 * Auskunft als "kein Preis" (Nachtrag 21e).
	 *
	 * `unlesbar` stempelt NICHT: Eine Seite, die gerade nicht antwortete, ist
	 * keine Aussage ueber das Spiel, und der naechste Aufruf nimmt das
	 * Release wieder. Jeder andere Befund stempelt und raeumt den alten Preis
	 * weg - ein Titel, den der Store nicht mehr fuehrt, hat keinen Preis
	 * mehr, und der letzte waere eine Luege (Abschnitt 3). `psn_product_id`
	 * bleibt dabei stehen: Sie ist eine Zuordnung und wird von keinem
	 * automatischen Prozess zurueckgenommen.
	 */
	async befundSchreiben(releaseId: number, befund: StoreBefund, imPlusKatalog = false): Promise<void> {
		if (befund === "unlesbar") return;
		await this.db
			.prepare(
				"UPDATE release SET store_price_cents = NULL, store_base_price_cents = NULL, store_is_sale = 0, " +
					"store_plus = ?, store_befund = ?, store_geprueft_am = datetime('now') WHERE id = ?",
			)
			.bind(imPlusKatalog ? 1 : 0, befund, releaseId)
			.run();
	}

	/**
	 * Preisverlauf, nur bei Aenderung (Abschnitt 6): Der INSERT laeuft ins
	 * Leere, wenn der juengste Eintrag denselben Preis nennt. Set-basiert,
	 * weil ein Lesen davor eine zweite Abfrage je Release waere.
	 *
	 * `kanal` bleibt NULL - er trennt die beiden Reihen INNERHALB des
	 * Gebrauchtkanals (haendler/markt, 0030). Der Store hat nur eine Reihe,
	 * und `channel = 'psn_store'` trennt sie schon vom Gebrauchtpreis. Das
	 * Diagramm aus 20f filtert erst nach `channel`, dann nach `kanal`.
	 */
	private verlaufSchreiben(releaseId: number, ergebnis: StoreErgebnis): D1PreparedStatement {
		return this.db
			.prepare(
				"INSERT INTO price_snapshot (release_id, channel, source, price_cents, is_sale, currency, captured_at) " +
					"SELECT ?, 'psn_store', 'psn', ?, ?, ?, datetime('now') " +
					"WHERE NOT EXISTS (SELECT 1 FROM price_snapshot p WHERE p.release_id = ? AND p.channel = 'psn_store' " +
					"AND p.price_cents = ? AND p.captured_at = " +
					"(SELECT MAX(q.captured_at) FROM price_snapshot q WHERE q.release_id = ? AND q.channel = 'psn_store'))",
			)
			.bind(
				releaseId,
				ergebnis.preisCents,
				ergebnis.istSale ? 1 : 0,
				ergebnis.waehrung,
				releaseId,
				ergebnis.preisCents,
				releaseId,
			);
	}

	/**
	 * Wie viele Releases des Zuschnitts noch nie gefragt wurden - EINE
	 * Abfrage ueber idx_release_store, nicht die vier Zaehler von `stand()`
	 * (der Lesekosten-Fehler aus Stufe 20).
	 */
	async offeneAnzahl(): Promise<number> {
		const z = await this.db
			.prepare("SELECT COUNT(*) AS n FROM release WHERE store_geprueft_am IS NULL AND psn_product_id IS NOT NULL")
			.first<{ n: number }>();
		return z?.n ?? 0;
	}

	/** Zaehler fuer die Einstellungen. Zaehlt RELEASES, nicht Verlaufszeilen (der Fehler aus 20c). */
	async stand(): Promise<{
		mitPreis: number;
		imAngebot: number;
		imPlusKatalog: number;
		geprueft: number;
		ohneId: number;
		ohneWebstore: number;
	}> {
		const z = await this.db
			.prepare(
				"SELECT SUM(store_price_cents IS NOT NULL) AS mitPreis, " +
					"SUM(store_is_sale = 1) AS imAngebot, " +
					"SUM(store_plus = 1) AS imPlusKatalog, " +
					"SUM(store_geprueft_am IS NOT NULL) AS geprueft, " +
					"SUM(store_befund = 'ohne_id') AS ohneId, " +
					"SUM(store_befund = 'plattform') AS ohneWebstore " +
					"FROM release",
			)
			.first<{
				mitPreis: number;
				imAngebot: number;
				imPlusKatalog: number;
				geprueft: number;
				ohneId: number;
				ohneWebstore: number;
			}>();
		return {
			mitPreis: z?.mitPreis ?? 0,
			imAngebot: z?.imAngebot ?? 0,
			imPlusKatalog: z?.imPlusKatalog ?? 0,
			geprueft: z?.geprueft ?? 0,
			ohneId: z?.ohneId ?? 0,
			ohneWebstore: z?.ohneWebstore ?? 0,
		};
	}
}
