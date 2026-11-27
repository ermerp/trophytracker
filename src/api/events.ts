import { Hono } from "hono";
import { beschreibeBuendel, beschreibeEreignis, buendele, gehoertDazu, istEreignisQuelle, type Buendel, type Ereignis } from "../domain/ereignis";
import type { AppEnv } from "../types";

/**
 * Aenderungsprotokoll (Abschnitt 8.5, Stufe 16): GET /api/events und
 * GET /api/games/:id/events.
 *
 * Nur lesend - geschrieben wird ausschliesslich in src/db/, im Batch der
 * jeweiligen Aenderung. Der Satz (`text`) entsteht hier zur Lesezeit aus
 * den gespeicherten Feldern und wird nie abgelegt.
 *
 * Seitenweise ueber `vor` (Keyset auf id), nicht ueber OFFSET: Die Tabelle
 * waechst unbegrenzt (Entscheidung des Nutzers vom 16.09.2026), und ein
 * OFFSET liest alle uebersprungenen Zeilen mit.
 */

export function ereignisAntwort(e: Ereignis) {
	return {
		id: e.id,
		zeitpunkt: e.occurred_at,
		quelle: e.source,
		spielId: e.game_id,
		releaseId: e.release_id,
		titel: e.label,
		art: e.kind,
		feld: e.field,
		alt: e.old_value,
		neu: e.new_value,
		detail: e.detail,
		text: beschreibeEreignis(e),
	};
}

/**
 * Eine Zeile aus einem Buendel (Nachtrag f1c): die Felder des tragenden
 * Ereignisses, dazu Titel, Satz und Zusatz des Buendels. `id` ist die kleinste
 * Id - die Oberflaeche blaettert mit `vor` = Id der letzten Zeile weiter.
 */
export function buendelAntwort(b: Buendel) {
	return { ...ereignisAntwort(b.haupt), id: b.id, zeitpunkt: b.zuletzt, titel: b.titel, text: b.text, zusatz: b.zusatz, anzahl: b.ids.length };
}

/** So viele Ereignisse holt eine Seite ueber `limit` hinaus, damit ein Buendel an der Grenze ganz bleibt. */
export const BUENDEL_VORLAUF = 20;

/**
 * Eine Seite in Buendeln (Nachtrag f1c). `limit` zaehlt weiter Ereignisse,
 * nicht Zeilen. Faellt ein Buendel auf die Grenze, kommen seine restlichen
 * Schritte aus dem Vorlauf dazu - **dieselbe Abfrage**, kein zweiter Aufruf -,
 * und die Seite endet hinter ihm. So zerreisst das Keyset ueber `id` kein
 * Buendel ueber zwei Seiten.
 */
export async function gebuendelteSeite(
	laden: (limit: number) => Promise<{ ereignisse: Ereignis[]; weiter: boolean }>,
	limit: number,
): Promise<{ zeilen: Buendel[]; weiter: boolean }> {
	const { ereignisse, weiter } = await laden(limit + BUENDEL_VORLAUF);
	let ende = Math.min(limit, ereignisse.length);
	while (ende < ereignisse.length && gehoertDazu(ereignisse[ende - 1], ereignisse[ende])) ende++;
	return { zeilen: buendele(ereignisse.slice(0, ende)).map(beschreibeBuendel), weiter: ende < ereignisse.length || weiter };
}

/** `limit` (1..200, Standard 50) und `vor` (id, optional) aus der Query. */
export function seitenParameter(q: Record<string, string>, standard = 50): { limit: number; vor: number | null } {
	const vor = q.vor === undefined || q.vor === "" ? null : Number(q.vor);
	return {
		limit: Math.min(200, Math.max(1, Number(q.limit) || standard)),
		vor: vor !== null && Number.isInteger(vor) ? vor : null,
	};
}

export const eventRoutes = new Hono<AppEnv>().get("/", async (c) => {
	const q = c.req.query();
	const quelle = istEreignisQuelle(q.quelle) ? q.quelle : null;
	const { limit, vor } = seitenParameter(q);
	const { zeilen, weiter } = await gebuendelteSeite((n) => c.var.repos.events.liste({ quelle, limit: n, vor }), limit);
	return c.json({ quelle, limit, weiter, ereignisse: zeilen.map(buendelAntwort) });
});
