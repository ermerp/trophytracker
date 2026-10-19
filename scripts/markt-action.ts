/**
 * Einstieg der Markt-Action (Stufe 20i, .github/workflows/markt.yml).
 *
 * Nur Verdrahtung: Zugang, Adresse, Ausgabe. Der Lauf selbst steht in
 * src/sync/markt-lauf.ts und ist dort gegen die echten Routen getestet.
 *
 * Das Log der Action ist OEFFENTLICH (das Repository ist es): Ausgegeben
 * werden nur Zahlen, nie Titel, Ids, Preise oder Fremdtext. Die Secrets
 * maskiert GitHub, aber sie gelangen hier ohnehin nicht in eine Ausgabe -
 * das eBay-Secret wandert als `Geheimnis` (src/domain/secret.ts).
 */
import { erstelleEbayClient, zugangAus } from "../src/ebay/client";
import { marktLauf, type AppAufruf } from "../src/sync/markt-lauf";

const basis = process.env.APP_URL ?? "";
const kopf = {
	"CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID ?? "",
	"CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET ?? "",
};
if (!basis || !kopf["CF-Access-Client-Id"] || !kopf["CF-Access-Client-Secret"]) {
	console.log("::error::APP_URL oder das Service Token fehlt.");
	process.exit(1);
}

// Access antwortet auf ein abgelaufenes Token mit 302 auf die Login-Seite,
// nicht mit 401 - `redirect: "manual"` macht daraus einen Status, den der
// Lauf als Ablehnung erkennt (wie die Sicherung, 14.2). Jede Anfrage traegt
// eine Zeitgrenze: `fetch` wartet von sich aus unbegrenzt (CLAUDE.md).
const app: AppAufruf = (pfad, init) =>
	fetch(`${basis}${pfad}`, {
		...init,
		headers: { ...kopf, ...(init?.headers ?? {}) },
		redirect: "manual",
		signal: AbortSignal.timeout(30_000),
	});

const ebay = erstelleEbayClient(zugangAus(process.env));
const beginn = Date.now();
const e = await marktLauf(app, ebay);
const sekunden = Math.round((Date.now() - beginn) / 1000);

console.log(
	`Gebrauchtpreise: ${e.status}, ${e.geprueft} geprüft in ${e.portionen} Portionen (${sekunden} s), ` +
		`${e.mitPreis} mit Preis, ${e.discBelegt} Disc belegt, ${e.ohneAngebot} ohne Angebot, ` +
		`${e.uebersprungen} übersprungen, ${e.nochOffen} offen.`,
);
// Die Meldung ist ein fester Text der Anwendung (MARKT_MELDUNG), kein Fremdtext.
if (e.meldung) console.log(`::error::${e.meldung}`);
process.exit(e.status === "erfolg" ? 0 : 1);
