import { Hono } from "hono";
import type { Kennzahlen, LetztesPlatinZeile, PlattformZeile } from "../db/stats";
import { ERLAUBTE_PLATTFORMEN } from "../domain/titel";
import { jahreStand, levelStand } from "../sync/trophaeen";
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
		 * Wann das Platin ERSPIELT wurde. Bis Stufe 19b stand hier "zuletzt
		 * gespielt", weil der Zeitpunkt nirgends stand (7.7); mit
		 * `trophy.earned_at` gibt es ihn, und die Ueberschrift darf jetzt
		 * sagen, was sie meint.
		 */
		erspieltAm: z.erspielt_am,
		/** Wie die Platin-Trophaee heisst - "Alles erreicht" und so weiter. */
		platinName: z.platin_name,
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

export const statsRoutes = new Hono<AppEnv>().get("/", async (c) => {
	/*
	 * Zwei Lesungen nebeneinander. Das Level kommt aus app_setting und kostet
	 * eine Zeile; die Kennzahlen sind ein eigener Batch. Netzwartezeit zaehlt
	 * nicht gegen die 10 ms (Abschnitt 2).
	 */
	const [k, level] = await Promise.all([c.var.repos.stats.kennzahlen(), levelStand(c.var.repos)]);

	return c.json({
		...antwort(k),
		/**
		 * Das Trophaeen-Level von Sony. `null`, solange der naechtliche Schritt
		 * es noch nicht geholt hat - dann zeigt die Oberflaeche es gar nicht,
		 * statt eine 0 zu erfinden (Abschnitt 3).
		 */
		level,
	});
});

/**
 * Trophaeen je Jahr (Stufe 19b) - eine EIGENE Route, nicht Teil von /api/stats.
 *
 * **Weil sie teuer ist, und zwar gemessen:** Die Auswertung muss jede
 * erspielte Trophaee ansehen, das sind 18 060 gelesene Zeilen bei 430 Listen.
 * Das Dashboard liest sonst 6 840 - die Zahl waere also die teuerste der
 * ganzen Seite, auf der ersten Seite nach jedem Start der App (Abschnitt 2).
 * Ein Indexhinweis aendert daran nichts (ebenfalls gemessen, 01.10.2026).
 *
 * Deshalb holt die Oberflaeche sie erst, wenn der Block aufgeklappt wird.
 * Gespeichert wird die Zahl nicht: Sie ist berechnet (5.2).
 */
export const jahreRoutes = new Hono<AppEnv>().get("/", async (c) => {
	const jahr = new Date().getUTCFullYear();
	const stand = await jahreStand(c.var.repos);

	// Vergangene Jahre aus dem Zwischenspeicher, das laufende live: Nur es
	// kann sich noch aendern (Vorschlag des Nutzers vom 01.10.2026). Fehlt der
	// Zwischenspeicher, wird einmal alles gerechnet - er ist eine
	// Beschleunigung, keine Quelle.
	const vergangene = stand
		? stand.jahre.filter((j) => j.jahr < jahr)
		: (await c.var.repos.trophaeen.jahre())
				.map((j) => ({ jahr: Number(j.jahr), anzahl: j.anzahl }))
				.filter((j) => j.jahr < jahr);

	const laufend = await c.var.repos.trophaeen.jahrAnzahl(jahr);

	// Jahre ohne Trophaee fehlen hier - die Oberflaeche fuellt die Luecken,
	// weil erst eine durchgehende Achse einen Verlauf zeigt.
	return c.json({
		jahre: laufend > 0 ? [...vergangene, { jahr, anzahl: laufend }] : vergangene,
		ausZwischenspeicher: stand !== null,
	});
});
