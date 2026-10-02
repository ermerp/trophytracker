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
	"review_queue", "trophy_progress", "psn_played_title", "ean_mapping", "price_snapshot",
	"market_offer", "release", "game", "psn_raw_response", "psn_sync_run", "app_setting",
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

/*
 * Ein voller Fall fuer das Spieldetail (Stufe 19c).
 *
 * Die Schleife oben erzeugt Spiele mit genau einem Release und hoechstens
 * einem Exemplar - das ist der Normalfall (421 der 431 Spiele), aber die
 * Detailansicht zeigt daran nur die Haelfte ihrer Faelle. Dieses eine Spiel
 * traegt alles auf einmal: zwei Releases, eine erfasste Disc mit EAN,
 * PS Plus neben gekauftem Download, Spielzeit nur auf der PS5, einen von der
 * Sammlung abweichenden Rohtitel und einen Verlauf.
 *
 * Die Zeitstempel von PSN stehen als ISO mit `T` und `Z` - genau so schreibt
 * sie der Sync (`text(e.lastUpdatedDateTime)`). Mit D1-Zeitstempeln im Format
 * `2026-09-19 22:41:00` zeigte die Ansicht beim Pruefen am 27.09.2026
 * "Invalid Date", und das sah nach einem Fehler in `datum()` aus - es war der
 * Fehler der Testdaten.
 */
const R = 900;
s(
	"INSERT INTO game (id, title, sort_title, cover_url, igdb_id, igdb_slug, release_date, " +
		"release_status, critic_score, critic_score_count, critic_source, igdb_matched_at, " +
		"igdb_matched_source, igdb_checked_at) VALUES " +
		`(${R}, 'Nebelwacht: Zweiter Kreis', 'nebelwacht zweiter kreis', NULL, 112233, ` +
		"'nebelwacht-zweiter-kreis', '2023-11-14', 'erschienen', 86, 42, 'igdb', " +
		"datetime('now', '-15 days'), 'automatisch', datetime('now', '-7 days'));",
);
s(
	"INSERT INTO release (id, game_id, platform, physical_release_status, physical_source, " +
		`psn_product_id) VALUES (${R}, ${R}, 'PS4', 'ja', 'igdb', 'CUSA18822_00'), ` +
		`(${R + 1}, ${R}, 'PS5', 'unbekannt', NULL, NULL);`,
);
s(
	"INSERT INTO trophy_progress (np_communication_id, np_service_name, title_name, platform, " +
		"defined_bronze, defined_silver, defined_gold, defined_platinum, earned_bronze, " +
		"earned_silver, earned_gold, earned_platinum, progress_pct, last_played_at, synced_at, " +
		"release_id, matched_at, matched_source) VALUES " +
		"('NPWR18822_00', 'trophy2', 'Nebelwacht - Zweiter Kreis', 'PS4', 38, 9, 3, 1, 31, 6, 1, 0, " +
		`68, '2026-09-19T22:41:00Z', datetime('now'), ${R}, datetime('now', '-15 days'), 'automatisch'), ` +
		"('NPWR18823_00', 'trophy2', 'Nebelwacht - Zweiter Kreis (Deluxe)', 'PS5', 38, 9, 3, 1, " +
		`38, 9, 3, 1, 100, '2026-08-02T01:12:00Z', datetime('now'), ${R + 1}, ` +
		"datetime('now', '-13 days'), 'manuell');",
);
s(`INSERT INTO play_status (release_id, status) VALUES (${R}, 'am_spielen'), (${R + 1}, 'komplettiert');`);
// Genau eine Disc je Release (Entscheidung des Nutzers vom 27.09.2026), mit
// EAN, wie sie der Scanner setzt.
s(`INSERT INTO physical_copy (release_id, ean) VALUES (${R}, '4012345678901');`);
s(`INSERT INTO ean_mapping (ean, release_id, source) VALUES ('4012345678901', ${R}, 'scan');`);
// Kauf schlaegt PS Plus (7.7) - hier steht beides an verschiedenen Releases.
s(
	"INSERT INTO digital_entitlement (release_id, source, acquired_at, herkunft) VALUES " +
		`(${R}, 'plus', NULL, 'psn'), (${R + 1}, 'kauf', '2026-07-10', 'psn');`,
);
// Spielzeit gibt es nur auf der PS5 - PS3 und Vita liefern grundsaetzlich keine.
s(
	"INSERT INTO psn_played_title (title_id, name, platform, play_duration_s, play_count, " +
		"first_played_at, last_played_at, release_id, synced_at) VALUES " +
		"('PPSA08822_00', 'Nebelwacht: Zweiter Kreis', 'PS5', 176400, 23, '2026-07-11T19:02:00Z', " +
		`'2026-08-02T01:12:00Z', ${R + 1}, datetime('now'));`,
);
s(
	"INSERT INTO plan_entry (kind, release_id, status, origin, is_favorite, position) VALUES " +
		`('todo', ${R}, 'offen', 'manuell', 1, 3), ('wunsch', ${R + 1}, 'offen', 'import', 0, NULL);`,
);
s(
	"INSERT INTO game_event (occurred_at, source, game_id, release_id, label, kind, field, " +
		"old_value, new_value, detail) VALUES " +
		`(datetime('now', '-8 days'), 'nutzer', ${R}, ${R}, 'Nebelwacht: Zweiter Kreis', ` +
		"'bewertung_geaendert', 'status', 'pausiert', 'am_spielen', NULL), " +
		`(datetime('now', '-7 days'), 'igdb', ${R}, ${R}, 'Nebelwacht: Zweiter Kreis', ` +
		"'release_geaendert', 'physical_release_status', 'unbekannt', 'ja', NULL), " +
		`(datetime('now', '-15 days'), 'igdb', ${R}, NULL, 'Nebelwacht: Zweiter Kreis', ` +
		"'igdb_verknuepft', NULL, NULL, '112233', NULL);",
);

// Disc-Fassungen wie nach einem IGDB-Lauf: knapp die Haelfte belegt, der Rest
// unbekannt (in der Produktion am 02.10.2026 235 von 490). Vorher trug nur ein
// einziges Release 'ja', und damit war der erste Block der Lueckenansicht
// lokal gar nicht darstellbar.
s(
	"UPDATE release SET physical_release_status = 'ja', physical_source = 'igdb', " +
		"physical_checked_at = datetime('now', '-3 days') WHERE id % 2 = 0 AND id < 9000;",
);

// Gebrauchtpreise und die drei Befunde der eBay-Suche (Stufe 20). Sie erzeugen
// in der Lueckenansicht alle Zustaende, die Block B zeigen kann: Preis vom
// Haendler, Preis aus dem breiten Markt, "eBay kennt nichts", "Angebote ohne
// klare Zuordnung" und ungeprueft.
// Der Zustand kommt aus `zufall()`, nicht aus `i % 5`: Die Titelliste hat 20
// Eintraege, und 20 ist durch 5 teilbar - ein Modulo haette den Befund an den
// TITEL gekoppelt, und die alphabetisch sortierte Liste zeigte dann
// seitenweise denselben Zustand. Im Bild sah das aus wie ein Fehler.
for (let i = 1; i <= ANZAHL; i++) {
	const rest = Math.floor(zufall() * 5);
	if (rest === 4) continue; // ungeprueft: kein Stempel, kein Angebot
	const roh = rest === 3 ? 0 : rest === 2 ? 3 + (i % 4) : 5 + (i % 9);
	s(
		"UPDATE release SET markt_geprueft_am = datetime('now', " +
			`'-${i % 13} days'), markt_rohangebote = ${roh} WHERE id = ${i};`,
	);
	// rest 2 = Angebote vorhanden, aber keines eindeutig; rest 3 = gar keines.
	if (rest === 2 || rest === 3) continue;
	const marktCents = 400 + ((i * 137) % 4200);
	s(
		"INSERT INTO market_offer (source, source_product_id, anbieter, kanal, title_raw, platform_raw, " +
			`condition, price_cents, currency, in_stock, url, imported_at, release_id) VALUES ('ebay', 'markt:${i}', ` +
			`'eBay', 'markt', 'Spiel ${i}', (SELECT platform FROM release WHERE id = ${i}), 'Gut', ${marktCents}, ` +
			`'EUR', 1, 'https://example.invalid/${i}', datetime('now'), ${i});`,
	);
	// Jedes vierte Release hat zusaetzlich ein Haendlerangebot - teurer als
	// der Markt, damit im Bild zu sehen ist, dass der Haendler Vorrang hat.
	if (rest === 0) {
		s(
			"INSERT INTO market_offer (source, source_product_id, anbieter, kanal, title_raw, platform_raw, " +
				`condition, price_cents, currency, in_stock, url, imported_at, release_id) VALUES ('ebay', 'haendler:${i}', ` +
				`'${i % 8 === 0 ? "medimops" : "rebuy"}', 'haendler', 'Spiel ${i}', ` +
				`(SELECT platform FROM release WHERE id = ${i}), 'Sehr gut', ${marktCents + 300 + (i % 700)}, ` +
				`'EUR', 1, 'https://example.invalid/h${i}', datetime('now'), ${i});`,
		);
	}
	s(
		"INSERT INTO price_snapshot (release_id, channel, source, condition, price_cents, currency, captured_at) " +
			`VALUES (${i}, 'gebraucht', 'ebay', 'Gut', ${marktCents + 250}, 'EUR', datetime('now', '-40 days')), ` +
			`(${i}, 'gebraucht', 'ebay', 'Gut', ${marktCents}, 'EUR', datetime('now', '-2 days'));`,
	);
}

s(
	"INSERT INTO psn_sync_run (started_at, finished_at, status, titles_seen, started_by) VALUES " +
		`(datetime('now', '-6 hours'), datetime('now', '-5 hours'), 'erfolg', ${ANZAHL}, 'cron');`,
);
s("PRAGMA foreign_keys = ON;");

process.stdout.write(`${zeilen.join("\n")}\n`);
