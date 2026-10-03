import { Hono } from "hono";
import { meldungFuer } from "../psn/store";
import { storeAdresse } from "../domain/store";
import { einesPruefen, storeSchritt } from "../sync/store";
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

	/**
	 * EIN Release jetzt pruefen, mit oder ohne eingefuegte Adresse
	 * (Nachtrag 21d).
	 *
	 * Zwei Dinge in einem Aufruf, weil sie zusammengehoeren: Die Adresse wird
	 * gespeichert, und sofort danach steht der Preis da. Ohne das zweite
	 * waere die Nachpflegeliste unbrauchbar - die Tagesfrist liesse den
	 * Eintrag bis zum naechsten Morgen stumm.
	 *
	 * Die Adresse ist die aus dem Browser kopierte Store-Adresse, Produkt
	 * oder Concept, oder die blosse Id. Was sich nicht als eine von beiden
	 * lesen laesst, wird mit `400` abgewiesen statt geraten: An der Id haengt
	 * der Preis, und ein falscher waere schlimmer als keiner.
	 */
	.post("/store/:releaseId{[0-9]+}", async (c) => {
		const releaseId = Number(c.req.param("releaseId"));
		const koerper = await c.req.json<{ adresse?: unknown }>().catch(() => ({}) as { adresse?: unknown });

		if (koerper.adresse !== undefined) {
			if (typeof koerper.adresse !== "string") {
				return c.json({ fehler: "adresse muss Text sein." }, 400);
			}
			const adresse = storeAdresse(koerper.adresse);
			if (adresse === null) {
				return c.json({ fehler: "Das ist keine Store-Adresse. Erwartet wird der Link zu einer Produkt- oder Concept-Seite." }, 400);
			}
			const ziel = await c.var.repos.store.eines(releaseId);
			if (ziel === null) return c.json({ fehler: "Release nicht gefunden." }, 404);
			if (adresse.art === "produkt") {
				// Ueber den Weg von Hand, damit die Zuordnung mit Quelle
				// 'nutzer' im Protokoll steht (8.5) - sie ist seine Entscheidung.
				await c.var.repos.games.releaseAendern(releaseId, { psnProductId: adresse.id });
			} else {
				await c.var.repos.store.conceptVonHand(ziel.gameId, adresse.id);
			}
		}

		try {
			const ergebnis = await einesPruefen(c.var.repos, c.var.store, c.var.igdb, releaseId);
			if (ergebnis === null) return c.json({ fehler: "Release nicht gefunden." }, 404);
			return c.json(ergebnis, ergebnis.status === "fehler" ? 502 : 200);
		} catch (fehler) {
			return c.json({ fehler: meldungFuer(fehler) }, 502);
		}
	})

	/**
	 * Die Eintraege, bei denen Nachpflege etwas bringt - fuer die Liste in
	 * den Einstellungen und die Zeile an der Glocke.
	 */
	.get("/store/offen", async (c) => {
		return c.json({ eintraege: await c.var.repos.store.ohneZuordnung() });
	})

	/** Wie weit der Zuschnitt gefragt ist - fuer die Einstellungen. */
	.get("/store", async (c) => {
		return c.json(await c.var.repos.store.stand());
	});
