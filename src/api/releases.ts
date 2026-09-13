import { Hono } from "hono";
import { istErlaubtePlattform } from "../domain/titel";
import type { AppEnv } from "../types";

/**
 * Releases von Hand anlegen und loeschen (Abschnitt 12).
 *
 * PATCH /:id (physical_release_status, psn_product_id) kommt in Stufe 14.
 */
export const releaseRoutes = new Hono<AppEnv>()
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
