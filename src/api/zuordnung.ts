import { Hono } from "hono";
import {
	BESITZ_FILTER,
	DISC_FILTER,
	JA_NEIN,
	PLATIN_FILTER,
	SORTIERUNGEN,
	type ReleaseZeile,
	type SpieleFilter,
} from "../db/games";
import { bildeGruppen } from "../domain/gruppen";
import { istErlaubtePlattform, titelSchluessel } from "../domain/titel";
import type { AppEnv } from "../types";
import { exemplarAntwort } from "./ownership";

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

/** Nimmt einen Query-Wert nur an, wenn er in der erlaubten Liste steht; sonst undefined. */
function ausWahl<T extends string>(wert: string | undefined, erlaubt: readonly T[]): T | undefined {
	return wert !== undefined && (erlaubt as readonly string[]).includes(wert) ? (wert as T) : undefined;
}

/** Platin dreiwertig: 93 der 431 Listen haben gar kein Platin, dort waere "offen" falsch. */
function platinAus(definiert: number | null, erspielt: number | null): "erspielt" | "offen" | "nicht_verfuegbar" {
	if ((definiert ?? 0) === 0) return "nicht_verfuegbar";
	return (erspielt ?? 0) > 0 ? "erspielt" : "offen";
}

function releaseAntwort(r: ReleaseZeile) {
	return {
		id: r.id,
		plattform: r.platform,
		discFassung: r.physical_release_status,
		fortschritt: r.progress_pct,
		platin: r.progress_pct === null ? null : platinAus(r.defined_platinum, r.earned_platinum),
		zuletztGespielt: r.last_played_at,
		exemplare: r.exemplare,
		digital: r.digital ? r.digital.split(",") : [],
	};
}

/**
 * Abschnitt 12: GET /api/games mit Filtern.
 *
 * Unbekannte Filterwerte werden ignoriert, nicht mit 400 beantwortet: Ein
 * alter Link mit einem Wert, den es nicht mehr gibt, soll die Liste zeigen,
 * nicht eine Fehlermeldung.
 */
export const gameRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const q = c.req.query();
		const plattform = q.platform !== undefined && istErlaubtePlattform(q.platform) ? q.platform : undefined;
		const filter: SpieleFilter = {
			platform: plattform,
			owned: ausWahl(q.owned, BESITZ_FILTER),
			played: ausWahl(q.played, JA_NEIN),
			platinum: ausWahl(q.platinum, PLATIN_FILTER),
			physicalAvailable: ausWahl(q.physicalAvailable, DISC_FILTER),
			search: q.search ?? "",
			sort: ausWahl(q.sort, SORTIERUNGEN) ?? "titel",
			limit: Math.min(200, Math.max(1, Number(q.limit) || 50)),
			offset: Math.max(0, Number(q.offset) || 0),
		};
		const { zeilen, releases, gesamt } = await c.var.repos.games.spieleListe(filter);

		const releasesJeSpiel = new Map<number, ReleaseZeile[]>();
		for (const r of releases) {
			const liste = releasesJeSpiel.get(r.game_id);
			if (liste) liste.push(r);
			else releasesJeSpiel.set(r.game_id, [r]);
		}

		return c.json({
			gesamt,
			limit: filter.limit,
			offset: filter.offset,
			sort: filter.sort,
			spiele: zeilen.map((z) => ({
				id: z.id,
				titel: z.title,
				bild: z.cover_url ?? z.icon_url,
				zuletztGespielt: z.zuletzt_gespielt,
				releases: (releasesJeSpiel.get(z.id) ?? []).map(releaseAntwort),
			})),
		});
	})

	/**
	 * Spiel von Hand anlegen, ohne Trophaeenliste.
	 *
	 * Gibt es schon ein Spiel mit demselben Titelschluessel, kommt 409 mit
	 * den Kandidaten zurueck - der Nutzer entscheidet, ob er ein Release
	 * dort anhaengt oder mit `trotzdem` ein zweites Spiel anlegt.
	 */
	.post("/", async (c) => {
		let koerper: unknown;
		try {
			koerper = await c.req.json();
		} catch {
			return c.json({ fehler: "Ungültiges JSON." }, 400);
		}
		const k = koerper as { titel?: unknown; plattform?: unknown; trotzdem?: unknown };

		const titel = typeof k?.titel === "string" ? k.titel.trim() : "";
		if (titel === "") return c.json({ fehler: "Feld 'titel' fehlt oder ist leer." }, 400);
		if (typeof k?.plattform !== "string" || !istErlaubtePlattform(k.plattform)) {
			return c.json({ fehler: `Unbekannte Plattform: ${String(k?.plattform)}` }, 400);
		}

		if (k.trotzdem !== true) {
			const kandidaten = await c.var.repos.games.spieleNachSchluessel(titelSchluessel(titel));
			if (kandidaten.length > 0) {
				return c.json(
					{
						fehler: "Ein Spiel mit diesem Titel gibt es schon.",
						kandidaten: kandidaten.map((g) => ({
							spielId: g.id,
							titel: g.title,
							plattformen: g.plattformen ? g.plattformen.split(",") : [],
						})),
					},
					409,
				);
			}
		}

		const ergebnis = await c.var.repos.games.spielAnlegen(titel, k.plattform);
		return c.json({ spielId: ergebnis.gameId, releaseId: ergebnis.releaseId, titel }, 201);
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
		const besitz = await c.var.repos.ownership.copiesForGame(id);

		return c.json({
			id: detail.spiel.id,
			titel: detail.spiel.title,
			bild: detail.spiel.cover_url ?? detail.releases.find((r) => r.icon_url)?.icon_url ?? null,
			igdbId: detail.spiel.igdb_id,
			releases: detail.releases.map((r) => ({
				id: r.id,
				plattform: r.platform,
				edition: r.edition,
				region: r.region,
				discFassung: r.physical_release_status,
				discQuelle: r.physical_source,
				trophaeen:
					r.np_communication_id === null
						? null
						: {
								npCommunicationId: r.np_communication_id,
								rohTitel: r.title_name,
								fortschritt: r.progress_pct,
								platin: platinAus(r.defined_platinum, r.earned_platinum),
								erspielt: {
									bronze: r.earned_bronze,
									silber: r.earned_silver,
									gold: r.earned_gold,
									platin: r.earned_platinum,
								},
								definiert: {
									bronze: r.defined_bronze,
									silber: r.defined_silver,
									gold: r.defined_gold,
									platin: r.defined_platinum,
								},
								zuletztGespielt: r.last_played_at,
							},
				exemplare: besitz.exemplare.filter((e) => e.release_id === r.id).map(exemplarAntwort),
				digital: besitz.digital
					.filter((d) => d.release_id === r.id)
					.map((d) => ({ id: d.id, quelle: d.source, erworbenAm: d.acquired_at })),
			})),
		});
	})

	/** Spiel loeschen; Trophaeenlisten fallen in die Zuordnung zurueck. */
	.delete("/:id", async (c) => {
		const id = Number(c.req.param("id"));
		if (!Number.isInteger(id)) return c.json({ fehler: "Ungültige Id." }, 400);

		const ergebnis = await c.var.repos.games.spielLoeschen(id);
		if (!ergebnis) return c.json({ fehler: "Spiel nicht gefunden." }, 404);
		return c.json({ id, geloescht: true, ...ergebnis });
	});
