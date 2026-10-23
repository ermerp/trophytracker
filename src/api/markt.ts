import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types";
import { einesPruefen, MARKT_JE_POST, marktZeile, type MarktErgebnis } from "../sync/markt";
import { liesJson } from "./validierung";
import { meldungFuer } from "../ebay/client";
import { angebotWahlAus } from "../domain/markt";
import type { AngebotJeKanal } from "../db/markt";

/**
 * Die Meldungen eines Laufs der Action, als Code uebergeben (Stufe 20i). Die
 * Texte sind dieselben wie die des eBay-Clients, damit Verlauf und Warnung
 * dasselbe sagen wie bis 20i der Cron.
 */
const MARKT_MELDUNG = {
	ratenlimit: "Das eBay-Tageskontingent ist erschöpft.",
	zugang: "eBay hat die Zugangsdaten abgelehnt.",
	konfig: "eBay-Zugangsdaten sind nicht hinterlegt.",
	app: "Die Anwendung hat eine Portion nicht angenommen.",
} as const;

/** Ein Eintrag aus `ergebnisse` - oder null, wenn er nicht danach aussieht. */
function ergebnisAus(roh: unknown): { releaseId: number; angebote: AngebotJeKanal; rohangebote: number } | null {
	if (roh === null || typeof roh !== "object") return null;
	const e = roh as Record<string, unknown>;
	const { releaseId, rohangebote, angebote } = e;
	if (typeof releaseId !== "number" || !Number.isInteger(releaseId) || releaseId <= 0) return null;
	if (typeof rohangebote !== "number" || !Number.isInteger(rohangebote) || rohangebote < 0 || rohangebote > 10_000) return null;
	if (angebote === null || typeof angebote !== "object") return null;
	const raus: AngebotJeKanal = {};
	for (const [kanal, wahl] of Object.entries(angebote as Record<string, unknown>)) {
		if (kanal !== "haendler" && kanal !== "markt") return null;
		const gelesen = angebotWahlAus(wahl);
		if (gelesen === null) return null;
		raus[kanal] = gelesen;
	}
	return { releaseId, angebote: raus, rohangebote };
}

/**
 * Gebrauchtpreise und Disc-Nachweis aus eBay (Abschnitt 7.3, Stufe 20).
 *
 * Eigene Datei und nicht in `psn.ts`, obwohl der Pfad in dieselbe Familie
 * gehoert: Mit Sony hat der Schritt nichts zu tun.
 *
 * Der Knopf ist kein Luxus, sondern die Regel aus CLAUDE.md: Ergebnisse
 * einer Messung werden nie per Skript eingetragen - fehlt der Weg in der
 * Oberflaeche, wird er gebaut. Geschrieben wird ausschliesslich ueber
 * denselben Pfad wie im Cron.
 */
export const marktRoutes = new Hono<AppEnv>()
	/**
	 * Die Lage fuer einen Lauf der Markt-Action (Stufe 20i): alle faelligen
	 * Releases, die Sammlung und die Sperrliste in EINEM D1-Aufruf.
	 *
	 * Maschinen-Endpunkt wie `/api/backup/*`: Access steht vor dem Worker, die
	 * Action kommt mit dem Service Token `github-markt` (15.3) - keine eigene
	 * Token-Pruefung im Code. Kein eBay im Worker: Gefragt wird in der Action.
	 */
	.get("/markt/lage", async (c) => {
		return c.json(await c.var.repos.markt.lageFuerAction(c.var.repos.games.alleTitelBaustein()));
	})

	/**
	 * Die Ergebnisse einer Portion schreiben (Stufe 20i) - EIN Lese- und EIN
	 * Schreib-Batch, gleich wie viele Releases. Hoechstens MARKT_JE_POST, damit
	 * die Anweisungen unter den 50 je Aufruf bleiben.
	 *
	 * Vom Aufrufer kommen nur die Angebote. Titel, Plattform und Disc-Fassung
	 * liest die Route selbst: Von der Disc-Fassung haengt der Statuswechsel
	 * `unbekannt -> ja` samt Protokoll ab, und den entscheidet die Datenbank,
	 * nicht ein Koerper. Eine unbekannte Release-Id wird uebergangen und
	 * gezaehlt, nicht angelegt.
	 */
	.post("/markt/ergebnisse", async (c) => {
		const koerper = await liesJson(c);
		const liste = koerper?.ergebnisse;
		if (!Array.isArray(liste) || liste.length === 0 || liste.length > MARKT_JE_POST) {
			return c.json({ fehler: `Feld 'ergebnisse' muss 1 bis ${MARKT_JE_POST} Einträge haben.` }, 400);
		}
		const gelesen = liste.map(ergebnisAus);
		const kaputt = gelesen.findIndex((e) => e === null);
		if (kaputt >= 0) return c.json({ fehler: `Eintrag ${kaputt + 1} ist kein gültiges Ergebnis.` }, 400);
		const ergebnisse = gelesen as NonNullable<(typeof gelesen)[number]>[];

		const ziele = new Map(
			(await c.var.repos.markt.einige([...new Set(ergebnisse.map((e) => e.releaseId))])).map((z) => [z.releaseId, z]),
		);
		const schreiben = ergebnisse.flatMap((e) => {
			const ziel = ziele.get(e.releaseId);
			return ziel ? [{ ziel, angebote: e.angebote, rohangebote: e.rohangebote }] : [];
		});
		const geschrieben = await c.var.repos.markt.ergebnisseSchreiben(schreiben);
		return c.json({
			geprueft: geschrieben.length,
			mitPreis: geschrieben.filter((g) => g.preis !== null).length,
			discBelegt: geschrieben.filter((g) => g.discBelegt).length,
			ohneAngebot: schreiben.filter((s) => s.rohangebote === 0).length,
			unbekannt: ergebnisse.length - schreiben.length,
		});
	})

	/**
	 * Beginn und Ausgang eines Laufs der Markt-Action (Stufe 20i).
	 *
	 * Der Beginn wird VOR der Arbeit geschrieben, unter einem eigenen Bereich
	 * (`markt_begonnen`): Ein Lauf, der danach stirbt, erreicht kein `catch`
	 * und hinterliesse sonst nichts (CLAUDE.md, 10.1). Der Ausgang steht als
	 * Bereich `markt` in `cron_stand` und als Zeile im Verlauf - daran haengen
	 * die Betriebswarnungen (18m). Den Rest zaehlt die Route selbst, und die
	 * Meldung ist ein Code, kein Text: Fremdtext koennte ein Geheimnis zitieren.
	 */
	.post("/markt/ausgang", async (c) => {
		const koerper = await liesJson(c);
		const am = new Date().toISOString().slice(0, 16).replace("T", " ");
		if (koerper?.art === "begonnen") {
			await c.var.repos.sync.standVermerken("markt_begonnen", { am, getan: "markt", meldung: false });
			return c.json({ am });
		}
		const zahl = (k: string) => {
			const w = koerper?.[k];
			return typeof w === "number" && Number.isInteger(w) && w >= 0 ? w : null;
		};
		const zahlen = { geprueft: zahl("geprueft"), mitPreis: zahl("mitPreis"), discBelegt: zahl("discBelegt"), ohneAngebot: zahl("ohneAngebot") };
		const fehler = koerper?.fehler;
		if (koerper?.art !== "ende" || Object.values(zahlen).some((z) => z === null) || (fehler !== undefined && !(typeof fehler === "string" && fehler in MARKT_MELDUNG))) {
			return c.json({ fehler: "Erwartet: art 'begonnen' oder 'ende' mit vier Zahlen und optional einem Fehlercode." }, 400);
		}
		const meldung = typeof fehler === "string" ? MARKT_MELDUNG[fehler as keyof typeof MARKT_MELDUNG] : undefined;
		const ergebnis: MarktErgebnis = {
			status: meldung ? "fehler" : "erfolg",
			geprueft: zahlen.geprueft!,
			mitPreis: zahlen.mitPreis!,
			discBelegt: zahlen.discBelegt!,
			ohneAngebot: zahlen.ohneAngebot!,
			nochOffen: await c.var.repos.markt.faelligeAnzahl(),
			...(meldung ? { meldung } : {}),
		};
		// Der letzte pruefende Lauf steht eigens (Nachtrag 20i-b): Der juengste
		// Ausgang ist an einem normalen Tag der leere Rueckfall um 22:17.
		const wert = { am, getan: "markt", meldung: meldung !== undefined, offen: ergebnis.nochOffen, geprueft: ergebnis.geprueft };
		await c.var.repos.sync.cronAusgangVermerken(am, marktZeile(ergebnis), undefined, {
			fakt: [
				{ bereich: "markt", wert },
				...(ergebnis.geprueft > 0 ? [{ bereich: "markt_geprueft", wert }] : []),
			],
		});
		return c.json(ergebnis);
	})

	/**
	 * Ein Angebot verwerfen (Stufe 20h, Abschnitt 6).
	 *
	 * NICHTS WIRD GELOESCHT: Die Kennung kommt auf die Sperrliste des
	 * Releases, und damit ist sein Punkt im Verlauf gestrichen, WEIL er dort
	 * steht - eine Bedingung beim Lesen, kein zweiter Zustand. Die Ruecknahme
	 * loescht eine Zeile, und alle Punkte sind augenblicklich zurueck.
	 *
	 * Die Kennung WIRD MITGESCHICKT, nicht aus der Datenbank geraten: Hat der
	 * Nachtlauf das Angebot inzwischen ersetzt, antwortet die Route `409`
	 * statt stillschweigend das falsche zu verwerfen. Titel und Preis nimmt
	 * sie dann aus der eigenen Zeile - was in der Sperrliste steht, soll aus
	 * der Datenbank stammen und nicht aus dem Browser.
	 */
	.post("/markt/verwerfen", async (c) => {
		if (!c.var.ebay.konfiguriert()) {
			return c.json({ fehler: "eBay-Zugangsdaten sind nicht hinterlegt." }, 503);
		}
		const ziel = await zielAus(c);
		if ("fehler" in ziel) return c.json({ fehler: ziel.fehler }, 400);

		const angebot = await c.var.repos.markt.angebotNachKennung(ziel.releaseId, ziel.itemId);
		if (angebot === null) {
			return c.json(
				{ fehler: "Dieses Angebot liegt nicht mehr vor – es ist inzwischen ersetzt worden. Lade die Liste neu." },
				409,
			);
		}

		await c.var.repos.markt.verwerfen(ziel.releaseId, ziel.itemId, angebot.titel, angebot.preisCents);
		return neuAbrufen(c, ziel.releaseId);
	})

	/**
	 * Ein Verwerfen zuruecknehmen (Stufe 20h).
	 *
	 * Derselbe Neuabruf wie beim Verwerfen - sonst stuende die Liste bis zur
	 * naechsten Nacht auf dem Ersatzangebot, obwohl das verworfene wieder
	 * gilt. Ein "Rueckgaengig" stellt den Stand VOR der Aktion her, auch das,
	 * was der Schreibpfad nebenbei entfernt hat (CLAUDE.md).
	 */
	.post("/markt/verwerfen/ruecknahme", async (c) => {
		if (!c.var.ebay.konfiguriert()) {
			return c.json({ fehler: "eBay-Zugangsdaten sind nicht hinterlegt." }, 503);
		}
		const ziel = await zielAus(c);
		if ("fehler" in ziel) return c.json({ fehler: ziel.fehler }, 400);

		if (!(await c.var.repos.markt.ruecknahme(ziel.releaseId, ziel.itemId))) {
			return c.json({ fehler: "Dieses Angebot steht nicht auf der Sperrliste." }, 404);
		}
		return neuAbrufen(c, ziel.releaseId);
	})

	/**
	 * Was fuer dieses Release verworfen ist - fuer das Punktmenue am Preis.
	 *
	 * Eine eigene Route und keine Spalte in den Listen: Die Titel braucht nur
	 * die aufgeklappte Tafel, und sie in jede Zeile von vier Ansichten zu
	 * legen waere Lesekosten fuer etwas, das fast nie zu sehen ist. Die
	 * ANZAHL steht dagegen in den Listen (v_luecken, v_kaufkandidaten,
	 * PLAN_AUSWAHL) - sie sagt, dass es etwas zurueckzunehmen gibt.
	 */
	.get("/markt/verwerfen/:releaseId{[0-9]+}", async (c) => {
		const releaseId = Number(c.req.param("releaseId"));
		return c.json({ verworfene: await c.var.repos.markt.verworfene(releaseId) });
	})

	/** Wie weit der Bestand gefragt ist - fuer die Einstellungen. */
	.get("/markt", async (c) => {
		const stand = await c.var.repos.markt.stand();
		return c.json({ zugangsdaten: c.var.ebay.konfiguriert(), ...stand });
	});

/**
 * `{ releaseId, itemId }` aus dem Koerper. Die Kennung ist eine Zahlenfolge,
 * wie eBay sie vergibt - was nicht danach aussieht, wird abgewiesen statt
 * gespeichert: An ihr haengt, welches Angebot uebergangen wird.
 */
async function zielAus(c: {
	req: { json(): Promise<unknown> };
}): Promise<{ releaseId: number; itemId: string } | { fehler: string }> {
	const koerper = await liesJson(c);
	if (koerper === null) return { fehler: "Ungültiger JSON-Körper." };
	const releaseId = koerper.releaseId;
	const itemId = koerper.itemId;
	if (typeof releaseId !== "number" || !Number.isInteger(releaseId) || releaseId <= 0) {
		return { fehler: "Feld 'releaseId' muss eine Release-Id sein." };
	}
	if (typeof itemId !== "string" || !/^\d{1,20}$/.test(itemId)) {
		return { fehler: "Feld 'itemId' muss eine eBay-Angebotskennung sein." };
	}
	return { releaseId, itemId };
}

/**
 * Der Neuabruf nach einer Entscheidung - fuer beide Richtungen derselbe.
 *
 * Die Antwort nennt den neuen Preis, damit die Liste ihn sofort zeigt, und
 * die Sperrliste, damit das Punktmenue nicht nachfragen muss.
 *
 * SCHEITERT DER ABRUF, FEHLT `preis` GANZ - und das ist nicht dasselbe wie
 * `preis: null`. Null heisst "es gibt kein Angebot mehr", fehlend heisst
 * "wir wissen es gerade nicht" (CLAUDE.md: fehlender Schluessel und
 * ausdrueckliches null sind zwei Dinge). Die Entscheidung selbst steht
 * trotzdem fest - sie ist vor dem Abruf geschrieben und haengt nicht an eBay.
 */
async function neuAbrufen(c: Context<AppEnv>, releaseId: number) {
	const verworfene = await c.var.repos.markt.verworfene(releaseId);
	try {
		const ergebnis = await einesPruefen(c.var.repos, c.var.ebay, releaseId);
		if (ergebnis === null) return c.json({ fehler: "Release nicht gefunden." }, 404);
		if (ergebnis.status === "fehler") return c.json({ verworfene, meldung: ergebnis.meldung }, 200);
		return c.json({ verworfene, preis: ergebnis.preis }, 200);
	} catch (fehler) {
		// Nur eigene Texte, kein Fremdtext - er koennte ein Geheimnis zitieren.
		return c.json({ verworfene, meldung: meldungFuer(fehler) }, 200);
	}
}
