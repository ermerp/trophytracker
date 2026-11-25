/**
 * Preislaeufe fuer die Nachtauswertung: Cron-Zeilen lesen, Laeufe den
 * Terminen zuordnen, Block formatieren. Ohne Netz und ohne Dateien - Abruf
 * und Workflow-Text kommen von `nacht.mjs`, der Test vom Fixture.
 *
 * GitHub nennt den geplanten Termin eines Laufs nicht. Zugeordnet wird nur
 * der Reihenfolge nach (n-ter Start zu n-tem Termin), und nur, wenn es so
 * viele Laeufe wie Termine gibt und keiner vor seinem Termin liegt. Sonst
 * bleibt die Verspaetung "unbekannt" - geraten wird nie.
 */

/** Erster Tag, an dem alle heutigen Termine galten (Nachtrag 18r-b). */
export const ZEITPLAN_AB = "2026-11-24";

const TAG_MS = 86_400_000;
const FENSTER_MS = 5 * 3_600_000;
const UNBEKANNT = "unbekannt";

const zweistellig = (n) => String(n).padStart(2, "0");

/** Aktive `cron:`-Zeilen; `termine` als "HH:MM" aufsteigend, alles andere als "M H * * *" in `unlesbar`. */
export function cronTermine(text) {
	const termine = [];
	const unlesbar = [];
	for (const zeile of text.split(/\r?\n/)) {
		const treffer = zeile.match(/^\s*(?:-\s*)?cron:\s*(.*)$/);
		if (!treffer) continue;
		const wert = treffer[1].replace(/\s+#.*$/, "").trim();
		const form = wert.match(/^(["']?)(\d{1,2}) (\d{1,2}) \* \* \*\1$/);
		if (form && Number(form[2]) < 60 && Number(form[3]) < 24) {
			termine.push(`${zweistellig(form[3])}:${zweistellig(form[2])}`);
		} else unlesbar.push(wert);
	}
	return { termine: termine.sort(), unlesbar };
}

/** Der Tag vor `datum` (JJJJ-MM-TT): An ihm liegen die Termine. */
export const vortagVon = (datum) => new Date(Date.parse(`${datum}T00:00:00Z`) - TAG_MS).toISOString().slice(0, 10);

/** Vom ersten Termin am Vortag bis ausschliesslich zum ersten Termin an `datum`, in Millisekunden. */
export function startFenster(datum, termine) {
	const von = Date.parse(`${vortagVon(datum)}T${termine[0]}:00Z`);
	return { von, bis: von + TAG_MS };
}

/**
 * Laeufe im Fenster nach Start, je mit Plan und Verspaetung (ms) oder beides
 * `null`. Start ist `created_at`: `run_started_at` wandert bei einer
 * Wiederholung auf deren Beginn, der Termin gehoert aber zum ersten Versuch.
 *
 * @returns {{grund: string | null, zeilen: {lauf: any, start: number, plan: number | null, verspaetung: number | null}[]}}
 */
export function ordneZu(datum, termine, laeufe) {
	const { von, bis } = startFenster(datum, termine);
	const imFenster = laeufe
		.map((lauf) => {
			const start = Date.parse(lauf.created_at);
			if (Number.isNaN(start)) throw new Error("Lauf ohne lesbare Startzeit");
			return { lauf, start };
		})
		.filter((x) => x.start >= von && x.start < bis)
		.sort((a, b) => a.start - b.start);
	const plaene = termine.map((t) => Date.parse(`${vortagVon(datum)}T${t}:00Z`));

	let grund = null;
	if (vortagVon(datum) < ZEITPLAN_AB) grund = "zeitplan";
	else if (imFenster.length !== plaene.length) grund = "anzahl";
	else if (imFenster.some((x, i) => x.start < plaene[i])) grund = "vor_termin";

	return {
		grund,
		zeilen: imFenster.map(({ lauf, start }, i) => ({
			lauf,
			start,
			plan: grund ? null : plaene[i],
			verspaetung: grund ? null : start - plaene[i],
		})),
	};
}

const zeitpunkt = (ms) => new Date(ms).toISOString().slice(5, 16).replace("T", " ");

/** "h:mm", angebrochene Minuten abgeschnitten. */
export function stundenMinuten(ms) {
	const minuten = Math.floor(ms / 60_000);
	return `${Math.floor(minuten / 60)}:${zweistellig(minuten % 60)}`;
}

/** "m:ss"; ein Lauf, der noch nicht fertig ist, hat keine Dauer. */
export function dauer(lauf) {
	if (lauf.status !== "completed") return UNBEKANNT;
	const sekunden = Math.round((Date.parse(lauf.updated_at) - Date.parse(lauf.run_started_at)) / 1000);
	if (!(sekunden >= 0)) return UNBEKANNT;
	return `${Math.floor(sekunden / 60)}:${zweistellig(sekunden % 60)}`;
}

function laufZeile(datum, { lauf, start, plan, verspaetung }) {
	const nacht = Date.parse(`${datum}T00:00:00Z`);
	const imCron = start >= nacht && start < nacht + FENSTER_MS;
	return [
		`Plan ${(plan === null ? UNBEKANNT : zeitpunkt(plan)).padEnd(11)}`,
		`Start ${zeitpunkt(start)}`,
		`Verspaetung ${(verspaetung === null ? UNBEKANNT : stundenMinuten(verspaetung)).padEnd(9)}`,
		`${lauf.conclusion ?? lauf.status ?? UNBEKANNT}`.padEnd(11),
		`Dauer ${dauer(lauf).padEnd(9)}`,
		`Cron-Fenster ${imCron ? "ja" : "nein"}`,
		...(lauf.run_attempt > 1 ? [`Versuch ${lauf.run_attempt}`] : []),
	].join("  ");
}

const anzahl = (n, einzahl, mehrzahl) => `${n} ${n === 1 ? einzahl : mehrzahl}`;

/** Zeilen einer Action. `jetzt` in Millisekunden. */
export function aktionsZeilen({ datum, termine, laeufe, jetzt }) {
	const { grund, zeilen } = ordneZu(datum, termine, laeufe);
	const { bis } = startFenster(datum, termine);
	const stand = `${anzahl(zeilen.length, "Lauf", "Laeufe")} bei ${anzahl(termine.length, "Termin", "Terminen")}`;
	const aus = [];
	if (jetzt < bis) aus.push(`Fenster noch nicht zu Ende (bis ${zeitpunkt(bis)}) - Laeufe koennen noch dazukommen.`);
	if (grund === "zeitplan") {
		aus.push(`Vortag vor dem heutigen Zeitplan (18r-b, vollstaendig ab ${ZEITPLAN_AB}): ${anzahl(zeilen.length, "Lauf", "Laeufe")}, ohne Verspaetung.`);
	} else if (grund === "anzahl") {
		aus.push(`Nicht zugeordnet: ${stand} (${termine.join(", ")}).`);
	} else if (grund === "vor_termin") {
		aus.push(`Nicht zugeordnet: ${stand} (${termine.join(", ")}), aber ein Start liegt vor seinem Termin.`);
	}
	return [...aus, ...zeilen.map((z) => laufZeile(datum, z))];
}
