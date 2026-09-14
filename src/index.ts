import { Hono } from "hono";
import { deviationRoutes } from "./api/deviations";
import { backupRoutes, exportRoutes } from "./api/export";
import { digitalEntitlementRoutes, physicalCopyRoutes } from "./api/ownership";
import { igdbRoutes, unmatchedRoutes } from "./api/igdb";
import { planRoutes } from "./api/plans";
import { psnRoutes } from "./api/psn";
import { releaseRoutes } from "./api/releases";
import { reviewRoutes } from "./api/review";
import { settingsRoutes } from "./api/settings";
import { trophyRoutes } from "./api/trophies";
import { gameRoutes, zuordnungRoutes } from "./api/zuordnung";
import { createRepositories } from "./db";
import { erstelleIgdbClient, zugangAus, type IgdbClient } from "./igdb/client";
import { erstellePsnClient, type PsnClient } from "./psn/client";
import type { AppEnv } from "./types";

/**
 * Baut die Anwendung.
 *
 * PSN- und IGDB-Client werden hereingereicht, damit Tests sie ersetzen
 * koennen - kein Test darf eine externe Schnittstelle tatsaechlich aufrufen.
 *
 * Der IGDB-Client lebt je Worker-Instanz, nicht je Anfrage: Er haelt das
 * Twitch-Token im Speicher (Abschnitt 7.6).
 */
export function createApp(
	psnFactory: () => PsnClient = () => erstellePsnClient(),
	igdbFactory: (env: Env) => IgdbClient = igdbJeInstanz(),
) {
	const app = new Hono<AppEnv>();

	// Abhaengigkeiten je Anfrage bereitstellen. Route-Handler greifen ueber
	// c.var zu und sehen D1 nie direkt.
	app.use("/api/*", async (c, next) => {
		if (!c.env.NPSSO_KEY) {
			return c.json({ fehler: "NPSSO_KEY ist nicht gesetzt." }, 500);
		}
		c.set("repos", createRepositories(c.env.DB, c.env.NPSSO_KEY));
		c.set("psn", psnFactory());
		c.set("igdb", igdbFactory(c.env));
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
	app.route("/api/igdb", igdbRoutes);
	app.route("/api/unmatched", unmatchedRoutes);
	app.route("/api/trophies", trophyRoutes);
	app.route("/api/zuordnung", zuordnungRoutes);
	app.route("/api/games", gameRoutes);
	app.route("/api/releases", releaseRoutes);
	app.route("/api/plans", planRoutes);
	app.route("/api/deviations", deviationRoutes);
	app.route("/api/review", reviewRoutes);
	app.route("/api/export", exportRoutes);
	app.route("/api/backup", backupRoutes);
	app.route("/api/physical-copies", physicalCopyRoutes);
	app.route("/api/digital-entitlements", digitalEntitlementRoutes);
	app.route("/api", psnRoutes);

	return app;
}

/**
 * Ein IGDB-Client je Worker-Instanz. Fehlen die Zugangsdaten, entsteht ein
 * Client ohne Zugang - die IGDB-Routen antworten dann mit 503, alles
 * andere laeuft weiter. Anders als bei NPSSO_KEY bricht die Middleware
 * nicht ab: IGDB ist Komfort, nicht Grundlage.
 */
function igdbJeInstanz(): (env: Env) => IgdbClient {
	let client: IgdbClient | null = null;
	return (env) => {
		if (!client) client = erstelleIgdbClient(zugangAus(env));
		return client;
	};
}

export default createApp();
