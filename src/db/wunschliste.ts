import type { IgdbKandidat } from "../domain/igdb";
import type { Plattform } from "../domain/titel";
import type { WunschlistenForm, WunschZeile } from "../domain/wunschliste";

export const MATCH_ARTEN = ["sammlung", "vorhanden", "eindeutig", "mehrdeutig", "ohne_treffer"] as const;
export type MatchArt = (typeof MATCH_ARTEN)[number];


export const ENTSCHEIDUNGEN = ["offen", "uebernommen", "uebersprungen", "schon_vorhanden", "aufgeteilt"] as const;
export type Entscheidung = (typeof ENTSCHEIDUNGEN)[number];

export const ZEILEN_GRUPPEN = ["klar", "unklar", "uebersprungen", "uebernommen"] as const;
export type ZeilenGruppe = (typeof ZEILEN_GRUPPEN)[number];

export type ImportZaehler = {
	gesamt: number;
	/** Noch nicht abgeglichen (checked_at IS NULL). */
	ungeprueft: number;
	klar: number;
	mehrdeutig: number;
	ohneTreffer: number;
	uebernommen: number;
	uebersprungen: number;
	schonVorhanden: number;
};

export type ImportLauf = {
	id: number;
	source_name: string | null;
	list_year: number | null;
	form: WunschlistenForm;
	created_at: string;
};

export type ImportZeile = {
	id: number;
	import_id: number;
	position: number;
	title: string;
	/** JSON-Liste der Rohzeilen. */
	originals: string;
	platform: Plattform | null;
	listed_at: string | null;
	checked_at: string | null;
	search_path: string | null;
	match_kind: MatchArt | null;
	game_id: number | null;
	release_id: number | null;
	igdb_id: number | null;
	decision: Entscheidung;
	plan_entry_id: number | null;
	decided_at: string | null;
	/** Titel des Spiels aus der Sammlung, wenn game_id gesetzt ist. */
	spiel_titel: string | null;
	spiel_cover: string | null;
	release_plattform: string | null;
};

export type ImportKandidatZeile = {
	line_id: number;
	igdb_id: number;
	name: string;
	slug: string | null;
	cover_url: string | null;
	release_date: string | null;
	platforms: string | null;
	game_type: string | null;
	critic_score: number | null;
	critic_score_count: number | null;
	position: number;
};

export type Abgleichergebnis = {
	matchKind: MatchArt;
	gameId: number | null;
	releaseId: number | null;
	igdbId: number | null;
	searchPath: string | null;
	/** 'schon_vorhanden', wenn am Ziel bereits ein offener Wunsch haengt; sonst 'offen'. */
	decision: Extract<Entscheidung, "offen" | "schon_vorhanden">;
};

const ZEILEN_AUSWAHL =
	"SELECT l.id, l.import_id, l.position, l.title, l.originals, l.platform, l.listed_at, l.checked_at, " +
	"l.search_path, l.match_kind, l.game_id, l.release_id, l.igdb_id, l.decision, l.plan_entry_id, l.decided_at, " +
	"g.title AS spiel_titel, g.cover_url AS spiel_cover, r.platform AS release_plattform " +
	"FROM wishlist_import_line l " +
	"LEFT JOIN game g ON g.id = l.game_id " +
	"LEFT JOIN release r ON r.id = l.release_id ";

const ZAEHLER_AUSWAHL =
	"COUNT(*) AS gesamt, " +
	"SUM(checked_at IS NULL AND decision = 'offen') AS ungeprueft, " +
	"SUM(decision = 'offen' AND match_kind IN ('sammlung','vorhanden','eindeutig')) AS klar, " +
	"SUM(decision = 'offen' AND match_kind = 'mehrdeutig') AS mehrdeutig, " +
	"SUM(decision = 'offen' AND match_kind = 'ohne_treffer') AS ohneTreffer, " +
	"SUM(decision = 'uebernommen') AS uebernommen, " +
	"SUM(decision = 'uebersprungen') AS uebersprungen, " +
	"SUM(decision = 'schon_vorhanden') AS schonVorhanden";

const GRUPPEN_BEDINGUNG: Record<ZeilenGruppe, string> = {
	klar: "l.decision IN ('offen','schon_vorhanden') AND l.match_kind IN ('sammlung','vorhanden','eindeutig')",
	unklar: "l.decision = 'offen' AND l.match_kind IN ('mehrdeutig','ohne_treffer')",
	uebersprungen: "l.decision = 'uebersprungen'",
	uebernommen: "l.decision = 'uebernommen'",
};

function leererZaehler(): ImportZaehler {
	return { gesamt: 0, ungeprueft: 0, klar: 0, mehrdeutig: 0, ohneTreffer: 0, uebernommen: 0, uebersprungen: 0, schonVorhanden: 0 };
}

function zaehlerAus(z: Partial<ImportZaehler> | null | undefined): ImportZaehler {
	const leer = leererZaehler();
	if (!z) return leer;
	for (const k of Object.keys(leer) as Array<keyof ImportZaehler>) leer[k] = z[k] ?? 0;
	return leer;
}

/**
 * Wunschlisten-Import (Abschnitt 8.2): ein Lauf je Datei, eine Zeile je
 * Titel, Kandidaten je Zeile. Der Abgleich laeuft in Schritten; der
 * Fortschritt steht in `checked_at`, die Entscheidung des Nutzers in
 * `decision` - beides ueberlebt ein Neuladen. Alle Abfragen laufen ueber
 * idx_wl_line_import; ein Lauf hat einige hundert Zeilen.
 */
export class WishlistImportRepository {
	constructor(private readonly db: D1Database) {}

	async anlegen(
		meta: { sourceName: string | null; listYear: number | null; form: WunschlistenForm },
		zeilen: readonly WunschZeile[],
	): Promise<number> {
		const lauf = await this.db
			.prepare("INSERT INTO wishlist_import (source_name, list_year, form) VALUES (?, ?, ?) RETURNING id")
			.bind(meta.sourceName, meta.listYear, meta.form)
			.first<{ id: number }>();
		if (!lauf) throw new Error("Import konnte nicht angelegt werden.");

		if (zeilen.length > 0) {
			const einfuegen = this.db.prepare(
				"INSERT INTO wishlist_import_line (import_id, position, title, originals, platform, listed_at) VALUES (?, ?, ?, ?, ?, ?)",
			);
			await this.db.batch(
				zeilen.map((z, i) => einfuegen.bind(lauf.id, i + 1, z.titel, JSON.stringify(z.originals), z.plattform, z.listedAt)),
			);
		}
		return lauf.id;
	}

	async laeufe(): Promise<Array<ImportLauf & { zaehler: ImportZaehler }>> {
		const [laeufe, zaehler] = await this.db.batch([
			this.db.prepare("SELECT id, source_name, list_year, form, created_at FROM wishlist_import ORDER BY id DESC"),
			this.db.prepare(`SELECT import_id, ${ZAEHLER_AUSWAHL} FROM wishlist_import_line GROUP BY import_id`),
		]);
		const nachLauf = new Map<number, ImportZaehler>();
		for (const z of zaehler.results as Array<ImportZaehler & { import_id: number }>) {
			nachLauf.set(z.import_id, zaehlerAus(z));
		}
		return (laeufe.results as ImportLauf[]).map((l) => ({ ...l, zaehler: nachLauf.get(l.id) ?? leererZaehler() }));
	}

	async lauf(id: number): Promise<(ImportLauf & { zaehler: ImportZaehler }) | null> {
		const [lauf, zaehler] = await this.db.batch([
			this.db.prepare("SELECT id, source_name, list_year, form, created_at FROM wishlist_import WHERE id = ?").bind(id),
			this.db.prepare(`SELECT ${ZAEHLER_AUSWAHL} FROM wishlist_import_line WHERE import_id = ?`).bind(id),
		]);
		const l = lauf.results[0] as ImportLauf | undefined;
		if (!l) return null;
		return { ...l, zaehler: zaehlerAus(zaehler.results[0] as Partial<ImportZaehler> | undefined) };
	}

	async loeschen(id: number): Promise<boolean> {
		const ergebnis = await this.db.prepare("DELETE FROM wishlist_import WHERE id = ?").bind(id).run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	/** Die naechsten Zeilen, die noch nicht abgeglichen wurden. */
	async naechsteOffen(importId: number, n: number): Promise<ImportZeile[]> {
		const { results } = await this.db
			.prepare(ZEILEN_AUSWAHL + "WHERE l.import_id = ? AND l.checked_at IS NULL AND l.decision = 'offen' ORDER BY l.position, l.id LIMIT ?")
			.bind(importId, n)
			.all<ImportZeile>();
		return results;
	}

	async zeile(id: number): Promise<ImportZeile | null> {
		return this.db.prepare(ZEILEN_AUSWAHL + "WHERE l.id = ?").bind(id).first<ImportZeile>();
	}

	/** Zeilen einer Gruppe, seitenweise, mit ihren Kandidaten. */
	async zeilen(
		importId: number,
		gruppe: ZeilenGruppe,
		limit: number,
		offset: number,
	): Promise<{ zeilen: ImportZeile[]; kandidaten: ImportKandidatZeile[]; gesamt: number }> {
		const bedingung = `l.import_id = ? AND ${GRUPPEN_BEDINGUNG[gruppe]}`;
		const [zaehlung, seite] = await this.db.batch([
			this.db.prepare(`SELECT COUNT(*) AS n FROM wishlist_import_line l WHERE ${bedingung}`).bind(importId),
			this.db
				.prepare(ZEILEN_AUSWAHL + `WHERE ${bedingung} ORDER BY l.position, l.id LIMIT ? OFFSET ?`)
				.bind(importId, limit, offset),
		]);
		const zeilen = seite.results as ImportZeile[];
		const gesamt = (zaehlung.results[0] as { n: number } | undefined)?.n ?? 0;
		if (zeilen.length === 0) return { zeilen, kandidaten: [], gesamt };

		const ids = zeilen.map((z) => z.id);
		const { results: kandidaten } = await this.db
			.prepare(
				"SELECT line_id, igdb_id, name, slug, cover_url, release_date, platforms, game_type, " +
					"critic_score, critic_score_count, position FROM wishlist_import_candidate " +
					`WHERE line_id IN (${ids.map(() => "?").join(",")}) ORDER BY line_id, position`,
			)
			.bind(...ids)
			.all<ImportKandidatZeile>();
		return { zeilen, kandidaten, gesamt };
	}

	/**
	 * Ergebnis des Abgleichs einer Zeile ablegen und die Zeile als geprueft
	 * stempeln. Kandidaten werden in jedem Fall abgelegt, auch bei einem
	 * eindeutigen Treffer - die aufgeklappte Liste soll Zweifel klaeren koennen.
	 */
	async ergebnisSetzen(lineId: number, e: Abgleichergebnis, kandidaten: readonly IgdbKandidat[]): Promise<void> {
		const einfuegen = this.db.prepare(
			"INSERT OR IGNORE INTO wishlist_import_candidate (line_id, igdb_id, name, slug, cover_url, release_date, " +
				"platforms, game_type, critic_score, critic_score_count, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		);
		await this.db.batch([
			this.db.prepare("DELETE FROM wishlist_import_candidate WHERE line_id = ?").bind(lineId),
			...kandidaten.map((k, i) =>
				einfuegen.bind(
					lineId,
					k.igdbId,
					k.name,
					k.slug,
					k.coverUrl,
					k.releaseDate,
					k.plattformen.length > 0 ? k.plattformen.join(",") : null,
					k.typ,
					k.criticScore,
					k.criticScoreCount,
					i,
				),
			),
			this.db
				.prepare(
					"UPDATE wishlist_import_line SET checked_at = datetime('now'), match_kind = ?, game_id = ?, release_id = ?, " +
						"igdb_id = ?, search_path = ?, decision = ?, " +
						"decided_at = CASE WHEN ? = 'offen' THEN NULL ELSE datetime('now') END WHERE id = ?",
				)
				.bind(e.matchKind, e.gameId, e.releaseId, e.igdbId, e.searchPath, e.decision, e.decision, lineId),
		]);
	}

	/** Klare Zeilen ohne Entscheidung, fuer die Blockuebernahme in Schritten. */
	async zuUebernehmen(importId: number, n: number): Promise<ImportZeile[]> {
		const { results } = await this.db
			.prepare(ZEILEN_AUSWAHL + `WHERE l.import_id = ? AND l.decision = 'offen' AND l.match_kind IN ('sammlung','vorhanden','eindeutig') ORDER BY l.position, l.id LIMIT ?`)
			.bind(importId, n)
			.all<ImportZeile>();
		return results;
	}

	/** Entscheidung festhalten - sofort, jede einzeln (Abschnitt 8.1 gilt hier genauso). */
	async entscheiden(lineId: number, decision: Entscheidung, planEntryId: number | null = null): Promise<boolean> {
		const ergebnis = await this.db
			.prepare(
				"UPDATE wishlist_import_line SET decision = ?, plan_entry_id = ?, " +
					"decided_at = CASE WHEN ? = 'offen' THEN NULL ELSE datetime('now') END WHERE id = ?",
			)
			.bind(decision, planEntryId, decision, lineId)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	/**
	 * Titel aendern und den Abgleich der Zeile zuruecksetzen: Der neue Titel
	 * ist meist genau die Korrektur, mit der IGDB den Eintrag findet (7.6).
	 */
	async umbenennen(lineId: number, titel: string): Promise<boolean> {
		const [update] = await this.db.batch([
			this.db
				.prepare(
					"UPDATE wishlist_import_line SET title = ?, checked_at = NULL, match_kind = NULL, game_id = NULL, " +
						"release_id = NULL, igdb_id = NULL, search_path = NULL, decision = 'offen', plan_entry_id = NULL, " +
						"decided_at = NULL WHERE id = ? AND decision <> 'uebernommen'",
				)
				.bind(titel, lineId),
			this.db.prepare("DELETE FROM wishlist_import_candidate WHERE line_id = ?").bind(lineId),
		]);
		return (update.meta.changes ?? 0) > 0;
	}

	/**
	 * Sammelzeile ("Mass Effect 1+2+3") in mehrere Zeilen trennen. Die neuen
	 * Zeilen erben Plattform und Datum und werden neu abgeglichen; das
	 * Original bleibt als 'aufgeteilt' stehen - der Nutzer trennt, der Import
	 * raet nicht (8.2).
	 */
	async aufteilen(lineId: number, titel: readonly string[]): Promise<number[]> {
		const original = await this.zeile(lineId);
		if (!original || original.decision === "uebernommen") return [];
		const einfuegen = this.db.prepare(
			"INSERT INTO wishlist_import_line (import_id, position, title, originals, platform, listed_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
		);
		const ergebnisse = await this.db.batch([
			...titel.map((t) => einfuegen.bind(original.import_id, original.position, t, original.originals, original.platform, original.listed_at)),
			this.db
				.prepare(
					"UPDATE wishlist_import_line SET decision = 'aufgeteilt', decided_at = datetime('now'), " +
						"checked_at = COALESCE(checked_at, datetime('now')) WHERE id = ?",
				)
				.bind(lineId),
			this.db.prepare("DELETE FROM wishlist_import_candidate WHERE line_id = ?").bind(lineId),
		]);
		return ergebnisse.slice(0, titel.length).map((r) => (r.results[0] as { id: number }).id);
	}
}
