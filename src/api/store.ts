import { Hono } from "hono";
import { meldungFuer } from "../psn/store";
import { storeSchritt } from "../sync/store";
import type { AppEnv } from "../types";

/**
 * PSN Store-Preise (Abschnitt 7.4, Stufe 21).
 *
 * Eigene Datei neben `markt.ts`: dieselbe Familie, andere Quelle. **Keine
 * Zugangsdaten und deshalb kein 503-Pfad** - der Store antwortet ohne
 * Anmeldung, und ein abgelaufenes NPSSO betrifft ihn nicht.
 *
 * Der Knopf ist kein Luxus, sondern die Regel aus CLAUDE.md: Ergebnisse
 * einer Messung werden nie per Skript eingetragen - fehlt der Weg in der
 * Oberflaeche, wird er gebaut. Geschrieben wird ausschliesslich ueber
 * denselben Pfad wie im Cron.
 */
export const storeRoutes = new Hono<AppEnv>()
	/**
	 * Eine Portion holen: zehn Releases, hoechstens vierzig Fremdanfragen.
	 * Die Oberflaeche ruft nach, solange `weiter` gesetzt ist.
	 */
	.post("/store", async (c) => {
		try {
			const ergebnis = await storeSchritt(c.var.repos, c.var.store, c.var.igdb);
			return c.json(ergebnis, ergebnis.status === "fehler" ? 502 : 200);
		} catch (fehler) {
			// Nur eigene Texte, kein Fremdtext - er koennte ein Geheimnis zitieren.
			return c.json({ fehler: meldungFuer(fehler) }, 502);
		}
	})

	/** Wie weit der Zuschnitt gefragt ist - fuer die Einstellungen. */
	.get("/store", async (c) => {
		return c.json(await c.var.repos.store.stand());
	});
