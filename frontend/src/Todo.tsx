import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from 'react-router-dom'
import { anfrage, type PlanEintrag } from './api'
import { Filterleiste, Meldungen, PlanKarte, Reiter, usePlanListe, type PlanListe } from './Absichten'

/**
 * To-Do (Use Case 5a, Stufe 12): kurz und in eigener Reihenfolge. Ziehen
 * mit Maus, Finger oder Tastatur (Griff fokussieren, Leertaste, Pfeile),
 * dazu Pfeilknöpfe als Rückfall. Jede Umsortierung schreibt sofort
 * (PUT /api/plans/reorder); schlägt sie fehl, lädt die Liste den
 * gespeicherten Stand zurück. „ins Backlog" hängt einen Eintrag um – und
 * setzt „pausiert", denn To-Do heißt „am Spielen" (Kopplung, 5.5).
 */
export function Todo() {
  const liste = usePlanListe('todo')
  const { daten, setDaten, setMeldung, laden, nurFavoriten, suche, aendern } = liste

  const sensoren = useSensors(
    // Erst nach ein paar Pixeln greift das Ziehen, sonst wären die Knöpfe der Kachel nicht mehr klickbar.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
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

  function verschiebe(von: number, nach: number) {
    if (!daten || nach < 0 || nach >= daten.eintraege.length) return
    void ordne(arrayMove(daten.eintraege, von, nach))
  }

  function amEnde(ev: DragEndEvent) {
    if (!daten || !ev.over || ev.active.id === ev.over.id) return
    const von = daten.eintraege.findIndex((e) => e.id === ev.active.id)
    const nach = daten.eintraege.findIndex((e) => e.id === ev.over!.id)
    verschiebe(von, nach)
  }

  return (
    <>
      <h1>To-Do</h1>
      <Reiter />
      <p className="zeile">Was du gerade spielst („am Spielen"), in deiner Reihenfolge. Ziehen am Griff oder mit den Pfeilen.</p>

      <Filterleiste liste={liste} sortierbar={false} />
      <Meldungen liste={liste} />

      {!daten ? (
        <p>wird geladen …</p>
      ) : daten.eintraege.length === 0 ? (
        <p>
          {nurFavoriten || suche ? 'Nichts passt zum Filter.' : 'Nichts auf To-Do.'}{' '}
          <Link to="/backlog">Backlog und Kandidaten</Link>
        </p>
      ) : (
        <DndContext sensors={sensoren} collisionDetection={closestCenter} onDragEnd={amEnde}>
          <SortableContext items={daten.eintraege.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <ol className="kacheln sortierbar">
              {daten.eintraege.map((e, i) => (
                <SortierbareKarte
                  key={e.id}
                  e={e}
                  liste={liste}
                  knoepfe={
                    <>
                      <button type="button" className="klein" aria-label="nach oben" title="nach oben" disabled={i === 0} onClick={() => verschiebe(i, i - 1)}>▲</button>
                      <button type="button" className="klein" aria-label="nach unten" title="nach unten" disabled={i === daten.eintraege.length - 1} onClick={() => verschiebe(i, i + 1)}>▼</button>
                      <button type="button" className="klein" onClick={() => aendern(e.id, { art: 'backlog' })}>ins Backlog</button>
                    </>
                  }
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </>
  )
}

function SortierbareKarte({ e, liste, knoepfe }: { e: PlanEintrag; liste: PlanListe; knoepfe: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: e.id })
  return (
    <PlanKarte
      e={e}
      liste={liste}
      liRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'zieht' : undefined}
      griff={
        <button type="button" ref={setActivatorNodeRef} className="griff" aria-label="Verschieben" title="Ziehen zum Verschieben" {...attributes} {...listeners}>
          ⋮⋮
        </button>
      }
      knoepfe={knoepfe}
    />
  )
}
