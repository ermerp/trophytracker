/**
 * Luecken (Use Case 3, Abschnitte 5.3 und 11): Lesen aus v_luecken und der
 * verworfene Kaufeintrag je Release.
 *
 * Die View liefert seit Migration 0017 belegte ('ja') und unbekannte
 * Disc-Fassungen; die Ansicht trennt beides. `plan_id` ist der verworfene
 * Kaufeintrag fuer "Rueckgaengig" (DELETE /api/plans/:id) - ein
 * Index-Lookup je Zeile ueber idx_plan_release, kein Tabellenscan.
 * Wertungen und Erscheinungsdatum kommen seit Stufe 20e-b (Spielerwertung seit 20k) ueber einen
 * Join auf `game` je Zeile (Primaerschluessel) statt ueber die View - so
 * braucht das Sortieren keine Migration.
 */

export type LueckeZeile = {
	game_id: number;
	title: string;
	cover_url: string | null;
	release_id: number;
	platform: string;
	disc_fassung: "ja" | "unbekannt";
	disc_quelle: string | null;
	progress_pct: number;
	hat_platin: number;
	eigener_status: string | null;
	verworfen: number;
	plan_id: number | null;
	bester_gebrauchtpreis_cents: number | null;
	/** Wer das Angebot stellt - 'rebuy', 'medimops' oder 'eBay' (Stufe 20). */
	gebrauchtpreis_anbieter: string | null;
	/** Link auf das Angebot; kann bis zu einer Auffrischung alt sein (Stufe 20e). */
	gebrauchtpreis_url: string | null;
	/** eBays Angebotskennung - was der Verwerfen-Knopf verwirft (Stufe 20h); null heisst: nicht verwerfbar. */
	gebrauchtpreis_item_id: string | null;
	/** Wie viele Angebote fuer dieses Release verworfen sind (Stufe 20h). */
	gebrauchtpreis_verworfen: number;
	/** Wann eBay zuletzt gefragt wurde; null heisst: noch nie. */
	markt_geprueft_am: string | null;
	/**
	 * Wie viele Angebote eBay in der Plattform-Kategorie ueberhaupt kennt -
	 * VOR dem Titelabgleich. 0 ist der Hinweis auf eine reine
	 * Download-Fassung (gemessen 3 % Fehlrate, 7.3), null heisst ungeprueft.
	 */
	markt_rohangebote: number | null;
	/** Kritikerwertung und Erscheinungsdatum des Spiels - zum Sortieren der Liste (Stufe 20e-b). */
	critic_score: number | null;
	user_score: number | null;
	release_date: string | null;
};

export class GapsRepository {
	constructor(private readonly db: D1Database) {}

	async liste(): Promise<LueckeZeile[]> {
		const { results } = await this.db
			.prepare(
				`SELECT l.game_id, l.title, l.cover_url, l.release_id, l.platform,
				        l.disc_fassung, l.disc_quelle, l.progress_pct, l.hat_platin,
				        l.eigener_status, l.verworfen, l.bester_gebrauchtpreis_cents,
				        l.gebrauchtpreis_anbieter, l.gebrauchtpreis_url, l.gebrauchtpreis_item_id,
				        l.gebrauchtpreis_verworfen, l.markt_geprueft_am, l.markt_rohangebote,
				        g.critic_score, g.user_score, g.release_date,
				        (SELECT pe.id FROM plan_entry pe WHERE pe.release_id = l.release_id
				           AND pe.kind = 'kauf' AND pe.status = 'verworfen' ORDER BY pe.id LIMIT 1) AS plan_id
				 FROM v_luecken l
				 JOIN game g ON g.id = l.game_id
				 ORDER BY l.title, l.platform`,
			)
			.all<LueckeZeile>();
		return results;
	}

	/** Der Kaufeintrag am Release, gleich welchen Status - fuer die Duplikatpruefung beim Verwerfen. */
	async kaufEintrag(releaseId: number): Promise<{ id: number; status: string } | null> {
		return this.db
			.prepare("SELECT id, status FROM plan_entry WHERE release_id = ? AND kind = 'kauf' ORDER BY id LIMIT 1")
			.bind(releaseId)
			.first<{ id: number; status: string }>();
	}
}
