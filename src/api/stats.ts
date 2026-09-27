import { Hono } from "hono";
import type { Kennzahlen, LetztesPlatinZeile, PlattformZeile } from "../db/stats";
import { ERLAUBTE_PLATTFORMEN } from "../domain/titel";
import type { AppEnv } from "../types";

/**
 * Kennzahlen fuers Dashboard (Abschnitt 12, GET /api/stats; Stufe 19a).
 *
 * Eine Route, ein Batch, rein lesend. Was es schon gibt, holt die Oberflaeche
 * weiter dort, wo es liegt: den letzten Sync und den Zugang aus
 * /api/sync/status, Pruefliste und `unentschieden` aus /api/review/progress,
 * den Feed aus /api/events. Diese Route ergaenzt nur, was nirgends steht.
 *
 * Die Zahlen zaehlen dieselbe Sammlung wie /api/games: Releases, die nur
 * einen Wunsch tragen, bleiben aussen vor (Abschnitt 3 und 12). Sonst
 * naennte das Dashboard 489 Releases, wo die Sammlungsansicht 438 zeigt.
 */

/** null heisst unbekannt, nie 0 - die Summen koennen bei leerer Tabelle NULL sein. */
function zahl(wert: number | null | undefined): number {
	return wert ?? 0;
}

function plattformAntwort(z: PlattformZeile) {
	return {
		plattform: z.platform,
		releases: z.releases,
		spiele: z.spiele,
		mitListe: z.mit_liste,
		/** Dreiwertig: `platinMoeglich` zaehlt nur Listen, die ueberhaupt ein Platin kennen. */
		platin: z.platin,
		platinMoeglich: z.platin_moeglich,
		disc: z.disc,
		digital: z.digital,
	};
}

function letztesPlatinAntwort(z: LetztesPlatinZeile | null) {
	if (!z) return null;
	return {
		spielId: z.game_id,
		titel: z.title,
		bild: z.cover_url,
		plattform: z.platform,
		fortschritt: z.progress_pct,
		/**
		 * Wann zuletzt GESPIELT, nicht wann das Platin erspielt wurde - das
		 * weiss die Datenbank bis Stufe 19b nicht (7.7). Die Oberflaeche
		 * beschriftet es entsprechend.
		 */
		zuletztGespielt: z.last_played_at,
		bronze: z.earned_bronze,
		silber: z.earned_silver,
		gold: z.earned_gold,
		platin: z.earned_platinum,
	};
}

function antwort(k: Kennzahlen) {
	const t = k.trophaeen;
	const erspielt =
		zahl(t.erspielt_bronze) + zahl(t.erspielt_silber) + zahl(t.erspielt_gold) + zahl(t.erspielt_platin);
	const definiert =
		zahl(t.definiert_bronze) + zahl(t.definiert_silber) + zahl(t.definiert_gold) + zahl(t.definiert_platin);

	return {
		spiele: k.spiele,
		releases: k.releases,
		plattformen: ERLAUBTE_PLATTFORMEN.map((p) => plattformAntwort(k.plattformen[p])),
		status: k.status,
		trophaeen: {
			listen: t.listen,
			ohneZuordnung: t.ohne_zuordnung,
			erspielt,
			definiert,
			platinErspielt: zahl(t.platin_erspielt),
			platinMoeglich: zahl(t.platin_moeglich),
			/** Platin zuerst - die Wertigkeit von oben nach unten (Abschnitt 13). */
			stufen: [
				{ stufe: "platin", erspielt: zahl(t.erspielt_platin), definiert: zahl(t.definiert_platin) },
				{ stufe: "gold", erspielt: zahl(t.erspielt_gold), definiert: zahl(t.definiert_gold) },
				{ stufe: "silber", erspielt: zahl(t.erspielt_silber), definiert: zahl(t.definiert_silber) },
				{ stufe: "bronze", erspielt: zahl(t.erspielt_bronze), definiert: zahl(t.definiert_bronze) },
			],
		},
		listen: k.listen,
		letztesPlatin: letztesPlatinAntwort(k.letztesPlatin),
	};
}

export const statsRoutes = new Hono<AppEnv>().get("/", async (c) =>
	c.json(antwort(await c.var.repos.stats.kennzahlen())),
);
