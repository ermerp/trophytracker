import { Hono } from "hono";
import { normalisiereEan, pruefzifferStimmt } from "../domain/ean";
import { bestertitel, mehrheitstreffer, sammlungstreffer, vorbereiten } from "../domain/scan-titel";
import { istErlaubtePlattform } from "../domain/titel";
import { EbayKonfigError, EbayRateError, meldungFuer } from "../ebay/client";
import type { AppEnv } from "../types";
import { absichtenErledigen } from "./ownership";
import { liesJson } from "./validierung";

/**
 * Barcode-Erfassung (Abschnitt 9, Stufe 17).
 *
 * Aufloesungskette 9.2: erst ean_mapping (Stufe 1), dann market_offer
 * (Stufe 2, ab Stufe 20 gefuellt), seit Stufe 17c eBay live
 * (GET /:ean/online, Stufe 3); die Titelsuche in der Sammlung macht die
 * Oberflaeche ueber GET /api/games?search=, das Anlegen ueber
 * POST /api/games wie in der Sammlung. Ein unbekannter Code bleibt als
 * offener Scan stehen, bis er zugeordnet oder verworfen wird.
 *
 * Zuordnen legt die Disc UND das Mapping an: Wer einen Code zuordnet, hat die
 * Disc in der Hand. Die Disc laeuft durch OwnershipRepository.addPhysicalCopy
 * mit anlass 'scan' (Protokoll 8.5) und erledigt wie jedes Erfassen offene
 * Kauf- und Wunscheintraege (absichtenErledigen, Abschnitt 5).
 */

function eanAus(roh: string): string | null {
	const ean = normalisiereEan(decodeURIComponent(roh));
	return ean && pruefzifferStimmt(ean) ? ean : null;
}

function offenerScan(z: { ean: string; scan_count: number; first_seen_at: string; last_seen_at: string }) {
	return { ean: z.ean, scans: z.scan_count, zuerstAm: z.first_seen_at, zuletztAm: z.last_seen_at };
}

export const scanRoutes = new Hono<AppEnv>()
	.post("/", async (c) => {
		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);
		const ean = normalisiereEan(k.ean);
		if (!ean) return c.json({ fehler: "EAN muss aus 8 bis 14 Ziffern bestehen." }, 400);
		if (!pruefzifferStimmt(ean)) return c.json({ fehler: "Die Prüfziffer stimmt nicht – vermutlich ein Tippfehler." }, 400);

		const { mapping, angebot } = await c.var.repos.scan.aufloesen(ean);
		if (mapping) {
			return c.json({
				ean,
				treffer: "mapping",
				release: {
					releaseId: mapping.release_id,
					spielId: mapping.game_id,
					titel: mapping.title,
					plattform: mapping.platform,
					bild: mapping.cover_url,
					exemplare: mapping.exemplare,
				},
				scans: 0,
			});
		}
		// Seit Stufe 17d wird ein unbekannter Code NICHT mehr weggeschrieben:
		// Ein Code ohne seine Huelle war spaeter nicht mehr zuzuordnen, die
		// Liste offener Scans erzeugte damit Arbeit statt Nutzen (Entscheidung
		// des Nutzers vom 21.09.2026). Wer jetzt nicht zuordnen kann, scannt
		// die Disc spaeter erneut.
		if (angebot) {
			return c.json({ ean, treffer: "angebot", angebot: { titel: angebot.title_raw, plattform: angebot.platform_raw }, scans: 0 });
		}
		return c.json({ ean, treffer: "keiner", scans: 0 });
	})

	/**
	 * Einen Code live aufloesen (Stufe 17c, Abschnitt 9.2).
	 *
	 * Bewusst eine eigene Route und nicht Teil von POST /api/scan: Der lokale
	 * Treffer soll sofort da sein, und ein langsames oder totes eBay darf das
	 * Scannen nicht aufhalten. Die Oberflaeche ruft erst, wenn lokal nichts
	 * gefunden wurde.
	 *
	 * Geantwortet wird mit einem *Vorschlag*, nie mit einer Zuordnung: Titel,
	 * die passenden Spiele der Sammlung und - bei einer Mehrheit unter den
	 * Angeboten - das eine Ziel. Zugeordnet wird ueber POST /:ean/assign,
	 * also durch den Nutzer (Abschnitt 7).
	 *
	 * Kennt eBay den Code nicht, kommt upcitemdb als Rueckfall - genau einmal
	 * und ohne je zu werfen (Stufe 17d). Gespeichert wird nichts: Seit die
	 * offenen Scans weg sind, ist ein Titel ohne Zuordnung kein Datum, das
	 * aufzubewahren waere.
	 */
	.get("/:ean/online", async (c) => {
		const ean = eanAus(c.req.param("ean"));
		if (!ean) return c.json({ fehler: "Ungültige EAN." }, 400);
		if (!c.var.ebay.konfiguriert()) {
			return c.json({ fehler: "eBay-Zugangsdaten sind nicht hinterlegt." }, 503);
		}

		let titel: string[];
		try {
			titel = await c.var.ebay.titelZuGtin(ean);
		} catch (fehler) {
			const status = fehler instanceof EbayKonfigError ? 503 : fehler instanceof EbayRateError ? 503 : 502;
			return c.json({ fehler: meldungFuer(fehler) }, status);
		}

		// Rueckfall, nur wenn eBay den Code nicht kennt: upcitemdb drosselt
		// hart, wird aber selten gebraucht - und wirft nie.
		let quelle = "ebay";
		if (titel.length === 0) {
			const einer = await c.var.upc.titelZuGtin(ean);
			if (einer) {
				titel = [einer];
				quelle = "upcitemdb";
			}
		}

		// Kein Angebot ist ein Ergebnis, kein Fehler.
		const sammlung = titel.length > 0 ? vorbereiten(await c.var.repos.games.alleTitel()) : [];
		const gewaehlt = bestertitel(titel, sammlung);

		const { spiel } = mehrheitstreffer(titel, sammlung);
		const alle = gewaehlt ? sammlungstreffer(gewaehlt, sammlung).treffer : [];
		const kandidaten = [];
		for (const t of spiel && !alle.some((a) => a.spielId === spiel.spielId) ? [spiel, ...alle] : alle) {
			const releases = await c.var.repos.games.releasesFuerScan(t.spielId);
			kandidaten.push({
				spielId: t.spielId,
				titel: t.titel,
				// Cover und Exemplarzahl, damit die Oberflaeche den Treffer wie
				// einen bekannten Code zeigen kann - "das hast du schon" muss
				// auf einen Blick erkennbar sein (9.2).
				bild: releases[0]?.cover_url ?? null,
				releases: releases.map((r) => ({
					releaseId: r.id,
					plattform: r.platform,
					exemplare: r.exemplare,
				})),
			});
		}

		return c.json({
			ean,
			quelle,
			angebote: titel.length,
			titel: gewaehlt,
			eindeutig: spiel !== null,
			zielSpielId: spiel?.spielId ?? null,
			kandidaten,
		});
	})

	.post("/:ean/assign", async (c) => {
		const ean = eanAus(c.req.param("ean"));
		if (!ean) return c.json({ fehler: "Ungültige EAN." }, 400);
		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);

		const hatRelease = k.releaseId !== undefined;
		const hatSpiel = k.spielId !== undefined || k.plattform !== undefined;
		if (hatRelease === hatSpiel) {
			return c.json({ fehler: "Entweder releaseId oder spielId mit plattform angeben." }, 400);
		}

		let releaseId: number;
		if (hatRelease) {
			releaseId = Number(k.releaseId);
			if (!Number.isInteger(releaseId) || releaseId <= 0) return c.json({ fehler: "Feld 'releaseId' ist ungültig." }, 400);
			if (!(await c.var.repos.ownership.releaseExistiert(releaseId))) return c.json({ fehler: "Release nicht gefunden." }, 404);
		} else {
			const spielId = Number(k.spielId);
			if (!Number.isInteger(spielId) || spielId <= 0) return c.json({ fehler: "Feld 'spielId' ist ungültig." }, 400);
			if (typeof k.plattform !== "string" || !istErlaubtePlattform(k.plattform)) {
				return c.json({ fehler: `Unbekannte Plattform: ${String(k.plattform)}` }, 400);
			}
			if (!(await c.var.repos.games.spielExistiert(spielId))) return c.json({ fehler: "Spiel nicht gefunden." }, 404);
			releaseId = await c.var.repos.games.releaseFuerPlattform(spielId, k.plattform, "nutzer", "scan");
		}

		// Erst die Disc (mit Protokoll), dann das Mapping: Schlaegt das Mapping
		// fehl, steht die Disc mit ihrer EAN da und der naechste Scan fragt neu.
		const exemplar = await c.var.repos.ownership.addPhysicalCopy(releaseId, { ean }, "scan");
		await c.var.repos.scan.zuordnen(ean, releaseId, "manuell");
		const absichten = await absichtenErledigen(c.var.repos, releaseId);
		const kopf = await c.var.repos.scan.releaseKopf(releaseId);
		return c.json(
			{
				id: exemplar.id,
				ean,
				releaseId,
				physischStatusGesetzt: exemplar.physischStatusGesetzt,
				spiel: kopf ? { spielId: kopf.game_id, titel: kopf.title, plattform: kopf.platform } : null,
				...absichten,
			},
			201,
		);
	})

	.delete("/:ean", async (c) => {
		const ean = eanAus(c.req.param("ean"));
		if (!ean) return c.json({ fehler: "Ungültige EAN." }, 400);
		if (!(await c.var.repos.scan.mappingLoeschen(ean))) return c.json({ fehler: "Keine Zuordnung zu dieser EAN." }, 404);
		return c.json({ ean, geloescht: true });
	});
