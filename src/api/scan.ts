import { Hono } from "hono";
import { normalisiereEan, pruefzifferStimmt } from "../domain/ean";
import { bestertitel, mehrheitstreffer, sammlungstreffer, vorbereiten } from "../domain/scan-titel";
import { istErlaubtePlattform, type Plattform } from "../domain/titel";
import { EbayKonfigError, EbayRateError, meldungFuer } from "../ebay/client";
import type { AppEnv } from "../types";
import { absichtenFuerHuelle } from "./ownership";
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

/** Hoechstens so viele Spiele je Huelle: eine Collection hat zwei bis vier, und jede Disc kostet vier Anweisungen im Batch. */
export const HOECHSTENS_ZIELE = 6;

type Ziel = { releaseId: number } | { spielId: number; plattform: Plattform };

function zielAus(z: unknown): { ziel: Ziel } | { fehler: string } {
	if (typeof z !== "object" || z === null) return { fehler: "Ein Ziel muss ein Objekt sein." };
	const o = z as Record<string, unknown>;
	const hatRelease = o.releaseId !== undefined;
	const hatSpiel = o.spielId !== undefined || o.plattform !== undefined;
	if (hatRelease === hatSpiel) return { fehler: "Entweder releaseId oder spielId mit plattform angeben." };
	if (hatRelease) {
		const releaseId = Number(o.releaseId);
		if (!Number.isInteger(releaseId) || releaseId <= 0) return { fehler: "Feld 'releaseId' ist ungültig." };
		return { ziel: { releaseId } };
	}
	const spielId = Number(o.spielId);
	if (!Number.isInteger(spielId) || spielId <= 0) return { fehler: "Feld 'spielId' ist ungültig." };
	if (typeof o.plattform !== "string" || !istErlaubtePlattform(o.plattform)) {
		return { fehler: `Unbekannte Plattform: ${String(o.plattform)}` };
	}
	return { ziel: { spielId, plattform: o.plattform } };
}

/** Zweimal dasselbe Spiel auf derselben Plattform - das waere ein Release, auch wenn es noch nicht existiert. */
function doppelteSpielPlattform(ziele: readonly Ziel[]): boolean {
	const schluessel = ziele.flatMap((z) => ("spielId" in z ? [`${z.spielId}/${z.plattform}`] : []));
	return new Set(schluessel).size !== schluessel.length;
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

		const { mapping, angebot, huelle } = await c.var.repos.scan.aufloesen(ean);
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
				// Alle Spiele der Huelle (Nachtrag f1h): die Releases, deren Disc
				// diesen Code traegt, und das Mapping-Release - dieses vorn.
				huelle: huelle.map((h) => ({
					releaseId: h.release_id,
					spielId: h.game_id,
					titel: h.title,
					plattform: h.platform,
					bild: h.cover_url,
					exemplare: h.exemplare,
				})),
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

	/**
	 * Zuordnen: Disc(s) und Mapping (9.2). Seit Nachtrag f1h auch fuer eine
	 * Huelle mit mehreren Spielen (Collection-Disc): `ziele` ist eine Liste aus
	 * `{releaseId}` oder `{spielId, plattform}`, jedes Ziel bekommt seine
	 * eigene Disc mit demselben Code (Entscheidung des Nutzers vom 28.11.2026).
	 * Der alte Koerper - ein Ziel ohne Liste - gilt weiter.
	 *
	 * Ablauf und was bei einem Fehler stillsteht:
	 *
	 * 1. Lage aller Ziele in einem Lese-Batch. Fehlt eines: 404. Steht an einem
	 *    schon eine Disc (je Release genau eine, `hatExemplar`): 409 mit diesem
	 *    Release, und es ist **nichts** geschrieben - bei einem einzigen Ziel
	 *    ausser dem Mapping, wie bisher (der Code gehoert zu dem Release, und
	 *    Rueckgaengig stellt so ein ueberschriebenes Mapping wieder her).
	 * 2. Fehlende Releases anlegen (`releaseFuerPlattform`, je mit Ereignis).
	 * 3. Offene Absichten aller Releases in einem Lese-Batch.
	 * 4. Ein Schreib-Batch: Discs, erledigte Absichten, Mapping
	 *    (`ScanRepository.huelleErfassen`). Scheitert er, steht nur, was 2.
	 *    angelegt hat - Releases ohne Disc, die der naechste Versuch verwendet.
	 */
	.post("/:ean/assign", async (c) => {
		const ean = eanAus(c.req.param("ean"));
		if (!ean) return c.json({ fehler: "Ungültige EAN." }, 400);
		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);

		const liste = k.ziele !== undefined;
		if (liste && (k.releaseId !== undefined || k.spielId !== undefined || k.plattform !== undefined)) {
			return c.json({ fehler: "Entweder ziele oder ein einzelnes Ziel angeben." }, 400);
		}
		const roh = liste ? k.ziele : [k];
		if (!Array.isArray(roh) || roh.length === 0 || roh.length > HOECHSTENS_ZIELE) {
			return c.json({ fehler: `Feld 'ziele' muss 1 bis ${HOECHSTENS_ZIELE} Ziele enthalten.` }, 400);
		}
		const ziele: Ziel[] = [];
		for (const z of roh) {
			const g = zielAus(z);
			if ("fehler" in g) return c.json({ fehler: g.fehler }, 400);
			ziele.push(g.ziel);
		}

		const lage = await c.var.repos.scan.zielLage(ziele);
		for (let i = 0; i < ziele.length; i++) {
			if (!lage[i]) return c.json({ fehler: "releaseId" in ziele[i] ? "Release nicht gefunden." : "Spiel nicht gefunden." }, 404);
		}
		const vorhanden = lage.map((l) => l!.release_id).filter((id): id is number => id !== null);
		if (new Set(vorhanden).size !== vorhanden.length || doppelteSpielPlattform(ziele)) {
			return c.json({ fehler: "Dasselbe Release steht zweimal in den Zielen." }, 400);
		}

		// Je Release genau eine Disc (Entscheidung des Nutzers vom 27.09.2026).
		// Beim Scannen ist das der haeufigste Fall eines Versehens: dieselbe
		// Huelle zweimal ueber den Leser gezogen. Bei einem Ziel wird das
		// Mapping trotzdem gesetzt - der Code gehoert zu diesem Release, und
		// beim naechsten Scan soll er sofort treffen. Bei mehreren bricht der
		// ganze Zug ab, ohne etwas zu schreiben (Nachtrag f1h).
		const belegt = lage.filter((l) => l!.disc === 1).map((l) => l!);
		if (belegt.length > 0) {
			const b = belegt[0];
			if (ziele.length === 1) await c.var.repos.scan.zuordnen(ean, b.release_id!, "manuell");
			return c.json(
				{
					fehler:
						ziele.length === 1
							? "Für dieses Release steht schon eine Disc im Regal."
							: `Für ${b.title} (${b.platform}) steht schon eine Disc im Regal – nichts erfasst.`,
					releaseId: b.release_id,
					game_id: b.game_id,
					title: b.title,
					platform: b.platform,
					belegt: belegt.map((x) => x.release_id),
				},
				409,
			);
		}

		const discs: Array<{ releaseId: number; gameId: number; titel: string; plattform: Plattform; bild: string | null; releaseNeu: boolean }> = [];
		for (let i = 0; i < ziele.length; i++) {
			const l = lage[i]!;
			let releaseId = l.release_id;
			let releaseNeu = false;
			if (releaseId === null) {
				const z = ziele[i] as { spielId: number; plattform: Plattform };
				const r = await c.var.repos.games.releaseFuerPlattformMitAngabe(z.spielId, z.plattform, "nutzer", "scan");
				releaseId = r.releaseId;
				releaseNeu = r.neu;
			}
			discs.push({ releaseId, gameId: l.game_id, titel: l.title, plattform: l.platform, bild: l.cover_url, releaseNeu });
		}

		const absichten = await absichtenFuerHuelle(c.var.repos, discs);
		const angelegt = await c.var.repos.scan.huelleErfassen(
			ean,
			discs.map((d, i) => ({ releaseId: d.releaseId, erledigen: absichten[i].erledigen })),
			discs[0].releaseId,
		);

		const jeDisc = discs.map((d, i) => ({
			id: angelegt[i].id,
			releaseId: d.releaseId,
			physischStatusGesetzt: angelegt[i].physischStatusGesetzt,
			releaseNeu: d.releaseNeu,
			spiel: { spielId: d.gameId, titel: d.titel, plattform: d.plattform },
			bild: d.bild,
			absichtenErledigt: absichten[i].erledigen.map((e) => ({ id: e.id, art: e.kind, titel: e.titel })),
			aufListe: absichten[i].aufListe,
		}));
		const erste = jeDisc[0];
		return c.json(
			{
				// Die erste Disc oben, wie vor f1h - ein alter Stand der Oberflaeche liest nur das.
				id: erste.id,
				ean,
				releaseId: erste.releaseId,
				physischStatusGesetzt: erste.physischStatusGesetzt,
				spiel: erste.spiel,
				absichtenErledigt: jeDisc.flatMap((d) => d.absichtenErledigt),
				aufListe: erste.aufListe,
				discs: jeDisc,
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
