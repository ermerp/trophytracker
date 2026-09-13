import { Hono } from "hono";
import { GRUND_TEXT, REVIEW_AKTIONEN, istReviewAktion } from "../domain/review";
import type { AppEnv } from "../types";
import { platinAus } from "./antwort";
import { liesJson } from "./validierung";

/**
 * Pruefliste (Abschnitt 12, Use Case 8).
 *
 * GET /queue liefert die offenen Eintraege in der Reihenfolge der View
 * (Grund-Rang, dann Fortschritt absteigend); die Oberflaeche holt einen je
 * Bildschirm. POST /:releaseId/decide speichert eine Entscheidung sofort.
 */
export const reviewRoutes = new Hono<AppEnv>()
	.get("/queue", async (c) => {
		const limit = Math.min(50, Math.max(1, Number(c.req.query("limit")) || 1));
		const offset = Math.max(0, Number(c.req.query("offset")) || 0);
		const [zeilen, gesamtOffen] = await Promise.all([
			c.var.repos.review.naechste(limit, offset),
			c.var.repos.review.anzahlOffen(),
		]);

		return c.json({
			gesamtOffen,
			limit,
			offset,
			eintraege: zeilen.map((z) => ({
				releaseId: z.release_id,
				spielId: z.game_id,
				titel: z.title,
				plattform: z.platform,
				grund: z.reason,
				grundText: GRUND_TEXT[z.reason],
				detail: z.detail,
				bild: z.cover_url ?? z.icon_url,
				fortschritt: z.progress_pct,
				platin: z.progress_pct === null ? null : platinAus(z.defined_platinum, z.earned_platinum),
				erspielt: {
					bronze: z.earned_bronze,
					silber: z.earned_silver,
					gold: z.earned_gold,
					platin: z.earned_platinum,
				},
				definiert: {
					bronze: z.defined_bronze,
					silber: z.defined_silver,
					gold: z.defined_gold,
					platin: z.defined_platinum,
				},
				zuletztGespielt: z.last_played_at,
				aktuellerStatus: z.aktueller_status,
				eingereihtAm: z.enqueued_at,
			})),
		});
	})

	.get("/progress", async (c) => c.json(await c.var.repos.review.fortschritt()))

	.post("/:releaseId/decide", async (c) => {
		const releaseId = Number(c.req.param("releaseId"));
		if (!Number.isInteger(releaseId) || releaseId <= 0) return c.json({ fehler: "Ungültige Id." }, 400);

		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);
		if (!istReviewAktion(k.aktion)) {
			return c.json({ fehler: `Aktion muss eine von ${REVIEW_AKTIONEN.join(", ")} sein.` }, 400);
		}

		const ergebnis = await c.var.repos.review.entscheiden(releaseId, k.aktion);
		if (!ergebnis) return c.json({ fehler: "Für dieses Release ist nichts offen." }, 404);

		return c.json({
			releaseId,
			aktion: k.aktion,
			...ergebnis,
			nochOffen: await c.var.repos.review.anzahlOffen(),
		});
	});
