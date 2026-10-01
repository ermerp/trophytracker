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
 * Vierzehn Listen je Aufruf, und die Zahl kommt NICHT aus Bequemlichkeit:
 * **Ein Worker-Aufruf darf hoechstens 50 Fremdanfragen machen** (Free Tier,
 * 15.4). Eine Liste kostet zwei Abrufe, mit DLC-Gruppen drei; vierzehn sind
 * also hoechstens 42, dazu kann eine Token-Erneuerung kommen. Mit sechzehn
 * waeren es 48 plus Token - zu nah an der Wand.
 *
 * Die Oberflaeche ruft so lange nach, bis nichts mehr offen ist; 431 Listen
 * sind rund 31 Aufrufe.
 */
export const PORTION = 14;

/** Der Stand in app_setting: wann zuletzt ein Knopfdurchlauf lief. */
export const SCHLUESSEL_KNOPF = "trophaeen_knopf_tag";
/** Level und Punkte aus trophySummary, zuletzt geholt am. */
export const SCHLUESSEL_LEVEL = "trophaeen_level";

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

	const stand = await repos.trophaeen.fuellstand();
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

export async function levelStand(repos: Repositories): Promise<LevelStand | null> {
	const roh = await repos.sync.fortschritt(SCHLUESSEL_LEVEL);
	if (!roh) return null;
	try {
		return JSON.parse(roh) as LevelStand;
	} catch {
		return null;
	}
}
