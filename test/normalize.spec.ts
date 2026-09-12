import { describe, it, expect } from "vitest";
import {
	NormalisierungsError,
	normalisiereSeite,
	platinStand,
} from "../src/domain/normalize";
import { SONDERFAELLE, fakeSeite, fakeTitel } from "./trophy-fixtures";

describe("normalisiereSeite", () => {
	it("bildet alle Felder ab", () => {
		const { titel } = normalisiereSeite(fakeSeite([fakeTitel(7)]));

		expect(titel[0]).toEqual({
			np_communication_id: "NPWR00007_00",
			np_service_name: "trophy",
			title_name: "Testspiel 7",
			platform: "PS4",
			icon_url: "https://beispiel.invalid/7.png",
			defined_bronze: 30,
			defined_silver: 8,
			defined_gold: 3,
			defined_platinum: 1,
			earned_bronze: 15,
			earned_silver: 4,
			earned_gold: 1,
			earned_platinum: 0,
			progress_pct: 45,
			last_played_at: "2025-03-14T09:12:00Z",
		});
	});

	it("laesst kommagetrennte Plattformen unveraendert", () => {
		// Cross-Gen-Titel teilen sich eine Trophaeenliste. Das Aufteilen ist
		// Aufgabe des Matchings in Stufe 4, nicht der Normalisierung.
		const { titel } = normalisiereSeite(fakeSeite([SONDERFAELLE.crossGen]));
		expect(titel[0].platform).toBe("PS3,PSVITA,PS4");
	});

	it("uebernimmt auch Plattformen ausserhalb der Sammlung", () => {
		const { titel } = normalisiereSeite(fakeSeite([SONDERFAELLE.fremdePlattform]));
		expect(titel[0].platform).toBe("PS5,PSPC");
	});

	it("verarbeitet eine ganze Seite", () => {
		const seite = fakeSeite(Array.from({ length: 100 }, (_, i) => fakeTitel(i)), 431);
		const { titel, verworfen } = normalisiereSeite(seite);

		expect(titel).toHaveLength(100);
		expect(verworfen).toBe(0);
	});

	it("zaehlt Eintraege ohne npCommunicationId, statt zu werfen", () => {
		const kaputt = { ...fakeTitel(1), npCommunicationId: "" };
		const { titel, verworfen } = normalisiereSeite(
			fakeSeite([fakeTitel(2), kaputt as never, fakeTitel(3)]),
		);

		expect(titel).toHaveLength(2);
		expect(verworfen).toBe(1);
	});

	it("zaehlt Eintraege ohne Titel", () => {
		const kaputt = { ...fakeTitel(1), trophyTitleName: "" };
		const { verworfen } = normalisiereSeite(fakeSeite([kaputt as never]));
		expect(verworfen).toBe(1);
	});

	it("macht aus fehlenden Zaehlern 0, nicht NaN", () => {
		const luecken = { ...fakeTitel(1), definedTrophies: {}, earnedTrophies: undefined };
		const { titel } = normalisiereSeite(fakeSeite([luecken as never]));

		expect(titel[0].defined_bronze).toBe(0);
		expect(titel[0].earned_platinum).toBe(0);
	});

	it("deckelt einen unsinnigen Fortschritt bei 100", () => {
		const { titel } = normalisiereSeite(fakeSeite([fakeTitel(1, { progress: 250 })]));
		expect(titel[0].progress_pct).toBe(100);
	});

	it("nimmt ein fehlendes Symbol als null", () => {
		const ohne = { ...fakeTitel(1), trophyTitleIconUrl: "" };
		const { titel } = normalisiereSeite(fakeSeite([ohne as never]));
		expect(titel[0].icon_url).toBeNull();
	});

	it("wirft bei unlesbarem JSON", () => {
		expect(() => normalisiereSeite("kein json")).toThrow(NormalisierungsError);
	});

	it("wirft, wenn trophyTitles fehlt", () => {
		expect(() => normalisiereSeite('{"totalItemCount":0}')).toThrow(/trophyTitles/);
	});

	it("kommt mit einer leeren Seite zurecht", () => {
		expect(normalisiereSeite(fakeSeite([]))).toEqual({ titel: [], verworfen: 0 });
	});
});

describe("platinStand", () => {
	it("meldet 'nicht_verfuegbar', wenn es gar keine Platin-Trophaee gibt", () => {
		// Der Fall, vor dem Abschnitt 4.1 warnt: 93 von 431 echten Titeln.
		expect(platinStand(0, 0)).toBe("nicht_verfuegbar");
	});

	it("meldet 'erspielt'", () => {
		expect(platinStand(1, 1)).toBe("erspielt");
	});

	it("meldet 'offen'", () => {
		expect(platinStand(1, 0)).toBe("offen");
	});
});
