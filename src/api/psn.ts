import { Hono } from "hono";
import type { SyncLauf } from "../db/sync";
import { Geheimnis } from "../domain/secret";
import { PsnAuthError } from "../psn/client";
import { normalisierungWiederholen, syncSchritt } from "../sync/run";
import type { AppEnv } from "../types";

/**
 * Abschnitt 12: NPSSO-Eingabe und Sync.
 *
 * Keine Antwort dieser Routen enthaelt jemals NPSSO, Refresh- oder Access
 * Token - auch nicht gekuerzt. Durchgesetzt wird das durch die Huelle
 * Geheimnis, geprueft von test/keine-lecks.spec.ts.
 */
export const psnRoutes = new Hono<AppEnv>()
	.post("/settings/npsso", async (c) => {
		let koerper: unknown;
		try {
			koerper = await c.req.json();
		} catch {
			return c.json({ fehler: "Ungültiges JSON." }, 400);
		}

		const roh = (koerper as { npsso?: unknown })?.npsso;
		if (typeof roh !== "string" || roh.trim() === "") {
			return c.json({ fehler: "Feld 'npsso' fehlt oder ist leer." }, 400);
		}

		const npsso = new Geheimnis(roh.trim());
		const psn = c.var.psn;

		// Erst pruefen, dann speichern: Ein ungueltiges NPSSO soll den
		// hinterlegten Wert nicht ueberschreiben.
		let sitzung;
		try {
			sitzung = await psn.tokenAusNpsso(npsso);
		} catch (fehler) {
			const meldung =
				fehler instanceof PsnAuthError
					? fehler.message
					: "Das NPSSO konnte nicht geprüft werden.";
			return c.json({ fehler: meldung }, 400);
		}

		await c.var.repos.credentials.npssoSpeichern(npsso);
		await c.var.repos.credentials.refreshTokenSpeichern(
			sitzung.refreshToken,
			sitzung.refreshLaeuftAbUm,
		);

		return c.json({ gespeichert: true, ...(await c.var.repos.credentials.anzeige()) });
	})

	.post("/sync", async (c) => {
		const ergebnis = await syncSchritt(c.var.repos, c.var.psn);
		return c.json(ergebnis, ergebnis.status === "fehler" ? 502 : 200);
	})

	/**
	 * Normalisierung erneut ausfuehren - ohne PSN-Zugriff.
	 * Der eigentliche Zweck der Trennung aus Abschnitt 7.1.
	 */
	.post("/sync/normalize", async (c) => {
		const ergebnis = await normalisierungWiederholen(c.var.repos);
		if (!ergebnis) {
			return c.json({ fehler: "Es gibt keinen abgeschlossenen Lauf zum Wiederholen." }, 409);
		}
		return c.json({ zurueckgesetzt: ergebnis.seiten, laufId: ergebnis.laufId, weiter: true });
	})

	/**
	 * Zustand fuer Einstellungen und Hinweisblock. `letzterAutomatischerLauf`
	 * (Stufe 18) ist der juengste Lauf des Cron - der Hinweisblock meldet
	 * daraus einen fehlgeschlagenen Nachtlauf, den niemand am Bildschirm sah.
	 */
	.get("/sync/status", async (c) => {
		const [lauf, cronLauf, cronVerlauf, zugang, trophaeen] = await Promise.all([
			c.var.repos.sync.letzterLauf(),
			c.var.repos.sync.letzterLauf("cron"),
			c.var.repos.sync.cronVerlauf(),
			c.var.repos.credentials.anzeige(),
			c.var.repos.trophies.anzahl(),
		]);

		return c.json({
			zugang,
			trophaeen,
			letzterLauf: laufAntwort(lauf),
			letzterAutomatischerLauf: laufAntwort(cronLauf),
			// Was die letzten Cron-Aufrufe taten, neueste zuerst - auch die, die
			// gar keinen Lauf anfassten (Stufe 18b).
			cronVerlauf,
		});
	});

function laufAntwort(lauf: SyncLauf | null) {
	if (!lauf) return null;
	return {
		id: lauf.id,
		status: lauf.status,
		phase: lauf.phase,
		ausloeser: lauf.started_by,
		gestartetAm: lauf.started_at,
		beendetAm: lauf.finished_at,
		titlesSeen: lauf.titles_seen,
		offset: lauf.next_offset,
		meldung: lauf.error_message,
	};
}
