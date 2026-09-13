import { Hono } from "hono";
import {
	DIGITALE_QUELLEN,
	ZUSTAENDE,
	type DigitaleQuelle,
	type PhysicalCopyFelder,
	type PhysicalCopyZeile,
	type Zustand,
} from "../db/ownership";
import type { AppEnv } from "../types";

/**
 * Besitz erfassen: physische Exemplare und digitale Berechtigungen
 * (Abschnitt 12, Use Case 1).
 *
 * Die Eingabefelder sind deutsch, die Spalten englisch. Uebersetzt wird
 * genau hier, nirgends sonst.
 */

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const EAN = /^\d{8,14}$/;

type Koerper = Record<string, unknown>;

async function liesJson(c: { req: { json(): Promise<unknown> } }): Promise<Koerper | null> {
	try {
		const k = await c.req.json();
		return k !== null && typeof k === "object" ? (k as Koerper) : null;
	} catch {
		return null;
	}
}

/**
 * Prueft die Felder eines Exemplars. Nur Felder, die im Koerper vorkommen,
 * landen im Ergebnis - so kann PATCH gezielt einzelne Felder aendern und
 * ein Feld mit null leeren.
 */
function pruefeExemplar(k: Koerper): { felder: PhysicalCopyFelder } | { fehler: string } {
	const felder: PhysicalCopyFelder = {};

	if ("ean" in k) {
		if (k.ean === null || k.ean === "") felder.ean = null;
		else if (typeof k.ean === "string" && EAN.test(k.ean.trim())) felder.ean = k.ean.trim();
		else return { fehler: "EAN muss aus 8 bis 14 Ziffern bestehen." };
	}
	if ("zustand" in k) {
		if (k.zustand === null || k.zustand === "") felder.condition = null;
		else if (typeof k.zustand === "string" && (ZUSTAENDE as readonly string[]).includes(k.zustand)) {
			felder.condition = k.zustand as Zustand;
		} else return { fehler: `Zustand muss einer von ${ZUSTAENDE.join(", ")} sein.` };
	}
	if ("anleitung" in k) {
		if (typeof k.anleitung !== "boolean") return { fehler: "Feld 'anleitung' muss true oder false sein." };
		felder.hasManual = k.anleitung;
	}
	if ("kaufdatum" in k) {
		if (k.kaufdatum === null || k.kaufdatum === "") felder.purchaseDate = null;
		else if (typeof k.kaufdatum === "string" && ISO_DATUM.test(k.kaufdatum)) felder.purchaseDate = k.kaufdatum;
		else return { fehler: "Kaufdatum muss die Form JJJJ-MM-TT haben." };
	}
	if ("kaufpreisCents" in k) {
		if (k.kaufpreisCents === null || k.kaufpreisCents === "") felder.purchasePriceCents = null;
		else if (typeof k.kaufpreisCents === "number" && Number.isInteger(k.kaufpreisCents) && k.kaufpreisCents >= 0) {
			felder.purchasePriceCents = k.kaufpreisCents;
		} else return { fehler: "Kaufpreis muss eine ganze Zahl in Cent sein, nicht negativ." };
	}
	if ("notiz" in k) {
		if (k.notiz === null || k.notiz === "") felder.notes = null;
		else if (typeof k.notiz === "string") felder.notes = k.notiz.trim();
		else return { fehler: "Notiz muss Text sein." };
	}

	return { felder };
}

function exemplarAntwort(z: PhysicalCopyZeile) {
	return {
		id: z.id,
		releaseId: z.release_id,
		ean: z.ean,
		zustand: z.condition,
		anleitung: z.has_manual === 1,
		kaufdatum: z.purchase_date,
		kaufpreisCents: z.purchase_price_cents,
		notiz: z.notes,
		angelegtAm: z.created_at,
	};
}

function idAus(roh: string): number | null {
	const id = Number(roh);
	return Number.isInteger(id) && id > 0 ? id : null;
}

export const physicalCopyRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const limit = Math.min(500, Math.max(1, Number(c.req.query("limit")) || 100));
		const offset = Math.max(0, Number(c.req.query("offset")) || 0);
		const { zeilen, gesamt } = await c.var.repos.ownership.listPhysicalCopies(limit, offset);
		return c.json({
			gesamt,
			limit,
			offset,
			exemplare: zeilen.map((z) => ({ ...exemplarAntwort(z), titel: z.title, plattform: z.platform })),
		});
	})

	.post("/", async (c) => {
		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);

		const releaseId = Number(k.releaseId);
		if (!Number.isInteger(releaseId) || releaseId <= 0) {
			return c.json({ fehler: "Feld 'releaseId' fehlt oder ist ungültig." }, 400);
		}
		const geprueft = pruefeExemplar(k);
		if ("fehler" in geprueft) return c.json({ fehler: geprueft.fehler }, 400);

		if (!(await c.var.repos.ownership.releaseExistiert(releaseId))) {
			return c.json({ fehler: "Release nicht gefunden." }, 404);
		}

		const ergebnis = await c.var.repos.ownership.addPhysicalCopy(releaseId, geprueft.felder);
		return c.json({ id: ergebnis.id, releaseId, physischStatusGesetzt: ergebnis.physischStatusGesetzt }, 201);
	})

	.patch("/:id", async (c) => {
		const id = idAus(c.req.param("id"));
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);

		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);
		const geprueft = pruefeExemplar(k);
		if ("fehler" in geprueft) return c.json({ fehler: geprueft.fehler }, 400);

		if (!(await c.var.repos.ownership.updatePhysicalCopy(id, geprueft.felder))) {
			return c.json({ fehler: "Exemplar nicht gefunden." }, 404);
		}
		return c.json({ id, geaendert: true });
	})

	.delete("/:id", async (c) => {
		const id = idAus(c.req.param("id"));
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!(await c.var.repos.ownership.deletePhysicalCopy(id))) {
			return c.json({ fehler: "Exemplar nicht gefunden." }, 404);
		}
		return c.json({ id, geloescht: true });
	});

export const digitalEntitlementRoutes = new Hono<AppEnv>()
	.post("/", async (c) => {
		const k = await liesJson(c);
		if (!k) return c.json({ fehler: "Ungültiges JSON." }, 400);

		const releaseId = Number(k.releaseId);
		if (!Number.isInteger(releaseId) || releaseId <= 0) {
			return c.json({ fehler: "Feld 'releaseId' fehlt oder ist ungültig." }, 400);
		}
		if (typeof k.quelle !== "string" || !(DIGITALE_QUELLEN as readonly string[]).includes(k.quelle)) {
			return c.json({ fehler: `Quelle muss eine von ${DIGITALE_QUELLEN.join(", ")} sein.` }, 400);
		}
		let erworbenAm: string | null = null;
		if (k.erworbenAm !== undefined && k.erworbenAm !== null && k.erworbenAm !== "") {
			if (typeof k.erworbenAm !== "string" || !ISO_DATUM.test(k.erworbenAm)) {
				return c.json({ fehler: "Feld 'erworbenAm' muss die Form JJJJ-MM-TT haben." }, 400);
			}
			erworbenAm = k.erworbenAm;
		}

		if (!(await c.var.repos.ownership.releaseExistiert(releaseId))) {
			return c.json({ fehler: "Release nicht gefunden." }, 404);
		}

		const ergebnis = await c.var.repos.ownership.addDigitalEntitlement(
			releaseId,
			k.quelle as DigitaleQuelle,
			erworbenAm,
		);
		if (!ergebnis) {
			return c.json({ fehler: "Diese Quelle ist an dem Release bereits eingetragen." }, 409);
		}
		return c.json({ id: ergebnis.id, releaseId, quelle: k.quelle, erworbenAm }, 201);
	})

	.delete("/:id", async (c) => {
		const id = idAus(c.req.param("id"));
		if (id === null) return c.json({ fehler: "Ungültige Id." }, 400);
		if (!(await c.var.repos.ownership.deleteDigitalEntitlement(id))) {
			return c.json({ fehler: "Berechtigung nicht gefunden." }, 404);
		}
		return c.json({ id, geloescht: true });
	});

export { exemplarAntwort };
