import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

/**
 * Health-Check. Fragt bewusst die Datenbank nicht ab: Der Endpunkt soll
 * beantworten, ob der Worker läuft und Routing greift – nicht, ob D1 erreichbar
 * ist. Sonst verdeckt ein Datenbankproblem die Aussage über den Worker selbst.
 */
app.get("/api/health", (c) => c.json({ status: "ok", zeit: new Date().toISOString() }));

export default app;
