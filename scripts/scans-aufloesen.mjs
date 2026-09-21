#!/usr/bin/env node
/**
 * Titel zu offenen Barcodes holen (Abschnitt 9.3, Stufen 17b und 17c).
 *
 * Seit Stufe 17c loest der Scanner einen unbekannten Code schon beim Scannen
 * live bei eBay auf (9.2). Dieser Job ist das Netz darunter: fuer Codes, die
 * im Sammelmodus weggeschrieben wurden oder bei denen die Live-Abfrage
 * scheiterte.
 *
 * Reihenfolge wie in der Kette: erst eBay (gemessen am 21.09.2026 - kennt 33
 * von 34 bekannten Codes, 5 000 Abfragen am Tag, keine Drosselung), dann
 * upcitemdb als Rueckfall. upcitemdb drosselt hart (HTTP 429 nach jeweils
 * sechs Abfragen, danach rund 90 Sekunden Pause, 100 am Tag) - deshalb
 * laeuft dieser Job ausserhalb des Workers, wo er Minuten brauchen darf.
 *
 * Der Worker bekommt nur das Ergebnis: je Code einen Titel oder null.
 * Ein null-Ergebnis wird ebenso vermerkt, damit der naechste Lauf denselben
 * Code nicht erneut fragt.
 *
 * Aufruf: node scripts/scans-aufloesen.mjs [anzahl]
 * Erwartet APP_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET;
 * EBAY_CLIENT_ID und EBAY_CLIENT_SECRET sind freiwillig - ohne sie laeuft
 * der Job wie vor Stufe 17c nur mit upcitemdb.
 */

const APP = process.env.APP_URL;
const ID = process.env.CF_ACCESS_CLIENT_ID;
const SECRET = process.env.CF_ACCESS_CLIENT_SECRET;
const EBAY_ID = process.env.EBAY_CLIENT_ID;
const EBAY_SECRET = process.env.EBAY_CLIENT_SECRET;
const HOECHSTENS = Number(process.argv[2]) || 100;
const PAUSE_MS = 8000;
const EBAY_PAUSE_MS = 200;
const WARTEN_BEI_LIMIT_MS = 90000;
const ANGEBOTE_JE_CODE = 10;

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

/**
 * Application-Token von eBay, einmal je Lauf. Es wird nirgends abgelegt und
 * nie ausgegeben - das Repository ist oeffentlich.
 */
let ebayToken = null;
async function ebayTokenBesorgen() {
	if (ebayToken || !EBAY_ID || !EBAY_SECRET) return ebayToken;
	const antwort = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
		method: "POST",
		headers: {
			Authorization: `Basic ${Buffer.from(`${EBAY_ID}:${EBAY_SECRET}`).toString("base64")}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
	});
	if (!antwort.ok) {
		console.log(`  eBay-Anmeldung fehlgeschlagen (HTTP ${antwort.status}) - weiter nur mit upcitemdb.`);
		return null;
	}
	ebayToken = (await antwort.json()).access_token ?? null;
	return ebayToken;
}

/**
 * Angebotstitel zu einer GTIN. Leere Liste heisst "kennt den Code nicht",
 * null heisst "eBay steht nicht zur Verfuegung" (dann greift upcitemdb).
 */
async function ebayTitelZu(ean) {
	const tok = await ebayTokenBesorgen();
	if (!tok) return null;
	try {
		const antwort = await fetch(
			`https://api.ebay.com/buy/browse/v1/item_summary/search?gtin=${ean}&limit=${ANGEBOTE_JE_CODE}`,
			{ headers: { Authorization: `Bearer ${tok}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE" }, signal: AbortSignal.timeout(25000) },
		);
		if (antwort.status === 204) return [];
		if (!antwort.ok) return null;
		const daten = await antwort.json();
		return (daten.itemSummaries ?? []).map((i) => i.title).filter((t) => typeof t === "string" && t.trim() !== "");
	} catch {
		return null;
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

let ausEbay = 0;
let ausUpc = 0;
let unbekannt = 0;
let upcAbfragen = 0;
for (const ean of eans) {
	// 1. eBay: schnell, grosszuegiges Kontingent, mehrere Angebote je Code.
	const angebote = await ebayTitelZu(ean);
	let titel = angebote && angebote.length > 0 ? angebote[0] : null;
	let quelle = "ebay";
	if (titel) await schlafen(EBAY_PAUSE_MS);

	// 2. upcitemdb nur, wenn eBay den Code nicht kennt oder ausfaellt.
	if (!titel) {
		let roh = await titelZu(ean);
		upcAbfragen += 1;
		if (roh === "limit") {
			console.log(`  upcitemdb gedrosselt nach ${upcAbfragen} Abfragen, warte ${WARTEN_BEI_LIMIT_MS / 1000} s`);
			await schlafen(WARTEN_BEI_LIMIT_MS);
			roh = await titelZu(ean);
		}
		if (roh === "limit") {
			console.log("  weiterhin gedrosselt - Rest bleibt fuer morgen liegen.");
			break;
		}
		titel = roh;
		quelle = "upcitemdb";
		await schlafen(PAUSE_MS);
	}

	await app(`/api/scan/${ean}/vorschlag`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ titel, quelle }),
	});
	if (titel && quelle === "ebay") ausEbay += 1;
	else if (titel) ausUpc += 1;
	else unbekannt += 1;
}

// Nur Zahlen ins Log - das Repository ist oeffentlich (CLAUDE.md).
console.log(`Titel von eBay: ${ausEbay}, von upcitemdb: ${ausUpc}, keine Quelle kennt den Code: ${unbekannt}.`);
