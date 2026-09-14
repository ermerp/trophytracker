import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { Abweichungen } from './Abweichungen'
import { Einstellungen } from './Einstellungen'
import { Igdb } from './Igdb'
import { IgdbZuordnung } from './IgdbZuordnung'
import { Navigation } from './Navigation'
import { Pruefliste } from './Pruefliste'
import { Sammlung } from './Sammlung'
import { SammlungPruefen } from './SammlungPruefen'
import { Sicherung } from './Sicherung'
import { Spieldetail } from './Spieldetail'
import { Trophaeen } from './Trophaeen'
import { Zuordnung } from './Zuordnung'
import './App.css'

/**
 * Ansichten nach Abschnitt 13. Der SPA-Fallback im Worker
 * (`not_found_handling: single-page-application`) liefert für jeden
 * unbekannten Pfad die index.html, sodass Direktaufrufe wie /spiel/42
 * funktionieren.
 */

/** Werkzeuge, die keine Dauernavigation sind (Abschnitt 13). */
function Werkzeuge() {
  return (
    <section>
      <h2>Werkzeuge</h2>
      <ul>
        <li><Link to="/pruefliste">Prüfliste</Link> – Trophäenbestand einmal durchgehen, danach nur Änderungen</li>
        <li><Link to="/zuordnung">Zuordnung</Link> – Trophäenlisten zu Spielen und Releases machen</li>
        <li><Link to="/igdb">IGDB-Zuordnung</Link> – Spiele ohne eindeutigen IGDB-Treffer nachziehen</li>
        <li><Link to="/pruefen">Sammlung prüfen</Link> – alle Zuordnungen als Tabelle</li>
        <li><Link to="/trophaeen">Trophäen</Link> – die Rohliste von Sony</li>
      </ul>
    </section>
  )
}

function App() {
  return (
    <div className="app">
      <Navigation />
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/sammlung" replace />} />
          <Route path="/sammlung" element={<Sammlung />} />
          <Route path="/spiel/:id" element={<Spieldetail />} />
          <Route path="/pruefliste" element={<Pruefliste />} />
          <Route
            path="/einstellungen"
            element={
              <>
                <h1>Einstellungen</h1>
                <Einstellungen />
                <Igdb />
                <Sicherung />
                <Abweichungen />
                <Werkzeuge />
              </>
            }
          />
          <Route path="/zuordnung" element={<Zuordnung />} />
          <Route path="/igdb" element={<IgdbZuordnung />} />
          <Route path="/pruefen" element={<SammlungPruefen />} />
          <Route path="/trophaeen" element={<Trophaeen />} />
          <Route path="*" element={<Navigate to="/sammlung" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
