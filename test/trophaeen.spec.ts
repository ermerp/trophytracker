import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../src/db";
import { Geheimnis } from "../src/domain/secret";
import {
	SELTENHEIT_SCHWELLEN,
	seltenheitStufe,
	verbindeGruppen,
	verbindeTrophaeen,
} from "../src/domain/trophaee";
import { erstellePsnClient } from "../src/psn/client";
import { eineListe, levelSchritt, PORTION, trophaeenPortion } from "../src/sync/trophaeen";
import { TOKEN_ANTWORT, fakeFetch, jsonAntwort, redirectAntwort, trophaeenRegeln } from "./psn-fake";

/**
 * Einzeltrophaeen (Stufe 19b, Abschnitt 7.7).
 *
 * Die reine Logik ohne Datenbank, der Fuellschritt gegen die lokale D1 mit
 * nachgebauten PSN-Antworten.
 */

const repos = () => createRepositories(env.DB, env.NPSSO_KEY);
const HEUTE = new Date().toISOString().slice(0, 10);

function psn(anzahl = 8, erspielt = 3, hatGruppen = false) {
	const { fetch, aufrufe } = fakeFetch([
		[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
		[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
		...trophaeenRegeln(anzahl, erspielt, hatGruppen),
	]);
	return { client: erstellePsnClient(fetch), aufrufe };
}

async function liste(id: string, dienst = "trophy", definiert = 8, erspielt = 3) {
	await env.DB.prepare(
		"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, " +
			"defined_bronze, earned_bronze, synced_at) VALUES (?, ?, ?, 'PS4', ?, ?, datetime('now'))",
	)
		.bind(id, dienst, `Titel ${id}`, definiert, erspielt)
		.run();
}

describe("Seltenheit", () => {
	// Gemessen am 01.10.2026 an 526 Trophaeen gegen Sonys eigenen trophyRare:
	// die Faecher enden bei 5, 15 und 50 Prozent.
	it("teilt an den gemessenen Schwellen", () => {
		expect(SELTENHEIT_SCHWELLEN).toEqual([5, 15, 50]);
		expect(seltenheitStufe(0.1)).toBe("ultra_selten");
		expect(seltenheitStufe(5)).toBe("ultra_selten");
		expect(seltenheitStufe(5.1)).toBe("sehr_selten");
		expect(seltenheitStufe(15)).toBe("sehr_selten");
		expect(seltenheitStufe(16.1)).toBe("selten");
		expect(seltenheitStufe(49.5)).toBe("selten");
		expect(seltenheitStufe(51.4)).toBe("haeufig");
	});

	// Abschnitt 3: Fehlendes ist unbekannt, niemals der haeufigste Fall.
	it("macht aus unbekannt kein haeufig", () => {
		expect(seltenheitStufe(null)).toBeNull();
		expect(seltenheitStufe(undefined)).toBeNull();
		expect(seltenheitStufe(Number.NaN)).toBeNull();
	});
});

describe("verbindeTrophaeen", () => {
	it("ordnet den Stand ueber die Id zu, nicht ueber die Reihenfolge", () => {
		const zeilen = verbindeTrophaeen(
			[
				{ trophyId: 7, trophyType: "gold", trophyName: "Spät" },
				{ trophyId: 1, trophyType: "bronze", trophyName: "Früh" },
			],
			// Absichtlich in anderer Reihenfolge als die Definitionen.
			[
				{ trophyId: 1, earned: true, earnedDateTime: "2026-01-01T00:00:00Z", trophyEarnedRate: "42.6" },
				{ trophyId: 7, earned: false },
			],
		);
		expect(zeilen).toHaveLength(2);
		expect(zeilen[0]).toMatchObject({ trophyId: 7, grade: "gold", earned: 0, earnedAt: null });
		expect(zeilen[1]).toMatchObject({ trophyId: 1, grade: "bronze", earned: 1, earnedRate: 42.6 });
	});

	it("liest Sonys Zahlen aus Text und laesst Fehlendes null", () => {
		const [z] = verbindeTrophaeen(
			[{ trophyId: 2, trophyType: "silver", trophyName: "Sammler", trophyProgressTargetValue: "20" }],
			[{ trophyId: 2, earned: false, progress: "15", progressRate: "75" }],
		);
		expect(z).toMatchObject({ progressTarget: 20, progressValue: 15, progressRate: 75, earnedRate: null });
	});

	// Der Fortschrittszaehler ist PS5-eigen (gemessen: 0 von 2 125 Trophaeen
	// in 45 PS3/PS4/Vita-Listen). Wo er fehlt, bleibt er LEER - nach
	// Abschnitt 3 niemals eine 0.
	it("laesst den Fortschritt leer, wo Sony ihn nicht erhebt", () => {
		const [z] = verbindeTrophaeen(
			[{ trophyId: 1, trophyType: "bronze", trophyName: "Ohne Zähler" }],
			[{ trophyId: 1, earned: false }],
		);
		expect(z.progressTarget).toBeNull();
		expect(z.progressValue).toBeNull();
	});

	it("gibt einer nicht erspielten Trophaee keinen Zeitpunkt", () => {
		const [z] = verbindeTrophaeen(
			[{ trophyId: 1, trophyType: "bronze", trophyName: "Offen" }],
			// Ein Zeitpunkt ohne `earned` waere widerspruechlich - PSN liefert
			// das nicht, aber die Zeile soll es auch dann nicht uebernehmen.
			[{ trophyId: 1, earned: false, earnedDateTime: "2026-01-01T00:00:00Z" }],
		);
		expect(z.earnedAt).toBeNull();
	});

	it("verwirft, was sich nicht zuordnen laesst", () => {
		const zeilen = verbindeTrophaeen(
			[
				{ trophyType: "bronze", trophyName: "Ohne Id" },
				{ trophyId: 3, trophyType: "unbekannt", trophyName: "Fremde Stufe" },
			],
			[],
		);
		expect(zeilen).toEqual([]);
	});

	it("nimmt versteckte Trophaeen mit Namen auf", () => {
		// Gemessen: 311 von 311 versteckten tragen Namen und Beschreibung.
		// Das Zudecken ist Sache der Anzeige, nicht der Daten (13).
		const [z] = verbindeTrophaeen(
			[{ trophyId: 1, trophyType: "gold", trophyName: "Das Ende", trophyDetail: "Erreiche es.", trophyHidden: true }],
			[{ trophyId: 1, earned: false }],
		);
		expect(z).toMatchObject({ hidden: 1, name: "Das Ende", detail: "Erreiche es." });
	});
});

describe("verbindeGruppen", () => {
	it("nimmt Hauptspiel und DLC mit ihren Zaehlern", () => {
		const g = verbindeGruppen([
			{ trophyGroupId: "default", trophyGroupName: "Hauptspiel", definedTrophies: { bronze: 5, silver: 2, gold: 1, platinum: 1 } },
			{ trophyGroupId: "001", trophyGroupName: "Zusatz" },
		]);
		expect(g[0]).toMatchObject({ groupId: "default", bronze: 5, platin: 1 });
		expect(g[1]).toMatchObject({ groupId: "001", name: "Zusatz", bronze: 0 });
	});
});

describe("Fuellschritt", () => {
	beforeEach(async () => {
		await env.DB.prepare("DELETE FROM trophy").run();
		await env.DB.prepare("DELETE FROM trophy_group").run();
		await env.DB.prepare("DELETE FROM trophy_progress").run();
		await env.DB.prepare("DELETE FROM app_setting WHERE key LIKE 'trophaeen%'").run();
		await repos().credentials.npssoSpeichern(new Geheimnis("npsso-test"));
	});

	it("holt eine Liste und stempelt sie, sodass sie nicht erneut gewaehlt wird", async () => {
		await liste("NPWR0001_00");
		const { client, aufrufe } = psn(8, 3);
		const { accessToken } = await (await import("../src/sync/run")).sitzungBesorgen(repos(), client);

		const ergebnis = await eineListe(repos(), client, accessToken, {
			npCommunicationId: "NPWR0001_00",
			npServiceName: "trophy",
		});
		expect(ergebnis.trophaeen).toBe(8);

		// Ohne DLC kein dritter Abruf: Die Zugehoerigkeit steht schon in den
		// Definitionen, der Gruppen-Endpunkt liefert nur Namen (7.7).
		expect(aufrufe.filter((a) => /trophyGroups\?/.test(a.url))).toHaveLength(0);

		// npServiceName ist Pflicht - ohne ihn antwortet PSN mit 404
		// (gemessen am 01.10.2026).
		expect(aufrufe.filter((a) => /npCommunicationIds/.test(a.url)).every((a) => a.url.includes("npServiceName=trophy"))).toBe(true);

		expect(await repos().trophaeen.naechsteZumFuellen(5)).toEqual([]);
	});

	it("holt die Gruppen nur, wenn die Liste welche hat", async () => {
		await liste("NPWR0002_00");
		const { client, aufrufe } = psn(8, 3, true);
		const { accessToken } = await (await import("../src/sync/run")).sitzungBesorgen(repos(), client);
		const ergebnis = await eineListe(repos(), client, accessToken, {
			npCommunicationId: "NPWR0002_00",
			npServiceName: "trophy",
		});
		expect(ergebnis.gruppen).toBe(2);
		expect(aufrufe.filter((a) => /trophyGroups\?/.test(a.url))).toHaveLength(1);
	});

	/**
	 * Der Fall, der den IGDB-Schritt in Stufe 18b zwei Naechte stillgelegt
	 * hat: Wer nur den Erfolg stempelt, waehlt eine Liste, die PSN nicht
	 * kennt, bis in alle Ewigkeit erneut.
	 */
	it("stempelt auch eine Liste, die PSN nicht kennt", async () => {
		await liste("NPWR9999_00");
		const { fetch } = fakeFetch([
			[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
			[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
			// Alles andere faellt auf den 404 des Fakes.
		]);
		const client = erstellePsnClient(fetch);
		const { accessToken } = await (await import("../src/sync/run")).sitzungBesorgen(repos(), client);

		const ergebnis = await eineListe(repos(), client, accessToken, {
			npCommunicationId: "NPWR9999_00",
			npServiceName: "trophy",
		});
		expect(ergebnis.trophaeen).toBeNull();
		expect(await repos().trophaeen.naechsteZumFuellen(5)).toEqual([]);
	});

	/**
	 * "Danach nur bei Aenderung" (7.7): Die Zaehlersumme der Liste ist der
	 * Ausloeser - eine neue Trophaee erspielt oder ein DLC erschienen.
	 */
	it("holt eine Liste erneut, sobald sich ihre Zaehler geaendert haben", async () => {
		await liste("NPWR0003_00", "trophy", 8, 3);
		const { client } = psn(8, 3);
		const { accessToken } = await (await import("../src/sync/run")).sitzungBesorgen(repos(), client);
		await eineListe(repos(), client, accessToken, { npCommunicationId: "NPWR0003_00", npServiceName: "trophy" });
		expect(await repos().trophaeen.naechsteZumFuellen(5)).toEqual([]);

		await env.DB.prepare("UPDATE trophy_progress SET earned_bronze = 4 WHERE np_communication_id = ?")
			.bind("NPWR0003_00")
			.run();
		expect(await repos().trophaeen.naechsteZumFuellen(5)).toHaveLength(1);
	});

	it("ersetzt die Trophaeen einer Liste, statt sie zu haeufen", async () => {
		await liste("NPWR0004_00");
		const { client } = psn(8, 3);
		const { accessToken } = await (await import("../src/sync/run")).sitzungBesorgen(repos(), client);
		const ziel = { npCommunicationId: "NPWR0004_00", npServiceName: "trophy" };
		await eineListe(repos(), client, accessToken, ziel);
		await eineListe(repos(), client, accessToken, ziel);
		expect((await repos().trophaeen.fuellstand()).gespeichert).toBe(8);
	});

	/**
	 * Zwei Grenzen, und die engere ist nicht die offensichtliche.
	 *
	 * Ein Worker-Aufruf darf hoechstens 50 Fremdanfragen machen (15.4) - das
	 * liesse vierzehn Listen zu. Entscheidend ist aber die DAUER: Vierzehn
	 * Listen sind rund zehn Sekunden in einer Anfrage, und so lange haelt
	 * eine Mobilfunkverbindung nicht zuverlaessig durch (Befund vom
	 * 01.10.2026). Vier Listen sind rund drei Sekunden.
	 */
	it("bleibt mit einer Portion weit unter den 50 Fremdanfragen je Aufruf", () => {
		// Drei Abrufe je Liste im schlimmsten Fall, dazu eine Token-Erneuerung.
		expect(PORTION * 3 + 1).toBeLessThanOrEqual(50);
		// Und kurz genug fuer eine Anfrage vom Handy: rund 0,3 s je Abruf.
		expect(PORTION * 3 * 0.3).toBeLessThan(5);
	});

	it("faehrt eine Portion und meldet, was offen bleibt", async () => {
		for (let i = 0; i < PORTION + 3; i++) await liste(`NPWR1${String(i).padStart(3, "0")}_00`);
		const { client } = psn(4, 1);
		const { accessToken } = await (await import("../src/sync/run")).sitzungBesorgen(repos(), client);

		const ergebnis = await trophaeenPortion(repos(), client, accessToken);
		expect(ergebnis.listen).toBe(PORTION);
		expect(ergebnis.trophaeen).toBe(PORTION * 4);
		expect(ergebnis.offen).toBe(3);
		expect(ergebnis.gesamt).toBe(PORTION + 3);
	});

	/**
	 * Abbruch bei einem Fehler (Entscheidung des Nutzers vom 01.10.2026: bei
	 * 429 aufhoeren). Was bis dahin geschrieben wurde, bleibt gestempelt
	 * stehen - der naechste Druck macht dort weiter.
	 */
	it("bricht die Portion bei einem Fehler ab und behaelt das Geschriebene", async () => {
		await liste("NPWR2001_00");
		await liste("NPWR2002_00");
		let gesehen = 0;
		const { fetch } = fakeFetch([
			[/oauth\/authorize/, () => redirectAntwort("v3.abc")],
			[/oauth\/token/, () => jsonAntwort(TOKEN_ANTWORT)],
			// Der eigene Stand ZUERST: Sein Pfad enthaelt denselben Rest wie
			// der der Definitionen, das breitere Muster faenge ihn sonst mit
			// ab - und der Zaehler zaehlte zwei Abrufe je Liste.
			[/users\/me\/npCommunicationIds/, () => jsonAntwort({ trophies: [] })],
			[
				/npCommunicationIds\/.*\/trophyGroups\/all\/trophies/,
				() => {
					gesehen += 1;
					// Die erste Liste gelingt, die zweite bekommt 429.
					return gesehen > 1 ? new Response("zu viel", { status: 429 }) : jsonAntwort({ totalItemCount: 2, trophies: [] });
				},
			],
		]);
		const client = erstellePsnClient(fetch);
		const { accessToken } = await (await import("../src/sync/run")).sitzungBesorgen(repos(), client);

		const ergebnis = await trophaeenPortion(repos(), client, accessToken);
		expect(ergebnis.listen).toBe(1);
		expect(ergebnis.meldung).toContain("429");
		expect(ergebnis.offen).toBe(1);
	});

	it("holt das Level hoechstens einmal am Tag", async () => {
		const { client, aufrufe } = psn();
		const { accessToken } = await (await import("../src/sync/run")).sitzungBesorgen(repos(), client);

		const erst = await levelSchritt(repos(), client, accessToken, HEUTE);
		expect(erst).toMatchObject({ level: 514, punkte: 310_380, bisNaechstes: 1_560, prozent: 13 });

		const zweit = await levelSchritt(repos(), client, accessToken, HEUTE);
		expect(zweit).toBeNull();
		expect(aufrufe.filter((a) => /trophySummary/.test(a.url))).toHaveLength(1);
	});
});
