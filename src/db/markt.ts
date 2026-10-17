import type { AngebotUrteil, AngebotWahl, MarktKanal } from "../domain/markt";
import type { Plattform } from "../domain/titel";
import { eins, einzeln, zeilen, type Baustein } from "./baustein";
import type { EventRepository } from "./events";

/**
 * Gebrauchtpreise und Disc-Nachweis aus eBay (Abschnitt 7.3, Stufe 20).
 *
 * Zwei Zeilen je Release, hoechstens: der guenstigste geprueffte Treffer bei
 * rebuy/medimops und der im breiten Markt. Die Anzeige nimmt den Haendler
 * zuerst (Entscheidung des Nutzers vom 02.10.2026) - das macht `v_luecken`
 * ueber `ORDER BY (kanal <> 'haendler')`.
 *
 * Alles zu einem Release geht in EINEN Batch: Angebote, Preisverlauf,
 * Disc-Nachweis samt Protokoll und der Pruefstempel. Entweder kommt es
 * zusammen an oder zusammen nicht.
 */

/**
 * Nach so vielen Tagen wird ein Release erneut gefragt. Als Text im
 * Statement, nie als Bind.
 *
 * Taeglich seit Stufe 20e (Entscheidung des Nutzers vom 02.10.2026). Nicht
 * wegen der Preise selbst - die bewegen sich langsamer -, sondern wegen des
 * Verlaufs: Ein gleitender Median braucht Punkte, um gegen den einzelnen
 * Verkaeufer robust zu sein, der eine Disc fuer drei Euro einstellt. Und ein
 * Preisalarm (Stufe 20g) kann nur melden, was er gesehen hat.
 */
export const MARKT_FRIST_TAGE = 1;

/**
 * Welche Releases JETZT gefragt werden - die eine Bedingung fuer Auswahl und
 * Zaehlung (Stufe 18g). Steht einmal, damit die Zahl in der Verlaufszeile
 * nie etwas anderes zaehlt als das, was der naechste Aufruf nimmt. Warum
 * ausgeschrieben statt ueber `v_luecken`: siehe `zuPruefen`.
 */
export const FAELLIG_IN_AUSWAHL =
	`WHERE (r.markt_geprueft_am IS NULL OR r.markt_geprueft_am < datetime('now', '-${MARKT_FRIST_TAGE} days')) ` +
	"AND ((r.physical_release_status IN ('ja', 'unbekannt') " +
	"AND EXISTS (SELECT 1 FROM trophy_progress t WHERE t.release_id = r.id AND t.progress_pct > 0) " +
	"AND NOT EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id)) " +
	"OR EXISTS (SELECT 1 FROM plan_entry pe WHERE pe.release_id = r.id AND pe.status = 'offen')) ";

export type ZuPruefen = {
	releaseId: number;
	gameId: number;
	titel: string;
	plattform: Plattform;
	discFassung: string;
};

export type AngebotJeKanal = Partial<Record<MarktKanal, AngebotWahl>>;

/**
 * Das Angebot, das die Oberflaeche zeigt - Haendler zuerst, Markt als
 * Rueckfall, dieselbe Regel wie in `v_luecken`. Die Route zum Verwerfen gibt
 * es zurueck, damit die Liste den neuen Preis sofort zeigt, statt neu zu laden
 * (Stufe 20h).
 */
export type AngezeigtesAngebot = {
	preisCents: number;
	anbieter: string;
	zustand: string | null;
	url: string | null;
	itemId: string | null;
};

const angezeigt = (urteil: AngebotUrteil): AngezeigtesAngebot => ({
	preisCents: urteil.angebot.preisCents,
	anbieter: urteil.anbieter,
	zustand: urteil.angebot.zustand,
	url: urteil.angebot.url,
	itemId: urteil.angebot.itemId,
});

/**
 * Wie ein verworfenes Angebot im Aenderungsprotokoll steht: "Titel (6,98 €)".
 * Der Preis mit Komma, wie ueberall in der Oberflaeche - die Ruecknahme bildet
 * denselben Satz in SQL (`ruecknahme`).
 */
const angebotstext = (titel: string, preisCents: number) =>
	`${titel} (${(preisCents / 100).toFixed(2).replace(".", ",")} €)`;

/** Eine Zeile der Sperrliste, wie sie die Oberflaeche zeigt (Stufe 20h). */
export type VerworfenesAngebot = {
	itemId: string;
	titel: string;
	preisCents: number;
	verworfenAm: string;
};

export class MarktRepository {
	constructor(
		private readonly db: D1Database,
		private readonly events: EventRepository,
	) {}

	/**
	 * Welche Releases gefragt werden - und ausdruecklich nicht alle.
	 *
	 * Derselbe Zuschnitt, den Abschnitt 7.4 fuer die Store-Preise festlegt:
	 * nur was in der Lueckenansicht auftaucht oder auf einer offenen Absicht
	 * steht. Fuer die ganze Sammlung waere es unnoetiger Verkehr gegen eine
	 * fremde Schnittstelle.
	 *
	 * Die Reihenfolge nimmt Ungeprueftes zuerst, danach das Aelteste - das
	 * tut `ORDER BY markt_geprueft_am` von selbst, weil SQLite NULL in ASC
	 * nach vorne sortiert. Zusammen mit idx_release_markt kann die Abfrage
	 * nach `LIMIT` abbrechen, statt alles zu sortieren.
	 *
	 * Die Bedingung steht ausgeschrieben und liest NICHT `v_luecken`,
	 * obwohl die Menge fast dieselbe ist: Gemessen am 02.10.2026 las die
	 * Fassung mit `id IN (SELECT release_id FROM v_luecken ...)` **3 424
	 * Zeilen, um zehn Releases zu finden** - die View rechnet dabei fuer
	 * alle 430 Zeilen die Preis-Unterabfragen aus, nur um Ids zu liefern.
	 * Die Frage hier ist ausserdem eine andere als "ist das eine Luecke":
	 * gefragt wird, wessen Preis in der Oberflaeche ueberhaupt vorkommt.
	 */
	async zuPruefen(limit: number): Promise<ZuPruefen[]> {
		return einzeln(this.db, this.zuPruefenBaustein(limit));
	}

	/** Dieselbe Auswahl als Baustein - fuer den Lage-Batch des Cron (Stufe 18j). */
	zuPruefenBaustein(limit: number): Baustein<ZuPruefen[]> {
		return eins(
			this.db
				.prepare(
					"SELECT r.id AS releaseId, r.game_id AS gameId, g.title AS titel, r.platform AS plattform, " +
						"r.physical_release_status AS discFassung " +
						"FROM release r JOIN game g ON g.id = r.game_id " +
						FAELLIG_IN_AUSWAHL +
						"ORDER BY r.markt_geprueft_am, r.id LIMIT ?",
				)
				.bind(limit),
			(e) => zeilen<ZuPruefen>(e),
		);
	}

	/**
	 * Das Ergebnis EINES Releases festschreiben.
	 *
	 * `rohangebote` ist die Zahl der Angebote, die eBay in der
	 * Plattform-Kategorie ueberhaupt genannt hat - vor dem Titelabgleich.
	 * Null davon ist der starke Hinweis auf eine reine Download-Fassung
	 * (gemessen 3 % Fehlrate) und die Begruendung in Block B der
	 * Lueckenansicht (5.3). Ein `nein` schreibt dieser Pfad NIE.
	 *
	 * Gibt zurueck, ob die Disc-Fassung von `unbekannt` auf `ja` ging -
	 * aus `meta.changes` des UPDATE allein, nie als Summe ueber den Batch.
	 */
	async ergebnisSchreiben(
		ziel: ZuPruefen,
		angebote: AngebotJeKanal,
		rohangebote: number,
	): Promise<{ discBelegt: boolean; preis: AngezeigtesAngebot | null }> {
		const anweisungen: D1PreparedStatement[] = [];

		// In `market_offer` kommt der PREIS, nicht der Beleg: Ein loser
		// Datentraeger ist kein Vergleichspreis (Stufe 20h-b). Ist er das
		// einzige Angebot, steht hier `in_stock = 0` und die Oberflaeche sagt
		// "unbekannt" - die Disc-Fassung belegt er trotzdem, weiter unten.
		for (const kanal of ["haendler", "markt"] as const) {
			const wahl = angebote[kanal];
			if (wahl === undefined) continue;
			anweisungen.push(
				wahl.preis === null ? this.leerSetzen(ziel, kanal) : this.angebotSetzen(ziel, kanal, wahl.preis),
			);
		}

		// BEIDE Kanaele kommen in den Verlauf, jeder als eigene Reihe (Stufe
		// 20e): Der Haendlerpreis ist ein Katalogpreis und aendert sich
		// bewusst, der Marktpreis springt mit jedem eingestellten Angebot. In
		// einer Reihe vermischt waeren beide unbrauchbar.
		for (const kanal of ["haendler", "markt"] as const) {
			const preis = angebote[kanal]?.preis;
			if (preis) anweisungen.push(this.verlaufSchreiben(ziel.releaseId, kanal, preis));
		}

		// Der ANGEZEIGTE Preis bleibt Haendler zuerst, sonst Markt - dieselbe
		// Regel wie in v_luecken.
		const gezeigt = angebote.haendler?.preis ?? angebote.markt?.preis ?? null;

		// Der BELEG, nicht der Preis: Eine lose Disc ohne Huelle ist der
		// staerkste Hinweis darauf, dass es die Disc-Fassung gibt - sie faellt
		// nur aus dem Preis heraus, nicht aus dem Nachweis (Stufe 20h-b).
		const beleg = angebote.haendler?.beleg ?? angebote.markt?.beleg ?? null;

		// Disc-Nachweis: nur unbekannt -> ja, nie ein 'nein' und nie ein
		// bestehendes 'ja' anfassen (Abschnitt 3). Protokoll mit derselben
		// Bedingung, davor im Batch, damit der alte Wert noch steht (8.5).
		const belegt = beleg !== null && ziel.discFassung === "unbekannt";
		if (belegt) {
			anweisungen.push(
				this.events.insertSelect(
					"SELECT 'feed', r.game_id, r.id, g.title || ' (' || r.platform || ')', 'disc_fassung_belegt', " +
						"'physical_release_status', 'unbekannt', 'ja', 'ebay' " +
						"FROM release r JOIN game g ON g.id = r.game_id " +
						"WHERE r.id = ? AND r.physical_release_status = 'unbekannt'",
					ziel.releaseId,
				),
				this.db
					.prepare(
						"UPDATE release SET physical_release_status = 'ja', physical_source = 'ebay' " +
							"WHERE id = ? AND physical_release_status = 'unbekannt'",
					)
					.bind(ziel.releaseId),
			);
		}
		const stempelIndex = anweisungen.length;
		anweisungen.push(
			this.db
				.prepare("UPDATE release SET markt_geprueft_am = datetime('now'), markt_rohangebote = ? WHERE id = ?")
				.bind(rohangebote, ziel.releaseId),
		);

		const ergebnisse = await this.db.batch(anweisungen);
		const discBelegt = belegt && (ergebnisse[stempelIndex - 1]?.meta.changes ?? 0) > 0;
		return { discBelegt, preis: gezeigt === null ? null : angezeigt(gezeigt) };
	}

	/** Ein gefundenes Angebot - UPSERT, damit der naechste Lauf dieselbe Zeile trifft. */
	private angebotSetzen(ziel: ZuPruefen, kanal: MarktKanal, urteil: AngebotUrteil): D1PreparedStatement {
		const a = urteil.angebot;
		return this.db
			.prepare(
				"INSERT INTO market_offer (source, source_product_id, anbieter, kanal, title_raw, platform_raw, " +
					"condition, price_cents, currency, in_stock, url, ebay_item_id, imported_at, release_id) " +
					"VALUES ('ebay', ?, ?, ?, ?, ?, ?, ?, 'EUR', 1, ?, ?, datetime('now'), ?) " +
					"ON CONFLICT (source, source_product_id) DO UPDATE SET " +
					"anbieter = excluded.anbieter, title_raw = excluded.title_raw, condition = excluded.condition, " +
					"price_cents = excluded.price_cents, in_stock = 1, url = excluded.url, " +
					"ebay_item_id = excluded.ebay_item_id, " +
					"imported_at = excluded.imported_at, release_id = excluded.release_id",
			)
			.bind(
				`${kanal}:${ziel.releaseId}`,
				urteil.anbieter,
				kanal,
				a.titel,
				ziel.plattform,
				a.zustand,
				a.preisCents,
				a.url,
				a.itemId,
				ziel.releaseId,
			);
	}

	/**
	 * Kein Angebot mehr in diesem Kanal: `in_stock = 0`, der Preis bleibt
	 * stehen. Die Zeile wird nicht geloescht - "zuletzt gesehen fuer 12,77"
	 * ist mehr als nichts, und `v_luecken` liest nur `in_stock = 1`.
	 */
	private leerSetzen(ziel: ZuPruefen, kanal: MarktKanal): D1PreparedStatement {
		return this.db
			.prepare("UPDATE market_offer SET in_stock = 0, imported_at = datetime('now') WHERE source_product_id = ? AND source = 'ebay'")
			.bind(`${kanal}:${ziel.releaseId}`);
	}

	/**
	 * Preisverlauf, nur bei Aenderung (Abschnitt 6): Der INSERT laeuft ins
	 * Leere, wenn der jüngste Eintrag denselben Preis nennt. Set-basiert, weil
	 * ein Lesen davor eine zweite Abfrage je Release waere.
	 */
	private verlaufSchreiben(releaseId: number, kanal: MarktKanal, urteil: AngebotUrteil): D1PreparedStatement {
		return this.db
			.prepare(
				"INSERT INTO price_snapshot (release_id, channel, kanal, source, condition, price_cents, currency, " +
					"ebay_item_id, captured_at) " +
					"SELECT ?, 'gebraucht', ?, ?, ?, ?, 'EUR', ?, datetime('now') " +
					"WHERE NOT EXISTS (SELECT 1 FROM price_snapshot p WHERE p.release_id = ? AND p.channel = 'gebraucht' " +
					"AND p.kanal = ? AND p.price_cents = ? AND p.captured_at = " +
					"(SELECT MAX(q.captured_at) FROM price_snapshot q WHERE q.release_id = ? AND q.channel = 'gebraucht' " +
					"AND q.kanal = ?))",
			)
			.bind(
				releaseId,
				kanal,
				// Wer das Angebot stellt - er kann innerhalb eines Kanals
				// wechseln und taugt deshalb nicht als Schluessel der Reihe.
				urteil.anbieter.toLowerCase(),
				urteil.angebot.zustand,
				urteil.angebot.preisCents,
				// Der Punkt traegt die Kennung seines Angebots - daran haengt
				// der Filter aus Stufe 20h. Die Altzeilen bleiben leer, es gibt
				// keine URL, aus der sie nachzutragen waere (Migration 0033).
				urteil.angebot.itemId,
				releaseId,
				kanal,
				urteil.angebot.preisCents,
				releaseId,
				kanal,
			);
	}

	/**
	 * EIN Release jetzt fragen, ohne Frist und ohne Zuschnitt (Stufe 20h).
	 *
	 * Der Neuabruf nach einem Verwerfen braucht genau diese Zeile: Die Frist
	 * aus `zuPruefen` wuerde ihn bis zum naechsten Morgen stumm lassen, und
	 * genau das ist der Weg, mit dem man ein falsches Angebot loswird.
	 */
	async eines(releaseId: number): Promise<ZuPruefen | null> {
		return this.db
			.prepare(
				"SELECT r.id AS releaseId, r.game_id AS gameId, g.title AS titel, r.platform AS plattform, " +
					"r.physical_release_status AS discFassung " +
					"FROM release r JOIN game g ON g.id = r.game_id WHERE r.id = ?",
			)
			.bind(releaseId)
			.first<ZuPruefen>();
	}

	/**
	 * Die Sperrliste fuer eine ganze Portion - EINMAL, nicht je Release.
	 *
	 * Dieselbe Begruendung wie bei `vorbereiten` in `scan-titel.ts`: Der
	 * Bestand wird einmal vorbereitet, nicht je Eingabe. Zwanzig Binds je
	 * Aufruf, weit innerhalb der 100-Bind-Grenze von D1 (CLAUDE.md).
	 *
	 * Gelesen wird ueber den Primaerschluessel (release_id, ebay_item_id);
	 * ein eigener Index auf release_id waere dieselbe fuehrende Spalte und
	 * damit nur Schreibaufwand.
	 */
	async verworfeneJeRelease(releaseIds: readonly number[]): Promise<Map<number, Set<string>>> {
		const je = new Map<number, Set<string>>();
		if (releaseIds.length === 0) return je;
		const { results } = await this.db
			.prepare(
				`SELECT release_id, ebay_item_id FROM market_offer_verworfen WHERE release_id IN (${releaseIds.map(() => "?").join(",")})`,
			)
			.bind(...releaseIds)
			.all<{ release_id: number; ebay_item_id: string }>();
		for (const z of results ?? []) {
			const menge = je.get(z.release_id) ?? new Set<string>();
			menge.add(z.ebay_item_id);
			je.set(z.release_id, menge);
		}
		return je;
	}

	/** Was fuer dieses Release verworfen ist - fuer die Ruecknahme im Punktmenue, neueste zuerst. */
	async verworfene(releaseId: number): Promise<VerworfenesAngebot[]> {
		const { results } = await this.db
			.prepare(
				"SELECT ebay_item_id AS itemId, titel, preis_cents AS preisCents, verworfen_am AS verworfenAm " +
					"FROM market_offer_verworfen WHERE release_id = ? ORDER BY verworfen_am DESC, ebay_item_id",
			)
			.bind(releaseId)
			.all<VerworfenesAngebot>();
		return results ?? [];
	}

	/**
	 * Das Angebot, das zu dieser Kennung gerade vorliegt - oder null.
	 *
	 * Die Route braucht es fuer zwei Dinge: Sie antwortet `409`, wenn der
	 * Nachtlauf das Angebot inzwischen ersetzt hat (statt stillschweigend das
	 * falsche zu verwerfen), und sie nimmt Titel und Preis von hier, statt
	 * sie sich vom Browser sagen zu lassen - was in der Sperrliste steht,
	 * stammt dann aus der eigenen Datenbank.
	 */
	async angebotNachKennung(releaseId: number, itemId: string): Promise<{ titel: string; preisCents: number } | null> {
		return this.db
			.prepare(
				"SELECT title_raw AS titel, price_cents AS preisCents FROM market_offer " +
					"WHERE release_id = ? AND ebay_item_id = ? AND source = 'ebay' AND in_stock = 1 " +
					"ORDER BY kanal LIMIT 1",
			)
			.bind(releaseId, itemId)
			.first<{ titel: string; preisCents: number }>();
	}

	/**
	 * Ein Angebot auf die Sperrliste setzen - mit Protokoll im DEMSELBEN
	 * Batch (8.5). Quelle `nutzer`: Es ist seine Entscheidung, nicht ein
	 * Befund des Feeds.
	 *
	 * `INSERT OR IGNORE` ist hier Sicherheitsnetz, nicht der Normalfall: Ein
	 * Angebot, das schon auf der Liste steht, kann nicht das angezeigte sein,
	 * weil der Filter es uebergeht. Trifft es trotzdem zu, bleibt die
	 * urspruengliche Zeile mit ihrem Datum stehen.
	 */
	async verwerfen(releaseId: number, itemId: string, titel: string, preisCents: number): Promise<void> {
		await this.db.batch([
			this.events.statement({
				source: "nutzer",
				kind: "angebot_verworfen",
				releaseId,
				neu: angebotstext(titel, preisCents),
				detail: "ebay",
			}),
			this.db
				.prepare(
					"INSERT OR IGNORE INTO market_offer_verworfen (release_id, ebay_item_id, titel, preis_cents, verworfen_am) " +
						"VALUES (?, ?, ?, ?, datetime('now'))",
				)
				.bind(releaseId, itemId, titel, preisCents),
		]);
	}

	/**
	 * Die Ruecknahme: eine Zeile aus der Sperrliste, Ereignis DAVOR im selben
	 * Batch (Regel fuer set-basierte Schreiber, 8.5) - danach waere der alte
	 * Wert fort. Gibt zurueck, ob ueberhaupt eine Zeile getroffen wurde;
	 * `meta.changes` kommt vom DELETE allein, nie als Summe ueber den Batch.
	 */
	async ruecknahme(releaseId: number, itemId: string): Promise<boolean> {
		const ergebnisse = await this.db.batch([
			this.events.insertSelect(
				"SELECT 'nutzer', r.game_id, r.id, g.title || ' (' || r.platform || ')', 'angebot_verworfen', " +
					// Derselbe Satz wie beim Verwerfen, nur in SQL gebildet -
					// set-basierte Schreiber lesen den alten Wert nicht vor.
					"NULL, v.titel || ' (' || replace(printf('%.2f', v.preis_cents / 100.0), '.', ',') || ' €)', " +
					"NULL, 'ebay' " +
					"FROM market_offer_verworfen v JOIN release r ON r.id = v.release_id JOIN game g ON g.id = r.game_id " +
					"WHERE v.release_id = ? AND v.ebay_item_id = ?",
				releaseId,
				itemId,
			),
			this.db
				.prepare("DELETE FROM market_offer_verworfen WHERE release_id = ? AND ebay_item_id = ?")
				.bind(releaseId, itemId),
		]);
		return (ergebnisse[1]?.meta.changes ?? 0) > 0;
	}

	/**
	 * Wie viele Releases der Auswahl JETZT faellig sind - die Zahl `offen` in
	 * der Verlaufszeile (Stufe 18g).
	 *
	 * Bis 18g zaehlte sie Releases ohne jeden Stempel im GANZEN Bestand, und
	 * das waren genau die 59 ausserhalb der Auswahl, die nie gefragt werden:
	 * `offen=59` in jeder Zeile jeder Nacht, waehrend der Schritt seine
	 * Arbeit vom 11. bis 16.10.2026 nicht mehr schaffte. Nur auf die Auswahl
	 * zu beschraenken haette 0 ergeben, ebenso unbewegt - in der Auswahl ist
	 * nach dem ersten Durchlauf alles gestempelt. Was sich bewegt, ist
	 * "faellig": dieselbe Bedingung wie `zuPruefen`, gezaehlt statt begrenzt.
	 *
	 * Die Kosten wachsen mit der Zahl des Faelligen, nicht mit dem Bestand:
	 * Ueber idx_release_markt liest die Abfrage nur den faelligen Bereich und
	 * je Zeile die Unterabfragen (test/lesekosten.spec.ts). Der Fehler aus
	 * Stufe 20 - `stand()` mit 1 549 Zeilen fuer eine Zahl der Verlaufszeile -
	 * steht im Kopf von `stand()`.
	 */
	async faelligeAnzahl(): Promise<number> {
		const z = await this.db
			.prepare("SELECT COUNT(*) AS n FROM release r " + FAELLIG_IN_AUSWAHL)
			.first<{ n: number }>();
		return z?.n ?? 0;
	}

	/**
	 * Zaehler fuer die Einstellungen.
	 *
	 * `mitPreis` zaehlt RELEASES, nicht Angebotszeilen: Trifft sowohl der
	 * Haendler- als auch der Marktkanal, stehen zwei Zeilen zu einem Release.
	 * Die erste Fassung zaehlte die Zeilen und meldete nach dem ersten
	 * Durchlauf 323, wo 239 Releases einen Preis hatten.
	 *
	 * Nur fuer die Einstellungen, nie fuer die Verlaufszeile: Gemessen am
	 * 02.10.2026 las ein Cron-Aufruf des Schritts 2 059 Zeilen, davon
	 * **1 549 allein fuer `stand()`** - drei Viertel der Kosten fuer eine
	 * Zahl, die nur in der Verlaufszeile stand. Dieselbe Form wie der
	 * `COUNT(*)` in der Feed-Route am 01.10.2026, nur kleiner.
	 */
	async stand(): Promise<{ mitPreis: number; geprueft: number; ohneAngebot: number; offen: number }> {
		const z = await this.db
			.prepare(
				"SELECT (SELECT COUNT(DISTINCT release_id) FROM market_offer WHERE source = 'ebay' AND in_stock = 1) AS mitPreis, " +
					"(SELECT COUNT(*) FROM release WHERE markt_geprueft_am IS NOT NULL) AS geprueft, " +
					"(SELECT COUNT(*) FROM release WHERE markt_rohangebote = 0) AS ohneAngebot, " +
					"(SELECT COUNT(*) FROM release WHERE markt_geprueft_am IS NULL) AS offen",
			)
			.first<{ mitPreis: number; geprueft: number; ohneAngebot: number; offen: number }>();
		return { mitPreis: z?.mitPreis ?? 0, geprueft: z?.geprueft ?? 0, ohneAngebot: z?.ohneAngebot ?? 0, offen: z?.offen ?? 0 };
	}
}
