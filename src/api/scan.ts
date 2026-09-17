import { Hono } from "hono";
import { normalisiereEan, pruefzifferStimmt } from "../domain/ean";
import { istErlaubtePlattform } from "../domain/titel";
import type { AppEnv } from "../types";
import { absichtenErledigen } from "./ownership";
import { liesJson } from "./validierung";

/**
 * Barcode-Erfassung (Abschnitt 9, Stufe 17).
 *
 * Aufloesungskette 9.2: erst ean_mapping (Stufe 1), dann market_offer
 * (Stufe 2, ab Stufe 20 gefuellt); die Titelsuche in der Sammlung (Stufe 3)
 * macht die Oberflaeche ueber GET /api/games?search=, das Anlegen (Stufe 4)
 * ueber POST /api/games wie in der Sammlung. Keine externe EAN-Quelle
 * (Entscheidung des Nutzers vom 16.09.2026); ein unbekannter Code bleibt
 * als offener Scan stehen, bis er zugeordnet oder verworfen wird.
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
		// zaehlen: false – die Karte wird aus den Einstellungen geoeffnet ("zuordnen"),
		// das ist kein neuer Scan und darf den Zaehler nicht anheben.
		const scans = k.zaehlen === false ? await c.var.repos.scan.zaehler(ean) : await c.var.repos.scan.vermerken(ean);
		if (angebot) {
			return c.json({ ean, treffer: "angebot", angebot: { titel: angebot.title_raw, plattform: angebot.platform_raw }, scans });
		}
		return c.json({ ean, treffer: "keiner", scans });
	})

	.get("/unresolved", async (c) => {
		const offene = await c.var.repos.scan.offene();
		return c.json({ anzahl: offene.length, scans: offene.map(offenerScan) });
	})

	.delete("/unresolved/:ean", async (c) => {
		const ean = eanAus(c.req.param("ean"));
		if (!ean) return c.json({ fehler: "Ungültige EAN." }, 400);
		if (!(await c.var.repos.scan.offenenLoeschen(ean))) return c.json({ fehler: "Kein offener Scan zu dieser EAN." }, 404);
		return c.json({ ean, geloescht: true });
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
