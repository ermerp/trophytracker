import { Hono } from "hono";
import { platinStand } from "../domain/normalize";
import type { TrophySortierung } from "../db/trophies";
import type { AppEnv } from "../types";

const SORTIERUNGEN: TrophySortierung[] = ["zuletzt", "fortschritt", "titel"];

/** Abschnitt 12: GET /api/trophies */
export const trophyRoutes = new Hono<AppEnv>().get("/", async (c) => {
	const roh = c.req.query();

	const limit = Math.min(200, Math.max(1, Number(roh.limit) || 50));
	const offset = Math.max(0, Number(roh.offset) || 0);
	const sortierung = SORTIERUNGEN.includes(roh.sortierung as TrophySortierung)
		? (roh.sortierung as TrophySortierung)
		: "zuletzt";

	const { zeilen, gesamt } = await c.var.repos.trophies.liste({
		limit,
		offset,
		sortierung,
		nurPlatin: roh.nurPlatin === "true",
	});

	return c.json({
		gesamt,
		limit,
		offset,
		sortierung,
		titel: zeilen.map((z) => ({
			npCommunicationId: z.np_communication_id,
			titel: z.title_name,
			plattform: z.platform,
			symbol: z.icon_url,
			fortschritt: z.progress_pct,
			// Dreiwertig: 93 von 431 Titeln haben gar keine Platin-Trophaee.
			// "offen" waere dort schlicht falsch (Abschnitt 4.1).
			platin: platinStand(z.defined_platinum, z.earned_platinum),
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
			zugeordnet: z.release_id !== null,
		})),
	});
});
