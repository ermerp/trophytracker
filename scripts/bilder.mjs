/**
 * Bildschirmfotos der Oberflaeche, auch von Aufgeklapptem (CLAUDE.md).
 *
 * `chrome --headless=new --screenshot=…` kann nur laden und knipsen. Was
 * erst nach einem Klick da ist - ein Menue, eine Tafel, ein aufgeklappter
 * Block -, erreicht es nicht. Dieses Skript faehrt denselben Browser ueber
 * das DevTools-Protokoll und macht dazwischen, was noetig ist.
 *
 * JEDER HANDGRIFF IST EIN EIGENER AUFRUF mit Pause dazwischen, und das ist
 * keine Vorsicht: Eine Tafel, die beim Scrollen schliesst, geht sofort
 * wieder zu, wenn `scrollIntoView` und `click` in einem Ausdruck stehen; und
 * was gerade erst aufgeklappt wurde, ist im selben Tick noch nicht
 * gerendert.
 *
 * Immer drei Breiten - 360 ist das Geraet des Nutzers, 390 der haeufige
 * Fall, ab 48 rem ist das Layout ein anderes. `env(safe-area-inset-*)` ist
 * dabei null, auf dem Handy nicht (CLAUDE.md).
 *
 * Gegen `wrangler dev` mit einer lokalen D1 voll ERFUNDENER Zeilen
 * (`scripts/testdaten.mjs`) - nie gegen die Produktion: Die Bilder zeigen
 * sonst die Sammlung des Nutzers, und dieses Repository ist oeffentlich.
 *
 * Aufruf:
 *
 *   node scripts/testdaten.mjs > /tmp/testdaten.sql
 *   npx wrangler d1 execute trophytracker --local --file=/tmp/testdaten.sql
 *   npm run build && npx wrangler dev &
 *   ~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
 *     --headless=new --remote-debugging-port=9222 --no-sandbox \
 *     --disable-gpu --hide-scrollbars about:blank &
 *   AUS=/tmp/bilder SEITEN='[["luecken","/luecken",null]]' node scripts/bilder.mjs
 *
 * SEITEN ist JSON: [name, pfad, schritte]. `schritte` ist null oder eine
 * Liste von JS-Ausdruecken, die der Reihe nach im Browser laufen; gibt einer
 * `false` zurueck, steht es als Warnung im Protokoll, statt still ein
 * falsches Bild zu erzeugen.
 */
import { writeFileSync } from "node:fs";

const PORT = Number(process.env.CDP_PORT ?? 9222);
const BASIS = process.env.BASIS ?? "http://localhost:8787";
const AUS = process.env.AUS ?? ".";

/** 360 ist das Geraet des Nutzers; was bei 390 gerade eben passt, schneidet dort ab. */
const BREITEN = [
	[360, 800],
	[390, 844],
	[1280, 900],
];

/** Wie lange nach dem Laden und nach jedem Handgriff gewartet wird. */
const LADEN_MS = 1800;
const SCHRITT_MS = 650;

const warte = (ms) => new Promise((f) => setTimeout(f, ms));

async function verbinden() {
	const liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
	const seite = liste.find((t) => t.type === "page");
	if (!seite) throw new Error(`Keine Seite auf Port ${PORT}. Laeuft Chrome mit --remote-debugging-port?`);
	return new Promise((fertig) => {
		const ws = new WebSocket(seite.webSocketDebuggerUrl);
		ws.onopen = () => fertig(ws);
	});
}

const seiten = JSON.parse(process.env.SEITEN ?? "[]");
if (seiten.length === 0) throw new Error("SEITEN ist leer - erwartet JSON [[name, pfad, schritte], …].");

const ws = await verbinden();
let nr = 0;
const offen = new Map();
ws.onmessage = (e) => {
	const n = JSON.parse(e.data);
	if (n.id && offen.has(n.id)) {
		offen.get(n.id)(n.result);
		offen.delete(n.id);
	}
};
const rufen = (methode, params = {}) => {
	const id = ++nr;
	return new Promise((fertig) => {
		offen.set(id, fertig);
		ws.send(JSON.stringify({ id, method: methode, params }));
	});
};

await rufen("Page.enable");
await rufen("Runtime.enable");

for (const [name, pfad, schritte] of seiten) {
	for (const [breite, hoehe] of BREITEN) {
		await rufen("Emulation.setDeviceMetricsOverride", {
			width: breite,
			height: hoehe,
			deviceScaleFactor: 1,
			mobile: breite < 800,
		});
		await rufen("Page.navigate", { url: `${BASIS}${pfad}` });
		await warte(LADEN_MS);

		for (const schritt of schritte ?? []) {
			const r = await rufen("Runtime.evaluate", { expression: schritt, returnByValue: true });
			if (r.exceptionDetails || r.result?.value === false) {
				console.error(`  ! ${name}/${breite}: Schritt ohne Treffer - ${schritt.slice(0, 60)}…`);
			}
			await warte(SCHRITT_MS);
		}

		const bild = await rufen("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
		const datei = `${AUS}/${name}-${breite}.png`;
		writeFileSync(datei, Buffer.from(bild.data, "base64"));
		console.log(datei);
	}
}

ws.close();
