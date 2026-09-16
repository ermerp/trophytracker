export const ZUSTAENDE = ["neu", "sehr gut", "gut", "akzeptabel"] as const;
export type Zustand = (typeof ZUSTAENDE)[number];

export const DIGITALE_QUELLEN = ["kauf", "plus", "trial", "sonstiges"] as const;
export type DigitaleQuelle = (typeof DIGITALE_QUELLEN)[number];

export type PhysicalCopyFelder = {
	ean?: string | null;
	condition?: Zustand | null;
	hasManual?: boolean;
	purchaseDate?: string | null;
	purchasePriceCents?: number | null;
	notes?: string | null;
};

export type PhysicalCopyZeile = {
	id: number;
	release_id: number;
	ean: string | null;
	condition: Zustand | null;
	has_manual: number;
	purchase_date: string | null;
	purchase_price_cents: number | null;
	notes: string | null;
	created_at: string;
};

export type DigitalEntitlementZeile = {
	id: number;
	release_id: number;
	source: DigitaleQuelle;
	acquired_at: string | null;
};

/** Spaltenname je Feld - die einzige Stelle, an der Feldnamen zu SQL werden. */
const SPALTEN: Record<keyof PhysicalCopyFelder, string> = {
	ean: "ean",
	condition: "condition",
	hasManual: "has_manual",
	purchaseDate: "purchase_date",
	purchasePriceCents: "purchase_price_cents",
	notes: "notes",
};

function wert(feld: keyof PhysicalCopyFelder, felder: PhysicalCopyFelder): unknown {
	if (feld === "hasManual") return felder.hasManual ? 1 : 0;
	return felder[feld] ?? null;
}

/**
 * Besitz: physische Exemplare und digitale Berechtigungen.
 *
 * Besitz ist eine eigene Achse neben Fortschritt und Absicht (Abschnitt 1).
 * Nichts hier liest oder schreibt trophy_progress oder play_status.
 */
export class OwnershipRepository {
	constructor(private readonly db: D1Database) {}

	async releaseExistiert(releaseId: number): Promise<boolean> {
		const r = await this.db
			.prepare("SELECT 1 AS x FROM release WHERE id = ?")
			.bind(releaseId)
			.first();
		return r !== null;
	}

	/** Exemplare und Berechtigungen aller Releases eines Spiels. */
	async copiesForGame(gameId: number): Promise<{
		exemplare: PhysicalCopyZeile[];
		digital: DigitalEntitlementZeile[];
	}> {
		const [p, d] = await this.db.batch([
			this.db
				.prepare(
					"SELECT id, release_id, ean, condition, has_manual, purchase_date, " +
						"purchase_price_cents, notes, created_at FROM physical_copy " +
						"WHERE release_id IN (SELECT id FROM release WHERE game_id = ?) ORDER BY id",
				)
				.bind(gameId),
			this.db
				.prepare(
					"SELECT id, release_id, source, acquired_at FROM digital_entitlement " +
						"WHERE release_id IN (SELECT id FROM release WHERE game_id = ?) ORDER BY id",
				)
				.bind(gameId),
		]);
		return {
			exemplare: p.results as PhysicalCopyZeile[],
			digital: d.results as DigitalEntitlementZeile[],
		};
	}

	/**
	 * Legt ein physisches Exemplar an.
	 *
	 * Ein Exemplar haengt an einem konkreten Release - die Disc existiert also
	 * nachweislich. Deshalb wandert physical_release_status im selben Batch
	 * von 'unbekannt' auf 'ja'. Nur von 'unbekannt': ein 'nein' des Nutzers
	 * oder ein bereits gesetztes 'ja' (etwa aus dem Feed) bleibt unangetastet.
	 *
	 * physical_release_region bleibt NULL. Der Besitz belegt die Existenz der
	 * Disc, nicht ihre Region; ein geratenes 'PAL' wuerde den Feed-Abgleich in
	 * Stufe 20 irrefuehren.
	 */
	async addPhysicalCopy(
		releaseId: number,
		felder: PhysicalCopyFelder = {},
	): Promise<{ id: number; physischStatusGesetzt: boolean }> {
		const [eingefuegt, status] = await this.db.batch([
			this.db
				.prepare(
					"INSERT INTO physical_copy (release_id, ean, condition, has_manual, " +
						"purchase_date, purchase_price_cents, notes) VALUES (?, ?, ?, ?, ?, ?, ?) " +
						"RETURNING id",
				)
				.bind(
					releaseId,
					felder.ean ?? null,
					felder.condition ?? null,
					felder.hasManual ? 1 : 0,
					felder.purchaseDate ?? null,
					felder.purchasePriceCents ?? null,
					felder.notes ?? null,
				),
			this.db
				.prepare(
					"UPDATE release SET physical_release_status = 'ja', physical_source = 'manuell', " +
						"physical_checked_at = datetime('now') " +
						"WHERE id = ? AND physical_release_status = 'unbekannt'",
				)
				.bind(releaseId),
		]);

		const id = (eingefuegt.results[0] as { id: number } | undefined)?.id;
		if (id === undefined) throw new Error("Exemplar konnte nicht angelegt werden.");
		return { id, physischStatusGesetzt: (status.meta.changes ?? 0) > 0 };
	}

	/** Nur die uebergebenen Felder aendern. Spaltennamen kommen aus SPALTEN, nie aus der Eingabe. */
	async updatePhysicalCopy(id: number, felder: PhysicalCopyFelder): Promise<boolean> {
		const keys = (Object.keys(felder) as Array<keyof PhysicalCopyFelder>).filter(
			(k) => felder[k] !== undefined,
		);
		if (keys.length === 0) return this.physicalCopyExistiert(id);

		const setzungen = keys.map((k) => `${SPALTEN[k]} = ?`).join(", ");
		const ergebnis = await this.db
			.prepare(`UPDATE physical_copy SET ${setzungen} WHERE id = ?`)
			.bind(...keys.map((k) => wert(k, felder)), id)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	private async physicalCopyExistiert(id: number): Promise<boolean> {
		const r = await this.db.prepare("SELECT 1 AS x FROM physical_copy WHERE id = ?").bind(id).first();
		return r !== null;
	}

	/**
	 * Loescht ein Exemplar. physical_release_status bleibt, wie er ist: Dass
	 * ein Exemplar weg ist, sagt nichts darueber, ob es die Disc gibt.
	 */
	async deletePhysicalCopy(id: number): Promise<boolean> {
		const ergebnis = await this.db.prepare("DELETE FROM physical_copy WHERE id = ?").bind(id).run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}

	async listPhysicalCopies(
		limit: number,
		offset: number,
	): Promise<{ zeilen: Array<PhysicalCopyZeile & { title: string; platform: string }>; gesamt: number }> {
		const gesamt = await this.db
			.prepare("SELECT COUNT(*) AS n FROM physical_copy")
			.first<{ n: number }>();
		const { results } = await this.db
			.prepare(
				"SELECT p.id, p.release_id, p.ean, p.condition, p.has_manual, p.purchase_date, " +
					"p.purchase_price_cents, p.notes, p.created_at, g.title, r.platform " +
					"FROM physical_copy p JOIN release r ON r.id = p.release_id " +
					"JOIN game g ON g.id = r.game_id ORDER BY g.sort_title, r.platform, p.id " +
					"LIMIT ? OFFSET ?",
			)
			.bind(limit, offset)
			.all<PhysicalCopyZeile & { title: string; platform: string }>();
		return { zeilen: results, gesamt: gesamt?.n ?? 0 };
	}

	/** Gibt null zurueck, wenn dieselbe Quelle am Release schon eingetragen ist. */
	async addDigitalEntitlement(
		releaseId: number,
		source: DigitaleQuelle,
		acquiredAt: string | null = null,
	): Promise<{ id: number } | null> {
		const r = await this.db
			.prepare(
				"INSERT OR IGNORE INTO digital_entitlement (release_id, source, acquired_at) " +
					"VALUES (?, ?, ?) RETURNING id",
			)
			.bind(releaseId, source, acquiredAt)
			.first<{ id: number }>();
		return r ?? null;
	}

	async deleteDigitalEntitlement(id: number): Promise<boolean> {
		const ergebnis = await this.db
			.prepare("DELETE FROM digital_entitlement WHERE id = ?")
			.bind(id)
			.run();
		return (ergebnis.meta.changes ?? 0) > 0;
	}
}
