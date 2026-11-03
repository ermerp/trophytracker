import { Hono } from "hono";
import type { AppEnv } from "../types";

/**
 * Preisalarm (Stufe 20g, Abschnitt 16.2): die Meldungen hinter der Glocke.
 *
 * Geschrieben werden sie in den Preis-Routen der Abendlaeufe, hier nur
 * gelesen und quittiert. Quittiert wird ueber den Haken, nicht durch den
 * Sprung ins Spieldetail (Entscheidung des Nutzers vom 30.10.2026).
 */
export const preisalarmRoutes = new Hono<AppEnv>()
	.get("/", async (c) => c.json({ alarme: await c.var.repos.preisalarm.offene() }))

	.post("/:id/quittieren", async (c) => {
		const id = Number(c.req.param("id"));
		if (!Number.isInteger(id) || id <= 0) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!(await c.var.repos.preisalarm.quittieren(id))) {
			return c.json({ fehler: "Keine offene Meldung mit dieser Id." }, 404);
		}
		return c.json({ id });
	});
