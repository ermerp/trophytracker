/**
 * Aenderungsprotokoll je Spiel (Abschnitt 8.5, Stufe 16).
 *
 * Jede Zeile in game_event sagt, wer wann was geschrieben hat. Die Quelle
 * macht "Fremddaten und eigene Bewertung nie vermischen" sichtbar: Ein
 * Status von 'sync' ist eine Vorbelegung, einer von 'nutzer' eine
 * Entscheidung. Geschrieben wird ausschliesslich in src/db/ - dieses Modul
 * haelt die Werte und den Satz fuer die Oberflaeche, der zur Lesezeit
 * gebildet und nie gespeichert wird.
 */
export const EREIGNIS_QUELLEN = ["nutzer", "sync", "igdb", "import", "feed", "migration"] as const;
export type EreignisQuelle = (typeof EREIGNIS_QUELLEN)[number];

export function istEreignisQuelle(wert: unknown): wert is EreignisQuelle {
	return typeof wert === "string" && (EREIGNIS_QUELLEN as readonly string[]).includes(wert);
}

/**
 * Die Ereignisarten. Kein CHECK in der Datenbank - Stufe 17 (Scan), 18
 * (Cron) und 20 (Feed) haengen hier neue an. Ein Test haelt fest, dass
 * jede Art einen Satz hat.
 */
export const EREIGNIS_ARTEN = [
	"liste_neu",
	"zugeordnet",
	"zuordnung_geloest",
	"spiel_angelegt",
	"spiel_umbenannt",
	"spiel_geloescht",
	"release_angelegt",
	"release_abgetrennt",
	"release_geloescht",
	"release_geaendert",
	"disc_fassung_belegt",
	"status_geaendert",
	"bewertung_geaendert",
	"status_vorbelegt",
	"pruefliste_eingereiht",
	"pruefliste_entschieden",
	"liste_eintrag_angelegt",
	"liste_eintrag_geaendert",
	"liste_eintrag_erledigt",
	"liste_eintrag_geloescht",
	"exemplar_angelegt",
	"exemplar_geaendert",
	"exemplar_geloescht",
	"berechtigung_angelegt",
	"berechtigung_geloescht",
	"igdb_verknuepft",
	"igdb_geloest",
	"igdb_abgelehnt",
	"erschienen",
] as const;
export type EreignisArt = (typeof EREIGNIS_ARTEN)[number];

/** Eine Zeile aus game_event, wie das Repository sie liefert. */
export type Ereignis = {
	id: number;
	occurred_at: string;
	source: EreignisQuelle;
	game_id: number | null;
	release_id: number | null;
	label: string;
	kind: EreignisArt;
	field: string | null;
	old_value: string | null;
	new_value: string | null;
	detail: string | null;
};

/** Quelle eines Listeneintrags aus seiner Herkunft: nur der Import ist keine Handlung von Hand. */
export function quelleAusHerkunft(origin: string): EreignisQuelle {
	return origin === "import" ? "import" : "nutzer";
}

/** Quelle einer Zuordnung: 'automatisch' kommt vom Sync (7.2) bzw. von IGDB (7.6). */
export function quelleAusMatch(source: "automatisch" | "manuell", automatik: "sync" | "igdb"): EreignisQuelle {
	return source === "automatisch" ? automatik : "nutzer";
}

const STATUS: Record<string, string> = {
	nicht_gespielt: "nicht gespielt",
	am_spielen: "am Spielen",
	pausiert: "pausiert",
	durchgespielt: "durchgespielt",
	komplettiert: "komplettiert",
	abgebrochen: "abgebrochen",
	unentschieden: "unentschieden",
};

const LISTE: Record<string, string> = {
	wunsch: "Wunschliste",
	todo: "To-Do",
	backlog: "Backlog",
	kauf: "Kaufliste",
};

const PLAN_STATUS: Record<string, string> = { offen: "offen", erledigt: "erledigt", verworfen: "verworfen" };

const AKTION: Record<string, string> = {
	durchgespielt: "durchgespielt",
	abgebrochen: "abgebrochen",
	auf_todo: "auf To-Do",
	ins_backlog: "ins Backlog",
	unveraendert: "unverändert gelassen",
	ueberspringen: "übersprungen",
};

const GRUND: Record<string, string> = {
	erstimport: "erstmals zu prüfen",
	neue_trophaeen: "du hast weitergespielt",
	dlc_erweitert: "neue DLC-Trophäen erschienen",
};

const RELEASE_FELD: Record<string, string> = {
	physical_release_status: "Disc-Fassung",
	physical_release_region: "Region der Disc-Fassung",
	psn_product_id: "PSN-Produkt-Id",
};

const BEWERTUNG_FELD: Record<string, string> = {
	rating: "Bewertung",
	notes: "Notiz",
	started_at: "Begonnen",
	finished_at: "Beendet",
};

/** Anlass eines Listeneintrags (plan_entry.origin oder ein Kopplungsgrund), im detail. */
const ANLASS: Record<string, string> = {
	luecke: "aus Lücke",
	wunsch: "aus Wunsch",
	manuell: "von Hand",
	import: "aus Import",
	triage: "aus Prüfliste",
	kopplung: "über die Bewertung",
	besitz: "durch Erfassen",
	scan: "per Barcode",
	kauf: "durch erledigten Kauf",
};

const EXEMPLAR_FELD: Record<string, string> = {
	ean: "EAN",
	condition: "Zustand",
	has_manual: "Anleitung",
	purchase_date: "Kaufdatum",
	purchase_price_cents: "Kaufpreis in Cent",
	notes: "Notiz",
};

const DIGITALE_QUELLE: Record<string, string> = {
	kauf: "Kauf",
	plus: "PS Plus",
	trial: "Testversion",
	sonstiges: "Sonstiges",
};

const EINTRAG_FELD: Record<string, string> = {
	kind: "Liste",
	status: "Status",
	is_favorite: "Favorit",
	note: "Notiz",
	title_raw: "Titel",
	ziel: "Ziel",
};

/** Fehlende Werte heissen "leer", nie "null" oder "-". */
const wert = (w: string | null, woerter?: Record<string, string>): string =>
	w === null || w === "" ? "leer" : (woerter?.[w] ?? w);

const uebergang = (e: Ereignis, woerter?: Record<string, string>): string =>
	`${wert(e.old_value, woerter)} → ${wert(e.new_value, woerter)}`;

const mitDetail = (satz: string, detail: string | null): string => (detail ? `${satz} (${detail})` : satz);

const mitAnlass = (satz: string, detail: string | null): string => mitDetail(satz, detail ? (ANLASS[detail] ?? detail) : null);

/**
 * Der Satz zu einem Ereignis, ohne Titel - den zeigt die Oberflaeche
 * daneben. Aus kind, field, old_value, new_value und detail gebildet.
 */
export function beschreibeEreignis(e: Ereignis): string {
	switch (e.kind) {
		case "liste_neu":
			return "Trophäenliste erstmals gesehen";
		case "zugeordnet":
			return mitDetail("Trophäenliste zugeordnet", e.detail);
		case "zuordnung_geloest":
			return mitDetail("Zuordnung der Trophäenliste gelöst", e.detail);
		case "spiel_angelegt":
			return mitDetail("Spiel angelegt", e.detail);
		case "spiel_umbenannt":
			return `Titel: ${uebergang(e)}`;
		case "spiel_geloescht":
			return mitDetail("Spiel gelöscht", e.detail);
		case "release_angelegt":
			return mitDetail(e.new_value ? `Release angelegt: ${e.new_value}` : "Release angelegt", e.detail);
		case "release_abgetrennt":
			return mitDetail("Release als eigenes Spiel abgetrennt", e.detail);
		case "release_geloescht":
			return mitDetail("Release gelöscht", e.detail);
		case "release_geaendert":
			return `${wert(e.field, RELEASE_FELD)}: ${uebergang(e)}`;
		case "disc_fassung_belegt":
			return mitDetail("Disc-Fassung belegt: unbekannt → ja", e.detail);
		case "status_geaendert":
			return mitDetail(`Status: ${uebergang(e, STATUS)}`, e.detail);
		case "bewertung_geaendert":
			return `${wert(e.field, BEWERTUNG_FELD)}: ${uebergang(e)}`;
		case "status_vorbelegt":
			return `Status vorbelegt: ${wert(e.new_value, STATUS)}`;
		case "pruefliste_eingereiht":
			return mitDetail(`In die Prüfliste: ${wert(e.field, GRUND)}`, e.detail);
		case "pruefliste_entschieden":
			return `Prüfliste: ${wert(e.field, AKTION)}`;
		case "liste_eintrag_angelegt":
			if (e.new_value === "verworfen") return mitAnlass(`${wert(e.field, LISTE)}: nicht vorgesehen`, e.detail);
			return mitAnlass(`Auf ${wert(e.field, LISTE)} gesetzt`, e.detail);
		case "liste_eintrag_geaendert":
			if (e.field === "kind") return mitAnlass(`Umgehängt: ${uebergang(e, LISTE)}`, e.detail);
			if (e.field === "status") return mitAnlass(`Listeneintrag: ${uebergang(e, PLAN_STATUS)}`, e.detail);
			if (e.field === "ziel") return "Listeneintrag hierher umgehängt";
			return `Listeneintrag – ${wert(e.field, EINTRAG_FELD)}: ${uebergang(e)}`;
		case "liste_eintrag_erledigt":
			return mitAnlass(`${wert(e.field, LISTE)}: erledigt`, e.detail);
		case "liste_eintrag_geloescht":
			return `Von ${wert(e.field, LISTE)} entfernt`;
		case "exemplar_angelegt":
			return mitAnlass(e.new_value ? `Disc erfasst, Zustand ${e.new_value}` : "Disc erfasst", e.detail);
		case "exemplar_geaendert":
			return `Disc – ${wert(e.field, EXEMPLAR_FELD)}: ${uebergang(e)}`;
		case "exemplar_geloescht":
			return mitDetail("Disc entfernt", e.detail);
		case "berechtigung_angelegt":
			return mitDetail(`Digitale Berechtigung erfasst: ${wert(e.new_value, DIGITALE_QUELLE)}`, e.detail);
		case "berechtigung_geloescht":
			return `Digitale Berechtigung entfernt: ${wert(e.old_value, DIGITALE_QUELLE)}`;
		case "igdb_verknuepft":
			return mitDetail("Mit IGDB verknüpft", e.detail);
		case "igdb_geloest":
			return mitDetail("IGDB-Verknüpfung gelöst", e.detail);
		case "igdb_abgelehnt":
			return "Als „gibt es bei IGDB nicht“ vermerkt";
		case "erschienen":
			return "Erschienen (war angekündigt)";
	}
}
