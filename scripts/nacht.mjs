/**
 * Nachtauswertung der Cron-Fenster (16.2, `docs/spec/16-2-naechte.md`).
 *
 * Liest NUR Betriebszahlen von Cloudflare - CPU-Zeit, Standort, Ausgang und
 * Logzeile je Cron-Aufruf, gelesene Zeilen je Stunde -, keine Nutzerdaten.
 * Die Logzeilen des Crons enthalten nur Schrittnamen und Zahlen. Deshalb
 * darf das Skript ins Repository (CLAUDE.md, "Keine echten PSN-Daten").
 *
 * Drei Quellen, weil keine allein reicht (10.1):
 * - Telemetry (`view: events`): je Aufruf CPU-Zeit, Ausgang und Logzeile,
 *   die vollstaendige Quelle fuer die ZAHL der Aufrufe - aber ohne Standort
 *   bei Cron-Ereignissen. Aufruf und Logzeile sind zwei Ereignisse mit
 *   derselben `requestId`; der Aufruf traegt `$workers.outcome`.
 * - `workersInvocationsAdaptive`: Standort (`coloCode`) je Minute und
 *   Abbrueche (`exceededResources`), laesst aber einzelne Minuten aus.
 * - `d1AnalyticsAdaptiveGroups`: gelesene Zeilen je Stunde.
 *
 * Telemetry haelt rund sieben Tage. Gezaehlt werden die Fenster 03-09 UTC
 * des Datums und die Abendlaeufe ab 20 UTC des Vortags. Der Median gerader
 * Stichproben ist der Mittelwert der beiden mittleren Werte.
 *
 * Aufruf (Token mit Lesezugriff auf Analytics und Observability in der
 * Umgebung, nicht in `.dev.vars`):
 *
 *   node scripts/nacht.mjs 2026-11-01            # Kennzahlen
 *   node scripts/nacht.mjs 2026-11-01 --liste    # dazu jeder Aufruf
 */
import fs from "node:fs";

const [datum, ...schalter] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(datum ?? "")) {
	console.error("Aufruf: node scripts/nacht.mjs JJJJ-MM-TT [--liste]");
	process.exit(1);
}
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
	console.error("CLOUDFLARE_API_TOKEN fehlt in der Umgebung.");
	process.exit(1);
}

// Bezeichner, keine Zugangsdaten (CLAUDE.md) - aus der Konfiguration, nicht abgeschrieben.
const konfiguration = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const konto = konfiguration.match(/"account_id":\s*"([^"]+)"/)[1];
const datenbank = konfiguration.match(/"database_id":\s*"([^"]+)"/)[1];
const skript = konfiguration.match(/"name":\s*"([^"]+)"/)[1];

const beginn = `${datum}T03:00:00Z`;
const ende = `${datum}T09:00:00Z`;
const vortag = new Date(Date.parse(beginn) - 86_400_000).toISOString().slice(0, 10);

async function cloudflare(pfad, body) {
	const antwort = await fetch(`https://api.cloudflare.com/client/v4/${pfad}`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(30_000),
	});
	const j = await antwort.json();
	if (j.errors?.length) throw new Error(JSON.stringify(j.errors));
	return j;
}

const graphql = async (query, variables) => (await cloudflare("graphql", { query, variables })).data.viewer.accounts[0];

// --- Telemetry: jeder Aufruf mit CPU, Ausgang und Logzeile ---
const GRENZE = 2000;
const telemetry = await cloudflare(`accounts/${konto}/workers/observability/telemetry/query`, {
	queryId: `nacht-${Date.now()}`,
	view: "events",
	limit: GRENZE,
	timeframe: { from: Date.parse(beginn), to: Date.parse(ende) },
	parameters: { filters: [{ key: "$metadata.service", operation: "eq", type: "string", value: skript }] },
});
const ereignisse = telemetry.result.events?.events ?? [];
if (ereignisse.length >= GRENZE) console.warn(`Achtung: ${GRENZE} Ereignisse - die Telemetry hat abgeschnitten.`);

const jeAnfrage = new Map();
for (const e of ereignisse) {
	const id = e.$metadata.requestId;
	if (!jeAnfrage.has(id)) jeAnfrage.set(id, { logs: [] });
	const eintrag = jeAnfrage.get(id);
	if (e.$workers?.outcome) eintrag.aufruf = e;
	else eintrag.logs.push(typeof e.source?.message === "string" ? e.source.message : JSON.stringify(e.source));
}

// --- GraphQL: Standort je Minute, Ausgang je Stunde, Zeilen je Stunde ---
const zeitraum = { a: konto, f: beginn, t: ende };
const aufrufe = await graphql(
	`query($a:String!,$f:Time!,$t:Time!){viewer{accounts(filter:{accountTag:$a}){
	 workersInvocationsAdaptive(limit:5000,filter:{datetime_geq:$f,datetime_lt:$t,scriptName:"${skript}"}){
	  dimensions{datetimeMinute status coloCode} sum{requests}}}}}`,
	zeitraum,
);
const standort = new Map();
const ausgang = {};
for (const r of aufrufe.workersInvocationsAdaptive) {
	const minute = r.dimensions.datetimeMinute.slice(11, 16);
	standort.set(minute, [...(standort.get(minute) ?? []), r.dimensions.coloCode]);
	ausgang[r.dimensions.status] = (ausgang[r.dimensions.status] ?? 0) + r.sum.requests;
}

const zeilen = await graphql(
	`query($a:String!,$f:Time!,$t:Time!){viewer{accounts(filter:{accountTag:$a}){
	 d1AnalyticsAdaptiveGroups(limit:100,filter:{datetimeHour_geq:$f,datetimeHour_lt:$t,databaseId:"${datenbank}"}){
	  dimensions{datetimeHour} sum{rowsRead rowsWritten}}}}}`,
	{ a: konto, f: `${vortag}T20:00:00Z`, t: ende },
);
const zeilenJeStunde = new Map(
	zeilen.d1AnalyticsAdaptiveGroups.map((r) => [r.dimensions.datetimeHour.slice(0, 13), r.sum.rowsRead]),
);
const summeStunden = (von, bis) =>
	[...zeilenJeStunde].filter(([h]) => h >= von && h < bis).reduce((s, [, n]) => s + n, 0);

// --- Zusammenfuehren ---
const liste = [...jeAnfrage.values()]
	.filter((x) => x.aufruf?.$workers.eventType === "scheduled")
	.map((x) => {
		const w = x.aufruf.$workers;
		// Die Minute des Plans, nicht des Endes: Ein Aufruf um 06:10 kann 06:11 enden.
		const minute = new Date(w.event.scheduledTime * 1000).toISOString().slice(11, 16);
		const log = x.logs.find((l) => l.startsWith("cron: ")) ?? "";
		const [schritt, bereich] = log.replace("cron: ", "").split(" ");
		return {
			minute,
			ausgang: w.outcome,
			cpu: w.cpuTimeMs,
			colo: (standort.get(minute) ?? ["?"]).join(","),
			schritt: schritt || "(keine Logzeile)",
			bereich: bereich?.replace("bereich=", "") ?? "?",
			log,
		};
	})
	.sort((a, b) => a.minute.localeCompare(b.minute));

function median(werte) {
	const a = [...werte].sort((x, y) => x - y);
	const n = a.length;
	return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

// --- Ausgabe ---
if (schalter.includes("--liste")) {
	for (const x of liste) console.log(x.minute, x.ausgang, String(x.cpu).padStart(3), x.colo.padEnd(4), "|", x.log.slice(6, 200));
	console.log();
}

const nichtOk = liste.filter((x) => x.ausgang !== "ok");
console.log(`Nacht zum ${datum} (03-09 UTC)`);
console.log(`  Cron-Aufrufe in der Telemetry: ${liste.length}, davon nicht ok: ${nichtOk.length}`);
for (const x of nichtOk) console.log(`    ${x.minute} ${x.ausgang} ${x.cpu} ms ${x.colo}`);
console.log(`  workersInvocationsAdaptive: ${Object.entries(ausgang).map(([s, n]) => `${s} ${n}`).join(", ")}`);
const ohneStandort = liste.filter((x) => x.colo === "?").map((x) => x.minute);
if (ohneStandort.length) console.log(`  ohne Standort (fehlt in GraphQL): ${ohneStandort.join(", ")}`);
console.log(`  Standorte: ${new Set(liste.map((x) => x.colo).filter((c) => c !== "?")).size}`);
console.log();

const gruppen = new Map();
for (const x of liste) {
	const name = `${x.bereich}/${x.schritt}`;
	gruppen.set(name, [...(gruppen.get(name) ?? []), x]);
}
console.log("  Schritt                       n   Median  min-max  >10  >15");
for (const [name, xs] of gruppen) {
	const cpu = xs.map((x) => x.cpu);
	console.log(
		`  ${name.padEnd(28)} ${String(xs.length).padStart(2)}  ${String(median(cpu)).padStart(6)}  ${`${Math.min(...cpu)}-${Math.max(...cpu)}`.padStart(7)}  ${String(cpu.filter((c) => c > 10).length).padStart(3)}  ${String(cpu.filter((c) => c > 15).length).padStart(3)}`,
	);
}
const leerlaufUeber10 = liste.filter((x) => x.schritt === "nichts" && x.cpu > 10);
console.log(`  Leerlauf ueber 10 ms: ${leerlaufUeber10.map((x) => `${x.colo} ${x.cpu} (${x.bereich})`).join(", ") || "keiner"}`);
console.log();

console.log("  Gelesene Zeilen (d1AnalyticsAdaptiveGroups):");
console.log(`    PSN-Fenster 03-06 UTC: ${summeStunden(`${datum}T03`, `${datum}T06`)}`);
console.log(`    Wartung 06-09 UTC:     ${summeStunden(`${datum}T06`, `${datum}T09`)}`);
console.log(`    Abend ${vortag} 20 UTC bis 03 UTC: ${summeStunden(`${vortag}T20`, `${datum}T03`)}`);
console.log(`    je Stunde: ${[...zeilenJeStunde].sort().map(([h, n]) => `${h.slice(5)} ${n}`).join("  ")}`);
