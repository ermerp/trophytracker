import { describe, expect, it } from "vitest";
import marktYml from "../.github/workflows/markt.yml?raw";
import storeYml from "../.github/workflows/store.yml?raw";
import { aktionsZeilen, cronTermine, dauer, ordneZu } from "../scripts/preislaeufe.mjs";

const DATUM = "2026-11-25";
const TERMINE = ["13:17", "15:17"];
const SPAETER = Date.parse("2026-11-26T12:00:00Z");

function lauf(start: string, ende: string | null = start) {
	return {
		created_at: start,
		run_started_at: start,
		updated_at: ende ?? start,
		status: ende ? "completed" : "in_progress",
		conclusion: ende ? "success" : null,
		run_attempt: 1,
	};
}

const zeilen = (laeufe: unknown[], datum = DATUM, jetzt = SPAETER) =>
	aktionsZeilen({ datum, termine: TERMINE, laeufe, jetzt });

describe("cronTermine", () => {
	it("liest aktive Zeilen sortiert und laesst auskommentierte weg", () => {
		const text = `on:\n  schedule:\n    # - cron: "1 2 * * *"\n    - cron: "17 15 * * *"\n    - cron: '7 3 * * *' # Rueckfall\n`;
		expect(cronTermine(text)).toEqual({ termine: ["03:07", "15:17"], unlesbar: [] });
	});

	it("meldet jede andere Form", () => {
		for (const wert of ["*/5 0-2 * * *", "17 13 * * 1", "17 24 * * *", "60 1 * * *"]) {
			expect(cronTermine(`    - cron: "${wert}"`)).toEqual({ termine: [], unlesbar: [`"${wert}"`] });
		}
	});

	it("versteht die echten Workflow-Dateien", () => {
		for (const text of [marktYml, storeYml]) {
			const { termine, unlesbar } = cronTermine(text);
			expect(unlesbar).toEqual([]);
			expect(termine.length).toBeGreaterThan(0);
		}
	});
});

describe("Preislaeufe zuordnen", () => {
	it("ordnet der Reihenfolge nach zu, auch bei umgekehrter Lieferung", () => {
		const { grund, zeilen: z } = ordneZu(DATUM, TERMINE, [
			lauf("2026-11-24T23:55:13Z"),
			lauf("2026-11-24T23:01:45Z"),
		]);
		expect(grund).toBeNull();
		expect(z.map((x) => x.verspaetung)).toEqual([
			Date.parse("2026-11-24T23:01:45Z") - Date.parse("2026-11-24T13:17:00Z"),
			Date.parse("2026-11-24T23:55:13Z") - Date.parse("2026-11-24T15:17:00Z"),
		]);
	});

	it("rechnet ueber Mitternacht und nennt das Cron-Fenster", () => {
		const [erste, zweite] = zeilen([
			lauf("2026-11-24T23:01:45Z", "2026-11-24T23:10:34Z"),
			lauf("2026-11-25T00:07:33Z", "2026-11-25T00:07:57Z"),
		]);
		expect(erste).toMatch(/Plan 11-24 13:17 .*Start 11-24 23:01 .*Verspaetung 9:44 .*success .*Dauer 8:49 .*Cron-Fenster nein/);
		expect(zweite).toMatch(/Plan 11-24 15:17 .*Start 11-25 00:07 .*Verspaetung 8:50 .*Dauer 0:24 .*Cron-Fenster ja/);
	});

	it("zaehlt 05:00 nicht mehr zum Cron-Fenster", () => {
		const z = zeilen([lauf("2026-11-25T04:59:59Z"), lauf("2026-11-25T05:00:00Z")]);
		expect(z[0]).toContain("Cron-Fenster ja");
		expect(z[1]).toContain("Cron-Fenster nein");
	});

	it("ordnet bei einem Lauf zu wenig nichts zu", () => {
		// Nach beiden Terminen gestartet: Nur die Anzahl spricht dagegen.
		const z = zeilen([lauf("2026-11-24T23:01:45Z")]);
		expect(z[0]).toBe("Nicht zugeordnet: 1 Lauf bei 2 Terminen (13:17, 15:17).");
		expect(z[1]).toMatch(/Plan unbekannt .*Verspaetung unbekannt/);
		expect(z).toHaveLength(2);
	});

	it("ordnet bei einem Lauf zu viel nichts zu", () => {
		const z = zeilen([
			lauf("2026-11-24T20:00:00Z"),
			lauf("2026-11-24T21:00:00Z"),
			lauf("2026-11-24T22:00:00Z"),
		]);
		expect(z[0]).toContain("3 Laeufe bei 2 Terminen");
		expect(z.join()).not.toMatch(/Verspaetung \d/);
	});

	it("ordnet nichts zu, wenn ein Lauf vor seinem Termin liegt", () => {
		// Anzahl stimmt; der zweite Start liegt vor 15:17.
		const z = zeilen([lauf("2026-11-24T13:20:00Z"), lauf("2026-11-24T15:16:59Z")]);
		expect(z[0]).toMatch(/2 Laeufe bei 2 Terminen .*vor seinem Termin/);
		expect(z.join()).not.toMatch(/Verspaetung \d/);
	});

	it("nimmt nur Starts ab dem ersten Termin bis ausschliesslich zum naechsten", () => {
		const { zeilen: z } = ordneZu(DATUM, TERMINE, [
			lauf("2026-11-24T13:16:59Z"),
			lauf("2026-11-24T13:17:00Z"),
			lauf("2026-11-25T13:16:59Z"),
			lauf("2026-11-25T13:17:00Z"),
		]);
		expect(z.map((x) => x.lauf.created_at)).toEqual(["2026-11-24T13:17:00Z", "2026-11-25T13:16:59Z"]);
	});

	it("zeigt einen laufenden Lauf mit Status und ohne Dauer", () => {
		const z = zeilen([lauf("2026-11-24T23:01:45Z"), lauf("2026-11-24T23:55:13Z", null)]);
		expect(z[1]).toMatch(/Verspaetung 8:38 .*in_progress .*Dauer unbekannt/);
		expect(dauer({ status: "completed" })).toBe("unbekannt");
	});

	it("listet vor 18r-b nur auf, auch wenn Anzahl und Reihenfolge passten", () => {
		const z = zeilen([lauf("2026-11-23T20:00:00Z"), lauf("2026-11-23T22:00:00Z")], "2026-11-24");
		expect(z[0]).toMatch(/Vortag vor dem heutigen Zeitplan .*2 Laeufe/);
		expect(z.join()).not.toMatch(/Verspaetung \d/);
	});

	it("misst die Verspaetung eines wiederholten Laufs am ersten Versuch", () => {
		const wiederholt = {
			...lauf("2026-11-24T23:55:13Z", "2026-11-25T09:01:00Z"),
			run_started_at: "2026-11-25T09:00:00Z",
			run_attempt: 2,
		};
		const z = zeilen([lauf("2026-11-24T23:01:45Z"), wiederholt]);
		expect(z[1]).toMatch(/Verspaetung 8:38 .*Dauer 1:00 .*Versuch 2/);
	});

	it("sagt, wenn das Fenster noch nicht zu Ende ist", () => {
		const bis = Date.parse("2026-11-25T13:17:00Z");
		expect(zeilen([], DATUM, bis - 1)[0]).toContain("Fenster noch nicht zu Ende (bis 11-25 13:17)");
		expect(zeilen([], DATUM, bis).join()).not.toContain("noch nicht zu Ende");
	});
});
