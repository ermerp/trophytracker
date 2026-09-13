import { Hono } from "hono";
import type { PlayStatusZeile } from "../db/play-status";
import { PLAY_STATUS, istPlayStatus } from "../domain/play-status";
import { istErlaubtePlattform } from "../domain/titel";
import type { AppEnv } from "../types";
import { liesJson, pruefeDatum } from "./validierung";

export function bewertungAntwort(z: PlayStatusZeile) {
	return {
		releaseId: z.release_id,
		status: z.status,
		begonnenAm: z.started_at,
		beendetAm: z.finished_at,
		bewertung: z.rating,
		notiz: z.notes,
		geaendertAm: z.updated_at,
	};
}

/**
 * Releases von Hand anlegen und loeschen, eigene Bewertung setzen
 * (Abschnitt 12).
 *
 * PATCH /:id (physical_release_status, psn_product_id) kommt in Stufe 14.
 */
export const releaseRoutes = new Hono<AppEnv>()
	/**
	 * Use Case 2: eigene Bewertung. Die einzige Stelle, an der der Nutzer
	 * play_status schreibt - und sie gilt zugleich als Durchsicht (8.1).
	 */
	.put("/:id/play-status", async (c) => {
		const id = Number(c.req.param("id"));
		if (!Number.isInteger(id) || id <= 0) return c.json({ fehler: "Ungültige Id." }, 400);

		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);

		if (!istPlayStatus(k.status)) {
			return c.json({ fehler: `Status muss einer von ${PLAY_STATUS.join(", ")} sein.` }, 400);
		}
		const begonnen = pruefeDatum(k, "begonnenAm");
		if ("fehler" in begonnen) return c.json({ fehler: begonnen.fehler }, 400);
		const beendet = pruefeDatum(k, "beendetAm");
		if ("fehler" in beendet) return c.json({ fehler: beendet.fehler }, 400);

		let rating: number | null = null;
		if (k.bewertung !== undefined && k.bewertung !== null && k.bewertung !== "") {
			if (typeof k.bewertung !== "number" || !Number.isInteger(k.bewertung) || k.bewertung < 1 || k.bewertung > 10) {
				return c.json({ fehler: "Bewertung muss eine ganze Zahl von 1 bis 10 sein." }, 400);
			}
			rating = k.bewertung;
		}
		let notes: string | null = null;
		if (k.notiz !== undefined && k.notiz !== null && k.notiz !== "") {
			if (typeof k.notiz !== "string") return c.json({ fehler: "Notiz muss Text sein." }, 400);
			notes = k.notiz.trim() || null;
		}

		const zeile = await c.var.repos.playStatus.setzen(id, {
			status: k.status,
			startedAt: begonnen.wert,
			finishedAt: beendet.wert,
			rating,
			notes,
		});
		if (!zeile) return c.json({ fehler: "Release nicht gefunden." }, 404);
		return c.json(bewertungAntwort(zeile));
	})

	.post("/", async (c) => {
		let koerper: unknown;
		try {
			koerper = await c.req.json();
		} catch {
			return c.json({ fehler: "Ungültiges JSON." }, 400);
		}
		const k = koerper as { spielId?: unknown; plattform?: unknown };

		const spielId = Number(k?.spielId);
		if (!Number.isInteger(spielId) || spielId <= 0) {
			return c.json({ fehler: "Feld 'spielId' fehlt oder ist ungültig." }, 400);
		}
		if (typeof k?.plattform !== "string" || !istErlaubtePlattform(k.plattform)) {
			return c.json({ fehler: `Unbekannte Plattform: ${String(k?.plattform)}` }, 400);
		}

		const ergebnis = await c.var.repos.games.releaseAnlegen(spielId, k.plattform);
		if (ergebnis === "spiel_fehlt") return c.json({ fehler: "Spiel nicht gefunden." }, 404);
		if (ergebnis === "belegt") {
			return c.json({ fehler: "Dieses Spiel hat auf der Plattform bereits ein Release." }, 409);
		}
		return c.json({ releaseId: ergebnis.releaseId, spielId, plattform: k.plattform }, 201);
	})

	.delete("/:id", async (c) => {
		const id = Number(c.req.param("id"));
		if (!Number.isInteger(id) || id <= 0) return c.json({ fehler: "Ungültige Id." }, 400);

		const ergebnis = await c.var.repos.games.releaseLoeschen(id);
		if (!ergebnis) return c.json({ fehler: "Release nicht gefunden." }, 404);
		return c.json({ id, geloescht: true, ...ergebnis });
	});
