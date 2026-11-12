import type { Repositories } from "../db";
import type { TrophyEintrag } from "../domain/gruppen";
import { plattformenAus, titelSchluessel } from "../domain/titel";

/**
 * Automatische Zuordnung neuer Trophaeenlisten.
 *
 * Abschnitt 7.2 erlaubt sie nur bei einem eindeutigen Treffer mit hoher
 * Aehnlichkeit. Umgesetzt als: Es gibt GENAU EIN Release, dessen Spiel
 * denselben Titelschluessel traegt und dessen Plattform in der Liste
 * vorkommt. Alles andere bleibt offen und geht in die Zuordnungsansicht.
 *
 * Beim Erstlauf greift das nie - es gibt noch keine Spiele. Der Nutzen
 * beginnt beim zweiten Sync, wenn PSN eine neue Liste zu einem bereits
 * erfassten Spiel liefert.
 */

export type ZuordnungsErgebnis = {
	geprueft: number;
	zugeordnet: number;
	offen: number;
};

export async function ordneAutomatischZu(
	repos: Repositories,
	// Die offenen Listen, wenn der Aufrufer sie schon gelesen hat (Stufe 18p).
	gelesen?: TrophyEintrag[],
): Promise<ZuordnungsErgebnis> {
	const offen = gelesen ?? (await repos.games.unzugeordnet());
	if (offen.length === 0) return { geprueft: 0, zugeordnet: 0, offen: 0 };

	// Kandidaten und belegte Releases fuer ALLE offenen Listen in je einer
	// Abfrage (Stufe 18p) - bis dahin zwei bis drei je Liste. Dieselbe Regel
	// wie vorher: genau ein Release mit passender Plattform.
	const mitSchluessel = offen.map((eintrag) => ({ eintrag, schluessel: titelSchluessel(eintrag.title_name) }));
	const kandidaten = await repos.games.releasesNachSchluesseln(
		mitSchluessel.map((m) => m.schluessel).filter((s) => s !== ""),
	);
	const passendJe = mitSchluessel.map(({ eintrag, schluessel }) => {
		const plattformen = plattformenAus(eintrag.platform);
		const passend = (kandidaten.get(schluessel) ?? []).filter((k) => plattformen.includes(k.platform));
		// Genau ein Treffer, sonst nichts. Zwei Kandidaten bedeuten, dass die
		// Entscheidung dem Nutzer gehoert.
		return { eintrag, releaseId: passend.length === 1 ? passend[0].id : null };
	});
	// Ein Release, das bereits eine Liste traegt, wird nicht ueberschrieben -
	// auch nicht von einer zweiten Liste desselben Laufs (deshalb wachsend).
	const belegt = await repos.trophies.belegteReleases(
		passendJe.flatMap((p) => (p.releaseId === null ? [] : [p.releaseId])),
	);

	let zugeordnet = 0;
	for (const { eintrag, releaseId } of passendJe) {
		if (releaseId === null || belegt.has(releaseId)) continue;
		if (await repos.games.listeZuordnen(eintrag.np_communication_id, releaseId, "automatisch")) {
			zugeordnet++;
			belegt.add(releaseId);
		}
	}

	return {
		geprueft: offen.length,
		zugeordnet,
		offen: offen.length - zugeordnet,
	};
}
