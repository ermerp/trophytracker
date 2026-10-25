import { describe, expect, it } from "vitest";
import roh from "../.github/workflows/backup.yml?raw";
import skript from "../scripts/sicherung-ablegen.sh?raw";

/** Ohne Kommentare - die Datei erklaert die Regeln selbst. */
const workflow = roh.replace(/^[ \t]*#.*\n/gm, "");
const ablage = skript.replace(/^[ \t]*#.*\n/gm, "");

/** Die Schritte des einen Jobs, je Schritt sein Text ab `- `. */
const schritte = workflow
	.slice(workflow.indexOf("    steps:\n"))
	.split(/^ {6}- /m)
	.slice(1);
const name = (s: string) => /^(?:name|uses): (.+)$/m.exec(s)?.[1] ?? "";
const schritt = (n: string) => {
	const s = schritte.find((t) => name(t) === n);
	if (!s) throw new Error(`Schritt fehlt: ${n}`);
	return s;
};

/**
 * Der Dump wird abgelegt, auch wenn backup.json scheitert, und der Lauf endet
 * dann rot (Vorgabe des Nutzers vom 25.10.2026, 14.2). Bis dahin brach ein
 * gescheiterter JSON-Export den Lauf vor dem Schreiben ab, und der schon
 * gepruefte Dump derselben Woche ging mit verloren.
 *
 * Gelesen werden Workflow und Skript selbst, nicht eine Abschrift - ausfuehren
 * kann diese Testumgebung (workerd) beide nicht. Das Verhalten des Skripts ist
 * am 25.10.2026 gegen ein Wegwerf-Repository nachgewiesen.
 */
describe("Sicherung: Dump auch ohne JSON", () => {
	it("laesst den Lauf weiterlaufen, wenn der JSON-Export scheitert", () => {
		const json = schritt("JSON-Export holen");
		expect(json).toMatch(/^ {8}id: json$/m);
		expect(json).toMatch(/^ {8}continue-on-error: true$/m);
	});

	it("prueft, legt ab und vermerkt ohne Bedingung", () => {
		for (const n of ["Sicherung prüfen", "Dump auf Klartext prüfen", "Ins private Repository schreiben", "Erfolg in der App vermerken"]) {
			expect(schritt(n), n).not.toMatch(/^ {8}if:/m);
		}
	});

	it("reicht den Ausgang des JSON-Teils an die Ablage weiter", () => {
		const ablegen = schritt("Ins private Repository schreiben");
		expect(ablegen).toMatch(/JSON_OK: \$\{\{ steps\.json\.outcome == 'success' && 'ja' \|\| 'nein' \}\}/);
		expect(ablegen).toMatch(/scripts\/sicherung-ablegen\.sh export\b/);
	});

	it("endet rot, wenn der JSON-Teil gescheitert ist - als letzter Schritt, nach dem Vermerk", () => {
		const letzter = schritte.at(-1) ?? "";
		expect(name(letzter)).toBe("JSON-Teil gescheitert");
		expect(letzter).toMatch(/^ {8}if: steps\.json\.outcome == 'failure'$/m);
		expect(letzter).toMatch(/^ {10}exit 1$/m);
	});

	it("kopiert den Dump immer, backup.json nur nach gelungenem Export", () => {
		// Ausserhalb jedes if-Blocks: ohne Einrueckung.
		expect(ablage).toMatch(/^cp "\$export_dir\/backup\.sql" \.$/m);
		expect(ablage).not.toMatch(/^cp "\$export_dir\/backup\.json"/m);
		expect(ablage).toMatch(/^if \[ "\$json" = "ja" \]; then\n\tcp "\$export_dir\/backup\.json" \.\nfi$/m);
	});
});
