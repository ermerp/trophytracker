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
import { IgdbKonfigError } from "../igdb/client";
import { meldungFuer } from "../sync/igdb";
import { zielAmSpiel, zielAusIgdbId, type PlattformWahl } from "../sync/plan-ziel";
import { ERLAUBTE_PLATTFORMEN, istErlaubtePlattform } from "../domain/titel";
import type { AppEnv } from "../types";
import { liesJson } from "./validierung";

/**
 * Absichten (Abschnitt 12): GET/POST/PATCH/DELETE /api/plans.
 *
 * Stufe 10 bedient die Wunschliste, die Routen kennen aber alle vier Arten.
 * PUT /api/plans/reorder (To-Do-Reihenfolge) kommt mit Stufe 12.
 *
 * Sortierung und Filter laufen hier, nicht in SQL (5.2): Favoriten zuerst,
 * dann Kritikerwertung ist der Standard; Prioritaet und Rang gibt es seit
 * Migration 0013 nicht mehr (Entscheidung des Nutzers vom 15.09.2026).
 */

const SORTIERUNGEN = ["favorit", "wertung", "titel", "angelegt", "release"] as const;
type Sortierung = (typeof SORTIERUNGEN)[number];

/** Plattformfilter: die vier Plattformen und "ohne" fuer Eintraege am Spiel oder Freitext. */
const PLATTFORM_FILTER = [...ERLAUBTE_PLATTFORMEN, "ohne"] as const;

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

/**
 * Plattformwahl aus dem Koerper: fehlt → "auto" (neueste des Treffers bzw.
 * der Releases), "" oder null → ohne, sonst eine der vier. undefined im
 * Ergebnis heisst "Feld nicht im Koerper".
 */
function pruefePlattform(k: Koerper): { wahl: PlattformWahl | undefined } | { fehler: string } {
	if (!("plattform" in k)) return { wahl: undefined };
	if (k.plattform === null || k.plattform === "") return { wahl: null };
	if (k.plattform === "auto") return { wahl: "auto" };
	if (typeof k.plattform === "string" && istErlaubtePlattform(k.plattform)) return { wahl: k.plattform };
	return { fehler: `Unbekannte Plattform: ${String(k.plattform)}` };
}

export function eintragAntwort(z: PlanZeile) {
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
		favorit: z.is_favorite === 1,
		notiz: z.note,
		herkunft: z.origin,
		angelegtAm: z.created_at,
		erledigtAm: z.resolved_at,
	};
}

type Eintrag = ReturnType<typeof eintragAntwort>;

const nachTitel = (a: Eintrag, b: Eintrag) => a.titel.localeCompare(b.titel, "de") || a.id - b.id;
// Hoechste Wertung zuerst; ohne Wertung ans Ende, dort nach Titel.
const nachWertung = (a: Eintrag, b: Eintrag) => (b.kritik ?? -1) - (a.kritik ?? -1) || nachTitel(a, b);

const vergleicher: Record<Sortierung, (a: Eintrag, b: Eintrag) => number> = {
	favorit: (a, b) => Number(b.favorit) - Number(a.favorit) || nachWertung(a, b),
	wertung: nachWertung,
	titel: nachTitel,
	// Juengste zuerst.
	angelegt: (a, b) => b.angelegtAm.localeCompare(a.angelegtAm) || b.id - a.id,
	// Naechstes Erscheinungsdatum zuerst; ohne Datum ans Ende.
	release: (a, b) => (a.erscheinungsdatum ?? "9999").localeCompare(b.erscheinungsdatum ?? "9999") || nachTitel(a, b),
};

/** Plattformfilter aus `plattform=PS4,PS5,ohne`; leer heisst alle. */
function plattformFilter(roh: string | undefined): Set<string> {
	const werte = (roh ?? "").split(",").map((p) => p.trim().toUpperCase()).filter((p) => p !== "");
	return new Set(werte.map((p) => (p === "OHNE" ? "ohne" : p)).filter((p) => (PLATTFORM_FILTER as readonly string[]).includes(p)));
}

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
		const sortierung = ausWahl(c.req.query("sort"), SORTIERUNGEN) ?? "favorit";
		const nurFavoriten = c.req.query("favorit") === "1";
		const plattformen = plattformFilter(c.req.query("plattform"));

		const zeilen = await c.var.repos.plan.liste(kind, status);
		const eintraege = zeilen
			.map((z) => eintragAntwort(z))
			.filter((e) => !nurFavoriten || e.favorit)
			.filter((e) => plattformen.size === 0 || plattformen.has(e.plattform ?? "ohne"))
			.sort(vergleicher[sortierung]);

		return c.json({ sortierung, plattformen: [...plattformen], eintraege });
	})

	/**
	 * Anlegen. Genau eine Quelle: spielId, releaseId, igdbId oder titel.
	 *
	 * igdbId legt bei Bedarf ein Spiel an (Abschnitt 3) - oder verwendet das
	 * Spiel mit dieser IGDB-Id wieder. titel ist der Freitext ohne Zuordnung,
	 * den die Oberflaeche nur auf ausdrueckliche Anweisung schickt (8.2).
	 *
	 * Plattform (nur zu spielId und igdbId): fehlt sie oder ist "auto", wird
	 * die neueste der Releases beziehungsweise des IGDB-Eintrags genommen;
	 * "" heisst ausdruecklich ohne Plattform (Abschnitt 5).
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
		const { isFavorite, note } = geprueft.felder;

		const gepruefteWahl = pruefePlattform(k);
		if ("fehler" in gepruefteWahl) return c.json({ fehler: gepruefteWahl.fehler }, 400);
		if (gepruefteWahl.wahl !== undefined && (quellen[0] === "releaseId" || quellen[0] === "titel")) {
			return c.json({ fehler: "Eine Plattform passt nur zu spielId oder igdbId." }, 400);
		}
		const wahl: PlattformWahl = gepruefteWahl.wahl === undefined ? "auto" : gepruefteWahl.wahl;

		let ziel: PlanZiel;
		let spielAngelegt = false;
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
				ziel = await zielAmSpiel(c.var.repos, gameId, wahl);
				break;
			}
			case "igdbId": {
				const igdbId = idAus(k.igdbId);
				if (igdbId === null) return c.json({ fehler: "Feld 'igdbId' ist ungültig." }, 400);
				if (!c.var.igdb.konfiguriert()) return ohneZugang(c);

				let ergebnis: Awaited<ReturnType<typeof zielAusIgdbId>>;
				try {
					ergebnis = await zielAusIgdbId(c.var.repos, c.var.igdb, igdbId, wahl);
				} catch (fehler) {
					if (fehler instanceof IgdbKonfigError) return ohneZugang(c);
					return c.json({ fehler: meldungFuer(fehler) }, 502);
				}
				if (!ergebnis) return c.json({ fehler: "IGDB kennt diesen Eintrag nicht." }, 404);
				ziel = ergebnis.ziel;
				spielAngelegt = ergebnis.spielAngelegt;
				break;
			}
		}

		const doppelt = await c.var.repos.plan.offenerEintrag(art, ziel);
		if (doppelt !== null) {
			return c.json({ fehler: "Dafür gibt es schon einen offenen Eintrag.", eintragId: doppelt }, 409);
		}

		const id = await c.var.repos.plan.anlegen(art, ziel, "manuell", { isFavorite, note });
		const zeile = await c.var.repos.plan.eintrag(id);
		if (!zeile) throw new Error("Eintrag nach dem Anlegen nicht gefunden.");
		return c.json({ ...eintragAntwort(zeile), spielAngelegt }, 201);
	})

	/**
	 * Aendern. `plattform` haengt einen Eintrag mit Spiel um - an das Release
	 * der Plattform (entsteht bei Bedarf) oder mit "" zurueck ans Spiel; das
	 * Nachpflegen aus dem Filter "ohne Plattform". Freitext hat kein Spiel
	 * und deshalb keine Plattform.
	 */
	.patch("/:id", async (c) => {
		const id = idAus(c.req.param("id"));
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);
		const geprueft = pruefeFelder(k);
		if ("fehler" in geprueft) return c.json({ fehler: geprueft.fehler }, 400);
		const gepruefteWahl = pruefePlattform(k);
		if ("fehler" in gepruefteWahl) return c.json({ fehler: gepruefteWahl.fehler }, 400);

		const vorher = await c.var.repos.plan.eintrag(id);
		if (!vorher) return c.json({ fehler: "Eintrag nicht gefunden." }, 404);

		if (gepruefteWahl.wahl !== undefined) {
			if (vorher.spiel_id === null) return c.json({ fehler: "Freitext hat kein Spiel und deshalb keine Plattform." }, 400);
			const ziel = await zielAmSpiel(c.var.repos, vorher.spiel_id, gepruefteWahl.wahl);
			const doppelt = await c.var.repos.plan.offenerEintrag(vorher.kind, ziel);
			if (doppelt !== null && doppelt !== id) {
				return c.json({ fehler: "Dafür gibt es schon einen offenen Eintrag.", eintragId: doppelt }, 409);
			}
			await c.var.repos.plan.zielSetzen(id, ziel);
		}

		await c.var.repos.plan.aendern(id, geprueft.felder);
		const zeile = await c.var.repos.plan.eintrag(id);
		if (!zeile) return c.json({ fehler: "Eintrag nicht gefunden." }, 404);
		return c.json({ ...eintragAntwort(zeile), geaendert: true });
	})

	.delete("/:id", async (c) => {
		const id = idAus(c.req.param("id"));
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!(await c.var.repos.plan.loeschen(id))) return c.json({ fehler: "Eintrag nicht gefunden." }, 404);
		return c.json({ id, geloescht: true });
	});
