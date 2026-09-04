import { Hono } from "hono";
import { parseWeights, WeightsError } from "../domain/weights";
import type { AppEnv } from "../types";

/**
 * Abschnitt 12: GET und PUT /api/settings/weights.
 * Eingehaengt unter /api/settings.
 */
export const settingsRoutes = new Hono<AppEnv>()
	.get("/weights", async (c) => {
		return c.json(await c.var.repos.settings.getWeights());
	})
	.put("/weights", async (c) => {
		let eingabe: unknown;
		try {
			eingabe = await c.req.json();
		} catch {
			return c.json({ fehler: "Ungültiges JSON." }, 400);
		}

		try {
			const gewichte = parseWeights(eingabe);
			await c.var.repos.settings.setWeights(gewichte);
			return c.json(gewichte);
		} catch (fehler) {
			if (fehler instanceof WeightsError) {
				return c.json({ fehler: fehler.message }, 400);
			}
			throw fehler;
		}
	});
