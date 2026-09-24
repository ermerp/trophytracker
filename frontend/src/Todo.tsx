import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from 'react-router-dom'
import { anfrage, type PlanEintrag } from './api'
import { Meldungen, PLAN_CHIPS, PlanKarte, Reiter, usePlanListe, type PlanListe } from './Absichten'
import { Chips } from './Chips'
import { Kopfzeile } from './Kopfzeile'
import { Zeichen } from './Symbole'

/**
 * To-Do (Use Case 5a, Stufe 12): kurz und in eigener Reihenfolge. „ins
 * Backlog" hängt einen Eintrag um – und setzt „pausiert", denn To-Do heißt
 * „am Spielen" (Kopplung, 5.5).
 *
 * **Verschoben wird seit Stufe 19 ohne Griff** (Rückmeldung des Nutzers vom
 * 22.09.2026: „einfach egal wo ich lange drücke komme ich in den verschiebe
 * Modus, auch die hoch runter pfeile weg"). Die ganze Karte ist der Anfasser:
 * Finger nach 200 ms Halten, Maus ab sechs Pixeln Weg – die Knöpfe bleiben
 * klickbar, weil sie `pointerdown` abfangen.
 *
 * Die Pfeilknöpfe sind damit weg, die **Tastatur** aber nicht: Die Karte ist
 * fokussierbar, der `KeyboardSensor` greift dort (Leertaste, dann Pfeile).
 * Ein Bedienweg darf nicht mit einem Gestaltungswunsch verschwinden.
 *
 * Die Liste ist immer eine Liste – ihre Reihenfolge ist der Inhalt, ein
 * Kachelraster würde sie verstecken. Deshalb hat sie keinen Umschalter.
 */

export const TODO_REITER = [
	['/todo', 'To-Do'],
	['/backlog', 'Backlog'],
] as const

export function Todo() {
	const liste = usePlanListe('todo')
	const { daten, setDaten, setMeldung, laden, nurFavoriten, suche, aendern } = liste

	const sensoren = useSensors(
		// Erst nach ein paar Pixeln greift das Ziehen, sonst waeren die Knoepfe
		// der Karte nicht mehr klickbar.
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		// 200 ms statt 150: Die ganze Karte ist jetzt der Anfasser, und ein
		// kurzer Tipp auf den Titel soll weiterhin der Link sein.
		useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	)

	/** Neue Ordnung lokal setzen und speichern; nur offene Einträge tragen eine Position. */
	async function ordne(neu: PlanEintrag[]) {
		setMeldung(null)
		const offene = neu.filter((e) => e.status === 'offen')
		setDaten((d) => d && { ...d, eintraege: neu.map((e) => ({ ...e, position: offene.indexOf(e) + 1 || e.position })) })
		try {
			await anfrage('/api/plans/reorder', { methode: 'PUT', koerper: { art: 'todo', orderedIds: offene.map((e) => e.id) } })
		} catch (f) {
			setMeldung(f instanceof Error ? f.message : 'Sortieren fehlgeschlagen.')
			await laden()
		}
	}

	function amEnde(ev: DragEndEvent) {
		if (!daten || !ev.over || ev.active.id === ev.over.id) return
		const von = daten.eintraege.findIndex((e) => e.id === ev.active.id)
		const nach = daten.eintraege.findIndex((e) => e.id === ev.over!.id)
		if (von < 0 || nach < 0) return
		void ordne(arrayMove(daten.eintraege, von, nach))
	}

	return (
		<>
			<Kopfzeile titel="To-Do" sucheParam="suche" />
			<Reiter eintraege={TODO_REITER} />
			<Chips gruppen={PLAN_CHIPS} />

			<div className="seite">
				<p className="ruhig klein">
					Was du gerade spielst („am Spielen"), in deiner Reihenfolge. Lange drücken und ziehen; mit der Tastatur:
					Karte anwählen, Leertaste, Pfeile.
				</p>

				<Meldungen liste={liste} />

				{!daten ? (
					<p className="ruhig">wird geladen …</p>
				) : daten.eintraege.length === 0 ? (
					<p className="ruhig">
						{nurFavoriten || suche ? 'Nichts passt zum Filter.' : 'Nichts auf To-Do.'}{' '}
						<Link to="/backlog">Backlog und Kandidaten</Link>
					</p>
				) : (
					<DndContext sensors={sensoren} collisionDetection={closestCenter} onDragEnd={amEnde}>
						<SortableContext items={daten.eintraege.map((e) => e.id)} strategy={verticalListSortingStrategy}>
							<ol className="zeilen sortierbar">
								{daten.eintraege.map((e) => (
									<SortierbareKarte
										key={e.id}
										e={e}
										liste={liste}
										knoepfe={
											<button
												type="button"
												className="ikone"
												aria-label="Ins Backlog"
												title="Ins Backlog"
												onPointerDown={(ev) => ev.stopPropagation()}
												onClick={() => aendern(e.id, { art: 'backlog' })}
											>
												<Zeichen name="umhaengen" groesse={19} />
											</button>
										}
									/>
								))}
							</ol>
						</SortableContext>
					</DndContext>
				)}
			</div>
		</>
	)
}

function SortierbareKarte({ e, liste, knoepfe }: { e: PlanEintrag; liste: PlanListe; knoepfe: React.ReactNode }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: e.id })
	return (
		<PlanKarte
			e={e}
			liste={liste}
			art="zeilen"
			liRef={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={isDragging ? 'zieht' : undefined}
			knoepfe={knoepfe}
			// Die ganze Karte ist der Anfasser - kein eigener Griff mehr.
			zieher={{ ...attributes, ...listeners }}
		/>
	)
}
