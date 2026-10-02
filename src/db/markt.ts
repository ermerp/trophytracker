import type { AngebotUrteil, MarktKanal } from "../domain/markt";
import type { Plattform } from "../domain/titel";
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

/** Nach so vielen Tagen wird ein Release erneut gefragt. Als Text im Statement, nie als Bind. */
export const MARKT_FRIST_TAGE = 14;

export type ZuPruefen = {
	releaseId: number;
	gameId: number;
	titel: string;
	plattform: Plattform;
	discFassung: string;
};

export type AngebotJeKanal = Partial<Record<MarktKanal, AngebotUrteil | null>>;

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
		const { results } = await this.db
			.prepare(
				"SELECT r.id AS releaseId, r.game_id AS gameId, g.title AS titel, r.platform AS plattform, " +
					"r.physical_release_status AS discFassung " +
					"FROM release r JOIN game g ON g.id = r.game_id " +
					`WHERE (r.markt_geprueft_am IS NULL OR r.markt_geprueft_am < datetime('now', '-${MARKT_FRIST_TAGE} days')) ` +
					"AND ((r.physical_release_status IN ('ja', 'unbekannt') " +
					"AND EXISTS (SELECT 1 FROM trophy_progress t WHERE t.release_id = r.id AND t.progress_pct > 0) " +
					"AND NOT EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id)) " +
					"OR EXISTS (SELECT 1 FROM plan_entry pe WHERE pe.release_id = r.id AND pe.status = 'offen')) " +
					"ORDER BY r.markt_geprueft_am, r.id LIMIT ?",
			)
			.bind(limit)
			.all<ZuPruefen>();
		return results ?? [];
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
	): Promise<{ discBelegt: boolean; preisCents: number | null }> {
		const anweisungen: D1PreparedStatement[] = [];

		for (const kanal of ["haendler", "markt"] as const) {
			if (!(kanal in angebote)) continue;
			const urteil = angebote[kanal] ?? null;
			anweisungen.push(urteil === null ? this.leerSetzen(ziel, kanal) : this.angebotSetzen(ziel, kanal, urteil));
		}

		// Der angezeigte Preis: Haendler zuerst, sonst Markt (dieselbe Regel
		// wie in v_luecken). Nur er kommt in den Verlauf - zwei Verlaeufe je
		// Release waeren nicht vergleichbar.
		const gezeigt = angebote.haendler ?? angebote.markt ?? null;
		if (gezeigt) anweisungen.push(this.verlaufSchreiben(ziel.releaseId, gezeigt));

		// Disc-Nachweis: nur unbekannt -> ja, nie ein 'nein' und nie ein
		// bestehendes 'ja' anfassen (Abschnitt 3). Protokoll mit derselben
		// Bedingung, davor im Batch, damit der alte Wert noch steht (8.5).
		const belegt = gezeigt !== null && ziel.discFassung === "unbekannt";
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
		return { discBelegt, preisCents: gezeigt?.angebot.preisCents ?? null };
	}

	/** Ein gefundenes Angebot - UPSERT, damit der naechste Lauf dieselbe Zeile trifft. */
	private angebotSetzen(ziel: ZuPruefen, kanal: MarktKanal, urteil: AngebotUrteil): D1PreparedStatement {
		const a = urteil.angebot;
		return this.db
			.prepare(
				"INSERT INTO market_offer (source, source_product_id, anbieter, kanal, title_raw, platform_raw, " +
					"condition, price_cents, currency, in_stock, url, imported_at, release_id) " +
					"VALUES ('ebay', ?, ?, ?, ?, ?, ?, ?, 'EUR', 1, ?, datetime('now'), ?) " +
					"ON CONFLICT (source, source_product_id) DO UPDATE SET " +
					"anbieter = excluded.anbieter, title_raw = excluded.title_raw, condition = excluded.condition, " +
					"price_cents = excluded.price_cents, in_stock = 1, url = excluded.url, " +
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
	private verlaufSchreiben(releaseId: number, urteil: AngebotUrteil): D1PreparedStatement {
		return this.db
			.prepare(
				"INSERT INTO price_snapshot (release_id, channel, source, condition, price_cents, currency, captured_at) " +
					"SELECT ?, 'gebraucht', ?, ?, ?, 'EUR', datetime('now') " +
					"WHERE NOT EXISTS (SELECT 1 FROM price_snapshot p WHERE p.release_id = ? AND p.channel = 'gebraucht' " +
					"AND p.price_cents = ? AND p.captured_at = " +
					"(SELECT MAX(q.captured_at) FROM price_snapshot q WHERE q.release_id = ? AND q.channel = 'gebraucht'))",
			)
			.bind(
				releaseId,
				urteil.anbieter.toLowerCase(),
				urteil.angebot.zustand,
				urteil.angebot.preisCents,
				releaseId,
				urteil.angebot.preisCents,
				releaseId,
			);
	}

	/**
	 * Wie viele Releases noch nie gefragt wurden - EINE Abfrage ueber
	 * idx_release_markt, nicht die vier Zaehler von `stand()`.
	 *
	 * Gemessen am 02.10.2026: Ein Cron-Aufruf des Schritts las 2 059 Zeilen,
	 * davon **1 549 allein fuer `stand()`** - drei Viertel der Kosten fuer
	 * eine Zahl, die nur in der Verlaufszeile steht. Dieselbe Form wie der
	 * `COUNT(*)` in der Feed-Route am 01.10.2026, nur kleiner. `stand()`
	 * bleibt fuer die Einstellungen, wo alle vier Zahlen gebraucht werden.
	 */
	async offeneAnzahl(): Promise<number> {
		const z = await this.db
			.prepare("SELECT COUNT(*) AS n FROM release WHERE markt_geprueft_am IS NULL")
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
