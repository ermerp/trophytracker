import { Kopfzeile } from './Kopfzeile'
import { Hinweise } from './Hinweise'

/**
 * Die Startseite (Stufe 19).
 *
 * Abschnitt 13 sah den Hinweisblock von Anfang an als Platzhalter des
 * Dashboards und hielt fest: „Beim Dashboard-Bau wandert die Komponente
 * dorthin." Stufe 19 macht den halben Schritt – sie gibt ihm einen eigenen
 * Ort statt eines Platzes oben in der Sammlung, damit die Sammlung mit ihrem
 * Inhalt beginnt und die offenen Posten dort stehen, wo die App startet.
 *
 * Aus dieser Seite wird in Stufe 19a das Dashboard: Kennzahlen je Plattform,
 * Platin-Zähler, Backlog-Länge, letzter Sync. Bis dahin steht hier nur, was
 * offen ist – und wenn nichts offen ist, sagt sie genau das.
 */
export function Start() {
	return (
		<>
			<Kopfzeile titel="Trophytracker" />
			<div className="seite">
				<Hinweise alsSeite />
			</div>
		</>
	)
}
