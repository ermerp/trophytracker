import { NavLink } from 'react-router-dom'

/**
 * Hauptnavigation nach Abschnitt 13: unten als Leiste (Handy), seitlich am
 * Desktop. Von den fünf Hauptansichten gibt es bisher die Sammlung; Lücken,
 * Kaufliste, To-Do und Scannen kommen mit ihren Stufen dazu. Zuordnung,
 * Sammlung prüfen und Trophäen sind keine Dauernavigation – sie hängen an
 * den Einstellungen.
 */
export function Navigation() {
  return (
    <nav className="nav" aria-label="Hauptnavigation">
      <NavLink to="/sammlung">
        <span aria-hidden="true">▦</span> Sammlung
      </NavLink>
      <NavLink to="/einstellungen">
        <span aria-hidden="true">⚙</span> Einstellungen
      </NavLink>
    </nav>
  )
}
