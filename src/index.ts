import { Hono } from "hono";
import { psnRoutes } from "./api/psn";
import { settingsRoutes } from "./api/settings";
import { createRepositories } from "./db";
import { erstellePsnClient, type PsnClient } from "./psn/client";
import type { AppEnv } from "./types";

/**
 * Baut die Anwendung.
 *
 * Der PSN-Client wird hereingereicht, damit Tests ihn ersetzen koennen -
 * kein Test darf die inoffizielle Schnittstelle tatsaechlich aufrufen.
 */
export function createApp(psnFactory: () => PsnClient = () => erstellePsnClient()) {
	const app = new Hono<AppEnv>();

	// Abhaengigkeiten je Anfrage bereitstellen. Route-Handler greifen ueber
	// c.var zu und sehen D1 nie direkt.
	app.use("/api/*", async (c, next) => {
		if (!c.env.NPSSO_KEY) {
			return c.json({ fehler: "NPSSO_KEY ist nicht gesetzt." }, 500);
		}
		c.set("repos", createRepositories(c.env.DB, c.env.NPSSO_KEY));
		c.set("psn", psnFactory());
		await next();
	});

	/**
	 * Health-Check. Fragt bewusst die Datenbank nicht ab: Der Endpunkt soll
	 * beantworten, ob der Worker läuft und Routing greift – nicht, ob D1
	 * erreichbar ist. Sonst verdeckt ein Datenbankproblem die Aussage über den
	 * Worker selbst.
	 */
	app.get("/api/health", (c) => c.json({ status: "ok", zeit: new Date().toISOString() }));

	app.route("/api/settings", settingsRoutes);
	app.route("/api", psnRoutes);

	return app;
}

export default createApp();
