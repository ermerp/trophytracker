/**
 * Einstieg der Store-Action (Stufe 20j, .github/workflows/store.yml).
 *
 * Nur Verdrahtung: Zugang, Adresse, Ausgabe. Der Lauf selbst steht in
 * src/sync/store-lauf.ts und ist dort gegen die echten Routen getestet.
 *
 * Das Log der Action ist OEFFENTLICH (das Repository ist es): Ausgegeben
 * werden nur Zahlen, nie Titel, Ids, Preise oder Fremdtext. Der Store braucht
 * keine Zugangsdaten - das einzige Secret ist das Service Token.
 */
import { erstelleStoreClient } from "../src/psn/store";
import type { AppAufruf } from "../src/sync/markt-lauf";
import { storeLauf } from "../src/sync/store-lauf";

const basis = process.env.APP_URL ?? "";
const kopf = {
	"CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID ?? "",
	"CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET ?? "",
};
if (!basis || !kopf["CF-Access-Client-Id"] || !kopf["CF-Access-Client-Secret"]) {
	console.log("::error::APP_URL oder das Service Token fehlt.");
	process.exit(1);
}

// Wie in der Markt-Action: Access antwortet auf ein abgelaufenes Token mit
// 302, `redirect: "manual"` macht daraus einen Status; jede Anfrage traegt
// eine Zeitgrenze. Der Store-Client hat seine eigene (10 s je Seite).
const app: AppAufruf = (pfad, init) =>
	fetch(`${basis}${pfad}`, {
		...init,
		headers: { ...kopf, ...(init?.headers ?? {}) },
		redirect: "manual",
		signal: AbortSignal.timeout(30_000),
	});

const beginn = Date.now();
const e = await storeLauf(app, erstelleStoreClient());
const sekunden = Math.round((Date.now() - beginn) / 1000);

console.log(
	`Store-Preise: ${e.status}, ${e.geprueft} geprüft in ${e.portionen} Portionen (${sekunden} s, ${e.anfragen} Anfragen), ` +
		`${e.mitPreis} mit Preis, ${e.imAngebot} im Angebot, ${e.imPlusKatalog} im Plus-Katalog, ${e.ohneTreffer} ohne Preis, ` +
		`${e.zugeordnet} neu zugeordnet, ${e.uebersprungen} übersprungen, ${e.nochOffen} offen.`,
);
// Die Meldung ist ein fester Text der Anwendung (STORE_MELDUNG), kein Fremdtext.
if (e.meldung) console.log(`::error::${e.meldung}`);
process.exit(e.status === "erfolg" ? 0 : 1);
