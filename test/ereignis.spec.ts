import { describe, it, expect } from "vitest";
import {
	EREIGNIS_ARTEN,
	beschreibeEreignis,
	istEreignisQuelle,
	quelleAusHerkunft,
	quelleAusMatch,
	type Ereignis,
} from "../src/domain/ereignis";

/**
 * Der Satz zu einem Ereignis (Abschnitt 8.5) wird zur Lesezeit gebildet.
 * Jede Art muss einen liefern, und fehlende Werte heissen "leer" - nie
 * "null" oder "-" (CLAUDE.md, dreiwertige Felder).
 */

function ereignis(teil: Partial<Ereignis>): Ereignis {
	return {
		id: 1,
		occurred_at: "2026-09-16 12:00:00",
		source: "nutzer",
		game_id: 1,
		release_id: 1,
		label: "Spiel (PS4)",
		kind: "status_geaendert",
		field: null,
		old_value: null,
		new_value: null,
		detail: null,
		...teil,
	};
}

describe("beschreibeEreignis", () => {
	it("liefert fuer jede Art einen Satz", () => {
		for (const kind of EREIGNIS_ARTEN) {
			const satz = beschreibeEreignis(ereignis({ kind, field: "x", old_value: "a", new_value: "b" }));
			expect(satz, kind).toBeTruthy();
			expect(satz, kind).not.toContain("undefined");
		}
	});

	it("uebersetzt Statuswerte und nennt alt → neu", () => {
		expect(beschreibeEreignis(ereignis({ kind: "status_geaendert", old_value: "am_spielen", new_value: "durchgespielt" }))).toBe(
			"Status: am Spielen → durchgespielt",
		);
		expect(
			beschreibeEreignis(ereignis({ kind: "status_geaendert", old_value: null, new_value: "am_spielen", detail: "aus der Prüfliste" })),
		).toBe("Status: leer → am Spielen (aus der Prüfliste)");
	});

	it("schreibt fehlende Werte als 'leer', nie als null", () => {
		const satz = beschreibeEreignis(ereignis({ kind: "bewertung_geaendert", field: "rating", old_value: null, new_value: "8" }));
		expect(satz).toBe("Bewertung: leer → 8");
		expect(satz).not.toContain("null");
	});

	it("nennt Liste und Anlass eines Eintrags", () => {
		expect(beschreibeEreignis(ereignis({ kind: "liste_eintrag_angelegt", field: "kauf", new_value: "offen", detail: "luecke" }))).toBe(
			"Auf Kaufliste gesetzt (aus Lücke)",
		);
		expect(beschreibeEreignis(ereignis({ kind: "liste_eintrag_angelegt", field: "backlog", new_value: "verworfen", detail: "manuell" }))).toBe(
			"Backlog: nicht vorgesehen (von Hand)",
		);
		expect(beschreibeEreignis(ereignis({ kind: "liste_eintrag_erledigt", field: "wunsch", detail: "besitz" }))).toBe(
			"Wunschliste: erledigt (durch Erfassen)",
		);
		expect(beschreibeEreignis(ereignis({ kind: "liste_eintrag_geaendert", field: "kind", old_value: "backlog", new_value: "todo", detail: "kopplung" }))).toBe(
			"Umgehängt: Backlog → To-Do (über die Bewertung)",
		);
	});

	it("nennt den Pruefgrund mit Vorher-Nachher", () => {
		expect(
			beschreibeEreignis(ereignis({ kind: "pruefliste_eingereiht", source: "sync", field: "dlc_erweitert", detail: "78 % → 60 %, Liste um 5 Trophäen gewachsen" })),
		).toBe("In die Prüfliste: neue DLC-Trophäen erschienen (78 % → 60 %, Liste um 5 Trophäen gewachsen)");
	});
});

describe("Quelle", () => {
	it("kommt aus der Herkunft eines Eintrags: nur der Import ist keine Handlung von Hand", () => {
		expect(quelleAusHerkunft("import")).toBe("import");
		for (const h of ["luecke", "wunsch", "manuell", "triage"]) expect(quelleAusHerkunft(h)).toBe("nutzer");
	});

	it("kommt aus der Art der Zuordnung: automatisch heisst Sync oder IGDB", () => {
		expect(quelleAusMatch("automatisch", "sync")).toBe("sync");
		expect(quelleAusMatch("automatisch", "igdb")).toBe("igdb");
		expect(quelleAusMatch("manuell", "igdb")).toBe("nutzer");
	});

	it("kennt genau die sechs Quellen", () => {
		for (const q of ["nutzer", "sync", "igdb", "import", "feed", "migration"]) expect(istEreignisQuelle(q)).toBe(true);
		expect(istEreignisQuelle("cron")).toBe(false);
		expect(istEreignisQuelle(null)).toBe(false);
	});
});
