import { Geheimnis } from "./secret";

/**
 * AES-GCM ueber WebCrypto. Der Schluessel liegt als Cloudflare Secret
 * NPSSO_KEY (Base64, 32 Byte); D1 haelt nur Chiffretext und IV.
 *
 * Zweck ist nicht Schutz gegen jemanden mit Kontozugriff - der koennte das
 * Secret ohnehin lesen -, sondern dass ein Datenbank-Dump im Backup-Repo
 * keinen verwertbaren PSN-Zugang enthaelt.
 */

export type Verschluesselt = { chiffre: string; iv: string };

export class CryptoError extends Error {}

function base64ZuBytes(b64: string): Uint8Array {
	const roh = atob(b64);
	const bytes = new Uint8Array(roh.length);
	for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
	return bytes;
}

function bytesZuBase64(bytes: Uint8Array): string {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
}

async function schluessel(base64Key: string): Promise<CryptoKey> {
	let roh: Uint8Array;
	try {
		roh = base64ZuBytes(base64Key);
	} catch {
		throw new CryptoError("NPSSO_KEY ist kein gültiges Base64.");
	}
	if (roh.length !== 32) {
		throw new CryptoError(`NPSSO_KEY muss 32 Byte lang sein, war ${roh.length}.`);
	}
	return crypto.subtle.importKey("raw", roh, { name: "AES-GCM" }, false, [
		"encrypt",
		"decrypt",
	]);
}

export async function verschluesseln(
	klartext: Geheimnis,
	base64Key: string,
): Promise<Verschluesselt> {
	const key = await schluessel(base64Key);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const daten = new TextEncoder().encode(klartext.offenlegen());
	const chiffre = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, daten);

	return { chiffre: bytesZuBase64(new Uint8Array(chiffre)), iv: bytesZuBase64(iv) };
}

export async function entschluesseln(
	daten: Verschluesselt,
	base64Key: string,
): Promise<Geheimnis> {
	const key = await schluessel(base64Key);
	let klar: ArrayBuffer;
	try {
		klar = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: base64ZuBytes(daten.iv) },
			key,
			base64ZuBytes(daten.chiffre),
		);
	} catch {
		// Bewusst ohne Details: ein falscher Schluessel und ein manipulierter
		// Chiffretext sollen nicht unterscheidbar sein.
		throw new CryptoError("Entschlüsselung fehlgeschlagen.");
	}
	return new Geheimnis(new TextDecoder().decode(klar));
}
