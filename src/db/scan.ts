import type { Plattform } from "../domain/titel";
import { exemplarErgebnis, type OwnershipRepository } from "./ownership";
import type { PlanKurz, PlanRepository } from "./plan";

/**
 * Alle Spiele einer Huelle (Nachtrag f1h): die Releases, deren Disc diesen
 * Code traegt, und das Release des Mappings - zwei Index-Lookups
 * (idx_physical_copy_ean aus Migration 0042, Primaerschluessel von
 * ean_mapping) als UNION, kein OR. Das Mapping-Release steht vorn.
 * Exportiert fuer `test/lesekosten.spec.ts`.
 */
export const HUELLE_SQL =
	"SELECT r.id AS release_id, r.game_id, g.title, r.platform, g.cover_url, " +
	"(SELECT COUNT(*) FROM physical_copy p WHERE p.release_id = r.id) AS exemplare, " +
	"(r.id = (SELECT release_id FROM ean_mapping WHERE ean = ?1)) AS ist_mapping " +
	"FROM release r JOIN game g ON g.id = r.game_id " +
	"WHERE r.id IN (SELECT release_id FROM physical_copy WHERE ean = ?1 UNION SELECT release_id FROM ean_mapping WHERE ean = ?1) " +
	"ORDER BY ist_mapping DESC, g.sort_title, r.platform";

/**
 * Lage der Ziele eines Zuordnens, bevor etwas geschrieben wird (Nachtrag
 * f1h): je Release Spiel, Titel und ob schon eine Disc steht. Ueber den
 * Primaerschluessel und idx_physical_copy_release. Exportiert fuer
 * `test/lesekosten.spec.ts`.
 */
export const zielReleasesSql = (n: number) =>
	"SELECT r.id AS release_id, r.game_id, g.title, r.platform, g.cover_url, " +
	"EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = r.id) AS disc " +
	`FROM release r JOIN game g ON g.id = r.game_id WHERE r.id IN (${Array.from({ length: n }, () => "?").join(",")})`;

/**
 * Dasselbe fuer ein Ziel "Spiel + Plattform": das Release, das
 * `releaseFuerPlattform` nehmen wuerde (ohne Edition und Region, das
 * kleinste), oder keines - dann entsteht es erst beim Zuordnen. Ueber den
 * Primaerschluessel von game und idx_release_game.
 */
export const ZIEL_SPIEL_SQL =
	"SELECT g.id AS game_id, g.title, g.cover_url, " +
	"(SELECT r.id FROM release r WHERE r.game_id = g.id AND r.platform = ?2 AND r.edition IS NULL AND r.region IS NULL ORDER BY r.id LIMIT 1) AS release_id, " +
	"EXISTS (SELECT 1 FROM physical_copy p WHERE p.release_id = " +
	"(SELECT r.id FROM release r WHERE r.game_id = g.id AND r.platform = ?2 AND r.edition IS NULL AND r.region IS NULL ORDER BY r.id LIMIT 1)) AS disc " +
	"FROM game g WHERE g.id = ?1";

export type HuelleZeile = {
	release_id: number;
	game_id: number;
	title: string;
	platform: Plattform;
	cover_url: string | null;
	exemplare: number;
};

export type ZielZeile = {
	release_id: number | null;
	game_id: number;
	title: string;
	platform: Plattform;
	cover_url: string | null;
	disc: number;
};

/** Eine Disc, die `huelleErfassen` anlegt, mit den Absichten, die sie erledigt. */
export type HuellenDisc = { releaseId: number; erledigen: readonly PlanKurz[] };

/** Stufe 1 der Kette (9.2): der Code ist schon einem Release zugeordnet. */
export type MappingTreffer = {
	release_id: number;
	game_id: number;
	title: string;
	platform: Plattform;
	cover_url: string | null;
	/** Exemplare an diesem Release - "im Regal ×n" in der Oberflaeche. */
	exemplare: number;
};

/** Stufe 2 der Kette: ein Haendlerangebot kennt Titel und Plattform (ab Stufe 20 gefuellt). */
export type AngebotTreffer = {
	title_raw: string;
	platform_raw: string | null;
};

export type OffenerScan = {
	ean: string;
	scan_count: number;
	first_seen_at: string;
	last_seen_at: string;
	/** Titelvorschlag einer EAN-Quelle (Stufe 17b); null, solange keiner vorliegt. */
	title_raw: string | null;
	title_source: string | null;
	checked_at: string | null;
};

/**
 * Barcode-Erfassung (Abschnitt 9, Stufe 17): Zuordnungstabelle und offene
 * Scans. Die Disc selbst legt OwnershipRepository.addPhysicalCopy an -
 * mit dem Protokolleintrag; hier entsteht kein game_event, weil das Mapping
 * dieselbe Nutzerentscheidung ist wie das Exemplar und die offenen Scans
 * kein Spiel kennen.
 *
 * Beide Auflösungen sind Index-Lookups (ean ist Primaerschluessel,
 * idx_market_offer_ean); die Titelsuche der Stufe 3 laeuft ueber die
 * gemessene Abfrage von GET /api/games.
 */
export class ScanRepository {
	constructor(
		private readonly db: D1Database,
		private readonly ownership: OwnershipRepository,
		private readonly plan: PlanRepository,
	) {}

	/**
	 * Stufe 1 und 2 der Kette und - seit Nachtrag f1h - alle Spiele der
	 * Huelle, in einem Batch. Die Huelle ist bei einem unbekannten Code leer
	 * und kostet dann zwei leere Index-Lookups.
	 */
	async aufloesen(ean: string): Promise<{ mapping: MappingTreffer | null; angebot: AngebotTreffer | null; huelle: HuelleZeile[] }> {
		const [m, a, h] = await this.db.batch([
			this.db
				.prepare(
					"SELECT r.id AS release_id, r.game_id, g.title, r.platform, g.cover_url, " +
						"(SELECT COUNT(*) FROM physical_copy p WHERE p.release_id = r.id) AS exemplare " +
						"FROM ean_mapping e JOIN release r ON r.id = e.release_id JOIN game g ON g.id = r.game_id " +
						"WHERE e.ean = ?",
				)
				.bind(ean),
			this.db
				.prepare("SELECT title_raw, platform_raw FROM market_offer WHERE ean = ? ORDER BY id LIMIT 1")
				.bind(ean),
			this.db.prepare(HUELLE_SQL).bind(ean),
		]);
		return {
			mapping: (m.results[0] as MappingTreffer | undefined) ?? null,
			angebot: (a.results[0] as AngebotTreffer | undefined) ?? null,
			huelle: h.results as HuelleZeile[],
		};
	}

	/**
	 * Die Lage aller Ziele eines Zuordnens in EINEM Batch (Nachtrag f1h) -
	 * vor jedem Schreiben, damit ein `409` den ganzen Zug abbricht, bevor
	 * etwas entsteht. Ergebnis je Ziel in der Reihenfolge der Eingabe; `null`,
	 * wenn Release oder Spiel fehlen.
	 */
	async zielLage(
		ziele: ReadonlyArray<{ releaseId: number } | { spielId: number; plattform: Plattform }>,
	): Promise<Array<ZielZeile | null>> {
		const releaseIds = ziele.flatMap((z) => ("releaseId" in z ? [z.releaseId] : []));
		const spiele = ziele.flatMap((z) => ("spielId" in z ? [z] : []));
		const anweisungen: D1PreparedStatement[] = [];
		if (releaseIds.length > 0) anweisungen.push(this.db.prepare(zielReleasesSql(releaseIds.length)).bind(...releaseIds));
		for (const z of spiele) anweisungen.push(this.db.prepare(ZIEL_SPIEL_SQL).bind(z.spielId, z.plattform));
		const ergebnisse = anweisungen.length > 0 ? await this.db.batch(anweisungen) : [];
		const nachRelease = new Map(
			releaseIds.length > 0 ? (ergebnisse[0].results as ZielZeile[]).map((r) => [r.release_id, r] as const) : [],
		);
		let k = releaseIds.length > 0 ? 1 : 0;
		return ziele.map((z) => {
			if ("releaseId" in z) return nachRelease.get(z.releaseId) ?? null;
			const zeile = ergebnisse[k++].results[0] as Omit<ZielZeile, "platform"> | undefined;
			return zeile ? { ...zeile, platform: z.plattform } : null;
		});
	}

	/**
	 * Die Discs EINER Huelle in EINEM Batch (Nachtrag f1h): je Release die
	 * Disc mit Code und Protokoll (`exemplarAnweisungen`, mit Disc-Fassung
	 * `unbekannt -> ja`), dann je Release das Erledigen seiner Kauf- und
	 * Wunscheintraege mit Ereignis, zuletzt das Mapping auf `mappingRelease`
	 * und das Loeschen eines offenen Scans.
	 *
	 * Ein Batch ist eine Transaktion: Scheitert eine Anweisung, entsteht
	 * nichts davon - keine Disc ohne ihre erledigten Absichten, kein Mapping
	 * ohne Disc. Was davor geschrieben wurde, bleibt: ein Release, das fuer
	 * ein Ziel "Spiel + Plattform" erst angelegt werden musste
	 * (`releaseFuerPlattform`, mit eigenem Ereignis). Es steht dann ohne Disc
	 * da, und der naechste Versuch verwendet es wieder.
	 */
	async huelleErfassen(
		ean: string,
		discs: readonly HuellenDisc[],
		mappingRelease: number,
	): Promise<Array<{ releaseId: number; id: number; physischStatusGesetzt: boolean; erledigt: number }>> {
		const anweisungen: D1PreparedStatement[] = [];
		const ab: number[] = [];
		for (const d of discs) {
			ab.push(anweisungen.length);
			anweisungen.push(...this.ownership.exemplarAnweisungen(d.releaseId, { ean }, "scan"));
		}
		const erledigtAb: Array<{ ab: number; n: number }> = [];
		for (const d of discs) {
			const a = this.plan.erledigenAnweisungen(d.erledigen, "besitz");
			erledigtAb.push({ ab: anweisungen.length, n: a.length / 2 });
			anweisungen.push(...a);
		}
		anweisungen.push(...this.mappingAnweisungen(ean, mappingRelease, "manuell"));
		const ergebnisse = await this.db.batch(anweisungen);
		return discs.map((d, i) => {
			const e = erledigtAb[i];
			// Nur die UPDATEs zaehlen (jede zweite Anweisung), nicht die Protokollzeilen.
			let erledigt = 0;
			for (let j = 0; j < e.n; j++) erledigt += ergebnisse[e.ab + 2 * j + 1].meta.changes ?? 0;
			return { releaseId: d.releaseId, ...exemplarErgebnis(ergebnisse, ab[i]), erledigt };
		});
	}



	/**
	 * Code einem Release zuordnen. Ein vorhandenes Mapping wird ueberschrieben:
	 * Das ist die Korrektur einer Nutzerentscheidung durch den Nutzer, kein
	 * automatischer Prozess. Der offene Scan ist damit erledigt.
	 */
	async zuordnen(ean: string, releaseId: number, quelle: "manuell" | "feed" = "manuell"): Promise<void> {
		await this.db.batch(this.mappingAnweisungen(ean, releaseId, quelle));
	}

	private mappingAnweisungen(ean: string, releaseId: number, quelle: "manuell" | "feed"): D1PreparedStatement[] {
		return [
			this.db
				.prepare(
					"INSERT INTO ean_mapping (ean, release_id, source) VALUES (?, ?, ?) " +
						"ON CONFLICT(ean) DO UPDATE SET release_id = excluded.release_id, source = excluded.source",
				)
				.bind(ean, releaseId, quelle),
			this.db.prepare("DELETE FROM unresolved_scan WHERE ean = ?").bind(ean),
		];
	}

	/** Titel und Plattform eines Releases fuer die Antwort nach dem Zuordnen; null, wenn es fehlt. */
	async releaseKopf(releaseId: number): Promise<{ game_id: number; title: string; platform: Plattform } | null> {
		return this.db
			.prepare("SELECT r.game_id, g.title, r.platform FROM release r JOIN game g ON g.id = r.game_id WHERE r.id = ?")
			.bind(releaseId)
			.first<{ game_id: number; title: string; platform: Plattform }>();
	}


	async mappingLoeschen(ean: string): Promise<boolean> {
		const r = await this.db.prepare("DELETE FROM ean_mapping WHERE ean = ?").bind(ean).run();
		return (r.meta.changes ?? 0) > 0;
	}




}
