import { Hono } from "hono";
import {
	PLAN_ARTEN,
	PLAN_STATUS,
	type PlanArt,
	type PlanFelder,
	type PlanStatus,
	type PlanZeile,
	type PlanZiel,
} from "../db/plan";
import { heuteIso, metadatenAus, normalisiereTrefferliste, type IgdbKandidat } from "../domain/igdb";
import { rang } from "../domain/rang";
import type { Weights } from "../domain/weights";
import { IgdbKonfigError } from "../igdb/client";
import { meldungFuer } from "../sync/igdb";
import type { AppEnv } from "../types";
import { liesJson } from "./validierung";

/**
 * Absichten (Abschnitt 12): GET/POST/PATCH/DELETE /api/plans.
 *
 * Stufe 10 bedient die Wunschliste, die Routen kennen aber alle vier Arten.
 * PUT /api/plans/reorder (To-Do-Reihenfolge) kommt mit Stufe 12.
 *
 * Der Rang wird hier berechnet und nie gespeichert (5.2): Die Zeile bringt
 * die Bestandteile mit, die Gewichte kommen aus app_setting.
 */

const SORTIERUNGEN = ["rang", "titel", "angelegt"] as const;
type Sortierung = (typeof SORTIERUNGEN)[number];

type Koerper = Record<string, unknown>;

function ausWahl<T extends string>(wert: string | undefined, erlaubt: readonly T[]): T | undefined {
	return wert !== undefined && (erlaubt as readonly string[]).includes(wert) ? (wert as T) : undefined;
}

function idAus(roh: unknown): number | null {
	const id = Number(roh);
	return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Prueft die aenderbaren Felder. Nur Felder, die im Koerper vorkommen,
 * landen im Ergebnis, damit PATCH einzelne Felder aendern kann.
 */
function pruefeFelder(k: Koerper): { felder: PlanFelder } | { fehler: string } {
	const felder: PlanFelder = {};

	if ("prioritaet" in k) {
		if (typeof k.prioritaet !== "number" || !Number.isInteger(k.prioritaet) || k.prioritaet < 1 || k.prioritaet > 5) {
			return { fehler: "Priorität muss eine ganze Zahl von 1 bis 5 sein." };
		}
		felder.priority = k.prioritaet;
	}
	if ("favorit" in k) {
		if (typeof k.favorit !== "boolean") return { fehler: "Feld 'favorit' muss true oder false sein." };
		felder.isFavorite = k.favorit;
	}
	if ("notiz" in k) {
		if (k.notiz === null || k.notiz === "") felder.note = null;
		else if (typeof k.notiz === "string") felder.note = k.notiz.trim();
		else return { fehler: "Notiz muss Text sein." };
	}
	if ("status" in k) {
		const status = ausWahl(typeof k.status === "string" ? k.status : undefined, PLAN_STATUS);
		if (!status) return { fehler: `Status muss einer von ${PLAN_STATUS.join(", ")} sein.` };
		felder.status = status;
	}
	if ("art" in k) {
		const art = ausWahl(typeof k.art === "string" ? k.art : undefined, PLAN_ARTEN);
		if (!art) return { fehler: `Art muss eine von ${PLAN_ARTEN.join(", ")} sein.` };
		felder.kind = art;
	}
	return { felder };
}

/** Eintraege ohne Spiel haben keinen Rang (8.3) - null, nie 0. */
export function eintragAntwort(z: PlanZeile, gewichte: Weights) {
	return {
		id: z.id,
		art: z.kind,
		status: z.status,
		titel: z.titel,
		spielId: z.spiel_id,
		releaseId: z.release_id,
		plattform: z.platform,
		bild: z.cover_url,
		kritik: z.critic_score,
		erscheinungsdatum: z.release_date,
		releaseStatus: z.release_status,
		prioritaet: z.priority,
		favorit: z.is_favorite === 1,
		notiz: z.note,
		herkunft: z.origin,
		angelegtAm: z.created_at,
		erledigtAm: z.resolved_at,
		rang:
			z.spiel_id === null
				? null
				: rang({ kritik: z.critic_score, prioritaet: z.priority, favorit: z.is_favorite === 1 }, gewichte),
	};
}

type Eintrag = ReturnType<typeof eintragAntwort>;

const vergleicher: Record<Sortierung, (a: Eintrag, b: Eintrag) => number> = {
	// Hoechster Rang zuerst; ohne Rang ans Ende, dort nach Titel.
	rang: (a, b) =>
		(b.rang ?? -1) - (a.rang ?? -1) || a.titel.localeCompare(b.titel, "de"),
	titel: (a, b) => a.titel.localeCompare(b.titel, "de") || a.id - b.id,
	// Juengste zuerst.
	angelegt: (a, b) => b.angelegtAm.localeCompare(a.angelegtAm) || b.id - a.id,
};

function ohneZugang(c: { json: (o: unknown, s: 503) => Response }) {
	return c.json({ fehler: "IGDB-Zugangsdaten sind nicht hinterlegt." }, 503);
}

export const planRoutes = new Hono<AppEnv>()
	/**
	 * Unbekannte Filterwerte werden ignoriert wie bei /api/games; nur `kind`
	 * ist Pflicht, weil die Listen fachlich verschieden sind.
	 */
	.get("/", async (c) => {
		const kind = ausWahl(c.req.query("kind"), PLAN_ARTEN);
		if (!kind) return c.json({ fehler: `Parameter 'kind' muss einer von ${PLAN_ARTEN.join(", ")} sein.` }, 400);
		const status: PlanStatus | "alle" = c.req.query("status") === "alle" ? "alle" : "offen";
		const sortierung = ausWahl(c.req.query("sort"), SORTIERUNGEN) ?? "rang";
		const nurFavoriten = c.req.query("favorit") === "1";

		const gewichte = await c.var.repos.settings.getWeights();
		const zeilen = await c.var.repos.plan.liste(kind, status);
		const eintraege = zeilen
			.map((z) => eintragAntwort(z, gewichte))
			.filter((e) => !nurFavoriten || e.favorit)
			.sort(vergleicher[sortierung]);

		return c.json({ gewichte, sortierung, eintraege });
	})

	/**
	 * Anlegen. Genau eine Quelle: spielId, releaseId, igdbId oder titel.
	 *
	 * igdbId legt bei Bedarf ein Spiel ohne Release an (Abschnitt 3) - oder
	 * verwendet das Spiel mit dieser IGDB-Id wieder. titel ist der Freitext
	 * ohne Zuordnung, den die Oberflaeche nur auf ausdrueckliche Anweisung
	 * schickt (8.2).
	 *
	 * Duplikate (Abschnitt 5): Ein offener Eintrag am Spiel und einer an einem
	 * seiner Releases sind zwei Aussagen und blockieren sich nicht; nur
	 * genau dasselbe Ziel derselben Art antwortet mit 409.
	 */
	.post("/", async (c) => {
		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);

		const art = ausWahl(typeof k.art === "string" ? k.art : undefined, PLAN_ARTEN);
		if (!art) return c.json({ fehler: `Feld 'art' muss eine von ${PLAN_ARTEN.join(", ")} sein.` }, 400);

		const quellen = (["spielId", "releaseId", "igdbId", "titel"] as const).filter(
			(q) => k[q] !== undefined && k[q] !== null && k[q] !== "",
		);
		if (quellen.length !== 1) {
			return c.json({ fehler: "Genau eines der Felder spielId, releaseId, igdbId oder titel angeben." }, 400);
		}

		const geprueft = pruefeFelder(k);
		if ("fehler" in geprueft) return c.json({ fehler: geprueft.fehler }, 400);
		const { priority, isFavorite, note } = geprueft.felder;

		let ziel: PlanZiel;
		let igdb: IgdbKandidat | null = null;
		switch (quellen[0]) {
			case "titel": {
				if (typeof k.titel !== "string" || k.titel.trim() === "") {
					return c.json({ fehler: "Feld 'titel' muss Text sein." }, 400);
				}
				ziel = { titleRaw: k.titel.trim() };
				break;
			}
			case "releaseId": {
				const releaseId = idAus(k.releaseId);
				if (releaseId === null) return c.json({ fehler: "Feld 'releaseId' ist ungültig." }, 400);
				if (!(await c.var.repos.ownership.releaseExistiert(releaseId))) {
					return c.json({ fehler: "Release nicht gefunden." }, 404);
				}
				ziel = { releaseId };
				break;
			}
			case "spielId": {
				const gameId = idAus(k.spielId);
				if (gameId === null) return c.json({ fehler: "Feld 'spielId' ist ungültig." }, 400);
				if (!(await c.var.repos.games.spielExistiert(gameId))) {
					return c.json({ fehler: "Spiel nicht gefunden." }, 404);
				}
				ziel = { gameId };
				break;
			}
			case "igdbId": {
				const igdbId = idAus(k.igdbId);
				if (igdbId === null) return c.json({ fehler: "Feld 'igdbId' ist ungültig." }, 400);
				if (!c.var.igdb.konfiguriert()) return ohneZugang(c);

				let vorhanden = await c.var.repos.games.spielNachIgdbId(igdbId);
				if (vorhanden === null) {
					try {
						igdb = normalisiereTrefferliste(await c.var.igdb.nachIds([igdbId]))[0] ?? null;
					} catch (fehler) {
						if (fehler instanceof IgdbKonfigError) return ohneZugang(c);
						return c.json({ fehler: meldungFuer(fehler) }, 502);
					}
					if (!igdb) return c.json({ fehler: "IGDB kennt diesen Eintrag nicht." }, 404);
					vorhanden = await c.var.repos.games.spielOhneRelease(igdb.name);
					await c.var.repos.igdb.verknuepfen(vorhanden, metadatenAus(igdb, heuteIso()), "manuell");
				}
				ziel = { gameId: vorhanden };
				break;
			}
		}

		const doppelt = await c.var.repos.plan.offenerEintrag(art, ziel);
		if (doppelt !== null) {
			return c.json({ fehler: "Dafür gibt es schon einen offenen Eintrag.", eintragId: doppelt }, 409);
		}

		const id = await c.var.repos.plan.anlegen(art, ziel, "manuell", { priority, isFavorite, note });
		const zeile = await c.var.repos.plan.eintrag(id);
		if (!zeile) throw new Error("Eintrag nach dem Anlegen nicht gefunden.");
		return c.json(
			{ ...eintragAntwort(zeile, await c.var.repos.settings.getWeights()), spielAngelegt: igdb !== null },
			201,
		);
	})

	.patch("/:id", async (c) => {
		const id = idAus(c.req.param("id"));
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);
		const geprueft = pruefeFelder(k);
		if ("fehler" in geprueft) return c.json({ fehler: geprueft.fehler }, 400);

		if (!(await c.var.repos.plan.aendern(id, geprueft.felder))) {
			return c.json({ fehler: "Eintrag nicht gefunden." }, 404);
		}
		const zeile = await c.var.repos.plan.eintrag(id);
		if (!zeile) return c.json({ fehler: "Eintrag nicht gefunden." }, 404);
		return c.json({ ...eintragAntwort(zeile, await c.var.repos.settings.getWeights()), geaendert: true });
	})

	.delete("/:id", async (c) => {
		const id = idAus(c.req.param("id"));
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!(await c.var.repos.plan.loeschen(id))) return c.json({ fehler: "Eintrag nicht gefunden." }, 404);
		return c.json({ id, geloescht: true });
	});
