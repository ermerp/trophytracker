import type { Repositories } from "../db";
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

export async function ordneAutomatischZu(repos: Repositories): Promise<ZuordnungsErgebnis> {
	const offen = await repos.games.unzugeordnet();
	let zugeordnet = 0;

	for (const eintrag of offen) {
		const schluessel = titelSchluessel(eintrag.title_name);
		const kandidaten = await repos.games.releasesNachSchluessel(schluessel);
		if (kandidaten.length === 0) continue;

		const plattformen = plattformenAus(eintrag.platform);
		const passend = kandidaten.filter((k) => plattformen.includes(k.platform));

		// Genau ein Treffer, sonst nichts. Zwei Kandidaten bedeuten, dass die
		// Entscheidung dem Nutzer gehoert.
		if (passend.length !== 1) continue;

		// Ein Release, das bereits eine Liste traegt, wird nicht ueberschrieben.
		if (await repos.trophies.releaseIstBelegt(passend[0].id)) continue;

		if (await repos.games.listeZuordnen(eintrag.np_communication_id, passend[0].id, "automatisch")) {
			zugeordnet++;
		}
	}

	return {
		geprueft: offen.length,
		zugeordnet,
		offen: offen.length - zugeordnet,
	};
}
