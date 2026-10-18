import type { Baustein } from "./baustein";
import type { CredentialAnzeige, CredentialsRepository } from "./credentials";
import { CRON_SCHLUESSEL, standAus, type CronStand, type SyncLauf, type SyncRepository } from "./sync";

/**
 * Die Fakten der Betriebswarnungen in EINEM Batch (Stufe 18m, Abschnitt 16.2).
 *
 * Die Pruefung laeuft bei jedem Oeffnen des Dashboards; ein D1-Aufruf kostet
 * rund 0,7 ms CPU, eine Anweisung im Batch ein Zwanzigstel davon (18h). Die
 * Teile sind die Bausteine, die Cron und Einstellungen schon benutzen - keine
 * zweite Fassung einer Abfrage.
 *
 * Nur lesend: Scheitert der Batch, scheitert die Route, und das Dashboard
 * zeigt keine Warnungen statt falscher. Halb gelesen gibt es nicht.
 */

export type BetriebRoh = {
	stand: CronStand;
	/** Weitere Schluessel aus app_setting, roh - ihre Auswertung kennt der Aufrufer. */
	einstellungen: Map<string, string>;
	zugang: CredentialAnzeige;
	lebensdauerTage: number | null;
	syncLaeufe: SyncLauf[];
};

export class BetriebRepository {
	constructor(
		private readonly db: D1Database,
		private readonly q: { sync: SyncRepository; credentials: CredentialsRepository },
	) {}

	async fakten(schluessel: readonly string[]): Promise<BetriebRoh> {
		const teile = [
			this.q.sync.einstellungenBaustein([CRON_SCHLUESSEL.stand, ...schluessel]),
			this.q.credentials.anzeigeBaustein(),
			this.q.credentials.lebensdauerBaustein(),
			this.q.sync.cronLaeufeBaustein(2),
		] as const;
		// Jeder Teil ist genau eine Anweisung - das i-te Ergebnis gehoert dem i-ten Teil.
		const ergebnisse = await this.db.batch(teile.flatMap((t) => (t as Baustein<unknown>).anweisungen));
		const [einstellungen, zugang, lebensdauerTage, syncLaeufe] = [
			teile[0].lesen([ergebnisse[0]]),
			teile[1].lesen([ergebnisse[1]]),
			teile[2].lesen([ergebnisse[2]]),
			teile[3].lesen([ergebnisse[3]]),
		];
		return {
			stand: standAus(einstellungen.get(CRON_SCHLUESSEL.stand)),
			einstellungen,
			zugang,
			lebensdauerTage,
			syncLaeufe,
		};
	}
}
