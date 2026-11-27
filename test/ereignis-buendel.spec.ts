import { describe, expect, it } from "vitest";
import { beschreibeBuendel, buendele, type Ereignis } from "../src/domain/ereignis";

/**
 * Buendel des Aenderungsprotokolls (Nachtrag f1c): reine Regeln ohne
 * Datenbank. Seitengrenze und Routen pruefen `events-repo.spec.ts`.
 */

let n = 100;
function e(teil: Partial<Ereignis>): Ereignis {
	return {
		id: n--,
		occurred_at: "2026-11-27 10:00:00",
		source: "nutzer",
		game_id: 1,
		release_id: null,
		label: "Glutmark",
		kind: "spiel_angelegt",
		field: null,
		old_value: null,
		new_value: null,
		detail: null,
		...teil,
	};
}

describe("buendele", () => {
	it("trennt, wenn ein anderes Spiel dazwischen steht", () => {
		const b = buendele([e({ game_id: 1 }), e({ game_id: 2 }), e({ game_id: 1 })]);
		expect(b.map((x) => x.length)).toEqual([1, 1, 1]);
	});

	it("buendelt nie Ereignisse ohne Spiel", () => {
		expect(buendele([e({ game_id: null }), e({ game_id: null })]).map((x) => x.length)).toEqual([1, 1]);
	});

	it("laesst eine Sekunde zu, zwei nicht - ein Rueckgaengig ist ein eigener Handgriff", () => {
		expect(buendele([e({ kind: "igdb_verknuepft", occurred_at: "2026-11-27 10:00:01" }), e({ occurred_at: "2026-11-27 10:00:00" })])).toHaveLength(1);
		expect(buendele([e({ kind: "igdb_verknuepft", occurred_at: "2026-11-27 10:00:02" }), e({ occurred_at: "2026-11-27 10:00:00" })])).toHaveLength(2);
	});

	it("haelt gleiche Schritte eines Aufrufs zusammen - Rueckgaengig oeffnet Wunsch und Kauf", () => {
		const b = buendele([
			e({ kind: "liste_eintrag_geaendert", field: "status" }),
			e({ kind: "liste_eintrag_geaendert", field: "status" }),
			e({ kind: "exemplar_geloescht" }),
		]);
		expect(b).toHaveLength(1);
	});
});

describe("beschreibeBuendel", () => {
	it("traegt das Erfassen vorn, erledigte Listen im Zusatz", () => {
		const b = beschreibeBuendel([
			e({ kind: "liste_eintrag_erledigt", field: "kauf", release_id: 5, label: "Glutmark (PS4)" }),
			e({ kind: "liste_eintrag_erledigt", field: "wunsch", release_id: 5, label: "Glutmark (PS4)" }),
			e({ kind: "exemplar_angelegt", release_id: 5, label: "Glutmark (PS4)" }),
		]);
		expect(b.text).toBe("Disc erfasst");
		expect(b.zusatz).toBe("Wunschliste: erledigt · Kaufliste: erledigt");
		expect(b.titel).toBe("Glutmark (PS4)");
	});

	it("nimmt die Plattform aus einem anderen Schritt, wenn der tragende keine kennt", () => {
		const b = beschreibeBuendel([e({ kind: "release_angelegt", release_id: 5, new_value: "PS5", label: "Glutmark (PS5)" }), e({ kind: "igdb_verknuepft" })]);
		expect(b.titel).toBe("Glutmark (PS5)");
		expect(b.text).toBe("Release angelegt: PS5");
		expect(b.zusatz).toBe("mit IGDB verknüpft");
	});

	it("traegt bei einem Rueckgaengig das Entfernen, nicht das Wiederoeffnen", () => {
		const b = beschreibeBuendel([e({ kind: "liste_eintrag_geaendert", field: "status", old_value: "erledigt", new_value: "offen" }), e({ kind: "exemplar_geloescht" })]);
		expect(b.text).toBe("Disc entfernt");
		expect(b.zusatz).toBe("Listeneintrag: erledigt → offen");
	});

	it("wiederholt den Hauptsatz nicht im Zusatz", () => {
		const b = beschreibeBuendel([e({ kind: "liste_eintrag_erledigt", field: "wunsch" }), e({ kind: "exemplar_angelegt" }), e({ kind: "liste_eintrag_angelegt", field: "kauf", new_value: "verworfen" })]);
		expect(b.text).toBe("Disc erfasst");
		expect(b.zusatz?.includes("Disc erfasst")).toBe(false);
	});

	it("sagt bei einem einzelnen Ereignis nichts dazu und nimmt seine Id", () => {
		const einzeln = e({ kind: "status_geaendert", old_value: "am_spielen", new_value: "pausiert" });
		expect(beschreibeBuendel([einzeln])).toMatchObject({ id: einzeln.id, zusatz: null, text: "Status: am Spielen → pausiert" });
	});

	it("traegt die kleinste Id und den juengsten Zeitpunkt", () => {
		const b = beschreibeBuendel([e({ kind: "igdb_verknuepft", occurred_at: "2026-11-27 10:00:02" }), e({ occurred_at: "2026-11-27 10:00:01" })]);
		expect(b.id).toBe(Math.min(...b.ids));
		expect(b.zuletzt).toBe("2026-11-27 10:00:02");
	});
});
