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
	/** Alle Zuordnungen als Tabelle. Abschnitt 12 ergaenzt. */
	.get("/uebersicht", async (c) => {
		const roh = c.req.query();
		const filter = (["alle", "mehrfach", "auffaellig"] as const).includes(
			roh.filter as "alle",
		)
			? (roh.filter as "alle" | "mehrfach" | "auffaellig")
			: "auffaellig";

		const { zeilen, gesamt } = await c.var.repos.games.uebersicht({
			filter,
			suche: roh.suche ?? "",
			limit: Math.min(500, Math.max(1, Number(roh.limit) || 100)),
			offset: Math.max(0, Number(roh.offset) || 0),
		});

		return c.json({
			gesamt,
			filter,
			zeilen: zeilen.map((z) => ({
				spielId: z.game_id,
				titel: z.title,
				releaseId: z.release_id,
				plattform: z.platform,
				rohTitel: z.title_name,
				fortschritt: z.progress_pct,
				struktur: z.struktur,
				hatPlatin: (z.defined_platinum ?? 0) > 0 && (z.earned_platinum ?? 0) > 0,
				releasesImSpiel: z.releases_im_spiel,
				strukturWeichtAb: z.strukturWeichtAb,
				ohneListe: z.ohneListe,
				titelWirktAbgekuerzt: z.titelWirktAbgekuerzt,
				schluesselVeraltet: z.schluesselVeraltet,
			})),
		});
	})

	/**
	 * Sortierschluessel aller Spiele neu berechnen.
	 *
	 * Noetig nach jeder Aenderung an der Titelnormalisierung: sort_title ist
	 * abgeleitet und veraltet sonst still, was die automatische Zuordnung
	 * unbrauchbar macht.
	 */
	.post("/schluessel-neu-berechnen", async (c) => {
		return c.json(await c.var.repos.games.sortierschluesselNeuBerechnen());
	})

	/** Abschnitt 12: Titel aendern. */
	.patch("/:id", async (c) => {
		const id = Number(c.req.param("id"));
		if (!Number.isInteger(id)) return c.json({ fehler: "Ungültige Id." }, 400);

		let koerper: unknown;
		try {
			koerper = await c.req.json();
		} catch {
			return c.json({ fehler: "Ungültiges JSON." }, 400);
		}

		const titel = typeof (koerper as { titel?: unknown })?.titel === "string"
			? ((koerper as { titel: string }).titel).trim()
			: "";
		if (titel === "") return c.json({ fehler: "Feld 'titel' fehlt oder ist leer." }, 400);

		if (!(await c.var.repos.games.umbenennen(id, titel))) {
			return c.json({ fehler: "Spiel nicht gefunden." }, 404);
		}
		return c.json({ id, titel });
	})

	/**
	 * Ein Release aus seinem Spiel herausloesen.
	 *
	 * Ergaenzung zu Abschnitt 12. Die einzige Route, die eine bestehende
	 * Zuordnung veraendert - auf ausdrueckliche Anweisung.
	 */
	.post("/release/:releaseId/abtrennen", async (c) => {
		const releaseId = Number(c.req.param("releaseId"));
		if (!Number.isInteger(releaseId)) return c.json({ fehler: "Ungültige Id." }, 400);

		let koerper: unknown;
		try {
			koerper = await c.req.json();
		} catch {
			return c.json({ fehler: "Ungültiges JSON." }, 400);
		}

		const titel = typeof (koerper as { titel?: unknown })?.titel === "string"
			? ((koerper as { titel: string }).titel).trim()
			: "";
		if (titel === "") return c.json({ fehler: "Feld 'titel' fehlt oder ist leer." }, 400);

		const ergebnis = await c.var.repos.games.releaseAbtrennen(releaseId, titel);
		if (!ergebnis) return c.json({ fehler: "Release nicht gefunden." }, 404);
		return c.json(ergebnis);
	})

	.get("/:id", async (c) => {
		const id = Number(c.req.param("id"));
		if (!Number.isInteger(id)) return c.json({ fehler: "Ungültige Id." }, 400);

		const detail = await c.var.repos.games.spielDetail(id);
		if (!detail) return c.json({ fehler: "Spiel nicht gefunden." }, 404);
		return c.json(detail);
	});
