import { Hono } from "hono";
import type { SpielDetail } from "../db/games";
import type { KandidatZeile } from "../db/igdb";
import type { PlanArt } from "../db/plan";
import { heuteIso, metadatenAus, normalisiereTrefferliste, ordneKandidaten, type IgdbKandidat } from "../domain/igdb";
import { istErlaubtePlattform, plattformenAus, titelSchluessel } from "../domain/titel";
import { IgdbKonfigError } from "../igdb/client";
import { igdbAbgleichSchritt, igdbAuffrischSchritt, igdbPhysischSchritt, kandidatenSuchen, meldungFuer } from "../sync/igdb";
import { zielAusIgdbId, type PlattformWahl } from "../sync/plan-ziel";
import type { AppEnv } from "../types";
import { eintragAntwort } from "./plans";

/**
 * Abschnitt 12: IGDB-Suche, Abgleich und Pruefansicht (7.6).
 *
 * Ohne Zugangsdaten antworten nur die Routen mit 503, die IGDB tatsaechlich
 * anfragen. Zaehlung, Pruefansicht, Ablehnen und Loesen arbeiten allein auf
 * der Datenbank - die Anwendung bleibt ohne IGDB benutzbar.
 */

function kandidatAntwort(k: IgdbKandidat) {
	return {
		igdbId: k.igdbId,
		name: k.name,
		slug: k.slug,
		cover: k.coverUrl,
		erscheinungsdatum: k.releaseDate,
		plattformen: k.plattformen,
		typ: k.typ,
		kritik: k.criticScore === null ? null : { wert: k.criticScore, anzahl: k.criticScoreCount },
	};
}

function kandidatZeileAntwort(z: KandidatZeile) {
	return {
		igdbId: z.igdb_id,
		name: z.name,
		slug: z.slug,
		cover: z.cover_url,
		erscheinungsdatum: z.release_date,
		plattformen: z.platforms ? z.platforms.split(",") : [],
		typ: z.game_type,
		kritik: z.critic_score === null ? null : { wert: z.critic_score, anzahl: z.critic_score_count },
	};
}

/** Zustand der IGDB-Verknuepfung eines Spiels, fuer das Spieldetail. */
export function igdbAntwort(spiel: SpielDetail["spiel"]) {
	return {
		id: spiel.igdb_id,
		slug: spiel.igdb_slug,
		quelle: spiel.igdb_matched_source,
		verknuepftAm: spiel.igdb_matched_at,
		aktualisiertAm: spiel.igdb_synced_at,
		gesuchtAm: spiel.igdb_checked_at,
		abgelehntAm: spiel.igdb_declined_at,
	};
}

/** Kritikerwertung mit Herkunft - oder null, nie 0 (Darstellungsregel in Abschnitt 13). */
export function kritikAntwort(spiel: SpielDetail["spiel"]) {
	if (spiel.critic_score === null) return null;
	return {
		wert: spiel.critic_score,
		anzahl: spiel.critic_score_count,
		quelle: spiel.critic_source,
		standVom: spiel.critic_updated_at,
	};
}

function ohneZugang(c: { json: (o: unknown, s: 503) => Response }) {
	return c.json({ fehler: "IGDB-Zugangsdaten sind nicht hinterlegt." }, 503);
}

export const igdbRoutes = new Hono<AppEnv>()
	/**
	 * Eingebaute Suche fuer Spieldetail, Pruefansicht und spaeter den Import
	 * (8.2). Dieselben Rueckfaelle und dieselbe Reihenfolge wie im Abgleich;
	 * `plattformen=PS4,PS5` zieht passende Kandidaten nach vorn.
	 */
	.get("/search", async (c) => {
		if (!c.var.igdb.konfiguriert()) return ohneZugang(c);
		const q = (c.req.query("q") ?? "").trim();
		if (q === "") return c.json({ treffer: [], weg: "keiner" });
		const plattformen = plattformenAus(c.req.query("plattformen") ?? "");
		try {
			const { kandidaten, begriff, weg } = await kandidatenSuchen(c.var.igdb, q);
			const treffer = ordneKandidaten(titelSchluessel(begriff), plattformen, kandidaten);
			return c.json({ treffer: treffer.map(kandidatAntwort), weg });
		} catch (fehler) {
			return c.json({ fehler: meldungFuer(fehler) }, 502);
		}
	})

	.get("/status", async (c) => {
		return c.json({
			zugangsdaten: c.var.igdb.konfiguriert(),
			...(await c.var.repos.igdb.zaehlung()),
			...(await c.var.repos.igdb.discZaehlung()),
		});
	})

	/** Pruefansicht: Spiele ohne eindeutigen Treffer, mit Kandidaten. */
	.get("/offen", async (c) => {
		const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));
		const offset = Math.max(0, Number(c.req.query("offset")) || 0);
		const { spiele, kandidaten, gesamt } = await c.var.repos.igdb.offen(limit, offset);

		const jeSpiel = new Map<number, KandidatZeile[]>();
		for (const k of kandidaten) {
			const liste = jeSpiel.get(k.game_id);
			if (liste) liste.push(k);
			else jeSpiel.set(k.game_id, [k]);
		}

		return c.json({
			gesamt,
			limit,
			offset,
			spiele: spiele.map((s) => ({
				id: s.id,
				titel: s.title,
				plattformen: s.plattformen ? s.plattformen.split(",") : [],
				bild: s.icon_url,
				gesuchtAm: s.igdb_checked_at,
				kandidaten: (jeSpiel.get(s.id) ?? []).map(kandidatZeileAntwort),
			})),
		});
	})

	/** Ein Schritt des Abgleichs; die Oberflaeche ruft, solange `weiter` gilt. */
	.post("/abgleich", async (c) => {
		if (!c.var.igdb.konfiguriert()) return ohneZugang(c);
		const ergebnis = await igdbAbgleichSchritt(c.var.repos, c.var.igdb);
		return c.json(ergebnis, ergebnis.status === "fehler" ? 502 : 200);
	})

	/**
	 * Alle Spiele zur Pruefung zurueck in den Abgleich - nach einer besseren
	 * Suchregel, damit die gespeicherten Kandidaten nicht veralten. Fasst
	 * weder Verknuepfungen noch Ablehnungen an.
	 */
	.post("/erneut-suchen", async (c) => {
		const zurueckgesetzt = await c.var.repos.igdb.offeneZuruecksetzen();
		return c.json({ zurueckgesetzt });
	})

	/**
	 * Vorweg hebt jeder Schritt angekuendigte Spiele mit verstrichenem Datum
	 * auf `erschienen` (8.4, Stufe 15) - bis der Cron in Stufe 18 das
	 * taeglich tut. `erschienen` nennt die Anzahl.
	 */
	.post("/auffrischen", async (c) => {
		if (!c.var.igdb.konfiguriert()) return ohneZugang(c);
		const erschienen = await c.var.repos.games.erschieneneFreigeben();
		const ergebnis = await igdbAuffrischSchritt(c.var.repos, c.var.igdb);
		return c.json({ ...ergebnis, erschienen }, ergebnis.status === "fehler" ? 502 : 200);
	})

	/**
	 * Disc-Fassung aus IGDB (7.6, Stufe 14): ein Schritt, 50 Spiele in einer
	 * Anfrage; die Oberflaeche ruft, solange `weiter` gilt.
	 */
	.post("/physisch", async (c) => {
		if (!c.var.igdb.konfiguriert()) return ohneZugang(c);
		const ergebnis = await igdbPhysischSchritt(c.var.repos, c.var.igdb);
		return c.json(ergebnis, ergebnis.status === "fehler" ? 502 : 200);
	});

function spielId(c: { req: { param: (n: "id") => string } }): number | null {
	const id = Number(c.req.param("id"));
	return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Abschnitt 12: /api/unmatched. Quelle `spiel` seit Stufe 9, `plan_*` und
 * die Liste aus v_ohne_igdb seit Stufe 11.
 */
export const unmatchedRoutes = new Hono<AppEnv>()
	/** Ansicht "Ohne Zuordnung" (8.3): v_ohne_igdb, abgelehnte nur mit `abgelehnte=1`. */
	.get("/", async (c) => {
		const zeilen = await c.var.repos.igdb.ohneZuordnung(c.req.query("abgelehnte") === "1");
		return c.json({
			eintraege: zeilen.map((z) => ({
				quelle: z.quelle,
				id: z.ref_id,
				titel: z.title,
				zustand: z.zustand,
				art: z.quelle.startsWith("plan_") ? z.quelle.slice(5) : null,
			})),
		});
	})

	/**
	 * Freitext-Eintrag einem IGDB-Treffer zuordnen (Stufe 11): Spiel
	 * wiederverwenden oder anlegen, Plattform "auto" (neueste), dann das Ziel
	 * umhaengen und title_raw leeren. Ein offener Eintrag derselben Art am
	 * Ziel ist ein Duplikat (409).
	 */
	.post("/:quelle{plan_(wunsch|todo|backlog|kauf)}/:id/link", async (c) => {
		const id = spielId(c);
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!c.var.igdb.konfiguriert()) return ohneZugang(c);
		const art = c.req.param("quelle").slice(5) as PlanArt;

		let koerper: unknown;
		try {
			koerper = await c.req.json();
		} catch {
			return c.json({ fehler: "Ungültiges JSON." }, 400);
		}
		const igdbId = Number((koerper as { igdbId?: unknown })?.igdbId);
		if (!Number.isInteger(igdbId) || igdbId <= 0) {
			return c.json({ fehler: "Feld 'igdbId' fehlt oder ist ungültig." }, 400);
		}
		// Plattform wie bei POST /api/plans: fehlt oder "auto" → die neueste, "" → ohne.
		const roh = (koerper as { plattform?: unknown }).plattform;
		let wahl: PlattformWahl = "auto";
		if (roh === null || roh === "") wahl = null;
		else if (typeof roh === "string" && roh !== "auto") {
			if (!istErlaubtePlattform(roh)) return c.json({ fehler: `Unbekannte Plattform: ${roh}` }, 400);
			wahl = roh;
		}

		const eintrag = await c.var.repos.plan.eintrag(id);
		if (!eintrag || eintrag.kind !== art) return c.json({ fehler: "Eintrag nicht gefunden." }, 404);
		if (eintrag.title_raw === null || eintrag.game_id !== null || eintrag.release_id !== null) {
			return c.json({ fehler: "Der Eintrag ist schon einem Spiel zugeordnet." }, 409);
		}

		let ergebnis: Awaited<ReturnType<typeof zielAusIgdbId>>;
		try {
			ergebnis = await zielAusIgdbId(c.var.repos, c.var.igdb, igdbId, wahl);
		} catch (fehler) {
			if (fehler instanceof IgdbKonfigError) return ohneZugang(c);
			return c.json({ fehler: meldungFuer(fehler) }, 502);
		}
		if (!ergebnis) return c.json({ fehler: "IGDB kennt diesen Eintrag nicht." }, 404);

		const doppelt = await c.var.repos.plan.offenerEintrag(art, ergebnis.ziel);
		if (doppelt !== null && doppelt !== id) {
			return c.json({ fehler: "Dafür gibt es schon einen offenen Eintrag.", eintragId: doppelt }, 409);
		}
		await c.var.repos.plan.zielSetzen(id, ergebnis.ziel);
		const zeile = await c.var.repos.plan.eintrag(id);
		if (!zeile) return c.json({ fehler: "Eintrag nicht gefunden." }, 404);
		return c.json({ ...eintragAntwort(zeile), spielAngelegt: ergebnis.spielAngelegt });
	})

	.post("/spiel/:id/link", async (c) => {
		const id = spielId(c);
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!c.var.igdb.konfiguriert()) return ohneZugang(c);

		let koerper: unknown;
		try {
			koerper = await c.req.json();
		} catch {
			return c.json({ fehler: "Ungültiges JSON." }, 400);
		}
		const igdbId = Number((koerper as { igdbId?: unknown })?.igdbId);
		if (!Number.isInteger(igdbId) || igdbId <= 0) {
			return c.json({ fehler: "Feld 'igdbId' fehlt oder ist ungültig." }, 400);
		}

		if (!(await c.var.repos.igdb.spiel(id))) return c.json({ fehler: "Spiel nicht gefunden." }, 404);

		let treffer: IgdbKandidat | undefined;
		try {
			treffer = normalisiereTrefferliste(await c.var.igdb.nachIds([igdbId]))[0];
		} catch (fehler) {
			if (fehler instanceof IgdbKonfigError) return ohneZugang(c);
			return c.json({ fehler: meldungFuer(fehler) }, 502);
		}
		if (!treffer) return c.json({ fehler: "IGDB kennt diesen Eintrag nicht." }, 404);

		await c.var.repos.igdb.verknuepfen(id, metadatenAus(treffer, heuteIso()), "manuell");
		return c.json({ id, igdb: kandidatAntwort(treffer) });
	})

	.delete("/spiel/:id/link", async (c) => {
		const id = spielId(c);
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!(await c.var.repos.igdb.verknuepfungLoesen(id))) {
			return c.json({ fehler: "Spiel nicht gefunden oder nicht verknüpft." }, 404);
		}
		return c.json({ id, geloest: true });
	})

	/** "Gibt es bei IGDB nicht" - eine gespeicherte Entscheidung. */
	.post("/spiel/:id/ablehnen", async (c) => {
		const id = spielId(c);
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!(await c.var.repos.igdb.ablehnen(id))) {
			return c.json({ fehler: "Spiel nicht gefunden oder bereits verknüpft." }, 404);
		}
		return c.json({ id, abgelehnt: true });
	})

	/** Ablehnung zuruecknehmen; der naechste Abgleich sucht erneut. */
	.post("/spiel/:id/suchen", async (c) => {
		const id = spielId(c);
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!(await c.var.repos.igdb.erneutSuchen(id))) {
			return c.json({ fehler: "Spiel nicht gefunden oder bereits verknüpft." }, 404);
		}
		return c.json({ id, freigegeben: true });
	});
