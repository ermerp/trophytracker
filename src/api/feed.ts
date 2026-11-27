import { Hono } from "hono";
import { beschreibeBuendel, beschreibeFeedTrophaeen, buendele, type FeedArt } from "../domain/ereignis";
import { seltenheitStufe } from "../domain/trophaee";
import type { AppEnv } from "../types";

/**
 * Der Feed des Dashboards (Abschnitt 8.5, GET /api/feed; Stufe 19b).
 *
 * **Zwei Quellen, zur Lesezeit nach Zeit gemischt:** das Aenderungsprotokoll
 * und die erspielten Einzeltrophaeen. Eine erspielte Trophaee ist kein
 * `game_event` - niemand hat etwas geschrieben, und 11 168 Zeilen Fremddaten
 * im Protokoll widersprechen "der Sync protokolliert nur Erkanntes".
 *
 * Das Aenderungsprotokoll (`/api/events`) behaelt daher seine eine Quelle und
 * sein Keyset ueber `id`: Zwei Zeitachsen liessen sich nicht ueber eine Id
 * blaettern. Der Feed braucht das nicht - er zeigt eine Handvoll Zeilen.
 *
 * **Wie viele, sagt der Aufrufer (`anzahl`, Stufe f2d), bis zu einer festen
 * Obergrenze.** Das Handy fragt ohne Parameter und bekommt acht wie vorher;
 * der Desktop fuellt die Hoehe der linken Spalte und fragt nach
 * `FEED_HOECHSTENS`. Ein Parameter statt "immer mehr", damit der Aufruf auf
 * dem Handy nicht mehr liest als noetig; die Obergrenze, damit kein Aufruf
 * den Feed zur Protokollseite macht. Ein ungueltiger Wert wird gekappt statt
 * mit 400 beantwortet - wie `limit` bei `/api/events`.
 *
 * **Solange die Erstbefuellung laeuft, kommen keine Trophaeenzeilen.** Das
 * Zeitfenster allein genuegt nicht: Die Befuellung geht Liste fuer Liste, nicht
 * nach Datum, und so erschiene tagelang eine Handvoll Zeilen mit
 * rueckdatiertem Zeitpunkt - ein Feed, der nach hinten waechst.
 */

/** Ohne Parameter - die Zahl des Handys. */
const ANZAHL = 8;
/** Mehr liefert die Route nicht; dieselbe Zahl wie `FEED_DESKTOP` im Frontend (`frontend/src/feedhoehe.ts`). */
export const FEED_HOECHSTENS = 20;

/** `anzahl` aus der Query: 1..FEED_HOECHSTENS, ohne oder ungueltig die acht. */
export function feedAnzahl(wert: string | undefined): number {
	const n = Math.trunc(Number(wert));
	return Math.min(FEED_HOECHSTENS, Math.max(1, Number.isFinite(n) && n !== 0 ? n : ANZAHL));
}

type Zeile = {
	/** Stabil ueber Neuladen, damit React nicht jede Zeile neu baut. */
	id: string;
	quelle: string;
	art: string;
	zeitpunkt: string;
	titel: string;
	spielId: number | null;
	text: string;
	/** Nachtrag f1c: die uebrigen Schritte eines Buendels; bei Trophaeen null. */
	zusatz: string | null;
};

/**
 * Ereignisse, die der Feed fuer `anzahl` Zeilen liest (Nachtrag f1c): Ein
 * Buendel fasst mehrere zusammen, also reicht `anzahl` nicht mehr - vier je
 * Zeile, wie ein neues Spiel aus IGDB mit Wunsch, hoechstens 80.
 */
export const feedEreignisse = (anzahl: number) => Math.min(80, anzahl * 4);

export const feedRoutes = new Hono<AppEnv>().get("/", async (c) => {
	const anzahl = feedAnzahl(c.req.query("anzahl"));
	// Nur die offenen Listen, nicht der ganze Bestand: Diese Route laeuft bei
	// jedem Oeffnen des Dashboards.
	const stand = await c.var.repos.trophaeen.offeneListen();
	const vollstaendig = stand.gesamt > 0 && stand.offen === 0;

	const [ereignisse, trophaeen] = await Promise.all([
		c.var.repos.events.liste({ quelle: null, limit: feedEreignisse(anzahl), vor: null }),
		vollstaendig ? c.var.repos.trophaeen.feed(anzahl) : Promise.resolve([]),
	]);

	const zeilen: Zeile[] = [
		...buendele(ereignisse.ereignisse)
			.map(beschreibeBuendel)
			.slice(0, anzahl)
			.map((b) => ({
				id: `e${b.id}`,
				quelle: b.haupt.source,
				art: b.haupt.kind,
				zeitpunkt: b.zuletzt,
				titel: b.titel,
				spielId: b.haupt.game_id,
				text: b.text,
				zusatz: b.zusatz,
			})),
		...trophaeen.map((t) => {
			const art: FeedArt = t.platin ? "platin_erspielt" : "trophaeen_erspielt";
			return {
				// Spiel und Tag sind je Zeile eindeutig - dieselbe Gruppierung
				// wie in der Abfrage.
				id: `t${art}-${t.spielId ?? 0}-${t.zeitpunkt}`,
				// Die Trophäe kommt von Sony, die Zeile traegt deshalb
				// dieselbe Quelle wie der Sync.
				quelle: "sync",
				art,
				zeitpunkt: t.zeitpunkt,
				titel: t.titel ?? "(ohne Spiel)",
				spielId: t.spielId,
				text: beschreibeFeedTrophaeen({ art, ...t }),
				zusatz: null,
			};
		}),
	];

	// Nach Zeit, nicht nach Quelle: Das ist der ganze Zweck des Mischens.
	zeilen.sort((a, b) => (a.zeitpunkt < b.zeitpunkt ? 1 : a.zeitpunkt > b.zeitpunkt ? -1 : 0));

	return c.json({ zeilen: zeilen.slice(0, anzahl), trophaeenVollstaendig: vollstaendig });
});

/**
 * Die Trophaeen eines Release (Spieldetail, Abschnitt 13).
 *
 * Je Release, nicht je Spiel: Ein Spiel mit PS4- und PS5-Fassung hat zwei
 * Trophaeenlisten mit eigenem Fortschritt.
 */
export const releaseTrophaeenRoutes = new Hono<AppEnv>().get("/:id/trophaeen", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id) || id <= 0) return c.json({ fehler: "Ungültige Id." }, 400);

	const [trophaeen, gruppen] = await Promise.all([
		c.var.repos.trophaeen.fuerRelease(id),
		c.var.repos.trophaeen.gruppenFuerRelease(id),
	]);

	return c.json({
		gruppen: gruppen.map((g) => ({ id: g.group_id, name: g.name })),
		trophaeen: trophaeen.map((t) => ({
			id: t.trophy_id,
			stufe: t.grade,
			name: t.name,
			beschreibung: t.detail,
			symbol: t.icon_url,
			versteckt: t.hidden === 1,
			gruppe: t.group_id,
			erspielt: t.earned === 1,
			erspieltAm: t.earned_at,
			// Zahl und Stufe: Die Stufe entsteht hier aus den gemessenen
			// Schwellen 5/15/50 und wird nie gespeichert (5.2). `null` bleibt
			// `null` - unbekannt ist nicht "haeufig" (Abschnitt 3).
			seltenheit: t.earned_rate,
			seltenheitStufe: seltenheitStufe(t.earned_rate),
			fortschritt:
				t.progress_target === null
					? null
					: { stand: t.progress_value ?? 0, ziel: t.progress_target },
		})),
	});
});

/**
 * Der Preisverlauf eines Release als Diagramm (Stufe 20f, Abschnitt 6).
 *
 * Kein 404 bei unbekannter Id: Ein Release ohne Punkte ist eine gueltige,
 * leere Antwort - am 11.10.2026 haben 265 von 490 Releases ueberhaupt
 * Punkte, "noch keine" ist der haeufigere Fall.
 *
 * `bis` kommt vom Server, nicht aus dem Browser: Die letzte Stufe der Treppe
 * laeuft bis heute, und eine falsch gestellte Uhr des Geraets zoege sie
 * sonst in die Zukunft.
 */
export const releasePreiseRoutes = new Hono<AppEnv>().get("/:id/preise", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id) || id <= 0) return c.json({ fehler: "Ungültige Id." }, 400);

	return c.json({
		bis: new Date().toISOString().slice(0, 19).replace("T", " "),
		punkte: await c.var.repos.preise.verlauf(id),
	});
});
