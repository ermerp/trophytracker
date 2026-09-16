import { NavLink, useLocation } from 'react-router-dom'

/**
 * Hauptnavigation nach Abschnitt 13: unten als Leiste (Handy), seitlich am
 * Desktop. Von den Hauptansichten gibt es bisher Sammlung, Wunschliste
 * (seit Stufe 10, Entscheidung des Nutzers) und To-Do (seit Stufe 12; das
 * Backlog ist ein Reiter daneben), Lücken (seit Stufe 14) und Kaufliste
 * (seit Stufe 15); Scannen kommt mit Stufe 16 dazu. Zuordnung, Sammlung
 * prüfen und Trophäen sind keine Dauernavigation – sie hängen an den
 * Einstellungen.
 */
export function Navigation() {
  const location = useLocation()
  return (
    <nav className="nav" aria-label="Hauptnavigation">
      <NavLink to="/sammlung">
        <span aria-hidden="true">▦</span> Sammlung
      </NavLink>
      <NavLink to="/wunschliste">
        <span aria-hidden="true">☆</span> Wunschliste
      </NavLink>
      <NavLink to="/todo" className={({ isActive }) => (isActive || location.pathname === '/backlog' ? 'active' : '')}>
        <span aria-hidden="true">✓</span> To-Do
      </NavLink>
      <NavLink to="/luecken">
        <span aria-hidden="true">◫</span> Lücken
      </NavLink>
      <NavLink to="/kaufliste">
        <span aria-hidden="true">¤</span> Kaufliste
      </NavLink>
      <NavLink to="/einstellungen">
        <span aria-hidden="true">⚙</span> Einstellungen
      </NavLink>
    </nav>
  )
}
