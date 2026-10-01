import type { Repositories } from "../db";
import { verbindeGruppen, verbindeTrophaeen } from "../domain/trophaee";
import type { Geheimnis } from "../domain/secret";
import type { PsnClient } from "../psn/client";

/**
 * Einzeltrophaeen holen (Stufe 19b, Abschnitt 7.7).
 *
 * Zwei Wege zur selben Arbeit, beide ueber `eineListe`:
 *
 * - der naechtliche Cron-Schritt, eine Liste je Aufruf (10.1),
 * - der Portionsknopf in den Einstellungen, vierzehn Listen je Aufruf.
 *
 * Der Knopf ist seit der Messung vom 01.10.2026 der HAUPTWEG: Die ganze
 * Erstbefuellung dauert rund vier Minuten, nicht drei Wochen. Der Cron bleibt
 * als Netz und fuer die Nachfuehrung - er fragt "naechste Liste ohne
 * Trophaeen", und das ist dieselbe Abfrage wie "naechste geaenderte Liste".
 */

/**
 * Vier Listen je Aufruf.
 *
 * **Nicht die Obergrenze, sondern die Dauer entscheidet.** Zuerst standen
 * hier vierzehn, abgeleitet aus den 50 erlaubten Fremdanfragen je
 * Worker-Aufruf (15.4). Die Rechnung stimmte, der Zuschnitt nicht: Vierzehn
 * Listen sind rund dreissig PSN-Abrufe und damit **zehn Sekunden und mehr in
 * einer einzigen Anfrage**. Auf einem Handy ist das eine Ewigkeit - am
 * 01.10.2026 blieb der Knopf dreimal stehen, und beim dritten Mal war
 * nachweisbar, dass die Portion davor sauber durchlief (14 Listen, 401
 * Trophaeen, keine Meldung) und die naechste Anfrage einfach nie antwortete.
 *
 * Vier Listen sind rund neun Abrufe und drei Sekunden. Das sind 108 Anfragen
 * fuer den ganzen Bestand statt 31 - aber jede einzelne ist kurz genug, um
 * eine Mobilfunkverbindung zu ueberleben, und der Fortschritt bewegt sich
 * sichtbar oefter.
 */
export const PORTION = 4;

/** Der Stand in app_setting: wann zuletzt ein Knopfdurchlauf lief. */
export const SCHLUESSEL_KNOPF = "trophaeen_knopf_tag";
/** Level und Punkte aus trophySummary, zuletzt geholt am. */
export const SCHLUESSEL_LEVEL = "trophaeen_level";
/** Trophaeen je Jahr, einmal je Nacht gerechnet (Stufe 19b). */
export const SCHLUESSEL_JAHRE = "trophaeen_jahre";

export type ListenErgebnis = {
	npCommunicationId: string;
	/** `null`, wenn PSN die Liste nicht (mehr) kennt - gestempelt wird trotzdem. */
	trophaeen: number | null;
	gruppen: number;
};

export type PortionErgebnis = {
	listen: number;
	trophaeen: number;
	offen: number;
	gesamt: number;
	/** Warum die Portion endete, wenn sie nicht durchlief. */
	meldung?: string;
};

export type LevelStand = {
	level: number;
	punkte: number;
	bisNaechstes: number;
	prozent: number;
	standAm: string;
};

/**
 * Eine Liste holen und schreiben.
 *
 * Der dritte Abruf laeuft nur, wenn die Definitionen `hasTrophyGroups` sagen -
 * gemessen bei 18 % der Listen (7.7). Die Zugehoerigkeit JEDER Trophaee steht
 * ohnehin schon in den Definitionen; der Abruf holt nur die Gruppennamen.
 *
 * Kennt PSN die Liste nicht (404), wird sie mit null Trophaeen gestempelt.
 * Das ist Absicht: Ohne Stempel waehlt der naechste Aufruf dieselbe Liste
 * wieder, und der Schritt dreht sich im Kreis (Migration 0027).
 */
export async function eineListe(
	repos: Repositories,
	psn: PsnClient,
	accessToken: Geheimnis,
	liste: { npCommunicationId: string; npServiceName: string },
): Promise<ListenErgebnis> {
	const { npCommunicationId, npServiceName } = liste;

	const definitionen = await psn.holeTrophaeen(accessToken, npCommunicationId, npServiceName);
	if (definitionen === null) {
		await repos.trophaeen.schreibeListe(npCommunicationId, [], []);
		return { npCommunicationId, trophaeen: null, gruppen: 0 };
	}

	const stand = await psn.holeTrophaeenStand(accessToken, npCommunicationId, npServiceName);
	const zeilen = verbindeTrophaeen(definitionen.definitionen, stand ?? []);

	const gruppen = definitionen.hatGruppen
		? verbindeGruppen((await psn.holeTrophaeenGruppen(accessToken, npCommunicationId, npServiceName)) ?? [])
		: [];

	await repos.trophaeen.schreibeListe(npCommunicationId, zeilen, gruppen);
	return { npCommunicationId, trophaeen: zeilen.length, gruppen: gruppen.length };
}

/**
 * Eine Portion fuer den Knopf.
 *
 * **Bricht bei 429 ab, statt weiterzumachen** (Entscheidung des Nutzers vom
 * 01.10.2026): Die Trophaeen-API ist inoffiziell, und ein Ratenlimit ist eine
 * Bitte, aufzuhoeren. Was bis dahin geschrieben wurde, bleibt stehen und ist
 * gestempelt - der naechste Druck macht genau dort weiter.
 */
export async function trophaeenPortion(
	repos: Repositories,
	psn: PsnClient,
	accessToken: Geheimnis,
	anzahl: number = PORTION,
): Promise<PortionErgebnis> {
	const listen = await repos.trophaeen.naechsteZumFuellen(anzahl);

	let getan = 0;
	let trophaeen = 0;
	let meldung: string | undefined;

	for (const liste of listen) {
		try {
			const ergebnis = await eineListe(repos, psn, accessToken, liste);
			getan += 1;
			trophaeen += ergebnis.trophaeen ?? 0;
		} catch (fehler) {
			meldung = fehler instanceof Error ? fehler.message : "Der Abruf ist fehlgeschlagen.";
			break;
		}
	}

	const stand = await repos.trophaeen.offeneListen();
	return { listen: getan, trophaeen, offen: stand.offen, gesamt: stand.gesamt, meldung };
}

/**
 * Das Trophaeen-Level des Kontos, hoechstens einmal am Tag.
 *
 * Ein einzelner Abruf, der nichts blockiert: Schlaegt er fehl, bleibt der
 * alte Stand stehen und die Anwendung zeigt ihn weiter (Abschnitt 17).
 */
export async function levelSchritt(
	repos: Repositories,
	psn: PsnClient,
	accessToken: Geheimnis,
	heute: string,
): Promise<LevelStand | null> {
	const vorhanden = await levelStand(repos);
	if (vorhanden?.standAm === heute) return null;

	const roh = await psn.holeTrophySummary(accessToken);
	if (!roh || typeof roh.trophyLevel !== "number") return null;

	const punkte = roh.trophyPoint ?? 0;
	const naechste = roh.trophyLevelNextPoint ?? punkte;
	const neu: LevelStand = {
		level: roh.trophyLevel,
		punkte,
		// Nie negativ: Sony liefert die Grenzen, und ein Zahlendreher dort
		// soll nicht als "-40 bis Level 515" in der Oberflaeche stehen.
		bisNaechstes: Math.max(0, naechste - punkte),
		prozent: roh.progress ?? 0,
		standAm: heute,
	};
	await repos.sync.fortschrittSetzenWert(SCHLUESSEL_LEVEL, JSON.stringify(neu));
	return neu;
}

/** Was der letzte Druck auf den Portionsknopf ergeben hat. */
export type KnopfStand = PortionErgebnis & { tag: string; am: string };

/**
 * Der Ausgang des letzten Drucks - damit ein Abbruch nicht nur im Browser
 * des Nutzers steht, sondern das Neuladen ueberlebt und von aussen lesbar
 * ist. Dieselbe Regel wie beim Kauflisten-Schritt seit 18e: Ein Schritt, der
 * ruht, sagt warum.
 */
export async function knopfStand(repos: Repositories): Promise<KnopfStand | null> {
	const roh = await repos.sync.fortschritt(SCHLUESSEL_KNOPF);
	if (!roh) return null;
	try {
		const wert = JSON.parse(roh) as KnopfStand;
		return typeof wert?.am === "string" ? wert : null;
	} catch {
		// Vor dem 01.10.2026 stand hier nur das Datum als blanker Text.
		return null;
	}
}

export async function levelStand(repos: Repositories): Promise<LevelStand | null> {
	const roh = await repos.sync.fortschritt(SCHLUESSEL_LEVEL);
	if (!roh) return null;
	try {
		return JSON.parse(roh) as LevelStand;
	} catch {
		return null;
	}
}

/** Was im Zwischenspeicher der Jahre steht. */
export type JahreStand = { standAm: string; jahre: Array<{ jahr: number; anzahl: number }> };

/**
 * Die Trophaeen je Jahr einmal durchrechnen und ablegen.
 *
 * **Eine bewusste Ausnahme von "Berechnetes nicht speichern" (5.2)**, auf
 * Vorschlag des Nutzers vom 01.10.2026 - und sie ist begruendbar: Die
 * Auswertung liest 18 060 Zeilen, das ganze uebrige Dashboard 6 840, und ein
 * Indexhinweis hilft nicht (gemessen). Vergangene Jahre sind abgeschlossene
 * Tatsachen; nur das laufende Jahr aendert sich, und das wird beim Lesen live
 * gezaehlt. Gespeichert wird also kein Rang und keine Sortierung - der Fall,
 * den die Regel meint -, sondern eine Summe ueber unveraenderliche Geschichte.
 *
 * Die Zahl wird nachts neu gerechnet. Faellt der Zwischenspeicher aus oder
 * fehlt er, rechnet die Route einmal live: Es ist eine Beschleunigung, keine
 * Quelle.
 */
export async function jahreSchritt(repos: Repositories, heute: string): Promise<JahreStand | null> {
	const vorhanden = await jahreStand(repos);
	if (vorhanden?.standAm === heute) return null;

	const jahre = (await repos.trophaeen.jahre()).map((j) => ({ jahr: Number(j.jahr), anzahl: j.anzahl }));
	if (jahre.length === 0) return null;

	const neu: JahreStand = { standAm: heute, jahre };
	await repos.sync.fortschrittSetzenWert(SCHLUESSEL_JAHRE, JSON.stringify(neu));
	return neu;
}

export async function jahreStand(repos: Repositories): Promise<JahreStand | null> {
	const roh = await repos.sync.fortschritt(SCHLUESSEL_JAHRE);
	if (!roh) return null;
	try {
		const wert = JSON.parse(roh) as JahreStand;
		return Array.isArray(wert?.jahre) ? wert : null;
	} catch {
		return null;
	}
}
