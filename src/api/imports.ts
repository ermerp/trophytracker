import { Hono } from "hono";
import type { PlanZiel } from "../db/plan";
import { ZEILEN_GRUPPEN, type ImportKandidatZeile, type ImportZaehler, type ImportZeile, type ZeilenGruppe } from "../db/wunschliste";
import { istErlaubtePlattform, type Plattform } from "../domain/titel";
import { jahrAusDateiname, parseWunschliste } from "../domain/wunschliste";
import { IgdbKonfigError } from "../igdb/client";
import { meldungFuer } from "../sync/igdb";
import { zielAusIgdbId, type PlattformWahl } from "../sync/plan-ziel";
import { importAbgleichSchritt, importUebernahmeSchritt } from "../sync/wunschliste";
import type { AppEnv } from "../types";
import { eintragAntwort } from "./plans";
import { liesJson } from "./validierung";

/**
 * Wunschlisten-Import (Abschnitt 8.2, Stufe 11): POST /api/imports/wishlist.
 *
 * Ein Lauf je Datei, der Zustand liegt in D1: Abgleich und Uebernahme laufen
 * in Schritten, jede Entscheidung des Nutzers wird sofort geschrieben und
 * ueberlebt ein Neuladen. Kandidaten wählen, Freitext uebernehmen und
 * ueberspringen sind Entscheidungen - der Import raet nicht.
 */

const AKTIONEN = ["igdb", "freitext", "ueberspringen", "zuruecknehmen"] as const;

function idAus(roh: unknown): number | null {
	const id = Number(roh);
	return Number.isInteger(id) && id > 0 ? id : null;
}

function ohneZugang(c: { json: (o: unknown, s: 503) => Response }) {
	return c.json({ fehler: "IGDB-Zugangsdaten sind nicht hinterlegt." }, 503);
}

function laufAntwort(l: { id: number; source_name: string | null; list_year: number | null; form: string; created_at: string; zaehler: ImportZaehler }) {
	return { id: l.id, quelle: l.source_name, jahr: l.list_year, form: l.form, angelegtAm: l.created_at, zaehler: l.zaehler };
}

function kandidatAntwort(k: ImportKandidatZeile) {
	return {
		igdbId: k.igdb_id,
		name: k.name,
		slug: k.slug,
		cover: k.cover_url,
		erscheinungsdatum: k.release_date,
		plattformen: k.platforms ? k.platforms.split(",") : [],
		typ: k.game_type,
		kritik: k.critic_score === null ? null : { wert: k.critic_score, anzahl: k.critic_score_count },
	};
}

function zeileAntwort(z: ImportZeile, kandidaten: ImportKandidatZeile[] = []) {
	let originals: string[] = [];
	try {
		originals = JSON.parse(z.originals) as string[];
	} catch {
		originals = [z.originals];
	}
	return {
		id: z.id,
		position: z.position,
		titel: z.title,
		originals,
		plattform: z.platform,
		listenDatum: z.listed_at,
		geprueft: z.checked_at !== null,
		suchweg: z.search_path,
		treffer: z.match_kind,
		spielId: z.game_id,
		spielTitel: z.spiel_titel,
		spielBild: z.spiel_cover,
		releaseId: z.release_id,
		releasePlattform: z.release_plattform,
		igdbId: z.igdb_id,
		entscheidung: z.decision,
		planId: z.plan_entry_id,
		entschiedenAm: z.decided_at,
		kandidaten: kandidaten.map(kandidatAntwort),
	};
}

export const importRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const laeufe = await c.var.repos.wishlistImport.laeufe();
		return c.json({ laeufe: laeufe.map(laufAntwort) });
	})

	/**
	 * Text parsen und einen Lauf anlegen. `jahr` kommt aus dem Dateinamen,
	 * wenn die Oberflaeche keines schickt; es darf fehlen. Die Kodierung hat
	 * das Frontend vor dem Hochladen geloest (UTF-8, sonst Windows-1252).
	 */
	.post("/", async (c) => {
		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);
		if (typeof k.text !== "string" || k.text.trim() === "") return c.json({ fehler: "Feld 'text' fehlt." }, 400);
		const dateiname = typeof k.dateiname === "string" && k.dateiname.trim() !== "" ? k.dateiname.trim() : null;
		let jahr: number | null = null;
		if (k.jahr !== undefined && k.jahr !== null && k.jahr !== "") {
			const j = Number(k.jahr);
			if (!Number.isInteger(j) || j < 1990 || j > 2100) return c.json({ fehler: "Feld 'jahr' muss ein vierstelliges Jahr sein." }, 400);
			jahr = j;
		} else {
			jahr = jahrAusDateiname(dateiname);
		}

		const ergebnis = parseWunschliste(k.text, { jahr });
		if (ergebnis.zeilen.length === 0) return c.json({ fehler: "Keine Titelzeile gefunden." }, 400);

		const id = await c.var.repos.wishlistImport.anlegen(
			{ sourceName: dateiname ?? "Eingabe", listYear: jahr, form: ergebnis.form },
			ergebnis.zeilen,
		);
		return c.json(
			{
				id,
				form: ergebnis.form,
				zeilen: ergebnis.zeilen.length,
				ueberschriften: ergebnis.ueberschriften,
				zusammengefuehrt: ergebnis.zusammengefuehrt,
			},
			201,
		);
	})

	/** Lauf mit Zaehlern; mit `gruppe` eine Seite Zeilen samt Kandidaten. */
	.get("/:id", async (c) => {
		const id = idAus(c.req.param("id"));
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		const lauf = await c.var.repos.wishlistImport.lauf(id);
		if (!lauf) return c.json({ fehler: "Import nicht gefunden." }, 404);

		const gruppe = c.req.query("gruppe");
		if (gruppe === undefined) return c.json(laufAntwort(lauf));
		if (!(ZEILEN_GRUPPEN as readonly string[]).includes(gruppe)) {
			return c.json({ fehler: `Parameter 'gruppe' muss einer von ${ZEILEN_GRUPPEN.join(", ")} sein.` }, 400);
		}
		const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));
		const offset = Math.max(0, Number(c.req.query("offset")) || 0);
		const { zeilen, kandidaten, gesamt } = await c.var.repos.wishlistImport.zeilen(id, gruppe as ZeilenGruppe, limit, offset);
		const jeZeile = new Map<number, ImportKandidatZeile[]>();
		for (const k of kandidaten) {
			const liste = jeZeile.get(k.line_id);
			if (liste) liste.push(k);
			else jeZeile.set(k.line_id, [k]);
		}
		return c.json({
			...laufAntwort(lauf),
			gruppe,
			gesamt,
			limit,
			offset,
			zeilen: zeilen.map((z) => zeileAntwort(z, jeZeile.get(z.id) ?? [])),
		});
	})

	.delete("/:id", async (c) => {
		const id = idAus(c.req.param("id"));
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!(await c.var.repos.wishlistImport.loeschen(id))) return c.json({ fehler: "Import nicht gefunden." }, 404);
		return c.json({ id, geloescht: true });
	})

	/** Ein Schritt des Abgleichs; die Oberflaeche ruft, solange `weiter` gilt. */
	.post("/:id/abgleich", async (c) => {
		const id = idAus(c.req.param("id"));
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!(await c.var.repos.wishlistImport.lauf(id))) return c.json({ fehler: "Import nicht gefunden." }, 404);
		if (!c.var.igdb.konfiguriert()) return ohneZugang(c);
		const ergebnis = await importAbgleichSchritt(c.var.repos, c.var.igdb, id);
		return c.json(ergebnis, ergebnis.status === "fehler" ? 502 : 200);
	})

	/** Ein Schritt der Blockuebernahme (klare Zeilen). */
	.post("/:id/uebernehmen", async (c) => {
		const id = idAus(c.req.param("id"));
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!(await c.var.repos.wishlistImport.lauf(id))) return c.json({ fehler: "Import nicht gefunden." }, 404);
		if (!c.var.igdb.konfiguriert()) return ohneZugang(c);
		const ergebnis = await importUebernahmeSchritt(c.var.repos, c.var.igdb, id);
		return c.json(ergebnis, ergebnis.status === "fehler" ? 502 : 200);
	})

	/**
	 * Einzelentscheidung fuer eine Zeile. `igdb` und `freitext` schreiben den
	 * plan_entry sofort - die Wahl ist die Bestaetigung; `zuruecknehmen`
	 * loescht ihn wieder und oeffnet die Zeile. `ueberspringen` ist eine
	 * gespeicherte Entscheidung und ueberlebt ein Neuladen.
	 */
	.post("/:id/zeilen/:zeileId/entscheiden", async (c) => {
		const geladen = await zeileLaden(c);
		if ("antwort" in geladen) return geladen.antwort;
		const { zeile } = geladen;

		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);
		const aktion = typeof k.aktion === "string" && (AKTIONEN as readonly string[]).includes(k.aktion) ? (k.aktion as (typeof AKTIONEN)[number]) : null;
		if (!aktion) return c.json({ fehler: `Feld 'aktion' muss eine von ${AKTIONEN.join(", ")} sein.` }, 400);

		const repos = c.var.repos;
		if (aktion === "zuruecknehmen") {
			if (zeile.decision === "offen") return c.json({ fehler: "Die Zeile ist noch offen." }, 409);
			if (zeile.decision === "aufgeteilt") return c.json({ fehler: "Eine aufgeteilte Zeile lässt sich nicht zurücknehmen." }, 409);
			if (zeile.plan_entry_id !== null) await repos.plan.loeschen(zeile.plan_entry_id);
			await repos.wishlistImport.entscheiden(zeile.id, "offen");
			return c.json({ ...zeileAntwort((await repos.wishlistImport.zeile(zeile.id)) ?? zeile), zurueckgenommen: true });
		}

		if (zeile.decision !== "offen") return c.json({ fehler: "Die Zeile ist schon entschieden." }, 409);

		if (aktion === "ueberspringen") {
			await repos.wishlistImport.entscheiden(zeile.id, "uebersprungen");
			return c.json({ ...zeileAntwort((await repos.wishlistImport.zeile(zeile.id)) ?? zeile), uebersprungen: true });
		}

		let ziel: PlanZiel;
		let spielAngelegt = false;
		if (aktion === "freitext") {
			// Freitext hat kein Spiel und deshalb nie eine Plattform (Abschnitt 5).
			ziel = { titleRaw: zeile.title };
		} else {
			const igdbId = idAus(k.igdbId);
			if (igdbId === null) return c.json({ fehler: "Feld 'igdbId' fehlt oder ist ungültig." }, 400);
			// Plattform: ausdruecklich aus dem Koerper, sonst die der Zeile, sonst
			// die neueste des Treffers ("auto"); "" heisst ausdruecklich ohne.
			let plattform: PlattformWahl = zeile.platform ?? "auto";
			if (k.plattform !== undefined) {
				if (k.plattform === null || k.plattform === "") plattform = null;
				else if (k.plattform === "auto") plattform = "auto";
				else if (typeof k.plattform === "string" && istErlaubtePlattform(k.plattform)) plattform = k.plattform;
				else return c.json({ fehler: `Unbekannte Plattform: ${String(k.plattform)}` }, 400);
			}
			if (!c.var.igdb.konfiguriert()) return ohneZugang(c);
			let ergebnis: Awaited<ReturnType<typeof zielAusIgdbId>>;
			try {
				ergebnis = await zielAusIgdbId(repos, c.var.igdb, igdbId, plattform);
			} catch (fehler) {
				if (fehler instanceof IgdbKonfigError) return ohneZugang(c);
				return c.json({ fehler: meldungFuer(fehler) }, 502);
			}
			if (!ergebnis) return c.json({ fehler: "IGDB kennt diesen Eintrag nicht." }, 404);
			ziel = ergebnis.ziel;
			spielAngelegt = ergebnis.spielAngelegt;
		}

		const doppelt = await repos.plan.offenerEintrag("wunsch", ziel);
		if (doppelt !== null) {
			await repos.wishlistImport.entscheiden(zeile.id, "schon_vorhanden");
			return c.json({ fehler: "Dafür gibt es schon einen offenen Wunsch.", eintragId: doppelt }, 409);
		}
		const planId = await repos.plan.anlegen("wunsch", ziel, "import");
		await repos.wishlistImport.entscheiden(zeile.id, "uebernommen", planId);
		const wunsch = await repos.plan.eintrag(planId);
		return c.json(
			{
				...zeileAntwort((await repos.wishlistImport.zeile(zeile.id)) ?? zeile),
				spielAngelegt,
				wunsch: wunsch ? eintragAntwort(wunsch) : null,
			},
			201,
		);
	})

	/**
	 * Titel aendern (die Zeile wird beim naechsten Abgleichschritt neu gesucht)
	 * oder die Plattform setzen beziehungsweise leeren (ohne neuen Abgleich) -
	 * das Dropdown vor der Blockuebernahme.
	 */
	.patch("/:id/zeilen/:zeileId", async (c) => {
		const geladen = await zeileLaden(c);
		if ("antwort" in geladen) return geladen.antwort;
		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);
		if (k.titel === undefined && k.plattform === undefined) return c.json({ fehler: "Feld 'titel' oder 'plattform' angeben." }, 400);
		if (k.plattform !== undefined) {
			let plattform: Plattform | null = null;
			if (k.plattform !== null && k.plattform !== "") {
				if (typeof k.plattform !== "string" || !istErlaubtePlattform(k.plattform)) {
					return c.json({ fehler: `Unbekannte Plattform: ${String(k.plattform)}` }, 400);
				}
				plattform = k.plattform;
			}
			if (!(await c.var.repos.wishlistImport.plattformSetzen(geladen.zeile.id, plattform))) {
				return c.json({ fehler: "Eine übernommene Zeile lässt sich nicht ändern." }, 409);
			}
		}
		if (k.titel !== undefined) {
			if (typeof k.titel !== "string" || k.titel.trim() === "") return c.json({ fehler: "Feld 'titel' muss Text sein." }, 400);
			if (!(await c.var.repos.wishlistImport.umbenennen(geladen.zeile.id, k.titel.trim()))) {
				return c.json({ fehler: "Eine übernommene Zeile lässt sich nicht umbenennen." }, 409);
			}
		}
		return c.json({ ...zeileAntwort((await c.var.repos.wishlistImport.zeile(geladen.zeile.id)) ?? geladen.zeile), geaendert: true });
	})

	/** Sammelzeile in mehrere Titel trennen - der Nutzer trennt, der Import raet nicht. */
	.post("/:id/zeilen/:zeileId/aufteilen", async (c) => {
		const geladen = await zeileLaden(c);
		if ("antwort" in geladen) return geladen.antwort;
		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);
		const titel = Array.isArray(k.titel) ? k.titel.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter((t) => t !== "") : [];
		if (titel.length < 2) return c.json({ fehler: "Feld 'titel' braucht mindestens zwei Titel." }, 400);
		const ids = await c.var.repos.wishlistImport.aufteilen(geladen.zeile.id, titel);
		if (ids.length === 0) return c.json({ fehler: "Eine übernommene Zeile lässt sich nicht aufteilen." }, 409);
		return c.json({ id: geladen.zeile.id, neueZeilen: ids }, 201);
	});

type Kontext = { req: { param: (n: "id" | "zeileId") => string }; json: (o: unknown, s: 400 | 404) => Response; var: AppEnv["Variables"] };

async function zeileLaden(c: Kontext): Promise<{ zeile: ImportZeile } | { antwort: Response }> {
	const id = idAus(c.req.param("id"));
	const zeileId = idAus(c.req.param("zeileId"));
	if (id === null || zeileId === null) return { antwort: c.json({ fehler: "Ungültige Id." }, 400) };
	const zeile = await c.var.repos.wishlistImport.zeile(zeileId);
	if (!zeile || zeile.import_id !== id) return { antwort: c.json({ fehler: "Zeile nicht gefunden." }, 404) };
	return { zeile };
}
