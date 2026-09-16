import { Hono } from "hono";
import { beschreibeEreignis, istEreignisQuelle, type Ereignis } from "../domain/ereignis";
import type { AppEnv } from "../types";

/**
 * Aenderungsprotokoll (Abschnitt 8.5, Stufe 16): GET /api/events und
 * GET /api/games/:id/events.
 *
 * Nur lesend - geschrieben wird ausschliesslich in src/db/, im Batch der
 * jeweiligen Aenderung. Der Satz (`text`) entsteht hier zur Lesezeit aus
 * den gespeicherten Feldern und wird nie abgelegt.
 *
 * Seitenweise ueber `vor` (Keyset auf id), nicht ueber OFFSET: Die Tabelle
 * waechst unbegrenzt (Entscheidung des Nutzers vom 16.09.2026), und ein
 * OFFSET liest alle uebersprungenen Zeilen mit.
 */

export function ereignisAntwort(e: Ereignis) {
	return {
		id: e.id,
		zeitpunkt: e.occurred_at,
		quelle: e.source,
		spielId: e.game_id,
		releaseId: e.release_id,
		titel: e.label,
		art: e.kind,
		feld: e.field,
		alt: e.old_value,
		neu: e.new_value,
		detail: e.detail,
		text: beschreibeEreignis(e),
	};
}

/** `limit` (1..200, Standard 50) und `vor` (id, optional) aus der Query. */
export function seitenParameter(q: Record<string, string>, standard = 50): { limit: number; vor: number | null } {
	const vor = q.vor === undefined || q.vor === "" ? null : Number(q.vor);
	return {
		limit: Math.min(200, Math.max(1, Number(q.limit) || standard)),
		vor: vor !== null && Number.isInteger(vor) ? vor : null,
	};
}

export const eventRoutes = new Hono<AppEnv>().get("/", async (c) => {
	const q = c.req.query();
	const quelle = istEreignisQuelle(q.quelle) ? q.quelle : null;
	const { limit, vor } = seitenParameter(q);
	const { ereignisse, weiter } = await c.var.repos.events.liste({ quelle, limit, vor });
	return c.json({ quelle, limit, weiter, ereignisse: ereignisse.map(ereignisAntwort) });
});
