import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Migrationen einlesen und als Binding hereinreichen. Der Setup-File wendet
// sie je Testlauf an, damit die Tests gegen dasselbe Schema laufen wie
// Produktion - und nicht gegen eine handgepflegte Kopie.
const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

/*
 * Knappe Testausgabe (Stufe "Refactoring").
 *
 * Gemessen am 09.10.2026 ueber 58 Dateien und 851 Tests: Der Standardreporter
 * druckt 71 Zeilen, davon 58 das wiederholte "Using secrets defined in
 * .dev.vars" von Wrangler - einmal je Testdatei. `WRANGLER_LOG=error` nimmt
 * genau diese Zeilen und laesst echte Wrangler-Fehler stehen; uebrig bleiben
 * 13 Zeilen. Der Reporter `dot` waere schlechter, nicht besser: gemessene 209
 * Zeilen, weil er in einer Pipe je Datei eine Zeile schreibt und zusaetzlich
 * die Messwerte mitdruckt.
 *
 * Eine Zeile pro Umgebungsvariable, nicht ueber das npm-Skript: So gilt es
 * auch fuer `npx vitest run <datei>` und fuer die Deploy-Action.
 */
process.env.WRANGLER_LOG ??= "error";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				bindings: {
					TEST_MIGRATIONS: migrations,
					// Fester Testschluessel. Tests duerfen nie von einem echten
					// Secret abhaengen - und dieser Wert ist absichtlich
					// oeffentlich und nutzlos.
					NPSSO_KEY: "dGVzdHNjaGx1ZXNzZWwtZnVlci12aXRlc3QtMzJieXQ=",
				},
			},
		}),
	],
	test: {
		setupFiles: ["./test/setup-migrations.ts"],
		/*
		 * Die Messwerte aus `test/lesekosten.spec.ts` und `test/cron.spec.ts`
		 * mit `MESSWERTE=1 npm test` sichtbar machen.
		 *
		 * Vitest 4 bringt `silent: "passed-only"` als Standard mit: Die 20
		 * `console.info`-Ausgaben erscheinen von sich aus nur, wenn ein Test
		 * fehlschlaegt - im gruenen Lauf gar nicht, auch nicht im Terminal.
		 * Das ist die richtige Vorgabe, aber CLAUDE.md verlangt bei einem
		 * Refactoring "dieselben Messungen vorher und nachher, Zahl gegen
		 * Zahl", und die waren so ueberhaupt nicht zu lesen. Der Schalter
		 * holt sie auf Wunsch hervor, ohne den Alltag lauter zu machen.
		 *
		 * Beides ist noetig, gemessen am 09.10.2026: `silent: false` allein
		 * bleibt still, weil der Standardreporter ausserhalb eines Terminals
		 * die Konsole bestandener Tests gar nicht druckt. Erst `verbose`
		 * zusammen mit `silent: false` gibt die Zahlen heraus.
		 *
		 * Im Alltag bleibt `reporters` **ungesetzt**. Ein ausdrueckliches
		 * `["default"]` ist nicht dasselbe wie keine Angabe: Es druckt in
		 * einer Pipe je Testdatei eine Zeile und machte den Lauf von 13 auf
		 * 89 Zeilen laenger (gemessen 09.10.2026).
		 */
		...(process.env.MESSWERTE ? { reporters: ["verbose"] } : {}),
		silent: process.env.MESSWERTE ? false : "passed-only",
	},
});
