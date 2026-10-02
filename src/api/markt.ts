import { Hono } from "hono";
import type { AppEnv } from "../types";
import { marktSchritt } from "../sync/markt";
import { meldungFuer } from "../ebay/client";

/**
 * Gebrauchtpreise und Disc-Nachweis aus eBay (Abschnitt 7.3, Stufe 20).
 *
 * Eigene Datei und nicht in `psn.ts`, obwohl der Pfad in dieselbe Familie
 * gehoert: Mit Sony hat der Schritt nichts zu tun.
 *
 * Der Knopf ist kein Luxus, sondern die Regel aus CLAUDE.md: Ergebnisse
 * einer Messung werden nie per Skript eingetragen - fehlt der Weg in der
 * Oberflaeche, wird er gebaut. Geschrieben wird ausschliesslich ueber
 * denselben Pfad wie im Cron.
 */
export const marktRoutes = new Hono<AppEnv>()
	/**
	 * Eine Portion holen: zehn Releases, zwanzig Fremdanfragen. Die
	 * Oberflaeche ruft nach, solange `weiter` gesetzt ist - bei rund 370
	 * betroffenen Releases sind das 37 Aufrufe.
	 *
	 * 503 nur auf dieser Route, wenn die Zugangsdaten fehlen: Die uebrige
	 * Anwendung laeuft ohne eBay weiter (15.3).
	 */
	.post("/markt", async (c) => {
		if (!c.var.ebay.konfiguriert()) {
			return c.json({ fehler: "eBay-Zugangsdaten sind nicht hinterlegt." }, 503);
		}
		try {
			const ergebnis = await marktSchritt(c.var.repos, c.var.ebay);
			return c.json(ergebnis, ergebnis.status === "fehler" ? 502 : 200);
		} catch (fehler) {
			// Nur eigene Texte, kein Fremdtext - er koennte ein Geheimnis zitieren.
			return c.json({ fehler: meldungFuer(fehler) }, 502);
		}
	})

	/** Wie weit der Bestand gefragt ist - fuer die Einstellungen. */
	.get("/markt", async (c) => {
		const stand = await c.var.repos.markt.stand();
		return c.json({ zugangsdaten: c.var.ebay.konfiguriert(), ...stand });
	});
