import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types";
import { einesPruefen, marktSchritt } from "../sync/markt";
import { liesJson } from "./validierung";
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

	/**
	 * Ein Angebot verwerfen (Stufe 20h, Abschnitt 6).
	 *
	 * NICHTS WIRD GELOESCHT: Die Kennung kommt auf die Sperrliste des
	 * Releases, und damit ist sein Punkt im Verlauf gestrichen, WEIL er dort
	 * steht - eine Bedingung beim Lesen, kein zweiter Zustand. Die Ruecknahme
	 * loescht eine Zeile, und alle Punkte sind augenblicklich zurueck.
	 *
	 * Die Kennung WIRD MITGESCHICKT, nicht aus der Datenbank geraten: Hat der
	 * Nachtlauf das Angebot inzwischen ersetzt, antwortet die Route `409`
	 * statt stillschweigend das falsche zu verwerfen. Titel und Preis nimmt
	 * sie dann aus der eigenen Zeile - was in der Sperrliste steht, soll aus
	 * der Datenbank stammen und nicht aus dem Browser.
	 */
	.post("/markt/verwerfen", async (c) => {
		if (!c.var.ebay.konfiguriert()) {
			return c.json({ fehler: "eBay-Zugangsdaten sind nicht hinterlegt." }, 503);
		}
		const ziel = await zielAus(c);
		if ("fehler" in ziel) return c.json({ fehler: ziel.fehler }, 400);

		const angebot = await c.var.repos.markt.angebotNachKennung(ziel.releaseId, ziel.itemId);
		if (angebot === null) {
			return c.json(
				{ fehler: "Dieses Angebot liegt nicht mehr vor – es ist inzwischen ersetzt worden. Lade die Liste neu." },
				409,
			);
		}

		await c.var.repos.markt.verwerfen(ziel.releaseId, ziel.itemId, angebot.titel, angebot.preisCents);
		return neuAbrufen(c, ziel.releaseId);
	})

	/**
	 * Ein Verwerfen zuruecknehmen (Stufe 20h).
	 *
	 * Derselbe Neuabruf wie beim Verwerfen - sonst stuende die Liste bis zur
	 * naechsten Nacht auf dem Ersatzangebot, obwohl das verworfene wieder
	 * gilt. Ein "Rueckgaengig" stellt den Stand VOR der Aktion her, auch das,
	 * was der Schreibpfad nebenbei entfernt hat (CLAUDE.md).
	 */
	.post("/markt/verwerfen/ruecknahme", async (c) => {
		if (!c.var.ebay.konfiguriert()) {
			return c.json({ fehler: "eBay-Zugangsdaten sind nicht hinterlegt." }, 503);
		}
		const ziel = await zielAus(c);
		if ("fehler" in ziel) return c.json({ fehler: ziel.fehler }, 400);

		if (!(await c.var.repos.markt.ruecknahme(ziel.releaseId, ziel.itemId))) {
			return c.json({ fehler: "Dieses Angebot steht nicht auf der Sperrliste." }, 404);
		}
		return neuAbrufen(c, ziel.releaseId);
	})

	/**
	 * Was fuer dieses Release verworfen ist - fuer das Punktmenue am Preis.
	 *
	 * Eine eigene Route und keine Spalte in den Listen: Die Titel braucht nur
	 * die aufgeklappte Tafel, und sie in jede Zeile von vier Ansichten zu
	 * legen waere Lesekosten fuer etwas, das fast nie zu sehen ist. Die
	 * ANZAHL steht dagegen in den Listen (v_luecken, v_kaufkandidaten,
	 * PLAN_AUSWAHL) - sie sagt, dass es etwas zurueckzunehmen gibt.
	 */
	.get("/markt/verwerfen/:releaseId{[0-9]+}", async (c) => {
		const releaseId = Number(c.req.param("releaseId"));
		return c.json({ verworfene: await c.var.repos.markt.verworfene(releaseId) });
	})

	/** Wie weit der Bestand gefragt ist - fuer die Einstellungen. */
	.get("/markt", async (c) => {
		const stand = await c.var.repos.markt.stand();
		return c.json({ zugangsdaten: c.var.ebay.konfiguriert(), ...stand });
	});

/**
 * `{ releaseId, itemId }` aus dem Koerper. Die Kennung ist eine Zahlenfolge,
 * wie eBay sie vergibt - was nicht danach aussieht, wird abgewiesen statt
 * gespeichert: An ihr haengt, welches Angebot uebergangen wird.
 */
async function zielAus(c: {
	req: { json(): Promise<unknown> };
}): Promise<{ releaseId: number; itemId: string } | { fehler: string }> {
	const koerper = await liesJson(c);
	if (koerper === null) return { fehler: "Ungültiger JSON-Körper." };
	const releaseId = koerper.releaseId;
	const itemId = koerper.itemId;
	if (typeof releaseId !== "number" || !Number.isInteger(releaseId) || releaseId <= 0) {
		return { fehler: "Feld 'releaseId' muss eine Release-Id sein." };
	}
	if (typeof itemId !== "string" || !/^\d{1,20}$/.test(itemId)) {
		return { fehler: "Feld 'itemId' muss eine eBay-Angebotskennung sein." };
	}
	return { releaseId, itemId };
}

/**
 * Der Neuabruf nach einer Entscheidung - fuer beide Richtungen derselbe.
 *
 * Die Antwort nennt den neuen Preis, damit die Liste ihn sofort zeigt, und
 * die Sperrliste, damit das Punktmenue nicht nachfragen muss.
 *
 * SCHEITERT DER ABRUF, FEHLT `preis` GANZ - und das ist nicht dasselbe wie
 * `preis: null`. Null heisst "es gibt kein Angebot mehr", fehlend heisst
 * "wir wissen es gerade nicht" (CLAUDE.md: fehlender Schluessel und
 * ausdrueckliches null sind zwei Dinge). Die Entscheidung selbst steht
 * trotzdem fest - sie ist vor dem Abruf geschrieben und haengt nicht an eBay.
 */
async function neuAbrufen(c: Context<AppEnv>, releaseId: number) {
	const verworfene = await c.var.repos.markt.verworfene(releaseId);
	try {
		const ergebnis = await einesPruefen(c.var.repos, c.var.ebay, releaseId);
		if (ergebnis === null) return c.json({ fehler: "Release nicht gefunden." }, 404);
		if (ergebnis.status === "fehler") return c.json({ verworfene, meldung: ergebnis.meldung }, 200);
		return c.json({ verworfene, preis: ergebnis.preis }, 200);
	} catch (fehler) {
		// Nur eigene Texte, kein Fremdtext - er koennte ein Geheimnis zitieren.
		return c.json({ verworfene, meldung: meldungFuer(fehler) }, 200);
	}
}
