import { Hono } from "hono";
import { bildeGruppen } from "../domain/gruppen";
import { istErlaubtePlattform } from "../domain/titel";
import type { AppEnv } from "../types";

/**
 * Zuordnung von Trophaeenlisten zu Spielen und Releases.
 *
 * POST /zuordnung/gruppe ist eine Ergaenzung zu Abschnitt 12: Die dort
 * vorgesehene create-game legt je Trophaeeneintrag an, was bei GTA V drei
 * Aufrufe und drei Spiele ergaebe. Eine Gruppe ist aber ein Spiel mit
 * mehreren Releases.
 */
export const zuordnungRoutes = new Hono<AppEnv>()
	/** Gruppenvorschlaege, seitenweise. Schreibt nichts. */
	.get("/offen", async (c) => {
		const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));
		const offset = Math.max(0, Number(c.req.query("offset")) || 0);

		const eintraege = await c.var.repos.games.unzugeordnet();
		const gruppen = bildeGruppen(eintraege);

		return c.json({
			gesamt: gruppen.length,
			listenOffen: eintraege.length,
			limit,
			offset,
			gruppen: gruppen.slice(offset, offset + limit),
		});
	})

	/** Eine Gruppe bestaetigen: Spiel + Releases + Verknuepfungen. */
	.post("/gruppe", async (c) => {
		let koerper: unknown;
		try {
			koerper = await c.req.json();
		} catch {
			return c.json({ fehler: "Ungültiges JSON." }, 400);
		}

		const eingabe = koerper as {
			titel?: unknown;
			releases?: Array<{ npCommunicationId?: unknown; plattform?: unknown }>;
		};

		const titel = typeof eingabe.titel === "string" ? eingabe.titel.trim() : "";
		if (titel === "") return c.json({ fehler: "Feld 'titel' fehlt oder ist leer." }, 400);

		if (!Array.isArray(eingabe.releases) || eingabe.releases.length === 0) {
			return c.json({ fehler: "Mindestens ein Release wird gebraucht." }, 400);
		}

		const releases = [];
		for (const r of eingabe.releases) {
			if (typeof r?.npCommunicationId !== "string" || typeof r?.plattform !== "string") {
				return c.json({ fehler: "Jedes Release braucht npCommunicationId und plattform." }, 400);
			}
			if (!istErlaubtePlattform(r.plattform)) {
				return c.json({ fehler: `Unbekannte Plattform: ${r.plattform}` }, 400);
			}
			releases.push({ npCommunicationId: r.npCommunicationId, plattform: r.plattform });
		}

		// UNIQUE (game_id, platform, edition, region) laesst zwei Releases
		// derselben Plattform in einem Spiel nicht zu.
		const plattformen = releases.map((r) => r.plattform);
		if (new Set(plattformen).size !== plattformen.length) {
			return c.json(
				{ fehler: "Zwei Trophäenlisten beanspruchen dieselbe Plattform. Bitte getrennt anlegen." },
				400,
			);
		}

		const ergebnis = await c.var.repos.games.gruppeAnlegen(titel, releases);
		return c.json({
			...ergebnis,
			nochOffen: await c.var.repos.games.anzahlUnzugeordnet(),
		});
	})

	/** Einzelne Liste einem bestehenden Release zuordnen. */
	.post("/liste/:npCommId", async (c) => {
		let koerper: unknown;
		try {
			koerper = await c.req.json();
		} catch {
			return c.json({ fehler: "Ungültiges JSON." }, 400);
		}

		const releaseId = Number((koerper as { releaseId?: unknown })?.releaseId);
		if (!Number.isInteger(releaseId) || releaseId <= 0) {
			return c.json({ fehler: "Feld 'releaseId' fehlt oder ist ungültig." }, 400);
		}

		if (await c.var.repos.trophies.releaseIstBelegt(releaseId)) {
			return c.json({ fehler: "Dieses Release trägt bereits eine Trophäenliste." }, 409);
		}

		const gesetzt = await c.var.repos.games.listeZuordnen(
			c.req.param("npCommId"),
			releaseId,
			"manuell",
		);
		if (!gesetzt) {
			return c.json({ fehler: "Liste unbekannt oder bereits zugeordnet." }, 409);
		}

		return c.json({ zugeordnet: true, nochOffen: await c.var.repos.games.anzahlUnzugeordnet() });
	});

/** Abschnitt 12: GET /api/games */
export const gameRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const limit = Math.min(200, Math.max(1, Number(c.req.query("limit")) || 50));
		const offset = Math.max(0, Number(c.req.query("offset")) || 0);
		const { zeilen, gesamt } = await c.var.repos.games.spieleListe(limit, offset);

		return c.json({
			gesamt,
			limit,
			offset,
			spiele: zeilen.map((z) => ({
				id: z.id,
				titel: z.title,
				cover: z.cover_url,
				releases: z.releases,
			})),
		});
	})
	.get("/:id", async (c) => {
		const id = Number(c.req.param("id"));
		if (!Number.isInteger(id)) return c.json({ fehler: "Ungültige Id." }, 400);

		const detail = await c.var.repos.games.spielDetail(id);
		if (!detail) return c.json({ fehler: "Spiel nicht gefunden." }, 404);
		return c.json(detail);
	});
