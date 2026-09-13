import type { PlayStatus } from "./play-status";

/**
 * Pruefliste (Abschnitt 8.1): die Aktionen und ihre Wirkung.
 *
 * Sechs Aktionen aus der Spezifikation plus "ueberspringen", das den Fall
 * bewusst auf 'unentschieden' setzt - auffindbar ueber den Status-Filter der
 * Sammlung, damit die zweite Runde nicht aus dem Blick geraet.
 */
export const REVIEW_AKTIONEN = [
	"durchgespielt",
	"abgebrochen",
	"spiele_gerade",
	"auf_todo",
	"ins_backlog",
	"unveraendert",
	"ueberspringen",
] as const;

export type ReviewAktion = (typeof REVIEW_AKTIONEN)[number];

export function istReviewAktion(wert: unknown): wert is ReviewAktion {
	return typeof wert === "string" && (REVIEW_AKTIONEN as readonly string[]).includes(wert);
}

export type Wirkung = {
	/** null = Status bleibt, wie er ist ("unveraendert lassen"). */
	status: PlayStatus | null;
	/** Zusaetzlich ein plan_entry mit origin 'triage'. */
	plan: "todo" | "backlog" | null;
};

export function wirkung(aktion: ReviewAktion): Wirkung {
	switch (aktion) {
		case "durchgespielt": return { status: "durchgespielt", plan: null };
		case "abgebrochen": return { status: "abgebrochen", plan: null };
		case "spiele_gerade": return { status: "am_spielen", plan: null };
		case "auf_todo": return { status: "pausiert", plan: "todo" };
		case "ins_backlog": return { status: "pausiert", plan: "backlog" };
		case "unveraendert": return { status: null, plan: null };
		case "ueberspringen": return { status: "unentschieden", plan: null };
	}
}

export const REVIEW_GRUENDE = ["erstimport", "neue_trophaeen", "dlc_erweitert"] as const;
export type ReviewGrund = (typeof REVIEW_GRUENDE)[number];

/** Ueberschrift je Grund. Die beiden letzten fuellt erst Stufe 13. */
export const GRUND_TEXT: Record<ReviewGrund, string> = {
	erstimport: "Zum ersten Mal gesehen",
	neue_trophaeen: "Du hast weitergespielt",
	dlc_erweitert: "Neue DLC-Trophäen erschienen",
};
