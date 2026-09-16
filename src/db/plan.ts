export const PLAN_ARTEN = ["wunsch", "todo", "backlog", "kauf"] as const;
export type PlanArt = (typeof PLAN_ARTEN)[number];

export const PLAN_STATUS = ["offen", "erledigt", "verworfen"] as const;
export type PlanStatus = (typeof PLAN_STATUS)[number];

export const PLAN_HERKUNFT = ["luecke", "wunsch", "manuell", "import", "triage"] as const;
export type PlanHerkunft = (typeof PLAN_HERKUNFT)[number];

/** Genau eine der drei Quellen; die Route prueft das, die Datenbank erzwingt es per CHECK. */
export type PlanZiel =
	| { releaseId: number; gameId?: undefined; titleRaw?: undefined }
	| { gameId: number; releaseId?: undefined; titleRaw?: undefined }
	| { titleRaw: string; releaseId?: undefined; gameId?: undefined };

export type PlanFelder = {
	isFavorite?: boolean;
	note?: string | null;
	status?: PlanStatus;
	kind?: PlanArt;
};

/** Eine Zeile aus v_kaufkandidaten (Stufe 15): Luecke oder offener Wunsch, noch nicht auf der Kaufliste. */
export type KaufKandidatZeile = {
	quelle: "luecke" | "wunsch";
	/** Der Wunsch, bei Luecken NULL. */
	plan_id: number | null;
	release_id: number | null;
	game_id: number | null;
	title: string;
	platform: string | null;
	cover_url: string | null;
	critic_score: number | null;
	is_favorite: number;
	bester_gebrauchtpreis_cents: number | null;
};

/** Eine Zeile aus v_erscheint_bald (Stufe 15): vorgemerkt, noch nicht erschienen. */
export type ErscheintBaldZeile = {
	game_id: number;
	title: string;
	cover_url: string | null;
	release_date: string | null;
	release_id: number | null;
	platform: string | null;
	plan_id: number;
	kind: PlanArt;
	is_favorite: number;
};

/** Eine Zeile aus v_backlog_kandidaten (Stufe 12): im Besitz, nie angefasst. */
export type KandidatZeile = {
	game_id: number;
	title: string;
	cover_url: string | null;
	critic_score: number | null;
	release_id: number;
	platform: string;
};

/** Eine Zeile der Liste: der Eintrag mit dem, was Spiel und Release dazu wissen. */
export type PlanZeile = {
	id: number;
	kind: PlanArt;
	release_id: number | null;
	game_id: number | null;
	title_raw: string | null;
	position: number | null;
	is_favorite: number;
	note: string | null;
	origin: PlanHerkunft | null;
	status: PlanStatus;
	created_at: string;
	resolved_at: string | null;
	/** COALESCE(g.title, title_raw) */
	titel: string;
	/** Spiel-Id, auch wenn der Eintrag ueber ein Release haengt. */
	spiel_id: number | null;
	platform: string | null;
	cover_url: string | null;
	critic_score: number | null;
	release_date: string | null;
	release_status: string | null;
	/** Eigene Bewertung am Release (4.2); null am Spiel, bei Freitext oder ohne Zeile. */
	play_status: string | null;
	/** Offener Kaufeintrag am selben Ziel (Stufe 15) - fuer den Knopf auf der Wunsch-Kachel. */
	kauf_id: number | null;
	/** Disc oder digitale Berechtigung am Release (1/0); am Spiel oder bei Freitext 0. */
	im_besitz: number;
};

const SPALTEN: Record<keyof PlanFelder, string> = {
	isFavorite: "is_favorite",
	note: "note",
	status: "status",
	kind: "kind",
};

function wert(feld: keyof PlanFelder, felder: PlanFelder): unknown {
	if (feld === "isFavorite") return felder.isFavorite ? 1 : 0;
	return felder[feld] ?? null;
}

/** Die Auswahl einer Listenzeile; exportiert, damit test/lesekosten.spec.ts dieselbe Abfrage misst. */
export const PLAN_AUSWAHL =
	"SELECT pe.id, pe.kind, pe.release_id, pe.game_id, pe.title_raw, pe.position, " +
	"pe.is_favorite, pe.note, pe.origin, pe.status, pe.created_at, pe.resolved_at, " +
	"COALESCE(g.title, pe.title_raw) AS titel, g.id AS spiel_id, r.platform, " +
	"g.cover_url, g.critic_score, g.release_date, g.release_status, ps.status AS play_status, " +
	// Alles Index-Lookups je Zeile (idx_plan_release, idx_plan_game, idx_physical_copy_release,
	// idx_digital_release). Zwei getrennte Unterabfragen statt eines OR: Mit OR nimmt SQLite
	// idx_plan_offen und liest alle Kaufeintraege je Zeile (gemessen in test/lesekosten.spec.ts).
	"COALESCE((SELECT k.id FROM plan_entry k WHERE k.release_id = pe.release_id AND k.kind = 'kauf' " +
	"   AND k.status = 'offen' AND k.id <> pe.id ORDER BY k.id LIMIT 1), " +
	"  (SELECT k.id FROM plan_entry k WHERE k.game_id = pe.game_id AND k.kind = 'kauf' " +
	"   AND k.status = 'offen' AND k.id <> pe.id ORDER BY k.id LIMIT 1)) AS kauf_id, " +
	"(pe.release_id IS NOT NULL AND (EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = pe.release_id) " +
	"   OR EXISTS (SELECT 1 FROM digital_entitlement d WHERE d.release_id = pe.release_id))) AS im_besitz " +
	"FROM plan_entry pe " +
	"LEFT JOIN release r ON r.id = pe.release_id " +
	"LEFT JOIN game g ON g.id = COALESCE(pe.game_id, r.game_id) " +
	"LEFT JOIN play_status ps ON ps.release_id = pe.release_id ";

/**
 * Naechste freie Position am Ende der offenen To-Do-Liste (Stufe 12). Nur
 * To-Do ist manuell geordnet; alle anderen Arten tragen NULL, und NULL
 * sortiert hinter jeder Position - so bleibt der Bestand aus der Triage
 * ohne Datenmigration bedienbar, die erste Umsortierung vergibt Positionen.
 */
export const POSITION_ANS_ENDE =
	"(SELECT COALESCE(MAX(position), 0) + 1 FROM plan_entry WHERE kind = 'todo' AND status = 'offen')";

/**
 * Absichten (Abschnitt 5): Wunschliste, To-Do, Backlog und Kaufliste in einer
 * Tabelle. Stufe 10 bedient die Wunschliste; die Methoden sind fuer alle vier
 * Arten geschrieben, damit die spaeteren Stufen denselben Weg nehmen.
 *
 * Sortierung und Filter (Favorit, Kritikerwertung, Plattform) liegen in der
 * Route: Die Listen sind klein, und die Regeln aendern sich oefter als das
 * Schema. Seit Migration 0013 gibt es keine Prioritaet und keinen Rang mehr.
 */
export class PlanRepository {
	constructor(private readonly db: D1Database) {}

	/**
	 * Alle Eintraege einer Art, ohne Blaetterung: Die Listen sind klein (die
	 * Wunschliste nach dem Import rund 350 Zeilen), und die Sortierung nach
	 * Rang passiert erst in der Route. Der Zugriff laeuft ueber idx_plan_offen.
	 */
	async liste(kind: PlanArt, status: PlanStatus | "alle"): Promise<PlanZeile[]> {
		const sql =
			PLAN_AUSWAHL +
			"WHERE pe.kind = ?" +
			(status === "alle" ? "" : " AND pe.status = ?") +
			" ORDER BY pe.position IS NULL, pe.position, pe.id";
		const abfrage = status === "alle" ? this.db.prepare(sql).bind(kind) : this.db.prepare(sql).bind(kind, status);
		const { results } = await abfrage.all<PlanZeile>();
		return results;
	}

	async eintrag(id: number): Promise<PlanZeile | null> {
		return this.db.prepare(PLAN_AUSWAHL + "WHERE pe.id = ?").bind(id).first<PlanZeile>();
	}

	/**
	 * Offene Eintraege zu einem Spiel - am Spiel selbst oder an einem seiner
	 * Releases. Zwei Index-Lookups (idx_plan_game, idx_plan_release).
	 */
	async offeneFuerSpiel(gameId: number): Promise<PlanZeile[]> {
		const { results } = await this.db
			.prepare(
				PLAN_AUSWAHL +
					"WHERE pe.status = 'offen' AND (pe.game_id = ? " +
					"OR pe.release_id IN (SELECT id FROM release WHERE game_id = ?)) ORDER BY pe.id",
			)
			.bind(gameId, gameId)
			.all<PlanZeile>();
		return results;
	}

	/**
	 * Duplikatpruefung nach der Regel aus Abschnitt 5: Ein offener Eintrag am
	 * Spiel und einer an einem seiner Releases sind zwei verschiedene
	 * Aussagen. Nur genau dasselbe Ziel derselben Art zaehlt als Duplikat.
	 * Freitext wird nicht geprueft - er hat kein Ziel, das sich vergleichen liesse.
	 */
	async offenerEintrag(kind: PlanArt, ziel: PlanZiel): Promise<number | null> {
		if (ziel.titleRaw !== undefined) return null;
		const spalte = ziel.releaseId !== undefined ? "release_id" : "game_id";
		const r = await this.db
			.prepare(`SELECT id FROM plan_entry WHERE kind = ? AND status = 'offen' AND ${spalte} = ?`)
			.bind(kind, ziel.releaseId ?? ziel.gameId)
			.first<{ id: number }>();
		return r?.id ?? null;
	}

	/**
	 * Anlegen. To-Do haengt ans Ende der Liste (POSITION_ANS_ENDE). Ein Status
	 * beim Anlegen ist fuer "nicht vorgesehen" da: Ein abgelehnter
	 * Backlog-Kandidat ist ein verworfener Eintrag, der die View ausblendet
	 * (Migration 0014) - dieselbe Form wie eine verworfene Luecke (5.3).
	 */
	async anlegen(
		kind: PlanArt,
		ziel: PlanZiel,
		origin: PlanHerkunft,
		felder: Pick<PlanFelder, "isFavorite" | "note" | "status"> = {},
	): Promise<number> {
		const status = felder.status ?? "offen";
		const r = await this.db
			.prepare(
				"INSERT INTO plan_entry (kind, release_id, game_id, title_raw, is_favorite, note, origin, status, resolved_at, position) " +
					"VALUES (?, ?, ?, ?, ?, ?, ?, ?, " +
					(status === "offen" ? "NULL" : "datetime('now')") +
					", " +
					(kind === "todo" && status === "offen" ? POSITION_ANS_ENDE : "NULL") +
					") RETURNING id",
			)
			.bind(
				kind,
				ziel.releaseId ?? null,
				ziel.gameId ?? null,
				ziel.titleRaw ?? null,
				felder.isFavorite ? 1 : 0,
				felder.note ?? null,
				origin,
				status,
			)
			.first<{ id: number }>();
		if (!r) throw new Error("Eintrag konnte nicht angelegt werden.");
		return r.id;
	}

	/**
	 * Nur die uebergebenen Felder aendern. Ein Statuswechsel setzt resolved_at:
	 * auf jetzt bei erledigt/verworfen, auf NULL zurueck bei offen - ein
	 * Sinneswandel ist ein Feld-Update, kein Neuanlegen (5.3).
	 *
	 * Position (Stufe 12): Wer auf To-Do kommt oder dort wieder geoeffnet
	 * wird, haengt ans Ende, sofern er keine Position hat; wer To-Do
	 * verlaesst, verliert sie.
	 */
	async aendern(id: number, felder: PlanFelder): Promise<boolean> {
		const keys = (Object.keys(felder) as Array<keyof PlanFelder>).filter((k) => felder[k] !== undefined);
		if (keys.length === 0) return (await this.eintrag(id)) !== null;

		const setzungen = keys.map((k) => `${SPALTEN[k]} = ?`);
		if (felder.status !== undefined) {
			setzungen.push(felder.status === "offen" ? "resolved_at = NULL" : "resolved_at = datetime('now')");
		}
		const werte: unknown[] = keys.map((k) => wert(k, felder));
		if (felder.kind !== undefined && felder.kind !== "todo") {
			setzungen.push("position = NULL");
		} else if (felder.kind === "todo") {
			setzungen.push(`position = COALESCE(position, ${POSITION_ANS_ENDE})`);
		} else if (felder.status === "offen") {
			// `kind` in der SET-Klausel ist der alte Wert der Zeile - hier bleibt er, weil kind nicht im Koerper ist.
			setzungen.push(`position = CASE WHEN kind = 'todo' THEN COALESCE(position, ${POSITION_ANS_ENDE}) ELSE position END`);
		}
		const ergebnis = await this.db
			.prepare(`UPDATE plan_entry SET ${setzungen.join(", ")} WHERE id = ?`)
			.bind(...werte, id)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	/**
	 * Manuelle Reihenfolge (PUT /api/plans/reorder, Stufe 12): Die genannten
	 * Ids bekommen die Positionen 1..n. Jede Id muss ein offener Eintrag der
	 * Art sein, sonst null - die Oberflaeche schickt immer die ganze Liste,
	 * eine fremde Id ist ein Fehler, kein Sonderfall. Nicht genannte
	 * Eintraege behalten ihre Position.
	 */
	async neuOrdnen(kind: PlanArt, ids: number[]): Promise<number | null> {
		if (ids.length === 0) return 0;
		const platzhalter = ids.map(() => "?").join(", ");
		const { results } = await this.db
			.prepare(`SELECT id FROM plan_entry WHERE kind = ? AND status = 'offen' AND id IN (${platzhalter})`)
			.bind(kind, ...ids)
			.all<{ id: number }>();
		if (results.length !== ids.length) return null;

		const update = this.db.prepare("UPDATE plan_entry SET position = ? WHERE id = ?");
		await this.db.batch(ids.map((id, i) => update.bind(i + 1, id)));
		return ids.length;
	}

	/** Abgelehnte Kandidaten: verworfene Backlog-Eintraege, ein Index-Lookup (idx_plan_offen). */
	async abgelehnteKandidaten(): Promise<number> {
		const r = await this.db
			.prepare("SELECT COUNT(*) AS n FROM plan_entry WHERE kind = 'backlog' AND status = 'verworfen'")
			.first<{ n: number }>();
		return r?.n ?? 0;
	}

	/**
	 * Offene Eintraege der genannten Arten am Ziel (Stufe 15): am Release
	 * und am Spiel - "das Spiel" als Wunsch ist erfuellt, sobald eine Fassung
	 * im Regal steht. `gameId` darf fehlen, dann zaehlt das Spiel des
	 * Releases. Zwei Index-Lookups (idx_plan_release, idx_plan_game).
	 */
	async offeneAmZiel(
		kinds: readonly PlanArt[],
		ziel: { releaseId: number | null; gameId?: number | null },
	): Promise<PlanZeile[]> {
		let gameId = ziel.gameId ?? null;
		if (kinds.length === 0 || (ziel.releaseId === null && gameId === null)) return [];
		if (gameId === null) {
			// Vorab aufloesen statt im OR: Mit einer Unterabfrage im OR-Zweig nimmt SQLite idx_plan_offen
			// und liest alle offenen Eintraege der Arten (gemessen in test/lesekosten.spec.ts).
			const r = await this.db.prepare("SELECT game_id FROM release WHERE id = ?").bind(ziel.releaseId).first<{ game_id: number }>();
			gameId = r?.game_id ?? null;
		}
		const platzhalter = kinds.map(() => "?").join(", ");
		// Art und Status stehen in den Unterabfragen: Als aeussere Bedingung liessen
		// sie SQLite auf idx_plan_offen ausweichen und alle offenen Eintraege der
		// Arten lesen; so bleiben es zwei Index-Lookups (test/lesekosten.spec.ts).
		const treffer = `SELECT id FROM plan_entry WHERE %s = ? AND status = 'offen' AND kind IN (${platzhalter})`;
		const { results } = await this.db
			.prepare(
				PLAN_AUSWAHL +
					`WHERE pe.id IN (${treffer.replace("%s", "release_id")} UNION ${treffer.replace("%s", "game_id")}) ORDER BY pe.id`,
			)
			.bind(ziel.releaseId, ...kinds, gameId, ...kinds)
			.all<PlanZeile>();
		return results;
	}

	/** Mehrere Eintraege auf einmal erledigen; gibt die Anzahl der geaenderten Zeilen zurueck. */
	async erledigen(ids: number[]): Promise<number> {
		if (ids.length === 0) return 0;
		const update = this.db.prepare(
			"UPDATE plan_entry SET status = 'erledigt', resolved_at = datetime('now') WHERE id = ? AND status = 'offen'",
		);
		const ergebnisse = await this.db.batch(ids.map((id) => update.bind(id)));
		return ergebnisse.reduce((n, e) => n + (e.meta.changes ?? 0), 0);
	}

	/** Kandidaten fuer die Kaufliste aus v_kaufkandidaten (Migration 0018): Luecken zuerst, dann Wuensche. */
	async kaufKandidaten(): Promise<KaufKandidatZeile[]> {
		const { results } = await this.db
			.prepare(
				"SELECT quelle, plan_id, release_id, game_id, title, platform, cover_url, critic_score, is_favorite, " +
					"bester_gebrauchtpreis_cents FROM v_kaufkandidaten ORDER BY quelle, title, platform",
			)
			.all<KaufKandidatZeile>();
		return results;
	}

	/** Vorgemerkte Titel, die noch erscheinen, aus v_erscheint_bald (Use Case 11). */
	async erscheintBald(): Promise<ErscheintBaldZeile[]> {
		const { results } = await this.db
			.prepare(
				"SELECT game_id, title, cover_url, release_date, release_id, platform, plan_id, kind, is_favorite FROM v_erscheint_bald",
			)
			.all<ErscheintBaldZeile>();
		return results;
	}

	/** Kandidaten fuer den Backlog aus v_backlog_kandidaten (Migration 0014). */
	async backlogKandidaten(): Promise<KandidatZeile[]> {
		const { results } = await this.db
			.prepare(
				"SELECT game_id, title, cover_url, critic_score, release_id, platform " +
					"FROM v_backlog_kandidaten ORDER BY title, platform",
			)
			.all<KandidatZeile>();
		return results;
	}

	/**
	 * Ziel eines Eintrags umhaengen - vom Spiel an ein Release oder zurueck,
	 * wenn der Nutzer die Plattform nachpflegt (Nachbesserung Stufe 11).
	 */
	async zielSetzen(id: number, ziel: PlanZiel): Promise<boolean> {
		const ergebnis = await this.db
			.prepare("UPDATE plan_entry SET release_id = ?, game_id = ?, title_raw = ? WHERE id = ?")
			.bind(ziel.releaseId ?? null, ziel.gameId ?? null, ziel.titleRaw ?? null, id)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	async loeschen(id: number): Promise<boolean> {
		const ergebnis = await this.db.prepare("DELETE FROM plan_entry WHERE id = ?").bind(id).run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}
}
