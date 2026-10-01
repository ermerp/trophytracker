import { Hono } from "hono";
import { beschreibeEreignis, beschreibeFeedTrophaeen, type FeedArt } from "../domain/ereignis";
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
 * blaettern. Der Feed braucht das nicht - er zeigt acht Zeilen.
 *
 * **Solange die Erstbefuellung laeuft, kommen keine Trophaeenzeilen.** Das
 * Zeitfenster allein genuegt nicht: Die Befuellung geht Liste fuer Liste, nicht
 * nach Datum, und so erschiene tagelang eine Handvoll Zeilen mit
 * rueckdatiertem Zeitpunkt - ein Feed, der nach hinten waechst.
 */

const ANZAHL = 8;

type Zeile = {
	/** Stabil ueber Neuladen, damit React nicht jede Zeile neu baut. */
	id: string;
	quelle: string;
	art: string;
	zeitpunkt: string;
	titel: string;
	spielId: number | null;
	text: string;
};

export const feedRoutes = new Hono<AppEnv>().get("/", async (c) => {
	const stand = await c.var.repos.trophaeen.fuellstand();
	const vollstaendig = stand.gesamt > 0 && stand.offen === 0;

	const [ereignisse, trophaeen] = await Promise.all([
		c.var.repos.events.liste({ quelle: null, limit: ANZAHL, vor: null }),
		vollstaendig ? c.var.repos.trophaeen.feed(ANZAHL) : Promise.resolve([]),
	]);

	const zeilen: Zeile[] = [
		...ereignisse.ereignisse.map((e) => ({
			id: `e${e.id}`,
			quelle: e.source,
			art: e.kind,
			zeitpunkt: e.occurred_at,
			titel: e.label,
			spielId: e.game_id,
			text: beschreibeEreignis(e),
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
			};
		}),
	];

	// Nach Zeit, nicht nach Quelle: Das ist der ganze Zweck des Mischens.
	zeilen.sort((a, b) => (a.zeitpunkt < b.zeitpunkt ? 1 : a.zeitpunkt > b.zeitpunkt ? -1 : 0));

	return c.json({ zeilen: zeilen.slice(0, ANZAHL), trophaeenVollstaendig: vollstaendig });
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
