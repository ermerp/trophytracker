import { Hono } from "hono";
import type { AppEnv } from "../types";

/**
 * Abschnitt 12: GET /api/deviations - v_abweichungen.
 *
 * Trophaeen und Bewertung passen nicht zusammen. Kein Fehler, nur zur
 * Durchsicht: 'durchgespielt' bei 20 % ist ein gueltiger Zustand.
 */
export const deviationRoutes = new Hono<AppEnv>().get("/", async (c) => {
	const zeilen = await c.var.repos.playStatus.abweichungen();
	return c.json({
		gesamt: zeilen.length,
		abweichungen: zeilen.map((z) => ({
			spielId: z.game_id,
			releaseId: z.release_id,
			titel: z.title,
			plattform: z.platform,
			fortschritt: z.progress_pct,
			status: z.status,
		})),
	});
});
