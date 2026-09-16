import type { PlayStatus } from "./play-status";

/**
 * Kopplung von To-Do/Backlog und eigener Bewertung (Abschnitt 5.5,
 * Entscheidung des Nutzers vom 16.09.2026): Was auf To-Do steht, ist
 * "am Spielen"; was im Backlog steht, ist "pausiert" - und umgekehrt.
 * Beide Richtungen sind Nutzerentscheidungen (Listenknopf oder Bewertung),
 * nie der Sync: Die Vorbelegung aus Trophaeen (4.2) legt keinen Eintrag an,
 * das tut erst die Triage.
 *
 * Eine Ausnahme: Ein nie gestartetes Spiel (kein Status oder
 * 'nicht_gespielt') kommt ins Backlog, ohne "pausiert" zu werden - der
 * Status bleibt ehrlich, das Backlog ist "pausiert oder nie gestartet".
 */
export type Listenart = "todo" | "backlog";

/** Der Status, den ein Release durch die Listenaktion bekommt; null = bleibt. */
export function statusFuerListe(kind: Listenart, aktuell: PlayStatus | null): PlayStatus | null {
	if (kind === "todo") return aktuell === "am_spielen" ? null : "am_spielen";
	if (aktuell === null || aktuell === "nicht_gespielt" || aktuell === "pausiert") return null;
	return "pausiert";
}

/** Die Liste, die zu einem Status gehoert; 'erledigt' schliesst offene Eintraege; null = nichts. */
export function listeFuerStatus(status: PlayStatus): Listenart | "erledigt" | null {
	switch (status) {
		case "am_spielen": return "todo";
		case "pausiert": return "backlog";
		case "durchgespielt":
		case "komplettiert":
		case "abgebrochen": return "erledigt";
		default: return null;
	}
}
