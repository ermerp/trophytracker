import { Hono } from "hono";
import { normalisiereEan, pruefzifferStimmt } from "../domain/ean";
import { sammlungstreffer, vorbereiten } from "../domain/scan-titel";
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

	/**
	 * Offene Scans mit Titelvorschlag und Abgleich (9.3, Stufe 17b).
	 *
	 * Der Abgleich entsteht hier, nicht in der Datenbank: Er haengt an den
	 * Spieltiteln und waere nach einer Umbenennung falsch. Die Sammlung wird
	 * einmal zerlegt (`vorbereiten`), die Plattformen nur fuer die Treffer
	 * nachgeholt - sonst waeren es 430 Unterabfragen fuer nichts.
	 */
	.get("/unresolved", async (c) => {
		const offene = await c.var.repos.scan.offene();
		const mitTitel = offene.filter((s) => s.title_raw !== null);
		const sammlung = mitTitel.length > 0 ? vorbereiten(await c.var.repos.games.alleTitel()) : [];

		const gebraucht = new Map<number, Array<{ id: number; platform: string }>>();
		const scans = [];
		for (const s of offene) {
			const abgleich = s.title_raw ? sammlungstreffer(s.title_raw, sammlung) : { treffer: [], eindeutig: false };
			for (const t of abgleich.treffer) {
				if (!gebraucht.has(t.spielId)) gebraucht.set(t.spielId, await c.var.repos.games.releasesVon(t.spielId));
			}
			scans.push({
				...offenerScan(s),
				titel: s.title_raw,
				quelle: s.title_source,
				geprueftAm: s.checked_at,
				eindeutig: abgleich.eindeutig,
				kandidaten: abgleich.treffer.map((t) => ({
					spielId: t.spielId,
					titel: t.titel,
					releases: (gebraucht.get(t.spielId) ?? []).map((r) => ({ releaseId: r.id, plattform: r.platform })),
				})),
			});
		}
		return c.json({
			anzahl: scans.length,
			ungeprueft: offene.filter((s) => s.checked_at === null).length,
			eindeutig: scans.filter((s) => s.eindeutig).length,
			scans,
		});
	})

	/**
	 * Titelvorschlag einer EAN-Quelle eintragen - der Job ausserhalb des
	 * Workers (9.3). Wie Export und Backup laeuft er ueber das Access Service
	 * Token und traegt deshalb keine eigene Token-Pruefung (15.3).
	 * `titel: null` heisst "Quelle kennt den Code nicht" und wird ebenso
	 * vermerkt, damit der naechste Lauf ihn nicht erneut fragt.
	 */
	.post("/:ean/vorschlag", async (c) => {
		const ean = eanAus(c.req.param("ean"));
		if (!ean) return c.json({ fehler: "Ungültige EAN." }, 400);
		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);
		if (k.titel !== null && typeof k.titel !== "string") {
			return c.json({ fehler: "Feld 'titel' muss Text oder null sein." }, 400);
		}
		const titel = typeof k.titel === "string" && k.titel.trim() !== "" ? k.titel.trim() : null;
		if (titel !== null && (typeof k.quelle !== "string" || k.quelle.trim() === "")) {
			return c.json({ fehler: "Feld 'quelle' fehlt." }, 400);
		}
		if (!(await c.var.repos.scan.vorschlagSetzen(ean, titel, String(k.quelle ?? "").trim()))) {
			return c.json({ fehler: "Kein offener Scan zu dieser EAN." }, 404);
		}
		return c.json({ ean, titel, quelle: titel === null ? null : k.quelle });
	})

	/** „Titel ist falsch": Vorschlag weg, Code bleibt offen (9.3). 404, wenn es keinen Vorschlag gibt. */
	.delete("/:ean/vorschlag", async (c) => {
		const ean = eanAus(c.req.param("ean"));
		if (!ean) return c.json({ fehler: "Ungültige EAN." }, 400);
		if (!(await c.var.repos.scan.vorschlagVerwerfen(ean))) return c.json({ fehler: "Kein Vorschlag zu dieser EAN." }, 404);
		return c.json({ ean, vorschlagVerworfen: true });
	})

	/** Die Arbeitsliste des Jobs: Codes, die noch keine Quelle gesehen hat. */
	.get("/ungeprueft", async (c) => {
		const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 100));
		return c.json({ eans: await c.var.repos.scan.ungeprueft(limit) });
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
