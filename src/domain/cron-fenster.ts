/**
 * Die Cron-Fenster der naechtlichen Automatik (10.1) - ohne Abhaengigkeit,
 * damit sowohl der Worker (src/sync/cron.ts) als auch die Betriebsurteile
 * (src/domain/betrieb.ts) sie lesen koennen.
 */

/**
 * Die beiden Cron-Ausdruecke, genau wie sie in `wrangler.jsonc` stehen.
 *
 * Der Einstieg (src/sync/cron.ts) leitet den Bereich aus `event.cron` ab -
 * Cloudflare liefert den Ausdruck mit, der gefeuert hat. Wer einen Ausdruck
 * in wrangler.jsonc aendert, aendert ihn hier mit; `test/cron.spec.ts` haelt
 * fest, dass beide Seiten dasselbe sagen.
 */
export const CRON_PSN = "*/5 0-2 * * *";
export const CRON_WARTUNG = "*/5 3-4 * * *";

/**
 * Start- und Endstunde (UTC, beide einschliesslich), Takt und Anzahl der
 * Aufrufe eines Cron-Ausdrucks.
 *
 * Die Zahl stand bis Stufe "Refactoring" als Literal in zwei Tests und lief
 * damit auseinander: Als 20e das Wartungsfenster von den Stunden 6-7 auf 6-8
 * erweiterte, rechneten `test/cron.spec.ts` und `test/lesekosten.spec.ts`
 * weiter mit 24 statt 36 Aufrufen und prueften zwoelf Aufrufe zu wenig
 * (10.1). Jetzt steht sie nur noch im Ausdruck selbst.
 *
 * Erkannt wird allein die Form, die hier vorkommt - alle N Minuten zwischen
 * zwei Stunden; alles andere wirft, statt eine Zahl zu raten. (Die Form als
 * Muster steht in der Regex darunter: Ein Cron-Ausdruck mit Stern-Schrägstrich
 * laesst sich in einem Blockkommentar nicht schreiben, er beendet ihn.)
 */
export function cronFenster(ausdruck: string): { startStunde: number; endStunde: number; takt: number; aufrufe: number } {
	const treffer = /^\*\/(\d+) (\d+)-(\d+) \* \* \*$/.exec(ausdruck);
	if (!treffer) throw new Error(`Cron-Ausdruck nicht auswertbar: ${ausdruck}`);
	const takt = Number(treffer[1]);
	const startStunde = Number(treffer[2]);
	const endStunde = Number(treffer[3]);
	if (takt < 1 || takt > 60 || startStunde > endStunde || endStunde > 23) {
		throw new Error(`Cron-Ausdruck nicht auswertbar: ${ausdruck}`);
	}
	return { startStunde, endStunde, takt, aufrufe: Math.ceil(60 / takt) * (endStunde - startStunde + 1) };
}
