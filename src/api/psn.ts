import { Hono } from "hono";
import type { SyncLauf } from "../db/sync";
import { npssoAusText } from "../domain/npsso";
import { Geheimnis } from "../domain/secret";
import { PsnAuthError } from "../psn/client";
import { heuteIso } from "../domain/igdb";
import { besitzLauf, besitzStand } from "../sync/cron";
import { normalisierungWiederholen, sitzungBesorgen, syncSchritt } from "../sync/run";
import { knopfStand, levelStand, SCHLUESSEL_KNOPF, trophaeenPortion } from "../sync/trophaeen";
import type { AppEnv } from "../types";

/**
 * Abschnitt 12: NPSSO-Eingabe und Sync.
 *
 * Keine Antwort dieser Routen enthaelt jemals NPSSO, Refresh- oder Access
 * Token - auch nicht gekuerzt. Durchgesetzt wird das durch die Huelle
 * Geheimnis, geprueft von test/keine-lecks.spec.ts.
 */
export const psnRoutes = new Hono<AppEnv>()
	.post("/settings/npsso", async (c) => {
		let koerper: unknown;
		try {
			koerper = await c.req.json();
		} catch {
			return c.json({ fehler: "Ungültiges JSON." }, 400);
		}

		const roh = (koerper as { npsso?: unknown })?.npsso;
		if (typeof roh !== "string" || roh.trim() === "") {
			return c.json({ fehler: "Feld 'npsso' fehlt oder ist leer." }, 400);
		}

		// Seit Stufe 19e nimmt die Route ALLES an, was der Nutzer einfuegt:
		// den blanken Wert, das ganze JSON von Sonys Seite, die ganze Seite.
		// Das Heraussuchen war der unangenehmste Schritt des Vorgangs - auf
		// einem Handydisplay das Markieren von 64 Zeichen zwischen zwei
		// Anfuehrungszeichen (Wunsch des Nutzers vom 29.09.2026).
		const erkannt = npssoAusText(roh);
		if (!erkannt) {
			return c.json(
				{
					fehler:
						"Darin steckt kein Zugang. Erwartet werden 64 Zeichen aus Buchstaben und Ziffern - " +
						"der ganze Text von Sonys Seite reicht.",
				},
				400,
			);
		}

		const npsso = new Geheimnis(erkannt.wert);
		const psn = c.var.psn;

		// Erst pruefen, dann speichern: Ein ungueltiges NPSSO soll den
		// hinterlegten Wert nicht ueberschreiben.
		let sitzung;
		try {
			sitzung = await psn.tokenAusNpsso(npsso);
		} catch (fehler) {
			const meldung =
				fehler instanceof PsnAuthError
					? fehler.message
					: "Das NPSSO konnte nicht geprüft werden.";
			return c.json({ fehler: meldung }, 400);
		}

		await c.var.repos.credentials.npssoSpeichern(npsso, erkannt.laeuftAbUm);
		await c.var.repos.credentials.refreshTokenSpeichern(
			sitzung.refreshToken,
			sitzung.refreshLaeuftAbUm,
		);

		return c.json({ gespeichert: true, ...(await c.var.repos.credentials.anzeige()) });
	})

	.post("/sync", async (c) => {
		const ergebnis = await syncSchritt(c.var.repos, c.var.psn);
		return c.json(ergebnis, ergebnis.status === "fehler" ? 502 : 200);
	})

	/**
	 * Normalisierung erneut ausfuehren - ohne PSN-Zugriff.
	 * Der eigentliche Zweck der Trennung aus Abschnitt 7.1.
	 */
	.post("/sync/normalize", async (c) => {
		const ergebnis = await normalisierungWiederholen(c.var.repos);
		if (!ergebnis) {
			return c.json({ fehler: "Es gibt keinen abgeschlossenen Lauf zum Wiederholen." }, 409);
		}
		return c.json({ zurueckgesetzt: ergebnis.seiten, laufId: ergebnis.laufId, weiter: true });
	})

	/**
	 * Eine Seite der Kaufliste, von Hand (Stufe 18e, 7.7).
	 *
	 * Der Schritt lief bisher ausschliesslich woechentlich im Cron - und als
	 * er am 23.09.2026 stumm scheiterte, gab es keinen Weg, ihn anzusehen,
	 * ohne bis zum naechsten Termin zu warten. Genau dieser Fall ist gemeint
	 * mit "fehlt der Weg in der Oberflaeche, wird er gebaut" (CLAUDE.md): Der
	 * Nutzer stoesst den Abruf an, die Antwort nennt Zahlen und Meldung, und
	 * geschrieben wird ausschliesslich ueber denselben Pfad wie im Cron.
	 *
	 * `erzwingen` ueberspringt die Sieben-Tage-Frist, nicht die Blaetterung:
	 * Ein halber Durchlauf wird fortgesetzt, und aufgeraeumt wird erst nach
	 * der letzten Seite (7.7).
	 */
	.post("/sync/besitz", async (c) => {
		const ergebnis = await besitzLauf(c.var.repos, c.var.psn, heuteIso(), { erzwingen: true });
		if (!ergebnis) return c.json({ fehler: "Die Kaufliste ist nicht abrufbar." }, 409);
		return c.json(ergebnis, ergebnis.status === "fehler" ? 502 : 200);
	})

	/**
	 * Eine Portion Einzeltrophaeen holen (Stufe 19b, 7.7).
	 *
	 * Der Hauptweg zur Erstbefuellung: Die Oberflaeche ruft so lange nach,
	 * bis `offen` null ist - 431 Listen sind rund 31 Aufrufe und zusammen
	 * etwa vier Minuten. Ein einzelner Aufruf kann es nicht schaffen, weil
	 * ein Worker hoechstens 50 Fremdanfragen machen darf (15.4).
	 *
	 * **Hoechstens ein Durchlauf je Tag, und zwar wegen der Schreibgrenze,
	 * nicht wegen PSN** (Entscheidung des Nutzers vom 01.10.2026): 18 355
	 * Trophaeen sind rund 29 500 geschriebene Zeilen von 100 000 am Tag. Ein
	 * zweiter vollstaendiger Durchlauf am selben Tag waere die Haelfte des
	 * Budgets, ein dritter naehme der Anwendung das Schreiben.
	 *
	 * Die Sperre gilt dem NEUEN Durchlauf, nicht der Fortsetzung: Wer heute
	 * begonnen hat und nach einem Abbruch weitermacht, soll das koennen.
	 * Gezaehlt wird deshalb der Tag, an dem zuletzt gedrueckt wurde, und
	 * gesperrt wird nur, wenn an diesem Tag schon alles gefuellt war.
	 */
	.post("/sync/trophaeen", async (c) => {
		const heute = heuteIso();
		const vorher = await c.var.repos.trophaeen.fuellstand();
		if (vorher.offen === 0) {
			return c.json({ listen: 0, trophaeen: 0, ...vorher, meldung: "Es ist nichts offen." });
		}

		const { accessToken } = await sitzungBesorgen(c.var.repos, c.var.psn);
		const ergebnis = await trophaeenPortion(c.var.repos, c.var.psn, accessToken);

		// **Der Ausgang wird aufgeschrieben, nicht nur zurueckgegeben** (Lehre
		// aus 18e, hier nachgetragen am 01.10.2026). Am ersten Abend blieb der
		// Knopf zweimal stehen, und beide Male war hinterher nicht
		// festzustellen warum: Die Meldung stand nur im Browser des Nutzers,
		// und dort an einer Stelle, die er nicht sah. Jetzt ueberlebt sie das
		// Neuladen und ist ueber GET lesbar.
		await c.var.repos.sync.fortschrittSetzenWert(
			SCHLUESSEL_KNOPF,
			JSON.stringify({ tag: heute, am: new Date().toISOString(), ...ergebnis }),
		);
		return c.json(ergebnis);
	})

	/** Wie weit die Erstbefuellung ist - fuer den Fortschritt am Knopf. */
	.get("/sync/trophaeen", async (c) => {
		const [stand, level, letzte] = await Promise.all([
			c.var.repos.trophaeen.fuellstand(),
			levelStand(c.var.repos),
			knopfStand(c.var.repos),
		]);
		return c.json({ ...stand, level, letzte });
	})

	/**
	 * Zustand fuer Einstellungen und Hinweisblock. `letzterAutomatischerLauf`
	 * (Stufe 18) ist der juengste Lauf des Cron - der Hinweisblock meldet
	 * daraus einen fehlgeschlagenen Nachtlauf, den niemand am Bildschirm sah.
	 */
	.get("/sync/status", async (c) => {
		const [lauf, cronLauf, cronVerlauf, zugang, trophaeen, besitz, zugaenge] = await Promise.all([
			c.var.repos.sync.letzterLauf(),
			c.var.repos.sync.letzterLauf("cron"),
			c.var.repos.sync.cronVerlauf(),
			c.var.repos.credentials.anzeige(),
			c.var.repos.trophies.anzahl(),
			besitzStand(c.var.repos),
			c.var.repos.credentials.zugaenge(),
		]);

		return c.json({
			zugang,
			trophaeen,
			letzterLauf: laufAntwort(lauf),
			letzterAutomatischerLauf: laufAntwort(cronLauf),
			// Was die letzten Cron-Aufrufe taten, neueste zuerst - auch die, die
			// gar keinen Lauf anfassten (Stufe 18b).
			cronVerlauf,
			// Wann die Kaufliste zuletzt vollstaendig durchlief und wann sie
			// zuletzt scheiterte (Stufe 18e): Der Unterschied war vorher nicht
			// zu sehen, und genau daran blieb der Fehler aus 18c vier Tage
			// unbemerkt.
			besitz: { fertigAm: besitz.fertigAm ?? null, fehlerAm: besitz.fehlerAm ?? null, laeuft: typeof besitz.start === "number" },
			// Wie lange die bisherigen Zugaenge gehalten haben (Stufe 19e).
			// Nur `gestorben` ist eine Messung - `ersetzt` heisst, der Nutzer
			// hat frueher erneuert, und wie lange der Zugang gehalten haette,
			// erfaehrt niemand (7.1).
			zugaenge: zugaenge.map((z) => ({
				eingetragenAm: z.eingetragen_am,
				angekuendigtBis: z.angekuendigt_bis,
				letzterErfolgAm: z.letzter_erfolg_am,
				ausgang: z.gestorben_am !== null ? "gestorben" : z.ersetzt_am !== null ? "ersetzt" : "offen",
				endeAm: z.gestorben_am ?? z.ersetzt_am,
			})),
		});
	});

function laufAntwort(lauf: SyncLauf | null) {
	if (!lauf) return null;
	return {
		id: lauf.id,
		status: lauf.status,
		phase: lauf.phase,
		ausloeser: lauf.started_by,
		gestartetAm: lauf.started_at,
		beendetAm: lauf.finished_at,
		titlesSeen: lauf.titles_seen,
		offset: lauf.next_offset,
		meldung: lauf.error_message,
	};
}
