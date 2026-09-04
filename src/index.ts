import { Hono } from "hono";
import { settingsRoutes } from "./api/settings";
import { createRepositories } from "./db";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

// Repositories je Anfrage bereitstellen. Route-Handler greifen ueber
// c.var.repos zu und sehen D1 nie direkt.
app.use("/api/*", async (c, next) => {
	c.set("repos", createRepositories(c.env.DB));
	await next();
});

/**
 * Health-Check. Fragt bewusst die Datenbank nicht ab: Der Endpunkt soll
 * beantworten, ob der Worker läuft und Routing greift – nicht, ob D1 erreichbar
 * ist. Sonst verdeckt ein Datenbankproblem die Aussage über den Worker selbst.
 */
app.get("/api/health", (c) => c.json({ status: "ok", zeit: new Date().toISOString() }));

app.route("/api/settings", settingsRoutes);

export default app;
