import type { Repositories } from "../db";
import type { GespielterTitel } from "../db/besitz";
import { absteigendNachLetztemSpiel, dauerInSekunden, plattformAusKategorie, spitzeReichtWeiter } from "../domain/psn-besitz";
import { titelSchluessel } from "../domain/titel";
import { PsnAbrufError, PsnAuthError, type PsnClient } from "../psn/client";

/**
 * Spielzeit und digitaler Besitz aus PSN holen (Abschnitt 7.7, Stufe 18c).
 *
 * Beide Schritte holen EINE Seite je Aufruf und halten den Fortschritt in
 * app_setting - wie der Trophaeen-Sync, aus demselben Grund (10-ms-Grenze,
 * Abschnitt 2). Die Rohantworten werden NICHT abgelegt: klein und jederzeit
 * neu abrufbar, dieselbe Begruendung wie bei IGDB (ausdrueckliche Ausnahme,
 * Entscheidung des Nutzers vom 22.09.2026).
 *
 * Zugeordnet wird wie bei den Trophaeenlisten (`ordneAutomatischZu`): ueber
 * den Titelschluessel, und nur bei GENAU EINEM Release mit passender
 * Plattform. Alles andere bleibt liegen - importiert wird nichts.
 */

export const GESPIELTE_JE_SEITE = 200;
/**
 * Die naechtliche Spitze (Stufe 18o, 7.7): Sony sortiert nach "zuletzt
 * gespielt", und in sieben Tagen wurde ein Titel gespielt, nicht 303. Fest
 * die ersten 25 statt nur der neuen, damit auch ein Titel vom Vortag noch
 * einmal geschrieben wird, dessen Spielzeit Sony erst spaeter nachzog.
 */
export const SPITZE_JE_SEITE = 25;
export const KAEUFE_JE_SEITE = 50;

/** "spitze" oder der Anlass des Volllaufs (Stufe 18o). */
export type SpielzeitLauf = "spitze" | "neu" | "frist" | "sortierung";

/** Wie `spielzeitSchritt` eine Seite holt; ohne Angabe wie der Volllauf. */
export type SpielzeitOptionen = {
	/** Nur die Spitze holen, zurueck bis zu diesem Zeitpunkt. */
	spitzeBis?: string;
	/**
	 * Was in den Schreib-Batch der Seite gehoert (Stand, Fehlerstatus) - das
	 * haengt am Ergebnis, deshalb erst hier bekannt.
	 */
	abschluss?: (e: { geholt: number; weiter: boolean; ungeordnet: boolean }) => D1PreparedStatement[];
};

export type SpielzeitErgebnis = {
	status: "erfolg" | "fehler";
	/** Titel der Seite, wie Sony sie liefert - VOR dem Plattformfilter. */
	geholt: number;
	/** Was den Filter ueberlebt hat und gespeichert wurde (PS4/PS5). */
	geschrieben: number;
	/** Teilmenge von `geschrieben`, die an genau einem Release haengt. */
	zugeordnet: number;
	weiter: boolean;
	meldung?: string;
	/** Spitze oder Volllauf mit Anlass (Stufe 18o) - setzt `spielzeitLauf`. */
	lauf?: SpielzeitLauf;
	/** Die Spitze kam nicht nach "zuletzt gespielt" sortiert (Stufe 18o). */
	ungeordnet?: boolean;
	/**
	 * Fehlversuche an DERSELBEN Seite, wenn dieser Aufruf einen hatte
	 * (Stufe 18f). Wie beim Sync seit 18e: Die Zahl gehoert in die
	 * Verlaufszeile, damit "dreimal dieselbe Seite" nicht wie "drei Seiten
	 * geholt" aussieht.
	 */
	versuche?: number;
};

export type BesitzErgebnis = {
	status: "erfolg" | "fehler";
	geholt: number;
	kauf: number;
	plus: number;
	/** Offene Kauf-/Wunscheintraege, die ein erkannter Kauf geschlossen hat (nur bei "nur digital"). */
	erledigt: number;
	entfallen: number;
	weiter: boolean;
	meldung?: string;
};

/** Eine Seite gespielter Titel holen, zuordnen und schreiben. */
export async function spielzeitSchritt(
	repos: Repositories,
	psn: PsnClient,
	accessToken: Parameters<PsnClient["holeGespielteSeite"]>[0],
	offset: number,
	optionen: SpielzeitOptionen = {},
): Promise<SpielzeitErgebnis> {
	try {
		const { spitzeBis } = optionen;
		const limit = spitzeBis === undefined ? GESPIELTE_JE_SEITE : SPITZE_JE_SEITE;
		const { gesamt, titel } = await psn.holeGespielteSeite(accessToken, offset, limit);

		// Streaming-Apps und Unbestimmtes fallen hier heraus, bevor
		// irgendetwas gespeichert wird.
		const gueltig = titel.flatMap((t) => {
			const plattform = plattformAusKategorie(t.category);
			return plattform && t.titleId && t.name
				? [{ t, titleId: t.titleId, name: t.name, plattform, schluessel: titelSchluessel(t.name) }]
				: [];
		});

		// Alle Kandidaten der Seite in EINEM D1-Aufruf (Stufe 18k) statt einer
		// Abfrage je Titel - dieselbe Regel wie `releaseZu`, nur gebuendelt.
		const kandidaten = await repos.games.releasesNachSchluesseln(
			gueltig.map((g) => g.schluessel).filter((s) => s !== ""),
		);

		let zugeordnet = 0;
		const gefiltert: GespielterTitel[] = gueltig.map(({ t, titleId, name, plattform, schluessel }) => {
			const passend = (kandidaten.get(schluessel) ?? []).filter((k) => k.platform === plattform);
			const releaseId = passend.length === 1 ? passend[0].id : null;
			if (releaseId !== null) zugeordnet++;
			return {
				titleId,
				name,
				platform: plattform,
				spielzeitSekunden: dauerInSekunden(t.playDuration),
				spielzahl: typeof t.playCount === "number" ? t.playCount : null,
				erstesSpielAm: t.firstPlayedDateTime ?? null,
				letztesSpielAm: t.lastPlayedDateTime ?? null,
				releaseId,
			};
		});

		// Geprueft wird, was gespeichert wird (PS4/PS5): Dafuer ist die
		// Reihenfolge gemessen, fuer die Streaming-Apps nicht.
		const ungeordnet = spitzeBis !== undefined && !absteigendNachLetztemSpiel(gueltig.map((g) => g.t));
		const weiter =
			offset + titel.length < gesamt &&
			titel.length > 0 &&
			!ungeordnet &&
			(spitzeBis === undefined || spitzeReichtWeiter(titel, spitzeBis));

		// Die ganze Seite in einem Batch (Stufe 18k), samt Stand (18o).
		const geschrieben = await repos.besitz.spielzeitSchreiben(
			gefiltert,
			optionen.abschluss?.({ geholt: titel.length, weiter, ungeordnet }),
		);

		return {
			status: "erfolg",
			geholt: titel.length,
			geschrieben,
			zugeordnet,
			weiter,
			...(ungeordnet ? { ungeordnet } : {}),
		};
	} catch (fehler) {
		return { status: "fehler", geholt: 0, geschrieben: 0, zugeordnet: 0, weiter: false, meldung: meldungFuer(fehler) };
	}
}

/**
 * Eine Seite der Kaufliste holen und in Berechtigungen uebersetzen.
 *
 * `gesehen` sammelt die Releases, die PSN in diesem Durchlauf als PS+ nennt.
 * Erst wenn ALLE Seiten geholt sind, raeumt der Aufrufer damit auf - ein
 * abgebrochener Lauf loescht nichts (7.7).
 */
export async function besitzSchritt(
	repos: Repositories,
	psn: PsnClient,
	accessToken: Parameters<PsnClient["holeKaeufeSeite"]>[0],
	start: number,
	gesehen: number[],
): Promise<BesitzErgebnis> {
	try {
		const { gesamt, eintraege } = await psn.holeKaeufeSeite(accessToken, start, KAEUFE_JE_SEITE);

		// Die ganze Seite in einem Lese- und einem Schreib-Batch (Stufe 18k-b)
		// statt zwei bis drei D1-Aufrufen je Eintrag. Zugeordnet wird wie
		// bisher: genau ein Release mit passender Plattform, sonst nichts -
		// zwei Treffer bedeuten, dass die Entscheidung dem Nutzer gehoert (7).
		const gueltig = eintraege.flatMap((e) =>
			e.name && e.platform
				? [{ e, plattform: e.platform.trim().toUpperCase(), schluessel: titelSchluessel(e.name) }]
				: [],
		);
		const kandidaten = await repos.games.releasesNachSchluesseln(
			gueltig.map((g) => g.schluessel).filter((s) => s !== ""),
			{ mitKauf: true },
		);
		const kaufNeu: number[] = [];
		const plusNeu: Array<{ id: number; hatKauf: boolean }> = [];
		for (const { e, plattform, schluessel } of gueltig) {
			const passend = (kandidaten.get(schluessel) ?? []).filter((k) => k.platform === plattform);
			if (passend.length !== 1) continue;
			const { id, hatKauf } = passend[0];
			if (e.subscriptionService === "PS_PLUS") {
				gesehen.push(id);
				plusNeu.push({ id, hatKauf: hatKauf === true });
			} else {
				kaufNeu.push(id);
			}
		}
		// Kauf schlaegt PS+: Wer gekauft hat, behaelt - da ist das Abo
		// gleichgueltig (Entscheidung des Nutzers vom 22.09.2026). Auch ein
		// Kauf auf DERSELBEN Seite zaehlt; bis 18k-b hing das an der
		// Reihenfolge der Eintraege.
		const gekauft = new Set(kaufNeu);
		const angelegt = await repos.besitz.berechtigungenErkennen({
			kauf: kaufNeu,
			plus: plusNeu.filter((p) => !p.hatKauf && !gekauft.has(p.id)).map((p) => p.id),
		});

		// Ein erkannter Kauf erledigt offene Kauf- und Wunscheintraege NUR,
		// wenn es das Spiel ausschliesslich digital gibt. Sonst koennte der
		// Wunsch der Disc gelten (Entscheidung des Nutzers vom 22.09.2026) -
		// die Ausnahme zur Regel aus Abschnitt 5, die beim Erfassen von Hand
		// ohne Rueckfrage greift. Selten (neu erkannte Kaeufe), deshalb je
		// Release einzeln ueber die Kopplung.
		let erledigt = 0;
		for (const releaseId of await repos.besitz.nurDigitalUnter(angelegt.kauf)) {
			const offen = await repos.plan.offeneAmZiel(["kauf", "wunsch"], { releaseId });
			erledigt += await repos.plan.erledigen(
				offen.map((o) => o.id),
				"besitz",
			);
		}
		const kauf = angelegt.kauf.length;
		const plus = angelegt.plus.length;

		const weiter = start + eintraege.length < gesamt && eintraege.length > 0;
		// Nur am Ende eines vollstaendigen Durchlaufs aufraeumen.
		const entfallen = weiter ? 0 : await repos.besitz.plusAufraeumen(gesehen);

		return { status: "erfolg", geholt: eintraege.length, kauf, plus, erledigt, entfallen, weiter };
	} catch (fehler) {
		return { status: "fehler", geholt: 0, kauf: 0, plus: 0, erledigt: 0, entfallen: 0, weiter: false, meldung: meldungFuer(fehler) };
	}
}

/**
 * Nur eigene Fehlertypen woertlich - kein Fremdtext, der ein Geheimnis
 * zitieren koennte.
 *
 * `PsnAbrufError` kam mit Stufe 18e dazu: Sein Text ist eine eigene
 * Schablone plus der HTTP-Status ("Abruf der Kaufliste antwortete mit 403."),
 * und genau der fehlte, als der Kauflisten-Schritt am 23.09.2026 stumm
 * scheiterte (7.7).
 */
function meldungFuer(fehler: unknown): string {
	if (fehler instanceof PsnAuthError || fehler instanceof PsnAbrufError) return fehler.message;
	return "Der PSN-Abruf ist fehlgeschlagen.";
}
