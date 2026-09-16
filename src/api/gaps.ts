import { Hono } from "hono";
import type { LueckeZeile } from "../db/gaps";
import type { AppEnv } from "../types";

/**
 * Use Case 3: Luecken (Abschnitt 12, /api/gaps).
 *
 * Eine Luecke ist eine Tatsache - digital gespielt, Disc-Fassung belegt,
 * nicht im Regal. "Physisch nicht gewuenscht" ist eine Absicht und liegt
 * deshalb als plan_entry kauf/luecke/verworfen bei den uebrigen Absichten
 * (5.3); die View kennzeichnet die Luecke nur, statt sie zu verstecken.
 * Rueckgaengig ist DELETE /api/plans/:id, dieselbe Mechanik wie bei
 * "nicht vorgesehen" im Backlog (5.4). Stufe 15 macht aus dem verworfenen
 * Eintrag per Feld-Update einen offenen auf der Kaufliste.
 *
 * Releases mit unbekannter Disc-Fassung liefert die Route mit
 * (Entscheidung des Nutzers vom 16.09.2026): Die Ansicht zeigt sie
 * getrennt als "moeglicherweise" und laesst dort ja/nein setzen.
 */

function lueckeAntwort(z: LueckeZeile) {
	return {
		releaseId: z.release_id,
		spielId: z.game_id,
		titel: z.title,
		bild: z.cover_url,
		plattform: z.platform,
		discFassung: z.disc_fassung,
		discQuelle: z.disc_quelle,
		fortschritt: z.progress_pct,
		platin: z.hat_platin === 1,
		eigenerStatus: z.eigener_status,
		/** null heisst unbekannt - nie 0 (Darstellungsregel, Abschnitt 13). */
		besterGebrauchtpreisCents: z.bester_gebrauchtpreis_cents,
		verworfen: z.verworfen === 1,
		planId: z.plan_id,
	};
}

export const gapRoutes = new Hono<AppEnv>()
	/**
	 * Alle Zeilen von v_luecken; verworfene und unbekannte nur mit
	 * `verworfene=1` bzw. `unbekannte=1`. Die Zaehler nennen immer alles,
	 * damit die Umschalter ihre Anzahl zeigen koennen.
	 */
	.get("/", async (c) => {
		const mitVerworfenen = c.req.query("verworfene") === "1";
		const mitUnbekannten = c.req.query("unbekannte") === "1";
		const zeilen = await c.var.repos.gaps.liste();

		const belegt = zeilen.filter((z) => z.disc_fassung === "ja");
		const unbekannt = zeilen.filter((z) => z.disc_fassung === "unbekannt");
		const sichtbar = (liste: LueckeZeile[]) => (mitVerworfenen ? liste : liste.filter((z) => z.verworfen === 0));

		return c.json({
			anzahl: belegt.filter((z) => z.verworfen === 0).length,
			verworfen: zeilen.filter((z) => z.verworfen === 1).length,
			unbekannt: unbekannt.filter((z) => z.verworfen === 0).length,
			luecken: sichtbar(belegt).map(lueckeAntwort),
			moeglich: mitUnbekannten ? sichtbar(unbekannt).map(lueckeAntwort) : [],
		});
	})

	/** "Physisch nicht gewuenscht": plan_entry kauf/luecke/verworfen (5.3). */
	.post("/:releaseId/verwerfen", async (c) => {
		const releaseId = Number(c.req.param("releaseId"));
		if (!Number.isInteger(releaseId) || releaseId <= 0) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!(await c.var.repos.ownership.releaseExistiert(releaseId))) {
			return c.json({ fehler: "Release nicht gefunden." }, 404);
		}

		const vorhanden = await c.var.repos.gaps.kaufEintrag(releaseId);
		if (vorhanden) {
			const grund =
				vorhanden.status === "verworfen"
					? "Diese Lücke ist bereits verworfen."
					: "Für dieses Release gibt es schon einen Kaufeintrag.";
			return c.json({ fehler: grund, eintragId: vorhanden.id }, 409);
		}

		const id = await c.var.repos.plan.anlegen("kauf", { releaseId }, "luecke", { status: "verworfen" });
		return c.json({ id, releaseId, art: "kauf", status: "verworfen", herkunft: "luecke" }, 201);
	});
