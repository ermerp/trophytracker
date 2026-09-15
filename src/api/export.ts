import { Hono } from "hono";
import { platinAus, type Platin } from "./antwort";
import { liesJson } from "./validierung";
import { csvDokument, euroAusCents } from "../domain/csv";
import { PLAN_ARTEN, type PlanArt } from "../db/export";
import type { PlayStatus } from "../domain/play-status";
import type { AppEnv } from "../types";

/**
 * Export und Backup (Abschnitt 14, Use Case 13).
 *
 * Beide Endpunktgruppen tragen keine eigene Token-Pruefung: Die
 * Access-Richtlinie steht vor dem gesamten Worker (Abschnitt 15.3), Personen
 * melden sich im Browser an, die Backup-Action schickt ein Service Token.
 * Eine zweite Huerde im Worker waere ein zweiter Mechanismus fuer dieselbe
 * Frage - und ein zweites Geheimnis, das leaken kann.
 */

/** Deutsche Anzeigetexte der digitalen Quellen (Abschnitt 3). */
const QUELLENTEXT: Record<string, string> = {
	kauf: "Kauf",
	plus: "PS Plus",
	trial: "Testversion",
	sonstiges: "Sonstiges",
};

/**
 * Platin dreiwertig als Text. "offen" waere bei den 93 Listen ohne
 * Platin-Trophaee schlicht falsch (Abschnitt 4.1).
 */
const PLATINTEXT: Record<Platin, string> = {
	erspielt: "erspielt",
	offen: "offen",
	nicht_verfuegbar: "nicht vorgesehen",
};

/** Anzeigetexte der sieben Bewertungen (Abschnitt 4.2). */
const STATUSTEXT: Record<PlayStatus, string> = {
	nicht_gespielt: "nicht gespielt",
	am_spielen: "am Spielen",
	pausiert: "pausiert",
	durchgespielt: "durchgespielt",
	komplettiert: "komplettiert",
	abgebrochen: "abgebrochen",
	unentschieden: "unentschieden",
};

const KOPF_SAMMLUNG = [
	"Titel",
	"Plattform",
	"Disc-Fassung",
	"Exemplare",
	"Digital",
	"Fortschritt %",
	"Platin",
	"Status",
	"Bewertung",
	"Zuletzt gespielt",
];

const KOPF_TROPHAEEN = [
	"Rohtitel",
	"Plattform(en)",
	"Titel (zugeordnet)",
	"Fortschritt %",
	"Bronze erspielt",
	"Bronze definiert",
	"Silber erspielt",
	"Silber definiert",
	"Gold erspielt",
	"Gold definiert",
	"Platin erspielt",
	"Platin definiert",
	"Zuletzt gespielt",
	"Zugeordnet",
];

const KOPF_PLAN = [
	"Titel",
	"Plattform",
	"Favorit",
	"Position",
	"Notiz",
	"Herkunft",
	"Status",
	"Angelegt am",
];

const KOPF_LUECKEN = [
	"Titel",
	"Plattform",
	"Fortschritt %",
	"Platin erspielt",
	"Status",
	"Bester Gebrauchtpreis",
	"Verworfen",
];

export const CSV_LISTEN = ["sammlung", ...PLAN_ARTEN, "luecken", "trophaeen"] as const;
export type CsvListe = (typeof CSV_LISTEN)[number];

function istCsvListe(wert: string): wert is CsvListe {
	return (CSV_LISTEN as readonly string[]).includes(wert);
}

/** Quellenkuerzel aus GROUP_CONCAT in lesbaren Text. */
function digitalText(quellen: string | null): string | null {
	if (!quellen) return null;
	return quellen
		.split(",")
		.map((q) => QUELLENTEXT[q] ?? q)
		.join(", ");
}

/**
 * Fehlende play_status-Zeile bleibt leer statt "nicht gespielt".
 *
 * Die Sammlungsansicht behandelt sie beim Filtern als 'nicht_gespielt'; im
 * Export waere das eine Behauptung. Leer heisst hier "keine Bewertung
 * gesetzt", genau wie bei jedem anderen unbekannten Wert.
 */
function statusText(status: string | null): string | null {
	if (status === null) return null;
	return STATUSTEXT[status as PlayStatus] ?? status;
}

async function csvFuerListe(
	repos: AppEnv["Variables"]["repos"],
	liste: CsvListe,
): Promise<string> {
	if (liste === "sammlung") {
		const zeilen = await repos.export.listeSammlung();
		return csvDokument(
			KOPF_SAMMLUNG,
			zeilen.map((z) => [
				z.title,
				z.platform,
				z.physical_release_status,
				z.exemplare,
				digitalText(z.digital),
				z.progress_pct,
				z.progress_pct === null ? null : PLATINTEXT[platinAus(z.defined_platinum, z.earned_platinum)],
				statusText(z.status),
				z.rating,
				z.last_played_at,
			]),
		);
	}

	if (liste === "trophaeen") {
		const zeilen = await repos.export.listeTrophaeen();
		return csvDokument(
			KOPF_TROPHAEEN,
			zeilen.map((z) => [
				z.title_name,
				z.platform,
				z.title,
				z.progress_pct,
				z.earned_bronze,
				z.defined_bronze,
				z.earned_silver,
				z.defined_silver,
				z.earned_gold,
				z.defined_gold,
				z.earned_platinum,
				z.defined_platinum,
				z.last_played_at,
				z.release_id !== null,
			]),
		);
	}

	if (liste === "luecken") {
		const zeilen = await repos.export.listeLuecken();
		return csvDokument(
			KOPF_LUECKEN,
			zeilen.map((z) => [
				z.title,
				z.platform,
				z.progress_pct,
				z.hat_platin === 1,
				statusText(z.eigener_status),
				euroAusCents(z.bester_gebrauchtpreis_cents),
				z.verworfen === 1,
			]),
		);
	}

	const zeilen = await repos.export.listePlan(liste as PlanArt);
	return csvDokument(
		KOPF_PLAN,
		zeilen.map((z) => [
			z.titel,
			z.platform,
			z.is_favorite === 1,
			z.position,
			z.note,
			z.origin,
			z.status,
			z.created_at,
		]),
	);
}

export const exportRoutes = new Hono<AppEnv>()
	/**
	 * Vollsicherung als lesbare Zweitform zum SQL-Dump (Abschnitt 14.2).
	 *
	 * Ohne Blaetterung: rund 2.000 Zeilen, ein Aufruf je Woche. Eine
	 * Blaetterung waere hier der teurere Weg - sie liest dieselben Tabellen
	 * mehrfach.
	 */
	.get("/backup.json", async (c) => {
		const daten = await c.var.repos.export.alleTabellen();
		c.header("content-disposition", 'attachment; filename="backup.json"');
		return c.json(daten);
	})
	.get("/:datei", async (c) => {
		const datei = c.req.param("datei");
		if (!datei.endsWith(".csv")) return c.json({ fehler: "Unbekannter Export." }, 404);

		const liste = datei.slice(0, -".csv".length);
		if (!istCsvListe(liste)) {
			return c.json(
				{ fehler: `Unbekannte Liste '${liste}'. Möglich: ${CSV_LISTEN.join(", ")}.` },
				404,
			);
		}

		return new Response(await csvFuerListe(c.var.repos, liste), {
			headers: {
				"content-type": "text/csv; charset=utf-8",
				"content-disposition": `attachment; filename="${liste}.csv"`,
			},
		});
	});

const TAG_IN_MS = 24 * 60 * 60 * 1000;

/** Ganze Tage seit dem Zeitpunkt; null, wenn er fehlt oder unlesbar ist. */
function tageSeit(zeitpunkt: string | null): number | null {
	if (zeitpunkt === null) return null;
	const dann = Date.parse(zeitpunkt);
	if (Number.isNaN(dann)) return null;
	return Math.floor((Date.now() - dann) / TAG_IN_MS);
}

export const backupRoutes = new Hono<AppEnv>()
	.get("/status", async (c) => {
		const stand = await c.var.repos.export.letzteSicherung();
		return c.json({ ...stand, tageSeit: tageSeit(stand.letzterErfolgAm) });
	})
	/**
	 * Die Backup-Action meldet ihren Lauf. Auch ein Lauf ohne Commit ist ein
	 * Erfolg - "geprueft, nichts Neues" heisst, dass die Sicherung lief
	 * (Abschnitt 14.2).
	 */
	.post("/vermerk", async (c) => {
		const koerper = await liesJson(c);
		if (koerper === null) return c.json({ fehler: "Ungültiges JSON." }, 400);

		const zeitpunkt = koerper.zeitpunkt;
		if (typeof zeitpunkt !== "string" || Number.isNaN(Date.parse(zeitpunkt))) {
			return c.json({ fehler: "Feld 'zeitpunkt' muss ein ISO-Zeitpunkt sein." }, 400);
		}

		const commit = koerper.commit;
		if (commit !== undefined && commit !== null && typeof commit !== "string") {
			return c.json({ fehler: "Feld 'commit' muss Text sein." }, 400);
		}

		await c.var.repos.export.sicherungVermerken(zeitpunkt, commit ?? null);
		return c.json(await c.var.repos.export.letzteSicherung());
	});
