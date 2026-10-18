import { Hono } from "hono";
import type { BetriebRoh } from "../db/betrieb";
import { SCHLUESSEL_ERFOLG as SCHLUESSEL_SICHERUNG } from "../db/export";
import { urteile, zugangsende, type BetriebFakten } from "../domain/betrieb";
import { besitzStandAus, SCHLUESSEL_BESITZ } from "../sync/cron";
import type { AppEnv } from "../types";

/**
 * Betriebswarnungen (Stufe 18m, Abschnitt 16.2).
 *
 * Eine Route fuer alle Warnungen des Dashboards: Seit 18m kommen auch die
 * drei, die bis dahin das Frontend aus drei Antworten zusammensetzte
 * (abgelaufener Zugang, gescheiterter Nachtlauf, Sicherung), von hier - eine
 * Regel steht an genau einer Stelle (Entscheidung des Nutzers vom 18.10.2026).
 * Ein D1-Aufruf, ermittelt bei jedem Lesen, nichts gespeichert.
 */

/** Die Schluessel aus app_setting, die neben `cron_stand` gelesen werden. */
export const BETRIEB_SCHLUESSEL = [SCHLUESSEL_SICHERUNG, SCHLUESSEL_BESITZ] as const;

/** Aus den rohen Zeilen die Fakten der Regeln - ohne weitere Abfrage. */
export function betriebFakten(roh: BetriebRoh, jetzt: Date): BetriebFakten {
	return {
		jetzt,
		stand: roh.stand,
		zugang: roh.zugang,
		lebensdauerTage: roh.lebensdauerTage,
		syncLaeufe: roh.syncLaeufe.map((l) => ({ status: l.status, gestartetAm: l.started_at, meldung: l.error_message })),
		sicherungAm: roh.einstellungen.get(SCHLUESSEL_SICHERUNG) ?? null,
		kauflisteFehlerAm: besitzStandAus(roh.einstellungen.get(SCHLUESSEL_BESITZ) ?? null).fehlerAm ?? null,
	};
}

export const betriebRoutes = new Hono<AppEnv>().get("/warnungen", async (c) => {
	const jetzt = new Date();
	const roh = await c.var.repos.betrieb.fakten(BETRIEB_SCHLUESSEL);
	return c.json({
		warnungen: urteile(betriebFakten(roh, jetzt)),
		// Fuer die Einstellungen: dieselbe Rechnung, die die Warnung traegt.
		zugangsende: zugangsende(roh.zugang, roh.lebensdauerTage, jetzt),
	});
});
