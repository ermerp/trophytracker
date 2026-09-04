/**
 * Huelle fuer Werte, die niemals in einer Antwort oder im Log auftauchen
 * duerfen - NPSSO, Refresh-Token, Access Token.
 *
 * Die Absicherung liegt im Typ, nicht in der Sorgfalt beim Schreiben:
 * toString() und toJSON() liefern beide "[redaktiert]". Damit koennen weder
 * ein Template-Literal noch JSON.stringify noch console.log den Klartext
 * ausgeben. Er ist ausschliesslich ueber offenlegen() erreichbar, und dieser
 * Aufruf faellt beim Lesen auf.
 */
export const REDAKTIERT = "[redaktiert]";

export class Geheimnis {
	readonly #wert: string;

	constructor(wert: string) {
		if (wert === "") throw new Error("Ein Geheimnis darf nicht leer sein.");
		this.#wert = wert;
	}

	/** Der Klartext. Nur an der Stelle aufrufen, die ihn wirklich braucht. */
	offenlegen(): string {
		return this.#wert;
	}

	get laenge(): number {
		return this.#wert.length;
	}

	toString(): string {
		return REDAKTIERT;
	}

	toJSON(): string {
		return REDAKTIERT;
	}

	/** Greift bei String-Umwandlung in numerischem oder Default-Kontext. */
	[Symbol.toPrimitive](): string {
		return REDAKTIERT;
	}

	/** console.log(obj) in Node/workerd nutzt diesen Hook. */
	get [Symbol.toStringTag](): string {
		return "Geheimnis";
	}
}
