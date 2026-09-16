import type { Ereignis, EreignisArt, EreignisQuelle } from "../domain/ereignis";

/** Was ein Schreibpfad ueber sein Ereignis sagt; label nur noetig, wenn weder Spiel noch Release bekannt ist. */
export type NeuesEreignis = {
	source: EreignisQuelle;
	kind: EreignisArt;
	gameId?: number | null;
	releaseId?: number | null;
	/** Fallback fuer das Label, wenn Spiel und Release fehlen oder schon geloescht sind. */
	label?: string;
	field?: string | null;
	alt?: string | number | boolean | null;
	neu?: string | number | boolean | null;
	detail?: string | null;
};

export const EREIGNIS_SPALTEN = "source, game_id, release_id, label, kind, field, old_value, new_value, detail";

/** Die Auswahl einer Zeile; exportiert, damit test/lesekosten.spec.ts dieselbe Abfrage misst. */
export const EREIGNIS_AUSWAHL = "id, occurred_at, source, game_id, release_id, label, kind, field, old_value, new_value, detail";

/**
 * Aenderungsprotokoll (Abschnitt 8.5, Stufe 16).
 *
 * Schreibt nie von sich aus: Jeder Schreibpfad der anderen Repositories
 * haengt sich ein Statement von hier in seinen Batch, damit Aenderung und
 * Protokoll zusammen ankommen oder zusammen ausbleiben. Fuer set-basierte
 * Schreiber (Vorbelegung, Einreihung, Disc-Fassung, erschienen) gibt es
 * insertSelect: dieselbe WHERE-Klausel wie das UPDATE, im selben Batch
 * davor - so steht der alte Wert noch.
 *
 * Das Label (Titel und Plattform) wird beim Schreiben per Index-Lookup
 * gebildet, nicht vom Aufrufer mitgeschleppt; ein Ereignis, das ein
 * Loeschen festhaelt, laeuft deshalb VOR dem DELETE.
 */
export class EventRepository {
	constructor(private readonly db: D1Database) {}

	statement(e: NeuesEreignis): D1PreparedStatement {
		const releaseId = e.releaseId ?? null;
		const gameId = e.gameId ?? null;
		return this.db
			.prepare(
				`INSERT INTO game_event (${EREIGNIS_SPALTEN}) VALUES (?, ` +
					"COALESCE(?, (SELECT game_id FROM release WHERE id = ?)), ?, " +
					"COALESCE((SELECT g.title || ' (' || r.platform || ')' FROM release r JOIN game g ON g.id = r.game_id WHERE r.id = ?), " +
					"(SELECT title FROM game WHERE id = ?), ?), " +
					"?, ?, ?, ?, ?)",
			)
			.bind(
				e.source,
				gameId,
				releaseId,
				releaseId,
				releaseId,
				gameId,
				e.label ?? "(gelöscht)",
				e.kind,
				e.field ?? null,
				text(e.alt),
				text(e.neu),
				e.detail ?? null,
			);
	}

	async schreiben(e: NeuesEreignis): Promise<void> {
		await this.statement(e).run();
	}

	/**
	 * Set-basiert: `select` liefert die neun Spalten aus EREIGNIS_SPALTEN in
	 * dieser Reihenfolge, fuer jede Zeile, die das folgende UPDATE trifft.
	 */
	insertSelect(select: string, ...werte: unknown[]): D1PreparedStatement {
		return this.db.prepare(`INSERT INTO game_event (${EREIGNIS_SPALTEN}) ${select}`).bind(...werte);
	}

	/** Verlauf eines Spiels, neueste zuerst; `vor` = id der letzten gezeigten Zeile (Keyset ueber idx_event_game). */
	async fuerSpiel(gameId: number, limit: number, vor: number | null): Promise<{ ereignisse: Ereignis[]; weiter: boolean }> {
		return this.seite("game_id = ?", [gameId], limit, vor);
	}

	/** Alle Aenderungen, neueste zuerst, wahlweise nach Quelle (idx_event_source). */
	async liste(
		optionen: { quelle: EreignisQuelle | null; limit: number; vor: number | null },
	): Promise<{ ereignisse: Ereignis[]; weiter: boolean }> {
		const { quelle, limit, vor } = optionen;
		return quelle ? this.seite("source = ?", [quelle], limit, vor) : this.seite("1 = 1", [], limit, vor);
	}

	/**
	 * Eine Seite. `vor` kommt als eigene Bedingung in den Text, nicht als
	 * "(? IS NULL OR id < ?)": Damit liest SQLite alle Zeilen oberhalb
	 * (gemessen in test/lesekosten.spec.ts: 2 052 statt 51 fuer die zweite Seite).
	 */
	private async seite(
		bedingung: string,
		werte: unknown[],
		limit: number,
		vor: number | null,
	): Promise<{ ereignisse: Ereignis[]; weiter: boolean }> {
		const { results } = await this.db
			.prepare(
				`SELECT ${EREIGNIS_AUSWAHL} FROM game_event WHERE ${bedingung}` +
					(vor === null ? "" : " AND id < ?") +
					" ORDER BY id DESC LIMIT ?",
			)
			.bind(...werte, ...(vor === null ? [] : [vor]), limit + 1)
			.all<Ereignis>();
		return { ereignisse: results.slice(0, limit), weiter: results.length > limit };
	}

	async anzahl(): Promise<number> {
		const z = await this.db.prepare("SELECT COUNT(*) AS n FROM game_event").first<{ n: number }>();
		return z?.n ?? 0;
	}
}

/** Werte als Text ablegen; Booleans als 'ja'/'nein', damit der Satz sie lesen kann. */
function text(w: string | number | boolean | null | undefined): string | null {
	if (w === null || w === undefined) return null;
	if (typeof w === "boolean") return w ? "ja" : "nein";
	return String(w);
}
