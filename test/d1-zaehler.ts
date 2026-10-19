/**
 * Eine D1, die ihre Aufrufe zaehlt (Stufe 18j).
 *
 * Gezaehlt wird, was CPU kostet: jede einzeln ausgefuehrte Anweisung
 * (`first`, `run`, `all`, `raw`) und jeder Batch als EIN Aufruf - gemessen in
 * 18h kostet ein D1-Aufruf rund 0,7 ms, eine Anweisung im Batch ein
 * Zwanzigstel davon. Die Anweisungen eines Batches werden vor der Uebergabe
 * an die echte D1 wieder ausgepackt.
 *
 * Dazu die Anweisungen (Stufe 18k-b): D1 dokumentiert 50 Abfragen je Aufruf
 * des Workers, und jede Anweisung eines Batches zaehlt einzeln mit.
 *
 * Dazu die gelesenen und geschriebenen Zeilen aus `meta` - fuer die
 * Lesekosten-Messung, die den GANZEN Aufruf zaehlt statt nachgebauter
 * Einzelabfragen ("gemessen wird die Route, nicht die Abfrage").
 */
export function zaehlendeDb(db: D1Database): {
	db: D1Database;
	aufrufe: () => number;
	anweisungen: () => number;
	gelesen: () => number;
	geschrieben: () => number;
} {
	let aufrufe = 0;
	let einzelne = 0;
	let gelesen = 0;
	let geschrieben = 0;
	const buchen = (e: D1Result) => {
		gelesen += e.meta?.rows_read ?? 0;
		geschrieben += e.meta?.rows_written ?? 0;
		return e;
	};
	const echt = new WeakMap<object, D1PreparedStatement>();
	const huelle = (st: D1PreparedStatement): D1PreparedStatement => {
		const p = new Proxy(st, {
			get(ziel, name) {
				if (name === "bind") return (...werte: unknown[]) => huelle(ziel.bind(...werte));
				if (name === "run" || name === "all") {
					return async () => {
						aufrufe++;
						einzelne++;
						return buchen(await ziel.all());
					};
				}
				// `first` liefert kein `meta` - deshalb ueber `all`, mit demselben Ergebnis.
				if (name === "first") {
					return async (spalte?: string) => {
						aufrufe++;
						einzelne++;
						const zeile = (buchen(await ziel.all()).results ?? [])[0] as Record<string, unknown> | undefined;
						if (zeile === undefined) return null;
						return spalte === undefined ? zeile : (zeile[spalte] ?? null);
					};
				}
				if (name === "raw") {
					return (...a: unknown[]) => {
						aufrufe++;
						einzelne++;
						return (ziel.raw as (...x: unknown[]) => unknown).apply(ziel, a);
					};
				}
				const wert = Reflect.get(ziel, name, ziel);
				return typeof wert === "function" ? wert.bind(ziel) : wert;
			},
		});
		echt.set(p, st);
		return p;
	};
	const zaehlend = new Proxy(db, {
		get(ziel, name) {
			if (name === "prepare") return (sql: string) => huelle(ziel.prepare(sql));
			if (name === "batch") {
				return async (anweisungen: D1PreparedStatement[]) => {
					aufrufe++;
					einzelne += anweisungen.length;
					const ergebnisse = await ziel.batch(anweisungen.map((a) => echt.get(a) ?? a));
					ergebnisse.forEach(buchen);
					return ergebnisse;
				};
			}
			if (name === "exec") {
				return (sql: string) => {
					aufrufe++;
					return ziel.exec(sql);
				};
			}
			const wert = Reflect.get(ziel, name, ziel);
			return typeof wert === "function" ? wert.bind(ziel) : wert;
		},
	});
	return { db: zaehlend, aufrufe: () => aufrufe, anweisungen: () => einzelne, gelesen: () => gelesen, geschrieben: () => geschrieben };
}
