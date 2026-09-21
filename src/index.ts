import { Hono } from "hono";
import { deviationRoutes } from "./api/deviations";
import { eventRoutes } from "./api/events";
import { backupRoutes, exportRoutes } from "./api/export";
import { digitalEntitlementRoutes, physicalCopyRoutes } from "./api/ownership";
import { igdbRoutes, unmatchedRoutes } from "./api/igdb";
import { importRoutes } from "./api/imports";
import { gapRoutes } from "./api/gaps";
import { backlogCandidateRoutes, planRoutes, purchaseCandidateRoutes, upcomingRoutes } from "./api/plans";
import { psnRoutes } from "./api/psn";
import { releaseRoutes } from "./api/releases";
import { reviewRoutes } from "./api/review";
import { scanRoutes } from "./api/scan";
import { trophyRoutes } from "./api/trophies";
import { gameRoutes, zuordnungRoutes } from "./api/zuordnung";
import { createRepositories } from "./db";
import { erstelleEbayClient, zugangAus as ebayZugangAus, type EbayClient } from "./ebay/client";
import { erstelleUpcitemdbClient, type UpcitemdbClient } from "./ean/upcitemdb";
import { erstelleIgdbClient, zugangAus, type IgdbClient } from "./igdb/client";
import { erstellePsnClient, type PsnClient } from "./psn/client";
import { cronLogzeile, cronSchritt } from "./sync/cron";
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
	ebayFactory: (env: Env) => EbayClient = ebayJeInstanz(),
	upcFactory: () => UpcitemdbClient = () => erstelleUpcitemdbClient(),
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
		c.set("ebay", ebayFactory(c.env));
		c.set("upc", upcFactory());
		await next();
	});

	/**
	 * Health-Check. Fragt bewusst die Datenbank nicht ab: Der Endpunkt soll
	 * beantworten, ob der Worker läuft und Routing greift – nicht, ob D1
	 * erreichbar ist. Sonst verdeckt ein Datenbankproblem die Aussage über den
	 * Worker selbst.
	 */
	app.get("/api/health", (c) => c.json({ status: "ok", zeit: new Date().toISOString() }));

	app.route("/api/igdb", igdbRoutes);
	app.route("/api/unmatched", unmatchedRoutes);
	app.route("/api/trophies", trophyRoutes);
	app.route("/api/zuordnung", zuordnungRoutes);
	app.route("/api/games", gameRoutes);
	app.route("/api/releases", releaseRoutes);
	app.route("/api/plans", planRoutes);
	app.route("/api/backlog-candidates", backlogCandidateRoutes);
	app.route("/api/purchase-candidates", purchaseCandidateRoutes);
	app.route("/api/upcoming", upcomingRoutes);
	app.route("/api/gaps", gapRoutes);
	app.route("/api/imports/wishlist", importRoutes);
	app.route("/api/deviations", deviationRoutes);
	app.route("/api/events", eventRoutes);
	app.route("/api/review", reviewRoutes);
	app.route("/api/scan", scanRoutes);
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

/**
 * Ein eBay-Client je Worker-Instanz - er haelt das Application-Token im
 * Speicher (9.2). Ohne Zugangsdaten entsteht ein Client ohne Zugang; nur
 * die Scan-Aufloesung antwortet dann mit 503, alles andere laeuft weiter.
 */
function ebayJeInstanz(): (env: Env) => EbayClient {
	let client: EbayClient | null = null;
	return (env) => {
		if (!client) client = erstelleEbayClient(ebayZugangAus(env));
		return client;
	};
}

/**
 * Der Cron-Einstieg (Stufe 18, Abschnitt 10.1). Wie createApp mit
 * austauschbaren Clients, damit Tests keine externe Schnittstelle rufen.
 * Ohne NPSSO_KEY passiert nichts - die Repositories entschluesseln damit,
 * und ein Cron ohne Schluessel soll nicht jede Nacht eine Ausnahme werfen.
 */
export function createScheduled(
	psnFactory: () => PsnClient = () => erstellePsnClient(),
	igdbFactory: (env: Env) => IgdbClient = igdbJeInstanz(),
): ExportedHandlerScheduledHandler<Env> {
	return async (_event, env) => {
		if (!env.NPSSO_KEY) {
			console.log("cron: uebersprungen, NPSSO_KEY ist nicht gesetzt.");
			return;
		}
		const repos = createRepositories(env.DB, env.NPSSO_KEY);
		try {
			const ergebnis = await cronSchritt(repos, psnFactory(), igdbFactory(env));
			const zeile = cronLogzeile(ergebnis);
			console.log(zeile);
			// Der Cron ist der einzige Schreiber ohne Zuschauer, und Worker-Logs
			// sind nur live zu sehen. Deshalb bleibt sein Ausgang auch in der
			// Datenbank stehen (Stufe 18b) - sonst laesst sich am Morgen nicht
			// unterscheiden, ob er scheiterte oder nichts zu tun fand.
			await repos.sync.cronAusgangVermerken(`${new Date().toISOString().slice(0, 16).replace("T", " ")} ${zeile}`);
		} catch (fehler) {
			// Ein Absturz darf nicht spurlos bleiben. Nur eigene Texte, kein
			// Fremdtext - der koennte ein Geheimnis zitieren.
			console.log("cron: abgebrochen");
			await repos.sync
				.cronAusgangVermerken(`${new Date().toISOString().slice(0, 16).replace("T", " ")} cron: abgebrochen`)
				.catch(() => {});
			throw fehler;
		}
	};
}

// Eine IGDB-Instanz fuer Anfragen und Cron: Sie haelt das Twitch-Token.
const igdbFactory = igdbJeInstanz();
const app = createApp(undefined, igdbFactory);

export default {
	fetch: app.fetch,
	scheduled: createScheduled(undefined, igdbFactory),
} satisfies ExportedHandler<Env>;
