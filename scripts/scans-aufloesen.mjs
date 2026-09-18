#!/usr/bin/env node
/**
 * Titel zu offenen Barcodes holen (Abschnitt 9.3, Stufe 17b).
 *
 * Laeuft in einer GitHub Action, nicht im Worker: Die freie EAN-Quelle
 * drosselt hart (gemessen am 18.09.2026: HTTP 429 nach jeweils sechs
 * Abfragen, danach rund 90 Sekunden Pause; 100 Abfragen am Tag). Im Worker
 * waere das weder mit dem CPU-Budget noch mit der Geduld eines Nutzers
 * vereinbar - hier darf es Minuten dauern.
 *
 * Der Worker bekommt nur das Ergebnis: je Code einen Titel oder null.
 * Ein null-Ergebnis wird ebenso vermerkt, damit der naechste Lauf denselben
 * Code nicht erneut fragt.
 *
 * Aufruf: node scripts/scans-aufloesen.mjs [anzahl]
 * Erwartet APP_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET.
 */

const APP = process.env.APP_URL;
const ID = process.env.CF_ACCESS_CLIENT_ID;
const SECRET = process.env.CF_ACCESS_CLIENT_SECRET;
const QUELLE = "upcitemdb";
const HOECHSTENS = Number(process.argv[2]) || 100;
const PAUSE_MS = 8000;
const WARTEN_BEI_LIMIT_MS = 90000;

if (!APP || !ID || !SECRET) {
	console.error("APP_URL, CF_ACCESS_CLIENT_ID und CF_ACCESS_CLIENT_SECRET muessen gesetzt sein.");
	process.exit(1);
}

const kopf = { "CF-Access-Client-Id": ID, "CF-Access-Client-Secret": SECRET };
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));

/** Antwort der eigenen App; eine Access-Loginseite ist kein JSON und faellt hier auf. */
async function app(pfad, init = {}) {
	const antwort = await fetch(`${APP}${pfad}`, { ...init, headers: { ...kopf, ...(init.headers ?? {}) } });
	if (!antwort.ok) throw new Error(`${pfad}: HTTP ${antwort.status}`);
	const text = await antwort.text();
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`${pfad}: keine JSON-Antwort (Access-Token abgelaufen?)`);
	}
}

/** Titel zu einer EAN; null heisst "kennt die Quelle nicht", "limit" heisst gedrosselt. */
async function titelZu(ean) {
	try {
		const antwort = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${ean}`, {
			signal: AbortSignal.timeout(25000),
		});
		if (antwort.status === 429) return "limit";
		if (!antwort.ok) return null;
		const daten = await antwort.json();
		const titel = daten?.items?.[0]?.title;
		return typeof titel === "string" && titel.trim() !== "" ? titel.trim() : null;
	} catch {
		return null;
	}
}

const { eans } = await app(`/api/scan/ungeprueft?limit=${HOECHSTENS}`);
console.log(`${eans.length} Codes ohne Titel.`);

let gefunden = 0;
let unbekannt = 0;
for (const [i, ean] of eans.entries()) {
	let titel = await titelZu(ean);
	if (titel === "limit") {
		console.log(`  gedrosselt nach ${i} Abfragen, warte ${WARTEN_BEI_LIMIT_MS / 1000} s`);
		await schlafen(WARTEN_BEI_LIMIT_MS);
		titel = await titelZu(ean);
	}
	if (titel === "limit") {
		console.log("  weiterhin gedrosselt - Rest bleibt fuer morgen liegen.");
		break;
	}
	await app(`/api/scan/${ean}/vorschlag`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ titel, quelle: QUELLE }),
	});
	if (titel) gefunden += 1;
	else unbekannt += 1;
	await schlafen(PAUSE_MS);
}

// Nur Zahlen ins Log - das Repository ist oeffentlich (CLAUDE.md).
console.log(`Titel gefunden: ${gefunden}, Quelle kennt den Code nicht: ${unbekannt}.`);
