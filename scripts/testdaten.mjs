/**
 * Erfundene Zeilen fuer die lokale Entwicklungsdatenbank.
 *
 * Warum es das gibt: Die Oberflaeche wird vor jedem Deploy angesehen, nicht
 * nur gebaut (CLAUDE.md) - headless Chrome gegen `wrangler dev`. Dafuer
 * braucht die lokale D1 einen Bestand, und der muss **erfunden** sein. Die
 * Rohantworten in der Produktion waeren perfektes Material und enthalten die
 * vollstaendige Spielhistorie des Nutzers; dieses Repository ist oeffentlich.
 * Dieselbe Regel wie bei `test/trophy-fixtures.ts` und beim Datenbank-Dump.
 *
 * Bis Stufe 19a stand das Skript jedes Mal neu im Scratchpad und war nach der
 * Sitzung weg. Die Groessenordnung ist an der Produktion orientiert (rund 430
 * Trophaeenlisten, vier Plattformen, jede fuenfte mit Platin), die Titel sind
 * Phantasie.
 *
 * Aufruf:
 *
 *   node scripts/testdaten.mjs > /tmp/testdaten.sql
 *   npx wrangler d1 execute trophytracker --local --file=/tmp/testdaten.sql
 *
 * Niemals mit `--remote`. Das Skript beginnt mit DELETE ueber alle
 * Fachtabellen und wuerde die echten Daten loeschen; wer es dort ausfuehrt,
 * hat keine Sicherung im selben Atemzug.
 */

const ANZAHL = Number(process.argv[2] ?? 430);

/** Ein fester Generator - derselbe Aufruf gibt denselben Bestand. */
let saat = 19;
const zufall = () => {
	saat = (saat * 1103515245 + 12345) % 2147483648;
	return saat / 2147483648;
};

const TITEL = [
	"Sternenfall", "Nebelwacht", "Eisenhain", "Talgrund", "Wolkenpfad", "Rabenstein",
	"Silberbucht", "Dornfeld", "Morgenluft", "Schattental", "Feuerkreis", "Glasberg",
	"Windstill", "Aschenland", "Blauwald", "Steinhaus", "Nordlicht", "Zeitfalte",
	"Tiefseechronik", "Regenbogenfahrt",
];
const PLATTFORMEN = ["PS3", "PS4", "PS5", "PSVITA"];
const STATUS = [
	"komplettiert", "durchgespielt", "abgebrochen", "pausiert",
	"am_spielen", "nicht_gespielt", "unentschieden",
];

const zeilen = [];
const s = (text) => zeilen.push(text);
const escape = (text) => text.replace(/'/g, "''");

s("-- Erfundene Zeilen, erzeugt von scripts/testdaten.mjs. Nur fuer --local.");
s("PRAGMA foreign_keys = OFF;");
for (const tabelle of [
	"game_event", "plan_entry", "play_status", "physical_copy", "digital_entitlement",
	"review_queue", "trophy_progress", "psn_played_title", "release", "game",
	"psn_raw_response", "psn_sync_run", "app_setting",
]) {
	s(`DELETE FROM ${tabelle};`);
}

for (let i = 1; i <= ANZAHL; i++) {
	const plattform = PLATTFORMEN[i % 4];
	const titel = escape(`${TITEL[i % TITEL.length]} ${i}`);
	s(`INSERT INTO game (id, title, sort_title) VALUES (${i}, '${titel}', '${titel.toLowerCase()}');`);
	s(`INSERT INTO release (id, game_id, platform) VALUES (${i}, ${i}, '${plattform}');`);

	// Jede elfte ohne Trophaeenliste - es gibt Spiele, die von Hand entstanden.
	if (i % 11 !== 0) {
		const definiertBronze = 20 + (i % 15);
		const definiertSilber = 6 + (i % 5);
		const definiertGold = 2 + (i % 3);
		// 93 von 431 Titeln haben in der Produktion gar kein Platin - hier jeder siebte.
		const definiertPlatin = i % 7 === 0 ? 0 : 1;
		const prozent = (i * 7) % 101;
		const anteil = (n) => Math.floor((n * prozent) / 100);
		const erspieltPlatin = definiertPlatin && prozent >= 95 ? 1 : 0;
		const zuletzt = `2026-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, "0")}T12:00:00Z`;
		s(
			"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, " +
				"defined_bronze, earned_bronze, defined_silver, earned_silver, defined_gold, earned_gold, " +
				"defined_platinum, earned_platinum, progress_pct, last_played_at, synced_at, release_id) VALUES (" +
				`'NPWR${String(i).padStart(5, "0")}', 'trophy', '${titel}', '${plattform}', ` +
				`${definiertBronze}, ${anteil(definiertBronze)}, ${definiertSilber}, ${anteil(definiertSilber)}, ` +
				`${definiertGold}, ${anteil(definiertGold)}, ${definiertPlatin}, ${erspieltPlatin}, ` +
				`${prozent}, '${zuletzt}', datetime('now'), ${i});`,
		);
	}
	if (i % 13 !== 0) {
		s(`INSERT INTO play_status (release_id, status) VALUES (${i}, '${STATUS[i % STATUS.length]}');`);
	}
	if (i % 3 === 0) s(`INSERT INTO physical_copy (release_id, condition) VALUES (${i}, 'gut');`);
	if (i % 9 === 0) s(`INSERT INTO digital_entitlement (release_id, source) VALUES (${i}, 'kauf');`);
	// Spielzeit gibt es nur fuer PS4 und PS5 (7.7) - PS3 und Vita bleiben leer.
	if ((plattform === "PS4" || plattform === "PS5") && i % 2 === 0) {
		s(
			"INSERT INTO psn_played_title (title_id, name, platform, play_duration_s, play_count, " +
				`release_id, synced_at) VALUES ('CUSA${String(i).padStart(5, "0")}', '${titel}', ` +
				`'${plattform}', ${Math.floor(zufall() * 200000)}, ${1 + (i % 30)}, ${i}, datetime('now'));`,
		);
	}
}

// Releases, die nur einen Wunsch tragen: Sie gehoeren nicht zur Sammlung
// (Abschnitt 3) und duerfen in keiner Kennzahl auftauchen.
for (let i = 9001; i <= 9008; i++) {
	s(`INSERT INTO game (id, title, sort_title) VALUES (${i}, 'Wunschtitel ${i}', 'wunschtitel ${i}');`);
	s(`INSERT INTO release (id, game_id, platform) VALUES (${i}, ${i}, 'PS5');`);
	s(`INSERT INTO plan_entry (kind, release_id, status, origin) VALUES ('wunsch', ${i}, 'offen', 'manuell');`);
}

for (let i = 1; i <= 25; i++) {
	s(`INSERT INTO plan_entry (kind, release_id, status, origin) VALUES ('backlog', ${i * 3}, 'offen', 'manuell');`);
}
for (let i = 1; i <= 3; i++) {
	s(
		"INSERT INTO plan_entry (kind, release_id, status, origin, position) VALUES " +
			`('todo', ${i * 5}, 'offen', 'manuell', ${i});`,
	);
}
s("INSERT INTO review_queue (release_id, reason) VALUES (2, 'erstimport'), (4, 'neue_trophaeen');");

// Ein paar Protokollzeilen, damit der Feed des Dashboards etwas zeigt.
const EREIGNISSE = [
	["nutzer", "exemplar_angelegt", null, null, "scan"],
	["nutzer", "release_geaendert", "physical_release_status", "ja", null],
	["sync", "pruefliste_eingereiht", "neue_trophaeen", null, null],
	["nutzer", "status_geaendert", "status", "komplettiert", null],
	["igdb", "igdb_verknuepft", null, null, null],
	["sync", "liste_neu", null, null, null],
	["nutzer", "liste_eintrag_angelegt", "backlog", null, null],
	["nutzer", "bewertung_geaendert", "rating", "8", null],
];
EREIGNISSE.forEach(([quelle, art, feld, neu, detail], k) => {
	const wert = (v) => (v === null ? "NULL" : `'${v}'`);
	s(
		"INSERT INTO game_event (occurred_at, source, game_id, release_id, label, kind, field, " +
			`old_value, new_value, detail) VALUES (datetime('now', '-${k + 1} days'), '${quelle}', ` +
			`${k + 1}, ${k + 1}, '${escape(TITEL[k % TITEL.length])} ${k + 1}', '${art}', ${wert(feld)}, ` +
			`'unbekannt', ${wert(neu)}, ${wert(detail)});`,
	);
});

s(
	"INSERT INTO psn_sync_run (started_at, finished_at, status, titles_seen, started_by) VALUES " +
		`(datetime('now', '-6 hours'), datetime('now', '-5 hours'), 'erfolg', ${ANZAHL}, 'cron');`,
);
s("PRAGMA foreign_keys = ON;");

process.stdout.write(`${zeilen.join("\n")}\n`);
